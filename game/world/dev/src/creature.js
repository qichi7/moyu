"use strict";
// ============ 动物实体：牛 / 羊 / 狗 ============
// 牛羊：野生兽群游荡，可狩猎（HUNT）；城邦时代后可捕获圈养（牧场产粮+繁殖）
// 狗：聚落伙伴，跟随最近的小人，主人狩猎时在旁助阵（围堵猎物）

const CREATURE_META = {
  cow:  { name: "牛",  yield: 8, speed: 0.55, flee: 1.1, size: 1.0 },
  goat: { name: "羊",  yield: 5, speed: 0.7,  flee: 1.25, size: 0.8 },
  dog:  { name: "狗",  yield: 0, speed: 2.2,  flee: 0,   size: 0.55 },
};

const creatures = [];

class Creature {
  constructor(x, y, type) {
    const meta = CREATURE_META[type];
    const spAge = SPECIES_AGE[type];
    this.type = type;
    this.x = x + 0.5; this.y = y + 0.5;
    this.speed = meta.speed;
    this.dead = false;
    this.age = randRange(spAge.stages[1], spAge.stages[2]);   // 初始青年~中年
    this.pasture = null;      // {x,y} 圈养位置（null = 野生）
    this.moveCd = randRange(0, 2);
    this.breedCd = 120;
    this.outputCd = SIM.PASTURE_INTERVAL;
  }

  isWild() { return !this.pasture && this.type !== "dog"; }

  update(dt) {
    if (this.dead) return;
    // 年龄：1 游戏年长 1 岁，寿命封顶
    const spAge = SPECIES_AGE[this.type];
    this.age = Math.min(spAge.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));
    if (this.pasture) { this.updatePasture(dt); return; }
    if (this.type === "dog") { this.updateDog(dt); return; }
    this.updateWild(dt);
  }

  // 野生：游荡；有猎人逼近则远离（附近有狗则逃跑变慢——被围堵）
  updateWild(dt) {
    // 逃跑判定
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
      const sp = (dogNear ? 0.55 : CREATURE_META[this.type].flee) * dt;
      const dx = this.x - threat.x, dy = this.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      this.moveBy((dx / d) * sp, (dy / d) * sp);
      return;
    }
    // 游荡
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const nx = Math.round(this.x + Math.cos(a) * 2), ny = Math.round(this.y + Math.sin(a) * 2);
      if (walkable(nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);
  }

  // 狗：跟随最近的小人（4 格内不贴脸）
  updateDog(dt) {
    this.ownerCd = (this.ownerCd || 0) - dt;
    if (!this.owner || this.ownerCd <= 0) {
      this.ownerCd = 2;
      let best = null, bestD = 1e9;
      for (const a of agents) {
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d < bestD) { bestD = d; best = a; }
      }
      this.owner = best;
    }
    if (!this.owner) return;
    const d = Math.hypot(this.owner.x - this.x, this.owner.y - this.y);
    if (d > 4) this.stepToward(this.owner, this.speed * dt);
  }

  // 圈养：在栏内小范围活动，定期产粮 + 繁殖
  updatePasture(dt) {
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 1.5 + rand() * 2;
      const a = rand() * Math.PI * 2;
      const tx = this.pasture.x + 0.5 + Math.cos(a) * 2.5, ty = this.pasture.y + 0.5 + Math.sin(a) * 2.5;
      if (walkable(Math.round(tx), Math.round(ty))) this.target = { x: tx, y: ty };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);

    this.outputCd -= dt;
    if (this.outputCd <= 0) {
      this.outputCd = SIM.PASTURE_INTERVAL;
      world.food += SIM.PASTURE_YIELD;
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
    if (d <= step) { this.x = t.x; this.y = t.y; this.target = null; return; }
    this.moveBy((dx / d) * step, (dy / d) * step);
  }

  moveBy(mx, my) {
    const nx = this.x + mx, ny = this.y + my;
    if (walkable(Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
    else this.target = null;
  }
}

function spawnCreature(x, y, type, captured) {
  const c = new Creature(x, y, type);
  if (captured) c.pasture = { x, y };
  creatures.push(c);
  return c;
}

// 在一座岛上散布兽群（按草地面积，牛羊混编）
function populateIslandCreatures(bx, by, r) {
  let grass = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (tileAt(bx + dx, by + dy) === T.GRASS) grass++;
  if (grass < 12) return 0;
  const herds = 1 + Math.floor(grass / 60);
  let n = 0;
  for (let h = 0; h < herds; h++) {
    const type = rand() < 0.5 ? "cow" : "goat";
    const cnt = type === "cow" ? 3 + randInt(0, 3) : 4 + randInt(0, 4);
    const cx = bx + randInt(-r + 3, r - 3), cy = by + randInt(-r + 3, r - 3);
    for (let i = 0; i < cnt; i++) {
      const s = findSpot(cx, cy, 0, 4, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, type); n++; }
    }
  }
  return n;
}

// 野生总量自然增长（防止猎绝；有上限）
function wildBreedTick() {
  if (world.time % 120 > 1) return;
  const wild = creatures.filter(c => c.isWild() && !c.dead);
  if (wild.length >= SIM.WILD_BREED_CAP || wild.length < 4) return;
  const c = wild[randInt(0, wild.length - 1)];
  const p = findSpot(Math.round(c.x), Math.round(c.y), 0, 3, T.GRASS);
  if (p) spawnCreature(p.x, p.y, c.type);
}

// 狩猎收益
function huntReward(c) {
  return CREATURE_META[c.type].yield;
}
