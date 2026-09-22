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
    getContext: () => ctxStub,   // 通用画布语义（demo-cv 等弹窗内 canvas；主 cv 单独覆盖尺寸）
  };
  if (id === "cv") {
    e.width = 0; e.height = 0;
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
  // 弹窗委托绑定用（v0.6.0：main.js 对 .modal 做事件委托；stub 返回空集即可）
  querySelectorAll() { return []; },
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

// ---- 更新日志弹窗契约（v0.6.5）：构建产物含顶栏按钮与弹窗容器 ----
assert(html.includes('id="changelog-btn"'), "构建产物含更新日志按钮 #changelog-btn（v0.6.5）");
assert(html.includes('id="changelog-modal"'), "构建产物含更新日志弹窗 #changelog-modal（v0.6.5）");

// ---- 机制演示契约（v0.6.0）：主题数据完整 + 全部绘制回调在 stub ctx 上无引用错误 ----
{
  const fakeSpr = { width: 16, height: 16 };
  entryCtx.tileSprite = () => fakeSpr;
  entryCtx.waterSprite = () => fakeSpr;
  entryCtx.agentPantsSprite = () => fakeSpr;
  entryCtx.agentBodySprite = () => fakeSpr;
  entryCtx.agentHeadSprite = () => fakeSpr;
  entryCtx.creatureSprite = () => fakeSpr;
  entryCtx.buildingSprite = () => fakeSpr;
  entryCtx.shipSprite = () => fakeSpr;
  entryCtx.houseSprite = () => fakeSpr;
  const demoRes = vm.runInContext(`
    let ok = true;
    for (const tp of DEMO_TOPICS) {
      if (!tp.id || !tp.name || !tp.draw && !tp.stage || !(tp.dur > 0)) ok = false;
      if (tp.stage && (!tp.stage.rows || !tp.stage.rows.every(r => r.length === tp.stage.rows[0].length))) ok = false;
      let last = -1;
      for (const st of tp.steps) { if (!(st.t > last) || !st.text) ok = false; last = st.t; }
      if (tp.steps[tp.steps.length - 1].t > tp.dur) ok = false;
    }
    const nTopics = DEMO_TOPICS.length;
    let drew = false, allOk = true, err = "";
    try {
      demoStart("mood");
      for (let i = 0; i < 10; i++) demoTick(0.1);   // mood 播到 1s
      const before = demoState.topic.id;
      demoStart("drinks");                           // 打断：点另一个机制立即切换
      const switched = before === "mood" && demoState.topic.id === "drinks" && demoState.t < 0.2;
      demoState.cv = { width: 440, height: 280 };
      demoState.g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
      for (let i = 0; i < 20; i++) demoTick(0.05);
      drew = switched;
      for (const tp of DEMO_TOPICS) {
        demoState.topic = tp; demoState.t = tp.dur * 0.9; demoState.done = false;
        for (let i = 0; i < 30; i++) demoTick(0.05);
      }
    } catch (e) { allOk = false; err = e.message; }
    ({ ok, nTopics, drew, allOk, err });
  `, entryCtx);
  assert(demoRes.ok && demoRes.nTopics >= 10, "demo 契约：" + demoRes.nTopics + " 个主题数据/画布行宽/时间轴完整");
  assert(demoRes.drew, "demo 打断切换：点击另一机制立即重置播放（mood→drinks）");
  assert(demoRes.allOk, "demo 播放：全部主题全时段沙盘绘制扫描无异常" + (demoRes.err ? "（" + demoRes.err + "）" : ""));
}

process.exitCode = failed ? 1 : 0;
