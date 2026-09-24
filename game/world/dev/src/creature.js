"use strict";
// ============ 动物实体：牛 / 羊 / 狗 ============
// 牛羊：野生兽群游荡，可狩猎（HUNT）；城邦时代后可捕获圈养（牧场产粮+繁殖）
// 狗：聚落伙伴，跟随最近的小人，主人狩猎时在旁助阵（围堵猎物）

const CREATURE_META = {
  cow:   { name: "牛",   yield: 8, speed: 0.55, flee: 1.1,  size: 1.0,  habitat: "grass",  hunt: true },
  goat:  { name: "羊",   yield: 5, speed: 0.7,  flee: 1.25, size: 0.8,  habitat: "grass",  hunt: true },
  deer:  { name: "鹿",   yield: 4, speed: 1.3,  flee: 1.7,  size: 0.85, habitat: "grass",  hunt: true },
  boar:  { name: "野猪", yield: 6, speed: 0.9,  flee: 1.0,  size: 0.9,  habitat: "forest", hunt: true },
  dog:   { name: "狗",   yield: 0, speed: 2.2,  flee: 0,    size: 0.55, habitat: "grass",  hunt: false, tamable: true, tameJoy: 15 },
  wolf:  { name: "狼",   yield: 0, speed: 1.2,  flee: 0,    size: 0.7,  habitat: "forest", hunt: false, predates: "goat" },
  fish:  { name: "鱼群", yield: 0, speed: 0.8,  flee: 0,    size: 0.5,  habitat: "water",  hunt: false, school: 4 },
  turtle:{ name: "海龟", yield: 0, speed: 0.25, flee: 0,    size: 0.6,  habitat: "water",  hunt: false },
  whale: { name: "鲸",   yield: 0, speed: 0.6,  flee: 0,    size: 2.6,  habitat: "deep",   hunt: false },
  bird:  { name: "鸟",   yield: 0, speed: 2.5,  flee: 0,    size: 0.3,  habitat: "air",    hunt: false, flier: true },
  // ---- 物种扩充（v0.5.0）----
  rabbit:  { name: "兔",     yield: 2, speed: 1.7,  flee: 2.0,  size: 0.4,  habitat: "grass",  hunt: true },
  fox:     { name: "狐",     yield: 3, speed: 1.5,  flee: 1.9,  size: 0.6,  habitat: "forest", hunt: true },
  bear:    { name: "熊",     yield: 10, speed: 0.85, flee: 0.7, size: 1.2,  habitat: "forest", hunt: true },
  horse:   { name: "马",     yield: 0, speed: 1.3,  flee: 1.7,  size: 1.1,  habitat: "grass",  hunt: false, tamable: true, tameJoy: 20 },
  penguin: { name: "企鹅",   yield: 0, speed: 0.45, flee: 0.8,  size: 0.45, habitat: "sand",   hunt: false },
  crab:    { name: "蟹",     yield: 1, speed: 0.5,  flee: 0.9,  size: 0.3,  habitat: "sand",   hunt: true },
  dolphin: { name: "海豚",   yield: 0, speed: 2.2,  flee: 0,    size: 0.9,  habitat: "water",  hunt: false },
  shark:   { name: "鲨",     yield: 0, speed: 1.2,  flee: 0,    size: 1.7,  habitat: "deep",   hunt: false },
  unicorn: { name: "独角兽", yield: 0, speed: 1.6,  flee: 1.5,  size: 0.9,  habitat: "grass",  hunt: false, tamable: true, tameJoy: 25, rare: true },
  moonfish:{ name: "月光鱼", yield: 0, speed: 0.7,  flee: 0,    size: 0.45, habitat: "deep",   hunt: false, rare: true, fishJoy: 25 },
  koi:     { name: "锦鲤",   yield: 0, speed: 0.9,  flee: 0,    size: 0.4,  habitat: "water",  hunt: false, rare: true, fishJoy: 15 },
  phoenix: { name: "凤凰",   yield: 0, speed: 2.4,  flee: 0,    size: 0.65, habitat: "air",    hunt: false, flier: true, rare: true },
  fairy:   { name: "小仙龙", yield: 0, speed: 2.6,  flee: 0,    size: 0.4,  habitat: "air",    hunt: false, flier: true, rare: true },
  mermaid: { name: "人鱼",   yield: 0, speed: 0.6,  flee: 0,    size: 0.7,  habitat: "water",  hunt: false, rare: true },
};

// 栖息地判定：生物只在自己的栖息地内活动
function habitatOk(c, x, y) {
  const t = tileAt(x, y);
  switch (CREATURE_META[c.type].habitat) {
    case "water":  return t === T.WATER;
    case "deep":   return t === T.DEEP || t === T.WATER;
    case "forest": return t === T.GRASS || t === T.TREE;
    case "sand":   return t === T.SAND;                    // 沙滩：企鹅与螃蟹的沿岸栖息带（v0.5.0）
    case "air":    return true;   // 鸟在天上飞，不受地形限制
    default:       return t === T.GRASS || t === T.SAND;
  }
}

// 圈养动物通行判定（v0.6.8）：栖息地 + 门 + 栏内；非圈养生物即 habitatOk（野生语义零改动）
// （严格布尔收口：假分支短路可能透出 undefined/falsy 链——单元探针与后续调用方都值得恒定布尔契约）
function pasturePassable(c, x, y) {
  if (habitatOk(c, x, y)) return true;
  return !!(c.pasture && (tileAt(x, y) === T.GATE || tileAt(x, y) === T.PASTURE));
}

// 育龄判定（v0.6.2）：幼年（<stages[0]）不能生、老年（≥stages[2]）停育；无寿命表物种兜底不限
function breedAgeOk(c) {
  const spAge = SPECIES_AGE[c.type];
  return !spAge || (c.age >= spAge.stages[0] && c.age < spAge.stages[2]);
}

const creatures = [];

class Creature {
  constructor(x, y, type) {
    const meta = CREATURE_META[type];
    const spAge = SPECIES_AGE[type];
    this.type = type;
    this.x = x + 0.5; this.y = y + 0.5;
    this.speed = meta.speed;
    this.dead = false;
    this.age = spAge ? randRange(spAge.stages[1], spAge.stages[2]) : 1;   // 初始青年~中年（无寿命表物种兜底）
    this.pasture = null;      // {x,y} 圈养位置（null = 野生）
    this.face = "down";       // 朝向：up/down/left/right（stepToward 实际位移后更新）
    this.faceHoldT = 1;       // 朝向持锁计时：1 = 不持锁（首次设向不受锁），切换后归 0 重新计锁（与 agent 同口径）
    this.moveCd = randRange(0, 2);
    this.breedCd = 120;
    this.outputCd = SIM.PASTURE_INTERVAL;
    this.tameness = 0;        // 驯化进度（v0.5.0 修正：原版从未初始化——undefined+dt=NaN 永远到不了 3，驯化静默失效）
    this.riddenBy = null;     // 骑乘者（agent）；骑乘中自主行为全冻结（v0.6.10）
    this.migration = null;    // 迁徙目标（v0.6.14）：null = 定居期；{x,y} = 迁徙途中
    this.migNext = world.time + randRange(SIM.MIGRATION_PERIOD_MIN, SIM.MIGRATION_PERIOD_MAX);
  }

  // v0.6.10 口径：保持 dog/bird 排除不变，追加排除「已驯化的 tamable 生物」——
  // 马/独角兽驯化认主后不再算野生动物（不被狩猎/捕获池统计；v0.6.17 起 wildBreedTick
  // 的种群计数与亲代兜底仍计入驯服个体——驯化不再掏空繁衍池）；
  // 未驯化的 tamable 生物仍是 isWild（马驯化前照旧可捕获/被生态计数）
  isWild() { return !this.pasture && this.type !== "dog" && this.type !== "bird" &&
    !(CREATURE_META[this.type].tamable && this.tamed); }

  update(dt) {
    if (this.dead) return;
    // 朝向持锁计时累计（+dt 封顶 1；undefined 视为 1 首次不受锁）——faceTurn 的非反向变向闸门
    this.faceHoldT = Math.min(1, (this.faceHoldT === undefined ? 1 : this.faceHoldT) + dt);
    // 被人搬运：坐标跟随搬运者，跳过一切自主行为（搬运者死亡则掉落原地）
    if (this.carriedBy) {
      if (this.carriedBy.dead) { this.carriedBy = null; return; }
      this.x = this.carriedBy.x - 0.4; this.y = this.carriedBy.y - 0.4;
      return;
    }
    // 年龄：1 游戏年长 1 岁，寿命封顶（无寿命表的物种不老化）——骑乘中也照常增长（v0.6.10）
    const spAge = SPECIES_AGE[this.type];
    if (spAge) this.age = Math.min(spAge.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));
    // 骑乘中（v0.6.10）：坐标由骑手每帧同步（agent 侧契约），自身自主行为全冻结——游荡/驯化扫描
    // 一概跳过；老死骰不掷：骑乘中的马由骑手照料，不会中途倒下（riddenBy 解除后恢复常规老死判定）
    if (this.riddenBy) {
      if (this.riddenBy.dead) { this.riddenBy = null; return; }
      return;
    }
    // 老死：寿命耗尽后平均 3 天内自然离世（概率衰减避免同龄瞬灭）
    if (spAge && this.age >= spAge.lifespan && rand() < dt / (SIM.DAY_LEN * 3)) {
      this.dead = true;
      this.deathReason = "寿终正寝";
      logMsg(`一只年迈的${CREATURE_META[this.type].name}寿终正寝。`);
      return;
    }
    // 搁浅/被困：施工（填海/造陆）改变地形后脚下不再是栖息地，困太久会死，等待有人救援
    // （圈养动物在人类管理的牧场里，脚下是 PASTURE tile，不参与搁浅判定；
    //   v0.6.2 起散养的牲畜（this.pasture 非空）同属人类聚落管理范围，一样不参与搁浅死亡）
    // 位置取整必须 Math.floor（v0.5.0 修正）：实体坐标是 tile 中心 +0.5，Math.round(10.5)=11 会向东偏一格——
    // 岸边的鱼/蟹/锦鲤被误判站上沙滩/虚空 → 假搁浅潮 → 救援吸干劳动力 → 农田停摆饥荒（round/floor 家族，同死锁 #20）
    if (this.type !== "bird" && !this.pasture && !habitatOk(this, Math.floor(this.x), Math.floor(this.y))) {
      this.strandT = (this.strandT || 0) + dt;
      if (this.strandT > SIM.ANIMAL_STRAND_DEATH) {
        this.dead = true;
        this.deathReason = this.type === "whale" ? "搁浅身亡" : "被困于陌生的地形";
        logMsg(this.type === "whale"
          ? "搁浅的鲸在滩涂上停止了呼吸。"
          : `一只${CREATURE_META[this.type].name}被困在陌生的地形里，没能撑下去。`);
        return;
      }
      return;   // 被困时无法移动（移动路径本就被 habitatOk 挡住），原地等待
    }
    this.strandT = 0;
    // 迁徙（v0.6.14）：迁徙中接管全部自主行为（搁浅判定在其上——迁徙者被困照旧原地求救）
    // 迁徙途中被圈养/驯化认主（migEligible 翻转）→ 立即弃迁（否则圈养个体被迁徙分支永久接管）
    if (this.migration && !this.migEligible()) { this.migration = null; this.migSide = null; this.migBlock = 0; }
    if (this.migration) { this.updateMigration(dt); return; }
    this.tryMigrate();
    if (this.pasture) { this.updatePasture(dt); return; }
    // 行为分发泛化（v0.5.0）：tamable 走驯化/跟随路径（狗/独角兽/马），flier 走飞行路径（鸟/凤凰/仙龙）
    if (CREATURE_META[this.type].tamable) { this.updateDog(dt); return; }
    if (CREATURE_META[this.type].flier) { this.updateBird(dt); return; }
    if (this.type === "wolf") { this.updateWolf(dt); return; }
    if (this.type === "dolphin") { this.updateDolphin(dt); return; }
    this.updateWild(dt);
  }

  // 野生：游荡（栖息地内）。v0.5.6：可猎兽不再躲避人类——猎物从容吃草，猎人技艺只看工时
  // （原逃跑/疲劳/猎犬围堵逻辑整体移除，顺带省掉每只可猎兽的逐帧威胁扫描）
  updateWild(dt) {
    const meta = CREATURE_META[this.type];
    // 游荡：栖息地内随机走
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const dist = meta.habitat === "deep" || meta.habitat === "air" ? 4 : 2;
      const nx = Math.round(this.x + Math.cos(a) * dist), ny = Math.round(this.y + Math.sin(a) * dist);
      if (habitatOk(this, nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = meta.speed * dt;
      const ox = this.x, oy = this.y;
      const nx = this.x + (dx / d) * sp, ny = this.y + (dy / d) * sp;
      if (habitatOk(this, Math.floor(nx), Math.floor(ny))) { this.x = nx; this.y = ny; }
      if (this.x !== ox || this.y !== oy) this.updateFace(dx, dy);   // 实际位移才更新（被栖息地挡住则保持）——与 stepToward 同口径
      if (d <= sp) this.target = null;
    }
  }

  // 狼：捕食野生羊（自然生态——靠近羊群停留数秒后羊消失），不主动攻击人
  updateWolf(dt) {
    this.moveCd -= dt;
    const prey = creatures.find(c => !c.dead && c.type === "goat" && c.isWild() &&
      Math.hypot(c.x - this.x, c.y - this.y) < 4);
    if (prey) {
      this.preyT = (this.preyT || 0) + dt;
      if (this.preyT > 4) {
        prey.dead = true;
        prey.deathReason = "成了狼群的晚餐";
        this.preyT = 0;
        logThrottled("林间传来狼嚎——有野羊成了狼群的晚餐。", 60);
      }
      return;
    }
    this.preyT = 0;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const nx = Math.round(this.x + Math.cos(a) * 3), ny = Math.round(this.y + Math.sin(a) * 3);
      if (habitatOk(this, nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = CREATURE_META[this.type].speed * dt;
      const ox = this.x, oy = this.y;
      const nx = this.x + (dx / d) * sp, ny = this.y + (dy / d) * sp;
      if (habitatOk(this, Math.floor(nx), Math.floor(ny))) { this.x = nx; this.y = ny; }
      if (this.x !== ox || this.y !== oy) this.updateFace(dx, dy);   // 同 updateWild：实际位移才更新朝向
      if (d <= sp) this.target = null;
    }
  }

  // 鸟：空中缓慢漂移（纯装饰，不受地形限制）
  updateBird(dt) {
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 3 + rand() * 3;
      const a = rand() * Math.PI * 2;
      this.target = { x: this.x + Math.cos(a) * 8, y: this.y + Math.sin(a) * 8 };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);
  }

  // ---- 迁徙（v0.6.14）----
  // 物种表：陆生鹿/野猪/马/兔 + 深海鲸 + 飞禽鸟；鱼群/海龟/海豚/狼不迁徙，
  // 驯化认主与圈养个体不迁徙。bird 天然被 isWild() 排除（v0.6.10 口径），
  // 资格按「物种表 + 非圈养 + 未驯化」判定——对非鸟物种与 isWild() 逐位等价
  migEligible() {
    if (this.pasture) return false;
    if (CREATURE_META[this.type].tamable && this.tamed) return false;
    return this.type === "deer" || this.type === "boar" || this.type === "horse" ||
      this.type === "rabbit" || this.type === "whale" || this.type === "bird";
  }

  // 触发：到点（migNext）掷 0.5 概率，向随机方向 30~80 格找 habitatOk 的目标点
  //（40 次尝试，找不到则本轮放弃、下个周期再试）；按物种分文案各自限频
  tryMigrate() {
    if (!this.migEligible() || world.time < this.migNext) return;
    this.migNext = world.time + randRange(SIM.MIGRATION_PERIOD_MIN, SIM.MIGRATION_PERIOD_MAX);
    if (rand() >= 0.5) return;
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const dist = randRange(SIM.MIGRATION_DIST_MIN, SIM.MIGRATION_DIST_MAX);
      const nx = Math.round(this.x + Math.cos(a) * dist), ny = Math.round(this.y + Math.sin(a) * dist);
      if (!habitatOk(this, nx, ny)) continue;
      this.migration = { x: nx + 0.5, y: ny + 0.5 };
      this.migSide = null;   // 绕行持边重置（每次新迁徙重掷）
      this.migBlock = 0;     // 连续受阻计数归零
      logThrottled(this.type === "bird" ? "候鸟结队远行。"
        : this.type === "whale" ? "鲸群游向新海域。"
        : "兽群开始向远方迁徙，追逐水草与季节。", 120);
      return;
    }
  }

  // 迁徙位移：stepToward 直奔目标；被栖息地挡住（moveBy 置空 target 且未到达）时沿切向
  // ±90°（持边：侧向掷定贯穿本轮，防障碍前来回横跳）重设 5~10 格内同栖息地中转目标，
  // 到达（原始目标或中转皆同）即结束本轮并排下个周期——「回 goal 续程」会在凹形障碍上
  // 打转（海湾近岸 orbiting，实测 400s 净进 0），到点安家即本轮迁徙语义。
  // 兜底：连续受阻 8 轮选址皆未走通 → 本轮就地放弃重排（必然终止，无永久打转/卡死）。
  // （bird 目标即远点：air 全地形无阻挡，天然直达；鲸/陆生的搁浅安全网在 update() 上游保留）
  updateMigration(dt) {
    const dx = this.migration.x - this.x, dy = this.migration.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = CREATURE_META[this.type].speed * dt;
    const endMigration = () => {
      this.migration = null;
      this.migSide = null;
      this.migBlock = 0;
      this.migNext = world.time + randRange(SIM.MIGRATION_PERIOD_MIN, SIM.MIGRATION_PERIOD_MAX);
    };
    if (d <= step) {
      this.x = this.migration.x; this.y = this.migration.y;
      endMigration();
      return;
    }
    this.target = this.migration;   // 哨兵：moveBy 被挡时置空 target，借以检测本帧受阻
    this.stepToward(this.migration, step);
    if (this.target === null && this.migration) {
      if ((this.migBlock || 0) >= 8) { endMigration(); return; }   // 受阻预算耗尽：就地放弃
      this.migBlock = (this.migBlock || 0) + 1;
      const td = d || 1;
      let side = this.migSide || (rand() < 0.5 ? 1 : -1);
      for (let attempt = 0; attempt < 2; attempt++, side = -side) {
        const px = -dy / td * side, py = dx / td * side;   // ±90° 切向单位向量
        for (let i = 0; i < 10; i++) {
          const r = randRange(5, 10);
          const wx = Math.round(this.x + px * r), wy = Math.round(this.y + py * r);
          if (habitatOk(this, wx, wy)) {
            this.migSide = side;
            this.migration = { x: wx + 0.5, y: wy + 0.5 };
            return;
          }
        }
      }
    }
  }

  // 狗：认定了固定主人就一生跟随（主人去世后才重新认主）
  // 驯化（v0.5.0 泛化）：野生个体需要被靠近驯化——有人停留累计驯化进度，成功后认定固定主人；
  // tamable 物种共用本路径（狗 / 独角兽 / 马），驯化成功的喜悦按 meta.tameJoy 回馈驯服者
  updateDog(dt) {
    if (!this.tamed || !this.owner || this.owner.dead) {
      // 未驯化（或主人去世重新待驯）：游荡 + 驯化检测
      this.tamed = false;
      this.owner = null;
      this.moveCd -= dt;
      if (this.moveCd <= 0) {
        this.moveCd = 1.5 + rand() * 2;
        const a = rand() * Math.PI * 2;
        const nx = Math.round(this.x + Math.cos(a) * 2), ny = Math.round(this.y + Math.sin(a) * 2);
        if (walkable(nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
      }
      if (this.target) this.stepToward(this.target, this.speed * dt);
      // 驯化：有小人靠近（1.5 格内）累计驯化度，喜爱牲畜的人在旁进度翻倍
      let tamer = null, tamerD = 1.5;
      for (const a of agents) {
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d < tamerD) { tamerD = d; tamer = a; }
      }
      if (tamer) {
        this.tameness += dt * (tamer.hobby === "animal" ? 2 : 1);
        if (this.tameness >= 3) {
          this.tamed = true;
          this.owner = tamer;
          // 驯化的喜悦（v0.5.0）：驯服者心情大涨（独角兽 25 / 狗 15，meta.tameJoy 定义）
          tamer.mood = Math.min(100, (tamer.mood || 0) + (CREATURE_META[this.type].tameJoy || SIM.MOOD_TAME_BONUS || 15));
          logThrottled(`${tamer.name} 驯服了一条${CREATURE_META[this.type].name}，它认定他为主人。`, 15);
        }
      }
      return;
    }
    const d = Math.hypot(this.owner.x - this.x, this.owner.y - this.y);
    if (d > 4) this.stepToward(this.owner, this.speed * dt);
  }

  // 海豚（v0.5.0）：追随航行的船嬉戏（追随 26 格内最近的海上船只；无船则普通游荡）
  updateDolphin(dt) {
    let best = null, bd = 26;
    for (const s of world.ships) {
      if (s.state !== "sailing" && s.state !== "fishing" && s.state !== "return") continue;
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { this.stepToward(best, this.speed * dt); return; }
    this.updateWild(dt);
  }

  // 圈养：栏内小范围活动 + 定期产粮 + 繁殖（水生物种圈养于水域渔场，游荡判定走栖息地）。
  // v0.6.2 散养语义：牲畜以牧场为家自由溜达——陆生 roam 半径 11 格（可经 GATE 门外出），
  // 水生 4 格（仍被栖息地拦在水域内，鱼出不了水是既有语义）；离牧场中心 >6 格的陆生牲畜
  // 下一目标改为确定性回栏（朝中心方向 min(d,5)，不掷随机角度）；moveBy 对圈养动物放行
  // GATE 闸门，野生生物的栖息地语义一个字不改；繁殖受育龄（breedAgeOk）约束。
  // v0.6.8：确定性回栏被山/树挡住时会无限顶墙（moveBy 置空 target→下轮重选同一目标）——
  // 受阻退避：回栏位移 <1 格计一次失败，连败 2 次本轮退回随机游走；陆生目标校验统一走
  // pasturePassable（栖息地 + 门 + 栏内），与 moveBy 圈养放行分支同源。
  updatePasture(dt) {
    const waterBound = CREATURE_META[this.type].habitat === "water" || CREATURE_META[this.type].habitat === "deep";
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 1.5 + rand() * 2;
      const pcx = this.pasture.x + 0.5, pcy = this.pasture.y + 0.5;
      const dCenter = Math.hypot(this.x - pcx, this.y - pcy);
      let tx, ty, useRet = false;
      if (!waterBound && dCenter > 6) {
        // 受阻评估：上轮选的是回栏目标且此后位移 <1 格 → 记一次失败；否则归 0
        // （retMark 只在回栏分支产出候选时记录，非回栏选路即清空——保证「上轮是回栏」判定准确）
        if (this.retMark && Math.hypot(this.x - this.retMark.x, this.y - this.retMark.y) < 1) {
          this.retFail = (this.retFail || 0) + 1;
        } else {
          this.retFail = 0;
        }
        useRet = this.retFail < 2;
        if (!useRet) this.retMark = null;
      } else {
        this.retFail = 0; this.retMark = null;   // 离栏心 ≤6（或水生）：清受阻状态
      }
      if (useRet) {
        // 回栏偏置（v0.6.2，确定性）：离群过远则朝牧场中心走 min(d,5)，不消耗随机角度
        const d = Math.min(dCenter, 5);
        tx = this.x + (pcx - this.x) / dCenter * d;
        ty = this.y + (pcy - this.y) / dCenter * d;
        this.retMark = { x: this.x, y: this.y };
      } else {
        const a = rand() * Math.PI * 2;
        const roam = waterBound ? 4 : 11;   // 陆生散养半径 10~12（取 11，经门外出），水生仍在水域内
        tx = pcx + Math.cos(a) * roam; ty = pcy + Math.sin(a) * roam;
      }
      const ok = waterBound
        ? habitatOk(this, Math.floor(tx), Math.floor(ty))
        : pasturePassable(this, Math.floor(tx), Math.floor(ty));
      if (ok) this.target = { x: tx, y: ty };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);

    this.outputCd -= dt;
    if (this.outputCd <= 0) {
      this.outputCd = SIM.PASTURE_INTERVAL;
      const st = ownerSettle(this.pasture.x, this.pasture.y);
      if (st) ensureStock(st).food += SIM.PASTURE_YIELD;
    }
    this.breedCd -= dt;
    if (this.breedCd <= 0) {
      this.breedCd = 120;
      const pen = creatures.filter(c => c.pasture && !c.dead && c.type === this.type &&
        Math.abs(c.x - this.pasture.x) + Math.abs(c.y - this.pasture.y) < 6);
      // v0.6.2：亲代须在育龄内（幼年不能生、老年停育）
      // v0.6.15 收口：圈养繁殖同受全局 SPECIES_CAP 约束（与岛屿散布 underCap 同口径）——
      // 单栏 PASTURE_CAP 只限一栏，多栏围捕可把全局种群顶破上限表（species 上限守卫实测 21/20）
      // v0.6.18 接缝修复：cap 查表对齐 wildBreedTick 折算口径（turtle/whale 专键）——生态普查实测
      // 圈养海龟无键放行 → 26/12 破顶（海龟寿命 30 游戏年几乎不老死，圈养池只进不出）
      const capAll = SIM.SPECIES_CAP[this.type] !== undefined ? SIM.SPECIES_CAP[this.type]
        : this.type === "turtle" ? SIM.TURTLE_CAP : this.type === "whale" ? SIM.WHALE_CAP : Infinity;
      if (pen.length < SIM.PASTURE_CAP && rand() < SIM.BREED_CHANCE && breedAgeOk(this) &&
          creatures.filter(c => c.type === this.type && !c.dead).length < capAll) {
        spawnCreature(this.pasture.x, this.pasture.y, this.type, true);
      }
    }
  }

  stepToward(t, step) {
    const dx = t.x - this.x, dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) {
      this.x = t.x; this.y = t.y; this.target = null;
      if (d > 1e-6) this.updateFace(dx, dy);
      return;
    }
    const ox = this.x, oy = this.y;
    this.moveBy((dx / d) * step, (dy / d) * step);
    if (this.x !== ox || this.y !== oy) this.updateFace(dx, dy);   // 实际位移了才更新朝向（被栖息地挡住不动则保持）
  }

  // 朝向：按实际位移主轴更新——走 faceTurn 持锁迟滞（与小人 stepAlong 同口径；
  // stepToward 的「实际位移才更新」判定保留在外层不动）
  updateFace(dx, dy) {
    faceTurn(this, dx, dy);
  }

  moveBy(mx, my) {
    const nx = this.x + mx, ny = this.y + my;
    // v0.6.2 散养通行：圈养动物（this.pasture 非空）放行牧场门 GATE 与栏内地板 PASTURE——
    // 圈养牲畜生在栏心 PASTURE tile 上，其栖息地（GRASS/SAND）不含栏心，不放行则永远钉死在
    // 栏心一格（v0.5.3「出门溜达」对陆生牲畜实际从未生效的根因）；野生生物栖息地语义不变。
    // v0.6.8：放行分支统一收敛到 pasturePassable——非圈养生物即 habitatOk，语义逐位不变
    const ok = pasturePassable(this, Math.floor(nx), Math.floor(ny));
    if (ok) { this.x = nx; this.y = ny; }
    else this.target = null;
  }
}

function spawnCreature(x, y, type, captured) {
  const c = new Creature(x, y, type);
  if (captured) c.pasture = { x, y };
  // 狗出生时是野生的，需要有人靠近驯化后才会认主
  creatures.push(c);
  return c;
}

// 在一座岛上散布生物：牲畜兽群 + 野生鹿/野猪/狼 + 海龟（按栖息地落位）+ 新物种散布（v0.5.0）
function populateIslandCreatures(bx, by, r) {
  let grass = 0, forestEdge = 0, water = 0, sand = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = tileAt(bx + dx, by + dy);
    if (t === T.GRASS) grass++;
    if (t === T.TREE) forestEdge++;
    if (t === T.WATER) water++;
    if (t === T.SAND) sand++;
  }
  let n = 0;
  if (grass < 12) return 0;
  // 上限守卫（v0.6.17 接缝修复）：underCap 原先只护「新物种散布」段，旧生态段（牲畜兽群/鹿/
  // 野猪/狼/海龟）漏护——探索点亮新岛时种群随岛屿数无界增长（生态普查实测 goat 53/40、
  // turtle 20/12）。生成侧统一对齐 SPECIES_CAP 语义；cow 无专键由 Infinity 兜底（护栏另管）。
  // capOf 折算 turtle/whale 专键——与 wildBreedTick/updatePasture 同口径（探针实测无键放行 13~20/12）
  const capOf = type => SIM.SPECIES_CAP[type] !== undefined ? SIM.SPECIES_CAP[type]
    : type === "turtle" ? SIM.TURTLE_CAP : type === "whale" ? SIM.WHALE_CAP : Infinity;
  const underCap = type => creatures.filter(c => c.type === type && !c.dead).length < capOf(type);
  // 牲畜兽群
  const herds = 1 + Math.floor(grass / 60);
  for (let h = 0; h < herds; h++) {
    const type = rand() < 0.5 ? "cow" : "goat";
    if (!underCap(type)) continue;
    const cnt = type === "cow" ? 3 + randInt(0, 3) : 4 + randInt(0, 4);
    const cx = bx + randInt(-r + 3, r - 3), cy = by + randInt(-r + 3, r - 3);
    for (let i = 0; i < cnt; i++) {
      const s = findSpot(cx, cy, 0, 4, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, type); n++; }
    }
  }
  // 野生鹿群（草地）
  const deerCnt = 2 + randInt(0, 3);
  for (let i = 0; i < deerCnt && underCap("deer"); i++) {
    const s = findSpot(bx, by, 3, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "deer"); n++; }
  }
  // 野猪与狼（林地边缘）
  if (forestEdge > 6) {
    for (let i = 0; i < 2 + randInt(0, 2) && underCap("boar"); i++) {
      const s = findSpot(bx, by, 2, r, T.GRASS, [T.BERRY, T.FRUIT]);
      if (s) { spawnCreature(s.x, s.y, "boar"); n++; }
    }
    if (rand() < 0.5 && underCap("wolf")) {
      const s = findSpot(bx, by, 2, r, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, "wolf"); n++; }
    }
  }
  // 海龟（浅水）
  for (let i = 0; i < 2 && water > 8 && underCap("turtle"); i++) {
    for (let tries = 0; tries < 40; tries++) {
      const cx = bx + randInt(-r, r), cy = by + randInt(-r, r);
      if (tileAt(cx, cy) === T.WATER) { spawnCreature(cx, cy, "turtle"); n++; break; }
    }
  }
  // ---- 新物种散布（v0.5.0）----
  // 上限守卫：每岛散布不受繁衍上限约束会让种群随岛屿数无界增长（性能与生态双重问题）——
  // 生成前查全局计数，已达 SIM.SPECIES_CAP 的物种跳过（underCap 定义已上移至函数头，v0.6.17 起全段共用）
  // 沙滩：企鹅与螃蟹混居（沿岸栖息带）
  if (sand > 5 && (underCap("penguin") || underCap("crab"))) {
    for (let i = 0; i < 1 + randInt(0, 2); i++) {
      const kind = rand() < 0.5 ? "penguin" : "crab";
      if (!underCap(kind)) continue;
      const s = findSpot(bx, by, 1, r, T.SAND);
      if (s) { spawnCreature(s.x, s.y, kind); n++; }
    }
  }
  // 草地加种：兔群（快繁衍）+ 零星野马
  for (let i = 0; i < 1 + randInt(0, 3) && underCap("rabbit"); i++) {
    const s = findSpot(bx, by, 2, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "rabbit"); n++; }
  }
  if (rand() < 0.4 && underCap("horse")) {
    const s = findSpot(bx, by, 3, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "horse"); n++; }
  }
  // 林地加种：狐；大森林偶见熊（猎物丰厚但危险）
  if (forestEdge > 6) {
    for (let i = 0; i < 1 + randInt(0, 2) && underCap("fox"); i++) {
      const s = findSpot(bx, by, 2, r, T.GRASS, [T.BERRY, T.FRUIT]);
      if (s) { spawnCreature(s.x, s.y, "fox"); n++; }
    }
    if (rand() < 0.3 && underCap("bear")) {
      const s = findSpot(bx, by, 2, r, T.TREE);
      if (s) { spawnCreature(s.x, s.y, "bear"); n++; }
    }
  }
  // 珍稀：独角兽（约 1/8 的岛有一只，雪白草地幻兽，可驯化）
  if (rand() < 0.12 && underCap("unicorn")) {
    const s = findSpot(bx, by, 3, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "unicorn"); n++; logThrottled("传闻这座岛上有独角兽出没。", 60); }
  }
  return n;
}

// 野生总量自然增长（防止猎绝）。v0.6.17 繁衍均衡化：旧版「全局池随机选亲、每 tick 陆生至多 1 只」
// 结构性追不上死亡率（探针实测 33 游戏年山羊/鹿/兔/野猪/鱼/鲨/熊/蟹灭绝、狐独占 60），重构为
// 「每物种均衡出生」——期望出生 = 种群 × 120 ÷ 寿命秒 × WILD_BREED_SAFETY（与死亡率同量纲，
// 替换率留 25% 爬坡余量）；floor + 概率进位取整；超每物种硬上限钳制；选址失败少生不硬造。
// 计数口径：非死亡、非圈养（pasture 为空），驯服（tamed）个体计入——修马/独角兽被驯化掏空繁衍池；
// 出生仍落野生（spawnCreature 不带 captured）；亲代育龄内（breedAgeOk），野生优先、无野生取驯服。
// 上限表：SPECIES_CAP 全键 + 海龟/鲸既有专键折算；无表物种（牛）无专键，由全局护栏兜底。
function wildBreedTick() {
  if (world.time % 120 > 1) return;
  const habTile = { grass: T.GRASS, forest: T.TREE, sand: T.SAND, water: T.WATER, deep: T.DEEP };
  // 统一可繁衍物种表：陆生 hunt 系 + 狼 + 海龟 + 鲸 + SPECIES_CAP 全部键（去重；flier 飞行类不在此繁衍）
  const species = [];
  const seen = {};
  for (const type of Object.keys(CREATURE_META)) {
    if (CREATURE_META[type].hunt || type === "wolf") { species.push(type); seen[type] = true; }
  }
  for (const t of ["turtle", "whale"]) if (!seen[t]) { species.push(t); seen[t] = true; }
  for (const type of Object.keys(SIM.SPECIES_CAP || {})) {
    if (seen[type] || !CREATURE_META[type] || CREATURE_META[type].flier) continue;
    species.push(type); seen[type] = true;
  }
  // 全局护栏：陆生系（hunt 系+狼，与旧陆生分支同集）非圈养活体（驯服计入）合计 ≥ WILD_BREED_CAP
  // → 本 tick 跳过剩余陆生物种（性能护栏，非生态上限）
  const isLand = type => !!(CREATURE_META[type].hunt || type === "wolf");
  let landPop = 0;
  for (const c of creatures) if (!c.dead && !c.pasture && isLand(c.type)) landPop++;
  let landBorn = 0;   // 本 tick 陆生系已出生数（计入护栏）
  for (const type of species) {
    // 每物种硬上限：SPECIES_CAP 专键；海龟/鲸折算既有专键；无表物种兜底 Infinity（护栏兜底）
    const cap = SIM.SPECIES_CAP[type] !== undefined ? SIM.SPECIES_CAP[type]
      : type === "turtle" ? SIM.TURTLE_CAP : type === "whale" ? SIM.WHALE_CAP : Infinity;
    const pool = creatures.filter(c => !c.dead && !c.pasture && c.type === type);   // 驯服计入
    // 全口径计数（含圈养）：SPECIES_CAP 是物种硬上限——圈养个体不计则野生顶满 cap 后
    // 总数必然超限（species 套件实测 goat 42/40），与岛屿散布 underCap、updatePasture 三处口径对齐
    const total = creatures.filter(c => !c.dead && c.type === type).length;
    if (pool.length === 0 || total >= cap) continue;
    const parents = pool.filter(c => breedAgeOk(c));
    if (parents.length === 0) continue;
    if (isLand(type) && landPop + landBorn >= SIM.WILD_BREED_CAP) continue;
    const wildParents = parents.filter(c => c.isWild());
    const chosen = wildParents.length ? wildParents : parents;   // 亲代野生优先、无野生再取驯服
    // 期望出生：pop×120÷寿命秒×安全系数（寿命秒 = 游戏年×1080）；floor + 概率进位；钳到 cap-总数
    const spAge = SPECIES_AGE[type];
    const lifeS = spAge ? spAge.lifespan * SIM.DAY_LEN * SIM.YEAR_DAYS : 12 * SIM.DAY_LEN * SIM.YEAR_DAYS;
    const expected = pool.length * 120 / lifeS * SIM.WILD_BREED_SAFETY;
    const fl = Math.floor(expected);
    let n = fl + (rand() < expected - fl ? 1 : 0);
    n = Math.min(n, cap - total);
    for (let i = 0; i < n; i++) {
      const ref = chosen[randInt(0, chosen.length - 1)];
      // 选址沿用各栖息地旧 findSpot 半径口径：陆 0~3 / 狼林 0~5 兜底 / 龟水 0~5 / 鲸深 0~8 / SPECIES_CAP 系 0~6
      const s = type === "wolf" ? (findSpot(Math.round(ref.x), Math.round(ref.y), 0, 3, T.GRASS) ||
        findSpot(Math.round(ref.x), Math.round(ref.y), 0, 5, T.TREE))
        : type === "turtle" ? findSpot(Math.round(ref.x), Math.round(ref.y), 0, 5, T.WATER)
        : type === "whale" ? findSpot(Math.round(ref.x), Math.round(ref.y), 0, 8, T.DEEP)
        : SIM.SPECIES_CAP[type] !== undefined
          ? findSpot(Math.round(ref.x), Math.round(ref.y), 0, 6, habTile[CREATURE_META[type].habitat] || T.GRASS)
          : findSpot(Math.round(ref.x), Math.round(ref.y), 0, 3, T.GRASS);
      if (!s) break;   // 选址失败少生，不硬造
      spawnCreature(s.x, s.y, type);
      if (isLand(type)) landBorn++;
    }
  }
}
// 鲸：深海罕见生物（航海氛围），随深海探索偶现
function spawnWhaleOccasionally() {
  if (world.time % 240 > 1) return;
  if (creatures.filter(c => c.type === "whale" && !c.dead).length >= SIM.WHALE_CAP) return;
  for (let tries = 0; tries < 60; tries++) {
    const x = Math.round(world.store.x + randRange(-160, 160));
    const y = Math.round(world.store.y + randRange(-160, 160));
    if (tileAt(x, y) === T.DEEP && !creatures.some(c => !c.dead && Math.hypot(c.x - x, c.y - y) < 40)) {
      spawnCreature(x, y, "whale");
      return;
    }
  }
}

// 狩猎收益
function huntReward(c) {
  return CREATURE_META[c.type].yield;
}
