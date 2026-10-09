// headless 逻辑冒烟：固定种子跑退化链，验证核心循环都能发生
// 依赖 build 产物 .tmp_logic.js（先 node dev/build.js）
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

let failed = false;
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return; }
  console.log("FAIL", msg);
  failed = true;
}

const ctx = vm.createContext({ console, assert });
try {
  vm.runInContext(logic, ctx, { filename: ".tmp_logic.js" });
} catch (e) {
  console.error("FAIL 逻辑层加载抛异常:", e);
  process.exit(1);
}

vm.runInContext(`
// ===== 场景A：走位逃亡（flee 策略）→ 活到计时退化链走满 =====
simInit(42, 800, 600);
simStart();
const evts = { devolve: [], catch: 0, molecule: 0, mutate: 0, end: 0, catalyst: 0 };
onEvent("devolve", d => evts.devolve.push(d));
onEvent("catch", () => evts.catch++);
onEvent("molecule", () => evts.molecule++);
onEvent("mutate", () => evts.mutate++);
onEvent("end", () => evts.end++);
onEvent("catalyst", () => evts.catalyst++);

const STEP = 0.05;
for (let i = 0; i < 1400; i++) {           // 70 sim 秒 > 3×20s 退化周期
  // flee 策略：逃离最近天敌为主 + 大半径近身转向 + 墙角规避
  let rx = 0, ry = 0;
  let cx = 0, cy = 0, nearest = 1e9, nx = 0, ny = 0;
  for (const pr of sim.preds) {
    const dx = sim.player.x - pr.x, dy = sim.player.y - pr.y;
    const d2 = dx * dx + dy * dy + 1;
    const d = Math.sqrt(d2);
    if (d < nearest) { nearest = d; nx = dx; ny = dy; }
    const f = 500000 / (d2 * d);          // 1/d² 衰减：~90px 内开始避让
    rx += dx / d * f; ry += dy / d * f;
  }
  if (nearest < 1e9) {
    const nl = Math.hypot(nx, ny) || 1;
    rx += nx / nl * 300; ry += ny / nl * 300;
  }
  const M = 80;
  if (sim.player.x < M) rx += (M - sim.player.x) * 5;
  if (sim.player.x > sim.w - M) rx -= (sim.player.x - (sim.w - M)) * 5;
  if (sim.player.y < M) ry += (M - sim.player.y) * 5;
  if (sim.player.y > sim.h - M) ry -= (sim.player.y - (sim.h - M)) * 5;
  const cw = Math.max(0, 1 - Math.min(sim.player.x, sim.w - sim.player.x) / M);
  const ch = Math.max(0, 1 - Math.min(sim.player.y, sim.h - sim.player.y) / M);
  const corner = Math.max(cw * ch, (cw + ch) / 2);
  rx += (sim.w / 2 - sim.player.x) * corner * 0.4;
  ry += (sim.h / 2 - sim.player.y) * corner * 0.4;
  const l = Math.hypot(rx, ry) || 1;
  simSetInput(rx / l, ry / l);
  if (sim.formIdx === 0 && nearest < 75 && sim.player.dashCd <= 0) simDash();
  simUpdate(STEP);
}

assert(sim.formIdx === 3, "70s 内退化链走满到分子（formIdx=" + sim.formIdx + "）");
assert(sim.stats.dashes >= 1, "牛马形态冲刺已发生");
assert(evts.devolve.length === 3, "恰好三次退化事件（" + evts.devolve.length + "）");
assert(evts.devolve[0].to === 1 && evts.devolve[1].to === 2 && evts.devolve[2].to === 3, "退化链 1→2→3 顺序正确");
assert(evts.devolve[0].formName === "猴子" && evts.devolve[1].formName === "草履虫" && evts.devolve[2].formName === "阿巴阿巴分子", "形态名正确");
assert(evts.molecule === 1, "到达分子形态广播 molecule 事件");
assert(MULTIPLIERS[sim.formIdx] === 1e12, "分子形态累计退化 1 万亿倍");
const frozenTime = sim.time;
// 阈值标定（探针实测，非拍脑袋）：本反应式力场机器人在 5 个种子下的到达分子时刻
// 为 29.1~45.5s（seed42 最差 29.1，被抓 1~2 次）；理论计时满勤 = 3×20s = 60s，
// 人类玩家走位/冲刺/引诱应显著高于机器人，故按「自然低点 − 2 余量」规则取 27。
assert(frozenTime > 27, "分数冻结在到达分子时刻（" + frozenTime.toFixed(1) + "s > 27，标定见注释）");
assert(sim.preds.length === 0, "分子形态无天敌（无敌）");
assert(sim.cats.length <= 1, "触媒场上至多一个");

// 分子形态再跑 5 秒：时间不再增长，但布朗运动仍在动
const px0 = sim.player.x, py0 = sim.player.y;
for (let i = 0; i < 100; i++) simUpdate(STEP);
assert(Math.abs(sim.time - frozenTime) < 1e-9, "分子形态分数冻结（5s 后 time 不变）");
assert(Math.hypot(sim.player.x - px0, sim.player.y - py0) > 1, "布朗运动持续位移");
assert(isFinite(sim.player.x) && isFinite(sim.player.y), "坐标无 NaN");

// 触媒变异：把触媒放到玩家脚下，应触发一次 mutate
const molBefore = sim.molIdx;
sim.cats.length = 0;
sim.catTimer = 0;
simUpdate(STEP);                            // 生成触媒
sim.cats[0].x = sim.player.x; sim.cats[0].y = sim.player.y;
simUpdate(STEP);                            // 拾取
assert(evts.mutate === 1 || sim.molIdx !== molBefore, "触媒拾取触发分子变异");

// 手动结束：无限遨游只能自己点「回去上班」
simEndRun();
assert(sim.over === true && sim.running === false, "手动结束后 over=true");
assert(evts.end === 1, "end 事件恰好一次");
simEndRun();
assert(evts.end === 1, "重复结束不重复广播");

// ===== 场景B：站桩摆烂 → 被捕加速退化，分数显著低于走位流 =====
simInit(42, 800, 600);
simStart();
const catchesB = { n: 0 };
onEvent("catch", () => catchesB.n++);
for (let i = 0; i < 1400; i++) {
  simSetInput(0, 0);
  simUpdate(STEP);
  if (sim.formIdx === 3) break;
}
assert(sim.formIdx === 3, "站桩也会被逼到分子形态（退化不可逆）");
assert(catchesB.n >= 3, "站桩被抓 ≥3 次（" + catchesB.n + "，被捕=加速退化）");
assert(sim.time < frozenTime - 5, "被抓加速退化 → 分数更低（" + sim.time.toFixed(1) + " < " + frozenTime.toFixed(1) + "）");

// ===== 场景C：resize 边界与 Entity 约束 =====
simInit(7, 400, 300);
simStart();
simResize(200, 200);
for (let i = 0; i < 200; i++) { simSetInput(0.7, 0.7); simUpdate(STEP); }
assert(sim.player.x >= 0 && sim.player.x <= 200 && sim.player.y >= 0 && sim.player.y <= 200, "resize 后实体约束在场内");
for (const pr of sim.preds) assert(pr.x >= 0 && pr.x <= 200 && pr.y >= 0 && pr.y <= 200, "天敌约束在场内");

// ===== 场景D：未开始不更新 =====
simInit(42, 800, 600);
const t0 = sim.time;
simUpdate(STEP);
assert(sim.time === t0 && sim.running === false, "simInit 后未 start 不推进");
simStart();
simUpdate(STEP);
assert(sim.time > 0, "start 后开始计分");
`, ctx);

if (failed) { console.error("---- smoke 存在 FAIL ----"); process.exit(1); }
console.log("---- smoke 全部通过 ----");
