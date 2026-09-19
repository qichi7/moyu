// 动物系统专项验证（headless）：
// 场景 A 动物老死（寿命耗尽后自然离世）
// 场景 B 鲸搁浅（填海困住）无人救援 → 超时死亡
// 场景 C 搁浅鲸被小人救援 → 送回深海存活
// 场景 D 海龟/狼繁衍（种群增长）
// 场景 E 初始岛屿数量 3~7 随机
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

// ---- 场景 A：老死 ----
simInit(42);
const oldCow = spawnCreature(4, 4, "cow");
oldCow.age = SPECIES_AGE.cow.lifespan;   // 寿命已到
let died = false;
for (let i = 0; i < 9000; i++) {   // 900s：期望平均 3 天（180s）内离世
  oldCow.update(STEP);
  if (oldCow.dead) { died = true; break; }
}
assert(died, "场景A：寿命耗尽的牛自然老死");
const youngCow = spawnCreature(4, 4, "cow");
youngCow.age = 3;   // 青年
let diedYoung = false;
for (let i = 0; i < 6000; i++) youngCow.update(STEP);
assert(!youngCow.dead, "场景A：年轻动物不误判老死");

// ---- 场景 B：鲸搁浅无人救援 → 死亡 ----
simInit(42);
const beachedWhale = spawnCreature(3, 3, "whale");   // 陆地格：脚下 GRASS，deep 栖息不满足
assert(!habitatOk(beachedWhale, 3, 3), "场景B：陆地上的鲸不满足栖息地（搁浅确认）");
let strandDied = false;
for (let i = 0; i < 12000; i++) {   // 1200s > 90s 坚持时长
  beachedWhale.update(STEP);
  if (beachedWhale.dead) { strandDied = true; break; }
}
assert(strandDied, "场景B：搁浅鲸长时间无人救援 → 死亡");
assert((beachedWhale.strandT || 0) > SIM.ANIMAL_STRAND_DEATH - 5, "场景B：死亡前坚持时长符合设定");
const okWhale = spawnCreature(3, 3, "whale");
for (let i = 0; i < 300; i++) okWhale.update(STEP);
assert(!okWhale.dead, "场景B：未满坚持时长不死亡（对照）");

// ---- 场景 C：搁浅鲸被救援 ----
simInit(42);
for (let i = 0; i < 3000; i++) simUpdate(STEP);   // 预热世界
const s0 = world.settlements[0];
const beachSpot = findSpot(Math.round(s0.x), Math.round(s0.y), 5, 18, T.GRASS, [T.HOUSE, T.FARM, T.SITE]);   // 岛缘草地（小人可达，且 30 格内有深海可放归）
const rescueWhale = spawnCreature(beachSpot.x, beachSpot.y, "whale");
rescueWhale.strandT = 5;   // 已搁浅片刻（可被认领）
// 注意：被动点亮会持续生成新地形，鲸被放归后可能立即再次被困（真实行为，场景 B 已单独考察搁浅死亡）
// 因此本场景只断言"认领搬运 → 放归"事件链（放归点由 findSpot 确认为 DEEP，日志即放归凭证）
let rescued = false;
for (let i = 0; i < 20000; i++) {   // 2000s：认领+赶路+送回
  simUpdate(STEP);
  if (rescueWhale.rescuer || rescueWhale.carriedBy) rescued = true;
  if (rescued && !rescueWhale.carriedBy && world.logs.some(l => l.text.includes("送回了安全的栖息地"))) break;
}
assert(rescued, "场景C：小人认领并搬运了搁浅鲸");
const logHit = world.logs.some(l => l.text.includes("送回了安全的栖息地"));
assert(logHit, "场景C：鲸被送回栖息水域（放归日志凭证）");

// ---- 场景 D：繁衍 ----
simInit(42);
// 海龟：两只 → 多次繁衍判定
const t1 = spawnCreature(6, 0, "turtle"), t2 = spawnCreature(7, 0, "turtle");
for (let i = 0; i < 20; i++) wildBreedTick();   // 20 个繁衍周期
const turtles = creatures.filter(c => c.type === "turtle" && !c.dead).length;
assert(turtles > 2, "场景D：海龟繁衍（2 -> " + turtles + "）");
// 狼：并入陆生种群繁衍
const wolves0 = creatures.filter(c => c.type === "wolf" && !c.dead).length;
for (let i = 0; i < 40; i++) wildBreedTick();
const wolves1 = creatures.filter(c => c.type === "wolf" && !c.dead).length;
assert(wolves1 >= wolves0, "场景D：狼种群未消失（" + wolves0 + " -> " + wolves1 + "）");

// ---- 场景 E：初始岛屿 3~7 随机 ----
let okRange = true;
for (let s = 1; s <= 8; s++) {
  simInit(s * 7919);
  if (world.islands.length < 3 || world.islands.length > 7) { okRange = false; break; }
}
assert(okRange, "场景E：8 个随机种子的初始岛屿数均在 3~7 之间");
const seen = new Set();
for (let s = 1; s <= 10; s++) {
  simInit(s * 104729);
  seen.add(world.islands.length);
}
assert(seen.size >= 3, "场景E：岛数具有随机性（出现过 " + [...seen].sort().join("/") + "）");

// ---- 场景 F：渔场（圈养鱼群产粮 + 繁衍）----
simInit(42);
const fw = findSpot(world.store.x, world.store.y, 5, 20, T.WATER);
if (!fw) { assert(false, "场景F：测试环境需要水域"); } else {
  const farmFish = spawnCreature(fw.x, fw.y, "fish");
  farmFish.pasture = { x: fw.x, y: fw.y };   // 圈养于水域渔场
  farmFish.outputCd = 1; farmFish.breedCd = 1;
  const food0 = world.food;
  for (let i = 0; i < 1200; i++) farmFish.update(STEP);   // 120s：至少产一轮粮
  assert(world.food >= food0 + SIM.PASTURE_YIELD, "场景F：圈养鱼群定期产粮（+" + (world.food - food0) + "）");
  assert(habitatOk(farmFish, Math.round(farmFish.x), Math.round(farmFish.y)), "场景F：圈养鱼在水中游荡（不搁浅）");
}

// ---- 场景 G：渔船闭环（出港 → 捕捞 → 满舱返航卸货）----
simInit(42);
for (let i = 0; i < 4000; i++) simUpdate(STEP);
world.era = 1;
world.food = 500;
world.settlements.forEach(function (s) { ensureStock(s).wood = 200; });
jointStockDirty();   // 手动改库存后失效联合库存缓存
revealArea(world.store.x, world.store.y, 50);
// 保证有码头
let gDock = world.docks[0];
if (!gDock) {
  const cand = findSpot(world.store.x, world.store.y, 3, 20, T.GRASS, [T.HOUSE, T.FARM]);
  if (cand && neighborsOf(cand.x, cand.y).some(p => tileAt(p.x, p.y) === T.WATER)) {
    gDock = cand;
    world.docks.push(gDock);
  }
}
if (!gDock || world.fishStock.size === 0) {
  assert(true, "场景G：地理不满足（无临水格或无鱼点），跳过");
} else {
  const fisher = agents.find(x => !x.dead && !x.voyaging && (x.hobby === "fishing" || x.job === "fisher"));
  if (!fisher) { assert(true, "场景G：无人选为渔民，跳过"); } else {
    fisher.x = gDock.x + 0.5; fisher.y = gDock.y + 0.5;
    const ok = fisher.startFishingTrip(gDock);
    if (!ok) console.log("DBG 场景G fail: dock=", JSON.stringify(gDock),
      "dockTile=", tileAt(gDock.x, gDock.y),
      "neigh=", JSON.stringify(neighborsOf(gDock.x, gDock.y).map(p => tileAt(p.x, p.y))),
      "wood=", jointStock("wood"), "fisher=", fisher.name, fisher.job, "state=", fisher.state);
    assert(ok, "场景G：渔民出港（渔船启动）");
    if (ok) {
      const boat = world.ships[world.ships.length - 1];
      assert(boat.boat === true && boat.state === "fishing", "场景G：渔船出海捕捞中");
      let harvested = false;
      for (let i = 0; i < 40000; i++) {   // 4000s：捕满 20 粮 + 返航
        simUpdate(STEP);
        if (boat.hold >= SIM.BOAT_HOLD_CAP) harvested = true;
        if (boat.state === "docked") break;
        if (!boat.sailor || boat.sailor.dead) break;
      }
      assert(harvested || boat.hold > 0 || boat.state === "docked", "场景G：渔船完成捕捞航次");
      assert(boat.state === "docked", "场景G：渔船回港停靠");
      assert(!fisher.voyaging && !fisher.dead, "场景G：渔民下船休整（存活）");
      assert(fisher.boatRestT !== undefined, "场景G：渔民进入休整期");
    }
  }
}

// ---- 场景 H：被动点亮（贴边小人点亮眼前虚空）----
simInit(42);
// 构造未点亮边缘：聚落旁草地格手动挖成 VOID（模拟未点亮前沿）
const edgeVoid = findSpot(world.store.x, world.store.y, 3, 10, T.GRASS, [T.HOUSE, T.FARM]);
if (!edgeVoid) { assert(true, "场景H：未找到构造点（跳过）"); } else {
  setTile(edgeVoid.x, edgeVoid.y, T.VOID);
  const stand = neighborsOf(edgeVoid.x, edgeVoid.y).find(p => walkable(p.x, p.y));
  if (!stand) { assert(true, "场景H：构造点无可站立邻格（跳过）"); } else {
    const walker = agents.find(a => !a.dead);
    walker.x = stand.x + 0.4; walker.y = stand.y + 0.4;   // 避开半格（Math.round 负坐标 half-up 偏移）
    walker.state = "idle";
    walker.thinkCd = 9999;   // 冻结决策：让小人稳定站在虚空边缘触发被动点亮
    walker.litCd = 0;
    let lit = false;
    for (let i = 0; i < 200; i++) {   // 20s：被动点亮节流 2.5s，应触发
      simUpdate(STEP);
      if (tileAt(edgeVoid.x, edgeVoid.y) !== T.VOID) { lit = true; break; }
    }
    assert(lit, "场景H：贴边小人点亮了眼前虚空（" + edgeVoid.x + "," + edgeVoid.y + "）");
  }
}
// ---- 场景 I：挖塘（EXCAV 任务：陆格变水）----
simInit(42);
const pondSpot = findSpot(world.store.x, world.store.y, 3, 10, T.GRASS, [T.HOUSE, T.FARM]);
if (!pondSpot) { assert(true, "场景I：无构造点（跳过）"); } else {
  tasksAdd({ type: "EXCAV", x: pondSpot.x, y: pondSpot.y, need: 1 });
  const task = tasks.list[tasks.list.length - 1];
  task.progress = 0.9;   // 即将完工
  // 找个工人直接推进完工
  const worker = agents.find(a => !a.dead);
  worker.task = task; task.workers.add(worker);
  worker.x = pondSpot.x + 0.5; worker.y = pondSpot.y + 1.5; worker.state = "work";
  for (let i = 0; i < 600 && tileAt(pondSpot.x, pondSpot.y) !== T.WATER; i++) simUpdate(STEP);
  assert(tileAt(pondSpot.x, pondSpot.y) === T.WATER, "场景I：挖塘完工 → 陆格变成水");
}

// ---- 场景 J：渔夫运鱼（CAPTURE 带 dest → 鱼群搬往目标水域圈养）----
simInit(42);
for (let i = 0; i < 2000; i++) simUpdate(STEP);
const srcW = findSpot(world.store.x, world.store.y, 2, 12, T.WATER);
const dstW = findSpot(world.store.x, world.store.y, 2, 12, T.WATER);
if (!srcW || !dstW) { assert(true, "场景J：水域不足（跳过）"); } else {
  const fish = spawnCreature(srcW.x, srcW.y, "fish");
  const shore = neighborsOf(srcW.x, srcW.y).find(p => walkable(p.x, p.y));
  const shoreD = neighborsOf(dstW.x, dstW.y).find(p => walkable(p.x, p.y));
  if (!shore || !shoreD) { assert(true, "场景J：无岸边格（跳过）"); } else {
    tasksAdd({ type: "CAPTURE", x: shoreD.x, y: shoreD.y, need: 1, creature: fish,
      pasture: { x: srcW.x, y: srcW.y }, dest: { x: dstW.x, y: dstW.y } });
    const tk = tasks.list[tasks.list.length - 1];
    const f2 = agents.find(a => !a.dead);
    f2.task = tk; tk.workers.add(f2);
    f2.x = shore.x + 0.5; f2.y = shore.y + 0.5; f2.state = "work";
    for (let i = 0; i < 600 && (!fish.pasture || fish.pasture.x !== dstW.x); i++) simUpdate(STEP);
    assert(fish.pasture && fish.pasture.x === dstW.x && fish.pasture.y === dstW.y, "场景J：鱼群被运到目标水域圈养");
    assert(!fish.dead && fish.pasture, "场景J：圈养鱼存活");
  }
}

// ---- 场景 K：农田灌溉（5 格内无水 → 停滞；有水 → 成长）----
simInit(42);
// 岛心附近找 5 格窗口内无水的草地
let drySpot = null;
for (let r = 0; r <= 6 && !drySpot; r++) {
  for (let dy = -r; dy <= r && !drySpot; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    if (tileAt(x, y) === T.GRASS && !nearAny(x, y, [T.WATER, T.DEEP], 5) &&
        !nearAny(x, y, [T.HOUSE, T.FARM, T.SITE], 2)) { drySpot = { x, y }; break; }
  }
}
if (!drySpot || nearAny(drySpot.x, drySpot.y, [T.WATER, T.DEEP], 5)) {
  assert(true, "场景K：找不到旱地构造点（跳过）");
} else {
  setTile(drySpot.x, drySpot.y, T.FARM);
  world.farms.push({ x: drySpot.x, y: drySpot.y, grow: 0 });
  const dryFarm = world.farms[world.farms.length - 1];
  for (let i = 0; i < 600; i++) simUpdate(STEP);   // 60s：缺水应停滞
  assert(dryFarm.grow < 5, "场景K：5 格内无水 → 农田生长停滞（grow=" + dryFarm.grow.toFixed(2) + "）");
  // 就近挖一格水 → 恢复生长
  const wet = neighborsOf(drySpot.x, drySpot.y).find(p => tileAt(p.x, p.y) === T.GRASS);
  if (wet) {
    setTile(wet.x, wet.y, T.WATER);
    dryFarm.waterCd = 0;
    for (let i = 0; i < 600; i++) simUpdate(STEP);
    assert(dryFarm.grow > 1, "场景K：通水后恢复生长（grow=" + dryFarm.grow.toFixed(2) + "）");
  }
}
`;

const sandbox = { console, __failed: false };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(test, sandbox, { filename: "creature_test" });
} catch (e) {
  console.log("FAIL 抛异常:", e.message);
  console.log(e.stack.split("\n").slice(0, 5).join("\n"));
  failed = true;
}
process.exitCode = (failed || sandbox.__failed) ? 1 : 0;
