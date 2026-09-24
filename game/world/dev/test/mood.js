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
// v0.6.7 接缝：赏花/爬山邻近是新的被动心情源（1s 节流扫描 flowerNear/mountainNear）——
// 按实例停用扫描并清标志（不污染全局 SIM）；考察扫描接线本身的用例传 keepScans 跳过本段
function freeze(a, keepScans) {
  a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
  a.path = null; a.state = "idle"; a.cheerT = 0; a.depressed = false;
  a.home = null; a.hobby = "none"; a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0;
  a.mood = 50; a.hunger = 90; a.energy = 95; a.thirst = 90;
  if (!keepScans) {
    a.scanFlower = function () {};
    a.scanMountain = function () {};
    a.flowerNear = false; a.mountainNear = false;
  }
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
assert(d0.mood < 100 && d0.mood > 90, "idle 衰减：10s 约 -2.8（none ×0.8，" + d0.mood.toFixed(1) + "）");
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
// 对照（v0.6.7 语义更新）：航海喜悦全民化——非 explore 航海不再冻结，按各自 joyProfile.explore
// 档位回甘（ voyage 早退分支内无衰减干扰，增益速率 = MOOD_LIKED_JOY × profile.explore，可精确核对）
const vB = agents[7];
freeze(vB); vB.hobby = "none"; vB.mood = 50; vB.state = "voyage"; vB.voyaging = true;
for (let i = 0; i < 50; i++) simUpdate(STEP);
const vBRate = (vB.mood - 50) / 5;
assert(vB.mood > 50 && Math.abs(vBRate - SIM.MOOD_LIKED_JOY * (vB.joyProfile.explore || 1)) < 0.05,
  "航海喜悦全民化：none 航海按 joyProfile.explore 档回甘（+" + vBRate.toFixed(2) + "/s ×profile " +
  (vB.joyProfile.explore || 1) + "）");

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
bA.mood = 30;   // 压低起点：30+30×1.8=84 不触 100 封顶，档位结构才可精确核对
bA.drinkRes = "beer"; bA.drinkCity = sc0;
wta.drinkRes = null; wta.drinkCity = null;   // 直饮分支按 water 结算
simUpdate(STEP);
// v0.6.7 语义更新：麦酒心情按 joyProfile.drink 分档（0.4~1.8）——增量 = MOOD_BEER × 档位（结构核对）
const bAGain = bA.mood - 30, bAExp = SIM.MOOD_BEER * (bA.joyProfile.drink || 1);
assert(Math.abs(bAGain - bAExp) < 0.5 && bA.drunkT > 0,
  "麦酒结算：mood +" + bAGain.toFixed(1) + " ≈ 30×profile.drink(" + (bA.joyProfile.drink || 1) + ") 且微醺");
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
// v0.6.7：三候选加权后可能选中喝酒也可能选中赏花/爬山——但都是「动身」结构（walk + path + onArrive）
assert(jA.state === "walk" && !!jA.onArrive && !!jA.path, "找乐子：mood<35 → 按画像加权动身（喝酒或乐事景点）");
// 喝完结算：mood 回升（v0.6.7：按 joyProfile.drink 分档，结构核对）
jA.x = scJ.x + 0.4; jA.y = scJ.y + 0.4; jA.state = "drink"; jA.drinkWait = 0.01;
jA.drinkRes = "beer"; jA.drinkCity = scJ;
simUpdate(STEP);
const jAExp = 20 + SIM.MOOD_BEER * (jA.joyProfile.drink || 1);
assert(Math.abs(jA.mood - jAExp) < 1.5, "喝完回甘：20+30×profile.drink=" + jAExp.toFixed(0) + "（" + jA.mood.toFixed(1) + "）");
// 无酒场景（v0.6.7 语义更新）：2.9 扩为喝酒/赏花/爬山三候选加权依次尝试——酒落空后还会去乐事景点，
// 全落空才冷却 JOY_CD。「不拿白水糊弄」语义不变（绝不进入 drink 态直饮），据此放宽为二选一结构断言
const jB = agents[13];
const scB = nearSettle(jB);
const stB = ensureStock(scB);
stB.beer = 0; stB.juice = 0; stB.coffee = 0; stB.water = 9;
freeze(jB); jB.mood = 20; jB.hunger = 90; jB.energy = 95; jB.thirst = 90; jB.joyUntil = 0;
jB.thinkCd = 0;
simUpdate(STEP);
assert(jB.state !== "drink" && jB.drinkRes === undefined &&
       (jB.joyUntil > world.time || (jB.state === "walk" && !!jB.path)),
  "无酒可喝：不白喝清水（未进 drink 态），全落空冷却 JOY_CD（joyUntil=" + jB.joyUntil.toFixed(0) +
  "）或已动身去乐事景点（state=" + jB.state + "）");

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
// v0.6.7 接缝：test 12 曾把 thinkCd 归 0——2.9 找乐子如今会把低心情小人拉去赏花/爬山，
// 乐事回甘会把 mood 托在病倒线之上。重新冻结决策隔离该变量，保「纯病倒管线」考察语义。
pA.thinkCd = 9999;
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

// ===== 20. 抑郁机制活性（v0.6.7 语义更新：受控对照流）=====
// v0.6.7 起 idle/walk 邻近花丛/山崖被动回甘 + 2.9 找乐子扩到赏花/爬山——自然长跑里低心情会被
// 乐事体系主动托住，2000s 内出现「抑郁」纪事不再是稳定事件（有意语义变更，非回归）。
// 机制活性改由对照样本验证：隔离乐事来源（freeze 停用扫描与决策）后，纯 update 流仍在
// mood<12 持续 60s 时产生抑郁纪事——证明机制未被乐事旁路、纪事链路照常流动。
const dpA = agents.find(a => !a.dead && !a.sick && !a.mount && !a.voyaging);
let depSeen = false;
if (dpA) {
  freeze(dpA); dpA.mood = 5;
  for (let i = 0; i < 700 && !depSeen; i++) {
    topUp(dpA);
    dpA.hunger = 100; dpA.energy = 100; dpA.thirst = 100;
    simUpdate(STEP);
    depSeen = dpA.depressed;
  }
}
assert(depSeen && world.logs.some(l => l.text.includes("抑郁")),
  "机制活性：隔离乐事来源后 update 流仍触发抑郁且入纪事（v0.6.7 语义下机制未被旁路）");

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

// ===== 23. joyProfile 契约（v0.6.7）：五档画像 + hash2 确定性 + 主喜好键保底 =====
// 用新生小人考察：在册小人的 hobby 会被上文场景用例改写（freeze 置 none / 手动赋值），
// 而画像保底绑定「构造时点」的喜好——拿被改写后的 hobby 镜像重构必然假性不符
{
  const hobbyJoy = { explore: "explore", homebody: "home", animal: "animal", fishing: "fish" };
  const tiers = new Set(SIM.JOY_TIERS);
  const fresh = [];
  let noneN = 0, mappedN = 0;
  for (let i = 0; i < 80 && (noneN < 1 || mappedN < 2); i++) {
    const s = findSpot(world.store.x, world.store.y, 2, 20, T.GRASS);
    if (!s) break;
    const a = spawnAgent(s.x, s.y);
    fresh.push(a);
    if (a.hobby === "none") noneN++;
    else if (hobbyJoy[a.hobby]) mappedN++;
  }
  let okAll = true, okFloor = true, okNone = true;
  for (const a of fresh) {
    for (const k of SIM.JOY_KEYS) {
      if (!tiers.has(a.joyProfile[k])) okAll = false;   // 档位 ∈ JOY_TIERS（0.4~1.8 五档）
      // 确定性：hash2 纯函数逐键重构全等（构造不消耗 rand 流 → 同 id 重跑画像必然一致）
      let exp = SIM.JOY_TIERS[(hash2(a.id, SIM.JOY_SALTS[k]) * 5) | 0];
      if (k === hobbyJoy[a.hobby]) exp = Math.max(exp, SIM.JOY_HOBBY_MIN);
      if (exp !== a.joyProfile[k]) okAll = false;
    }
    const hk = hobbyJoy[a.hobby];
    if (hk) { if ((a.joyProfile[hk] || 0) < SIM.JOY_HOBBY_MIN) okFloor = false; }
  }
  assert(okAll && fresh.length >= 3, "joyProfile 契约：" + fresh.length + " 名新生小人逐键 ∈ JOY_TIERS 且 hash2 重构全等（确定性）");
  assert(okFloor && mappedN >= 2, "joyProfile 保底：主喜好键 ≥ JOY_HOBBY_MIN(1.4)（" + mappedN + " 名有映射样本）");
  // none 无映射不保底：逐键 = 裸档（无任何键被强制抬升）
  if (noneN === 0) assert(true, "joyProfile：none 样本未抽到（概率约 8%，跳过不判 FAIL）");
  else {
    for (const a of fresh) {
      if (a.hobby !== "none") continue;
      for (const k of SIM.JOY_KEYS) {
        const raw = SIM.JOY_TIERS[(hash2(a.id, SIM.JOY_SALTS[k]) * 5) | 0];
        if (a.joyProfile[k] !== raw) okNone = false;
      }
    }
    assert(okNone, "joyProfile：none 无映射不保底（逐键 = 裸档，" + noneN + " 名样本）");
  }
}

// ===== 24. 赏花/爬山邻近回甘（v0.6.7）：idle 邻近浆果丛/山 → flower/climb 乐事分档回甘 =====
// 双 agent 同步差分（受试邻近地物 / 对照远处）：宴席+25 等全局事件两人同吃，作差抵消；
// 另加 likedJoyOf 结构探针（命中键直查，零演化干扰）
{
  const tA = agents.find(x => !x.dead && !x.mount && !x.voyaging && !x.sick);
  const cA = tA ? agents.find(x => !x.dead && !x.mount && !x.voyaging && !x.sick && x !== tA) : null;
  let clean = null, ctrl = null;
  if (tA && cA) {
    for (let r = 4; r <= 30 && !clean; r++) {
      for (let dy = -r; dy <= r && !clean; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = world.store.x + dx, y = world.store.y + dy;
        if (tileAt(x, y) !== T.GRASS || !walkable(x, y) ||
            nearAny(x, y, [T.BERRY, T.FRUIT, T.MOONBLOOM, T.MOUNTAIN, T.CLIFF], 4) ||
            nearAny(x, y, [T.HOUSE, T.FARM], 2)) continue;
        // 对照格：距地物落点 ≥6（7×7 扫描够不着）、自身 4 格内同样无乐事地物
        for (const [ox, oy] of [[7, 7], [-7, 7], [7, -7], [-7, -7], [8, 0], [0, 8], [-8, 0], [0, -8]]) {
          const cx2 = x + ox, cy2 = y + oy;
          if (tileAt(cx2, cy2) !== T.GRASS || !walkable(cx2, cy2) ||
              nearAny(cx2, cy2, [T.BERRY, T.FRUIT, T.MOONBLOOM, T.MOUNTAIN, T.CLIFF], 4)) continue;
          clean = { x, y }; ctrl = { x: cx2, y: cy2 }; break;
        }
        if (clean) break;
      }
    }
  }
  if (!tA || !cA || !clean) { assert(true, "赏花/爬山邻近：无可用样本或干净构造点（跳过）"); } else {
    const setup = (a, spot) => {
      a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
      a.cheerT = 0; a.depressed = false; a.home = null; a.hobby = "none";
      a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0; a.pack = new Array(10).fill(null);
      a.mount = null; a.x = spot.x + 0.4; a.y = spot.y + 0.4;   // .4 偏移避开 half-up 取整
      a.state = "idle"; a.hunger = 95; a.energy = 95; a.thirst = 95;
      delete a.scanFlower; delete a.scanMountain;   // 还原原型扫描：上文 freeze 的实例级 no-op 会污染本用例
    };
    setup(tA, clean); setup(cA, ctrl);
    // ① 结构探针：地物落身旁 → flowerNear/climbNear 置位、likedJoyOf 命中对应键
    // （两人都强置 bloomCd=0 并清陈旧邻近标志：teleport 后旧值会在扫描节拍未到时残留）
    setTile(clean.x + 2, clean.y, T.BERRY);
    tA.bloomCd = 0; cA.bloomCd = 0;
    tA.flowerNear = false; tA.mountainNear = false; cA.flowerNear = false; cA.mountainNear = false;
    simUpdate(STEP);
    const p1 = { fn: tA.flowerNear, liked: likedJoyOf(tA), likedC: likedJoyOf(cA),
                 tx: Math.round(tA.x), ty: Math.round(tA.y), tile: tileAt(clean.x + 2, clean.y) };
    const flowerHit = tA.flowerNear === true && likedJoyOf(tA) === "flower" && likedJoyOf(cA) === 0;
    setTile(clean.x + 2, clean.y, T.GRASS);
    setTile(clean.x - 2, clean.y, T.MOUNTAIN);
    tA.bloomCd = 0; cA.bloomCd = 0; simUpdate(STEP);
    const p2 = { mn: tA.mountainNear, liked: likedJoyOf(tA) };
    const climbHit = tA.mountainNear === true && likedJoyOf(tA) === "climb";
    setTile(clean.x - 2, clean.y, T.GRASS);
    // ② 速率差分：三阶段（无地物/花/山）各 10s，受试−对照的增量差即乐事净贡献
    const phase = place => {
      if (place) setTile(place.x, place.y, place.t);
      tA.mood = 50; cA.mood = 50; tA.flowerNear = false; tA.mountainNear = false;
      cA.flowerNear = false; cA.mountainNear = false;
      tA.bloomCd = 0; cA.bloomCd = 0;
      for (let i = 0; i < 100; i++) {   // 10s
        simUpdate(STEP);
        tA.hunger = 95; tA.energy = 95; tA.thirst = 95;
        cA.hunger = 95; cA.energy = 95; cA.thirst = 95;
      }
      const d = tA.mood - cA.mood;
      if (place) setTile(place.x, place.y, T.GRASS);   // 还原
      return d;
    };
    const dNone = phase(null), dFlower = phase({ x: clean.x + 2, y: clean.y, t: T.BERRY }),
          dClimb = phase({ x: clean.x - 2, y: clean.y, t: T.MOUNTAIN });
    assert(flowerHit && climbHit,
      "赏花/爬山邻近：likedJoyOf 结构探针命中 flower/climb（探针①：" + JSON.stringify(p1) +
      " 探针②：" + JSON.stringify(p2) + "）");
    assert(dFlower - dNone > 3 && dClimb - dNone > 3,
      "赏花/爬山邻近：flower/climb 乐事净贡献显著为正（Δ花 " + (dFlower - dNone).toFixed(1) +
      " / Δ山 " + (dClimb - dNone).toFixed(1) + " / 10s，差分抗全局事件）");
  }
}

// ===== 25. 啤酒档差分（v0.6.7）：同酒不同 profile.drink → 增量比 ≈ 档位比 4.5 =====
{
  const lo = agents.find(a => !a.dead && !a.mount && !a.voyaging && !a.sick);
  const hi = agents.find(a => !a.dead && a !== lo && !a.mount && !a.voyaging && !a.sick);
  if (!lo || !hi) { assert(true, "啤酒档差分：无可用人（跳过）"); } else {
    const scD = world.settlements[0], stD = ensureStock(scD);
    stD.beer = 8;
    for (const [a, p] of [[lo, 0.4], [hi, 1.8]]) {
      a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
      a.cheerT = 0; a.depressed = false; a.home = null; a.hobby = "none";
      a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0; a.pack = new Array(10).fill(null);
      a.state = "drink"; a.mood = 30; a.hunger = 90; a.energy = 95; a.thirst = 40;
      a.joyProfile.drink = p;             // 手动设档：隔离随机画像，差分才可归一
      a.drinkWait = 0.01; a.drinkRes = "beer"; a.drinkCity = scD;
    }
    simUpdate(STEP);
    const gLo = lo.mood - 30, gHi = hi.mood - 30;
    assert(gLo > 5 && gHi > gLo && Math.abs(gHi / gLo - 4.5) < 0.6 && lo.drunkT > 0 && hi.drunkT > 0,
      "啤酒档差分：profile.drink 0.4/1.8 同酒增量比 ≈4.5（" + gLo.toFixed(1) + " vs " + gHi.toFixed(1) + "）");
  }
}

// ===== 26. 骑乘端到端（v0.6.10）：驯服马 + 远途 walk → 自动上马/坐标同步/≈1.8× 移速/转 work 下马 =====
{
  const rA = agents.find(a => !a.dead && !a.mount && !a.voyaging && !a.sick && !a.depressed);
  const rB = agents.find(a => !a.dead && a !== rA && !a.mount && !a.voyaging && !a.sick && !a.depressed);
  let farT = null;
  if (rA) {
    for (let r = 16; r <= 60 && !farT; r += 2)
      farT = findSpot(Math.round(rA.x), Math.round(rA.y), r, r + 1, T.GRASS, [T.HOUSE, T.FARM, T.WATER, T.DEEP]);
  }
  if (!rA || !rB || !farT) { assert(true, "骑乘端到端：无可用样本或远距构造点（跳过）"); } else {
    const rHorse = spawnCreature(Math.round(rA.x), Math.round(rA.y), "horse");
    rHorse.tamed = true; rHorse.owner = rA; rHorse.x = rA.x; rHorse.y = rA.y;
    for (const a of [rA, rB]) {
      a.thinkCd = 9999; a.task = null; a.exploring = null; a.onArrive = null;
      a.cheerT = 0; a.depressed = false; a.home = null; a.hobby = "none";
      a.drunkT = 0; a.coffeeT = 0; a.joyUntil = 0; a.sick = false; a.sickTime = 0;
      a.pack = new Array(10).fill(null); a.mount = null; a.mountCd = 0; a.bloomCd = 0;
      a.scanFlower = function () {}; a.scanMountain = function () {};
      a.flowerNear = false; a.mountainNear = false;
      a.mood = 80; a.hunger = 95; a.energy = 95; a.thirst = 95;
    }
    rB.x = rA.x; rB.y = rA.y;   // 同起点：两人路径一致，位移只差骑乘倍率
    assert(rA.goTo(farT.x, farT.y) && rB.goTo(farT.x, farT.y), "骑乘端到端：同起点远距 path 已建立");
    rA.state = "walk"; rB.state = "walk";
    const home = { x: Math.round(rB.x), y: Math.round(rB.y) };
    let target = farT, mounted = false, syncOk = true;
    const dA = [], dB = [];
    let pA2 = { x: rA.x, y: rA.y }, pB2 = { x: rB.x, y: rB.y };
    for (let i = 0; i < 200; i++) {   // 20s：到站重发（ping-pong），保证足够步幅样本
      simUpdate(STEP);
      if (rA.mount === rHorse) {
        mounted = true;
        if (Math.hypot(rHorse.x - rA.x, rHorse.y - rA.y) > 0.5) syncOk = false;   // 坐标同步（1 步滞后内）
        if (rA.state === "walk") dA.push(Math.hypot(rA.x - pA2.x, rA.y - pA2.y));
      }
      if (rB.state === "walk") dB.push(Math.hypot(rB.x - pB2.x, rB.y - pB2.y));
      pA2 = { x: rA.x, y: rA.y }; pB2 = { x: rB.x, y: rB.y };
      if (!rA.path && !rA.dead) { target = target === farT ? home : farT; if (rA.goTo(target.x, target.y)) rA.state = "walk"; }
      if (!rB.path && !rB.dead) { if (rB.goTo(farT.x, farT.y)) rB.state = "walk"; }
      rA.hunger = 95; rA.energy = 95; rA.thirst = 95;
      rB.hunger = 95; rB.energy = 95; rB.thirst = 95;
    }
    assert(mounted && rHorse.riddenBy === rA, "骑乘端到端：长途中自动上马且 riddenBy 回指骑手");
    assert(syncOk, "骑乘端到端：骑乘中坐骑坐标由骑手同步（滞后 ≤1 步）");
    const med = arr => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };
    // 各自按 self speed 归一（个体速度 0.85~1.2 随机）：未受阻步幅 = speed×倍率×dt
    const vA = med(dA) / (rA.speed * STEP), vB = med(dB) / (rB.speed * STEP);
    assert(dA.length >= 40 && dB.length >= 40 && vB > 0.8 && vB < 1.2 && vA > 1.55 && vA < 2.05,
      "骑乘端到端：骑乘步幅/自速 ≈1.8×（实测 " + vA.toFixed(2) + "，对照步行 " + vB.toFixed(2) + "）");
    rA.state = "work";   // 到岗开工 → 下马复位
    rA.task = { type: "FARM", x: Math.round(rA.x), y: Math.round(rA.y), need: 1e9, progress: 0, workers: new Set([rA]) };
    simUpdate(STEP);
    assert(rA.mount === null && rHorse.riddenBy === null, "骑乘端到端：state 切 work → 下马复位（mount/riddenBy 双清）");
  }
}

// ===== 27. 流星夜（v0.6.14）：清醒者 +METEOR_MOOD(0.3)/s；睡觉走早退天然排除；病者无暇仰望 =====
// A/B 同体分相（meteor 是全局态无法同期对照）：先三态基线（无流星），再注入长 dur 流星复测，
// 斜率差即流星净贡献。sleep/sick 两者差值应≈0，idle 差值应≈SIM.METEOR_MOOD。
{
  const mW = agents.find(a => !a.dead && !a.sick && !a.mount && !a.voyaging);
  const mS = agents.find(a => !a.dead && a !== mW && !a.mount && !a.voyaging);
  const mK = agents.find(a => !a.dead && a !== mW && a !== mS && !a.mount && !a.voyaging);
  if (!mW || !mS || !mK) { assert(true, "流星：样本不足（跳过）"); } else {
    const savedMeteor = world.meteor, savedNext = world.meteorNext;
    // 稳态准备：freeze 断决策与乐事扫描，另钉死 bloomCd（月光花光环是另一被动心情源）；
    // 病者走 mood 源（depressed 保持病倒态，10s 窗内远不及 60s 不治线，全程存活）
    const prepWake = a => { freeze(a); a.bloomCd = 9999; a.bloomNear = false; a.mood = 50; };
    // 睡相 energy 压 20 + 4s 窗：ENERGY_REGEN=9/s，(100-20)/9≈8.9s 不触自动醒——
    // 醒来切 idle 会吃到流星加成，把「睡觉不加成」污染成假阳性（首版 energy=95 半秒即醒，已修）
    const prepSleep = a => { freeze(a); a.bloomCd = 9999; a.bloomNear = false; a.state = "sleep"; a.mood = 50; a.energy = 20; };
    const prepSick = a => { freeze(a); a.bloomCd = 9999; a.bloomNear = false; a.mood = 5; a.sick = true; a.sickTime = 0; a.sickSource = "mood"; a.depressed = true; };
    const slope = (a, prep, sec) => {
      prep(a);
      const m0 = a.mood;
      for (let i = 0; i < sec * 10; i++) simUpdate(STEP);
      return (a.mood - m0) / sec;
    };
    world.meteor = null;
    world.meteorNext = world.time + 1e9;   // 封住 weatherTick 的 2%/s 随机调度：基线斜率不得被偶发流星污染
    const bWake = slope(mW, prepWake, 10), bSick = slope(mK, prepSick, 10);
    assert(mK.sick && !mK.dead, "流星：病者样本保持病倒态（10s 窗内不愈不死）");
    world.meteor = { t0: world.time, dur: 1e9 };   // 长 dur：越过 weatherTick 到点清空窗，整段受控
    const wWake = slope(mW, prepWake, 10), wSick = slope(mK, prepSick, 10);
    // 睡觉排除直测 updateMood（sleep 早退分支在流星行之前）：绕过 update() 的整世界驱动，
    // 隔离死亡/宴席等全局心情冲击对 4s 短窗斜率的污染（端到端斜率法两次被偶发事件打穿，已弃）
    prepSleep(mS); mS.mood = 50;
    for (let i = 0; i < 40; i++) mS.updateMood(STEP, 1);
    const slNo = (mS.mood - 50) / 4;
    world.meteor = { t0: world.time, dur: 1e9 };
    mS.mood = 50;
    for (let i = 0; i < 40; i++) mS.updateMood(STEP, 1);
    const slMet = (mS.mood - 50) / 4;
    world.meteor = savedMeteor; world.meteorNext = savedNext;
    assert(Math.abs(slNo - SIM.MOOD_SLEEP_REGEN) < 0.01 && Math.abs(slMet - slNo) < 0.01,
      "流星：睡觉者不加成（updateMood 直测：sleep 早退先于流星行，无/有流星斜率 " +
      slNo.toFixed(3) + " / " + slMet.toFixed(3) + " 恒等 MOOD_SLEEP_REGEN）");
    assert(Math.abs((wWake - bWake) - SIM.METEOR_MOOD) < 0.06,
      "流星：清醒者心情增速差 ≈0.3/s（基线 " + bWake.toFixed(2) + " → 流星 " + wWake.toFixed(2) + "）");
    assert(Math.abs(wSick - bSick) < 0.06,
      "流星：病者不加成（sick 排除，增速差 " + (wSick - bSick).toFixed(3) + " ≈ 0）");
  }
}

// ===== 28. 气候带单元（v0.6.15）：climateAt 三态 + 缓存窗口失效 + currentAt 海陆口径 =====
{
  const savedHouses = world.houses;
  // 无房屋 → 恒温带（无定居区就没有气候带）
  world.houses = [];
  assert(climateAt(0, -9999) === "temperate" && climateAt(0, 9999) === "temperate",
    "气候：无房屋恒 temperate（南北极通吃）");
  // 注入已知边缘：minY=100 / maxY=130 / EDGE_INSET=10 → 雪线基线 110、旱线基线 120；
  // v0.6.16：边界 = 基线 ±WOBBLE(20) 噪声曲线（按 x 摆动）→ 雪线 ∈ [90,130]、旱线 ∈ [100,140]
  // （houses.length 与真实不同即缓存失效入口之一——注入后立即可读新带；下方每次换屋仍 +61 强制刷，双保险）
  world.houses = [{ x: 0, y: 100 }, { x: 5, y: 130 }];
  world.time += 61;
  // 深处必雪/必旱（噪声摆动最内界 90/140 之外的深带，任何 x 都不可逃出）
  let deepOk = true, deepItOk = true, rangeOk = true;
  for (let x = -240; x <= 240; x += 2) {
    if (climateAt(x, 40) !== "snow") deepOk = false;            // 深雪：40 < 雪线最小值 90
    if (climateIntensity(x, 40) !== 1) deepItOk = false;        // 强度饱和（40 距最近雪线 ≥50 > FADE 30）
    if (climateAt(x, 170) !== "drought") deepOk = false;        // 深旱：170 > 旱线最大值 140
    if (climateIntensity(x, 170) !== 1) deepItOk = false;
  }
  assert(deepOk, "气候 v0.6.16：深带必雪/必旱（±WOBBLE 曲线边界最内界外无例外）");
  assert(deepItOk, "气候 v0.6.16：深带 climateIntensity 饱和 1（距边界 > FADE 带宽）");
  // 强度值域 + 单调性：深带(1) > 交界带（交界最饱和也只有 (25/30)<1），温带核 0
  let monoOk = true;
  for (let x = -240; x <= 240; x += 2) {
    const itN = climateIntensity(x, 105), itS = climateIntensity(x, 125);
    if (!(itN >= 0 && itN < 1) || !(itS >= 0 && itS < 1)) monoOk = false;   // 交界带必不满强度
    if (!(climateIntensity(x, 40) > itN) || !(climateIntensity(x, 170) > itS)) monoOk = false;
  }
  for (let x = -240; x <= 240; x += 4) for (let y = 40; y <= 170; y += 3) {
    const it = climateIntensity(x, y);
    if (!(it >= 0 && it <= 1)) rangeOk = false;
  }
  assert(rangeOk, "气候 v0.6.16：climateIntensity 值域 [0,1]（全域采样）");
  assert(monoOk, "气候 v0.6.16：强度单调——深带(=1) 严格大于交界带（<1，FADE 爬坡未满）");
  // 温带核（中部）：雪线/旱线摆动区间重叠，不存在「恒温带 y」——用强度表意：y=115 横扫既有带内点（强度>0）也有带外点（=0）
  let coreIn = 0, coreOut = 0;
  for (let x = -240; x <= 240; x += 2) {
    if (climateIntensity(x, 115) > 0) coreIn++; else coreOut++;
  }
  assert(coreIn > 0 && coreOut > 0,
    "气候：温带核 mixed（y=115 行带内 " + coreIn + " / 带外 " + coreOut + "——中部无恒定带，曲线边界直通中部犬牙）");
  // 边界带 mixed：固定 y=110 横扫——雪线/旱线随 x 噪声摆动，同一行上多气候共存（曲线犬牙）
  let snowN = 0, otherN = 0;
  for (let x = -240; x <= 240; x++) {
    if (climateAt(x, 110) === "snow") snowN++; else otherN++;
  }
  assert(snowN > 0 && otherN > 0 && snowN < 481,
    "气候 v0.6.16：边界带 mixed（y=110 行 snow " + snowN + " / 非雪 " + otherN + "，无直线分界）");
  // 同长度换屋不即时失效（60s 缓存窗）：minY/maxY 移到 200~230，立即读仍是旧图结果；
  // 选 y=185 做噪声摆动鲁棒锚点：旧图（minY100）185 恒旱带（>旱线最大 140），新图（minY200）恒雪带（<雪线最小 190）
  world.houses = [{ x: 0, y: 200 }, { x: 5, y: 230 }];
  assert(climateAt(0, 185) === "drought",
    "气候：同长度换屋读旧缓存（60s 窗内不刷新，185 在旧图恒为旱带——噪声边界也摆不进来）");
  world.time += 61;
  assert(climateAt(0, 185) === "snow",
    "气候：越过 60s 缓存窗后刷新新图（185 落新雪带——雪线最小值 190 之外恒雪）");
  // 还原真实房屋并强制刷缓存（时间单调前进不回拨：同长度撞车时 60s 窗是唯一失效入口，+61 保平安）
  world.houses = savedHouses;
  world.time += 61;
  climateAt(world.store.x, world.store.y);
  // currentAt：水面非零单位向量且确定（同格两次全等）；陆地零向量
  let wS = null;
  for (let r = 4; r <= 80 && !wS; r++) {
    for (let dy = -r; dy <= r && !wS; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t2 = tileAt(world.store.x + dx, world.store.y + dy);
      if (t2 === T.WATER || t2 === T.DEEP) { wS = { x: world.store.x + dx, y: world.store.y + dy }; break; }
    }
  }
  if (!wS) { assert(true, "洋流：无海域格（地理罕见，跳过）"); } else {
    const c1 = currentAt(wS.x + 0.5, wS.y + 0.5), c2 = currentAt(wS.x + 0.5, wS.y + 0.5);
    assert(Math.abs(c1.dx * c1.dx + c1.dy * c1.dy - 1) < 1e-3,
      "洋流：水面返回单位向量（模长² " + (c1.dx * c1.dx + c1.dy * c1.dy).toFixed(4) + "）");
    assert(c1.dx === c2.dx && c1.dy === c2.dy, "洋流：同格确定性（两次调用全等）");
    const cl = currentAt(world.store.x + 0.5, world.store.y + 0.5);
    assert(cl.dx === 0 && cl.dy === 0, "洋流：陆地零向量");
  }
}

// ===== 29. 农田气候因子（v0.6.15）：同起点双田同 dt 驱动，雪带 grow 增速 ≈0.85× 对照 =====
// 合成田：waterCd 拉满跳过水源复检、irrigated 预置真——farmTick 纯走气候因子分支
{
  const savedHouses = world.houses, savedFarmN = world.farms.length;
  world.houses = [{ x: 0, y: 100 }, { x: 5, y: 130 }];   // 雪线基线 110 / 旱线基线 120（±WOBBLE 20 曲线）
  world.time += 61;   // 强制刷 climateAt 缓存（同长度换屋的唯一失效入口，28 留下的旧图不得污染）
  // v0.6.16 曲线边界：固定 x 上 wobble 冻结 → 带仍是 y 阶跃。深雪 y=40 恒雪（雪线最内界 90 之外）；
  // 温带 y 自适应扫描（90.5~139.5 找 temperate——旱线可能摆到 100 之下，固定 y 不再保证温带）
  let fTempY = null;
  for (let y = 90.5; y <= 139.5; y += 1) if (climateAt(world.store.x, y) === "temperate") { fTempY = y; break; }
  if (fTempY === null) { assert(true, "农田：该 x 上雪旱带反序无温带 y（噪声曲线极端，跳过）"); } else {
  world.farms.push({ x: world.store.x, y: 40, grow: 0, crop: null, irrigated: true, waterCd: 1e9 });
  world.farms.push({ x: world.store.x, y: fTempY, grow: 0, crop: null, irrigated: true, waterCd: 1e9 });
  const fSnow = world.farms[world.farms.length - 2], fTemp = world.farms[world.farms.length - 1];
  // farmTick 直驱（不走 simUpdate）：10s 全世界演化中若恰有真实建房落地，houses.length 变化会
  // 触发 climateAt 缓存重算、把合成带整体搬走（minY 被新村屋拉走）——单元考察只驱动 farmTick 本身
  for (let i = 0; i < 100; i++) farmTick(STEP);   // 10s
  const ratio = fSnow.grow / fTemp.grow;
  assert(Math.abs(ratio - SIM.CLIMATE.SNOW_FARM) < 0.02,
    "农田：雪带生长增速 ≈0.85× 温带对照（实测 " + ratio.toFixed(3) + "，grow " +
    fSnow.grow.toFixed(2) + " vs " + fTemp.grow.toFixed(2) + "）");
  }
  world.farms.length = savedFarmN;
  world.houses = savedHouses;
}

// ===== 30. 浆果再生概率折算（v0.6.15）：雪 0.8 / 旱 0.7 / 温 1.0 —— 大样本频率核对 =====
// 直接调 berryTick（绕过 60s 再生窗）：每次前清零目标键，按气候带统计 +1 频率。
// 气候带由合成 houses 圈出目标键所在 y——同一真实浆果键在三带间搬移，无需真实地理三带浆果。
// v0.6.16 噪声鲁棒窗：|WOBBLE|=20 会把边界摆过旧版固定 ±10 内衬——雪窗 [ky+15, ky+35] 保证
// 雪线（≥ky+5）恒在键上方、旱线（≥ky+5）恒在下方；旱窗 [ky-35, ky-15] 对称保证；温窗 ±30 夹层。
{
  const savedHouses = world.houses;
  const it = world.berryStock.entries().next();
  if (it.done) { assert(true, "浆果：世界无浆果键（地理罕见，跳过）"); } else {
    const [key, savedV] = it.value;
    const [kx, ky] = key.split(",").map(Number);
    const freqOf = (minY, maxY, trials) => {
      world.houses = [{ x: 0, y: minY }, { x: 5, y: maxY }];
      world.time = Math.ceil(world.time / 60) * 60;   // 落进 berryTick 的 60s 再生窗（time%60≤1）且越过缓存窗
      climateAt(kx, ky);   // 预热刷新（防首读陈旧图）
      let hit = 0;
      for (let i = 0; i < trials; i++) {
        world.berryStock.set(key, 0);
        world.time += 60;
        berryTick();
        if (world.berryStock.get(key) === 1) hit++;
      }
      return hit / trials;
    };
    const fSnow = freqOf(ky + 15, ky + 35, 2000), fDrought = freqOf(ky - 35, ky - 15, 2000), fTemp = freqOf(ky - 30, ky + 30, 200);
    world.berryStock.set(key, savedV);
    world.houses = savedHouses;
    world.time += 61;   // 还原后强制刷缓存（真实 houses），时间保持单调
    climateAt(world.store.x, world.store.y);
    assert(fTemp === 1, "浆果：温带再生恒 +1（实测 " + fTemp + "）");
    assert(Math.abs(fSnow - SIM.CLIMATE.SNOW_BERRY) < 0.06,
      "浆果：雪带再生频率 ≈0.8（实测 " + fSnow.toFixed(3) + "，2000 样本）");
    assert(Math.abs(fDrought - SIM.CLIMATE.DROUGHT_BERRY) < 0.06,
      "浆果：旱带再生频率 ≈0.7（实测 " + fDrought.toFixed(3) + "，2000 样本）");
  }
}

// ===== 31. 洋流船速与台风（v0.6.15）：shipEnvMul 顺/逆流分档 + 台风圈内 ×0.6；行人 stepAlong ×0.85 =====
{
  // shipEnvMul 单元：海域格上顺流=1.15 / 逆流=0.9 / 叠加台风=×0.6（渔船挂起与船速共用同一乘口）
  let wS2 = null;
  for (let r = 4; r <= 80 && !wS2; r++) {
    for (let dy = -r; dy <= r && !wS2; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t2 = tileAt(world.store.x + dx, world.store.y + dy);
      if (t2 === T.WATER || t2 === T.DEEP) { wS2 = { x: world.store.x + dx, y: world.store.y + dy }; break; }
    }
  }
  const savedStorm = world.storm;
  if (!wS2) { assert(true, "船速：无海域格（地理罕见，跳过）"); } else {
    const fakeShip = { x: wS2.x + 0.5, y: wS2.y + 0.5 };
    const cur = currentAt(fakeShip.x, fakeShip.y);
    world.storm = null;
    assert(shipEnvMul(fakeShip, cur.dx, cur.dy) === SIM.CURRENT_SHIP_FAST,
      "船速：顺流航向 ×" + SIM.CURRENT_SHIP_FAST);
    assert(shipEnvMul(fakeShip, -cur.dx, -cur.dy) === SIM.CURRENT_SHIP_SLOW,
      "船速：逆流航向 ×" + SIM.CURRENT_SHIP_SLOW);
    world.storm = { x: fakeShip.x, y: fakeShip.y, dx: 0, dy: 0, born: world.time, life: 1e9, r: SIM.TYPHOON_R };
    const mSt = shipEnvMul(fakeShip, cur.dx, cur.dy);
    assert(Math.abs(mSt - SIM.CURRENT_SHIP_FAST * SIM.TYPHOON_SHIP) < 1e-9,
      "船速：台风圈内顺流 ≈1.15×0.6（实测 " + mSt.toFixed(3) + "，渔船挂起共用此乘口）");
  }
  // 行人顶风跋涉：同体 A/B——无台风步幅/自速 ≈1.0，台风置身旁（stormNear 1s 节流，预热后）≈0.85
  const tA = agents.find(a => !a.dead && !a.mount && !a.voyaging && !a.sick && !a.depressed);
  let farT2 = null;
  if (tA) {
    for (let r = 16; r <= 60 && !farT2; r += 2)
      farT2 = findSpot(Math.round(tA.x), Math.round(tA.y), r, r + 1, T.GRASS, [T.HOUSE, T.FARM, T.WATER, T.DEEP]);
  }
  if (!tA || !farT2) { assert(true, "台风行人：无可用样本或远距构造点（跳过）"); } else {
    const med2 = arr => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };
    const walkNorm = () => {
      tA.thinkCd = 9999; tA.task = null; tA.exploring = null; tA.onArrive = null;
      tA.drunkT = 0; tA.mount = null; tA.mountCd = 9999;   // mountCd 拉满封死自动上马（26 的驯服马可能在路径旁——乘 1.8 会污染基线）
      tA.scanFlower = function () {}; tA.scanMountain = function () {};
      tA.flowerNear = false; tA.mountainNear = false; tA.mood = 80;
      tA.hunger = 95; tA.energy = 95; tA.thirst = 95;
      if (!tA.goTo(farT2.x, farT2.y)) return -1;
      tA.state = "walk"; tA.bloomCd = 0;   // 立即触发 1s 节流扫描（stormNear 刷新）
      const steps = [];
      let prev = { x: tA.x, y: tA.y };
      for (let i = 0; i < 90 && steps.length < 40; i++) {
        simUpdate(STEP);
        if (tA.state === "walk" && tA.path) steps.push(Math.hypot(tA.x - prev.x, tA.y - prev.y));
        prev = { x: tA.x, y: tA.y };
        if (!tA.path && !tA.dead) { if (!tA.goTo(farT2.x, farT2.y)) break; tA.state = "walk"; }
        tA.hunger = 95; tA.energy = 95; tA.thirst = 95;
      }
      return med2(steps) / (tA.speed * STEP);
    };
    world.storm = null;
    const vBase = walkNorm();
    world.storm = { x: tA.x, y: tA.y, dx: 0, dy: 0, born: world.time, life: 1e9, r: SIM.TYPHOON_R };
    const vStorm = walkNorm();   // 首步 bloomCd=0 已把 stormNear 置真（dx/dy=0 风暴不漂移、life 无限不消散）
    assert(tA.stormNear === true, "台风行人：圈内 stormNear 置真（1s 节流扫描命中，×0.85 的驱动源）");
    world.storm = savedStorm;
    tA.bloomCd = 0;
    simUpdate(STEP);
    assert(tA.stormNear === false, "台风行人：风暴撤除后 stormNear 复位");
    assert(vBase > 0.8 && vBase < 1.2, "台风行人：基线步幅/自速 ≈1.0（实测 " + vBase.toFixed(2) + "）");
    assert(vStorm > 0.72 && vStorm < 0.98,
      "台风行人：圈内步幅/自速 ≈0.85（实测 " + vStorm.toFixed(2) + "）");
  }
}

// ===== 32. 浮冰船速（v0.6.16 ICE_SHIP）：深雪带水面（climateIntensity≥0.5）×0.85，与洋流档连乘 =====
{
  const oHouses = world.houses, oStorm = world.storm;
  let wS3 = null;
  for (let r = 4; r <= 80 && !wS3; r++) {
    for (let dy = -r; dy <= r && !wS3; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t2 = tileAt(world.store.x + dx, world.store.y + dy);
      if (t2 === T.WATER || t2 === T.DEEP) { wS3 = { x: world.store.x + dx, y: world.store.y + dy }; break; }
    }
  }
  if (!wS3) { assert(true, "浮冰船速：无海域格（地理罕见，跳过）"); } else {
    world.storm = null;
    const ship = { x: wS3.x + 0.5, y: wS3.y + 0.5 };
    const cur = currentAt(ship.x, ship.y);
    const perp = { x: -cur.dy, y: cur.dx };   // 垂直航向：洋流点积分档=1，隔离出 ICE_SHIP 单因子
    // 温带对照：房屋上下夹住船位（±40 格，|WOBBLE|20 也摆不出夹层）→ 两带皆不达，强度 0
    world.houses = [{ x: wS3.x, y: wS3.y - 40 }, { x: wS3.x + 3, y: wS3.y + 40 }];
    world.time += 61;
    const mTemp = shipEnvMul(ship, perp.x, perp.y);
    // 深雪带：雪线基线 = wS3.y+70（±WOBBLE 20）→ 船位距线 ≥50 > FADE 30 → 强度饱和 1 ≥ 0.5
    world.houses = [{ x: wS3.x, y: wS3.y + 60 }, { x: wS3.x + 3, y: wS3.y + 62 }];
    world.time += 61;
    const mIce = shipEnvMul(ship, perp.x, perp.y);
    const mIceTail = shipEnvMul(ship, cur.dx, cur.dy);   // 顺流 + 浮冰连乘口径
    assert(mTemp === 1, "浮冰船速：温带水面垂直航向恒 ×1（对照 " + mTemp + "，无气候减速）");
    assert(Math.abs(mIce - SIM.CLIMATE.ICE_SHIP) < 1e-9,
      "浮冰船速：深雪带水面（intensity≥0.5）×" + SIM.CLIMATE.ICE_SHIP + "（实测 " + mIce.toFixed(3) + "）");
    assert(Math.abs(mIceTail - SIM.CURRENT_SHIP_FAST * SIM.CLIMATE.ICE_SHIP) < 1e-9,
      "浮冰船速：连乘口径——顺流 ×" + SIM.CURRENT_SHIP_FAST + " 再乘浮冰 ×" + SIM.CLIMATE.ICE_SHIP +
      "（实测 " + mIceTail.toFixed(4) + "）");
    world.houses = oHouses;
    world.storm = oStorm;
    world.time += 61;
  }
}

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
