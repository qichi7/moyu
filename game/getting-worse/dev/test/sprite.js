// 渲染冒烟测试：软件光栅化跑全套 sprite 烘焙与 drawScene
// 动机：headless 逻辑测试无法发现「烘焙出全空 sprite / 无效颜色」类渲染回归，
// 故用像素缓冲 stub 真正执行绘制管线，断言每个 sprite 都有实心像素、场景帧非空。
// 依赖 build 产物 .tmp_logic.js（先 node dev/build.js）
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const dev = path.join(__dirname, "..");
const logic = fs.readFileSync(path.join(dev, ".tmp_logic.js"), "utf8");
const sprites = fs.readFileSync(path.join(dev, "src", "sprites.js"), "utf8");
const render = fs.readFileSync(path.join(dev, "src", "render.js"), "utf8");

// ---- 颜色解析（非法颜色直接抛错 = NaN 色回归防线） ----
function parseColor(c) {
  if (typeof c !== "string") return null;
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? m[1].split("").map(s => s + s).join("") : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map(s => parseFloat(s));
    if (p.some(n => Number.isNaN(n))) throw new Error("无效颜色: " + c);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (c !== "") throw new Error("无法解析的 fillStyle: " + c);
  return null;
}

// ---- 像素缓冲 canvas stub ----
function makeCanvas() {
  const st = { w: 1, h: 1, buf: new Uint8ClampedArray(4) };
  const realloc = () => { st.buf = new Uint8ClampedArray(st.w * st.h * 4); };
  const cv = {
    get width() { return st.w; },
    set width(v) { st.w = Math.max(1, v | 0); realloc(); },
    get height() { return st.h; },
    set height(v) { st.h = Math.max(1, v | 0); realloc(); },
    get _buf() { return st.buf; },
    toDataURL() { return "data:,"; },
  };
  cv.getContext = () => ({
    canvas: cv,
    get fillStyle() { return st.fillStyle; },
    set fillStyle(v) { parseColor(v); st.fillStyle = v; },
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    fillRect(x, y, w2, h2) {
      const col = parseColor(st.fillStyle);
      if (!col) return;
      const a = col[3] * (this.globalAlpha != null ? this.globalAlpha : 1);
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
      const x1 = Math.min(st.w, Math.ceil(x + w2)), y1 = Math.min(st.h, Math.ceil(y + h2));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * st.w + xx) * 4;
        st.buf[i] = col[0] * a + st.buf[i] * (1 - a);
        st.buf[i + 1] = col[1] * a + st.buf[i + 1] * (1 - a);
        st.buf[i + 2] = col[2] * a + st.buf[i + 2] * (1 - a);
        st.buf[i + 3] = Math.min(255, st.buf[i + 3] + a * 255);
      }
    },
    drawImage(src, dx, dy, dw, dh) {
      if (!src || !src._buf) return;
      dw = dw || src.width; dh = dh || src.height;
      const x0 = Math.max(0, Math.floor(dx)), y0 = Math.max(0, Math.floor(dy));
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
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    getImageData(x, y, w2, h2) {
      const out = new Uint8ClampedArray(w2 * h2 * 4);
      for (let yy = 0; yy < h2; yy++) for (let xx = 0; xx < w2; xx++) {
        const sx = Math.min(st.w - 1, x + xx), sy = Math.min(st.h - 1, y + yy);
        out.set(st.buf.subarray((sy * st.w + sx) * 4, (sy * st.w + sx) * 4 + 4), (yy * w2 + xx) * 4);
      }
      return { data: out, width: w2, height: h2 };
    },
  });
  return cv;
}

let failed = false;
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return; }
  console.log("FAIL", msg);
  failed = true;
}

const docStub = { createElement(tag) { return tag === "canvas" ? makeCanvas() : makeCanvas(); } };
const ctx = vm.createContext({ console, assert, document: docStub });
try {
  vm.runInContext(logic + "\n" + sprites + "\n" + render, ctx, { filename: "sprite.js" });
} catch (e) {
  console.error("FAIL 加载抛异常:", e);
  process.exit(1);
}

vm.runInContext(`
// ===== 1. 全套 sprite 烘焙非空（两帧动画逐帧查） =====
const KEYS = [];
for (const f of FORMS) { if (f.key !== "molecule") KEYS.push(f.key + ":0", f.key + ":1"); }
for (const m of MOLECULES) KEYS.push("mol_" + m.key + ":0", "mol_" + m.key + ":1");
for (const p of PREDATORS) if (p) KEYS.push(p.key + ":0", p.key + ":1");
KEYS.push("catalyst:0", "catalyst:1", "decor:0", "decor:1", "decor:2");

for (const key of KEYS) {
  const cv = getSprite(key);
  const d = cv.getContext("2d").getImageData(0, 0, 16, 16).data;
  let solid = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 200) solid++;
  const min = key.startsWith("decor") ? 4 : 8;   // 背景装饰刻意低调微小
  assert(solid >= min, "sprite " + key + " 有实心像素（" + solid + "px）");
}
console.log("---- 共烘焙", KEYS.length, "个 sprite ----");

// ===== 2. 分子 sprite 原子排列 = 分子式节拍 =====
for (const m of MOLECULES) {
  assert(m.atoms.length === 4, m.folk + " 分子式四原子（" + m.atoms.join("-") + "）");
  assert(m.atoms.join("") === m.sound.join(""), m.folk + " 连读音节与原子排列一致");
}

// ===== 3. drawScene 各形态出图非空 =====
function sceneSolid(formIdx, mutateIdx) {
  simInit(42, 320, 240);
  sim.formIdx = formIdx;
  if (formIdx === 3) {
    sim.molIdx = mutateIdx || 0;
    sim.cats.push({ x: 200, y: 100, t: 5 });
  } else {
    sim.preds.push({ x: 80, y: 60, vx: 10, vy: 0, phase: 0, burstT: 1, burst: 0, stun: 0 });
  }
  sim.player.invulnT = 0;
  const cv = makeCanvasLocal();
  cv.width = 320; cv.height = 240;
  const c = cv.getContext("2d");
  drawScene(c, sim, 0.13);
  const d = cv.getContext("2d").getImageData(0, 0, 320, 240).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    if (Math.abs(d[i] - 20) + Math.abs(d[i + 1] - 24) + Math.abs(d[i + 2] - 31) > 24) nonBg++;
  }
  return nonBg;
}
function makeCanvasLocal() { return document.createElement("canvas"); }

assert(sceneSolid(0) > 300, "牛马形态场景帧非空（玩家+天敌+装饰）");
assert(sceneSolid(1) > 300, "猴子形态场景帧非空");
assert(sceneSolid(2) > 300, "草履虫形态场景帧非空");
for (let m = 0; m < MOLECULES.length; m++) {
  assert(sceneSolid(3, m) > 300, MOLECULES[m].folk + "分子形态场景帧非空（含触媒与氛围粒子）");
}

// ===== 4. 无敌闪烁帧不崩（blink 关帧） =====
simInit(42, 320, 240);
sim.player.invulnT = 1;
const cvBlink = makeCanvasLocal();
drawScene(cvBlink.getContext("2d"), sim, 0.0);
assert(true, "无敌闪烁帧绘制无异常");

// ===== 5. resize 后场景仍约束 =====
simResize(200, 200);
drawScene(makeCanvasLocal().getContext("2d"), sim, 0.5);
assert(sim.player.x <= 200 && sim.player.y <= 200, "resize 后玩家约束在场内");
`, ctx);

if (failed) { console.error("---- sprite 存在 FAIL ----"); process.exit(1); }
console.log("---- sprite 全部通过 ----");
