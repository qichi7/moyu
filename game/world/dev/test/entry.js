// 入口冒烟测试：stub DOM 跑 index.html 的完整启动链
// 背景：主 IIFE 曾因 const TDZ 在浏览器里静默崩溃（黑屏、时间停），语法检查与
// headless 逻辑测试均无法发现——必须把"入口能跑通"纳入自动验证
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
    id, textContent: "", innerHTML: "", value: "1.6",
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
  };
  if (id === "cv") {
    e.width = 0; e.height = 0;
    e.getContext = () => ctxStub;
  }
  return e;
}

// ctx 所有方法 no-op，属性可写；getImageData 返回空透明位图（sprite 轮廓扫描用）
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return k in t ? t[k] : () => {};
  },
  set: (t, k, v) => { t[k] = v; return true; },
});

const elements = {};
const docStub = {
  getElementById(id) {
    if (!elements[id]) elements[id] = makeElement(id);
    return elements[id];
  },
  // sprite 图集烘焙用：创建离屏 canvas（sprites.js 启动后惰性调用）
  createElement(tag) {
    const key = "@" + tag;
    if (!elements[key]) {
      const e = makeElement(key);
      if (tag === "canvas") { e.width = 0; e.height = 0; e.getContext = () => ctxStub; }
      elements[key] = e;
    }
    return elements[key];
  },
};
const rafCbs = [];
let now = 0;
const winStub = {
  innerWidth: 1280, innerHeight: 800,
  addEventListener() {},
};
const sandbox = {
  console,
  document: docStub,
  window: winStub,
  location: { protocol: "file:" },           // 跳过 dev 热刷新
  performance: { now: () => (now += 100) },  // 每帧 100ms
  requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
  setInterval() { return 1; },
  setTimeout() { return 1; },
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

// 驱动 120 帧：每帧时间戳 +100ms，模拟约 2 分钟真实运行
try {
  for (let f = 0; f < 120; f++) {
    now += 100;                                // 推进时钟，否则帧间 realDt 恒为 0
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
  "({ hasNoise: !!world.noise, houses: world.houses.length, agentN: agents.length, time: world.time })",
  entryCtx
);
assert(state.hasNoise, "simInit 已执行（噪声/世界已初始化）");
assert(state.houses >= 4, "初始粮仓与房屋已落成");
assert(state.agentN >= 12, "初始小人已出生（≥12）");
assert(state.time > 0, "模拟时间已开始流动（world.time > 0）");

process.exitCode = failed ? 1 : 0;
