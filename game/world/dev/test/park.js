// headless 专项测试：娱乐链与游乐园（v0.5.0：凉亭/戏台/斗兽场/游乐园立项、圈地转浮台、设施补建、游玩闭环）
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

// ---- 工具 ----
function padTo(n) {
  while (agents.length < n) {
    const s = findSpot(world.store.x, world.store.y, 2, 20, T.GRASS);
    if (!s) break;
    spawnAgent(s.x, s.y);
  }
}
function freeze(a) {
  a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
  a.path = null; a.state = "idle"; a.cheerT = 0; a.depressed = false;
  a.home = null; a.hobby = "none"; a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0; a.playCdUntil = 0;
  a.mood = 50; a.hunger = 90; a.energy = 95; a.thirst = 90;
}
function topUp() {
  for (const a of agents) { if (a.hunger < 60) a.hunger = 60; if (a.energy < 40) a.energy = 40; if (a.thirst < 60) a.thirst = 60; }
}
// 在聚落旁构造一块 S×S 的指定 tile 地块（先扫现有，无则强改）
function carveBlock(tile, S, rMax) {
  const s = world.settlements[0];
  for (let r = 3; r <= rMax; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      let ok = true;
      for (let yy = 0; yy < S && ok; yy++) for (let xx = 0; xx < S; xx++) {
        if (tileAt(s.x + dx + xx, s.y + dy + yy) !== tile) { ok = false; break; }
      }
      if (ok) return { x0: s.x + dx, y0: s.y + dy };
    }
  }
  // 强改：找一块无房屋的空地直接铺
  for (let r = 3; r <= rMax; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      let ok = true;
      for (let yy = 0; yy < S && ok; yy++) for (let xx = 0; xx < S; xx++) {
        const t = tileAt(s.x + dx + xx, s.y + dy + yy);
        if (t === T.HOUSE || t === T.DEEP || t === T.VOID) { ok = false; break; }
      }
      if (ok) {
        const x0 = s.x + dx, y0 = s.y + dy;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) setTile(x0 + xx, y0 + yy, tile);
        return { x0, y0 };
      }
    }
  }
  return null;
}

// ===== 1. 数据契约：8 新 tile + 7 新任务 need + 娱乐参数 =====
assert(T.PAVILION === 28 && T.THEATER === 29 && T.ARENA === 30 && T.PARK_GATE === 31 &&
       T.FERRIS === 32 && T.CAROUSEL === 33 && T.COASTER === 34 && T.PIER === 35,
  "数据契约：娱乐 tile 编号 28~35");
assert(TASK_DEFAULT_NEED.GAZEBO === 8 && TASK_DEFAULT_NEED.THEATER === 14 && TASK_DEFAULT_NEED.ARENA === 16 &&
       TASK_DEFAULT_NEED.PARK === 30 && TASK_DEFAULT_NEED.FERRIS === 24 &&
       TASK_DEFAULT_NEED.CAROUSEL === 16 && TASK_DEFAULT_NEED.COASTER === 20,
  "数据契约：7 新任务 TASK_DEFAULT_NEED 就位（死锁 #1 防线）");
assert(SIM.PLAY_MOOD.park === 35 && SIM.PLAY_TIME.park === 8 && SIM.CHEER_TIME === 300 && SIM.MOOD_CHEER_FACTOR === 0.35,
  "数据契约：游玩心情/时长/余韵参数就位");

// ===== 2. 凉亭立项门槛：era1 + pop6 → GAZEBO 任务；建成后再无重复立项 =====
padTo(6);
world.era = 1;
const s0 = world.settlements[0];
plannerTick();
assert(tasks.list.some(t => t.type === "GAZEBO"), "凉亭立项：era1 + pop6 → GAZEBO 任务");
const gz = tasks.list.find(t => t.type === "GAZEBO");
gz.progress = gz.need;
tasksFinish(gz);
assert(tileAt(gz.x, gz.y) === T.PAVILION, "凉亭完工：tile 变 T.PAVILION");
plannerTick();
assert(!tasks.list.some(t => t.type === "GAZEBO"), "凉亭唯一性：同城不再重复立项");

// ===== 3. 戏台/斗兽场：era2 + pop10 → THEATER + ARENA =====
padTo(10);
world.era = 2;
plannerTick();
const th = tasks.list.find(t => t.type === "THEATER");
const ar = tasks.list.find(t => t.type === "ARENA");
assert(!!th && !!ar, "戏台/斗兽场立项：era2 + pop10 → THEATER + ARENA");
th.progress = th.need; tasksFinish(th);
ar.progress = ar.need; tasksFinish(ar);
assert(tileAt(th.x, th.y) === T.THEATER && tileAt(ar.x, ar.y) === T.ARENA, "戏台/斗兽场完工 tile 正确");

// ===== 4. 游乐园：era3 + pop16 → PARK 立项（陆地选址）→ 圈地 → 完工转门楼 =====
padTo(16);
world.era = 3;
const blk = carveBlock(T.GRASS, 3, 16);
assert(!!blk, "游乐园前置：聚落旁构造 3×3 草地");
for (let k = 0; k < 3; k++) plannerTick();   // 给选址扫描机会（设施分支先行不冲突）
const parkTask = tasks.list.find(t => t.type === "PARK");
assert(!!parkTask, "游乐园立项：era3 + pop16 → PARK 任务（全域唯一）");
assert(parkTask.x1 - parkTask.x0 === 2 && parkTask.y1 - parkTask.y0 === 2, "游乐园圈地 3×3");
assert(tileAt(parkTask.gx, parkTask.gy) === T.SITE, "圈地铺 SITE 工地");
// 工人施工到完工
parkTask.progress = parkTask.need;
tasksFinish(parkTask);
assert(tileAt(parkTask.gx, parkTask.gy) === T.PARK_GATE, "游乐园完工：门楼落成");
assert(world.parks.length === 1 && world.parks[0].x === parkTask.gx, "游乐园注册进 world.parks");

// ===== 5. 园区设施补建：摩天轮 → 旋转木马 → 过山车 =====
const rides = ["FERRIS", "CAROUSEL", "COASTER"];
const rideTiles = [T.FERRIS, T.CAROUSEL, T.COASTER];
let allRides = true;
for (let i = 0; i < 3; i++) {
  plannerTick();
  const rt = tasks.list.find(t => t.type === rides[i]);
  if (!rt) { allRides = false; break; }
  rt.progress = rt.need;
  tasksFinish(rt);
  if (tileAt(rt.x, rt.y) !== rideTiles[i]) { allRides = false; break; }
}
assert(allRides, "园区设施补建：摩天轮/旋转木马/过山车逐个落成");
plannerTick();
assert(!tasks.list.some(t => ["FERRIS", "CAROUSEL", "COASTER"].includes(t.type)), "设施齐备后不再立项");

// ===== 6. 水上乐园：PARK(water) 完工把水面格转浮台 PIER（可走）——直接构造（规划器选址先陆后海，陆块充足时轮不到海）=====
world.parks.length = 0;   // 清场
const wblk = carveBlock(T.WATER, 3, 16);
assert(!!wblk, "水上乐园前置：构造 3×3 浅水");
const wx0 = wblk.x0, wy0 = wblk.y0, S = SIM.PARK_SIZE;
const park2 = tasksAdd({ type: "PARK", x: wx0 + 1, y: wy0 + 1,
  x0: wx0, y0: wy0, x1: wx0 + S - 1, y1: wy0 + S - 1, gx: wx0 + 1, gy: wy0 + 1, water: true });
assert(park2.water === true && (park2.waterCells || []).length === 9, "水上乐园：tasksAdd 登记 9 格 waterCells（SITE 铺设）");
assert(tileAt(wx0 + 1, wy0 + 1) === T.SITE, "水上乐园圈地：水格铺成 SITE 工地");
park2.progress = park2.need;
tasksFinish(park2);
let pierOk = true, badCell = null;
for (let yy = wy0; yy <= wy0 + S - 1; yy++) for (let xx = wx0; xx <= wx0 + S - 1; xx++) {
  const tt = tileAt(xx, yy);
  if (tt !== T.PIER && tt !== T.PARK_GATE) { pierOk = false; badCell = xx + "," + yy + "=" + tt; }
}
assert(pierOk && tileAt(wx0 + 1, wy0 + 1) === T.PARK_GATE, "水上乐园完工：水面格全部转为浮台 PIER，门楼居中（" + (badCell ? "异常格 " + badCell : "OK") + "）");
assert(walkable(wx0, wy0) === true, "浮台可行走（居民能走上园区）");

// ===== 7. 游玩闭环：凉亭旁 mood+12；游乐园 mood+35 且 cheerT=300 =====
world.parks.length = 0;   // 清场：水上乐园门楼（浮台孤悬海上不可达）会抢走 mood<50 的游园优先权
world.settlements.forEach(s => ensureStock(s).food = 500);   // 补粮：粮荒门（totalFood > pop×2）会关闭游玩分支
const pA = agents[0];
freeze(pA);
const gSpot = findSpot(Math.round(pA.x), Math.round(pA.y), 1, 8, T.GRASS) || { x: Math.round(pA.x), y: Math.round(pA.y) };
setTile(gSpot.x, gSpot.y, T.PAVILION);   // 手工放凉亭（设施检索目标）
pA.x = gSpot.x + 3.5; pA.y = gSpot.y + 0.5;   // 3 格外（给寻路留余量）
pA.mood = 40; pA.thinkCd = 0;
simUpdate(STEP);
assert(pA.state === "walk" || pA.state === "play", "游玩决策：mood<45 → 动身去凉亭（或已到入场）");
let playOk = pA.state === "play" && pA.playKind === "gazebo";
for (let i = 0; i < 200 && !playOk; i++) {
  topUp();
  world.time = world.time - (world.time % 90) + 20;   // 强制白天（夜晚分支 1 会先入睡，游玩语义被遮蔽——节律测试归 mood.js）
  simUpdate(STEP);
  playOk = pA.state === "play" && pA.playKind === "gazebo";
}
assert(playOk, "到达设施：进入 play 态（gazebo）");
if (playOk) {
  const m0 = pA.mood;
  pA.playWait = 0.01;
  simUpdate(STEP);
  assert(pA.mood >= m0 + 11, "凉亭结算：mood +12（" + pA.mood.toFixed(1) + "）");
  assert(pA.playCdUntil > world.time - 1, "游玩冷却 PLAY_CD 生效");
}
// 游乐园结算：mood+35 + cheerT
const pB = agents[1];
freeze(pB); pB.state = "play"; pB.playKind = "park"; pB.playWait = 0.01; pB.mood = 40;
simUpdate(STEP);
assert(pB.mood >= 74 && pB.cheerT === SIM.CHEER_TIME, "游乐园结算：mood +35 且 cheerT=300（" + pB.mood.toFixed(1) + "）");

console.log("---- park.js 断言结束 ----");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "park.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
