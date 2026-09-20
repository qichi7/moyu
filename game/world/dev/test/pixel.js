// 渲染冒烟测试：软件光栅化跑 drawScene 与全套 sprite 烘焙
// 动机：headless 逻辑测试无法发现"烘焙出全空 sprite / 无效颜色"类渲染回归（与 entry.js 同源），
// 故用像素缓冲 stub 真正执行渲染管线，断言每个 sprite 都有实心像素、场景帧有预期色系。
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const dev = path.join(__dirname, "..");
const logic = fs.readFileSync(path.join(dev, ".tmp_logic.js"), "utf8");   // build.js 产物：逻辑层拼接
const sprites = fs.readFileSync(path.join(dev, "src", "sprites.js"), "utf8");
const render = fs.readFileSync(path.join(dev, "src", "render.js"), "utf8");

// ---- 软件光栅化 canvas stub（width/height 可重设，重设即重分配缓冲）----
function parseColor(c) {
  if (typeof c !== "string") return null;
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map(s => parseFloat(s));
    if (p.some(n => Number.isNaN(n))) throw new Error("无效颜色: " + c);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (c !== "") throw new Error("无法解析的 fillStyle: " + c);
  return null;
}
function makeCanvas() {
  const st = { w: 1, h: 1, buf: new Uint8ClampedArray(4) };
  const realloc = () => { st.buf = new Uint8ClampedArray(st.w * st.h * 4); };
  const cv = {
    get width() { return st.w; },
    set width(v) { st.w = Math.max(1, v | 0); realloc(); },
    get height() { return st.h; },
    set height(v) { st.h = Math.max(1, v | 0); realloc(); },
    get _buf() { return st.buf; },
  };
  cv.getContext = () => ({
    canvas: cv,
    get fillStyle() { return st.fillStyle; },
    set fillStyle(v) { parseColor(v); st.fillStyle = v; },
    imageSmoothingEnabled: true,
    fillRect(x, y, w2, h2) {
      const col = parseColor(st.fillStyle);
      if (!col) return;
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
      const x1 = Math.min(st.w, Math.ceil(x + w2)), y1 = Math.min(st.h, Math.ceil(y + h2));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * st.w + xx) * 4, a = col[3];
        st.buf[i] = col[0] * a + st.buf[i] * (1 - a);
        st.buf[i + 1] = col[1] * a + st.buf[i + 1] * (1 - a);
        st.buf[i + 2] = col[2] * a + st.buf[i + 2] * (1 - a);
        st.buf[i + 3] = Math.min(255, st.buf[i + 3] + a * 255);
      }
    },
    strokeRect() {},
    clearRect() {},
    drawImage(src, dx, dy, dw, dh) {
      if (!src || !src._buf) return;
      dw = dw || src.width; dh = dh || src.height;
      const x0 = Math.max(0, dx | 0), y0 = Math.max(0, dy | 0);
      const x1 = Math.min(st.w, Math.ceil(dx + dw)), y1 = Math.min(st.h, Math.ceil(dy + dh));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const sx = Math.min(src.width - 1, Math.max(0, ((xx - dx) / dw * src.width) | 0));
        const sy = Math.min(src.height - 1, Math.max(0, ((yy - dy) / dh * src.height) | 0));
        const di = (yy * st.w + xx) * 4, si = (sy * src.width + sx) * 4;
        const a = src._buf[si + 3] / 255;
        if (a <= 0) continue;
        st.buf[di] = src._buf[si] * a + st.buf[di] * (1 - a);
        st.buf[di + 1] = src._buf[si + 1] * a + st.buf[di + 1] * (1 - a);
        st.buf[di + 2] = src._buf[si + 2] * a + st.buf[di + 2] * (1 - a);
        st.buf[di + 3] = Math.min(255, st.buf[di + 3] + a * 255);
      }
    },
    getImageData(x, y, w2, h2) {
      const out = new Uint8ClampedArray(w2 * h2 * 4);
      for (let yy = 0; yy < h2; yy++) for (let xx = 0; xx < w2; xx++) {
        const sx = Math.min(st.w - 1, x + xx), sy = Math.min(st.h - 1, y + yy);
        out.set(st.buf.subarray((sy * st.w + sx) * 4, (sy * st.w + sx) * 4 + 4), (yy * w2 + xx) * 4);
      }
      return { data: out, width: w2, height: h2 };
    },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, closePath() {},
    quadraticCurveTo() {}, fill() {}, stroke() {}, fillText() {},
    measureText: t => ({ width: String(t).length * 7 }),
  });
  return cv;
}

// ---- sandbox ----
const mainCv = makeCanvas();
mainCv.width = 1280; mainCv.height = 800;
let lastCv = mainCv;
const sandbox = {
  console,
  document: { createElement: () => makeCanvas() },
  // 供断言用：统计 sprite 实心像素数与颜色种数
  sprStats(cv) {
    let opaque = 0; const colors = new Set();
    for (let i = 0; i < cv._buf.length; i += 4) {
      if (cv._buf[i + 3] > 40) {
        opaque++;
        colors.add((cv._buf[i] >> 4) + "," + (cv._buf[i + 1] >> 4) + "," + (cv._buf[i + 2] >> 4));
      }
    }
    return { opaque, colors: colors.size };
  },
  __freshCtx() { lastCv = makeCanvas(); lastCv.width = 1280; lastCv.height = 800; return lastCv.getContext(); },
  __statsLast() { return sandbox.sprStats(lastCv); },
  __mainCv: mainCv,
  __greenPx() {
    let n = 0;
    for (let i = 0; i < lastCv._buf.length; i += 4)
      if (lastCv._buf[i + 3] > 40 && lastCv._buf[i + 1] > lastCv._buf[i] + 10 && lastCv._buf[i + 1] > lastCv._buf[i + 2] + 10) n++;
    return n;
  },
  __bluePx() {
    let n = 0;
    for (let i = 0; i < lastCv._buf.length; i += 4)
      if (lastCv._buf[i + 3] > 40 && lastCv._buf[i + 2] > lastCv._buf[i] + 20 && lastCv._buf[i + 2] > lastCv._buf[i + 1] + 10) n++;
    return n;
  },
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

let failed = false;
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return; }
  console.log("FAIL", msg);
  failed = true;
}

try {
  vm.runInContext(logic + "\n" + sprites + "\n" + render, ctx, { filename: "pixel-test" });
  vm.runInContext("simInit(42)", ctx);
  assert(true, "逻辑层 + sprites + render 拼接执行无异常");
} catch (e) {
  console.log("FAIL 加载/初始化抛异常:", e.message);
  console.log(e.stack.split("\n").slice(0, 4).join("\n"));
  process.exit(1);
}

// ---- 1. 全部 tile sprite 烘焙非空 ----
const tileReport = vm.runInContext(`
  Object.keys(T).map(k => {
    const id = T[k];
    if (id === T.VOID) return { k, skip: true };
    const r = sprStats(tileSprite(id, 2, 0));
    return { k, ok: r.opaque >= 200 && r.colors >= 3, ...r };
  })
`, ctx);
for (const r of tileReport) {
  if (r.skip) continue;
  assert(r.ok, `tile sprite ${r.k} 实心 ${r.opaque}px / ${r.colors} 色`);
}
assert(vm.runInContext(`[0,1,2,3].every(f => sprStats(waterSprite(T.WATER, 2, 0, f)).opaque >= 200)`, ctx),
  "浅海 4 帧动画 sprite 全部非空");
assert(vm.runInContext(`[0,1,2,3].every(f => sprStats(pondSprite(0, f)).opaque >= 200)`, ctx),
  "池塘 4 帧动画 sprite 全部非空");

// ---- 2. 房屋变体 / 小人姿态 / 动物 / 船 / 叠加层 全烘焙非空 ----
assert(vm.runInContext(`
  [1,2,3].every(f => [false,true].every(s => [false,true].every(g =>
    [false,true].every(l => sprStats(houseSprite(f, s, g, l)).opaque >= 120))))
`, ctx), "房屋 24 种变体（楼层×石砌×粮仓×亮窗）全部非空");
// ---- 2b. 分层小人：外观随机 / 20 姿态身体 / 腿层 / 头层 / 背包 ----
assert(vm.runInContext(`
  (() => {
    const a1 = agentLook(7), a2 = agentLook(7);
    if (JSON.stringify(a1) !== JSON.stringify(a2)) return false;   // 同 id 两次结果全等
    const shirts = new Set();
    for (let id = 0; id < 50; id++) shirts.add(agentLook(id).shirt);
    return shirts.size >= 4;   // 50 个 id 衣色至少 4 种（随机性）
  })()
`, ctx), "agentLook 确定性 + 50 id 衣色 ≥4 种");
assert(vm.runInContext(`
  (() => {
    const POSES = ["stand","walk1","walk2","run1","run2","sleep","hammer1","hammer2",
      "axe1","axe2","hoe1","hoe2","shovel1","shovel2","eat1","eat2","fish1","fish2","row1","row2"];
    for (const p of POSES) for (const sx of ["f", "m"])
      for (const c of [agentLook(3).shirt, "#ff9f43"])
        if (sprStats(agentBodySprite(c, p, sx)).opaque < 60) return false;
    return true;
  })()
`, ctx), "身体 20 姿态 × 2 性别 × 2 衣色全部非空（≥60px）");
assert(vm.runInContext(`
  ["stand","walk1","walk2","run1","run2","fish","row"].every(pk =>
    ["f", "m"].every(sx => [agentLook(5).pants, "#3a4a6b"].every(c =>
      sprStats(agentPantsSprite(c, pk, sx, agentLook(5).skin)).opaque >= 30)))
`, ctx), "腿层 7 姿态 × 2 性别 × 2 裤色全部非空（≥30px）");
assert(vm.runInContext(`
  (() => {
    for (const pool of [HAIR_STYLES_F, HAIR_STYLES_M])
      for (const st of pool) for (const sx of ["f", "m"])
        for (const sk of AGENT_SKINS) for (const hc of [AGENT_HAIRS[0], AGENT_HAIRS[3]])
          for (const nv of [false, true])
            if (sprStats(agentHeadSprite(sk, st, hc, sx, nv)).opaque < 40) return false;
    return true;
  })()
`, ctx), "头层 两性发型池 × 肤色 × 发色 × 羽饰 全组合非空（≥40px）");
assert(vm.runInContext(`
  AGENT_SKINS.every(sk => AGENT_HAIRS.every(hc => sprStats(agentHeadLieSprite(sk, hc)).opaque >= 20))
`, ctx), "躺睡侧头 15 组合全部非空（≥20px）");
assert(vm.runInContext(`
  ["food","wood","stone","sand"].every(r => sprStats(agentPackSprite(r)).opaque >= 20)
`, ctx), "背包 4 种资源全部非空（≥20px）");
assert(vm.runInContext(`
  agentPoseOf({ state: "idle" }).key === "stand" &&
  agentPoseOf({ state: "sleep" }).legs === null &&
  agentPoseOf({ state: "walk", phase: 0.5, speed: 1.7 }).key === "walk2" &&
  agentPoseOf({ state: "walk", phase: 0.3, speed: 1.7, exploring: {} }).key === "run2" &&
  agentPoseOf({ state: "eat", phase: 0.4 }).legs === "stand" &&
  agentPoseOf({ state: "work", phase: 0.2, task: { type: "FARM" } }).key === "hoe1" &&
  agentPoseOf({ state: "work", phase: 0.4, task: { type: "FISH" } }).fishing === true
`, ctx), "agentPoseOf 姿态分发（跑/睡/吃/农/钓）分支正确");
assert(vm.runInContext(`
  Object.keys(CREATURE_META).every(k => sprStats(creatureSprite(k, 0)).opaque >= 8)
`, ctx), "十种动物 sprite 全部非空");
assert(vm.runInContext(`
  ["ship", "shipH", "rescue", "boat"].every(k => sprStats(shipSprite(k)).opaque >= 40)
`, ctx), "船 4 种 sprite 全部非空");
assert(vm.runInContext(`
  [0,1,2,3].every(d => sprStats(foamSprite(d)).opaque > 0 && sprStats(ditherSprite(d)).opaque > 0)
`, ctx), "浪花/抖动过渡 4 向叠加层全部非空");

// ---- 3. 真实场景帧光栅化：三个缩放档都执行且有预期色系 ----
vm.runInContext(`
  function drawAt(zoom, cx, cy, useFresh) {
    camera.zoom = zoom; camera.x = cx; camera.y = cy;
    const c = useFresh ? __freshCtx() : __mainCv.getContext();
    drawScene(c, 1280, 800, null, null, 0.35, 1.234);
  }
  drawAt(1.6, 0, 0, false);
`, ctx);
const frame = vm.runInContext("__statsLast()", ctx);
assert(frame.opaque > 1280 * 800 * 0.5, `zoom1.6 场景帧有实心画面（${frame.opaque}px）`);
const hasGreen = vm.runInContext("__greenPx()", ctx);
assert(hasGreen > 500, `场景帧存在草地色系（${hasGreen}px 绿色）`);
const hasBlue = vm.runInContext("__bluePx()", ctx);
assert(hasBlue > 500, `场景帧存在海面色系（${hasBlue}px 蓝色）`);
try {
  vm.runInContext("drawAt(0.3, 0, 0, true)", ctx);
  const far = vm.runInContext("__statsLast()", ctx);
  assert(far.opaque > 1000, `远景缩略图路径（zoom 0.3）有产出（${far.opaque}px）`);
} catch (e) { assert(false, "远景缩略图路径抛异常: " + e.message); }
try {
  vm.runInContext("drawAt(6, 0, 0, true)", ctx);
  assert(true, "放大档（zoom 6）执行无异常");
} catch (e) { assert(false, "放大档抛异常: " + e.message); }

console.log(failed ? "\n== 渲染冒烟存在失败 ==" : "\n== 渲染冒烟全部通过 ==");
process.exitCode = failed ? 1 : 0;
