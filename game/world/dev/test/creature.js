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
// v0.5.0 生成含竹林/蘑菇（walk:false）：固定坐标不再保证是草地——动态找可栖息格
const cowSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "cow" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const oldCow = spawnCreature(cowSpot.x, cowSpot.y, "cow");
oldCow.age = SPECIES_AGE.cow.lifespan;   // 寿命已到
let died = false;
for (let i = 0; i < 9000; i++) {   // 900s：期望平均 3 天（180s）内离世
  oldCow.update(STEP);
  if (oldCow.dead) { died = true; break; }
}
assert(died, "场景A：寿命耗尽的牛自然老死");
assert(oldCow.deathReason === "寿终正寝", "场景A：老死死因标注 deathReason=寿终正寝（v0.6.2）");
const youngCow = spawnCreature(cowSpot.x, cowSpot.y, "cow");
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
assert(beachedWhale.deathReason === "搁浅身亡", "场景B：搁浅死因标注 deathReason=搁浅身亡（v0.6.2）");
assert((beachedWhale.strandT || 0) > SIM.ANIMAL_STRAND_DEATH - 5, "场景B：死亡前坚持时长符合设定");
const okWhale = spawnCreature(3, 3, "whale");
for (let i = 0; i < 300; i++) okWhale.update(STEP);
assert(!okWhale.dead, "场景B：未满坚持时长不死亡（对照）");

// ---- 场景 C：搁浅鲸被救援 ----
simInit(42);
for (let i = 0; i < 3000; i++) simUpdate(STEP);   // 预热世界
revealArea(world.store.x, world.store.y, 40);   // 探明周边海域（否则放归点 30 格内的深海未生成，findSpot(T.DEEP) 必败）
// 岛缘草地（确定性扫描，不用 rand——跨场景轨迹分叉下保持稳定）：小人可达且 30 格内有深海可放归
let beachSpot = null;
outerC:
for (let r = 4; r <= 10; r++) {   // 近圈：靠近聚落人群，救援响应快
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    // 岛缘草地（4 邻至少 3 格 GRASS 且紧邻深海 ≤3 格）：搬运路径极短，放归必然可达（不再依赖随机选点运气）
    const landN = neighborsOf(x, y).filter(p => tileAt(p.x, p.y) === T.GRASS).length;
    if (tileAt(x, y) === T.GRASS && walkable(x, y) && landN >= 3 &&
        nearAny(x, y, [T.DEEP], 3) && !nearAny(x, y, [T.HOUSE, T.FARM, T.SITE], 2)) {
      beachSpot = { x, y };
      break outerC;
    }
  }
}
if (!beachSpot) { assert(true, "场景C：无构造点（跳过）"); } else {
  const rescueWhale = spawnCreature(beachSpot.x, beachSpot.y, "whale");
  rescueWhale.strandT = 5;   // 已搁浅片刻（可被认领）
  // 断言只考察"认领搬运 → 放归"事件链（放归点需 30 格内有深海；放归后世界持续生成地形，鲸可能再次被困——真实行为）
  let rescued = false;
  for (let i = 0; i < 9000; i++) {   // 900s：认领+赶路+送回（搁浅死亡线 180s 内必须完成认领，之后是搬运余量）
    simUpdate(STEP);
    if (rescueWhale.rescuer || rescueWhale.carriedBy) rescued = true;
    if (rescued && !rescueWhale.carriedBy && world.logs.some(l => l.text.includes("送回了安全的栖息地"))) break;
  }
  assert(rescued, "场景C：小人认领并搬运了搁浅鲸");
  const logHit = world.logs.some(l => l.text.includes("送回了安全的栖息地"));
  assert(logHit, "场景C：鲸被送回栖息水域（放归日志凭证）");
}

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
  const st0 = ownerSettle(fw.x, fw.y);
  const food0 = st0 ? ensureStock(st0).food : 0;
  for (let i = 0; i < 1200; i++) farmFish.update(STEP);   // 120s：至少产一轮粮
  const food1 = st0 ? ensureStock(st0).food : 0;
  assert(food1 >= food0 + SIM.PASTURE_YIELD, "场景F：圈养鱼群定期产粮（+" + (food1 - food0) + "）");
  // 取整契约（死锁表 #14）：生物位置判定一律 Math.floor（round 在 ±0.5 行边界会误判搁浅；
  // v0.6.14 构造器 migNext randRange 的 rand 消耗漂移了游荡路径，此边界案例首次暴露）
  assert(habitatOk(farmFish, Math.floor(farmFish.x), Math.floor(farmFish.y)), "场景F：圈养鱼在水中游荡（不搁浅）");
}

// ---- 场景 G：渔船闭环（出港 → 捕捞 → 满舱返航卸货）----
simInit(42);
for (let i = 0; i < 4000; i++) simUpdate(STEP);
world.era = 1;
world.settlements.forEach(function (s) { ensureStock(s).food = 500; });
world.settlements.forEach(function (s) { ensureStock(s).wood = 200; });
jointStockDirty();   // 手动改库存后失效联合库存缓存
revealArea(world.store.x, world.store.y, 50);
// 保证有"邻水"码头（点亮范围变化可能让既有码头旁的水被填——悬空码头无法出港）
// 确定性圈扫描海岸草地，直接建码头
let gDock = world.docks.find(d => neighborsOf(d.x, d.y).some(p => tileAt(p.x, p.y) === T.WATER));
if (!gDock) {
  outerG:
  for (let r = 3; r <= 25; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = world.store.x + dx, y = world.store.y + dy;
      if (tileAt(x, y) === T.GRASS && walkable(x, y) &&
          neighborsOf(x, y).some(p => tileAt(p.x, p.y) === T.WATER) &&
          !nearAny(x, y, [T.HOUSE], 1)) {
        gDock = { x, y };
        setTile(x, y, T.DOCK);
        world.docks.push(gDock);
        break outerG;
      }
    }
  }
}
if (!gDock || world.fishStock.size === 0) {
  assert(true, "场景G：地理不满足（无临水格或无鱼点），跳过");
} else {
  let fisher = agents.find(x => !x.dead && !x.voyaging && (x.hobby === "fishing" || x.job === "fisher"));
  if (!fisher) {   // E1 探索者扩容可能抽走渔民：确定性指派一名（测试聚焦渔船机制本身）
    fisher = agents.find(x => !x.dead && !x.voyaging && x.job !== "explorer");
    if (fisher) fisher.hobby = "fishing";
  }
  if (!fisher) { assert(true, "场景G：无人选为渔民，跳过"); } else {
    fisher.x = gDock.x + 0.5; fisher.y = gDock.y + 0.5;
    const ok = fisher.startFishingTrip(gDock);
    if (!ok) console.log("DBG 场景G fail: dock=", JSON.stringify(gDock),
      "dockTile=", tileAt(gDock.x, gDock.y),
      "neigh=", JSON.stringify(neighborsOf(gDock.x, gDock.y).map(p => tileAt(p.x, p.y))),
      "wood=", jointStock("wood"), "fisher=", fisher.name, fisher.job, "state=", fisher.state,
      "voyaging=", fisher.voyaging, "ships=", world.ships.length,
      "fishStock=", world.fishStock.size);
    assert(ok, "场景G：渔民出港（渔船启动）");
    if (ok) {
      const boat = world.ships[world.ships.length - 1];
      assert(boat.boat === true && boat.state === "fishing", "场景G：渔船出海捕捞中");
      let harvested = false;
      for (let i = 0; i < 8000; i++) {   // 800s：一个航次（捕捞 ~100s + 航程 ~60s）绰绰有余
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

// ---- 场景 J：渔夫运鱼（CAPTURE 带 dest → 鱼群搬往目标水域圈养；结算为纯逻辑，直接驱动）----
simInit(42);
for (let i = 0; i < 2000; i++) simUpdate(STEP);
const srcW = findSpot(world.store.x, world.store.y, 2, 12, T.WATER);
const dstW = findSpot(world.store.x, world.store.y, 2, 12, T.WATER);
if (!srcW || !dstW) { assert(true, "场景J：水域不足（跳过）"); } else {
  const fish = spawnCreature(srcW.x, srcW.y, "fish");
  tasksAdd({ type: "CAPTURE", x: srcW.x, y: srcW.y, need: 1, creature: fish,
    pasture: { x: srcW.x, y: srcW.y }, dest: { x: dstW.x, y: dstW.y } });
  const tk = tasks.list[tasks.list.length - 1];
  tasksFinish(tk);   // 直接结算：鱼群应被搬往 dest 圈养
  assert(fish.pasture && fish.pasture.x === dstW.x && fish.pasture.y === dstW.y, "场景J：鱼群被运到目标水域圈养");
  assert(!fish.dead && fish.pasture, "场景J：圈养鱼存活");
  assert(tileAt(dstW.x, dstW.y) === T.WATER || tileAt(dstW.x, dstW.y) === T.DEEP, "场景J：目标水域仍是水");
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
    // farmTick 直驱（v0.6.18 接缝）：补粮门修复后世界显著繁荣，60s simUpdate 演化中填海/选址
    // 可能改写刚铺的水格致灌溉复检翻假（实测 grow 卡 0.40）——单元考察只驱动 farmTick 本身
    for (let i = 0; i < 600; i++) farmTick(STEP);
    assert(dryFarm.grow > 1, "场景K：通水后恢复生长（grow=" + dryFarm.grow.toFixed(2) + "）");
  }
}

// ---- 场景 L：牧场门与水生圈养排除（v0.5.3）----
simInit(42);
const pasSpot = findSpot(world.store.x, world.store.y, 3, 10, T.GRASS, [T.HOUSE, T.FARM]);
if (!pasSpot) { assert(true, "场景L：无构造点（跳过）"); } else {
  // ① 牧场完工：南侧留一道可走的门（牲畜可外出自由活动）
  tasksAdd({ type: "PASTURE", x: pasSpot.x, y: pasSpot.y, need: 1 });
  const pt = tasks.list[tasks.list.length - 1];
  pt.progress = pt.need;
  tasksFinish(pt);
  assert([[0,1],[-1,0],[1,0],[0,-1]].some(([dx,dy]) => tileAt(pasSpot.x+dx, pasSpot.y+dy) === T.GATE && walkable(pasSpot.x+dx, pasSpot.y+dy)),
    "场景L：牧场环上留有可走的门（GATE，牲畜可外出）");
  // ② 水生动物不会被立项圈进陆上牧场（渔场走水上路径 2d2）
  world.pastures.push({ x: pasSpot.x, y: pasSpot.y });
  const fishW = findSpot(pasSpot.x, pasSpot.y, 1, 8, T.WATER);
  if (!fishW) { assert(true, "场景L：牧场旁无水域（②跳过）"); } else {
    const fish2 = spawnCreature(fishW.x, fishW.y, "fish");
    plannerTick();
    assert(!tasks.list.some(t => t.type === "CAPTURE" && t.creature === fish2),
      "场景L：水生动物不会被立项圈进陆上牧场（渔场另有路径）");
  }
}

// ---- 场景 M：圈养散养（v0.6.2）——出栏远游（>6 格）、全程存活、自行回栏（4 格内）、位置始终合法 ----
simInit(42);
// 开阔地选址：15×15 窗口内草地/沙地占比过 2/3（散养 roam 11 需要开阔地形，水岸/建筑群会围死路径）
let mSpot = null, mOpen = -1;
for (let r = 3; r <= 16; r++) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    if (tileAt(x, y) !== T.GRASS || nearAny(x, y, [T.HOUSE, T.FARM, T.WATER, T.DEEP], 2)) continue;
    let open = 0;
    for (let yy = y - 7; yy <= y + 7; yy++) for (let xx = x - 7; xx <= x + 7; xx++) {
      const tt = tileAt(xx, yy);
      if (tt === T.GRASS || tt === T.SAND) open++;
    }
    if (open > mOpen) { mOpen = open; mSpot = { x, y }; }
  }
}
if (!mSpot || mOpen < 150) {
  assert(true, "场景M：无开阔构造点（跳过，最大开敞度 " + mOpen + "/225）");
} else {
  tasksAdd({ type: "PASTURE", x: mSpot.x, y: mSpot.y, need: 1 });
  const mt = tasks.list[tasks.list.length - 1];
  mt.progress = mt.need;
  tasksFinish(mt);
  const mCow = spawnCreature(mSpot.x, mSpot.y, "cow", true);   // 圈养于牧场
  mCow.age = 1.5;   // 幼年：关闭繁殖（breedAgeOk 门），保持单头确定性观测
  const mcx = mSpot.x + 0.5, mcy = mSpot.y + 0.5;
  let maxDist = 0, wentOut = false, cameBack = false, illegal = 0, aliveAll = true;
  for (let i = 0; i < 12000; i++) {   // 1200s：数十次 roam 目标重选，足够出栏+回栏
    mCow.update(STEP);
    const d = Math.hypot(mCow.x - mcx, mCow.y - mcy);
    if (d > maxDist) maxDist = d;
    if (d > 6) wentOut = true;
    else if (wentOut && d <= 4) cameBack = true;
    const tt = tileAt(Math.floor(mCow.x), Math.floor(mCow.y));
    if (!TILE_META[tt].walk) illegal++;
    if (mCow.dead) { aliveAll = false; break; }
  }
  assert(maxDist > 6, "场景M：散养牛出栏远游（最远距牧场中心 " + maxDist.toFixed(1) + " 格 > 6）");
  assert(aliveAll, "场景M：散养牛全程存活（圈养免搁浅、幼年不老死）");
  assert(wentOut && cameBack, "场景M：出栏后至少一次回到距栏 4 格内（回栏偏置生效）");
  assert(illegal === 0, "场景M：采样位置全部合法（floor 后 tile 均可走，非法采样 " + illegal + "）");
}

// ---- 场景 N：门通行（v0.6.2 moveBy 放行 GATE）——圈养牛自栏内穿门格到门外 ----
simInit(42);
let nSpot = null;
outerN:
for (let r = 3; r <= 16; r++) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    // 门默认开在南侧（ring 内 dx=0,dy=+1 且 GRASS/SAND 才入环）：y+1 门格、y+2/y+3 门外落点全须草地
    if (tileAt(x, y) === T.GRASS && tileAt(x, y + 1) === T.GRASS &&
        tileAt(x, y + 2) === T.GRASS && tileAt(x, y + 3) === T.GRASS &&
        !nearAny(x, y, [T.HOUSE, T.FARM], 2)) { nSpot = { x, y }; break outerN; }
  }
}
if (!nSpot) { assert(true, "场景N：无构造点（跳过）"); } else {
  tasksAdd({ type: "PASTURE", x: nSpot.x, y: nSpot.y, need: 1 });
  const nt = tasks.list[tasks.list.length - 1];
  nt.progress = nt.need;
  tasksFinish(nt);
  const nGate = { x: nSpot.x, y: nSpot.y + 1 };
  assert(tileAt(nGate.x, nGate.y) === T.GATE, "场景N：南侧门格已立起（GATE）");
  const nCow = spawnCreature(nSpot.x, nSpot.y, "cow", true);   // 置于栏心（门内侧相邻格）
  const outside = { x: nSpot.x + 0.5, y: nSpot.y + 3.5 };      // 门外两格的中心
  let crossed = false, out2 = false, fenceHit = false;
  for (let i = 0; i < 400 && !out2; i++) {
    nCow.target = outside;                     // 手动锁定目标（不走 update，防 roam 改写目标）
    nCow.stepToward(nCow.target, 0.05);        // 反复步进：moveBy 的 GATE 放行是本场景被测接缝
    const fx = Math.floor(nCow.x), fy = Math.floor(nCow.y);
    if (fx === nGate.x && fy === nGate.y) crossed = true;
    if (fx === nSpot.x && fy === nSpot.y + 2) out2 = true;
    if (tileAt(fx, fy) === T.FENCE) fenceHit = true;
  }
  assert(crossed, "场景N：牛穿过 GATE 门格（floor 坐标曾落在门格）");
  assert(out2, "场景N：牛到达门外格");
  assert(!fenceHit, "场景N：全程未踏入围栏格");
  assert(!!nCow.pasture && !nCow.dead, "场景N：牛保持圈养身份存活");
}

// ---- 场景 O：育龄门（v0.6.2 breedAgeOk）——单元探针 + 圈养繁殖集成探针 ----
assert(breedAgeOk({ type: "cow", age: 1 }) === false, "场景O：幼年牛（age 1 < stages[0]=2）不育");
assert(breedAgeOk({ type: "cow", age: 5 }) === true, "场景O：壮年牛（age 5 ∈ [2,12)）可育");
assert(breedAgeOk({ type: "cow", age: 12.5 }) === false, "场景O：老年牛（age 12.5 ≥ stages[2]=12）停育");
assert(breedAgeOk({ type: "nonexistentbeast", age: 3 }) === true, "场景O：无寿命表物种兜底不限育");
simInit(42);
const oSpot = findSpot(world.store.x, world.store.y, 3, 12, T.GRASS, [T.HOUSE, T.FARM]);
if (!oSpot) { assert(true, "场景O：无构造点（跳过）"); } else {
  tasksAdd({ type: "PASTURE", x: oSpot.x, y: oSpot.y, need: 1 });
  const ot = tasks.list[tasks.list.length - 1];
  ot.progress = ot.need;
  tasksFinish(ot);
  const penCount = () => creatures.filter(c => !c.dead && c.type === "cow" && c.pasture &&
    c.pasture.x === oSpot.x && c.pasture.y === oSpot.y).length;
  const oCow = spawnCreature(oSpot.x, oSpot.y, "cow", true);
  oCow.age = 1; oCow.breedCd = 0;
  for (let i = 0; i < 80; i++) { oCow.breedCd = 0; oCow.update(STEP); }   // 强制 80 轮繁殖判定（对冲 BREED_CHANCE 概率）
  assert(penCount() === 1, "场景O：幼年圈养牛 80 轮强制繁殖判定 → 同牧场同种数量不增（" + penCount() + "）");
  oCow.age = 5;
  for (let i = 0; i < 80; i++) { oCow.breedCd = 0; oCow.update(STEP); }
  assert(penCount() >= 2, "场景O：育龄圈养牛 80 轮强制繁殖判定 → 至少繁殖出一只（现存 " + penCount() + "）");
}

// ---- 场景 P：deathReason 标注（v0.6.2）——老死大 dt 驱动 + 狩猎/钓起直接结算 ----
simInit(42);
const pSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "cow" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const pCow = spawnCreature(pSpot.x, pSpot.y, "cow");
pCow.age = SPECIES_AGE.cow.lifespan;   // 寿命拉满
let pDied = false;
for (let i = 0; i < 20 && !pDied; i++) {   // dt=DAY_LEN → 每步老死概率恰 1/3（dt/(DAY_LEN*3)），20 步漏网仅 0.03%
  pCow.update(SIM.DAY_LEN);
  pDied = pCow.dead;
}
assert(pDied && pCow.deathReason === "寿终正寝", "场景P：大 dt 驱动老死，deathReason=寿终正寝");
simInit(42);
const hSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "deer" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const hunted = spawnCreature(hSpot.x, hSpot.y, "deer");
const hunter = agents.find(a => !a.dead);
tasksFinish({ type: "HUNT", x: hSpot.x, y: hSpot.y, need: 1, creature: hunted, workers: new Set() }, hunter, null);
assert(hunted.dead && hunted.deathReason === "被狩猎", "场景P：狩猎结算标注 deathReason=被狩猎");
const kW = findSpot(world.store.x, world.store.y, 2, 12, T.WATER);
if (!kW) { assert(true, "场景P：无水域（钓起探针跳过）"); } else {
  const koi = spawnCreature(kW.x, kW.y, "koi");
  // 清走 kW 1.5 格内旁站的其他珍稀鱼（v0.6.18 接缝：世界随机流漂移后初始 moonfish 可能恰好
  // 落在选中的水格旁——tasksFinish 的 rare 扫描按 creatures 顺序取第一个命中者，koi 会被截胡）
  for (const c of creatures) {
    if (!c.dead && c !== koi && CREATURE_META[c.type].rare && CREATURE_META[c.type].fishJoy &&
        Math.hypot(c.x - kW.x - 0.5, c.y - kW.y - 0.5) < 1.5) c.dead = true;
  }
  const fisher = agents.find(a => !a.dead);
  tasksFinish({ type: "FISH", x: kW.x, y: kW.y, fishX: kW.x, fishY: kW.y, need: 1, workers: new Set() }, fisher, null);
  assert(koi.dead && koi.deathReason === "被钓起", "场景P：珍稀渔获标注 deathReason=被钓起");
}
// ---- 场景 Q：马驯化（v0.6.10 tamable 马）——贴近累积 tameness → tamed/owner；isWild 口径翻转；爱牲畜 ×2 速率 ----
simInit(42);
const qSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "horse" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const qHorse = spawnCreature(qSpot.x, qSpot.y, "horse");
assert(qHorse.isWild() === true, "场景Q：野马初始算野生动物（isWild 含未驯化 tamable）");
const qTamer = agents.find(a => !a.dead);
qTamer.hobby = "animal"; qTamer.mood = 50;
qTamer.x = qSpot.x + 0.5; qTamer.y = qSpot.y + 0.9;   // 0.4 格：驯化半径 1.5 内
for (const a of agents) if (a !== qTamer && Math.hypot(a.x - qHorse.x, a.y - qHorse.y) < 4) { a.x += 12; a.y += 12; }
let qSteps = -1;
for (let i = 0; i < 200 && qSteps < 0; i++) {
  qHorse.update(STEP);
  qHorse.x = qSpot.x + 0.5; qHorse.y = qSpot.y + 0.5;   // 钉住游荡：单变量考察驯化累积
  if (qHorse.tamed) qSteps = i + 1;
}
assert(qSteps > 0 && qHorse.owner === qTamer, "场景Q：贴近野马驯化成立（tamed 且 owner 回指）");
assert(qSteps >= 13 && qSteps <= 22, "场景Q：爱牲畜者驯化速率 ×2（3/(0.1×2)=15 步，实测 " + qSteps + "）");
assert(Math.abs(qTamer.mood - 70) < 0.01, "场景Q：驯化喜悦 tameJoy=20 入账（mood 50→" + qTamer.mood + "）");
assert(qHorse.isWild() === false, "场景Q：驯化认主后不再算野生动物（v0.6.10 isWild 口径）");
// 对照：非爱牲畜者速率 ×1（30 步）
let qSpot2 = null;
for (let dy = 4; dy <= 10 && !qSpot2; dy++) if (habitatOk({ type: "horse" }, qSpot.x, qSpot.y + dy)) qSpot2 = { x: qSpot.x, y: qSpot.y + dy };
if (!qSpot2) qSpot2 = { x: qSpot.x + 4, y: qSpot.y };
const qHorse2 = spawnCreature(qSpot2.x, qSpot2.y, "horse");
const qOther = agents.find(a => !a.dead && a !== qTamer);
qOther.hobby = "none";
qOther.x = qSpot2.x + 0.5; qOther.y = qSpot2.y + 0.9;
for (const a of agents) if (a !== qOther && a !== qTamer && Math.hypot(a.x - qHorse2.x, a.y - qHorse2.y) < 4) { a.x += 12; a.y += 12; }
let qSteps2 = -1;
for (let i = 0; i < 400 && qSteps2 < 0; i++) {
  qHorse2.update(STEP);
  qHorse2.x = qSpot2.x + 0.5; qHorse2.y = qSpot2.y + 0.5;
  if (qHorse2.tamed) qSteps2 = i + 1;
}
assert(qSteps2 >= 26 && qSteps2 <= 40, "场景Q：对照非爱牲畜者 3/(0.1×1)=30 步（实测 " + qSteps2 + "）");

// ---- 场景 R：骑乘冻结（v0.6.10）——riddenBy 中坐标不改、老死骰不掷；骑手死亡解除并恢复老死 ----
simInit(42);
const rSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "horse" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const rHorse = spawnCreature(rSpot.x, rSpot.y, "horse");
const rRider = agents.find(a => !a.dead);
rHorse.tamed = true; rHorse.owner = rRider;
rHorse.riddenBy = rRider;
rHorse.age = SPECIES_AGE.horse.lifespan;   // 寿命拉满
const rx0 = rHorse.x, ry0 = rHorse.y;
let rDied = false;
for (let i = 0; i < 3000; i++) {   // 300s >> 平均 3 天老死窗（180s）：骑乘冻结下必不死
  rHorse.update(STEP);
  if (rHorse.dead) { rDied = true; break; }
}
assert(!rDied, "场景R：骑乘中老死骰不掷（寿命拉满 300s 仍存活）");
assert(rHorse.x === rx0 && rHorse.y === ry0, "场景R：骑乘中坐标不被生物自身改动（由骑手同步）");
rRider.dead = true;
rHorse.update(STEP);
assert(rHorse.riddenBy === null, "场景R：骑手死亡 → riddenBy 解除");
let rDied2 = false;
for (let i = 0; i < 20 && !rDied2; i++) {   // dt=DAY_LEN → 每步老死概率 1/3（照场景 P 口径）
  rHorse.update(SIM.DAY_LEN);
  if (rHorse.dead) rDied2 = true;
}
assert(rDied2 && rHorse.deathReason === "寿终正寝", "场景R：解除后恢复常规老死（寿终正寝）");

// ---- 场景 S：回栏受阻退避（v0.6.8）——离栏 >6 且山墙阻隔 → 退避随机游走，不再无限顶墙 ----
simInit(42);
let sSpot = null, sOpen = -1;
for (let r = 3; r <= 16; r++) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    if (tileAt(x, y) !== T.GRASS || nearAny(x, y, [T.HOUSE, T.FARM, T.WATER, T.DEEP], 2)) continue;
    let open = 0;
    for (let yy = y - 7; yy <= y + 7; yy++) for (let xx = x - 7; xx <= x + 7; xx++) {
      const tt = tileAt(xx, yy);
      if (tt === T.GRASS || tt === T.SAND) open++;
    }
    if (open > sOpen) { sOpen = open; sSpot = { x, y }; }
  }
}
if (!sSpot || sOpen < 150) {
  assert(true, "场景S：无开阔构造点（跳过，最大开敞度 " + sOpen + "/225）");
} else {
  tasksAdd({ type: "PASTURE", x: sSpot.x, y: sSpot.y, need: 1 });
  const sT = tasks.list[tasks.list.length - 1];
  sT.progress = sT.need;
  tasksFinish(sT);
  const sCow = spawnCreature(sSpot.x, sSpot.y, "cow", true);
  sCow.age = 1.5;   // 幼年：关闭繁殖，单头确定性观测
  const sFar = { x: sSpot.x, y: sSpot.y + 10 };       // 远置 10 格（>6 触发确定性回栏）
  setTile(sFar.x, sFar.y, T.GRASS);
  for (let dx = -4; dx <= 4; dx++) setTile(sSpot.x + dx, sSpot.y + 5, T.MOUNTAIN);   // 拦死回栏直线
  sCow.x = sFar.x + 0.5; sCow.y = sFar.y + 0.5;
  const scx = sSpot.x + 0.5, scy = sSpot.y + 0.5;
  const sd0 = Math.hypot(sCow.x - scx, sCow.y - scy);
  const seen = new Set();
  let sMinD = sd0, sCum = 0, sAlive = true, sPrev = { x: sCow.x, y: sCow.y };
  for (let i = 0; i < 6000; i++) {   // 600s：退避后数十次 roam 重选（对照旧行为原地卡死）
    sCow.update(STEP);
    sCum += Math.hypot(sCow.x - sPrev.x, sCow.y - sPrev.y);
    sPrev = { x: sCow.x, y: sCow.y };
    seen.add(Math.round(sCow.x * 2) + "," + Math.round(sCow.y * 2));
    const d = Math.hypot(sCow.x - scx, sCow.y - scy);
    if (d < sMinD) sMinD = d;
    if (sCow.dead) { sAlive = false; break; }
  }
  assert(sAlive, "场景S：受阻退避牛全程存活");
  assert(seen.size >= 8 || sCum >= 20 || sMinD < sd0 - 2,
    "场景S：山墙阻隔不再无限顶墙（位置多样性 " + seen.size + " / 累计位移 " + sCum.toFixed(1) +
    " / 最近距栏 " + sMinD.toFixed(1) + "，对照旧行为卡死在墙前）");
}

// ---- 场景 T：pasturePassable 单元探针（v0.6.8）——圈养放行口径统一 ----
simInit(42);
{
  const bx = world.store.x + 40;
  setTile(bx, 0, T.GRASS); setTile(bx + 1, 0, T.GATE); setTile(bx + 2, 0, T.PASTURE);
  setTile(bx + 3, 0, T.MOUNTAIN); setTile(bx + 4, 0, T.WATER);
  const pCow = { type: "cow", pasture: { x: 0, y: 0 } };
  const wCow = { type: "cow" };
  const pFish = { type: "fish", pasture: { x: 0, y: 0 } };
  assert(pasturePassable(pCow, bx, 0) === true, "场景T：圈养牛 GRASS 真（栖息地同源）");
  assert(pasturePassable(pCow, bx + 1, 0) === true, "场景T：圈养牛 GATE 真（门放行）");
  assert(pasturePassable(pCow, bx + 2, 0) === true, "场景T：圈养牛 PASTURE 真（栏内放行）");
  assert(pasturePassable(pCow, bx + 3, 0) === false, "场景T：圈养牛 MOUNTAIN 假");
  assert(pasturePassable(pCow, bx + 4, 0) === false, "场景T：圈养牛 WATER 假");
  assert(pasturePassable(wCow, bx, 0) === true, "场景T：非圈养牛 GRASS 真（栖息地不变）");
  assert(pasturePassable(wCow, bx + 1, 0) === false, "场景T：非圈养生物 GATE 假（野生语义零改动）");
  assert(pasturePassable(wCow, bx + 2, 0) === false, "场景T：非圈养生物 PASTURE 假");
  assert(pasturePassable(pFish, bx + 4, 0) === true, "场景T：圈养鱼 WATER 真（栖息地同源）");
}

// ---- 场景 U：迁徙（v0.6.14）——migNext 到期触发 / 朝目标位移 / 被挡绕行 / 到达重排 ----
// U1 触发与目标成立：migNext 置过期，逐步强制重掷（tryMigrate 0.5 概率弃权，200 步内必触发）
simInit(42);
const uSpot = (function () {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (habitatOk({ type: "deer" }, 4 + dx, 4 + dy)) return { x: 4 + dx, y: 4 + dy };
  }
  return { x: 4, y: 4 };
})();
const uDeer = spawnCreature(uSpot.x, uSpot.y, "deer");
assert(uDeer.migEligible() === true, "场景U：野生鹿具备迁徙资格（物种表 + 非圈养 + 未驯化）");
assert(uDeer.migration === null && uDeer.migNext > world.time, "场景U：初始定居态（migration 空 / migNext 在未来）");
let uRolls = 0;
while (!uDeer.migration && uRolls < 200) {
  uDeer.migNext = world.time - 1;   // 强制到期（tryMigrate 内先重排周期再掷 0.5 弃权）
  uDeer.update(STEP);
  uRolls++;
}
assert(!!uDeer.migration, "场景U：migNext 到期触发迁徙（目标已立，" + uRolls + " 步内掷中）");
const uDist = Math.hypot(uDeer.migration.x - uDeer.x, uDeer.migration.y - uDeer.y);
assert(uDist >= SIM.MIGRATION_DIST_MIN - 5 && uDist <= SIM.MIGRATION_DIST_MAX + 5,
  "场景U：迁徙目标距离在 30~80 格口径内（实测 " + uDist.toFixed(1) + "）");
// U2 朝目标位移 + 必然终止：迁徙朝目标逼近（30~80 格直奔段），且每轮必然结束
//（到达 / 中转安家 / 受阻放弃三出口——400s 窗内每轮 migration 必清空，无永久打转）。
// 受阻就地放弃是合法出口（v0.6.14 兜底设计），可能单轮仅挪 2~3 格——累计位移 ≤5 时强制再行
//（真实迁徙单轮即 30+ 格；3 轮仍 ≤5 才是死锁信号），逼近口径取各轮迁徙目标的最优逼近
const uD0 = uDist;
let uMin = Infinity, uCum = 0, uPrev = { x: uDeer.x, y: uDeer.y };
let uRounds = 0;
while (uCum <= 5 && uRounds < 3) {
  uRounds++;
  let uGuard = 0;
  while (!uDeer.migration && uGuard++ < 200) { uDeer.migNext = world.time - 1; uDeer.update(STEP); }   // 成行（0.5 弃权逐步重掷）
  const uTgt2 = { x: uDeer.migration.x, y: uDeer.migration.y };
  let uMin2 = Math.hypot(uTgt2.x - uDeer.x, uTgt2.y - uDeer.y);
  for (let i = 0; i < 4000 && uDeer.migration; i++) {
    uDeer.update(STEP);
    uCum += Math.hypot(uDeer.x - uPrev.x, uDeer.y - uPrev.y);
    uPrev = { x: uDeer.x, y: uDeer.y };
    if (uDeer.migration) uMin2 = Math.min(uMin2, Math.hypot(uTgt2.x - uDeer.x, uTgt2.y - uDeer.y));
  }
  uMin = Math.min(uMin, uMin2);
}
for (let i = 0; i < 4000 && uDeer.migration; i++) uDeer.update(STEP);   // 收尾：在途轮次必然终止
assert(!uDeer.dead, "场景U：迁徙全程存活");
assert(uCum > 5,
  "场景U：迁徙真实发生（累计位移 " + uCum.toFixed(1) + " 格 > 5，" + uRounds + " 轮内；受阻放弃合法，死锁信号是 ≈0 位移且永不终止）");
assert(uMin < uD0 - 1,
  "场景U：朝目标位移（各轮迁徙目标最近逼近 " + (uD0 - uMin).toFixed(1) + " 格）");
assert(!uDeer.migration, "场景U：本轮迁徙必然终止（migration 已清空，无永久打转）");
if (!uDeer.migration) {
  assert(uDeer.migNext > world.time, "场景U：结束后 migNext 重排到未来周期");
}
// U3 被挡绕行：山墙拦死直线路径 → 切向中转点绕行/安家——不死锁（有位移有落脚多样性）且必然终止
simInit(42);
let uSpot2 = null, uOpen = -1;
for (let r = 6; r <= 16; r++) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = world.store.x + dx, y = world.store.y + dy;
    if (tileAt(x, y) !== T.GRASS || nearAny(x, y, [T.HOUSE, T.FARM, T.WATER, T.DEEP], 2)) continue;
    let open = 0;
    for (let yy = y - 8; yy <= y + 8; yy++) for (let xx = x - 8; xx <= x + 8; xx++) {
      const tt = tileAt(xx, yy);
      if (tt === T.GRASS || tt === T.SAND) open++;
    }
    if (open > uOpen) { uOpen = open; uSpot2 = { x, y }; }
  }
}
if (!uSpot2 || uOpen < 180) {
  assert(true, "场景U-绕行：无开阔构造点（跳过，最大开敞度 " + uOpen + "/289）");
} else {
  const wx = uSpot2.x + 3;
  setTile(uSpot2.x, uSpot2.y, T.GRASS); setTile(uSpot2.x + 6, uSpot2.y, T.GRASS);
  for (let dy = -7; dy <= 7; dy++) setTile(wx, uSpot2.y + dy, T.MOUNTAIN);   // 拦死直线
  const uDeer2 = spawnCreature(uSpot2.x + 0.5, uSpot2.y + 0.5, "deer");
  uDeer2.migration = { x: uSpot2.x + 6.5, y: uSpot2.y + 0.5 };   // 直达目标在墙另一侧
  const uT2 = { x: uSpot2.x + 6.5, y: uSpot2.y + 0.5 };
  const uD2 = Math.hypot(uT2.x - uDeer2.x, uT2.y - uDeer2.y);
  const seen2 = new Set();
  let uCum2 = 0, uRetgt = 0, uPrev2 = { x: uDeer2.x, y: uDeer2.y };
  for (let i = 0; i < 4000 && uDeer2.migration; i++) {
    uDeer2.update(STEP);
    uCum2 += Math.hypot(uDeer2.x - uPrev2.x, uDeer2.y - uPrev2.y);
    uPrev2 = { x: uDeer2.x, y: uDeer2.y };
    seen2.add(Math.round(uDeer2.x * 2) + "," + Math.round(uDeer2.y * 2));
    if (uDeer2.migration && Math.hypot(uDeer2.migration.x - uT2.x, uDeer2.migration.y - uT2.y) > 1) uRetgt++;
  }
  const uD3 = Math.hypot(uT2.x - uDeer2.x, uT2.y - uDeer2.y);
  assert(!uDeer2.dead, "场景U-绕行：山墙阻隔下全程存活");
  assert(uCum2 > 5 && seen2.size >= 5,
    "场景U-绕行：不死锁（累计位移 " + uCum2.toFixed(1) + " / 位置多样性 " + seen2.size + "；真死锁信号是 ≈0 位移+原地钉死）");
  assert(uRetgt >= 1 || uD3 < uD2 - 2,
    "场景U-绕行：切向中转重排或绕行推进（重排 " + uRetgt + " 次 / 剩余 " + uD3.toFixed(1) + "，初距 " + uD2.toFixed(1) + "）");
  assert(!uDeer2.migration, "场景U-绕行：山墙下本轮迁徙必然终止（无永久打转）");
}
// U4 到达结算：近距直达目标 → migration 清空 + migNext 重排 + 落点贴合
simInit(42);
// 注：carveRiver 走 rand()（非 hash）——simInit 的流位随前序场景漂移，重生成世界的地形与 U1 不同，
// 不可复用 uSpot 坐标（曾漂成水面格 → 鹿出生即搁浅、strand「原地等待」挡死迁徙分支）。现场重扫：
const uSpot3 = (function () {
  for (let r = 0; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    // 直线上 4 格全栖息地可达：保证 3 格直奔无阻（中转安家会让「落点贴合」失真）
    let ok = true;
    for (let k = 0; k <= 3 && ok; k++) if (!habitatOk({ type: "deer" }, 4 + dx + k, 4 + dy)) ok = false;
    if (ok) return { x: 4 + dx, y: 4 + dy };
  }
  return null;
})();
if (!uSpot3) { assert(true, "场景U-到达：无 3 格连通草地（地理罕见，跳过）"); } else {
const uDeer3 = spawnCreature(uSpot3.x, uSpot3.y, "deer");
setTile(uSpot3.x + 3, uSpot3.y, T.GRASS);
uDeer3.migration = { x: uSpot3.x + 3.5, y: uSpot3.y + 0.5 };
for (let i = 0; i < 300 && uDeer3.migration; i++) uDeer3.update(STEP);
assert(!uDeer3.migration, "场景U：3 格近距目标到达后 migration 清空");
assert(Math.hypot(uDeer3.x - (uSpot3.x + 3.5), uDeer3.y - (uSpot3.y + 0.5)) < 0.6,
  "场景U：到达落点贴合目标（偏移 " + Math.hypot(uDeer3.x - (uSpot3.x + 3.5), uDeer3.y - (uSpot3.y + 0.5)).toFixed(2) + "）");
assert(uDeer3.migNext > world.time, "场景U：到达后 migNext 重排到下个迁徙周期");
}

// ---- 场景 V：migEligible 资格口径（v0.6.14）——驯化/圈养/非迁徙物种排除，bird 走物种表不走 isWild ----
simInit(42);
{
  const vDeer = spawnCreature(uSpot.x, uSpot.y, "deer");
  const vHorse = spawnCreature(uSpot.x, uSpot.y, "horse");
  assert(vDeer.migEligible() && vDeer.isWild(), "场景V：野生鹿 eligible+isWild 双真");
  assert(vHorse.migEligible() && vHorse.isWild(), "场景V：未驯化马 eligible+isWild 双真（驯化前仍是野生动物）");
  vHorse.tamed = true; vHorse.owner = agents[0];
  assert(!vHorse.migEligible() && !vHorse.isWild(), "场景V：驯化认主的马永不迁徙（tamed 排除）");
  const vDog = spawnCreature(uSpot.x, uSpot.y, "dog");
  vDog.tamed = true; vDog.owner = agents[0];
  assert(!vDog.migEligible(), "场景V：驯化狗不迁徙（物种表外 + tamed 双排除）");
  const vCow = spawnCreature(uSpot.x, uSpot.y, "cow", true);
  assert(vCow.pasture && !vCow.migEligible(), "场景V：圈养牛不迁徙（pasture 排除）");
  const vFish = spawnCreature(uSpot.x, uSpot.y, "fish");
  const vTurtle = spawnCreature(uSpot.x, uSpot.y, "turtle");
  assert(!vFish.migEligible() && !vTurtle.migEligible(), "场景V：鱼群/海龟不迁徙（物种表外，永不）");
  const vWhale = spawnCreature(3, 3, "whale");
  assert(vWhale.migEligible() && vWhale.isWild(), "场景V：深海鲸 eligible+isWild 双真");
  const vBird = spawnCreature(uSpot.x, uSpot.y, "bird");
  assert(vBird.migEligible() === true, "场景V：候鸟具备迁徙资格（物种表内）");
  assert(vBird.isWild() === false, "场景V：bird 不走 isWild 口径（恒排除）——资格只按物种表判定（结构性差异）");
}

// ---- 场景 W0：均衡公式单 tick 直驱（v0.6.17）——expected = pop×120÷寿命秒×WILD_BREED_SAFETY。
// 压缩时钟（寿命 0.5 游戏年 = 540s）把单 tick 出生量放大到可断言粒度：
// floor + 概率进位取整 → 出生 ∈ {floor(exp), floor(exp)+1}（cap/护栏预置不钳、选址充足不 break）
simInit(42);
{
  const __w0fAge = SPECIES_AGE.fish, __w0fCap = SIM.SPECIES_CAP.fish;
  SPECIES_AGE.fish = { name: "鱼群", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };   // 寿命秒 = 0.5×90×12 = 540
  SIM.SPECIES_CAP.fish = 120;   // 同 W1：初始 60=cap 会钳死一切出生（生产路径初始必低于 cap，不构造该病态）
  const w0w = findSpot(world.store.x, world.store.y, 5, 40, T.WATER);
  if (!w0w) { assert(true, "场景W0：无水域（地理罕见，跳过）"); } else {
    let w0g = 0;
    while (creatures.filter(c => c.type === "fish" && !c.dead).length < 60 && w0g++ < 300) {
      const p = findSpot(w0w.x, w0w.y, 0, 8, T.WATER);
      if (!p) break;
      spawnCreature(p.x, p.y, "fish").age = 0.2;   // 全员育龄中段（breedAgeOk 命中）
    }
    const w0n = creatures.filter(c => c.type === "fish" && !c.dead).length;
    world.time = 240;   // 落进 wildBreedTick 的 120s 窗口门（time%120≤1）
    wildBreedTick();
    const w0Born = creatures.filter(c => c.type === "fish" && !c.dead).length - w0n;
    const w0Exp = w0n * 120 / 540 * SIM.WILD_BREED_SAFETY;   // 60 鱼期望 ≈16.67
    assert(w0Born >= Math.floor(w0Exp) && w0Born <= Math.floor(w0Exp) + 1,
      "场景W0：鱼均衡公式单 tick 直驱——floor(pop×120÷540×1.25)=" + Math.floor(w0Exp) +
      "±概率进位（期望 " + w0Exp.toFixed(2) + "，实测出生 " + w0Born + "）");
  }
  SIM.SPECIES_CAP.fish = __w0fCap; SPECIES_AGE.fish = __w0fAge;
  // 山羊同法（land 系物种：顺带验证 WILD_BREED_CAP 护栏不误拦——40+12 << 120）
  const __w0gAge = SPECIES_AGE.goat, __w0gCap = SIM.SPECIES_CAP.goat;
  SPECIES_AGE.goat = { name: "羊", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };
  SIM.SPECIES_CAP.goat = 60;   // 上调防钳（生产路径初始必低于 cap）
  const w0s = findSpot(world.store.x, world.store.y, 3, 14, T.GRASS);
  if (!w0s) { assert(true, "场景W0：无草地构造点（地理罕见，跳过）"); } else {
    let w0g2 = 0;
    while (creatures.filter(c => c.type === "goat" && !c.dead).length < 40 && w0g2++ < 300) {
      const p = findSpot(w0s.x, w0s.y, 0, 10, T.GRASS);
      if (!p) break;
      spawnCreature(p.x, p.y, "goat").age = 0.2;
    }
    const w0n2 = creatures.filter(c => c.type === "goat" && !c.dead).length;
    world.time = 480;   // 新的 120s 窗口（与上一 tick 分离）
    wildBreedTick();
    const w0Born2 = creatures.filter(c => c.type === "goat" && !c.dead).length - w0n2;
    const w0Exp2 = w0n2 * 120 / 540 * SIM.WILD_BREED_SAFETY;   // 40 羊期望 ≈11.11
    assert(w0Born2 >= Math.floor(w0Exp2) && w0Born2 <= Math.floor(w0Exp2) + 1,
      "场景W0：山羊均衡公式单 tick 直驱——floor(pop×120÷540×1.25)=" + Math.floor(w0Exp2) +
      "±概率进位（期望 " + w0Exp2.toFixed(2) + "，实测出生 " + w0Born2 + "，护栏不误拦）");
  }
  SPECIES_AGE.goat = __w0gAge; SIM.SPECIES_CAP.goat = __w0gCap;
}

// ---- 场景 W1：鱼群均衡（v0.6.17）——压缩时钟（寿命 5 游戏年 → 0.5 年 = 540s），
// 60 鱼跑 2500s ≈ 4.6 个世代：旧版结构必崩（全局池抽亲追不上死亡率），新版种群应稳在 cap ±40% 带内
simInit(42);
const __w1FishAge = SPECIES_AGE.fish, __w1Cap = SIM.SPECIES_CAP.fish;
SPECIES_AGE.fish = { name: "鱼群", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };   // 540s 寿命 / 54~486s 育龄窗
SIM.SPECIES_CAP.fish = 120;   // cap 上调留出生余量：初始 60 = cap 时钳制会禁一切出生→同龄群同步老化塌陷（生产路径初始必低于 cap，不会构造该病态）
const w1w = findSpot(world.store.x, world.store.y, 5, 40, T.WATER);
if (!w1w) { assert(true, "场景W1：无水域（地理罕见，跳过）"); SIM.SPECIES_CAP.fish = __w1Cap; SPECIES_AGE.fish = __w1FishAge; } else {
  let w1Guard = 0;
  while (creatures.filter(c => c.type === "fish" && !c.dead).length < 60 && w1Guard++ < 300) {
    const p = findSpot(w1w.x, w1w.y, 0, 8, T.WATER);
    if (!p) break;
    const f = spawnCreature(p.x, p.y, "fish");
    f.age = rand() * 0.36;   // 初始世代错峰（防同龄同死瞬灭）
  }
  const w1N = () => creatures.filter(c => c.type === "fish" && !c.dead).length;
  let w1Min = w1N();
  for (let i = 0; i < 25000; i++) {   // 2500s
    world.time += STEP;
    for (const c of creatures) if (c.type === "fish") c.update(STEP);
    wildBreedTick();   // 生产口径逐帧调用（120s 窗口门在函数内）
    if (i % 600 === 0) { const n = w1N(); if (n < w1Min) w1Min = n; }
  }
  const w1End = w1N();
  assert(w1End >= 36 && w1End <= 122,
    "场景W1：鱼群 2500s（4.6 代）种群维持（末值 " + w1End + " / 初值 60——历史旧版崩溃至 ≈0）");
  assert(w1Min >= 36, "场景W1：全程采样低谷 ≥36（初值 ±40% 带宽，实测低谷 " + w1Min + "）");
  SIM.SPECIES_CAP.fish = __w1Cap;
  SPECIES_AGE.fish = __w1FishAge;
}

// ---- 场景 W2：山羊/鹿同口径短验（压缩时钟 1500s ≈ 2.8 代）----
simInit(42);
const __w2Goat = SPECIES_AGE.goat, __w2Deer = SPECIES_AGE.deer;
const __w2GoatCap = SIM.SPECIES_CAP.goat, __w2DeerCap = SIM.SPECIES_CAP.deer;
SPECIES_AGE.goat = { name: "羊", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };
SPECIES_AGE.deer = { name: "鹿", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };
SIM.SPECIES_CAP.goat = 60; SIM.SPECIES_CAP.deer = 30;   // cap 上调留出生余量（同 W1：初始即 cap 会钳死出生→同龄塌陷）
const w2s = findSpot(world.store.x, world.store.y, 3, 14, T.GRASS);
if (!w2s) { assert(true, "场景W2：无草地构造点（地理罕见，跳过）");
  SIM.SPECIES_CAP.goat = __w2GoatCap; SIM.SPECIES_CAP.deer = __w2DeerCap; } else {
  for (const c of creatures) if (!c.dead && c.type !== "goat" && c.type !== "deer") c.dead = true;   // 清场：隔离山/鹿与护栏计数
  let w2Guard = 0;
  while (creatures.filter(c => c.type === "goat" && !c.dead).length < 40 && w2Guard++ < 300) {
    const p = findSpot(w2s.x, w2s.y, 0, 10, T.GRASS);
    if (!p) break;
    const g = spawnCreature(p.x, p.y, "goat");
    g.age = rand() * 0.36;
  }
  w2Guard = 0;
  while (creatures.filter(c => c.type === "deer" && !c.dead).length < 20 && w2Guard++ < 300) {
    const p = findSpot(w2s.x, w2s.y, 0, 10, T.GRASS);
    if (!p) break;
    const d = spawnCreature(p.x, p.y, "deer");
    d.age = rand() * 0.36;
  }
  for (const c of creatures) if (!c.dead && (c.type === "goat" || c.type === "deer") && c.age > 0.4) c.age = 0.2;
  let w2gMin = Infinity, w2dMin = Infinity;
  for (let i = 0; i < 15000; i++) {   // 1500s
    world.time += STEP;
    for (const c of creatures) if (!c.dead && (c.type === "goat" || c.type === "deer")) c.update(STEP);
    wildBreedTick();
    if (i % 300 === 0) {
      const ng = creatures.filter(c => c.type === "goat" && !c.dead).length;
      const nd = creatures.filter(c => c.type === "deer" && !c.dead).length;
      if (ng < w2gMin) w2gMin = ng;
      if (nd < w2dMin) w2dMin = nd;
    }
  }
  const w2gEnd = creatures.filter(c => c.type === "goat" && !c.dead).length;
  const w2dEnd = creatures.filter(c => c.type === "deer" && !c.dead).length;
  assert(w2gEnd >= 24 && w2gMin >= 24,
    "场景W2：山羊 1500s 维持（末 " + w2gEnd + " 谷 " + w2gMin + " / 初值 40 的 ±40% 带 ≥24）");
  assert(w2dEnd >= 12 && w2dMin >= 12,
    "场景W2：鹿 1500s 维持（末 " + w2dEnd + " 谷 " + w2dMin + " / 初值 20 的 ±40% 带 ≥12）");
  SIM.SPECIES_CAP.goat = __w2GoatCap;
  SIM.SPECIES_CAP.deer = __w2DeerCap;
}
SPECIES_AGE.goat = __w2Goat;
SPECIES_AGE.deer = __w2Deer;

// ---- 场景 W3：ECO_FLOOR 狩猎保护线——物种 ≤4 不立项新 HUNT/CAPTURE，>4 恢复 ----
simInit(42);
for (let i = 0; i < 3000; i++) simUpdate(STEP);   // 300s：任务队列消化到稳态
const __w3Anchor = pickAnchor;
pickAnchor = function () { return world.store; };   // 锚点钉死主仓（猎物必在 30 格搜索圈内）
for (const c of creatures) if (!c.dead) c.dead = true;   // 清场：全部标死（搜索圈只剩受控鹿）
// 死对象/无对象在办 HUNT/CAPTURE 立即确定性全摘——清场后任何在办狩猎都是污染源（对象已死
// 或引用为空的僵尸任务会占住 tasksPending 门挡新立项，随机流漂移下摘除轮数不可控）
for (const k of tasks.list) if (k.type === "HUNT" || k.type === "CAPTURE") k.done = true;
const w3s = findSpot(world.store.x, world.store.y, 3, 8, T.GRASS);
if (!w3s) { assert(true, "场景W3：无草地构造点（地理罕见，跳过）"); pickAnchor = __w3Anchor; } else {
  for (let i = 0; i < 4; i++) spawnCreature(w3s.x, w3s.y, "deer");
  world.settlements.forEach(function (s) { ensureStock(s).food = 0; });   // 粮食压力拉满（狩猎立项前置）
  jointStockDirty();
  for (let i = 0; i < 3; i++) plannerTick();   // 兜底清理：消化死猎物在办任务 + 温和立项尝试
  const w3Before = tasks.list.filter(t => t.type === "HUNT" || t.type === "CAPTURE").length;
  for (let i = 0; i < 20; i++) plannerTick();
  const w3Mid = tasks.list.filter(t => t.type === "HUNT" || t.type === "CAPTURE").length;
  assert(w3Mid === w3Before,
    "场景W3：物种 4 ≤ ECO_FLOOR → 无新 HUNT/CAPTURE 立项（在办 " + w3Before + "，20 轮规划后 " + w3Mid + "）");
  spawnCreature(w3s.x, w3s.y, "deer");   // 第 5 只：越线
  for (let i = 0; i < 20; i++) plannerTick();
  const w3After = tasks.list.filter(t => t.type === "HUNT" || t.type === "CAPTURE").length;
  assert(w3After > w3Mid,
    "场景W3：物种 5 > ECO_FLOOR → 狩猎立项恢复（" + w3Mid + " → " + w3After + "）");
  pickAnchor = __w3Anchor;
}

// ---- 场景 W4：驯服计入繁衍池——全群驯服的马仍繁衍，新崽落野生（驯化不再掏空野生种群）----
simInit(42);
const __w4Horse = SPECIES_AGE.horse;
SPECIES_AGE.horse = { name: "马", lifespan: 0.5, stages: [0.05, 0.15, 0.45] };
const w4s = findSpot(world.store.x, world.store.y, 3, 12, T.GRASS);
if (!w4s) { assert(true, "场景W4：无草地构造点（地理罕见，跳过）"); SPECIES_AGE.horse = __w4Horse; } else {
  const w4Owner = agents.find(a => !a.dead);
  const w4Horses = [];
  for (let i = 0; i < 6; i++) {
    const p = findSpot(w4s.x, w4s.y, 0, 6, T.GRASS) || w4s;
    const h = spawnCreature(p.x, p.y, "horse");
    h.tamed = true; h.owner = w4Owner; h.tameness = 3;
    h.age = rand() * 0.4;
    w4Horses.push(h);
  }
  assert(w4Horses.every(h => !h.isWild()),
    "场景W4：全群驯服 → isWild 全假（旧版此口径下繁衍池为空、种群必死）");
  for (let i = 0; i < 15000; i++) {   // 1500s：均衡出生应照常发生
    world.time += STEP;
    for (const h of w4Horses) h.update(STEP);
    wildBreedTick();
  }
  const w4Total = creatures.filter(c => c.type === "horse" && !c.dead).length;
  const w4Wild = creatures.filter(c => c.type === "horse" && !c.dead && c.isWild()).length;
  assert(w4Total > 6, "场景W4：驯服马种群仍繁衍（6 → " + w4Total + "，tamed 计入繁衍池）");
  assert(w4Wild > 0, "场景W4：新崽落野生（野生马 " + w4Wild + " 只）");
  SPECIES_AGE.horse = __w4Horse;
}

// ---- 场景 W5：迁徙周期口径（v0.6.17 修正 4~6 游戏月 = 360~540s）----
simInit(42);
const w5s = findSpot(world.store.x, world.store.y, 3, 12, T.GRASS);
if (w5s) {
  const w5Deer = spawnCreature(w5s.x, w5s.y, "deer");
  const w5T0 = world.time;
  w5Deer.migNext = w5T0;      // 强制到期
  w5Deer.tryMigrate();         // 重排在 50% 掷骰之前——未成行也完成重排
  const w5Gap = w5Deer.migNext - w5T0;
  assert(w5Gap >= SIM.MIGRATION_PERIOD_MIN - 0.01 && w5Gap <= SIM.MIGRATION_PERIOD_MAX + 0.01,
    "场景W5：迁徙重排间隔 ∈ [360,540]s（实测 " + w5Gap.toFixed(1) + "s ≈ " + (w5Gap / 90).toFixed(1) + " 游戏月）");
  assert(w5Deer.migNext > world.time, "场景W5：重排后 migNext 在未来（下个周期再掷）");
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
