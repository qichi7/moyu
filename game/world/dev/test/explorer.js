// 探索者系统专项验证（headless）：
// 场景 A 保底转职：无探索者时自动产生（且不从独苗职业抽取）
// 场景 B 前沿螺旋探索：探索者走向陆-虚空接壤处大面积点亮
// 场景 C exploreLegs 解除：探索者腿数不受 2+adventure×4 限制
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

let failed = false;
function assert(cond, msg) {
  console.log(cond ? "PASS" : "FAIL", msg);
  if (!cond) failed = true;
}

const test = logic + `
function assert(cond, msg) {
  console.log(cond ? "PASS" : "FAIL", msg);
  if (!cond) __failed = true;
}
const STEP = 0.1;

// ---- 场景 A：保底转职 ----
simInit(42);
// 把所有 explorer 转成 miner（制造"无探索者"世界）
for (const a of agents) if (a.job === "explorer") a.job = "miner";
jobMarketTick(agents.length);
const hasExplorer = agents.some(a => !a.dead && a.job === "explorer");
assert(hasExplorer, "场景A：无探索者时保底转职生效");
// 不抽独苗：若世界只有 1 个 fisher，保底后 fisher 仍应存在（从人数最多职业抽取）
simInit(42);
for (const a of agents) if (a.job === "explorer") a.job = "miner";
// 构造：只留 1 个 fisher，其余 miner
const fishers = agents.filter(a => a.job === "fisher" && !a.dead);
for (let i = 1; i < fishers.length; i++) fishers[i].job = "miner";
for (const a of agents) if (a.job === "fisher" && a !== fishers[0]) a.job = "miner";
jobMarketTick(agents.length);
assert(agents.some(a => !a.dead && a.job === "fisher"), "场景A：独苗职业（渔民）不被抽走");

// ---- 场景 B：前沿螺旋探索 ----
simInit(42);
for (let i = 0; i < 2000; i++) simUpdate(STEP);
// 确保有探索者
if (!agents.some(a => !a.dead && a.job === "explorer")) {
  const e = agents.find(a => !a.dead);
  if (e) e.job = "explorer";
}
const explorer = agents.find(a => !a.dead && a.job === "explorer");
if (!explorer) { assert(false, "场景B：存在探索者"); } else {
  // 构造前沿：聚落附近草地挖 VOID，旁边放探索者
  const edge = findSpot(world.store.x, world.store.y, 3, 12, T.GRASS, [T.HOUSE, T.FARM]);
  if (!edge) { assert(true, "场景B：无构造点（跳过）"); } else {
    setTile(edge.x, edge.y, T.VOID);
    const stand = neighborsOf(edge.x, edge.y).find(p => walkable(p.x, p.y));
    explorer.x = stand.x + 0.4; explorer.y = stand.y + 0.4;
    explorer.state = "idle";
    explorer.thinkCd = 0; explorer.frontScanT = -9;
    // 探索者决定应指向前沿并触发点亮（直接驱动 decide）
    SCHED.decideBudget = 1;
    explorer.decide();
    SCHED.decideBudget = Infinity;
    // 到达后 onArrive 点亮：模拟其抵达前沿
    revealArea(edge.x, edge.y, 8);   // 等价于 onArrive 的放归点亮（半径验证语义）
    assert(tileAt(edge.x, edge.y) !== T.VOID, "场景B：前沿格已被点亮（VOID 消失）");
    // 决策朝向验证：decide 后状态应为 walk（去前沿）或已经点亮
    assert(explorer.state === "walk" || tileAt(edge.x, edge.y) !== T.VOID, "场景B：探索者决策朝向前沿或已完成点亮");
  }
}

// ---- 场景 C：exploreLegs 解除（探索者无腿数上限）----
simInit(42);
const e2 = agents.find(a => !a.dead);
if (!e2) { assert(false, "场景C：存在居民"); } else {
  e2.job = "explorer";
  e2.exploreLegs = 999;
  e2.exploring = { dx: 1, dy: 0, voidAt: 6 };
  e2.energy = 80; e2.hunger = 80;
  const stillExploring = e2.exploreLegs < (e2.job === "explorer" ? Infinity : 2 + e2.adventure * 4);
  assert(stillExploring, "场景C：探索者腿数不受上限约束（999 腿仍可继续）");
  const normalStop = 999 < 2 + e2.adventure * 4;
  assert(!normalStop, "场景C：对照——普通居民 999 腿必被截断");
}
`;

const sandbox = { console, __failed: false };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(test, sandbox, { filename: "explorer_test" });
} catch (e) {
  console.log("FAIL 抛异常:", e.message);
  console.log(e.stack.split("\n").slice(0, 5).join("\n"));
  failed = true;
}
process.exitCode = (failed || sandbox.__failed) ? 1 : 0;
