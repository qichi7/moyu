// 入口冒烟测试：stub DOM 跑 index.html 的完整启动链
// 背景：主 IIFE 若因 const TDZ/引用错误在浏览器静默崩溃（黑屏），语法检查与
// headless 逻辑测试均无法发现——必须把「入口能跑通」纳入自动验证
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error("FAIL index.html 中未找到 <script>"); process.exit(1); }
const script = m[1];

// ---- stub 元素 ----
function makeElement(id) {
  const e = {
    id, textContent: "", innerHTML: "", style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    appendChild() {}, remove() {},
    children: [],
    getContext: () => ctxStub,
    toDataURL() { return "data:,"; },
    closest: () => null,
  };
  if (id === "cv") { e.width = 0; e.height = 0; }
  return e;
}

// ctx 所有方法 no-op，属性可写
const ctxStub = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});

const elements = {};
const docStub = {
  addEventListener() {},
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(id);
    return elements[id];
  },
  // sprite 惰性烘焙用离屏 canvas
  createElement(tag) {
    const key = "@" + tag;
    if (!elements[key]) {
      const e = makeElement(key);
      if (tag === "canvas") { e.width = 0; e.height = 0; }
      elements[key] = e;
    }
    return elements[key];
  },
  querySelectorAll() { return []; },
};

const rafCbs = [];
let now = 0;
const winStub = {
  innerWidth: 1280, innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener() {},
};
const sandbox = {
  console,
  document: docStub,
  window: winStub,
  location: { protocol: "file:" },
  performance: { now: () => now },
  requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  clearTimeout() {},
};
sandbox.globalThis = sandbox;

let failed = false;
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return; }
  console.log("FAIL", msg);
  failed = true;
}

const entryCtx = vm.createContext(sandbox);
try {
  vm.runInContext(script, entryCtx, { filename: "index.html#script" });
  assert(true, "主启动链执行无异常（TDZ/引用错误会在此抛出）");
} catch (e) {
  console.log("FAIL 启动链抛异常:", e.message);
  console.log(e.stack.split("\n").slice(0, 4).join("\n"));
  process.exit(1);
}

// 驱动 60 帧：每帧 +100ms，模拟 6 秒真实运行（开始界面待命态）
try {
  for (let f = 0; f < 60; f++) {
    now += 100;
    const cbs = rafCbs.splice(0);
    if (!cbs.length) break;
    for (const cb of cbs) cb(now);
  }
} catch (e) {
  console.log("FAIL 帧循环抛异常:", e.message);
  process.exit(1);
}

assert(rafCbs.length > 0, "帧循环已注册（rAF 链存活）");
assert(docStub.getElementById("cv").width === 1280, "canvas 已随窗口尺寸初始化");

// 逻辑层状态断言（const 声明不进 sandbox 属性，须复用同一 context 在内部取值）
const state = vm.runInContext(
  "({ running: sim.running, formIdx: sim.formIdx, playerOk: !!sim.player, w: sim.w, h: sim.h, preds: sim.preds.length })",
  entryCtx
);
assert(state.playerOk, "simInit 已执行（玩家实体已就位）");
assert(state.formIdx === 0, "初始形态为牛马（退化链起点）");
assert(state.w === 1280 && state.h === 800, "赛场尺寸同步窗口");
assert(state.preds >= 2, "初始天敌已生成");
assert(state.running === false, "待命态未开跑（等开始按钮）");

// ---- 模拟点击开始 → 帧循环推进 ----
vm.runInContext("simStart()", entryCtx);
try {
  for (let f = 0; f < 80; f++) {          // 8 秒
    now += 100;
    const cbs = rafCbs.splice(0);
    if (!cbs.length) break;
    for (const cb of cbs) cb(now);
  }
} catch (e) {
  console.log("FAIL 开始后帧循环抛异常:", e.message);
  process.exit(1);
}
const state2 = vm.runInContext("({ running: sim.running, time: sim.time, devolveIn: sim.devolveIn })", entryCtx);
assert(state2.running === true, "simStart 后进入运行态");
assert(state2.time > 5, "存活计时已开始流动（" + state2.time.toFixed(1) + "s）");
assert(state2.devolveIn > 10 && state2.devolveIn <= 20, "退化倒计时正常推进（" + state2.devolveIn.toFixed(1) + "s）");

// ---- 冲刺与输入接线（逻辑层函数可直接调用） ----
vm.runInContext("simSetInput(1, 0); simDash();", entryCtx);
const dashOk = vm.runInContext("sim.stats.dashes >= 1 || sim.player.dashCd > 0 || sim.formIdx !== 0", entryCtx);
assert(dashOk, "冲刺指令被逻辑层接受");

// ---- 构建产物契约 ----
assert(html.includes("<title>越玩越菜 · 生存退化 ·"), "页面标题含游戏名与副标题：生存退化");
assert(html.includes('id="screen-start"') && html.includes('id="screen-over"'), "开始/结算双屏 DOM 齐备");
assert(html.includes('id="btn-end"'), "分子形态「回去上班」按钮存在");
assert(html.includes("PC宇宙"), "开始界面含 PC宇宙 世界观叙事");
assert(html.includes("阿巴阿巴分子") && html.includes("二阿化二巴"), "阿巴阿巴分子学名俗名双标");
assert(html.includes(">副标题：生存退化<") || html.includes("—— 生存退化 ——"), "副标题「生存退化」在开始界面显式展示");
assert(html.includes('id="build-id"') && html.includes("v0.1.0"), "BUILD_ID 版本徽章已注入");

if (failed) { console.error("---- entry 存在 FAIL ----"); process.exit(1); }
console.log("---- entry 全部通过 ----");
