"use strict";
// ============ 动物实体：牛 / 羊 / 狗 ============
// 牛羊：野生兽群游荡，可狩猎（HUNT）；城邦时代后可捕获圈养（牧场产粮+繁殖）
// 狗：聚落伙伴，跟随最近的小人，主人狩猎时在旁助阵（围堵猎物）

const CREATURE_META = {
  cow:   { name: "牛",   yield: 8, speed: 0.55, flee: 1.1,  size: 1.0,  habitat: "grass",  hunt: true },
  goat:  { name: "羊",   yield: 5, speed: 0.7,  flee: 1.25, size: 0.8,  habitat: "grass",  hunt: true },
  deer:  { name: "鹿",   yield: 4, speed: 1.3,  flee: 1.7,  size: 0.85, habitat: "grass",  hunt: true },
  boar:  { name: "野猪", yield: 6, speed: 0.9,  flee: 1.0,  size: 0.9,  habitat: "forest", hunt: true },
  dog:   { name: "狗",   yield: 0, speed: 2.2,  flee: 0,    size: 0.55, habitat: "grass",  hunt: false },
  wolf:  { name: "狼",   yield: 0, speed: 1.2,  flee: 0,    size: 0.7,  habitat: "forest", hunt: false, predates: "goat" },
  fish:  { name: "鱼群", yield: 0, speed: 0.8,  flee: 0,    size: 0.5,  habitat: "water",  hunt: false, school: 4 },
  turtle:{ name: "海龟", yield: 0, speed: 0.25, flee: 0,    size: 0.6,  habitat: "water",  hunt: false },
  whale: { name: "鲸",   yield: 0, speed: 0.6,  flee: 0,    size: 2.6,  habitat: "deep",   hunt: false },
  bird:  { name: "鸟",   yield: 0, speed: 2.5,  flee: 0,    size: 0.3,  habitat: "air",    hunt: false },
};

// 栖息地判定：生物只在自己的栖息地内活动
function habitatOk(c, x, y) {
  const t = tileAt(x, y);
  switch (CREATURE_META[c.type].habitat) {
    case "water":  return t === T.WATER;
    case "deep":   return t === T.DEEP || t === T.WATER;
    case "forest": return t === T.GRASS || t === T.TREE;
    case "air":    return true;   // 鸟在天上飞，不受地形限制
    default:       return t === T.GRASS || t === T.SAND;
  }
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
  }

  isWild() { return !this.pasture && this.type !== "dog" && this.type !== "bird"; }

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
    // 年龄：1 游戏年长 1 岁，寿命封顶（无寿命表的物种不老化）
    const spAge = SPECIES_AGE[this.type];
    if (spAge) this.age = Math.min(spAge.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));
    // 老死：寿命耗尽后平均 3 天内自然离世（概率衰减避免同龄瞬灭）
    if (spAge && this.age >= spAge.lifespan && rand() < dt / (SIM.DAY_LEN * 3)) {
      this.dead = true;
      logMsg(`一只年迈的${CREATURE_META[this.type].name}寿终正寝。`);
      return;
    }
    // 搁浅/被困：施工（填海/造陆）改变地形后脚下不再是栖息地，困太久会死，等待有人救援
    // （圈养动物在人类管理的牧场里，脚下是 PASTURE tile，不参与搁浅判定）
    if (this.type !== "bird" && !this.pasture && !habitatOk(this, Math.round(this.x), Math.round(this.y))) {
      this.strandT = (this.strandT || 0) + dt;
      if (this.strandT > SIM.ANIMAL_STRAND_DEATH) {
        this.dead = true;
        logMsg(this.type === "whale"
          ? "搁浅的鲸在滩涂上停止了呼吸。"
          : `一只${CREATURE_META[this.type].name}被困在陌生的地形里，没能撑下去。`);
        return;
      }
      return;   // 被困时无法移动（移动路径本就被 habitatOk 挡住），原地等待
    }
    this.strandT = 0;
    if (this.pasture) { this.updatePasture(dt); return; }
    if (this.type === "dog") { this.updateDog(dt); return; }
    if (this.type === "bird") { this.updateBird(dt); return; }
    if (this.type === "wolf") { this.updateWolf(dt); return; }
    this.updateWild(dt);
  }

  // 野生：游荡（栖息地内）；可猎物种会被猎人逼近而逃离（附近有狗则被围堵减速）
  updateWild(dt) {
    const meta = CREATURE_META[this.type];
    // 逃跑判定：只对可猎物种生效
    if (meta.hunt) {
      let threat = null, threatD = 2.8;
      for (const a of agents) {
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d < threatD) { threatD = d; threat = a; }
      }
      let dogNear = false;
      for (const c of creatures) {
        if (c.type === "dog" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 4) { dogNear = true; break; }
      }
      if (threat) {
        this.fleeT = (this.fleeT || 0) + dt;
        const tired = this.fleeT > 8 ? 0.4 : 1;
        const sp = (dogNear ? 0.55 : meta.flee) * tired * dt;
        const dx = this.x - threat.x, dy = this.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        const fox = this.x, foy = this.y;
        this.moveBy((dx / d) * sp, (dy / d) * sp);
        if (this.x !== fox || this.y !== foy) this.updateFace(dx, dy);   // 朝向=逃跑方向（dx/dy 本就是背离威胁的背向向量）；实际位移才更新——与 stepToward 同口径
        return;
      }
      this.fleeT = 0;
    }
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
      if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
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
      if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
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

  // 狗：认定了固定主人就一生跟随（主人去世后才重新认主）
  // 狗：野生幼犬需要被驯化——有人靠近停留累计驯化进度，成功后一生认定固定主人
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
          logThrottled(`${tamer.name} 驯服了一条狗，狗认定他为主人。`, 15);
        }
      }
      return;
    }
    const d = Math.hypot(this.owner.x - this.x, this.owner.y - this.y);
    if (d > 4) this.stepToward(this.owner, this.speed * dt);
  }

  // 圈养：在栏内小范围活动，定期产粮 + 繁殖（水生物种圈养于水域渔场，游荡判定走栖息地）
  updatePasture(dt) {
    const waterBound = CREATURE_META[this.type].habitat === "water" || CREATURE_META[this.type].habitat === "deep";
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 1.5 + rand() * 2;
      const a = rand() * Math.PI * 2;
      const tx = this.pasture.x + 0.5 + Math.cos(a) * 2.5, ty = this.pasture.y + 0.5 + Math.sin(a) * 2.5;
      const ok = waterBound
        ? habitatOk(this, Math.round(tx), Math.round(ty))
        : walkable(Math.round(tx), Math.round(ty));
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
      if (pen.length < SIM.PASTURE_CAP && rand() < SIM.BREED_CHANCE) {
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
    if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
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

// 在一座岛上散布生物：牲畜兽群 + 野生鹿/野猪/狼 + 海龟（按栖息地落位）
function populateIslandCreatures(bx, by, r) {
  let grass = 0, forestEdge = 0, water = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = tileAt(bx + dx, by + dy);
    if (t === T.GRASS) grass++;
    if (t === T.TREE) forestEdge++;
    if (t === T.WATER) water++;
  }
  let n = 0;
  if (grass < 12) return 0;
  // 牲畜兽群
  const herds = 1 + Math.floor(grass / 60);
  for (let h = 0; h < herds; h++) {
    const type = rand() < 0.5 ? "cow" : "goat";
    const cnt = type === "cow" ? 3 + randInt(0, 3) : 4 + randInt(0, 4);
    const cx = bx + randInt(-r + 3, r - 3), cy = by + randInt(-r + 3, r - 3);
    for (let i = 0; i < cnt; i++) {
      const s = findSpot(cx, cy, 0, 4, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, type); n++; }
    }
  }
  // 野生鹿群（草地）
  const deerCnt = 2 + randInt(0, 3);
  for (let i = 0; i < deerCnt; i++) {
    const s = findSpot(bx, by, 3, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "deer"); n++; }
  }
  // 野猪与狼（林地边缘）
  if (forestEdge > 6) {
    for (let i = 0; i < 2 + randInt(0, 2); i++) {
      const s = findSpot(bx, by, 2, r, T.GRASS, [T.BERRY, T.FRUIT]);
      if (s) { spawnCreature(s.x, s.y, "boar"); n++; }
    }
    if (rand() < 0.5) {
      const s = findSpot(bx, by, 2, r, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, "wolf"); n++; }
    }
  }
  // 海龟（浅水）
  for (let i = 0; i < 2 && water > 8; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const cx = bx + randInt(-r, r), cy = by + randInt(-r, r);
      if (tileAt(cx, cy) === T.WATER) { spawnCreature(cx, cy, "turtle"); n++; break; }
    }
  }
  return n;
}

// 野生总量自然增长（防止猎绝；分栖息地设上限）
function wildBreedTick() {
  if (world.time % 120 > 1) return;
  // 陆生：可猎物种 + 狼（捕食者种群也需延续，与羊群构成生态闭环）
  const land = creatures.filter(c => c.isWild() && !c.dead && (CREATURE_META[c.type].hunt || c.type === "wolf"));
  if (land.length < SIM.WILD_BREED_CAP && land.length >= 4) {
    const c = land[randInt(0, land.length - 1)];
    const p = findSpot(Math.round(c.x), Math.round(c.y), 0, 3, T.GRASS) ||
              (c.type === "wolf" ? findSpot(Math.round(c.x), Math.round(c.y), 0, 5, T.TREE) : null);   // 森林深处的狼可在林地繁衍
    if (p) spawnCreature(p.x, p.y, c.type);
  }
  // 海龟（浅水繁殖）
  const turtles = creatures.filter(c => c.isWild() && !c.dead && c.type === "turtle");
  if (turtles.length > 0 && turtles.length < SIM.TURTLE_CAP) {
    const t0 = turtles[randInt(0, turtles.length - 1)];
    const ps = findSpot(Math.round(t0.x), Math.round(t0.y), 0, 5, T.WATER);
    if (ps) spawnCreature(ps.x, ps.y, "turtle");
  }
  // 鲸（深海繁殖）
  const whales = creatures.filter(c => !c.dead && c.type === "whale");
  if (whales.length > 0 && whales.length < SIM.WHALE_CAP) {
    const w0 = whales[randInt(0, whales.length - 1)];
    const pw = findSpot(Math.round(w0.x), Math.round(w0.y), 0, 8, T.DEEP);
    if (pw) spawnCreature(pw.x, pw.y, "whale");
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
