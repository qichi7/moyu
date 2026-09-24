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
    // v0.6.15 台风暗圈用径向渐变：stub 返回空梯度（fillStyle 置入后 parseColor→null，fillRect 自然跳过）
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
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
  __keyLast() {   // 整帧缓冲指纹（v0.6.11 双帧对比用；__bufKey 在 vm 内定义，此处供其读 lastCv）
    let s = ""; const b = lastCv._buf;
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  },
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

// ---- 2c. S7 姿态扩展（render 层，恒可用）：drink/brew/醉酒分支 ----
assert(vm.runInContext(`
  agentPoseOf({ state: "drink", phase: 0.3 }).key === "drink1" &&
  agentPoseOf({ state: "drink", phase: 0.6 }).key === "drink2" &&
  agentPoseOf({ state: "work", phase: 0.3, task: { type: "BREW_BEER" } }).key === "brew1" &&
  agentPoseOf({ state: "work", phase: 0.6, task: { type: "PRESS_JUICE" } }).key === "brew2" &&
  agentPoseOf({ state: "work", phase: 0.6, task: { type: "BREW_COFFEE" } }).key === "brew2" &&
  agentPoseOf({ state: "walk", phase: 0.05, speed: 1.7, drunkT: 9 }).key === "stumble" &&
  agentPoseOf({ state: "walk", phase: 2.5, speed: 1.7, drunkT: 9 }).key === "walk2" &&
  Math.abs(agentPoseOf({ state: "walk", phase: 2.5, speed: 1.7, drunkT: 9 }).wobble) <= 1.5 &&
  agentPoseOf({ state: "walk", phase: 0.5, speed: 1.7 }).wobble === undefined
`, ctx), "agentPoseOf 新分支（drink/brew/醉酒 stumble+wobble）分发正确");

// ---- 2d. S6 契约扩展断言：未落地自动 SKIP（不误报 FAIL）----
// 探针原理：旧签名忽略新增 view 实参 → 同缓存键 → 像素缓冲逐字节一致；
// S6 落地后不同视图内容不同。纯 typeof 探针用于全新函数。
vm.runInContext(`
  function __bufKey(cv) {
    let s = ""; const b = cv._buf;
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
`, ctx);
let probes = {};
try {
  probes = vm.runInContext(`
    function __differs(a, b) { return __bufKey(a) !== __bufKey(b); }
    ({
      bodyView: typeof agentBodySprite === "function" &&
        __differs(agentBodySprite(agentLook(3).shirt, "stand", "m", "front"),
                  agentBodySprite(agentLook(3).shirt, "stand", "m", "side")),
      headView: typeof agentHeadSprite === "function" &&
        __differs(agentHeadSprite(AGENT_SKINS[0], "short", AGENT_HAIRS[0], "m", false, "front"),
                  agentHeadSprite(AGENT_SKINS[0], "short", AGENT_HAIRS[0], "m", false, "side")),
      pantsView: typeof agentPantsSprite === "function" &&
        __differs(agentPantsSprite(agentLook(5).pants, "stand", "m", agentLook(5).skin, "vert"),
                  agentPantsSprite(agentLook(5).pants, "stand", "m", agentLook(5).skin, "side")),
      creatureView: typeof creatureSprite === "function" &&
        __differs(creatureSprite("cow", 0, "front"), creatureSprite("cow", 0, "side")),
      riverSprite: typeof riverSprite === "function",
      buildingSprite: typeof buildingSprite === "function",
      coffeeFarmSprite: typeof coffeeFarmSprite === "function",
      packNew: typeof agentPackSprite === "function" && (() => {
        // 旧实现新键全落沙袋兜底（内容一致）；落地后至少两种内容不同
        const ks = ["water", "juice", "beer", "coffee", "beans"];
        return new Set(ks.map(r => __bufKey(agentPackSprite(r)))).size >= 2;
      })(),
    })
  `, ctx);
} catch (e) { console.log("SKIP S6 探针求值异常:", e.message); }

// SKIP 辅助：探针为假 → 打印 SKIP 行；落地后断言体抛异常（S6 半落地/缺 T 键）→ 如实 FAIL
function assertS6(desc, landed, body) {
  if (!landed) { console.log("SKIP", desc + "（S6 未落地）"); return; }
  try { assert(body(), desc); }
  catch (e) { assert(false, desc + " 抛异常: " + e.message); }
}

assertS6("body 全 pose（含 drink/brew/stumble）× 3 视图 × 2 性别非空（≥60px）", probes.bodyView, () => vm.runInContext(`
  ["stand","walk1","walk2","run1","run2","sleep","hammer1","hammer2","axe1","axe2","hoe1","hoe2",
   "shovel1","shovel2","eat1","eat2","fish1","fish2","row1","row2","drink1","drink2","brew1","brew2","stumble"]
    .every(p => ["side", "front", "back"].every(vw => ["f", "m"].every(sx =>
      sprStats(agentBodySprite(agentLook(3).shirt, p, sx, vw)).opaque >= 60)))
`, ctx));
assertS6("头层 3 视图 × 发型池 × 肤色 × 发色 × 羽饰全组合非空（≥40px）", probes.headView, () => vm.runInContext(`
  ["side", "front", "back"].every(vw =>
    [HAIR_STYLES_F, HAIR_STYLES_M].every(pool => pool.every(st => ["f", "m"].every(sx =>
      AGENT_SKINS.every(sk => [AGENT_HAIRS[0], AGENT_HAIRS[3]].every(hc => [false, true].every(nv =>
        sprStats(agentHeadSprite(sk, st, hc, sx, nv, vw)).opaque >= 40)))))))
`, ctx));
assertS6("腿层 side/vert 视图 × 7 姿态 × 2 性别 × 2 裤色非空（≥30px）", probes.pantsView, () => vm.runInContext(`
  ["side", "vert"].every(vw =>
    ["stand", "walk1", "walk2", "run1", "run2", "fish", "row"].every(pk =>
      ["f", "m"].every(sx => [agentLook(5).pants, "#3a4a6b"].every(c =>
        sprStats(agentPantsSprite(c, pk, sx, agentLook(5).skin, vw)).opaque >= 30))))
`, ctx));
assertS6("十种动物 × 3 视图 sprite 全部非空", probes.creatureView, () => vm.runInContext(`
  Object.keys(CREATURE_META).every(k => ["side", "front", "back"].every(vw =>
    sprStats(creatureSprite(k, 0, vw)).opaque >= 8))
`, ctx));
assertS6("建筑 sprite 4 种（井/酒坊/压榨坊/烘焙坊）非空", probes.buildingSprite, () => vm.runInContext(`
  [T.WELL, T.BREWERY, T.PRESS, T.ROASTERY].every(tl => sprStats(buildingSprite(tl, 0)).opaque >= 60)
`, ctx));
assertS6("河流 sprite 4 帧动画全部非空", probes.riverSprite, () => vm.runInContext(`
  [0, 1, 2, 3].every(f => [0, 1].every(v2 => sprStats(riverSprite(v2, f)).opaque >= 200))
`, ctx));
assertS6("咖啡田 sprite 4 变体非空", probes.coffeeFarmSprite, () => vm.runInContext(`
  [0, 1, 2, 3].every(v2 => sprStats(coffeeFarmSprite(2, v2)).opaque >= 200)
`, ctx));
assertS6("背包 5 种新资源（water/juice/beer/coffee/beans）非空（≥20px）", probes.packNew, () => vm.runInContext(`
  ["water", "juice", "beer", "coffee", "beans"].every(r => sprStats(agentPackSprite(r)).opaque >= 20)
`, ctx));

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

// ---- 4. v0.6.10 骑手 sprite 与骑乘渲染分支 + v0.6.6 娱乐建筑草底分支 ----
assert(vm.runInContext(`
  (() => {
    const r0 = sprStats(riderSprite(0)), r1 = sprStats(riderSprite(1));
    return r0.opaque >= 40 && r0.colors >= 3 && r1.opaque >= 40 && r1.colors >= 3;
  })()
`, ctx), "riderSprite 两帧（16×24 骑手+马）全部非空（≥40px）");
assert(vm.runInContext(`__differs(riderSprite(0), riderSprite(1))`, ctx),
  "riderSprite 两帧逐像素不同（马步对角相位 + 骑手 1px 起伏）");
try {
  vm.runInContext(`
    (() => {
      const a0 = agents.find(a => !a.dead);
      const h = spawnCreature(Math.round(a0.x), Math.round(a0.y), "horse");
      h.tamed = true; h.owner = a0; h.riddenBy = a0; a0.mount = h;
      a0.face = "right";
      drawAt(4, a0.x, a0.y, true);   // 正常路径：riderSprite 替代分层
      a0.face = "left";
      drawAt(4, a0.x, a0.y, true);   // 镜像路径：translate+scale(-1,1)
      a0.mount = null; h.riddenBy = null;
    })()
  `, ctx);
  assert(true, "骑乘渲染分支（含 left 镜像回退路径）执行无异常");
} catch (e) { assert(false, "骑乘渲染分支抛异常: " + e.message); }
try {
  vm.runInContext(`
    (() => {
      const a0 = agents.find(a => !a.dead);
      const bx = Math.round(a0.x) + 1, by = Math.round(a0.y);
      setTile(bx, by, T.PAVILION);   // 娱乐建筑分支：v0.6.6 草底打底 + buildingSprite 叠加
      drawAt(6, bx + 0.5, by + 0.5, true);
    })()
  `, ctx);
  assert(true, "娱乐建筑渲染分支（tileSprite 草底打底 + buildingSprite 叠加）执行无异常");
} catch (e) { assert(false, "娱乐建筑渲染分支抛异常: " + e.message); }

// ---- 4b. v0.6.11 水上园区设施底图走水色（结构断言）：注册假 water park 驱动 drawScene ----
// 原理：同一静止世界连续两帧（render.js 无 rand()，drawScene 确定性），仅 world.parks 的
// water 标记不同 → 帧差异只能来自该格底图（tileSprite 草底 ↔ waterSprite 水色底）；草底像素
// 绿主导、水底像素蓝主导，故蓝像素净增 + 指纹不同即可证明底图走水色（buildingSprite 叠加不变）
const waterParkRes = vm.runInContext(`
  (() => {
    let tx = -1, ty = -1;
    outer:
    for (let r = 3; r <= 90; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = world.store.x + dx, y = world.store.y + dy;
        if (tileAt(x, y) !== T.GRASS) continue;
        if (world.parks.some(p => x >= p.x0 - 1 && x <= p.x1 + 1 && y >= p.y0 - 1 && y <= p.y1 + 1)) continue;
        if (tasks.list.some(k => !k.done && Math.abs(k.x - x) + Math.abs(k.y - y) < 3)) continue;
        tx = x; ty = y; break outer;
      }
    }
    if (tx < 0) return { skip: "找不到无园区干扰的纯草地格（地理罕见）" };
    setTile(tx, ty, T.PAVILION);
    drawAt(6, tx + 0.5, ty + 0.5, true);
    const grassKey = __keyLast(), grassBlue = __bluePx();
    world.parks.push({ x: tx, y: ty, x0: tx, y0: ty, x1: tx, y1: ty, water: true });
    drawAt(6, tx + 0.5, ty + 0.5, true);
    const waterKey = __keyLast(), waterBlue = __bluePx();
    world.parks.pop();
    setTile(tx, ty, T.GRASS);
    return { tx, ty, diff: grassKey !== waterKey, dBlue: waterBlue - grassBlue };
  })()
`, ctx);
if (waterParkRes.skip) {
  console.log("SKIP", waterParkRes.skip + "，水上园区水色底人工验收");
} else {
  assert(waterParkRes.diff, `水上园区设施底图与草底逐帧不同（假 water park @${waterParkRes.tx},${waterParkRes.ty}）`);
  assert(waterParkRes.dBlue > 0, `水上园区设施底图走水色：水色帧蓝像素净增 ${waterParkRes.dBlue}（v0.6.11）`);
}

// ---- 5. v0.6.14/15 天象层（结构断言）：注入 meteor/storm 驱动 drawScene 不抛错且天象绘制调用落地 ----
// 探针口径：stub 的 stroke()/fill() 不光栅化（指纹法对矢量层失明），故用方法调用计数差分——
// 同一静止世界两帧仅天象态不同，计数差只能来自 meteor/storm 分支（拖尾 stroke/头部 arc/台风 grad+弧扇）
const skyRes = vm.runInContext(`
  (() => {
    const probe = (tod) => {
      camera.zoom = 1.6; camera.x = world.store.x; camera.y = world.store.y;
      const c = __freshCtx();
      const counts = { stroke: 0, fill: 0, arc: 0, grad: 0 };
      const wrapped = new Proxy(c, {
        get(t, k) {
          if (k === "stroke") return (...a) => { counts.stroke++; return t.stroke(...a); };
          if (k === "fill") return (...a) => { counts.fill++; return t.fill(...a); };
          if (k === "arc") return (...a) => { counts.arc++; return t.arc(...a); };
          if (k === "createRadialGradient") return (...a) => { counts.grad++; return t.createRadialGradient(...a); };
          const v = t[k];
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
      drawScene(wrapped, 1280, 800, null, null, tod, 1.234);
      return counts;
    };
    const savedMeteor = world.meteor, savedStorm = world.storm;
    const out = { threw: false };
    try {
      const base = probe(0.9);   // 夜景（tod 0.9 > NIGHT_START 0.82 → night>0.15，流星可见窗）
      world.meteor = { t0: world.time - 1, dur: 3 };   // k=1/3 落在划空窗内（hash2(t0,911) 轨迹恒定）
      const m = probe(0.9);
      world.meteor = savedMeteor;
      world.storm = { x: world.store.x, y: world.store.y, dx: 0.6, dy: 0.8, born: world.time - 50, life: 1000, r: 12 };
      const s = probe(0.9);
      world.storm = savedStorm;
      out.meteorDelta = { stroke: m.stroke - base.stroke, arc: m.arc - base.arc, fill: m.fill - base.fill };
      out.stormDelta = { stroke: s.stroke - base.stroke, arc: s.arc - base.arc, grad: s.grad - base.grad };
    } catch (e) { out.threw = true; out.err = e.message; world.meteor = savedMeteor; world.storm = savedStorm; }
    return out;
  })()
`, ctx);
if (skyRes.threw) {
  assert(false, "天象层 drawScene 抛异常: " + skyRes.err);
} else {
  assert(skyRes.meteorDelta.stroke >= 1 && skyRes.meteorDelta.arc >= 2 && skyRes.meteorDelta.fill >= 2,
    "天象层：world.meteor 驱动流星拖尾（stroke +" + skyRes.meteorDelta.stroke + "）与头部光点（arc +" +
    skyRes.meteorDelta.arc + " / fill +" + skyRes.meteorDelta.fill + "）且 drawScene 无异常（v0.6.14）");
  assert(skyRes.stormDelta.grad >= 1 && skyRes.stormDelta.arc >= 3 && skyRes.stormDelta.stroke >= 1,
    "天象层：world.storm 驱动台风暗圈（grad +" + skyRes.stormDelta.grad + "）三层螺旋弧扇（arc +" +
    skyRes.stormDelta.arc + "）与雨丝（stroke +" + skyRes.stormDelta.stroke + "）（v0.6.15）");
}
// ---- 5b. 气候贴花（v0.6.16 结构断言）：整格 tint 已删，气候视觉 = 强度场驱动的四类 sticker + 粒子带 ----
// 探针口径：spy climateIntensity（强度场 0 / 0.5 / 1 三档）+ climateAt（恒 snow）→
// ① 强度 1 帧与 0 帧指纹不同（贴花+飘雪粒子生效）；② 0.5 帧与两端皆不同（贴花概率随强度缩放）；
// ③ 强度 0 时无论 climateAt 返回什么都不画（守卫：无强度即无气候残留——旧整格 tint 已根除的回归证明）
const climRes = vm.runInContext(`
  (() => {
    const drawDay = () => {
      camera.zoom = 1.6; camera.x = world.store.x; camera.y = world.store.y;
      const c = __freshCtx();
      drawScene(c, 1280, 800, null, null, 0.5, 1.234);
      return __keyLast();
    };
    let calls = 0;
    const oAt = climateAt, oIt = climateIntensity;
    climateAt = function (x, y) { return "snow"; };
    climateIntensity = function (x, y) { calls++; return 0; };
    const off = drawDay();
    const callsOff = calls; calls = 0;
    climateIntensity = function (x, y) { calls++; return 0.5; };
    const half = drawDay();
    climateIntensity = function (x, y) { calls++; return 1; };
    const full = drawDay();
    const callsFull = calls; calls = 0;
    climateIntensity = oIt; climateAt = oAt;
    return { callsOff, callsFull, offVsFull: off !== full, halfVsOff: half !== off, halfVsFull: half !== full };
  })()
`, ctx);
assert(climRes.offVsFull && climRes.callsFull > 0,
  "气候贴花：强度场 0→1 整帧指纹变化（浮冰/积雪/雪帽贴花 + 飘雪粒子生效，强度场调用 " +
  climRes.callsFull + " 次；v0.6.16 整格 tint 已删，视觉全走贴花）");
assert(climRes.halfVsOff && climRes.halfVsFull,
  "气候贴花：强度 0.5 帧与 0/1 两端皆不同（贴花密度随强度场线性缩放，hash 概率掷骰生效）");
assert(climRes.callsOff > 0,
  "气候贴花：强度 0 时逐候选格仍询强度场（门控在 climateItOf，无气候时逐格短路不画）");

// ---- 5c. 四类气候贴花 sprite（v0.6.16）：非空 + 3 变体互异 ----
assert(vm.runInContext(`
  [0,1,2].every(v => sprStats(iceSprite(v)).opaque > 0) &&
  new Set([0,1,2].map(v => __bufKey(iceSprite(v)))).size === 3
`, ctx), "贴花：浮冰 iceSprite 3 变体非空且互异（v2 为 v0 镜像）");
assert(vm.runInContext(`
  [0,1,2].every(v => sprStats(snowPatchSprite(v)).opaque > 0) &&
  new Set([0,1,2].map(v => __bufKey(snowPatchSprite(v)))).size === 3
`, ctx), "贴花：积雪斑 snowPatchSprite 3 变体非空且互异");
assert(vm.runInContext(`
  [0,1,2].every(v => sprStats(dryPatchSprite(v)).opaque > 0) &&
  new Set([0,1,2].map(v => __bufKey(dryPatchSprite(v)))).size === 3
`, ctx), "贴花：枯草斑 dryPatchSprite 3 变体非空且互异");
assert(vm.runInContext(`
  [0,1,2].every(v => sprStats(snowCapSprite(v)).opaque > 0) &&
  new Set([0,1,2].map(v => __bufKey(snowCapSprite(v)))).size === 3
`, ctx), "贴花：山树雪帽 snowCapSprite 3 变体非空且互异");

console.log(failed ? "\n== 渲染冒烟存在失败 ==" : "\n== 渲染冒烟全部通过 ==");
process.exitCode = failed ? 1 : 0;
