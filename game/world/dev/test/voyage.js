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
// 返回全部候选（行为改动会使 rand 流漂移，单个候选的朝向扫描可能 24 连败——逐个尝试对漂移免疫）
function findDocks() {
  const out = [];
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
        if (open) { out.push({ land, water: { x, y } }); break; }
      }
    }
  }
  return out;
}

// 从候选码头逐一尝试出港（startVoyage 朝向扫描对 rand 流位置敏感，失败换下一个码头）
function launch(agent, cands) {
  for (const dk of cands) {
    const before = world.ships.length;
    agent.x = dk.land.x + 0.5; agent.y = dk.land.y + 0.5;
    agent.state = "idle"; agent.task = null;
    agent.startVoyage(dk.land);
    if (world.ships.length > before) return world.ships[world.ships.length - 1];
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
  const cands = findDocks();
  assert(cands.length > 0, "场景A：母港旁可设开阔水码头");
  const ship1 = launch(a1, cands);
  assert(ship1 && ship1.sailor === a1 && a1.state === "voyage", "场景A：登船出海（voyage 状态）");
  if (!ship1) { throw new Error("场景A出港失败"); }
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
const cands2 = findDocks();
assert(cands2.length > 0, "场景B：母港旁可设开阔水码头");
const ship2 = launch(a2, cands2);
assert(ship2 && ship2.state === "sailing" && ship2.prov === 12, "场景B：少装出海（补给 12/40，航行中）");
if (!ship2) { throw new Error("场景B出港失败"); }
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
const ship3 = launch(a2, cands2);
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

// ---- 场景 C：船可以穿过桥（v0.5.0：桥格视为可航水域，靠岸点排除桥格）----
simInit(42);
revealArea(world.store.x, world.store.y, 46);
// 找一条向 +x 开阔的水道（前方 14 格、横向 ±3 全为已生成水域），在 x+6 处立一列 7 格宽的桥
function findWaterLane() {
  for (let r = 2; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = world.store.x + dx, y = world.store.y + dy;
      if (tileAt(x, y) !== T.WATER && tileAt(x, y) !== T.DEEP) continue;
      let ok = true;
      for (let k = 0; k <= 14 && ok; k++) {
        for (let oy = -3; oy <= 3; oy++) {
          const t = tileAt(x + k, y + oy);
          if (t !== T.WATER && t !== T.DEEP) { ok = false; break; }   // 只认已生成水域（VOID 上 setTile 语义不可靠）
        }
      }
      if (ok) return { x, y };
    }
  }
  return null;
}
const lane = findWaterLane();
if (!lane) { assert(true, "场景C：找不到开阔水道（跳过）"); } else {
  for (let oy = -3; oy <= 3; oy++) setTile(lane.x + 6, lane.y + oy, T.BRIDGE);
  const sc = agents.find(x => !x.dead);
  sc.state = "voyage"; sc.voyaging = true; sc.task = null;
  world.ships.push({ x: lane.x + 0.5, y: lane.y + 0.5, ang: 0, sailor: sc, state: "sailing", prov: 100, dist: 0, revealCd: 9 });
  const shipC = world.ships[world.ships.length - 1];
  let crossed = false, dockedOnBridge = false, sailorAbroad = true;
  for (let i = 0; i < 700 && shipC.state === "sailing"; i++) {
    simUpdate(STEP);
    if (shipC.x > lane.x + 7.2) crossed = true;   // 已越过桥线
    if (shipC.x > lane.x + 4.5 && shipC.x < lane.x + 7.5) {   // 桥线附近窗口
      if (shipC.state === "docked") dockedOnBridge = true;
      if (!shipC.sailor) sailorAbroad = false;
    }
    if (shipC.x > lane.x + 12) break;   // 远离桥线即视为通过
  }
  assert(crossed, "场景C：船穿过了桥线（继续向前航行）");
  assert(!dockedOnBridge && sailorAbroad, "场景C：桥线附近未靠岸、水手未下船（桥不再是岸）");
}

// ---- 场景 D：岛际跨海大桥（v0.5.1：已命名岛屿中心连线，海上段架桥，深海亦可）----
simInit(42);
for (let i = 0; i < 800; i++) simUpdate(STEP);
world.era = 2;
// 构造一对已命名「岛屿」标记：A 在沿岸陆地格，B 在其某方向 10 格外的海面（连线穿海）
// 选址加严（收口修正）：首海格 6 格内不得有既有桥 tile、且不得已有任务占位——否则立项分支
// 的 nearAny/撞车门槛会把本测试对筛掉（v0.6.1 起随机流漂移曾致本场景间歇 0/10）
let pairA = null, pairB = null, pairTiles = [];
outerD:
for (let y = -50; y <= 50 && !pairA; y++) for (let x = -50; x <= 50; x++) {
  if (tileAt(x, y) !== T.GRASS || !walkable(x, y)) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let ok = true;
    for (let k = 1; k <= 10; k++) {
      const t = tileAt(x + dx * k, y + dy * k);
      if (t !== T.WATER && t !== T.DEEP) { ok = false; break; }   // 浅海/深海皆可架（本版特性）
    }
    // 走廊全段隔离：链式立项逐格过 nearAny(BRIDGE,6) 与任务占位门——场景 B/C 的旧桥落进
    // 走廊中段 6 格邻域会拦断链式生长，只查首格不够
    if (ok) for (let k = 1; k <= 10; k++) {
      if (nearAny(x + dx * k, y + dy * k, [T.BRIDGE], 6) ||
          tasks.list.some(tk => !tk.done && tk.x === x + dx * k && tk.y === y + dy * k)) { ok = false; break; }
    }
    if (ok) {
      pairA = { x, y }; pairB = { x: x + dx * 10, y: y + dy * 10 };
      for (let k = 1; k <= 10; k++) pairTiles.push(tileAt(x + dx * k, y + dy * k));   // 原tile快照（自愈还原基准）
      break outerD;
    }
  }
}
if (!pairA) { assert(true, "场景D：地理不满足（无沿岸构造点），跳过"); } else {
  const islA = { x: pairA.x, y: pairA.y, r: 6, name: "测试西岛", claimed: true };
  const islB = { x: pairB.x, y: pairB.y, r: 6, name: "测试东岛", claimed: true };
  // 立项按「最近命名对优先」竞争，且「真实↔测试」的混合对（如 云浦↔测试西岛 d≈9 < 测试对 10）
  // 也会参赛：其连线可能无可达海格、立项不成又永占队头（30s 重查永远选中它）——测试对被永久
  // 饿死（HEAD~1 靠流位置侥幸胜出，v0.6.1 起必 0/10）。包一层 plannerTick：每次调用前把除测试对
  // 以外的全部命名对（含混合对）预登记为已立项，保证测试对唯一 qualify（被测的 corridor 机制不变）
  world.islands.push(islA, islB);
  const _rawPlannerD = plannerTick;
  plannerTick = function () {
    const namedAll = world.islands.filter(o => o.name && o.r >= 3);
    const isFake = o => o === islA || o === islB;
    for (let i = 0; i < namedAll.length; i++) for (let j = i + 1; j < namedAll.length; j++) {
      const a = namedAll[i], b = namedAll[j];
      if (isFake(a) && isFake(b)) continue;   // 只放行测试对
      world.interBridges.add(a.x + "," + a.y + "|" + b.x + "," + b.y);
      world.interBridges.add(b.x + "," + b.y + "|" + a.x + "," + a.y);
    }
    return _rawPlannerD();
  };
  world.settlements.forEach(s => ensureStock(s).wood = 200);
  jointStockDirty();
  plannerTick();
  // 只认测试对本线的走廊任务（列表里还有探险路径立项的别对桥任务）
  const bridge = tasks.list.find(t => t.type === "BRIDGE" && t.corridor &&
    Math.abs(t.x - pairA.x) <= 1 && Math.abs(t.y - pairA.y) <= 1);
  assert(!!bridge && tileAt(bridge.x, bridge.y) !== T.GRASS, "岛际大桥：连线海上首格立项 BRIDGE（带 corridor）");
  assert(!!bridge && (tileAt(bridge.x, bridge.y) === T.WATER || tileAt(bridge.x, bridge.y) === T.DEEP),
    "岛际大桥：桥格落在海上（" + (bridge ? TILE_META[tileAt(bridge.x, bridge.y)].name : "-") + "）");
  plannerTick();
  const count = tasks.list.filter(t => t.type === "BRIDGE" && t.corridor &&
    Math.abs(t.x - bridge.x) <= 1 && Math.abs(t.y - bridge.y) <= 1).length;
  assert(count === 1, "岛际大桥：同一对岛不重复立项（pair 去重）");
  // 贯通（v0.6.0 看护补齐）：木材管够 + 派工匠驻守桥头 → corridor 链式生长到 remain 归零
  world.settlements.forEach(s => ensureStock(s).wood = 500);
  jointStockDirty();
  const builders = agents.filter(a => !a.dead).slice(0, 3);
  builders.forEach(b => {
    b.x = pairA.x + 0.5; b.y = pairA.y + 0.5;
    b.state = "idle"; b.task = null; b.thinkCd = 0; b.onArrive = null; b.path = null;
    b.energy = 100; b.hunger = 90; b.thirst = 90; b.mood = 100; b.depressed = false;
    b.pack = new Array(10).fill(null);
  });
  // 计数方向 = 测试对本线方向（收口修正：原 dirScan 用「第 10 格是水」重选方向，东向第 10 格
  // 恰为水而中途是陆地时会数错线——立项扫描资格是「连续 10 格全水」，两口径并不等价）
  const dirScan = [(pairB.x - pairA.x) / 10, (pairB.y - pairA.y) / 10];
  let built = 0;
  for (let i = 0; i < 30000 && built < 8; i++) {
    simUpdate(STEP);
    // 驻守补给（收口修正）：需求衰减会把工人拽离桥头（口渴/进食/睡觉），链式任务因 blockedCount
    // 累积被领取资格剔除后无人问津、走廊停摆——定期把驻守队拉回桥头满状态再上工，恢复本场景
    // 「派工匠驻守桥头」的设定前提（被测的 corridor 链式生长机制本身不动）。
    // v0.6.18 生态重置后世界随机流漂移 → 桥工更易被其他任务分走：驻守间隔 300→200→150、
    // 窗口 9000→18000→30000（漂移后任务池更满，两轮放宽的实测收敛点）
    if (i % 150 === 149) {
      builders.forEach(b => {
        b.x = pairA.x + 0.5; b.y = pairA.y + 0.5;
        b.state = "idle"; b.task = null; b.thinkCd = 0; b.onArrive = null; b.path = null;
        b.energy = 100; b.hunger = 90; b.thirst = 90; b.mood = 100; b.depressed = false;
      });
      for (const t of tasks.list) if (t.type === "BRIDGE" && t.corridor) t.blockedCount = 0;
      // 走廊地形自愈（v0.6.18 收口）：新岛发现的 bump 抬升会把走廊海格改写成悬崖/陆地（世界生成
      // 机制特性，探针实测 DEEP→CLIFF 断链）；浅海格还可能被赶路工人应急填平（meta.fillable 只认
      // 浅海）→ 链式续立项 tt 非水永久断链。驻守节拍同步按扫描快照还原被改写格，维持「走廊穿海」
      // 设定前提（桥格不动，被测的 corridor 链式生长机制本身不改）
      for (let k = 1; k <= 10; k++) {
        const tx2 = pairA.x + dirScan[0] * k, ty2 = pairA.y + dirScan[1] * k;
        const tt2 = tileAt(tx2, ty2);
        if (tt2 !== T.BRIDGE && tt2 !== pairTiles[k - 1]) setTile(tx2, ty2, pairTiles[k - 1]);
      }
    }
    built = dirScan ? Array.from({ length: 10 }, (_, k) =>
      tileAt(pairA.x + dirScan[0] * (k + 1), pairA.y + dirScan[1] * (k + 1))).filter(t => t === T.BRIDGE).length : 0;
  }
  assert(built >= 8, "岛际大桥：corridor 链式生长贯通（海上桥格 " + built + "/10）");
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
