"use strict";
// ============ 小人 Agent ============

// 命名：尽量不重复（池约 8000 组合，耗尽后允许重名）
const _SURNAMES = ["张", "王", "李", "陈", "杨", "赵", "周", "吴", "郑", "孙", "林", "何", "高", "苏", "叶", "宋", "罗", "程", "袁", "许"];
const _GIVEN = ["石", "禾", "安", "松", "竹", "梅", "青", "远", "川", "云", "枫", "桥", "岚", "星", "野", "宁", "秋", "白", "舟", "棠"];
const _usedNames = new Set();
function pickAgentName() {
  for (let i = 0; i < 40; i++) {
    const n = _SURNAMES[randInt(0, _SURNAMES.length - 1)] +
              _GIVEN[randInt(0, _GIVEN.length - 1)] +
              (rand() < 0.4 ? _GIVEN[randInt(0, _GIVEN.length - 1)] : "");
    if (!_usedNames.has(n)) { _usedNames.add(n); return n; }
  }
  return "居民" + (agents.length + 1);
}

// 原住民部落小名（查重：原住民多，12 个单字必重，扩展双字组合 + 池尽编号）
const _NATIVE = ["岩", "木", "禾", "川", "石", "叶", "风", "泉", "星", "鹿", "火", "溪"];
const _usedNative = new Set();
function pickNativeName() {
  for (let i = 0; i < 60; i++) {
    const n = "阿" + _NATIVE[randInt(0, _NATIVE.length - 1)] +
              (rand() < 0.5 ? _NATIVE[randInt(0, _NATIVE.length - 1)] : "");
    if (!_usedNative.has(n)) { _usedNative.add(n); return n; }
  }
  let k = 1;
  while (_usedNative.has("阿石" + k)) k++;
  _usedNative.add("阿石" + k);
  return "阿石" + k;
}

let _agentIdSeq = 1;

// 职业表与社会需求比例：探险家看探索欲、工匠看勤劳，其余随机
const JOBS = {
  farmer:      { name: "农夫",   task: "FARM" },
  lumberjack:  { name: "伐木工", task: "DIG_WOOD" },
  miner:       { name: "采石工", task: "DIG_STONE" },
  hunter:      { name: "猎人",   task: "HUNT" },
  fisher:      { name: "渔民",   task: "FISH" },
  builder:     { name: "工匠",   task: "BUILD" },
  explorer:    { name: "探险家", task: null },
};
const _JOB_POOL = ["farmer", "farmer", "lumberjack", "miner", "hunter", "fisher", "builder"];

// 喜好（私人生活倾向，驱动空闲时的自发行为）：
// explore 向往远方 / homebody 恋家 / animal 喜爱牲畜（陪伴加成牧场） / fishing 垂钓 / none 随遇而安
const _HOBBY_ROLL = () => {
  const r = rand();
  return r < 0.22 ? "explore" : r < 0.44 ? "homebody" : r < 0.64 ? "animal" : r < 0.84 ? "fishing" : "none";
};

class Agent {
  constructor(x, y, native) {
    this.x = x + 0.5; this.y = y + 0.5;   // 浮点 tile 坐标，格中心
    this.id = _agentIdSeq++;               // 稳定唯一 id（名册引用，不受数组增删影响）
    this.dead = false;
    this.native = !!native;                // 原住民（被发现岛屿上的部落居民）
    this.name = this.native ? pickNativeName() : pickAgentName();

    // 个体属性（0~1，人各不同）
    this.adventure = this.native ? randRange(0.5, 1) : randRange(0.05, 1); // 探索欲：高的常远行，低的恋家
    this.diligence = randRange(0.25, 1);   // 勤劳：影响干活效率
    this.age = randRange(16, 45);          // 岁数：1 游戏年（12 昼夜）长 1 岁
    // 职业：探险家看探索欲，工匠看勤劳，其余按社会需求比例随机
    this.job = this.adventure > 0.75 ? "explorer"
             : this.diligence > 0.8 ? "builder"
             : _JOB_POOL[randInt(0, _JOB_POOL.length - 1)];
    // 喜好：与探索欲自洽——爱探索的人探索欲天然高，宅家的人天然低
    this.hobby = this.adventure > 0.7 ? "explore"
               : this.adventure < 0.22 ? "homebody"
               : _HOBBY_ROLL();
    this.hunger = randRange(60, 100);      // 100 = 吃饱
    this.energy = randRange(55, 100);
    this.home = null;                      // {x,y} 房屋
    this.task = null;
    this.path = null;
    this.pi = 0;
    this.state = "idle";                   // idle/walk/eat/sleep/work
    this.thinkCd = randRange(0, 0.5);      // 决策冷却，防抖
    this.speed = SIM.AGENT_SPEED * randRange(0.85, 1.2);
    this.phase = rand() * 10;              // 动画相位
    this.starving = false;
  }

  update(dt) {
    this.phase += dt;
    this.thinkCd -= dt;
    // 年龄：1 游戏年（12 昼夜）长 1 岁，寿命封顶
    this.age = Math.min(SPECIES_AGE.human.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));

    // 航海中：一切需求冻结（船上有补给），坐标由船携带
    if (this.state === "voyage") return;

    // 被动点亮：所有人类单位走到已点亮区边缘时，顺手点亮眼前的虚空（探索不只属于探险家）
    this.litCd = (this.litCd || 0) - dt;
    if (this.litCd <= 0) {
      this.litCd = 2.5;
      const px = Math.round(this.x), py = Math.round(this.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(px + dx, py + dy) === T.VOID) {
          revealArea(px + dx * 2, py + dy * 2, 6);
          break;
        }
      }
    }

    // ---- 登岛命名：第一个踏上未知岛屿的人为它取名，并就地升格为定居点 ----
    this.islandCheckCd = (this.islandCheckCd || 0) - dt;
    if (this.islandCheckCd <= 0) {
      this.islandCheckCd = 1;
      const tx = Math.round(this.x), ty = Math.round(this.y);
      const standing = tileAt(tx, ty);
      if (standing !== T.VOID && standing !== T.DEEP && standing !== T.WATER) {
        for (const o of world.islands) {
          if (o.name) continue;   // 已有名字的岛跳过
          if (Math.hypot(o.x - tx, o.y - ty) <= o.r + 1) {
            o.name = pickName(false);
            o.claimed = true;
            logMsg(`${this.name} 第一个登上未知岛屿，将它命名为「${o.name}」。`);
            // 命名即定居化：面积足够的岛立即立城（粮仓+建房+开荒），纳入版图
            if (o.r >= 5 && !world.settlements.some(s => Math.hypot(s.x - o.x, s.y - o.y) < o.r + 5)) {
              const sc = findSpot(o.x, o.y, 0, Math.max(4, o.r * 0.6), T.GRASS);
              if (sc) {
                setTile(sc.x, sc.y, T.HOUSE);
                world.houses.push({ x: sc.x, y: sc.y, granary: true });
                world.settlements.push({ x: sc.x, y: sc.y, name: o.name, level: 0, stock: { wood: 15, stone: 5, sand: 10 } });
                // 房与田围绕粮仓聚簇成村（确定性外扩 + 占位防撞；田链式锚定前一块，连片生长）
                const planned = new Set([sc.x + "," + sc.y]);
                for (let i = 0; i < 3; i++) {
                  const b = expandSpot(sc, 2, Math.max(8, o.r * 0.8), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 2, Math.max(6, o.r * 0.8), T.GRASS);
                  if (b) { tasksAdd({ type: "BUILD", x: b.x, y: b.y, need: 10 }); planned.add(b.x + "," + b.y); }
                }
                let lastFarm = null;
                for (let i = 0; i < 2; i++) {
                  const refF = lastFarm || sc;
                  const f = expandSpot(refF, 1, Math.max(8, o.r), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 3, Math.max(8, o.r), T.GRASS, [T.HOUSE, T.SITE]);
                  if (f) { tasksAdd({ type: "FARM", x: f.x, y: f.y, need: 9 }); planned.add(f.x + "," + f.y); lastFarm = f; }
                }
                logMsg(`「${o.name}」升格为定居点，先民渡海建设，粮仓落成。`);
                emit("expand");
                emit("island-settled", o);
              }
            }
            break;
          }
        }
      }
    }

    // ---- 死亡机制 ----
    // 老死：进入老年后每天判定，越老概率越高（60 岁日均 1%，此后每岁 +0.3%）
    if (this.age >= SPECIES_AGE.human.stages[2]) {
      this.oldAgeRoll = (this.oldAgeRoll || 0) + dt;
      if (this.oldAgeRoll >= SIM.DAY_LEN) {
        this.oldAgeRoll = 0;
        const over = this.age - SPECIES_AGE.human.stages[2];
        if (rand() < 0.01 + over * 0.003) { this.die("寿终正寝"); return; }
      }
    }
    // 生病：饥饿或精力归零持续 30 秒 → 病倒；再持续 60 秒无救治 → 死亡
    //      痊愈条件：饱食与精力都恢复到 40 以上
    const ailment = this.hunger <= 0 ? "hunger" : (this.energy <= 0 ? "energy" : null);
    if (ailment) {
      this.ailmentCd = (this.ailmentCd || 0) + dt;
      if (!this.sick && this.ailmentCd > 30) {
        this.sick = true;
        this.sickSource = ailment;
        this.sickTime = 0;
        logThrottled(`${this.name} 病倒了……`, 10);
      }
      if (this.sick) {
        this.sickTime += dt;
        if (this.sickTime > 60) {
          this.die(ailment === "hunger" ? "因长期饥饿病倒，不治身亡" : "积劳成疾，撒手人寰");
          return;
        }
      }
    } else {
      this.ailmentCd = 0;
      if (this.sick && this.hunger > 40 && this.energy > 40) {
        this.sick = false;
        logThrottled(`${this.name} 痊愈了，重新投入生活。`, 20);
      }
    }

    // 需求演化
    this.hunger -= SIM.HUNGER_DECAY * dt;
    if (this.state !== "sleep") this.energy -= SIM.ENERGY_DECAY * dt;

    if (this.hunger <= 0) {
      this.hunger = 0;
      if (!this.starving) { this.starving = true; logThrottled("有人饿着肚子在挨饿！", 8); }
    } else this.starving = false;

    // 长期挨饿 → 迁居到食物充裕的街区（饥饿的后果不是死亡，是搬家）
    if (this.hunger < 10) this.starveT = (this.starveT || 0) + dt;
    else this.starveT = 0;
    if (this.starveT > 40) { this.starveT = 0; this.migrate(); }

    // 决策：thinkCd 门控 + 高倍速下的全局轮询预算（SCHED.decideBudget 由 main.js 按倍速设定，
    // headless 测试默认 Infinity 不受影响）——未轮到时稍后重试，保证决策频率与倍速解耦
    if (this.thinkCd <= 0) {
      this.thinkCd = 0.4 + rand() * 0.3;
      if (SCHED.decideBudget > 0) { SCHED.decideBudget--; this.decide(); }
      else this.thinkCd = 0.05;
    }

    switch (this.state) {
      case "walk": this.stepAlong(dt); break;
      case "eat": {
        // 城市内共享粮食：吃所在城市（无半径最近聚落）的库存
        const sc = ownerSettle(this.x, this.y);
        const st = sc && ensureStock(sc);
        if (st && st.food > 0) {
          st.food -= 1; this.hunger = 100;
          this.state = "idle";
        } else { this.state = "idle"; } // 本城没粮，回去等规划器开荒/挖塘
        break;
      }
      case "sleep":
        this.energy += SIM.ENERGY_REGEN * dt;
        if (this.energy >= 100 || isDaytime()) this.state = "idle";
        break;
      case "work": this.doWork(dt); break;
    }
  }

  decide() {
    if (this.state === "sleep") return;
    // 有明确目的地的行走途中不做重新决策，防止反复重设路径
    if (this.state === "walk" && this.onArrive) return;
    const night = !isDaytime();

    // 1. 累了或天黑 → 回家睡（工作可以被打断，活着比干活重要）
    if (this.energy < 18 || (night && this.energy < 92)) {
      this.goSleep();
      return;
    }
    // 2. 饿了 → 就近取食（最近的农田或粮仓）
    if (this.hunger < 30) {
      const dest = this.nearestFoodSpot();
      if (dest && this.goTo(dest.x, dest.y)) {
        this.state = "walk";
        this.onArrive = () => { this.state = "eat"; };
        return;
      }
    }
    // 2.8 救助被困动物：施工改变地形后，搁浅的动物需要有人送回栖息地（紧急事项，优先于领任务；喜爱牲畜者更积极）
    if (!this.task && !this.voyaging) {
      const victim = creatures.find(c => !c.dead && !c.carriedBy && !c.rescuer &&
        (c.strandT || 0) > 3 && c.type !== "bird" && c.type !== "fish" &&
        (!c.noRescueT || world.time > c.noRescueT));   // 曾接近失败：冷却 60s 后可重试（地形可能已改变）
      if (victim && rand() < (this.hobby === "animal" ? 0.5 : 0.15)) {
        if (this.goTo(victim.x, victim.y)) {
          victim.rescuer = this;
          this.rescuing = victim;
          this.state = "walk";
          this.onArrive = () => this.pickupAnimal(victim);
          return;
        }
        victim.noRescueT = world.time + 60;   // 暂时无法接近：冷却重试，不永久放弃
      }
    }

    // 3. 领任务干活
    if (!this.task) {
      // 保险：手上有产出先就地登记入库（否则领新任务 → 旧产出被下次完工覆盖而蒸发）
      if (this.carrying) this.deposit();
      const t = tasksTake(this);
      if (t) {
        // 劳动保护：路程耗能（ENERGY_DECAY 0.9/s ÷ 船速 1.7 格/s 往返）预估不足 → 先睡觉，防止远途过劳死
        const d = Math.abs(t.x - this.x) + Math.abs(t.y - this.y);
        if (this.energy < Math.min(95, 18 + d * (this.job === "explorer" ? 0.4 : 0.75))) { this.goSleep(); return; }   // 探索者耐走（系数减半）
        this.task = t;
        t.workers.add(this);
        if (this.goTo(t.x, t.y)) {
          this.state = "walk";
          this.onArrive = () => { this.state = "work"; };
          return;
        }
        // 去不了工地 → 记一次"路不通"，累计 3 次该任务冻结（等周边改造后解锁）
        t.blockedCount = (t.blockedCount || 0) + 1;
        this.abandonTask();
        return;
      }
    } else if (this.state !== "work" && this.state !== "walk") {
      // 手上有任务但走丢了（被打断）→ 继续去工地
      if (this.goTo(this.task.x, this.task.y)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; return; }
    }
    // 3.5 搬运：身上有产出先送回仓库入库（名称即语义：仓库里的才算资源）
    if (this.carrying && this.state === "idle") {
      const s = nearestSettlement(Math.round(this.x), Math.round(this.y));
      if (s && this.goTo(s.x, s.y)) {
        this.state = "walk";
        this.onArrive = () => this.deposit();
        return;
      }
      this.deposit();   // 仓库不可达的兜底（就地登记入库）
    }

    // 3.8 航海：探险家/向往远方的居民从码头坐船出海开拓（消耗联合木材造船）
    if (!this.task && !this.voyaging && world.docks.length &&
        (this.job === "explorer" || this.hobby === "explore") && this.adventure > 0.4 &&
        rand() < 0.08) {
      const dock = world.docks.reduce((b, d) =>
        !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
      if (dock && this.goTo(dock.x, dock.y)) {
        this.state = "walk";
        this.onArrive = () => this.startVoyage(dock);
        return;
      }
    }

    // 3.95 专职探索者：前沿螺旋探索——找到最近「陆地与虚空接壤」的前沿格前往大面积点亮；
    //      局部扫不到前沿（或前沿被水隔开）时倾向出海（航海回退，点亮新海域后前沿自然出现）
    if (this.job === "explorer" && !this.task && !this.voyaging && this.energy > 30 && this.hunger > 40) {
      // 前沿扫描节流：每 2 sim 秒一次，期间复用缓存（deide 高频不重复扫屏）
      if (world.time - (this.frontScanT || -9) > 2) {
        this.frontScanT = world.time;
        this.frontCache = findFrontier(Math.round(this.x), Math.round(this.y), 80);   // 扫描 80 格：点亮推进后新前沿仍在视野
      }
      const front = this.frontCache;
      if (front) {
        if (this.goTo(front.x, front.y)) {
          this.state = "walk";
          this.onArrive = () => {
            this.state = "idle";
            // 到达前沿：大面积点亮 + 连击（向斑块边缘再点 2 处，一次驻留推进一大片）
            if (tileAt(front.x, front.y) !== T.VOID) {
              revealArea(front.x, front.y, 12 + Math.round(this.adventure * 6));
              for (let k = 0; k < 2; k++) {
                const ang = rand() * Math.PI * 2, d2 = 10 + rand() * 10;
                const px = Math.round(front.x + Math.cos(ang) * d2), py = Math.round(front.y + Math.sin(ang) * d2);
                if (tileAt(px, py) === T.VOID) revealArea(px, py, 10);
              }
            }
          };
          return;
        }
        this.frontCache = null;   // 前沿被水隔开不可达：清缓存，转出海判定
      }
      if (!front && world.docks.length && rand() < 0.5) {
        const dock = world.docks.reduce((b, d) =>
          !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
        if (dock && this.goTo(dock.x, dock.y)) {
          this.state = "walk";
          this.onArrive = () => this.startVoyage(dock);
          return;
        }
      }
    }

    // 4. 探索欲：高探索欲的居民会主动向未知远方进发（点亮虚空、发现新岛）
    if (!this.task) {
      if (this.exploring) {
        // 探索旅程进行中：精力/饥饿尚可且腿数未满 → 继续向外延伸（专职探索者不受腿数限制）
        if (this.energy > 30 && this.hunger > 40 &&
            this.exploreLegs < (this.job === "explorer" ? Infinity : 2 + this.adventure * 4)) {
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
        this.exploring = null;   // 探索结束
      } else if (this.state === "idle" && rand() < SIM.EXPLORE_CHANCE * this.adventure) {
        // 选方向：8 向采样，优先「虚空出现最近」的方向
        let best = null;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
          const dx = Math.cos(a), dy = Math.sin(a);
          let voidAt = Infinity;
          for (let k = 4; k <= 18; k++) {
            if (tileAt(Math.round(this.x + dx * k), Math.round(this.y + dy * k)) === T.VOID) { voidAt = k; break; }
          }
          if (!best || voidAt < best.voidAt) best = { dx, dy, voidAt };
        }
        if (best && best.voidAt < Infinity) {
          this.exploring = best;
          this.exploreLegs = 0;
          logThrottled("有居民怀着探索的欲望向未知的远方进发。", 20);
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
      }
    }

    // 5. 闲逛（恋家的人活动半径更小）
    if (this.state === "idle") {
      const homebody = this.adventure < 0.3;
      const tx = (this.x | 0) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      const ty = (this.y | 0) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      if (this.goTo(tx, ty)) this.state = "walk";
    }
  }

  // 入库：把搬运的产出登记进仓库（粮食与其他资源一致：进所属城市库存，城市内共享）
  deposit() {
    if (!this.carrying) return;
    const { res, amount } = this.carrying;
    this.carrying = null;
    const s = ownerSettle(Math.round(this.x), Math.round(this.y));
    if (s) ensureStock(s)[res] += amount;
  }

  // 死亡结算：释放任务与住房，通知世界（背包产出就地登记——拓荒者的遗物不白白散失）
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    if (this.task) { tasksRelease(this.task, this); this.task = null; }
    if (this.rescuing) { this.rescuing.rescuer = null; this.rescuing = null; }   // 释放被困动物的认领锁
    if (this.carrying) { this.deposit(); this.carrying = null; }   // 遗产：产出就地入库
    this.home = null;
    logMsg(`${this.name} ${reason}，享年 ${Math.floor(this.age)} 岁。`);
    emit("agent-death", this);
  }

  // 抱起搁浅动物：找最近的可达栖息地（水生物种由岸边送回水中），动身前往
  pickupAnimal(c) {
    if (c.dead || c.rescuer !== this) { this.rescuing = null; return; }
    const want = c.type === "whale" ? T.DEEP : (CREATURE_META[c.type].habitat === "water" ? T.WATER : T.GRASS);
    // 栖息格 + 小人可站立的岸边格配对（水格本身不可通行，从岸边把动物送下水）
    let spot = null, stand = null;
    for (let i = 0; i < 6 && !spot; i++) {
      const s = findSpot(Math.round(this.x), Math.round(this.y), 2, 30, want);
      if (!s) break;
      if (want === T.GRASS) { spot = s; stand = s; break; }   // 陆生直接走到放归点
      const sh = neighborsOf(s.x, s.y).find(p => walkable(p.x, p.y));
      if (sh) { spot = s; stand = sh; }
    }
    if (!spot) { c.rescuer = null; this.rescuing = null; return; }   // 附近找不到栖息地：放弃
    c.carriedBy = this;
    c.strandT = 0;
    if (!this.goTo(stand.x, stand.y)) {
      // 岸边不可达：就地放下（尽力了，动物回到原状态）
      c.carriedBy = null; c.rescuer = null; this.rescuing = null;
      return;
    }
    this.state = "walk";
    this.onArrive = () => this.releaseAnimal(c, spot);
  }

  // 到达放归点：动物回到栖息地，恢复自由
  releaseAnimal(c, spot) {
    c.carriedBy = null;
    if (!c.dead) {
      c.x = spot.x + 0.5; c.y = spot.y + 0.5;
      c.strandT = 0; c.target = null;
      logMsg(`${this.name} 把被困的${CREATURE_META[c.type].name}送回了安全的栖息地。`);
    }
    c.rescuer = null;
    this.rescuing = null;
    this.state = "idle";
  }

  // 驾小渔船出海捕鱼：造船耗少量联合木材，近海鱼点起网，满舱返航卸货（船逻辑见 shipTick 渔船分支）
  startFishingTrip(dock) {
    if (this.voyaging || this.state === "voyage") return false;   // 已在海上的人不能再出海
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停渔船。", 40); return; }
    // 木材安全余量：留 12 木给通路工程（桥/填海优先于渔船，防止工程被造船饿死）
    if (jointStock("wood") < SIM.BOAT_COST + 12) {
      logThrottled("木材不足，无力打造渔船。", 40);
      return;
    }
    jointConsume("wood", SIM.BOAT_COST);
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang: rand() * Math.PI * 2, sailor: this, state: "fishing",
      boat: true, hold: 0, fishCd: 0, target: pickFishingSpot(dock), revealCd: 0, dist: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`${this.name} 驾着小渔船出海捕鱼了。`);
    return true;
  }

  // 出海远航：造船消耗联合木材，装载粮草做补给，登船后航向未知海域（船逻辑见 world.shipTick）
  startVoyage(dock) {
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停船。", 40); return; }
    // 先探明码头周边水域（点亮生成真实地形，避免朝向落入"VOID 生成后变陆地"的陷阱）
    revealArea(water.x, water.y, 9);
    // 初始朝向：均匀扫描 24 个方位角找前方 3 格开阔的方向（确定性，地理允许即必命中）
    let ang = -1;
    for (let k = 0; k < 24; k++) {
      const tAng = (k / 24) * Math.PI * 2 + rand() * 0.15;
      let open = true;
      for (let d = 1.5; d <= 3; d += 0.5) {
        const t = tileAt(Math.round(water.x + Math.cos(tAng) * d), Math.round(water.y + Math.sin(tAng) * d));
        if (t !== T.VOID && t !== T.DEEP && t !== T.WATER) { open = false; break; }
      }
      if (open) { ang = tAng; break; }
    }
    if (ang < 0) { logThrottled("码头周边水路不畅，远航船无法出港。", 40); return; }
    // 同样留木材安全余量给通路工程
    if (jointStock("wood") < SIM.SHIP_COST + 12) {
      logThrottled("木材不足，无法造船远航。", 40);
      return;
    }
    jointConsume("wood", SIM.SHIP_COST);
    // 装载补给（粮食）：从码头所属城市库存装粮，有多少装多少，不满也出海
    const portCity = ownerSettle(dock.x, dock.y);
    const supply = portCity ? ensureStock(portCity).food : 0;
    const load = Math.min(SIM.SHIP_PROVISION_LOAD, Math.floor(supply));
    if (load < SIM.SHIP_PROVISION_LOAD) {
      logMsg(`${this.name} 的船粮草不满（${load}/${SIM.SHIP_PROVISION_LOAD}），仍执意扬帆出海。`);
    }
    if (portCity) ensureStock(portCity).food -= load;
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang, sailor: this, state: "sailing",
      prov: load, dist: 0, revealCd: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`航海家 ${this.name} 从码头扬帆出海，驶向未知的海域。`);
  }

  // 探索延伸一腿：从小人当前位置贴身向前点亮（斑块与脚下接壤），然后走向点亮区
  exploreLeg() {
    // 前方 2~5 格处为点亮中心，保证斑块边缘与当前位置接壤
    const dist = 3 + rand() * 3;
    const tx = Math.round(this.x + this.exploring.dx * dist);
    const ty = Math.round(this.y + this.exploring.dy * dist);
    revealArea(tx, ty, randRange(7.5, SIM.REVEAL_RADIUS));
    // 走向点亮区前沿（而非跳过它）
    const stepTo = Math.min(dist, 5);
    const gx = Math.round(this.x + this.exploring.dx * stepTo);
    const gy = Math.round(this.y + this.exploring.dy * stepTo);
    if (this.goTo(gx, gy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    // 前沿走不通（点亮后仍是海/山）→ 尝试侧向一次
    const sx = Math.round(this.x + (this.exploring.dx * 0.7 - this.exploring.dy * 0.7) * dist);
    const sy = Math.round(this.y + (this.exploring.dy * 0.7 + this.exploring.dx * 0.7) * dist);
    revealArea(sx, sy, randRange(4, SIM.REVEAL_RADIUS * 0.7));
    if (this.goTo(sx, sy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    logThrottled("探索者抵达了已知世界的边缘，止步于茫茫大海。", 25);
    this.exploring = null;
    this.state = "idle";
  }

  goSleep() {
    if (this.home && this.goTo(this.home.x, this.home.y)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "sleep"; };
    } else {
      this.state = "sleep"; // 没家，就地睡（心情差点，v1 不建模心情）
    }
  }

  // 最近的进食点：粮仓（含新区粮仓）或任一农田，避免全城挤一个仓
  nearestFoodSpot() {
    return nearestFoodTo(this.x, this.y).spot;
  }

  // 设置去 (tx,ty) 的路径；顺带处理"路被堵"→ 触发移山填海
  goTo(tx, ty) {
    const r = findPath(this.x | 0, this.y | 0, tx, ty);
    if (r && r.path) {
      this.path = r.path; this.pi = 0;
      return true;
    }
    // 不可达：如果挡路的是山/水/树，有概率立项改造（协作修路的来源之一）
    if (r && r.blocked && rand() < 0.6) {
      const b = r.blocked;
      const t = tileAt(b.x, b.y);
      const meta = TILE_META[t];
      if (meta.diggable) {
        // 山/树：单格立项开凿
        const exist = tasks.list.find(k => !k.done && k.x === b.x && k.y === b.y);
        if (!exist) {
          tasksAdd({ type: "DIG", x: b.x, y: b.y });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的${meta.name}挡住了去路，立项改造。`, 15);
        }
      } else if (t === T.WATER || t === T.DEEP) {
        // 跨水：链式桥——立项首格（blocked 必邻工人所站格，必可达），带朝目标方向与剩余步数；
        // 建成后 tasksFinish 沿方向续立下一格（remain 递减到 0 停，桥不无限穿海），
        // 工人跟进过桥，走到新桥头再续——细长桥线直通对岸
        const dup = tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y);
        // 同海峡只架一条桥：25 格内已有桥（在建成线）则不另起炉灶，等它建成即可通行
        if (!dup && !nearAny(b.x, b.y, [T.BRIDGE], 25) && tasksPending("BRIDGE", true).length < 40) {
          tasksAdd({ type: "BRIDGE", x: b.x, y: b.y,
            corridor: { dx: Math.sign(tx - b.x) || 0, dy: Math.sign(ty - b.y) || 0,
              remain: Math.abs(tx - b.x) + Math.abs(ty - b.y) } });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的水域挡住了去路，开始架桥。`, 15);
        }
      } else if (meta.fillable) {
        // 其余可填格（罕见）：兜底单格填平
        if (!tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y)) tasksAdd({ type: "FILL", x: b.x, y: b.y });
      }
    }
    return false;
  }

  // 迁居：放弃旧居，搬到最近进食点旁"还有名额"的房子
  migrate() {
    this.home = null;
    const spot = this.nearestFoodSpot();
    let best = null, bestD = Infinity;
    for (const h of world.houses) {
      const d = Math.abs(h.x - spot.x) + Math.abs(h.y - spot.y);
      const occ = agents.filter(a => a.home && a.home.x === h.x && a.home.y === h.y).length;
      if (d < bestD && occ < 3) { bestD = d; best = h; }
    }
    if (best) this.home = { x: best.x, y: best.y };
    logThrottled("饥民迁居：一批人搬往食物充裕的街区。", 60);
  }

  abandonTask() {
    if (!this.task) return;
    tasksRelease(this.task, this);
    this.task = null;
    this.state = "idle";
  }

  stepAlong(dt) {
    if (!this.path || this.pi >= this.path.length) {
      this.path = null;
      if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); }
      else this.state = "idle";
      return;
    }
    const target = this.path[this.pi];
    const gx = target.x + 0.5, gy = target.y + 0.5;
    const dx = gx - this.x, dy = gy - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this.x = gx; this.y = gy;
      this.pi++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  doWork(dt) {
    const t = this.task;
    if (!t) { this.state = "idle"; return; }
    if (t.done) { this.task = null; this.state = "idle"; return; }   // 任务已被其他工人完成（防御网）

    // 狩猎/捕获：猎物会跑，实时追踪；猎物消失则任务作废
    // 水生猎物（鱼群）不追踪——渔人守在立项给的岸边格，圈养水域由任务结算处理
    let gx = t.x, gy = t.y, chaseR = 2.2;
    if (t.creature) {
      if (t.creature.dead) { this.abandonTask(); return; }
      const waterPrey = CREATURE_META[t.creature.type].habitat === "water";
      if (!waterPrey) {
        gx = t.creature.x - 0.5; gy = t.creature.y - 0.5;
        chaseR = 5;
        const d = Math.hypot(gx + 0.5 - this.x, gy + 0.5 - this.y);
        if (d > 6) {
          if (this.goTo(Math.round(gx), Math.round(gy))) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
          else this.abandonTask();
          return;
        }
      }
    }
    const d = Math.abs((gx + 0.5) - this.x) + Math.abs((gy + 0.5) - this.y);
    if (d > chaseR) {
      if (this.goTo(gx, gy)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
      else this.abandonTask();
      return;
    }
    // 干活：建造类推进任务进度；改造类直接磨 tile 血量（勤劳的人手快）
    let effort = SIM.WORK_EFFORT * (0.7 + this.diligence * 0.6) * dt;
    // 猎犬助阵：主人狩猎且随行狗在 6 格内 → 效率 ×1.5
    if (t.type === "HUNT") {
      for (const c of creatures) {
        if (c.type === "dog" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 6) {
          effort *= 1.5;
          logThrottled("猎犬紧紧咬住猎物的退路，狩猎顺利多了。", 40);
          break;
        }
      }
    }
    // 工程资源检查：架桥耗木材、造陆耗沙土（联合库存，跨聚落汇总），不足则挂起等补给
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const res = Object.keys(cost)[0];
      if (jointStock(res) < cost[res]) {
        logThrottled(`${res === "wood" ? "木材" : "沙土"}不足，工程暂停等待补给。`, 30);
        return;
      }
      t.progress += effort;
      if (t.progress >= (t.need || 0)) {
        jointConsume(res, cost[res]);   // 完工结算资源
        this.task = null;
        tasksFinish(t);
        this.state = "idle";
      }
      this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
      return;
    }
    if (t.type === "DIG") {
      // 伐木/采石：磨 tile 血量，产出由工人搬运回仓
      const r = workTile(t, effort);
      if (r && r.done) {
        const y = tasksFinish(t, this, r.was);   // 完成任务，传入改造前 tile 判定产出
        this.task = null;
        this.state = "idle";
        if (y) {
          this.carrying = y;
          this.state = "idle";           // 下一轮决策将回仓入库
        }
      }
    } else {
      // 其余任务一律进度制（建造/农牧/畜牧/采集/狩猎等），防止无出口的假 workTile 卡死
      t.progress += effort;
      if (t.progress >= t.need) {
        const y = tasksFinish(t, this);   // 完成任务，取得搬运产出
        this.task = null;
        this.state = "idle";
        if (y) {
          this.carrying = y;
          this.state = "idle";           // 下一轮决策将回仓入库
        }
      }
    }
    this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
  }
}

// 螺旋向外找最近的前沿格：可站立陆地且 4 邻含 VOID（探索者的目标点；只扫局部，成本受 maxR 约束）
function findFrontier(cx, cy, maxR) {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只扫当前圈
        const x = cx + dx, y = cy + dy;
        if (!walkable(x, y)) continue;
        if (neighborsOf(x, y).some(p => tileAt(p.x, p.y) === T.VOID)) return { x, y };
      }
    }
  }
  return null;
}

// 从 (x,y) 的连通浅水格数（只走 WATER）是否 ≤cap——小池塘不需要架桥
function waterRegionSmall(x, y, cap) {
  const seen = new Set([x + "," + y]);
  const q = [[x, y]];
  let count = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const p of neighborsOf(cx, cy)) {
      const k = p.x + "," + p.y;
      if (seen.has(k)) continue;
      if (tileAt(p.x, p.y) !== T.WATER) continue;
      seen.add(k); count++;
      if (count > cap) return false;
      q.push([p.x, p.y]);
    }
  }
  return true;
}

function isDaytime() {
  return world.timeOfDay > SIM.NIGHT_END && world.timeOfDay < SIM.NIGHT_START;
}

// 节流日志：同类消息 minGap（sim 秒）内只发一次
const _logLast = {};
function logThrottled(text, minGap) {
  const now = world.time;
  const gap = minGap || 30;
  if (_logLast[text] !== undefined && now - _logLast[text] < gap) return;
  _logLast[text] = now;
  logMsg(text);
}
