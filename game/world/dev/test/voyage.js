// 航海补给系统专项验证（headless）：
// 场景 A 满载出海 → 预留返航 → 安全靠岸，全程不被困
// 场景 B 低补给出海 → 归途被困 → 呼救 → 救援船会合补给 → 平安返航
const vm = require("vm");
const path = require("path");
const fs = require("fs");

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

// 码头选址：岛缘水格 + 存在一个方向 3 格内开阔（贴近 startVoyage 出港条件）
function findDock() {
  for (let r = 1; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = world.store.x + dx, y = world.store.y + dy;
      if (tileAt(x, y) !== T.WATER) continue;
      const land = neighborsOf(x, y).find(p => walkable(p.x, p.y));
      if (!land) continue;
      for (let k = 0; k < 24; k++) {
        const tAng = rand() * Math.PI * 2;
        let open = true;
        for (let d = 1.5; d <= 8; d += 0.5) {   // 8 格开阔水道：让船真正出海
          const t = tileAt(Math.round(x + Math.cos(tAng) * d), Math.round(y + Math.sin(tAng) * d));
          if (t !== T.VOID && t !== T.DEEP && t !== T.WATER) { open = false; break; }
        }
        if (open) return { land, water: { x, y } };
      }
    }
  }
  return null;
}

// ---- 场景 A：满载出海，预留返航 ----
simInit(42);
for (let i = 0; i < 3000; i++) simUpdate(STEP);   // 300s 世界预热
world.settlements.forEach(function (s) { ensureStock(s).food = 1000; });   // 保证满载（粮食城市内共享）
world.settlements.forEach(function (s) { ensureStock(s).wood = 100; });   // 保证造船木材
revealArea(world.store.x, world.store.y, 50);      // 先探明母港周边地形（reveal 会把 WATER 重算为 DEEP，必须先探明再选址）
const a1 = agents.find(x => !x.dead && (x.job === "explorer" || x.hobby === "explore") && x.adventure > 0.4);
if (!a1) { assert(false, "场景A：找到高探索欲居民"); } else {
  assert(true, "场景A：找到高探索欲居民 " + a1.name);
  const dk = findDock();
  assert(!!dk, "场景A：母港旁可设开阔水码头");
  const dock = dk.land;
  world.docks.push(dock);
  a1.x = dock.x + 0.5; a1.y = dock.y + 0.5;
  a1.state = "idle"; a1.task = null;
  a1.startVoyage(dock);
  const ship1 = world.ships[world.ships.length - 1];
  assert(ship1 && ship1.sailor === a1 && a1.state === "voyage", "场景A：登船出海（voyage 状态）");
  assert(ship1.prov === SIM.SHIP_PROVISION_LOAD, "场景A：满载补给 " + ship1.prov + "/" + SIM.SHIP_PROVISION_LOAD);
  // 驱动模拟直到靠岸或超时
  let minProv = ship1.prov, everStranded = false, docked = false;
  for (let i = 0; i < 20000; i++) {
    simUpdate(STEP);
    if (ship1.state === "stranded") everStranded = true;
    minProv = Math.min(minProv, ship1.prov);
    if (ship1.state === "docked" || !ship1.sailor || ship1.sailor.dead) { docked = ship1.state === "docked"; break; }
  }
  assert(!everStranded, "场景A：满载全程未被补给困住");
  assert(minProv > 0, "场景A：预留返航生效（全程补给余量 > 0，最低 " + minProv.toFixed(1) + "）");
  assert(docked && !a1.voyaging, "场景A：最终安全靠岸（docked，水手下船）");
}

// ---- 场景 B：低补给出海 → 被困 → 救援 ----
simInit(42);
for (let i = 0; i < 3000; i++) simUpdate(STEP);
world.settlements.forEach(function (s) { ensureStock(s).food = 12; });   // 只够装 12 粮
world.settlements.forEach(function (s) { ensureStock(s).wood = 100; });   // 保证造船木材
revealArea(world.store.x, world.store.y, 50);      // 先探明再选址
const a2 = agents.find(x => !x.dead && (x.job === "explorer" || x.hobby === "explore") && x.adventure > 0.4);
const dk2 = findDock();
const dock2 = dk2.land;
world.docks.push(dock2);
a2.x = dock2.x + 0.5; a2.y = dock2.y + 0.5;
a2.startVoyage(dock2);
const ship2 = world.ships[world.ships.length - 1];
assert(ship2 && ship2.state === "sailing" && ship2.prov === 12, "场景B：少装出海（补给 12/40，航行中）");
// 预留返航验证（确定性）：瞬移 60 格外远海再压低补给——余量 < 回程所需即应调头
ship2.x = world.store.x + 60; ship2.y = world.store.y + 3;
ship2.prov = 1.5;
let turnedBack = false;
for (let i = 0; i < 50; i++) {
  simUpdate(STEP);
  if (ship2.state === "return") { turnedBack = true; break; }
}
assert(turnedBack, "场景B：补给不足 → 预留返航机制触发（调头）");
// ship2 补给不足以走完归途（0.5 粮 < 5 格所需 0.75），会自行被困呼救干扰后续断言——验证完预留返航即清场
world.ships.splice(world.ships.indexOf(ship2), 1);
// 第二次出海构造"补给归零被困"：瞬移远海 + 极低补给，下一 tick 直接触发搁浅判定（无归途撞岛窗口）
a2.x = dock2.x + 0.5; a2.y = dock2.y + 0.5;
a2.startVoyage(dock2);
const ship3 = world.ships[world.ships.length - 1];
assert(ship3 && ship3 !== ship2 && ship3.state === "sailing", "场景B：水手再次出港");
ship3.x = world.store.x + 60; ship3.y = world.store.y + 3;
ship3.prov = 0.01;   // 60 格返航需 11.7 粮，0.01 粮下步即归零
let stranded = false;
for (let i = 0; i < 400; i++) {
  simUpdate(STEP);
  if (ship3.state === "stranded") { stranded = true; break; }
  if (!ship3.sailor || ship3.sailor.dead) break;
}
assert(stranded, "场景B：低补给船耗尽 → 被困海上");
assert(a2.state === "voyage" && !a2.dead, "场景B：被困水手存活（航海需求冻结生效）");
// 救援：粮池不足时应待命，补足后应派出
world.settlements.forEach(function (s) { ensureStock(s).food = 5; });
for (let i = 0; i < 200; i++) simUpdate(STEP);
assert(!world.ships.some(s => s.state === "rescue"), "场景B：粮草不足时救援船待命");
world.settlements.forEach(function (s) { ensureStock(s).food = 500; });
let rescue = null;
for (let i = 0; i < 200; i++) {
  simUpdate(STEP);
  rescue = world.ships.find(s => s.state === "rescue");
  if (rescue) break;
}
assert(!!rescue && rescue.target === ship3, "场景B：粮草充足后救援船出港（target 指向被困船）");
// 跑到会合 + 返航靠岸
let reunited = false, safeHome = false;
for (let i = 0; i < 20000; i++) {
  simUpdate(STEP);
  if (ship3.state === "return" && ship3.prov > 12) reunited = true;
  if (reunited && (ship3.state === "docked" || !ship3.sailor || ship3.sailor.dead)) { safeHome = ship3.state === "docked"; break; }
}
assert(reunited, "场景B：救援会合，补给送达（补给已补充）");
assert(ship3.prov > 0 || ship3.state === "docked", "场景B：被困船获得返航物资（prov=" + (ship3.prov || 0).toFixed(1) + "）");
assert(safeHome && !a2.voyaging && !a2.dead, "场景B：水手平安归航（docked，存活）");
// 救援船自己也应归航
if (rescue) {
  for (let i = 0; i < 20000; i++) {
    simUpdate(STEP);
    if (rescue.state === "docked") break;
  }
  assert(rescue.state === "docked", "场景B：救援船完成任务后归航");
}
`;

const sandbox = { console, __failed: false };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(test, sandbox, { filename: "voyage_test" });
} catch (e) {
  console.log("FAIL 抛异常:", e.message);
  console.log(e.stack.split("\n").slice(0, 5).join("\n"));
  failed = true;
}
process.exitCode = (failed || sandbox.__failed) ? 1 : 0;
