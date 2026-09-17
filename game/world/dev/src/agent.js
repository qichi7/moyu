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

// 原住民部落小名
const _NATIVE = ["岩", "木", "禾", "川", "石", "叶", "风", "泉", "星", "鹿", "火", "溪"];
const pickNativeName = () => "阿" + _NATIVE[randInt(0, _NATIVE.length - 1)];

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

    // ---- 登岛命名：第一个踏上未知岛屿的人为它取名 ----
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
            logMsg(`${this.name} 第一个登上未知岛屿，将它命名为「${o.name}」。`);
            emit("island-named", o);
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

    if (this.thinkCd <= 0) { this.thinkCd = 0.4 + rand() * 0.3; this.decide(); }

    switch (this.state) {
      case "walk": this.stepAlong(dt); break;
      case "eat":
        if (world.food > 0) {
          world.food -= 1; this.hunger = 100;
          this.state = "idle";
        } else { this.state = "idle"; } // 没粮，回去等规划器开荒
        break;
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
    // 3. 领任务干活
    if (!this.task) {
      const t = tasksTake(this);
      if (t) {
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

    // 4. 探索欲：高探索欲的居民会主动向未知远方进发（点亮虚空、发现新岛）
    if (!this.task) {
      if (this.exploring) {
        // 探索旅程进行中：精力/饥饿尚可且腿数未满 → 继续向外延伸
        if (this.energy > 30 && this.hunger > 40 && this.exploreLegs < 2 + this.adventure * 4) {
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

  // 入库：把搬运的产出登记进仓库（粮为全局共享池，其余进最近聚落库存）
  deposit() {
    if (!this.carrying) return;
    const { res, amount } = this.carrying;
    this.carrying = null;
    if (res === "food") {
      world.food += amount;
    } else {
      const s = nearestSettlement(Math.round(this.x), Math.round(this.y));
      if (s) ensureStock(s)[res] += amount;
    }
  }

  // 死亡结算：释放任务与住房，通知世界（背包里的产出随之散失）
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    if (this.task) { tasksRelease(this.task, this); this.task = null; }
    this.home = null;
    logMsg(`${this.name} ${reason}，享年 ${Math.floor(this.age)} 岁。`);
    emit("agent-death", this);
  }

  // 探索延伸一腿：从小人当前位置贴身向前点亮（斑块与脚下接壤），然后走向点亮区
  exploreLeg() {
    // 前方 2~5 格处为点亮中心，保证斑块边缘与当前位置接壤
    const dist = 3 + rand() * 3;
    const tx = Math.round(this.x + this.exploring.dx * dist);
    const ty = Math.round(this.y + this.exploring.dy * dist);
    revealArea(tx, ty, randRange(5, SIM.REVEAL_RADIUS));
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
      if (meta.diggable || meta.fillable) {
        const exist = tasks.list.find(k => !k.done && k.x === b.x && k.y === b.y);
        if (!exist) {
          const type = meta.diggable ? "DIG" : (meta.bridgeable ? "BRIDGE" : "FILL");
          tasksAdd({ type, x: b.x, y: b.y });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的${meta.name}挡住了去路，立项${type === "BRIDGE" ? "架桥" : "改造"}。`, 15);
        }
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
    let gx = t.x, gy = t.y, chaseR = 2.2;
    if (t.creature) {
      if (t.creature.dead) { this.abandonTask(); return; }
      gx = t.creature.x - 0.5; gy = t.creature.y - 0.5;
      chaseR = 1.4;
      const d = Math.hypot(gx + 0.5 - this.x, gy + 0.5 - this.y);
      if (d > 3.5) {
        if (this.goTo(Math.round(gx), Math.round(gy))) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
        else this.abandonTask();
        return;
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
    // 工程资源检查：架桥耗木材、造陆耗沙土，库存不足则挂起等补给
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const s = nearestSettlement(t.x, t.y);
      const cost = TASK_RESOURCE_COST[t.type];
      const stock = s ? ensureStock(s) : null;
      const lack = !stock || Object.keys(cost).some(k => stock[k] < cost[k]);
      if (lack) {
        logThrottled(`${t.type === "BRIDGE" ? "木材" : "沙土"}不足，工程暂停等待补给。`, 30);
        return;
      }
      t.progress += effort;
      if (t.progress >= (t.need || 0)) {
        for (const k in cost) stock[k] -= cost[k];   // 完工结算资源
        this.task = null;
        tasksFinish(t);
        this.state = "idle";
      }
      this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
      return;
    }
    if (t.type === "BUILD" || t.type === "FARM" || t.type === "HUNT" ||
        t.type === "GATHER" || t.type === "FISH" || t.type === "CAPTURE" || t.type === "PLANT") {
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
    } else {
      if (workTile(t, effort)) {
        this.task = null;
        tasksFinish(t);
        this.state = "idle";
      }
    }
    this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
  }
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
