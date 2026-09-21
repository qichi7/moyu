// headless 专项测试：物种大扩充（v0.5.0：新物种表/栖息地/驯化泛化/珍稀渔获喜悦/月光花光环/上限守卫）
// 加载模式照抄 smoke.js：vm 注入 .tmp_logic.js（需先 node dev/build.js）
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

const test = `
${logic}

// ===== 测试主体 =====
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

const STEP = 0.1;
simInit(42);

// ---- 工具：把小人放到指定可站立格旁 ----
function park(a, x, y) {
  for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (walkable(x + dx, y + dy)) { a.x = x + dx + 0.5; a.y = y + dy + 0.5; return true; }
  }
  return false;
}
function freeze(a) {
  a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
  a.path = null; a.state = "idle"; a.cheerT = 0; a.depressed = false;
  a.home = null; a.hobby = "none"; a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0;
}
function topUp() {
  for (const a of agents) { if (a.hunger < 60) a.hunger = 60; if (a.energy < 40) a.energy = 40; if (a.thirst < 60) a.thirst = 60; }
}

// ===== 1. 数据契约：新物种 META / 寿命表 / 上限表齐备 =====
const NEW = ["rabbit", "fox", "bear", "horse", "penguin", "crab", "dolphin", "shark",
  "unicorn", "moonfish", "koi", "phoenix", "fairy", "mermaid"];
let badMeta = 0;
for (const t of NEW) {
  if (!CREATURE_META[t]) badMeta++;
  if (!SPECIES_AGE[t]) badMeta++;
  if (SIM.SPECIES_CAP[t] === undefined && t !== "phoenix" && t !== "fairy") badMeta++;
}
assert(badMeta === 0, "数据契约：14 新物种 META + 寿命表 + 上限表齐备");
assert(CREATURE_META.dog.tamable === true && CREATURE_META.unicorn.tamable === true &&
       CREATURE_META.unicorn.tameJoy === 25 && CREATURE_META.dog.tameJoy === 15,
  "驯化泛化：dog/unicorn tamable，tameJoy 25/15");
assert(CREATURE_META.phoenix.flier === true && CREATURE_META.fairy.flier === true &&
       CREATURE_META.bird.flier === true, "飞行泛化：bird/phoenix/fairy flier 标记");
assert(CREATURE_META.moonfish.fishJoy === 25 && CREATURE_META.koi.fishJoy === 15,
  "珍稀渔获：moonfish/koi fishJoy 25/15");

// ===== 2. 栖息地：sand 栖息带 + 各物种 habitatOk =====
const sandT = { type: "penguin" }, waterT = { type: "koi" };
assert(habitatOk(sandT, 0, 0) === (tileAt(0, 0) === T.SAND), "栖息地：penguin 只认沙滩");
assert(habitatOk(waterT, 0, 0) === (tileAt(0, 0) === T.WATER), "栖息地：koi 只认浅水");
// 在主岛附近扫一块真实沙滩验证
let sandSpot = null;
for (let y = -30; y <= 30 && !sandSpot; y++) for (let x = -30; x <= 30; x++) {
  if (tileAt(x, y) === T.SAND) { sandSpot = { x, y }; break; }
}
assert(sandSpot ? habitatOk(sandT, sandSpot.x, sandSpot.y) : true, "栖息地：真实沙滩格企鹅栖息 OK");

// ===== 3. 初始世界真实生成：兔/狐等常规物种在场，植物 tile 落地 =====
revealArea(world.store.x, world.store.y, 46);
const types = {};
for (const c of creatures) types[c.type] = (types[c.type] || 0) + 1;
assert((types.rabbit || 0) > 0, "初始生成：兔群已在岛上（" + (types.rabbit || 0) + " 只）");
assert((types.cow || 0) > 0 && (types.goat || 0) > 0, "初始生成：牛羊兽群照旧");
function findTileNear(want, R) {
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (tileAt(x, y) === want) return { x, y };
  return null;
}
const bamboo = findTileNear(T.BAMBOO, 60), mushroom = findTileNear(T.MUSHROOM, 60);
assert(!!bamboo, "初始生成：竹林落地（hash 散布）");
assert(!!mushroom, "初始生成：蘑菇落地（hash 散布）");

// ===== 4. 上限守卫：生成侧不超过 SPECIES_CAP =====
for (let i = 0; i < 6000; i++) { topUp(); simUpdate(STEP); }   // 600s 让世界扩张
let overCap = [];
for (const [type, cap] of Object.entries(SIM.SPECIES_CAP)) {
  const n = creatures.filter(c => c.type === type && !c.dead).length;
  if (type === "fish" ? n > cap + 30 : n > cap) overCap.push(type + "=" + n + "/" + cap);   // fish 含圈养
}
assert(overCap.length === 0, "上限守卫：各物种未超 SPECIES_CAP（" + (overCap.join(",") || "全部合规") + "）");
assert(creatures.length < 500, "总量护栏：生物总数 < 500（实际 " + creatures.length + "）");

// ===== 5. 驯化泛化：独角兽驯化 → 认主 + 喜悦 +25 =====
const uA = agents[0];
freeze(uA); uA.hobby = "animal"; uA.mood = 50;
// 生成在真草地（小人可能站在 PATH/SITE 上——独角兽 habitat 只认 GRASS/SAND，站上去会搁浅锁死驯化）
const uniSpot = findSpot(Math.round(uA.x), Math.round(uA.y), 0, 4, T.GRASS) || { x: Math.round(uA.x), y: Math.round(uA.y) };
const uni = spawnCreature(uniSpot.x, uniSpot.y, "unicorn");
let tamed = false;
for (let i = 0; i < 120 && !tamed; i++) {
  topUp(); uA.mood = 50;
  uA.x = uni.x; uA.y = uni.y;   // 贴身跟随（独角兽会游荡走开，1.5 格驯化半径要求贴身）
  simUpdate(STEP);
  tamed = uni.tamed && uni.owner === uA;
}
assert(tamed, "独角兽驯化：贴身累计驯化度（animal ×2 速率）认定主人");
assert(uA.mood > 74, "驯化的喜悦：独角兽 +25（mood=" + uA.mood.toFixed(1) + "）");
assert(uni.type === "unicorn" && uni.tamed, "驯化后跟随主人（tamable 通用路径）");

// ===== 6. 狗驯化喜悦 +15（回归：老路径数值不被泛化改写）=====
const dA = agents[1];
freeze(dA); dA.hobby = "none"; dA.mood = 50;
const dogSpot = findSpot(Math.round(dA.x), Math.round(dA.y), 0, 4, T.GRASS) || { x: Math.round(dA.x), y: Math.round(dA.y) };
const dog = spawnCreature(dogSpot.x, dogSpot.y, "dog");
let dogTamed = false;
for (let i = 0; i < 200 && !dogTamed; i++) {
  topUp(); dA.mood = 50;
  dA.x = dog.x; dA.y = dog.y;   // 贴身跟随
  simUpdate(STEP);
  dogTamed = dog.tamed && dog.owner === dA;
}
assert(dogTamed && dA.mood > 64 && dA.mood < 66, "狗驯化：喜悦 +15（mood=" + dA.mood.toFixed(1) + "）");

// ===== 7. 珍稀垂钓：FISH 完工时钓到锦鲤 → 渔获 + mood +15 + 纪事 =====
const fA = agents[2];
freeze(fA); fA.hobby = "fishing"; fA.mood = 50;
// 找「带可站立邻格」的水格（纯水格四周可能全是水，站不上去钓不了）
const koiSpot = (function () {
  for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) {
    if (tileAt(x, y) !== T.WATER) continue;
    if (neighborsOf(x, y).some(p => walkable(p.x, p.y))) return { x, y };
  }
  return null;
})();
assert(!!koiSpot, "珍稀垂钓前置：找到邻陆浅水格");
const koi = spawnCreature(koiSpot.x, koiSpot.y, "koi");
const fNb = neighborsOf(koiSpot.x, koiSpot.y).find(p => walkable(p.x, p.y));
assert(!!fNb, "珍稀垂钓前置：水边有可站立格");
if (fNb) {
  fA.x = fNb.x + 0.5; fA.y = fNb.y + 0.5;
  const fishTask = { type: "FISH", x: fNb.x, y: fNb.y, fishX: koiSpot.x, fishY: koiSpot.y, need: 0.1, progress: 0, workers: new Set([fA]) };
  fA.task = fishTask; fA.state = "work";
  simUpdate(STEP);   // 0.1s：effort ≥ 0.1 → 完工 → tasksFinish 珍稀分支
  assert(fA.mood > 64, "钓到锦鲤：mood +15（" + fA.mood.toFixed(1) + "）");
  assert(koi.dead, "珍稀鱼被钓走（消耗）");
  assert(world.logs.some(l => l.text.includes("锦鲤")), "纪事：钓到珍稀锦鲤");
}

// ===== 8. 月光花夜光环：夜晚花旁 mood 缓慢回复 =====
const bA = agents[3];
freeze(bA); bA.mood = 40;
const bloomTile = findTileNear(T.MOONBLOOM, 46);
if (!bloomTile) { assert(true, "月光花光环：本图无月光花（跳过）"); } else {
  assert(park(bA, bloomTile.x, bloomTile.y), "月光花旁有可站立格");
  world.time = world.time - (world.time % 90) + 82;   // 调到深夜
  for (let i = 0; i < 60; i++) { topUp(); bA.mood = 40; simUpdate(STEP); }   // 6s
  assert(bA.mood > 40, "月光花夜光环：mood 缓慢回复（" + bA.mood.toFixed(2) + " > 40）");
}

// ===== 9. 海豚追随船只（行为存在性：构造航船，海豚靠近）=====
const dp = spawnCreature(koiSpot.x, koiSpot.y, "dolphin");
const sailorA = agents[4];
world.ships.push({ x: koiSpot.x + 3.5, y: koiSpot.y + 0.5, ang: 0, sailor: null, state: "sailing", prov: 100, dist: 0, revealCd: 9 });
const shipD = world.ships[world.ships.length - 1];
let approached = 999;
for (let i = 0; i < 100; i++) { simUpdate(STEP); approached = Math.min(approached, Math.hypot(dp.x - shipD.x, dp.y - shipD.y)); }
assert(approached < 3.5, "海豚追随航船（最近距离 " + approached.toFixed(1) + " 格）");
world.ships.splice(world.ships.indexOf(shipD), 1);

// ===== 10. 稳定性：3000s 采样无 NaN =====
let bad = 0;
for (let i = 0; i < 30000; i++) {
  topUp(); simUpdate(STEP);
  if (i % 1000 === 0) {
    for (const c of creatures) {
      if (isNaN(c.x) || isNaN(c.y) || isNaN(c.age)) { bad++; break; }
    }
  }
}
assert(bad === 0, "稳定性：3000s 采样生物坐标/年龄无 NaN");

console.log("---- species.js 断言结束 ----");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "species.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
