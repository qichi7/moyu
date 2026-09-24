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
// ---- 顶栏两行布局契约（v0.6.9）：#top-info 信息行 / #top-ctl 操作行 ----
assert(html.includes('id="top-info"'), "构建产物含顶栏信息行 #top-info（v0.6.9）");
assert(html.includes('id="top-ctl"'), "构建产物含顶栏操作行 #top-ctl（v0.6.9）");
// ---- changelog 条目契约（v0.6.7/6.9/6.10/6.12）----
assert(html.includes("v0.6.10"), "changelog 含 v0.6.10 马与骑乘条目");
assert(html.includes("v0.6.7"), "changelog 含 v0.6.7 心情乐事体系条目");
assert(html.includes("v0.6.9"), "changelog 含 v0.6.9 顶栏改版条目");
// ---- 顶栏分组契约（v0.6.12）：品牌徽章分组 + 本版本 changelog 条目 ----
assert(html.includes("grp-brand"), "构建产物含品牌徽章分组 .grp-brand（v0.6.12）");
assert(html.includes("v0.6.12"), "changelog 含 v0.6.12 顶栏美化条目");
// ---- changelog 三版本条目契约（v0.6.13 演示扩充 / v0.6.14 天象迁徙 / v0.6.15 气候系统）----
assert(html.includes("v0.6.13") && html.includes("v0.6.14") && html.includes("v0.6.15"),
  "changelog 含 v0.6.13/14/15 三条版本条目（演示扩充/天象迁徙/气候系统）");
// ---- changelog 本轮三版本条目契约（v0.6.16 气候视觉 / v0.6.17 生态平衡 / v0.6.18 时代提速）----
assert(html.includes("v0.6.16") && html.includes("v0.6.17") && html.includes("v0.6.18"),
  "changelog 含 v0.6.16/17/18 三条版本条目（气候视觉重做/生态平衡/时代提速）");
assert(html.includes("狩猎保护线") && html.includes("均衡出生") && html.includes("4~6 游戏月"),
  "changelog v0.6.17 条目含生态机制关键词（保护线/均衡出生/迁徙周期口径）");
assert(html.includes("v0.6.18") && html.includes("36 / 城市 90") && html.includes("每 30 人生长"),
  "changelog v0.6.18 条目含时代参数（城镇 36 / 城市 90 分、疆土每 30 人生长）");
assert(html.includes('id="demo-cv" width="600" height="400"') && html.includes("min(940px"),
  "构建产物 demo 画布 600×400、demo-box 940px（v0.6.13 沙盘扩容同步）");

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
      demoState.cv = { width: 600, height: 400 };   // v0.6.13：沙盘画布 440×280 → 600×400（与 template.html 同步）
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
  assert(demoRes.ok && demoRes.nTopics >= 15, "demo 契约：" + demoRes.nTopics + " 个主题数据/画布行宽/时间轴完整（v0.6.13 起 15 主题）");
  assert(demoRes.drew, "demo 打断切换：点击另一机制立即重置播放（mood→drinks）");
  assert(demoRes.allOk, "demo 播放：全部主题全时段沙盘绘制扫描无异常" + (demoRes.err ? "（" + demoRes.err + "）" : ""));
}

process.exitCode = failed ? 1 : 0;
