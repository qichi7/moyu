// headless 专项测试：背包系统（v0.4.1 真·槽位背包：10 格装任意东西 + 资源 haul 搬运并入）
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

simInit(42);
const STEP = 0.1;

// ---- 工具 ----
function zeroPack(a) { a.pack = new Array(10).fill(null); }
// 合成路径（纯几何，不查通行性）：让小人保持 walk 态足够久，观察单 tick 内的自用行为
function ghostPath(a, n) {
  a.path = [];
  for (let k = 1; k <= n; k++) a.path.push({ x: Math.floor(a.x) + k, y: Math.floor(a.y) });
  a.pi = 0;
}
// 在初始生成区（主岛以原点为中心，-26..26）扫一种 tile（避免依赖 chunk 内部结构，直接走 tileAt）
function findTileNear(want) {
  for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) {
    if (tileAt(x, y) === want) return { x, y };
  }
  return null;
}

// ===== 1. 构造契约：10 个物理槽位全空起步 =====
let badInit = 0;
for (const a of agents) {
  if (!Array.isArray(a.pack) || a.pack.length !== 10) { badInit++; continue; }
  for (const s of a.pack) if (s !== null) badInit++;
}
assert(badInit === 0 && agents.length > 0, "pack 初始 = Array(10) 全 null（全员 10 个物理空槽）");

// ===== 2. packAdd 同类合并：2+1 → 一格 n3 =====
const pw = agents[0];
zeroPack(pw);
assert(packAdd(pw.pack, "food", 2) === 2 && packAdd(pw.pack, "food", 1) === 1 &&
       pw.pack[0].item === "food" && pw.pack[0].n === 3 && !pw.pack[0].haul && packFree(pw.pack) === 9,
  "packAdd 同类合并：food 2+1 → 单格 n3、无 haul 标记、空槽 9");

// ===== 3. packAdd 堆满开新格：food 3+1 → 两格 3/1 =====
zeroPack(pw);
packAdd(pw.pack, "food", 3);
assert(packAdd(pw.pack, "food", 1) === 1 && pw.pack[0].n === 3 && pw.pack[1].n === 1 && packFree(pw.pack) === 8,
  "packAdd 堆满开新格：food 3+1 → 两格 3/1（堆叠上限 ×3）");

// ===== 4. packAdd haul 有无视为不同类：同 item 分槽 =====
zeroPack(pw);
packAdd(pw.pack, "food", 3);            // 自购（非 haul）
assert(packAdd(pw.pack, "food", 2, true) === 2 && pw.pack[1].haul === true && pw.pack[1].n === 2 &&
       packCount(pw.pack, "food") === 3 && packCount(pw.pack, "food", true) === 2,
  "packAdd haul 分槽：自购 food3 与搬运 food2 各占一格，packCount 按 haul 标记分计");

// ===== 5. packAdd 堆叠上限：工具 1+1 → 拒绝实装 0 =====
zeroPack(pw);
assert(packAdd(pw.pack, "rod", 1) === 1 && packAdd(pw.pack, "rod", 1) === 0 &&
       pw.pack[0].n === 1 && packFree(pw.pack) === 9,
  "packAdd 上限：rod（×1）装 1 后再装实装 0（不占新格不溢出）");

// ===== 6. packAdd 容量 10：塞满后返回不足 =====
zeroPack(pw);
for (let i = 0; i < 9; i++) packAdd(pw.pack, "juice", 3);   // 9 格 juice×3
packAdd(pw.pack, "water", 1);                                // 第 10 格 water n1（半满）
const gotCap = packAdd(pw.pack, "water", 5);
assert(packFree(pw.pack) === 0 && gotCap === 2 && packCount(pw.pack, "water") === 3,
  "packAdd 容量 10：满包（9 满格 + water 半格 1）再装 water 5 → 实装 2（合并到半满格 1+2，无空格开新格）");

// ===== 7. packTake 跨格扣：water 3+2 take 4 =====
zeroPack(pw);
packAdd(pw.pack, "water", 3); packAdd(pw.pack, "water", 2);
assert(packTake(pw.pack, "water", 4) === 4 && pw.pack[0] === null && pw.pack[1].n === 1,
  "packTake 跨格扣：water 3+2 取 4 → 第一格扣空、第二格剩 1");

// ===== 8. packTake 扣空置 null =====
assert(packTake(pw.pack, "water", 1) === 1 && pw.pack[1] === null && packFree(pw.pack) === 10,
  "packTake 扣空置 null：最后一格取尽 → 槽位回 null、空槽回 10");

// ===== 9. packHaulCount 求和 =====
zeroPack(pw);
packAdd(pw.pack, "wood", 3, true); packAdd(pw.pack, "stone", 2, true); packAdd(pw.pack, "food", 1);
assert(packHaulCount(pw.pack) === 5,
  "packHaulCount：haul 槽求和（wood3+stone2=5，非 haul food 不计）");

// ===== 10. 补给点①：粮仓结算（eat 落定）→ 槽位补给、城库扣减 =====
const s1 = world.settlements[0];
const eater = agents[1];
eater.x = s1.x + 0.5; eater.y = s1.y + 0.5;
const city1 = ownerSettle(eater.x, eater.y);
assert(city1 === s1, "测试前置：小人站在聚落粮仓上（ownerSettle 归属正确）");
const st1 = ensureStock(city1);
st1.food = 10; st1.water = 10; st1.juice = 5; st1.beer = 5; st1.coffee = 5;
zeroPack(eater);
eater.thinkCd = 9999; eater.hunger = 50; eater.thirst = 100; eater.state = "eat";
eater.update(STEP);
const foodSlot = eater.pack.find(s => s && s.item === "food");
assert(packCount(eater.pack, "food") === 3 && foodSlot && foodSlot.n === 3 &&
       packCount(eater.pack, "water") === 2 && packCount(eater.pack, "juice") === 1 &&
       packCount(eater.pack, "beer") === 1 && packCount(eater.pack, "coffee") === 1,
  "粮仓结算补给：food 补至 3 占一格 / water 2 / juice·beer·coffee 各 1（全非 haul 槽）");
assert(foodSlot.haul !== true && st1.food === 6 && st1.water === 8 && st1.juice === 4 && st1.beer === 4 && st1.coffee === 4,
  "补给扣城库 stock：food 10-1(吃)-3 / water 10-2 / 其余 -1，且补给槽非 haul");

// ===== 11. 补给点②：deposit 入库结算 → haul 产出入库 + 顺路补给 =====
const carrier = agents[2];
carrier.x = s1.x + 0.5; carrier.y = s1.y + 0.5;
zeroPack(carrier);
st1.food = 6; st1.water = 8;
const woodBefore = st1.wood = 5;
packAdd(carrier.pack, "wood", 2, true);   // 手上抬着 2 木（haul 搬运货）
carrier.deposit();
assert(st1.wood === woodBefore + 2 && packCount(carrier.pack, "wood", true) === 0 &&
       packCount(carrier.pack, "food") === 3 && packCount(carrier.pack, "water") === 2,
  "入库结算补给：haul 木 +2 入库且槽清空，背包补至 food 3 / water 2");
assert(st1.food === 3 && st1.water === 6, "入库补给扣城库：food 6-3 / water 8-2");

// ===== 12. deposit 非 haul 槽不动：自己的口粮不上缴 =====
zeroPack(carrier);
packAdd(carrier.pack, "food", 3);          // 自购口粮（满格：补给目标 3 已达，restock 不会再拿）
packAdd(carrier.pack, "sand", 3, true);    // 搬运沙
st1.sand = 1;
carrier.deposit();
assert(packCount(carrier.pack, "food") === 3 && st1.sand === 4 && packCount(carrier.pack, "sand", true) === 0,
  "deposit 非 haul 槽不动：自购 food 3 幸存，haul 沙 3 入库（sand 1→4）");

// ===== 13. 连续补给封顶：food 不超过 3 =====
st1.food = 50;
for (let i = 0; i < 3; i++) carrier.restockPack(city1);
assert(packCount(carrier.pack, "food") === 3 && st1.food === 50, "连续补给 food 封顶 3（满仓不重复拿）");

// ===== 14. 路上自用（水，非 haul）：不停步喝水 =====
const walker = agents[3];
walker.thinkCd = 9999; walker.task = null; walker.exploring = null; walker.onArrive = null;
walker.state = "walk";
zeroPack(walker); packAdd(walker.pack, "water", 2);
walker.hunger = 90; walker.thirst = 34; walker.energy = 100;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "water") === 1 && walker.thirst > 90 && walker.thirst <= 100 && walker.state === "walk",
  "路上自用（水）：pack water-1、thirst+65（34→" + walker.thirst.toFixed(1) + "）、state 仍 walk");

// ===== 15. 路上自用（粮）=====
zeroPack(walker); packAdd(walker.pack, "food", 1);
walker.hunger = 34; walker.thirst = 100;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "food") === 0 && walker.hunger > 80 && walker.hunger < 90 && walker.state === "walk",
  "路上自用（粮）：pack food-1、hunger+50（34→" + walker.hunger.toFixed(1) + "）、state 仍 walk");

// ===== 16. 路上自用 haul 回退：非 haul 空 → 吃搬运的口粮 =====
zeroPack(walker); packAdd(walker.pack, "food", 2, true);
walker.hunger = 34; walker.thirst = 100;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "food", true) === 1 && walker.hunger > 80,
  "路上自用 haul 回退：非 haul 无粮 → 吃 haul 槽口粮（2→1）");

// ===== 17. 路上自用非 haul 优先：两槽都有 → 只动自购 =====
zeroPack(walker); packAdd(walker.pack, "food", 1); packAdd(walker.pack, "food", 2, true);
walker.hunger = 34; walker.thirst = 100;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "food") === 0 && packCount(walker.pack, "food", true) === 2,
  "路上自用非 haul 优先：自购 1 先吃，haul 2 不动");

// ===== 18. 路上自用：无水喝麦酒 → drunkT 生效 =====
zeroPack(walker); packAdd(walker.pack, "beer", 1); walker.drunkT = 0;
walker.thirst = 34;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "beer") === 0 && walker.drunkT === SIM.DRUNK_TIME && walker.thirst > 90,
  "路上自用（麦酒）：无水时依序取用、thirst+60、drunkT=DRUNK_TIME");

// ===== 19. 路上自用：咖啡 → coffeeT 生效 =====
zeroPack(walker); packAdd(walker.pack, "coffee", 1); walker.coffeeT = 0;
walker.thirst = 34;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "coffee") === 0 && walker.coffeeT === SIM.COFFEE_TIME && walker.thirst > 80,
  "路上自用（咖啡）：thirst+50、coffeeT=COFFEE_TIME");

// ===== 20. 路上自用：果汁 → 精力 +10 =====
zeroPack(walker); packAdd(walker.pack, "juice", 1);
walker.thirst = 34; walker.energy = 50;
ghostPath(walker, 60);
walker.update(STEP);
assert(packCount(walker.pack, "juice") === 0 && walker.energy > 59 && walker.energy < 61 && walker.thirst > 90,
  "路上自用（果汁）：thirst+75 且 energy +10（50→" + walker.energy.toFixed(1) + "）");

// ===== 21. 包空回退：pack 全空 + thirst<30 → 走 seekDrink 老路（walk 去水边）=====
const thirsty = agents[4];
// 清空各城饮品库存，逼 seekDrink 落到「水井/河湖直饮」分支
for (const s of world.settlements) { const st = ensureStock(s); st.water = 0; st.juice = 0; st.beer = 0; st.coffee = 0; }
// 找一块「距水 2~4 格」的可站立格落位：保证寻路 1 步以上（state 断言时仍在途），且 nearestWaterSpot 圈扫必命中
let wspot = null;
outer:
for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) {
  if (!walkable(x, y)) continue;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const r = Math.max(Math.abs(dx), Math.abs(dy));
    if (r < 2 || r > 4) continue;
    if (tileAt(x + dx, y + dy) === T.WATER) { wspot = { x, y }; break outer; }
  }
}
assert(!!wspot, "测试前置：找到距水 3 格的可站立草地");
thirsty.x = wspot.x + 0.5; thirsty.y = wspot.y + 0.5;
zeroPack(thirsty);
thirsty.thinkCd = 0; thirsty.task = null; thirsty.exploring = null;
thirsty.path = null; thirsty.onArrive = null;
thirsty.hunger = 90; thirsty.energy = 100; thirsty.thirst = 29; thirsty.state = "idle";
let g21 = 0;
while (thirsty.state === "idle" && g21++ < 20) simUpdate(STEP);
const dest21 = thirsty.path && thirsty.path.length ? thirsty.path[thirsty.path.length - 1] : null;
const destWatery = dest21 && (tileAt(dest21.x, dest21.y) === T.WATER || tileAt(dest21.x, dest21.y) === T.WELL ||
  neighborsOf(dest21.x, dest21.y).some(p => tileAt(p.x, p.y) === T.WATER || tileAt(p.x, p.y) === T.WELL));
assert(thirsty.state === "walk" && destWatery && thirsty.thirst < 30,
  "包空回退：thirst<30 且包空 → 走 seekDrink 老路（walk 前往水边，途中未自用）");

// ===== 22. 补给点③：领远任务（d>15）→ 先补给背包再出发 =====
const farer = agents[5];
farer.x = s1.x + 0.5; farer.y = s1.y + 0.5;
tasks.list.length = 0;
const farTask = tasksAdd({ type: "GATHER", x: Math.round(farer.x) + 40, y: Math.round(farer.y), need: 1e9 });
st1.food = 10; st1.water = 10;
zeroPack(farer);
farer.thinkCd = 0; farer.task = null; farer.exploring = null;
farer.path = null; farer.onArrive = null;
farer.hunger = 90; farer.thirst = 90; farer.energy = 100; farer.state = "idle";
farer.update(STEP);   // 单拍：decide → 领远任务 → 补给
assert(packCount(farer.pack, "food") === 3 && packCount(farer.pack, "water") === 2 && st1.food === 7 && st1.water === 8,
  "领远任务补给：d>15 时背包补至 food 3 / water 2 并扣城库");

// ===== 23. FETCH_WATER 端到端：水 5 → 跨两个 haul 格（3+2）=====
const fetcher = agents[6];
fetcher.x = s1.x + 0.5; fetcher.y = s1.y + 0.5;
zeroPack(fetcher);
packAdd(fetcher.pack, "food", 2);   // 非 haul 口粮垫底（验证 deposit 后幸存）
tasks.list.length = 0;
const ft = tasksAdd({ type: "FETCH_WATER", x: Math.round(fetcher.x), y: Math.round(fetcher.y) });
tasksFinish(ft, fetcher);
const wSlots = fetcher.pack.filter(s => s && s.haul && s.item === "water");
assert(wSlots.length === 2 && wSlots[0].n === 3 && wSlots[1].n === 2 && packHaulCount(fetcher.pack) === 5,
  "FETCH_WATER：水 5 入包跨两个 haul 格（3+2），非 haul 口粮同包共存");

// ===== 24. 搬运 deposit：城库 water+5、haul 槽清空、非 haul 幸存 =====
// （deposit 入库 5 后接既有补给点②顺路补给：water 包空补至 2、food 2 补至 3——净入库 5-2=3）
st1.water = 0;
fetcher.deposit();
assert(st1.water === 5 - SIM.PACK_RESTOCK.water &&
       packCount(fetcher.pack, "water", true) === 0 && packCount(fetcher.pack, "water") === SIM.PACK_RESTOCK.water &&
       packCount(fetcher.pack, "food") === 3,
  "搬运 deposit：城库 water 0→5（顺路补给拿回 2 净 +3）、haul 槽全清、非 haul 口粮幸存并补满");

// ===== 25. GATHER 端到端：完成 → haul 沙槽出现 → 走到仓库入库 =====
const gatherer = agents[7];
gatherer.x = s1.x + 0.5; gatherer.y = s1.y + 0.5;
zeroPack(gatherer);
tasks.list.length = 0;
const gt = tasksAdd({ type: "GATHER", x: Math.round(gatherer.x), y: Math.round(gatherer.y), res: "sand" });
st1.sand = 0; st1.food = 0; st1.water = 0;   // 城库粮水清零：restock 拿不到货，deposit 断言不受顺路补给干扰
tasksFinish(gt, gatherer);
assert(packCount(gatherer.pack, "sand", true) === 3, "GATHER（沙）完成：haul 沙 3 入包");
gatherer.deposit();
assert(st1.sand === 3 && packFree(gatherer.pack) === 10, "GATHER 走到仓库 deposit：城库沙 0→3、包全空");

// ===== 26. HUNT 端到端：完成 → haul 肉槽出现 → deposit 库存增 =====
const hunter = agents[8];
hunter.x = s1.x + 0.5; hunter.y = s1.y + 0.5;
zeroPack(hunter);
tasks.list.length = 0;
const fakeCow = { type: "cow", dead: false };
const ht = tasksAdd({ type: "HUNT", x: Math.round(hunter.x), y: Math.round(hunter.y) });
ht.creature = fakeCow;
st1.food = 0;
tasksFinish(ht, hunter);
const yieldCow = CREATURE_META.cow.yield;
assert(!fakeCow.dead === false && packCount(hunter.pack, "food", true) === yieldCow,
  "HUNT 完成：猎物倒下、haul 肉 " + yieldCow + " 入包（huntReward=CREATURE_META.yield）");
hunter.deposit();   // 入库 yieldCow 后顺路补给点②拿回 food 3（城库足量）
assert(st1.food === yieldCow - SIM.PACK_RESTOCK.food && packCount(hunter.pack, "food") === SIM.PACK_RESTOCK.food,
  "HUNT deposit：城库粮 0→" + yieldCow + "（顺路补给拿回 3），包内留口粮 3");

// ===== 27. 包满时任务产出差额就地入库（产出不蒸发）=====
const full = agents[9];
full.x = s1.x + 0.5; full.y = s1.y + 0.5;
zeroPack(full);
for (let i = 0; i < 10; i++) full.pack[i] = { item: "rod", n: 1 };   // 手工塞满 10 格（非 haul）
tasks.list.length = 0;
const fakeBoar = { type: "boar", dead: false };
const ht2 = tasksAdd({ type: "HUNT", x: Math.round(full.x), y: Math.round(full.y) });
ht2.creature = fakeBoar;
st1.food = 7;
tasksFinish(ht2, full);
assert(packHaulCount(full.pack) === 0 && st1.food === 7 + CREATURE_META.boar.yield,
  "包满差额兜底：满包 HUNT → 实装 0、产出台账直加城库（food 7→" + st1.food + "），产出不蒸发");

// ===== 28. 工具：领 DIG 伐木任务 → axe 槽 {item,n:1} 且重复领取不加 =====
const digger = agents[10];
tasks.list.length = 0;
tasksAdd({ type: "DIG", x: Math.round(digger.x) + 2, y: Math.round(digger.y), res: "wood" });
zeroPack(digger);
tasksTake(digger);
assert(packCount(digger.pack, "axe") === 1 && digger.pack.some(s => s && s.item === "axe" && s.n === 1),
  "领 DIG 伐木任务 → 自动领取斧头（独立槽位 {item:axe,n:1}）");
tasksTake(digger);
assert(packCount(digger.pack, "axe") === 1 && packCount(digger.pack, "pick") === 0 && packCount(digger.pack, "rod") === 0,
  "重复领取不加：永久持有，axe 仍为 1 且其他工具未误发");

// ===== 29. 工具：rod 领取扣联合木 1 =====
const fisher = agents[11];
for (const s of world.settlements) ensureStock(s).wood = 10;
jointStockDirty();
const w0 = jointStock("wood");
tasks.list.length = 0;
tasksAdd({ type: "FISH", x: Math.round(fisher.x), y: Math.round(fisher.y), need: 1e9 });
zeroPack(fisher);
tasksTake(fisher);
assert(packCount(fisher.pack, "rod") === 1 && jointStock("wood") === w0 - 1,
  "领 FISH 任务 → 领钓竿并扣联合木 1（" + w0 + "→" + jointStock("wood") + "）");

// ===== 30. 工具：联合木不足时钓竿照发（复用 fisher：zeroPack 清工具后重领）=====
for (const s of world.settlements) ensureStock(s).wood = 0;
jointStockDirty();
zeroPack(fisher);   // 清掉已领的钓竿：packCount 归 0 才会重新走发放分支
tasks.list.length = 0;
tasksAdd({ type: "FISH", x: Math.round(fisher.x), y: Math.round(fisher.y), need: 1e9 });
tasksTake(fisher);
assert(packCount(fisher.pack, "rod") === 1 && jointStock("wood") === 0,
  "联合木不足：钓竿仍照发（工具不因缺料卡死生产），木料未透支为负");

// ===== 31. 加成：axe 对 DIG 磨血进度 ×1.2（同一小人固定 tick 对照；复用 walker）=====
const tree = findTileNear(T.TREE);
assert(!!tree, "测试前置：初始区域存在森林格");
const treeTask = tasksAdd({ type: "DIG", x: tree.x, y: tree.y, res: "wood" });
const chopper = walker;   // 复用：初始 12 人，索引不越界
zeroPack(chopper);
chopper.task = treeTask; chopper.state = "work"; chopper.thinkCd = 9999;
chopper.exploring = null; chopper.onArrive = null;
chopper.x = tree.x + 0.5; chopper.y = tree.y + 0.5;
const ck = world.chunks.get(chunkKey(tree.x >> 5, tree.y >> 5));
const ci = cIdx(tree.x, tree.y);
const hpMax = TILE_META[T.TREE].hp;
ck.hp[ci] = 0; chopper.doWork(STEP);
const e1 = hpMax - ck.hp[ci];       // 无斧：单 tick 磨血量
packAdd(chopper.pack, "axe", 1);
ck.hp[ci] = 0; chopper.doWork(STEP);
const e2 = hpMax - ck.hp[ci];       // 有斧：单 tick 磨血量
chopper.task = null; zeroPack(chopper);
assert(e1 > 0 && ck.hp[ci] > 0 && Math.abs(e2 / e1 - 1.2) < 0.05,
  "工具加成（workTile 磨血路径）：有斧/无斧固定 tick 进度比 ≈1.2（实测 " + (e2 / e1).toFixed(3) + "）");

// ===== 32. 加成：hammer 对 BUILD 进度制 ×1.2（复用 fetcher）=====
const builder = fetcher;   // 复用：初始 12 人，索引不越界
tasks.list.length = 0;
const bspot = findSpot(Math.round(builder.x), Math.round(builder.y), 1, 6, T.GRASS);
const buildTask = tasksAdd({ type: "BUILD", x: bspot.x, y: bspot.y, need: 1e9 });
builder.task = buildTask; builder.state = "work"; builder.thinkCd = 9999;
builder.exploring = null; builder.onArrive = null;
builder.x = bspot.x + 0.5; builder.y = bspot.y + 0.5;
zeroPack(builder);
builder.doWork(STEP);
const p1 = buildTask.progress;
buildTask.progress = 0; packAdd(builder.pack, "hammer", 1);
builder.doWork(STEP);
const p2 = buildTask.progress;
builder.task = null;
assert(p1 > 0 && Math.abs(p2 / p1 - 1.2) < 0.05,
  "工具加成（doWork 进度制路径）：有锤/无锤固定 tick 进度比 ≈1.2（实测 " + (p2 / p1).toFixed(3) + "）");

// ===== 33. 数值契约：config 集中调参位（含 v0.4.1 资源堆叠）=====
assert(SIM.THIRST_DECAY === 0.7 &&
       SIM.DRINK_RESTORE.water === 100 && SIM.DRINK_RESTORE.juice === 100 &&
       SIM.DRINK_RESTORE.beer === 100 && SIM.DRINK_RESTORE.coffee === 100 &&
       SIM.PACK_RESTOCK_DIST === 15 && SIM.PACK_LOW === 35 && SIM.PACK_TOOL_BONUS === 1.2 &&
       SIM.PACK_STACK.food === 3 && SIM.PACK_STACK.axe === 1 &&
       SIM.PACK_STACK.wood === 3 && SIM.PACK_STACK.stone === 3 && SIM.PACK_STACK.sand === 3 &&
       SIM.PACK_RESTOCK.water === 2 && SIM.PACK_RESTORE.water === 65 && SIM.PACK_RESTORE.food === 50,
  "config 数值契约：THIRST_DECAY 0.7 / DRINK_RESTORE 全 100 / PACK_* 就位（资源堆叠 wood/stone/sand=3）");

console.log("---- pack.js 断言结束 ----");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "pack.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
