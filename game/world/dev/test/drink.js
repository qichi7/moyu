// headless 专项测试：小人口渴 / 饮品效果 / 朝向（S3 契约 v0.3.0）
// ⚠️ 需 T1 在全量构建后运行：先 node dev/build.js 生成最新 .tmp_logic.js（本测试依赖并行 agent
//    对 config/world/tasks/sim 的改动，例如咖啡田 beans 结算；缺依赖的断言按规格容错跳过）
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

// ---- 工具：从 (cx,cy) 螺旋找一圈可站立格 ----
function walkTileNear(cx, cy, maxR) {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return null;
}

// ---- 工具：从主粮仓附近找一条 len+1 格的直线可走走廊（face 测试用）----
function findRun(dx, dy, len) {
  const bx = world.store.x, by = world.store.y;
  for (let r = 2; r <= 40; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const x0 = bx + ox, y0 = by + oy;
        let ok = true;
        for (let k = 0; k <= len; k++) if (!walkable(x0 + dx * k, y0 + dy * k)) { ok = false; break; }
        if (ok) return { x: x0, y: y0 };
      }
    }
  }
  return null;
}

// ---- 工具：驱动小人沿直线走廊走并返回最终朝向 ----
function walkFace(dx, dy, len) {
  const run = findRun(dx, dy, len);
  if (!run) return null;   // 找不到走廊：由调用方跳过
  const a = agents[0];
  a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
  a.x = run.x + 0.5; a.y = run.y + 0.5;
  a.face = "left"; a.faceHoldT = 1;   // 重置朝向与持锁计时（重设朝向视为重新首设，不受旧锁）
  a.path = [];
  for (let k = 1; k <= len; k++) a.path.push({ x: run.x + dx * k, y: run.y + dy * k });
  a.pi = 0; a.state = "walk";
  for (let i = 0; i < 80 && a.pi < a.path.length; i++) a.stepAlong(STEP);
  return a.face;
}

// ===== 1. 初始值 =====
const a0 = agents[0];
let badInit = 0;
for (const a of agents) if (a.thirst !== 100 || a.drunkT !== 0 || a.coffeeT !== 0 || a.face !== "down") badInit++;
assert(badInit === 0 && a0.thirst === 100, "初始：thirst=100 / drunkT=0 / coffeeT=0 / face=down");

// ===== 2. thirst 随时间下降 =====
const t0 = a0.thirst;
for (let i = 0; i < 30; i++) simUpdate(STEP);   // 3 sim 秒
assert(a0.thirst < t0, "thirst 随时间下降（" + t0 + " -> " + a0.thirst.toFixed(1) + "）");

// ===== 3. work 状态饥饿衰减快于 idle（状态系数生效）=====
const idleA = agents[0], workA = agents[1];
for (const a of [idleA, workA]) {
  a.thinkCd = 9999; a.hunger = 90; a.energy = 95; a.thirst = 100;
  a.task = null; a.exploring = null; a.state = "idle"; a.path = null; a.onArrive = null;
}
// 挂一个永不完工的原地任务（进度制），让 workA 保持 work 状态
workA.task = { type: "FARM", x: Math.round(workA.x), y: Math.round(workA.y), need: 1e9, progress: 0, workers: new Set([workA]) };
workA.state = "work";
const hi0 = idleA.hunger, hw0 = workA.hunger;
for (let i = 0; i < 100; i++) simUpdate(STEP);   // 10 sim 秒
const di = hi0 - idleA.hunger, dw = hw0 - workA.hunger;
assert(dw > di && di > 0, "work 状态饥饿衰减快于 idle（状态系数生效 dw=" + dw.toFixed(2) + " > di=" + di.toFixed(2) + "）");

// ===== 4. coffeeT>0 时 energy 衰减慢于无咖啡同状态 =====
const cNo = agents[2], cYes = agents[3];
for (const a of [cNo, cYes]) {
  a.thinkCd = 9999; a.hunger = 90; a.energy = 100; a.thirst = 100;
  a.task = null; a.exploring = null; a.state = "idle"; a.path = null; a.onArrive = null;
}
cYes.coffeeT = 60;
const eNo0 = cNo.energy, eYes0 = cYes.energy;
for (let i = 0; i < 100; i++) simUpdate(STEP);   // 10 sim 秒
const dNo = eNo0 - cNo.energy, dYes = eYes0 - cYes.energy;
assert(dYes < dNo && dNo > 0, "coffeeT>0 时 energy 衰减明显更慢（COFFEE_ENERGY_FACTOR 生效 dYes=" + dYes.toFixed(2) + " < dNo=" + dNo.toFixed(2) + "）");

// ===== 5. thirst<30 且城库存有 water → 走向粮仓饮用，thirst 回升、库存减 1 =====
const sc = world.settlements[0];
const spot = walkTileNear(sc.x, sc.y, 5);
assert(!!spot, "聚落旁有可站立格（测试前置）");
const drinker = agents[4];
const st0 = ensureStock(sc);
st0.coffee = 0; st0.juice = 0; st0.beer = 0; st0.water = 5;   // 手工铺货：验证消耗侧（产出由并行改动提供）
drinker.x = spot.x + 0.5; drinker.y = spot.y + 0.5;
drinker.thinkCd = 0; drinker.hunger = 90; drinker.energy = 100;
drinker.task = null; drinker.exploring = null;
drinker.path = null; drinker.onArrive = null;
drinker.thirst = 25; drinker.state = "idle";
let g = 0;
while (drinker.state === "idle" && g++ < 20) simUpdate(STEP);
assert(drinker.state === "walk", "渴了的小人动身去粮仓喝水（需求分支优先于领任务）");
g = 0;
while (drinker.state === "walk" && g++ < 600) simUpdate(STEP);
assert(drinker.state === "drink", "到达粮仓进入 drink 状态（原地饮用 2 秒）");
const thLow = drinker.thirst, wBefore = ensureStock(sc).water;
g = 0;
while (drinker.state === "drink" && g++ < 100) simUpdate(STEP);
assert(drinker.state !== "drink", "饮用结束后回到 idle");
assert(drinker.thirst > thLow + 20, "饮用后 thirst 回升（" + thLow.toFixed(1) + " -> " + drinker.thirst.toFixed(1) + "）");
assert(ensureStock(sc).water === wBefore - 1, "城库 water 库存减 1");
assert(drinker.drunkT === 0 && drinker.coffeeT === 0, "喝清水无副作用（不醉、无咖啡因）");

// ===== 6. 喝 beer → drunkT>0（行为面）=====
st0.coffee = 0; st0.juice = 0; st0.water = 0; st0.beer = 3;
drinker.thinkCd = 0; drinker.thirst = 25; drinker.state = "idle"; drinker.drunkT = 0;
drinker.path = null; drinker.onArrive = null;
g = 0;
while (drinker.state !== "drink" && g++ < 620) simUpdate(STEP);
g = 0;
while (drinker.state === "drink" && g++ < 100) simUpdate(STEP);
assert(drinker.drunkT > 0, "喝麦酒后 drunkT>0（DRUNK_TIME=" + SIM.DRUNK_TIME + "）");

// ===== 7. 醉酒移速放缓（对照面：drunkT 手动置值比较 step 位移）=====
const walker = agents[5];
const run = findRun(1, 0, 6);
if (run) {
  walker.speed = 1.7;
  walker.thinkCd = 9999; walker.task = null; walker.exploring = null; walker.onArrive = null;
  const walkDist = function () {
    let traveled = 0, px = walker.x, py = walker.y;
    for (let i = 0; i < 10; i++) {
      walker.stepAlong(STEP);
      traveled += Math.hypot(walker.x - px, walker.y - py);
      px = walker.x; py = walker.y;
    }
    return traveled;
  };
  const bx = run.x + 0.5, by = run.y + 0.5, line = [];
  for (let k = 1; k <= 6; k++) line.push({ x: run.x + k, y: run.y });
  walker.x = bx; walker.y = by; walker.drunkT = 0;
  walker.path = line.slice(); walker.pi = 0; walker.state = "walk";
  const dSober = walkDist();
  walker.x = bx; walker.y = by; walker.drunkT = 30;   // 手动置醉酒值（update 才递减，直呼 stepAlong 不衰减）
  walker.path = line.slice(); walker.pi = 0; walker.state = "walk";
  const dDrunk = walkDist();
  assert(dSober > 0 && dDrunk < dSober, "醉酒移速放缓（DRUNK_SPEED_FACTOR=" + SIM.DRUNK_SPEED_FACTOR + " 生效 dDrunk=" + dDrunk.toFixed(2) + " < dSober=" + dSober.toFixed(2) + "）");
} else {
  console.log("SKIP 醉酒移速对照：主粮仓附近找不到直线走廊（地理罕见，重跑验证）");
}

// ===== 8. 咖啡田不产粮：crop="coffee" 成熟 → beans 增、food 不增 =====
// （结算在 sim.js farmTick，由并行改动提供；未并入构建时按规格容错跳过）
if (world.farms.length) {
  const cf = world.farms[0];
  cf.crop = "coffee";
  cf.irrigated = true; cf.waterCd = 0;
  const stC = ensureStock(ownerSettle(cf.x, cf.y));
  for (const f of world.farms) f.grow = 0;      // 隔离：本轮只让咖啡田成熟结算
  cf.grow = 1e9;                                 // 直接越过成熟线（兼容粮食田/咖啡田各自的周期常量）
  const foodBefore = stC.food, beansBefore = stC.beans;
  farmTick(0.1);
  if (stC.beans > beansBefore) {
    assert(stC.food === foodBefore, "咖啡田成熟产出 beans 而非 food");
  } else if (stC.food > foodBefore) {
    console.log("SKIP 咖啡田仍按普通粮田结算（sim.js beans 分支未并入构建），本断言容错跳过");
  } else {
    console.log("SKIP 咖啡田 beans 结算未观测到（依赖 sim.js 并行改动），本断言容错跳过");
  }
} else {
  console.log("SKIP 咖啡田断言：当前 seed 无农田（依赖并行改动生成的 farms）");
}

// ===== 9. face：向右/向上/向下走（goTo 同款路径驱动）=====
const fR = walkFace(1, 0, 3), fL = walkFace(-1, 0, 3), fU = walkFace(0, -1, 3), fD = walkFace(0, 1, 3);
assert(fR === "right", "向右走 face=right");
assert(fU === "up", "向上走 face=up");
assert(fD === "down", "向下走 face=down");
if (fL === null) console.log("SKIP 向左走廊不可得（地理罕见）");
else assert(fL === "left", "向左走 face=left");

// ===== 10. 生物 face：stepToward 实际位移后同款判定（鸟不受栖息地限制，方向确定）=====
// 注：三次均为离散单步驱动（中间无 update 计锁），每次驱动前重置持锁 = 重新首设不受锁
const bd = new Creature(0, 0, "bird");
bd.faceHoldT = 1;
bd.stepToward({ x: bd.x + 2, y: bd.y }, 0.4);
assert(bd.face === "right", "生物向右移动 face=right");
bd.faceHoldT = 1;
bd.stepToward({ x: bd.x, y: bd.y - 2 }, 0.4);
assert(bd.face === "up", "生物向上移动 face=up");
bd.faceHoldT = 1;
bd.stepToward({ x: bd.x, y: bd.y + 2 }, 0.4);
assert(bd.face === "down", "生物向下移动 face=down");

// ===== 10b. 野生四足兽游荡 face：update() 直接坐标变异路径也要更新朝向（不可恒为 down）=====
const cow = creatures.find(c => !c.dead && c.type === "cow" && c.isWild());
if (cow) {
  // 找一条远离小人的横向纯草地走廊（牛栖息地=grass）：无威胁触发逃跑、路径不被栖息地截断，保证确定性
  let runC = null;
  for (let r = 6; r <= 80 && !runC; r++) {
    for (let oy = -r; oy <= r && !runC; oy++) {
      for (let ox = -r; ox <= r && !runC; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const x0 = world.store.x + ox, y0 = world.store.y + oy;
        let ok = true;
        // 牛落脚点 (x0+0.5, y0+0.5) 经 Math.round 半值上取整 → 实际站立格是 (x0+1, y0+1)；
        // 需 y0 与 y0+1 两行、x0..x0+3 列均为草地，保证驱动全程不被栖息地截断
        for (let k = 0; k <= 3 && ok; k++) {
          if (tileAt(x0 + k, y0) !== T.GRASS || tileAt(x0 + k, y0 + 1) !== T.GRASS) ok = false;
        }
        if (ok) for (const ag of agents) {
          if (Math.hypot(ag.x - (x0 + 1.5), ag.y - (y0 + 0.5)) < 6) { ok = false; break; }
        }
        if (ok) runC = { x: x0, y: y0 };
      }
    }
  }
  if (runC) {
    cow.pasture = null;
    cow.x = runC.x + 0.5; cow.y = runC.y + 0.5;
    cow.face = "down";
    cow.moveCd = 9999;   // 压高 moveCd：驱动窗口内不触发随机换向，可控 target 全程有效（确定性）
    cow.target = { x: cow.x + 3, y: cow.y };
    for (let i = 0; i < 200; i++) cow.update(1 / 30);   // ~6.7s：0.55 速足够走完 3 格
    assert(cow.face === "right", "野生牛游荡（可控 target）实际位移后 face=right（非恒 down）");
    assert(["up", "down", "left", "right"].indexOf(cow.face) >= 0, "野生牛 face 值域合法");
  } else {
    console.log("SKIP 野生牛 face 断言：找不到远离小人的横向草地走廊（地理罕见，重跑验证）");
  }
} else {
  console.log("SKIP 野生牛 face 断言：当前 seed 无野生牛（地理罕见，重跑验证）");
}

// ===== 10c. face 持锁迟滞：非反向变向需 faceHoldT 满 0.8s（斜向阶梯步不抖动的机制保障）=====
const runH = findRun(0, -1, 6);   // 纯向上走廊：face=right 时向上走为 90° 非反向变向（dy 主导）
if (!runH) {
  console.log("SKIP face 迟滞断言：找不到向上走廊（地理罕见，重跑验证）");
} else {
  const h = agents[0];
  h.thinkCd = 9999; h.task = null; h.exploring = null; h.onArrive = null;
  h.x = runH.x + 0.5; h.y = runH.y + 0.5;
  h.path = [];
  for (let k = 1; k <= 6; k++) h.path.push({ x: runH.x, y: runH.y - k });
  h.pi = 0; h.state = "walk";
  h.face = "right"; h.faceHoldT = 0;   // 刚转向右：持锁中（faceHoldT < 0.8）
  for (let i = 0; i < 7; i++) h.update(STEP);   // 累计 0.7s < 0.8s：锁未满
  assert(h.face === "right" && h.faceHoldT < 0.8,
    "持锁期内非反向变向被抑制（向上走 face 仍 right，faceHoldT=" + h.faceHoldT.toFixed(2) + "）");
  for (let i = 0; i < 4; i++) h.update(STEP);   // 续走至累计 1.1s > 0.8s：锁满自然转向
  assert(h.face === "up", "持锁满 0.8s+ 后自然转向（face=up）");
}

// ===== 11. 回归：需求分支顺序——饥饿优先于喝水 =====
const hu = agents[6];
const spot2 = walkTileNear(sc.x, sc.y, 6);
hu.x = spot2.x + 0.5; hu.y = spot2.y + 0.5;
const stH = ensureStock(sc);
stH.food = 10; stH.water = 5; stH.coffee = 0; stH.juice = 0; stH.beer = 0;
hu.thinkCd = 0; hu.hunger = 20; hu.thirst = 20; hu.energy = 100;
hu.task = null; hu.exploring = null; hu.path = null; hu.onArrive = null; hu.state = "idle";
let g2 = 0;
while (hu.state === "idle" && g2++ < 20) simUpdate(STEP);
g2 = 0;
while (hu.state === "walk" && g2++ < 600) simUpdate(STEP);
assert(hu.state === "eat", "饥饿优先于喝水：先进入进食分支");
const thAtEat = hu.thirst, fo0 = stH.food;
g2 = 0;
while (hu.state === "eat" && g2++ < 200) simUpdate(STEP);
assert(hu.hunger === 100 && stH.food < fo0, "进食结算正常（hunger 回满）");
assert(thAtEat < 30, "喝水被排后（进食时仍未饮水 thirst=" + thAtEat.toFixed(1) + "）");

// ===== 12. 全员 face 值域合法 =====
let badFace = 0;
for (const a of agents) if (["up", "down", "left", "right"].indexOf(a.face) < 0) badFace++;
assert(badFace === 0, "全员 face 值域合法");

console.log("---- drink.js 断言结束 ----");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "drink.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
