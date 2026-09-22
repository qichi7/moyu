// headless 专项测试：心情系统（v0.5.0：mood 衰减/喜好快乐/饮用分档/抑郁闭环/找乐子/宴席/余韵）
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
// 补足人口到 18（测试需 18 个独立样本；不补更多——无家人口会压垮早期粮食链引发饥荒连锁死亡）
while (agents.length < 18) {
  const s = findSpot(world.store.x, world.store.y, 2, 20, T.GRASS);
  if (!s) break;
  spawnAgent(s.x, s.y);
}

// ---- 工具：冻结决策并中和快乐源（测纯演化时防 decide/喜好把数值钉死）----
function freeze(a) {
  a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
  a.path = null; a.state = "idle"; a.cheerT = 0; a.depressed = false;
  a.home = null; a.hobby = "none"; a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0;
  a.mood = 50; a.hunger = 90; a.energy = 95; a.thirst = 90;
}
// ---- 工具：清空全部聚落的酒/汁/咖啡（隔离 2.9 找乐子分支的干扰）----
function zeroDrinks() {
  for (const s of world.settlements) { const st = ensureStock(s); st.beer = 0; st.juice = 0; st.coffee = 0; }
}
// ---- 工具：长循环中冻结全员生命需求与心情下限（隔离单一变量，防饥荒/抑郁连锁死亡移动索引）----
const takeAlive = i => (agents[i] && !agents[i].dead ? agents[i] : agents.find(a => !a.dead));
function topUp(except) {
  for (const a of agents) {
    if (a.hunger < 60) a.hunger = 60;
    if (a.energy < 40) a.energy = 40;
    if (a.thirst < 60) a.thirst = 60;
    if (a !== except && a.mood < 20) a.mood = 20;
  }
}
// ---- 工具：永不完工的原地进度任务（保持 work 态）----
function fakeTask(a, type) {
  return { type, x: Math.round(a.x), y: Math.round(a.y), need: 1e9, progress: 0, workers: new Set([a]) };
}
// ---- 工具：把小人放到聚落旁可站立格 ----
function nearSettle(a) {
  const sc = world.settlements[0];
  outer:
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (walkable(sc.x + dx, sc.y + dy)) { a.x = sc.x + dx + 0.5; a.y = sc.y + dy + 0.5; break outer; }
    }
  }
  return sc;
}

// ===== 1. 构造契约：mood 0~100 / depressed false / cheerT 0（id hash 确定性起步）=====
let badInit = 0;
for (const a of agents) {
  if (typeof a.mood !== "number" || !(a.mood >= 80 && a.mood <= 100)) badInit++;
  if (a.depressed !== false || a.cheerT !== 0) badInit++;
}
assert(badInit === 0 && agents.length > 0, "构造契约：mood∈[80,100]（hash 确定性）/ depressed=false / cheerT=0");

// ===== 2. mood 随时间衰减（idle 基准）=====
const d0 = agents[0];
freeze(d0); d0.mood = 100;
for (let i = 0; i < 100; i++) simUpdate(STEP);   // 10 sim 秒
assert(d0.mood < 100 && d0.mood > 90, "idle 衰减：10s 约 -3.5（" + d0.mood.toFixed(1) + "）");
// ===== 3. work 衰减快于 idle（STATE_MOOD.work=1.9 生效）=====
const iA = agents[1], wA = agents[2];
freeze(iA); freeze(wA);
iA.mood = 100; wA.mood = 100;
wA.task = fakeTask(wA, "FARM"); wA.state = "work";
for (let i = 0; i < 100; i++) simUpdate(STEP);
const dIdle = 100 - iA.mood, dWork = 100 - wA.mood;
assert(dWork > dIdle * 1.5 && dWork > 5, "work 衰减快于 idle（×1.9：" + dWork.toFixed(2) + " > " + dIdle.toFixed(2) + "×1.5）");

// ===== 4. 睡觉回复心情（不衰减，+1/s）=====
const sA = agents[3];
freeze(sA); sA.mood = 40; sA.state = "sleep"; sA.energy = 30;
world.time = world.time - (world.time % 90) + 82;   // 调到深夜（tod≈0.91；timeOfDay 由 time 重算，直接赋值会被覆盖——历史坑）
for (let i = 0; i < 50 && sA.state === "sleep"; i++) simUpdate(STEP);   // 5s（仍处夜间）
assert(sA.mood > 43, "睡觉回复：5s +≈5（" + sA.mood.toFixed(1) + "）");

// ===== 5. 喜好快乐：fishing 做钓鱼活 mood 净涨，none 做同活净跌 =====
const fA = agents[4], nA = agents[5];
freeze(fA); freeze(nA);
fA.hobby = "fishing"; nA.hobby = "none";
fA.mood = 50; nA.mood = 50;
fA.task = fakeTask(fA, "FISH"); fA.state = "work";
nA.task = fakeTask(nA, "FARM"); nA.state = "work";
for (let i = 0; i < 100; i++) simUpdate(STEP);
assert(fA.mood > 50, "喜好快乐：垂钓者做 FISH mood 净涨（" + fA.mood.toFixed(1) + "）");
assert(nA.mood < 50, "对照：无喜好者干活 mood 净跌（" + nA.mood.toFixed(1) + "）");

// ===== 6. 喜好快乐：explore 航海中 mood 上涨（voyage 早退前置契约）=====
const vA = agents[6];
freeze(vA); vA.hobby = "explore"; vA.mood = 50; vA.state = "voyage"; vA.voyaging = true;
for (let i = 0; i < 50; i++) simUpdate(STEP);
assert(vA.mood > 54, "航海喜悦：explore 航海中 mood 上涨（" + vA.mood.toFixed(1) + "）");
// 对照：none 航海心情冻结（需求冻结语义不变）
const vB = agents[7];
freeze(vB); vB.hobby = "none"; vB.mood = 50; vB.state = "voyage"; vB.voyaging = true;
for (let i = 0; i < 50; i++) simUpdate(STEP);
assert(Math.abs(vB.mood - 50) < 0.01, "对照：非 explore 航海心情冻结不变（" + vB.mood.toFixed(1) + "）");

// ===== 7. 喜好快乐：homebody 守家 idle mood 净涨 =====
const hA = agents[8];
freeze(hA); hA.hobby = "homebody"; hA.mood = 50;
hA.home = { x: Math.round(hA.x), y: Math.round(hA.y) };
for (let i = 0; i < 100; i++) simUpdate(STEP);
assert(hA.mood > 50, "恋家快乐：homebody 守家 mood 净涨（" + hA.mood.toFixed(1) + "）");

// ===== 8. 饮用分档：麦酒 +30 & 微醺；清水 +3 =====
const bA = agents[9], wta = agents[10];
const sc0 = world.settlements[0];
const st0 = ensureStock(sc0);
st0.beer = 5; st0.water = 5; st0.juice = 0; st0.coffee = 0;
for (const a of [bA, wta]) { freeze(a); a.state = "drink"; a.drinkWait = 0.01; a.mood = 50; a.thirst = 40; }
bA.drinkRes = "beer"; bA.drinkCity = sc0;
wta.drinkRes = null; wta.drinkCity = null;   // 直饮分支按 water 结算
simUpdate(STEP);
assert(bA.mood > 79 && bA.drunkT > 0, "麦酒结算：mood +30 且微醺（" + bA.mood.toFixed(1) + "）");
assert(wta.mood > 52 && wta.mood < 54 && wta.drunkT === 0, "清水直饮：mood +3 无副作用（" + wta.mood.toFixed(1) + "）");

// ===== 9. 醉醺醺持续回甘（drunkT>0 微醺快乐）=====
const dA = agents[11];
freeze(dA); dA.mood = 50; dA.drunkT = 20;
for (let i = 0; i < 100; i++) simUpdate(STEP);   // 10s：衰减 -3.5 + 微醺 +4
assert(dA.mood > 50, "微醺回甘：drunkT 期间 mood 净涨（" + dA.mood.toFixed(1) + "）");

// ===== 10. 找乐子分支 2.9：mood<35 且城库有酒 → 派去喝酒；无酒 → 冷却 =====
const jA = agents[12];
const scJ = nearSettle(jA);
const stJ = ensureStock(scJ);
stJ.beer = 5; stJ.juice = 3; stJ.coffee = 0; stJ.water = 9;
for (const a of agents) a.pack && (a.pack = new Array(10).fill(null));   // 全员清包：防路上自用干扰
freeze(jA); jA.mood = 20; jA.hunger = 90; jA.energy = 95; jA.thirst = 90;
jA.thinkCd = 0;
simUpdate(STEP);
assert(jA.state === "walk" && !!jA.onArrive && !!jA.path, "找乐子：mood<35 且城库有酒 → 动身去喝");
// 喝完结算：mood 回升
jA.x = scJ.x + 0.4; jA.y = scJ.y + 0.4; jA.state = "drink"; jA.drinkWait = 0.01;
jA.drinkRes = "beer"; jA.drinkCity = scJ;
simUpdate(STEP);
assert(jA.mood >= 49, "喝完回甘：20+30=50（" + jA.mood.toFixed(1) + "）");
// 无酒场景：城库清空 → 冷却而非白跑
const jB = agents[13];
const scB = nearSettle(jB);
const stB = ensureStock(scB);
stB.beer = 0; stB.juice = 0; stB.coffee = 0; stB.water = 9;
freeze(jB); jB.mood = 20; jB.hunger = 90; jB.energy = 95; jB.thirst = 90; jB.joyUntil = 0;
jB.thinkCd = 0;
simUpdate(STEP);
assert(jB.joyUntil > world.time && jB.state !== "drink" && jB.drinkRes === undefined,
  "无酒可喝：找乐子冷却 JOY_CD、未派饮酒行程（joyUntil=" + jB.joyUntil.toFixed(0) + "）");

// ===== 11. 抑郁闭环：mood<12 持续 60s → depressed + 释放任务 =====
zeroDrinks();   // 断掉找乐子（2.9）的酒源：否则喝一杯就逃出抑郁区间
const pA = agents[14];
freeze(pA); pA.mood = 5;
pA.task = fakeTask(pA, "FARM");
let becameDepressed = false;
for (let i = 0; i < 700 && !pA.depressed; i++) {
  topUp(pA);
  pA.hunger = 100; pA.energy = 100; pA.thirst = 100;   // 冻结生命需求：隔离单一变量（防夜里入睡回血逃出抑郁）
  simUpdate(STEP);
  becameDepressed = pA.depressed;
}
assert(becameDepressed && pA.depressed && !pA.task, "抑郁 onset：<12 持续 60s → depressed 且任务被放下");

// ===== 12. 抑郁者不领任务（工作分支全跳过，保留吃喝睡）=====
pA.mood = 5; pA.thinkCd = 0; pA.state = "idle"; pA.path = null; pA.onArrive = null;
tasksAdd({ type: "FARM", x: Math.round(pA.x), y: Math.round(pA.y) });
for (let i = 0; i < 30; i++) { topUp(pA); pA.hunger = 100; pA.energy = 100; pA.thirst = 100; simUpdate(STEP); }
assert(!pA.task && pA.hunger > 60 && pA.thirst > 60, "抑郁停工：有任务在册也不领（吃喝分支保留 hunger=" + pA.hunger.toFixed(0) + "）");

// ===== 13. 走出抑郁：mood≥45 持续 20s → 恢复 =====
pA.mood = 100;
for (let i = 0; i < 300 && pA.depressed; i++) { topUp(pA); pA.hunger = 100; pA.energy = 100; pA.thirst = 100; simUpdate(STEP); }
assert(!pA.depressed, "走出抑郁：mood 拉满 20s → depressed=false");

// ===== 14. 郁结成疾：抑郁持续 300s → sick（sickSource="mood"）=====
pA.mood = 5; pA.sick = false; pA.sickTime = 0; pA.depressAge = 0;
let becameSick = false;
for (let i = 0; i < 4400 && !pA.sick; i++) {
  topUp(pA);
  pA.hunger = 100; pA.energy = 100; pA.thirst = 100;   // 冻结生命需求：隔离单一变量
  simUpdate(STEP);
}
becameSick = pA.sick && pA.sickSource === "mood";
assert(becameSick, "郁结成疾：抑郁 300s → sick / sickSource=mood");

// ===== 15. 不治身亡：病倒 + 仍抑郁 60s → 死亡（文案含「抑郁」）=====
let died = false;
for (let i = 0; i < 800 && !pA.dead; i++) {
  topUp(pA);
  pA.hunger = 100; pA.energy = 100; pA.thirst = 100;
  simUpdate(STEP);
}
died = pA.dead;
const diedWithDepression = world.logs.some(l => l.text.includes("因长期抑郁病倒"));
assert(died && diedWithDepression, "郁郁而终：60s 不治线（纪事含「因长期抑郁病倒」）");

// ===== 16. 病倒痊愈：sickSource=mood 但走出抑郁 → 痊愈不死 =====
// 收口健壮化：随机流漂移会改变 agents[15] 落点（死亡 splice / 新生儿入列），改取在册成年者；
// 窗口 4400→6000 步：全局丰收宴席（mood 全员 +25）若落在窗口内会重置病倒时钟一次，留足余量
const hB = agents.find(a => !a.dead && a.age >= 15) || agents.find(a => !a.dead);
freeze(hB); hB.mood = 5;
for (let i = 0; i < 6000 && !hB.sick; i++) { topUp(hB); hB.hunger = 100; hB.energy = 100; hB.thirst = 100; simUpdate(STEP); }
assert(hB.sick && hB.sickSource === "mood", "痊愈前置：病倒（sickSource=mood）");
hB.mood = 100;
for (let i = 0; i < 400 && hB.sick; i++) { topUp(hB); hB.hunger = 100; hB.energy = 100; hB.thirst = 100; simUpdate(STEP); }
assert(!hB.sick && !hB.dead, "走出抑郁即痊愈：sick 清除且存活");

// ===== 17. 尽兴而归余韵：cheerT>0 衰减 ×0.35 =====
const cA = agents[16], cB = agents[17];
freeze(cA); freeze(cB);
cA.mood = 50; cB.mood = 50; cA.cheerT = 300;
for (let i = 0; i < 100; i++) simUpdate(STEP);
const dCheer = 50 - cA.mood, dPlain = 50 - cB.mood;
assert(dCheer < dPlain * 0.6 && dCheer > 0, "余韵生效：cheer 期间衰减明显放缓（" + dCheer.toFixed(2) + " < " + dPlain.toFixed(2) + "×0.6）");

// ===== 18. 宴席全体心情+（plannerTick 直调：存粮超线即触发）=====
for (const a of agents) a.mood = Math.min(a.mood, 50);
const rich = world.settlements[0];
ensureStock(rich).food = 60 + agents.length * 5 + 500;
world.time += 400;   // 越过宴席节流窗（_lastFeast 模块私有，可能已被长跑中的自然宴席刷新）
const moodBefore = agents.map(a => a.mood);
plannerTick();
let feastOk = true;
for (let i = 0; i < moodBefore.length; i++) {
  const a = agents[i];
  if (!a || a.dead) continue;   // plannerTick 内可能新生/死亡：按旧索引对齐，缺席跳过
  const before = moodBefore[i], now = a.mood;
  if (now < Math.min(100, before + 24) - 0.5) feastOk = false;   // +25（容 1 浮点），封顶 100
}
assert(feastOk, "丰收宴席：全体 mood +25（封顶 100）");

// ===== 19. 稳定性：2000 sim 秒全员 mood 无 NaN、值域合法、无幽灵抑郁扩散 =====
let bad = 0;
for (let i = 0; i < 20000; i++) {
  simUpdate(STEP);
  if (i % 500 === 0) {
    for (const a of agents) {
      if (typeof a.mood !== "number" || isNaN(a.mood) || a.mood < 0 || a.mood > 100) bad++;
      if (a.mood < -0.001 || a.mood > 100.001) bad++;
    }
  }
}
assert(bad === 0, "稳定性：2000s 采样 mood 无 NaN、值域 [0,100]");

// ===== 20. 抑郁在长跑中真实发生（机制活性：非摆设）=====
assert(world.logs.some(l => l.text.includes("抑郁")), "机制活性：长跑中出现过抑郁纪事");

// ===== 21. 迁居机制（长期挨饿 → 搬到食物充裕的街区，v0.6.0 看护补齐）=====
const mA = takeAlive(6);
freeze(mA);
mA.hunger = 5; mA.starveT = 39;   // 贴线：一步即越过 40s 饥饿阈值
let migrated = false;
for (let i = 0; i < 60 && !migrated; i++) {
  topUp();
  mA.pack = new Array(10).fill(null);   // 清背包：口粮自用会把 hunger 拉回，starveT 永远攒不满
  mA.hunger = 5;   // 每轮压回饥饿线（starveT 只在循环外预置一次，靠 update 自然累计过 40）
  simUpdate(STEP);
  migrated = world.logs.some(l => l.text.includes("饥民迁居"));
}
assert(migrated, "迁居机制：hunger<10 持续 40s → 饥民迁居纪事");

// ===== 22. 意外死亡三分支（v0.6.0 看护补齐：概率 config 化 → 置 1 强制触发）=====
const savedAcc = SIM.ACCIDENT;
SIM.ACCIDENT = { cliff: 1, shark: 1, choke: 1 };
// ① 崖边失足：小人站悬崖邻格（Math.round(x+0.4)=x，避开 half-up 偏移——死锁 #20 家族）
const accA = takeAlive(7);
freeze(accA); accA.accCd = 0.01;
const accSpot = findSpot(Math.round(accA.x), Math.round(accA.y), 1, 8, T.GRASS, [T.HOUSE, T.FARM]);
if (!accSpot) { assert(true, "意外死亡①：无构造点（跳过）"); } else {
  setTile(accSpot.x + 1, accSpot.y, T.CLIFF);
  accA.x = accSpot.x + 0.4; accA.y = accSpot.y + 0.4;   // x/y 都用 .4 偏移：half-up 取整会错行（死锁 #20 家族）
  let cliffDead = null;
  for (let i = 0; i < 30 && !cliffDead; i++) { simUpdate(STEP); if (accA.dead) cliffDead = accA.deathReason; }
  assert(!!cliffDead && cliffDead.includes("坠落"), "意外死亡①：崖边失足坠落（cliff=1 强制）");
}
// ② 浅滩遇鲨：小人站水边可走格，鲨鱼放旁边水域
const accB = takeAlive(8);
freeze(accB); accB.accCd = 0.01;
const sharkW = (function () {
  for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) {
    if (tileAt(x, y) !== T.WATER && tileAt(x, y) !== T.DEEP) continue;
    const nb = neighborsOf(x, y).find(p => walkable(p.x, p.y));
    if (nb) return { w: { x, y }, nb };
  }
  return null;
})();
if (!sharkW) { assert(true, "意外死亡②：无水域（跳过）"); } else {
  spawnCreature(sharkW.w.x, sharkW.w.y, "shark");
  accB.x = sharkW.nb.x + 0.5; accB.y = sharkW.nb.y + 0.5;
  let sharkDead = null;
  for (let i = 0; i < 30 && !sharkDead; i++) { simUpdate(STEP); if (accB.dead) sharkDead = accB.deathReason; }
  assert(!!sharkDead && sharkDead.includes("鲨鱼"), "意外死亡②：浅滩被鲨鱼拖走（shark=1 强制）");
}
// ③ 进食噎住：eat 态一步即中
const accC = takeAlive(9);
freeze(accC); accC.accCd = 0.01; accC.state = "eat";
let chokeDead = null;
for (let i = 0; i < 30 && !chokeDead; i++) { simUpdate(STEP); if (accC.dead) chokeDead = accC.deathReason; }
assert(!!chokeDead && chokeDead.includes("噎"), "意外死亡③：进食噎住（choke=1 强制）");
SIM.ACCIDENT = savedAcc;   // 还原概率（后续长跑保持真实节奏）

console.log("---- mood.js 断言结束 ----");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "mood.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
