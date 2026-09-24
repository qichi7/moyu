// 大事件探针（工具，不进回归清单）：headless 长跑，记录里程碑首现时刻
// 用法：node dev/test/milestones.js [--end=N] [--budget=M] [seed...]（无参 = 并行跑 42 / 104729 / 99991，
//       12000 sim 秒；--end=36000 可拉长窗口——时代由聚落等级驱动，era≥2 的酒坊/岛际大桥在 12000s 内通常不触发）
// 并行化：每 seed 独立子进程（同文件 --child=<seed> 自调用，单 seed 单进程），父进程收齐后按原格式汇总；
//         dt=0.1 与事件口径一字不动；总时长 ≈ 单 seed 时长（三进程并行）
// 双闸截止（v0.6.18 收口）：模拟时间闸（--end，默认 12000）与真实时间闸（--budget 分钟，默认 8，
//         Date.now 判定，子进程 while 内每 500 步查一次）任一先到即打断——结果记实际到达的 world.time，
//         未发生事件在汇总表标「未达（截断 …）」。预算闸兜底 kill = budget + 90s 余量
// 只 console.log 汇总表格，不 assert、不影响 exitCode；探针事件口径见表尾备注
// 加载模式照抄 drink.js/mood.js：vm 注入 .tmp_logic.js（需先 node dev/build.js）
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");
const argv = process.argv.slice(2);
const endArg = argv.find(a => a.startsWith("--end="));
const END = endArg ? Number(endArg.slice(6)) || 12000 : 12000;
const budgetArg = argv.find(a => a.startsWith("--budget="));
const BUDGET_MIN = budgetArg ? Number(budgetArg.slice(9)) || 8 : 8;   // 真实时间预算（分钟）
const SEEDS = argv.filter(a => !a.startsWith("--")).map(Number);
const seeds = SEEDS.length ? SEEDS : [42, 104729, 99991];
const STEP = 0.1;
const CHILD_ARG = argv.find(a => a.startsWith("--child="));
const CHILD_SEED = CHILD_ARG ? Number(CHILD_ARG.slice(8)) : null;

// 时间换算对照 main.js:281-282 HUD 公式：totalDays=floor(t/DAY_LEN)、年=floor(days/YEAR_DAYS)+1、月=days%YEAR_DAYS+1
function ym(tSec) {
  const totalDays = Math.floor(tSec / 90);          // SIM.DAY_LEN = 90
  return "第" + (Math.floor(totalDays / 12) + 1) + "年" + (totalDays % 12 + 1) + "月";
}
const fmt = tSec => tSec.toFixed(1) + "s（" + ym(tSec) + "）";

// 事件呈现顺序与口径备注（探针口径逐条对齐任务规格）
const EVENTS = [
  ["首块农田完工 FARM",       "tasksFinish 首个 t.type=FARM"],
  ["首格桥完工 BRIDGE",       "tasksFinish 首个 BRIDGE（任意口径：任务对象无岛际标记，corridor 普通桥也带，无法从 t 区分）"],
  ["interBridges 首条立项",   "岛际大桥口径：world.interBridges Set 首次非空（sim.js 立项即登记，未必建成）"],
  ["首座游乐园完工 PARK",     "tasksFinish 首个 PARK"],
  ["首座摩天轮完工 FERRIS",   "tasksFinish 首个 FERRIS"],
  ["首桶麦酒完工 BREW_BEER",  "tasksFinish 首个 BREW_BEER"],
  ["首座房屋",               "world.houses.length>=1（genWorld 预置初始房屋则为 0s）"],
  ["首个码头",               "world.docks.length>=1"],
  ["首次出海",               "world.ships some state==='sailing'（含渔船出港）"],
  ["首批咖啡豆 beans>0",     "任一 settlement stock beans>0（咖啡田收获口径）"],
  ["首杯咖啡 coffee>0",      "补充口径：任一 settlement stock coffee>0（烘焙后可饮）"],
  ["第二聚落",               "world.settlements.length>=2"],
  ["首个聚落升为村庄",        "任一 settlement s.level>=1（时代 era1 门槛，繁荣度 12 分）"],
  ["首个聚落升为城镇",        "任一 settlement s.level>=2（时代 era2 门槛——酒坊/压榨坊/岛际大桥解锁线，繁荣度 60 分）"],
  ["首个聚落升为城市",        "任一 settlement s.level>=3（时代 era3 门槛——烘焙坊/咖啡田/游乐园解锁线，繁荣度 90 分）"],
  ["首只驯化动物",           "creatures some tamed（狗/马驯化泛化口径）"],
  ["首次骑马",               "agents some a.mount（远行自动骑乘窗口，检测步长 0.1s）"],
  ["首例抑郁病倒",           "agents some sick && sickSource==='mood'"],
  ["首位居民离世（享年）",    "world.logs 增量匹配「享年」（取日志自身 t）"],
  ["首场丰收宴席",           "world.logs 匹配「宴席」（取日志自身 t）"],
];

function runSeed(seed) {
  const script = `
${logic}

// ---- 探针接线：包裹 tasksFinish（function 声明可重绑定）；state 标志/纪事文案在主循环检测 ----
const __origTasksFinish = tasksFinish;
const __marks = {};   // 事件名 -> 首现 sim 秒（日志事件取日志自身 t）
function __mark(k, tSec) { if (!(k in __marks) || tSec < __marks[k]) __marks[k] = tSec; }
tasksFinish = function (t, agent, was) {
  try {
    if (t && !t.done) {
      const now = world.time;
      if (t.type === "FARM") __mark("首块农田完工 FARM", now);
      if (t.type === "BRIDGE") __mark("首格桥完工 BRIDGE", now);
      if (t.type === "PARK") __mark("首座游乐园完工 PARK", now);
      if (t.type === "FERRIS") __mark("首座摩天轮完工 FERRIS", now);
      if (t.type === "BREW_BEER") __mark("首桶麦酒完工 BREW_BEER", now);
    }
  } catch (e) {}
  return __origTasksFinish(t, agent, was);
};

simInit(${seed});

// world.logs 为 unshift 最新在前、上限 200 逐出——顶部条 t 变化才全扫（每步一次浅检查防漏早事件）
let __logTopT = -1;
function __scanLogs() {
  for (const l of world.logs) {
    if (typeof l.text !== "string") continue;
    if (l.text.indexOf("享年") >= 0) __mark("首位居民离世（享年）", l.t);
    if (l.text.indexOf("宴席") >= 0) __mark("首场丰收宴席", l.t);
  }
}

// 双闸主循环：模拟时间闸（END）+ 真实时间闸（BUDGET_MS，Date.now 判定）任一先到即跳出；
// 预算检查每 500 步一次（50 sim 秒粒度，开销可忽略）。dt=0.1 与事件检测口径一字未动
const __t0ms = Date.now();
const __budgetMs = ${BUDGET_MIN} * 60000;
let __steps = 0, __truncated = false;
while (world.time < ${END}) {
  simUpdate(${STEP});
  if (++__steps % 500 === 0 && Date.now() - __t0ms >= __budgetMs) { __truncated = true; break; }
  if (!("首座房屋" in __marks) && world.houses.length >= 1) __mark("首座房屋", world.time);
  if (!("首个码头" in __marks) && world.docks.length >= 1) __mark("首个码头", world.time);
  if (!("首次出海" in __marks) && world.ships.some(s => s.state === "sailing")) __mark("首次出海", world.time);
  if (!("首批咖啡豆 beans>0" in __marks) && world.settlements.some(s => (ensureStock(s).beans || 0) > 0)) __mark("首批咖啡豆 beans>0", world.time);
  if (!("首杯咖啡 coffee>0" in __marks) && world.settlements.some(s => (ensureStock(s).coffee || 0) > 0)) __mark("首杯咖啡 coffee>0", world.time);
  if (!("第二聚落" in __marks) && world.settlements.length >= 2) __mark("第二聚落", world.time);
  if (!("首个聚落升为村庄" in __marks) && world.settlements.some(s => s.level >= 1)) __mark("首个聚落升为村庄", world.time);
  if (!("首个聚落升为城镇" in __marks) && world.settlements.some(s => s.level >= 2)) __mark("首个聚落升为城镇", world.time);
  if (!("首个聚落升为城市" in __marks) && world.settlements.some(s => s.level >= 3)) __mark("首个聚落升为城市", world.time);
  if (!("首只驯化动物" in __marks) && creatures.some(c => !c.dead && c.tamed)) __mark("首只驯化动物", world.time);
  if (!("首次骑马" in __marks) && agents.some(a => !a.dead && a.mount)) __mark("首次骑马", world.time);
  if (!("首例抑郁病倒" in __marks) && agents.some(a => !a.dead && a.sick && a.sickSource === "mood")) __mark("首例抑郁病倒", world.time);
  if (!("interBridges 首条立项" in __marks) && world.interBridges && world.interBridges.size >= 1) __mark("interBridges 首条立项", world.time);
  if (world.logs.length && world.logs[0].t !== __logTopT) { __logTopT = world.logs[0].t; __scanLogs(); }
}

globalThis.__out = JSON.stringify({
  seed: ${seed},
  marks: __marks,
  end: world.time,
  truncated: __truncated,
  wallSec: (Date.now() - __t0ms) / 1000,
  pop: agents.filter(a => !a.dead).length,
  houses: world.houses.length,
  docks: world.docks.length,
  settlements: world.settlements.length,
  parks: world.parks.length,
  era: world.era,
});
`;
  const ctx = vm.createContext({ console: { log() {}, warn: console.warn, error: console.error } });
  try {
    vm.runInContext(script, ctx, { filename: "milestones.js seed=" + seed, timeout: 5400000 });
  } catch (e) {
    console.error("探针异常（seed " + seed + "）:", e.message);
    console.error(e.stack.split("\n").slice(0, 5).join("\n"));
    return null;
  }
  return JSON.parse(vm.runInContext("__out", ctx));
}

// ---- 子进程模式：单 seed 单进程，跑完向 stdout 吐一行带标记的 JSON（探针异常走 stderr）----
if (CHILD_SEED !== null) {
  const r = runSeed(CHILD_SEED);
  if (r) console.log("__MILESTONES_JSON__" + JSON.stringify(r));
  process.exit(r ? 0 : 1);
}

// ---- 父进程：并行派发子进程（每 seed 一个），收齐后按原格式汇总 ----
function runSeedParallel(seed) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const cp = spawn(process.execPath, [__filename, "--child=" + seed, "--end=" + END, "--budget=" + BUDGET_MIN],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", d => { out += d; });
    cp.stderr.on("data", d => process.stderr.write(d));   // 子进程探针异常实时透传
    const to = setTimeout(() => { try { cp.kill("SIGKILL"); } catch (e) {} }, BUDGET_MIN * 60000 + 90000);   // 预算闸 + 90s 兜底
    cp.on("close", code => {
      clearTimeout(to);
      const line = out.split("\n").find(l => l.startsWith("__MILESTONES_JSON__"));
      if (code !== 0 || !line) {
        console.error("探针异常（seed " + seed + "）: 子进程退出码 " + code + (line ? "" : "，无结果输出"));
        resolve(null);
        return;
      }
      try {
        const r = JSON.parse(line.slice("__MILESTONES_JSON__".length));
        r.elapsed = (Date.now() - t0) / 1000;
        resolve(r);
      } catch (e) {
        console.error("探针异常（seed " + seed + "）:", e.message);
        resolve(null);
      }
    });
  });
}

(async () => {
  // ---- 逐 seed 原始数据（并行跑、按 seed 顺序汇总输出）----
  const results = await Promise.all(seeds.map(s => runSeedParallel(s)));
  const runs = results.filter(r => r);
  for (const r of results) {
    if (!r) continue;
    const cutNote = r.truncated ? ` · 预算截断 @${fmt(r.end)}（墙钟 ${r.wallSec.toFixed(0)}s）` : "";
    console.log(`\n== seed ${r.seed} ==  终点 ${fmt(r.end)}${cutNote} · 存活人口 ${r.pop} · 房屋 ${r.houses} · 码头 ${r.docks} · 聚落 ${r.settlements} · 园区 ${r.parks} · 时代 ${r.era}`);
    for (const [name] of EVENTS) {
      const v = r.marks[name];
      console.log(`  ${v === undefined ? ("  未达（截断 " + Math.round(r.end) + "s）") : fmt(v).padEnd(18)}  ${name}`);
    }
    console.log(`  （耗时 ${r.elapsed.toFixed(0)}s）`);
  }
  // ---- 三 seed 汇总表：事件 | 最快(seed) | 最慢(seed) | 口径备注 ----
  if (runs.length > 1) {
    console.log("\n== 大事件探针汇总（seed " + runs.map(r => r.seed).join(" / ") + "，各跑 " + END + " sim 秒）==");
    console.log("事件 | 最快(seed) | 最慢(seed) | 口径备注");
    for (const [name, note] of EVENTS) {
      const vals = runs.map(r => ({ seed: r.seed, v: r.marks[name] }));
      const hit = vals.filter(x => x.v !== undefined);
      // 截断标注：任一 seed 被截断（预算闸先到）时，未发生事件标「未达（截断 …s）」；
      // 全部 seed 跑满 END 的未发生 = 真未达，标「未达（截断 12000s）」口径同
      const cuts = runs.filter(r => r.truncated || r.end < END - 0.5).map(r => Math.round(r.end) + "s");
      const missCell = "未达（截断 " + (cuts.length ? cuts.join("/") : END + "s") + "）";
      const cell = x => x.v === undefined ? missCell : fmt(x.v) + " seed" + x.seed;
      let fast, slow;
      if (hit.length) {
        fast = hit.reduce((a, b) => b.v < a.v ? b : a);
        slow = hit.reduce((a, b) => b.v > a.v ? b : a);
      }
      console.log(`${name} | ${hit.length ? cell(fast) : missCell} | ${hit.length ? (fast === slow ? "同左" : cell(slow)) : missCell} | ${note}`);
    }
  }
  console.log("\n（探针结束，无断言不影响 exitCode）");
})();
