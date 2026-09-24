"use strict";
// ============ 像素 Sprite 图集：程序化点阵烘焙（16×16/tile，零资源文件）============
// 画风：细像素点阵。所有 sprite 在运行时惰性烘焙到离屏 canvas，渲染帧只做 drawImage。
// 铁律：
//   1. 缓存键必须包含全部视觉输入（tile/海拔档/hash 变体/动画帧/亮窗/姿态/果量）——漏键 = 复用错图
//   2. 同作用域（与 render.js 拼接）禁止重名标识符；本文件先于 render.js 拼接
//   3. 逻辑层零 DOM——本文件属表现层（document.createElement），禁止被逻辑层引用

const SPR = 16;   // sprite 基准边长（= TILE_PX，zoom 1 时 1:1 像素对齐）

// ---- 色彩基建（自 render.js 迁入：远景缩略图与 sprite 共用同一色源）----
function shade(hex, f) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f));
  return `rgb(${r},${g},${b})`;
}
// 十六进制版 shade：产出的 hex 可再进 shade()/调色板（rgb(...) 字符串不可二次解析）
function shadeHex(hex, f) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const ELEV_TIERS = [0.76, 0.88, 1.0, 1.12, 1.24];  // 各海拔档的亮度系数
const POND_VARIANTS = ["#2a6e5c", "#2e7562", "#317c68", "#35836e"];  // 人工池塘青绿色（区别海蓝）
const TILE_ELEV_VARIANTS = {};  // 纯色海拔档位表：远景缩略图（1 格 = 1 像素）仍用它
(function initElevVariants() {
  for (const k in TILE_META) {
    const base = TILE_META[k].color;
    TILE_ELEV_VARIANTS[k] = ELEV_TIERS.map(f =>
      [0.92, 0.97, 1.0, 1.05].map(g => shade(base, f * g)));
  }
})();
function elevTierOf(e) {
  if (!(e >= 0.28)) return 2;
  return Math.max(0, Math.min(4, Math.floor((e - 0.28) / (0.92 - 0.28) * 5)));
}

// ---- 烘焙基建 ----
const _sprCache = new Map();
function sprGet(key, bake) {
  let cv = _sprCache.get(key);
  if (!cv) { cv = bake(); _sprCache.set(key, cv); }
  return cv;
}
function sprCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}
function sprCtx(w, h) {
  const cv = sprCanvas(w, h);
  return { cv, g: cv.getContext("2d") };
}
function pxF(g, x, y, color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
function rectF(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
function fillEllipseF(g, cx, cy, rx, ry, color) {
  g.fillStyle = color;
  for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++)
    for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++)
      if ((x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01) <= 1.02)
        g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
}

// 点阵模板绘制：rows 字符串数组，字符→调色板色（'.' 与未定义字符跳过），run-length 解码
function stampArt(g, rows, pal, bright, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      const col = pal[ch];
      if (col) { g.fillStyle = shade(col, bright); g.fillRect(ox + x, oy + y, run, 1); }
      x += run;
    }
  }
}
function bakeArt(w, h, rows, pal, bright) {
  const { cv, g } = sprCtx(w, h);
  stampArt(g, rows, pal, bright);
  return cv;
}
function mirrorRows(rows) { return rows.map(r => r.split("").reverse().join("")); }

// 给透明底 sprite 描 1px 深色轮廓（4 邻域扫描）——小人/动物在任意底色上一眼可辨
function outlineSprite(cv, color) {
  const g = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  const img = g.getImageData(0, 0, w, h);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = img.data[i * 4 + 3] > 40 ? 1 : 0;
  g.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) ||
        (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]))
      g.fillRect(x, y, 1, 1);
  }
  return cv;
}

// ---- 程序化地面纹理：底色 + hash 碎点（4 个 hash 变体天然错开）----
function bakeGround(v, bright, base, dark, light) {
  return sprGet(`g${base}_${v}_${bright}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    rectF(g, 0, 0, SPR, SPR, shade(base, bright));
    for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
      const hh = hash2(x * 7 + v * 131, y * 13 + v * 57);
      if (hh < 0.09) pxF(g, x, y, shade(dark, bright));
      else if (hh > 0.93) pxF(g, x, y, shade(light, bright));
    }
    return cv;
  });
}
// 在缓存的地面 sprite 之上叠加：必须复制，禁止改写缓存
function groundCopy(v, bright, base, dark, light) {
  const src = bakeGround(v, bright, base, dark, light);
  const { cv, g } = sprCtx(SPR, SPR);
  g.drawImage(src, 0, 0);
  return { cv, g };
}

// ---- 水面：底色 + 逐帧漂移的波纹短划（frame 0..3，暂停即冻结）----
// 三个颜色参数均为最终 CSS 色值（调用方完成 shade），禁止把 rgb(...) 再喂给 shade()
function bakeWater(v, frame, baseCol, waveCol, glintCol, dashN) {
  const { cv, g } = sprCtx(SPR, SPR);
  rectF(g, 0, 0, SPR, SPR, baseCol);
  for (let i = 0; i < dashN; i++) {
    const wy = (i * 5 + v * 3 + frame * 2) % 15;
    const wx = (i * 9 + v * 5 + frame * 3) % 10;
    rectF(g, wx, wy, 5 - (i % 2), 1, waveCol);
  }
  if (glintCol && frame === 3) {
    pxF(g, (v * 5 + 3) % 15, (v * 11 + 5) % 15, glintCol);
    pxF(g, (v * 7 + 9) % 15, (v * 3 + 11) % 15, glintCol);
  }
  return cv;
}

// ============================================================
// 地表点阵模板（'.' 透明）
// ============================================================
const TREE_ROWS = [
  "................",
  ".....dddddd.....",
  "...ddbbbbbbdd...",
  "..dbbbaaaaaad...",
  ".dbbbaaaaaaaad..",
  ".dbbaaaaaaaaaad.",
  ".dbaaaaaaaaaaad.",
  ".dbaaaaaaaaaaad.",
  "..dbaaaaaaaad...",
  "..dbaaaaaaad....",
  "...ddaaadd......",
  ".....dddt.......",
  "......ttt.......",
  "......ttt.......",
  ".....tttt.......",
  "................",
];
const TREE_PAL = { d: "#142f18", b: "#2e6b35", a: "#1d4a22", t: "#5a3a1e" };

const MTN_SNOW = [
  "................",
  ".......ss.......",
  "......ssss......",
  "......ssll......",
  ".....ssllll.....",
  ".....sllllld....",
  "....sllllllld...",
  "....slllllllld..",
  "...slllllllllld.",
  "...sllllllllllld",
  "..slllllllllllld",
  "..slllllllllllld",
  ".sllllllllllllld",
  ".sllllllllllllld",
  "slllllllllllllld",
  "................",
];
const MTN_BARE = [
  "................",
  "................",
  ".......ll.......",
  "......llll......",
  ".....llllld.....",
  ".....lllllld....",
  "....lllllllld...",
  "....llllllllld..",
  "...llllllllllld.",
  "...lllllllllllld",
  "..llllllllllllld",
  "..llllllllllllld",
  ".lllllllllllllld",
  ".lllllllllllllld",
  "llllllllllllllld",
  "................",
];
const MTN_PAL = { s: "#eceff4", l: "#8d9099", d: "#5c606a" };

const CAVE_ROWS = [
  "................",
  "................",
  "................",
  "................",
  ".....oooooo.....",
  "....oo0000oo....",
  "...oo000000oo...",
  "...o00000000o...",
  "...o00000000o...",
  "...o00000000o...",
  "...o00000000o...",
  "...oo000000oo...",
  "..rrrrrrrrrrrr..",
  "................",
  "................",
  "................",
];
const CAVE_PAL = { o: "#26262d", "0": "#0a0a10", r: "#45454e" };

const BUSH_ROWS = [
  "................",
  "................",
  "................",
  ".....mmmmm......",
  "...mmMMMMMmm....",
  "..mmMMMMMMMmm...",
  "..mMMMMMMMMMm...",
  "..mMMMMMMMMMm...",
  "..mmMMMMMMMm....",
  "...mmmmmmm......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
const BUSH_PAL = { m: "#255020", M: "#2e5a28" };

const FRUIT_ROWS = [
  "................",
  "....dddddd......",
  "..ddhhggggdd....",
  ".dhhggggggggd...",
  ".dhggggggggggd..",
  ".dhggggggggggd..",
  ".dgggggggggggd..",
  "..dggggggggd....",
  "...ddggggdd.....",
  ".....dddt.......",
  "......ttt.......",
  "......ttt.......",
  ".....tttt.......",
  "................",
  "................",
  "................",
];
const FRUIT_PAL = { d: "#24471f", h: "#4a8a45", g: "#3a7038", t: "#5a3a1e" };

// ============================================================
// tile sprite 入口
// ============================================================
const V_BRIGHT = [1.0, 0.965, 1.035, 0.99];   // hash 变体的微调亮度

function tileSprite(tile, eTier, v) {
  const bright = ELEV_TIERS[eTier] * V_BRIGHT[v];
  return sprGet(`t${tile}_${eTier}_${v}`, () => bakeTileArt(tile, v, bright));
}

function bakeTileArt(tile, v, bright) {
  switch (tile) {
    case T.GRASS: return bakeGround(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
    case T.SAND:  return bakeGround(v, bright, "#cfc08a", "#b8a86e", "#e2d6a2");
    case T.PATH:  return bakeGround(v, bright, "#b09a72", "#9a8862", "#c6b28a");
    case T.SITE: {
      const { cv, g } = groundCopy(v, bright, "#c9b98a", "#b3a374", "#d9cba0");
      for (const [sx, sy] of [[2, 2], [13, 2], [2, 13], [13, 13]])
        pxF(g, sx, sy, shade("#8a6236", bright));   // 四角 stake
      return cv;
    }
    case T.TREE: {
      const { cv, g } = groundCopy(v, bright, "#2f5e33", "#28502c", "#376a3c");
      stampArt(g, (v & 1) ? mirrorRows(TREE_ROWS) : TREE_ROWS, TREE_PAL, bright);
      return cv;
    }
    case T.MOUNTAIN: {
      const { cv, g } = groundCopy(v, bright, "#7a7d84", "#6b6e75", "#8a8d95");
      let rows = v < 2 ? MTN_SNOW : MTN_BARE;
      if (v & 1) rows = mirrorRows(rows);
      stampArt(g, rows, MTN_PAL, bright);
      return cv;
    }
    case T.CAVE: {
      const { cv, g } = groundCopy(v, bright, "#3a3a42", "#323239", "#45454e");
      stampArt(g, CAVE_ROWS, CAVE_PAL, bright);
      return cv;
    }
    case T.CLIFF: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#62666e", bright));
      rectF(g, 0, 0, 16, 3, shade("#787c85", bright));    // 顶部亮缘
      rectF(g, 0, 13, 16, 3, shade("#53565e", bright));   // 底部深裂带
      for (let i = 0; i < 4; i++) {                        // 竖向裂隙
        const cx2 = (v * 3 + i * 4 + ((i * v) % 3)) % 15;
        const y0 = 3 + ((v * 5 + i * 7) % 6);
        rectF(g, cx2, y0, 1, 4 + ((i + v) % 4), shade("#3a3d45", bright));
      }
      return cv;
    }
    case T.FARM: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#9c7a46", bright));    // 翻耕的土
      for (let r = 0; r < 3; r++) {
        const y = 2 + r * 5;
        rectF(g, 1, y + 2, 14, 2, shade("#6fae4e", bright));   // 苗行
        rectF(g, 1, y + 2, 14, 1, shade("#86c464", bright));   // 苗尖亮
        rectF(g, 0, y + 4, 16, 1, shade("#84673a", bright));   // 垄沟
      }
      return cv;
    }
    case T.BRIDGE: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#235d96", bright));    // 桥下水
      rectF(g, 3, 8, 4, 1, shade("#3172ae", bright));      // 水面波纹
      rectF(g, 10, 12, 4, 1, shade("#3172ae", bright));
      for (const [y, hh] of [[3, 4], [9, 4]]) {            // 两段木板
        rectF(g, 0, y, 16, hh, shade("#a97b48", bright));
        rectF(g, 0, y + hh - 1, 16, 1, shade("#8a6236", bright));
        for (let x = 2; x < 16; x += 4) rectF(g, x, y, 1, hh, shade("#8a6236", bright));
      }
      rectF(g, 0, 0, 16, 2, shade("#5c3d1e", bright));     // 两侧栏杆
      rectF(g, 0, 14, 16, 2, shade("#5c3d1e", bright));
      return cv;
    }
    case T.FENCE: {
      const { cv, g } = groundCopy(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
      rectF(g, 0, 4, 16, 2, shade("#8a6236", bright));     // 双横栏
      rectF(g, 0, 10, 16, 2, shade("#8a6236", bright));
      rectF(g, 2, 2, 2, 12, shade("#5c3d1e", bright));     // 立柱
      rectF(g, 11, 2, 2, 12, shade("#5c3d1e", bright));
      rectF(g, 2, 2, 2, 1, shade("#9a7040", bright));      // 柱头亮
      rectF(g, 11, 2, 2, 1, shade("#9a7040", bright));
      return cv;
    }
    case T.GATE: {
      // 牧场门（v0.5.3）：单侧开阖的木门——横栏断开 + 门轴柱 + 微开缝隙
      const { cv, g } = groundCopy(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
      rectF(g, 1, 2, 2, 12, shade("#5c3d1e", bright));     // 门轴柱
      rectF(g, 1, 2, 2, 1, shade("#9a7040", bright));
      rectF(g, 3, 4, 6, 2, shade("#8a6236", bright));      // 上半扇门（微开）
      rectF(g, 3, 10, 5, 2, shade("#8a6236", bright));     // 下半扇门（错位留缝）
      rectF(g, 8, 4, 1, 8, shade("#5c3d1e", bright));      // 门闩沿
      pxF(g, 12, 7, shade("#9a7040", bright)); pxF(g, 13, 8, shade("#9a7040", bright));   // 路径小径点
      return cv;
    }
    case T.PASTURE: {
      const { cv, g } = groundCopy(v, bright, "#a89a62", "#8f7f4e", "#b8aa72");
      rectF(g, 0, 0, 16, 1, shade("#7a6a3a", bright));     // 圈地边框
      rectF(g, 0, 15, 16, 1, shade("#7a6a3a", bright));
      rectF(g, 0, 0, 1, 16, shade("#7a6a3a", bright));
      rectF(g, 15, 0, 1, 16, shade("#7a6a3a", bright));
      rectF(g, 7, 1, 1, 14, shade("#7a6a3a", bright));     // 十字分隔
      rectF(g, 1, 7, 14, 1, shade("#7a6a3a", bright));
      return cv;
    }
    case T.QUARRY: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#9a9284", bright));
      rectF(g, 2, 5, 5, 4, shade("#6e675c", bright));      // 采石坑
      rectF(g, 9, 9, 5, 4, shade("#6e675c", bright));
      rectF(g, 4, 2, 3, 2, shade("#c9c2b4", bright));      // 成材石料
      rectF(g, 11, 4, 3, 2, shade("#c9c2b4", bright));
      pxF(g, 7, 8, shade("#c9c2b4", bright));
      return cv;
    }
    case T.SANDPIT: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#d8c890", bright));
      fillEllipseF(g, 7, 9, 4, 3, shade("#b8a266", bright));   // 取沙坑
      fillEllipseF(g, 11, 4, 2.5, 1.8, shade("#efe2b0", bright)); // 沙堆
      pxF(g, 3, 3, shade("#b8a266", bright));
      return cv;
    }
    case T.DOCK: {
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#8a6a42", bright));
      for (const y of [1, 6, 11]) rectF(g, 0, y, 16, 3, shade("#6e5232", bright));  // 木板
      rectF(g, 7, 4, 2, 5, shade("#4a3520", bright));      // 系船桩
      pxF(g, 7, 4, shade("#6e5232", bright));
      return cv;
    }
    case T.BAMBOO: {
      const { cv, g } = groundCopy(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
      for (const [cx2, hh] of [[3, 11], [7, 14], [12, 9]]) {   // 三两根竹竿 + 竹节 + 叶
        rectF(g, cx2, 15 - hh, 2, hh, shade("#6fae4e", bright));
        rectF(g, cx2, 15 - hh + 3, 2, 1, shade("#4d8038", bright));
        rectF(g, cx2, 15 - hh + 7, 2, 1, shade("#4d8038", bright));
        pxF(g, cx2 - 1, 15 - hh + 1, shade("#8ac46a", bright));
        pxF(g, cx2 + 2, 15 - hh + 2, shade("#8ac46a", bright));
      }
      return cv;
    }
    case T.MUSHROOM: {
      const { cv, g } = groundCopy(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
      for (const [mx, my, ms] of [[2, 10, 0.8], [6, 9, 1.3], [11, 10, 0.9]]) {   // 一丛蘑菇
        fillEllipseF(g, mx + 1.4, my, 2.6 * ms, 1.5 * ms, shade("#c95a3a", bright));   // 菌盖
        rectF(g, mx + 0.8, my, 1.4 * ms, 3.4 * ms, shade("#f0e8d8", bright));           // 柄
        pxF(g, mx + 0.8, my - 1, shade("#f0e8d8", bright));
        pxF(g, mx + 2.4, my - 0.6, shade("#e87858", bright));   // 盖上斑点
      }
      return cv;
    }
    case T.MOONBLOOM: {
      const { cv, g } = groundCopy(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");
      rectF(g, 7, 9, 1, 5, shade("#4d8038", bright));           // 茎
      for (const [dx, dy] of [[0, -1.8], [1.8, 0], [0, 1.8], [-1.8, 0]]) {
        fillEllipseF(g, 7.5 + dx, 8 + dy, 1.6, 1.6, shade("#aebfe4", bright));   // 四瓣淡蓝
      }
      fillEllipseF(g, 7.5, 8, 1.3, 1.3, shade("#f0e68a", bright));   // 亮黄花心（夜光感）
      pxF(g, 5, 12, shade("#6fae4e", bright)); pxF(g, 10, 11, shade("#6fae4e", bright));   // 叶
      return cv;
    }
    case T.PIER: {
      // 水上浮台：木平台 + 桩脚透水 + 波纹（可走的园区地面）
      const { cv, g } = sprCtx(SPR, SPR);
      rectF(g, 0, 0, 16, 16, shade("#235d96", bright));
      rectF(g, 2, 12, 4, 1, shade("#3172ae", bright)); rectF(g, 10, 13, 4, 1, shade("#3172ae", bright));
      rectF(g, 0, 0, 16, 12, shade("#a08454", bright));          // 平台
      for (const x of [0, 5, 10, 15]) rectF(g, x, 0, 1, 12, shade("#85693e", bright));   // 板缝
      rectF(g, 0, 0, 16, 1, shade("#b89968", bright));           // 亮缘
      rectF(g, 0, 11, 16, 1, shade("#6e5232", bright));          // 平台暗缘
      for (const [px2, py2] of [[2, 12], [12, 12]]) {            // 桩脚入水
        rectF(g, px2, 12, 2, 4, shade("#5c4426", bright));
      }
      return cv;
    }
  }
  return bakeGround(v, bright, "#5e8c4f", "#4d7842", "#6f9c5e");   // 兜底：未覆盖 tile 用草地
}

// ---- 水面动画 sprite 入口 ----
function waterSprite(tile, eTier, v, frame) {
  const bright = ELEV_TIERS[eTier] * V_BRIGHT[v];
  return sprGet(`w${tile}_${eTier}_${v}_${frame}`, () => {
    if (tile === T.DEEP)
      return bakeWater(v, frame, shade("#123a5e", bright), shade("#1a476e", bright), false, 2);
    return bakeWater(v, frame, shade("#235d96", bright), shade("#3172ae", bright), shade("#dff2fc", bright), 3);
  });
}
function pondSprite(v, frame) {
  const base = POND_VARIANTS[v];
  return sprGet(`p${v}_${frame}`, () =>
    bakeWater(v, frame, base, shade(base, 1.22), "#dff2fc", 2));
}

// ---- 浆果丛 / 果树：果量分档（world.berryStock）----
function propSprite(kind, eTier, v, stock) {
  const bright = ELEV_TIERS[eTier] * V_BRIGHT[v];
  return sprGet(`${kind}_${eTier}_${v}_${stock}`, () =>
    kind === "berry" ? bakeBerry(v, bright, stock) : bakeFruit(v, bright, stock));
}
function bakeBerry(v, bright, stock) {
  const { cv, g } = groundCopy(v, bright, "#3e6b35", "#356030", "#46783c");
  stampArt(g, (v & 1) ? mirrorRows(BUSH_ROWS) : BUSH_ROWS, BUSH_PAL, bright);
  const spots = (v & 1) ? [[6, 5], [9, 7], [7, 9]] : [[6, 5], [10, 6], [7, 8]];
  for (let i = 0; i < Math.min(3, stock); i++) {
    pxF(g, spots[i][0], spots[i][1], shade("#c23b3b", bright));
    pxF(g, spots[i][0] + 1, spots[i][1], shade("#e06060", bright));
  }
  return cv;
}
function bakeFruit(v, bright, stock) {
  const { cv, g } = groundCopy(v, bright, "#4a7a3a", "#406a32", "#548a44");
  stampArt(g, (v & 1) ? mirrorRows(FRUIT_ROWS) : FRUIT_ROWS, FRUIT_PAL, bright);
  const spots = (v & 1) ? [[5, 5], [9, 4], [7, 8]] : [[5, 4], [10, 6], [7, 8]];
  for (let i = 0; i < Math.min(3, stock); i++) {
    pxF(g, spots[i][0], spots[i][1], shade("#e8a13b", bright));
    pxF(g, spots[i][0], spots[i][1] - 1, shade("#f4c06a", bright));
  }
  return cv;
}

// ---- 房屋：楼层(1-3) × 石砌 × 粮仓 × 夜间亮窗，参数化烘焙（画布 16×28，向上探出屋顶）----
function houseSprite(floors, stone, granary, lit) {
  return sprGet(`h${floors}_${stone ? 1 : 0}${granary ? 1 : 0}${lit ? 1 : 0}`, () => {
    const H = 28;
    const { cv, g } = sprCtx(SPR, H);
    const wallCol = stone ? "#c8cdd4" : "#e8dcc0";
    const wallDark = stone ? "#aeb4bd" : "#d0c2a4";
    const roofCol = granary ? "#d9a441" : (stone ? "#5d6b7a" : "#b0502e");
    const roofDark = shade(roofCol, 0.8);
    // 墙体：楼底固定在 tile 底（y=27），楼层越高墙顶越往上
    const wallTop = floors >= 3 ? 6 : floors >= 2 ? 10 : 14;
    const roofBot = wallTop + 2;
    const roofTop = Math.max(0, wallTop - 6);
    rectF(g, 2, wallTop, 12, 28 - wallTop, wallCol);
    rectF(g, 12, wallTop, 2, 28 - wallTop, wallDark);          // 右侧阴影柱
    rectF(g, 2, 26, 12, 1, shade(wallCol, 0.72));              // 墙脚阴影
    if (stone) for (let y = wallTop + 3; y < 26; y += 3) rectF(g, 2, y, 12, 1, "#aeb4bd");  // 石缝
    // 屋顶（梯形，右坡阴影）
    for (let y = roofTop; y < roofBot; y++) {
      const k = (y - roofTop) / (roofBot - roofTop);
      const half = 2 + Math.round(k * 6);
      rectF(g, 8 - half, y, half * 2, 1, roofCol);
      rectF(g, 9, y, Math.max(0, half - 1), 1, roofDark);
    }
    rectF(g, 6, roofTop - 1, 5, 1, roofCol);                   // 屋脊
    // 门（粮仓宽门）
    if (granary) { rectF(g, 5, 21, 6, 7, "#4a2e18"); rectF(g, 5, 21, 6, 1, "#5c3a20"); }
    else { rectF(g, 6, 21, 4, 7, "#4a2e18"); rectF(g, 6, 21, 4, 1, "#5c3a20"); }
    // 窗（楼层 ≥2：上层每层两窗；夜间亮黄）
    if (floors >= 2) {
      const win = lit ? "#ffd966" : "#46587a";
      for (let fl = 0; fl < floors - 1; fl++) {
        const wy = 21 - (fl + 1) * 4;
        rectF(g, 4, wy, 2, 2, win); rectF(g, 10, wy, 2, 2, win);
      }
    }
    if (granary) rectF(g, 4, roofBot, 8, 1, "#f0c060");        // 粮仓檐口金线
    return cv;
  });
}

// ============================================================
// 小人：分层像素系统（head rows2-7 / body rows8-12 / pants rows13-15，脚底锚定 row15）
// 渲染叠加顺序：pants → 背包 → body → head；各层独立缓存，缓存键含全部视觉输入
// ============================================================
const AGENT_SKINS  = ["#f2d9b8", "#e6c39a", "#c99b6f"];                              // 肤色 3 档
const AGENT_SHIRTS = ["#e8e2d2","#c96f4a","#4a6fa0","#6f8f4a","#c9a24a","#8a5a8a","#4a8a8a","#a05a5a","#5a6a7a","#7a6a4a"]; // 日常衣 10 色
const AGENT_PANTS  = ["#3a4a6b","#5a4632","#6b3a3a","#3d5a46","#4a4a52","#6b5a3a"]; // 裤色 6 档
const AGENT_HAIRS  = ["#2a2018","#4a3220","#6b4a2a","#c9a05a","#8a3a2a"];            // 发色 5 档
const HAIR_STYLES_F = ["long", "bun", "short", "hat"];   // 女：长发/发髻+头花/短发/草帽
const HAIR_STYLES_M = ["short", "bald", "hat", "kasa"];  // 男：短发/光头/草帽/斗笠

// 外观随机：id 确定性 hash 五路取档（同 id 永远同款，与存档/位置无关）
function agentLook(id) {
  return {
    skin: AGENT_SKINS[(hash2(id, 11) * AGENT_SKINS.length) | 0],
    shirt: AGENT_SHIRTS[(hash2(id, 23) * AGENT_SHIRTS.length) | 0],
    pants: AGENT_PANTS[(hash2(id, 37) * AGENT_PANTS.length) | 0],
    hairC: AGENT_HAIRS[(hash2(id, 41) * AGENT_HAIRS.length) | 0],
    hairStyle: (hash2(id, 53) * 4) | 0,
  };
}

// ---- body 层：20+5 姿态 × 2 性别 × 三视图（top=最终衣色；f=连衣裙锥形下摆，m=直身摆）----
// 手部用通用肤色常量（不随个体肤色，保缓存键精简）；工具柄 #7a5a30
// view：front/back 归一为 "vert"（正/背面身体同形，脸部特征由 head 层区分）；sleep/row/stumble 仅 side
function agentBodySprite(top, pose, sex, view) {
  const vw = view === "front" || view === "back" ? "vert" : "side";
  return sprGet(`b${top}_${pose}_${sex}_${vw}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    const f = sex === "f";
    const dark = shadeHex(top, 0.78);
    const hand = "#f2d9b8";
    const H = "#7a5a30";
    const armSide = (x, y0, y1) => {   // 竖臂：袖 y0..y1-1 衣色、手 y1 肤色
      for (let y = y0; y < y1; y++) pxF(g, x, y, top);
      pxF(g, x, y1, hand);
    };
    // f 基础连衣裙：肩 row8 → 摆 rows11-13（盖住腿上部 row13）
    const dress = (hx, lw) => {
      rectF(g, 6, 8, 4, 1, top);
      rectF(g, 5, 9, 6, 2, top);
      rectF(g, hx, 11, lw, 3, top);
      rectF(g, hx, 13, lw, 1, dark);
    };
    // m 基础直身：躯干 rows8-12 宽6，底行暗部
    const torso = (lean) => {
      rectF(g, lean ? 6 : 5, 8, 6, 1, top);
      rectF(g, 5, 9, 6, 3, top);
      rectF(g, 5, 12, 6, 1, dark);
    };
    const fArms = () => { pxF(g, 4, 9, top); pxF(g, 4, 10, hand); pxF(g, 11, 9, top); pxF(g, 11, 10, hand); };
    const drawSide = () => {
      switch (pose) {
      case "stand":
        if (f) { dress(4, 8); fArms(); }
        else { torso(false); armSide(4, 9, 12); armSide(11, 9, 12); }
        break;
      case "walk1": case "walk2": case "run1": case "run2": {
        const run = pose === "run1" || pose === "run2";
        const swayL = pose === "walk1" || pose === "run1";   // 裙摆左右 1px 摆动
        if (f) {
          dress(swayL ? 3 : 5, 8);
          if (run) rectF(g, 7, 8, 4, 1, top);   // 跑：肩部前倾错位
          fArms();
        } else {
          torso(run);
          if (pose === "walk1") { pxF(g, 4, 9, top); armSide(3, 9, 12); armSide(11, 9, 12); }
          else if (pose === "walk2") { armSide(4, 9, 12); pxF(g, 11, 9, top); armSide(12, 9, 12); }
          else if (pose === "run1") {   // 大幅摆：一臂前上、一臂后下
            pxF(g, 3, 8, top); pxF(g, 3, 9, top); pxF(g, 4, 9, top); pxF(g, 3, 10, hand);
            pxF(g, 11, 10, top); pxF(g, 12, 11, top); pxF(g, 12, 12, hand);
          } else {
            pxF(g, 12, 8, top); pxF(g, 12, 9, top); pxF(g, 11, 9, top); pxF(g, 12, 10, hand);
            pxF(g, 4, 10, top); pxF(g, 3, 11, top); pxF(g, 3, 12, hand);
          }
        }
        break;
      }
      case "sleep":   // 躺睡：身体横躺 rows9-13 宽8（f 裙摆平铺更宽）
        if (f) {
          rectF(g, 5, 9, 6, 2, top);
          rectF(g, 4, 11, 8, 1, top);
          rectF(g, 3, 12, 10, 2, top);
          rectF(g, 3, 13, 10, 1, dark);
        } else {
          rectF(g, 4, 9, 8, 5, top);
          rectF(g, 5, 13, 6, 1, dark);
        }
        break;
      case "hammer1": case "hammer2": case "axe1": case "axe2":
      case "hoe1": case "hoe2": case "shovel1": case "shovel2": {
        const up = pose.endsWith("1");
        if (f) {
          dress(4, 8);
          pxF(g, 4, 9, top); pxF(g, 4, 10, hand);
          if (up) { pxF(g, 11, 9, top); pxF(g, 12, 8, top); pxF(g, 12, 7, hand); }
          else { pxF(g, 11, 9, top); pxF(g, 11, 10, top); pxF(g, 11, 11, hand); }
        } else {
          torso(false);
          armSide(4, 9, 12);
          if (up) { pxF(g, 11, 9, top); pxF(g, 12, 8, top); pxF(g, 12, 7, hand); }
          else armSide(11, 9, 12);
        }
        // 工具：抡起（上举）/砸下（近地）两帧；柄棕、锤灰/斧白/锄青/锹土黄
        if (up) {
          if (pose === "hammer1") { rectF(g, 12, 2, 1, 5, H); rectF(g, 11, 1, 3, 2, "#9aa0a8"); }
          else if (pose === "axe1") { rectF(g, 12, 2, 1, 5, H); rectF(g, 12, 1, 2, 2, "#c9cdd4"); pxF(g, 11, 2, "#c9cdd4"); }
          else if (pose === "hoe1") { rectF(g, 12, 3, 1, 4, H); rectF(g, 11, 2, 3, 1, "#8a8a92"); }
          else { rectF(g, 12, 3, 1, 4, H); rectF(g, 12, 0, 2, 3, "#b8a266"); }
        } else {
          if (pose === "hammer2") { rectF(g, 12, 10, 1, 3, H); rectF(g, 11, 13, 3, 1, "#9aa0a8"); }
          else if (pose === "axe2") { rectF(g, 12, 10, 1, 3, H); rectF(g, 12, 13, 2, 2, "#c9cdd4"); }
          else if (pose === "hoe2") { rectF(g, 12, 9, 1, 4, H); rectF(g, 11, 13, 3, 1, "#8a8a92"); }
          else { rectF(g, 12, 10, 1, 3, H); rectF(g, 11, 13, 3, 2, "#b8a266"); }
        }
        break;
      }
      case "eat1": case "eat2":   // 进食：手弯到嘴边（脸 row7 下方 1px）/放下
        if (f) {
          dress(4, 8);
          pxF(g, 4, 9, top); pxF(g, 4, 10, hand); pxF(g, 11, 9, top); pxF(g, 11, 10, hand);
          if (pose === "eat1") { pxF(g, 10, 9, top); pxF(g, 8, 8, hand); }
        } else {
          torso(false);
          armSide(4, 9, 12); armSide(11, 9, 12);
          if (pose === "eat1") { pxF(g, 11, 10, top); pxF(g, 10, 9, top); pxF(g, 9, 8, top); pxF(g, 8, 8, hand); }
        }
        break;
      case "fish1": case "fish2": {   // 持竿：双臂前伸握竿（竿体由渲染层画），两帧微摆
        const yA = pose === "fish1" ? 9 : 10, yB = pose === "fish1" ? 11 : 12;
        if (f) dress(4, 8); else torso(false);
        pxF(g, 11, yA, top); pxF(g, 12, yA, top); pxF(g, 13, yA, hand);
        pxF(g, 11, yB, top); pxF(g, 12, yB, top); pxF(g, 13, yB, hand);
        break;
      }
      case "row1": case "row2": {   // 划船坐姿：身体矮 rows9-13、坐姿展宽，双臂前伸抓握（桨由渲染层画）
        if (f) {   // 裙摆覆盖坐姿
          rectF(g, 6, 8, 4, 1, top);
          rectF(g, 5, 9, 6, 2, top);
          rectF(g, 4, 11, 8, 1, top);
          rectF(g, 3, 12, 10, 2, top);
          rectF(g, 3, 13, 10, 1, dark);
        } else {
          rectF(g, 5, 9, 6, 2, top);
          rectF(g, 4, 11, 8, 3, top);
          rectF(g, 4, 13, 8, 1, dark);
        }
        if (pose === "row1") {
          pxF(g, 11, 10, top); pxF(g, 12, 10, top); pxF(g, 13, 10, hand);
          pxF(g, 11, 11, top); pxF(g, 12, 11, top); pxF(g, 13, 11, hand);
        } else {
          pxF(g, 11, 10, top); pxF(g, 12, 10, hand);
          pxF(g, 11, 11, top); pxF(g, 12, 11, hand);
        }
        break;
      }
      case "drink1": case "drink2": {   // 饮用：举杯到嘴 / 放下（杯 #c9a86a）
        if (f) dress(4, 8); else torso(false);
        armSide(4, 9, 12);
        if (pose === "drink1") {
          pxF(g, 11, 9, top); pxF(g, 11, 8, top); pxF(g, 10, 7, top);
          rectF(g, 8, 6, 2, 2, "#c9a86a");
        } else {
          pxF(g, 11, 9, top); pxF(g, 11, 10, top);
          rectF(g, 11, 11, 2, 2, "#c9a86a");
        }
        break;
      }
      case "brew1": case "brew2": {   // 酿造搅拌：持棒搅身前桶，两帧棒位摆动
        if (f) dress(4, 8); else torso(false);
        armSide(4, 9, 12);
        rectF(g, 10, 11, 4, 3, "#8a6236");   // 身前桶
        rectF(g, 10, 11, 4, 1, "#a87c4a");
        if (pose === "brew1") { rectF(g, 8, 8, 1, 4, H); pxF(g, 8, 7, "#9aa0a8"); }
        else { rectF(g, 9, 9, 1, 4, H); pxF(g, 9, 13, "#9aa0a8"); }
        break;
      }
      case "stumble": {   // 跌倒：侧倾倒地（醉酒踉跄帧）
        if (f) {
          rectF(g, 4, 10, 8, 2, top);
          rectF(g, 3, 12, 9, 2, top);
        } else {
          rectF(g, 3, 10, 9, 4, top);
        }
        pxF(g, 12, 12, hand); pxF(g, 2, 11, top); pxF(g, 2, 12, hand);
        break;
      }
      }
    };
    const drawVert = () => {   // 正/背视：左右对称 + 中缝细节（与侧面像区分；脸/后脑由 head 层区分）
      const seam = () => { pxF(g, 8, 9, dark); pxF(g, 8, 10, dark); };
      switch (pose) {
      case "stand": case "walk1": case "walk2":
        if (f) { dress(4, 8); fArms(); seam(); } else { torso(false); armSide(4, 9, 12); armSide(11, 9, 12); seam(); }
        break;
      case "run1": case "run2":   // 跑：双臂前后错位 1px
        if (f) { dress(4, 8); pxF(g, 4, 9, top); pxF(g, 4, 10, hand); pxF(g, 11, 9, top); pxF(g, 11, 10, hand); seam(); }
        else { torso(true); pxF(g, 3, 10, top); pxF(g, 3, 11, hand); pxF(g, 12, 9, top); pxF(g, 12, 10, hand); seam(); }
        break;
      case "hammer1": case "hammer2": case "axe1": case "axe2":
      case "hoe1": case "hoe2": case "shovel1": case "shovel2": {
        const up = pose.endsWith("1");
        if (f) dress(4, 8); else torso(false);
        if (up) {   // 双臂高举过顶，工具居中上举
          pxF(g, 4, 8, top); pxF(g, 5, 7, top); pxF(g, 6, 6, top);
          pxF(g, 11, 8, top); pxF(g, 10, 7, top); pxF(g, 9, 6, top);
          rectF(g, 8, 0, 1, 6, H);
          if (pose === "hammer1") rectF(g, 7, 0, 3, 1, "#9aa0a8");
          else if (pose === "axe1") rectF(g, 9, 0, 2, 1, "#c9cdd4");
          else if (pose === "hoe1") rectF(g, 7, 0, 3, 1, "#8a8a92");
          else rectF(g, 7, 0, 3, 2, "#b8a266");
        } else {    // 工具落在身前地面
          armSide(4, 9, 12); armSide(11, 9, 12);
          rectF(g, 8, 10, 1, 3, H);
          if (pose === "hammer2") rectF(g, 7, 13, 3, 1, "#9aa0a8");
          else if (pose === "axe2") rectF(g, 9, 13, 2, 1, "#c9cdd4");
          else if (pose === "hoe2") rectF(g, 7, 13, 3, 1, "#8a8a92");
          else rectF(g, 7, 12, 3, 2, "#b8a266");
        }
        break;
      }
      case "eat1": case "eat2":   // 进食：双手捧碗于胸前/放下
        if (f) dress(4, 8); else torso(false);
        armSide(4, 9, 12); armSide(11, 9, 12);
        if (pose === "eat1") { pxF(g, 6, 8, top); pxF(g, 9, 8, top); rectF(g, 7, 8, 2, 1, hand); }
        break;
      case "fish1": case "fish2":   // 持竿正/背视：双手并拢于身前中线（竿指镜头）
        if (f) dress(4, 8); else torso(false);
        pxF(g, 4, 9, top); pxF(g, 4, 10, hand); pxF(g, 11, 9, top); pxF(g, 11, 10, hand);
        pxF(g, 4, 8, top); pxF(g, 11, 8, top); pxF(g, 3, 10, hand); pxF(g, 12, 10, hand);
        break;
      case "drink1": case "drink2": {   // 饮用正/背视：杯举面前中央（背面只见手臂）
        if (f) dress(4, 8); else torso(false);
        armSide(4, 9, 12); armSide(11, 9, 12);
        if (pose === "drink1") { pxF(g, 6, 8, top); pxF(g, 9, 8, top); rectF(g, 7, 7, 2, 2, "#c9a86a"); }
        else { rectF(g, 7, 10, 2, 2, "#c9a86a"); }
        break;
      }
      case "brew1": case "brew2":   // 酿造正/背视：桶在身前中央（背面被身体遮挡只露棒头）
        if (f) dress(4, 8); else torso(false);
        armSide(4, 9, 12); armSide(11, 9, 12);
        if (pose === "brew1") rectF(g, 7, 9, 1, 4, H);
        else rectF(g, 8, 10, 1, 4, H);
        break;
      default: drawSide(); break;   // sleep/row/stumble 仅 side：回退
      }
    };
    if (vw === "side") drawSide(); else drawVert();
    return outlineSprite(cv, "#1a1a26");
  });
}

// ---- pants 层：双腿 rows13-15 各 2px（x5-6 / x9-10）；sleep 无腿层 ----
// f 传 skin：裙下露腿用肤色（pants 参数不用于 f）；缓存键对 f 追加 skin（缓存键=全部视觉输入）
// view："side"（侧面行走）|"vert"（正/背面共用：双腿并立正对镜头）
function agentPantsSprite(pants, poseKey, sex, skin, view) {
  const vw = view === "vert" ? "vert" : "side";
  return sprGet(`p${pants}_${poseKey}_${sex}_${vw}${sex === "f" ? "_" + skin : ""}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    const base = sex === "f" ? skin : pants;
    const leg = (x, y0, y1) => {
      if (y1 - y0 >= 2) rectF(g, x, y0, 2, y1 - y0 - 1, base);   // 裤腿 2px 宽
      rectF(g, x, y1 - 1, 3, 2, shadeHex(base, 0.75));           // 鞋 3×2（脚底锚定 row15）
      pxF(g, x + 2, y1, shadeHex(base, 0.6));                    // 鞋尖暗
    };
    if (vw === "side") {
      switch (poseKey) {
        case "stand": leg(5, 13, 15); leg(9, 13, 15); break;
        case "walk1": leg(4, 13, 15); leg(9, 13, 15); break;
        case "walk2": leg(5, 13, 15); leg(10, 13, 15); break;
        case "run1":  leg(3, 13, 15); leg(10, 13, 15); break;   // 大步幅前后错位
        case "run2":  leg(5, 13, 14); leg(9, 13, 15); break;
        case "fish":  leg(4, 13, 15); leg(10, 13, 15); break;   // 站立微开
        case "row":   leg(4, 12, 14); leg(10, 12, 14); break;   // 坐姿腿前收 rows12-14
      }
    } else {
      switch (poseKey) {
        case "stand": case "fish": leg(4, 13, 15); leg(10, 13, 15); break;
        case "walk1": leg(4, 12, 15); leg(10, 13, 15); break;   // 迈步：一腿微抬
        case "walk2": leg(4, 13, 15); leg(10, 12, 15); break;
        case "run1":  leg(3, 13, 15); leg(11, 13, 15); break;   // 跑：双腿外敞
        case "run2":  leg(4, 12, 15); leg(10, 12, 15); break;
        case "row":   leg(5, 13, 15); leg(9, 13, 15); break;    // 坐姿腿前收并拢
      }
    }
    return outlineSprite(cv, "#1a1a26");
  });
}

// ---- head 层：大头 6×6 圆角 rows2-7（x5-10）+ 发型/帽饰；native=头顶白羽 1×3 ----
// view："front"（双眼+嘴，现有画法）/"side"（侧脸单眼+耳）/ "back"（后脑纯发无五官）
function agentHeadSprite(skin, style, hairC, sex, native, view) {
  const vw = view === "front" || view === "back" || view === "side" ? view : "front";
  return sprGet(`h${skin}_${style}_${hairC}_${sex}_${vw}_${native ? 1 : 0}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    rectF(g, 6, 2, 4, 1, skin);       // 圆角头顶
    rectF(g, 5, 3, 6, 5, skin);       // 脸 rows3-7
    rectF(g, 7, 8, 2, 1, skin);       // 脖子
    if (vw === "front") {
      pxF(g, 4, 5, skin); pxF(g, 11, 5, skin);   // 耳
      pxF(g, 7, 5, "#1a1a26"); pxF(g, 9, 5, "#1a1a26");   // 双眼
      pxF(g, 8, 7, shadeHex(skin, 0.8));                  // 嘴
    } else if (vw === "side") {
      pxF(g, 4, 5, skin);                            // 耳（近侧）
      pxF(g, 11, 5, skin); pxF(g, 11, 4, skin);      // 鼻尖
      pxF(g, 9, 5, "#1a1a26");                       // 单眼
    } else {                                          // back：后脑无五官
      pxF(g, 4, 5, skin); pxF(g, 11, 5, skin);       // 双耳
    }
    switch (style) {
      case "long":   // 头顶发 + 两侧垂发到 rows8-9
        rectF(g, 6, 1, 4, 1, hairC);
        rectF(g, 5, 2, 6, 1, hairC);
        pxF(g, 4, 3, hairC); pxF(g, 5, 3, hairC); pxF(g, 10, 3, hairC); pxF(g, 11, 3, hairC);
        if (vw === "back") rectF(g, 5, 3, 6, 5, hairC);   // 背面：长发铺满后脑
        else { rectF(g, 4, 4, 1, 6, hairC); rectF(g, 11, 4, 1, 6, hairC); }
        break;
      case "bun":    // 发髻 2×2 + 头花
        rectF(g, 7, 0, 2, 2, hairC);
        rectF(g, 5, 2, 6, 1, hairC);
        if (vw === "back") rectF(g, 5, 3, 6, 3, hairC);
        else if (vw === "front") pxF(g, 9, 1, "#d9708a");
        break;
      case "short":  // 头顶 2px 发
        rectF(g, 5, 2, 6, 1, hairC);
        rectF(g, 6, 3, 4, 1, hairC);
        if (vw === "back") rectF(g, 5, 3, 6, 2, hairC);
        break;
      case "hat":    // 草帽：宽檐 8px + 帽顶
        rectF(g, 4, 2, 8, 1, "#d9b84a");
        rectF(g, 6, 0, 4, 2, "#c9a83e");
        break;
      case "kasa":   // 斗笠：三角
        rectF(g, 7, 0, 2, 1, "#a88a5a");
        rectF(g, 6, 1, 4, 1, "#a88a5a");
        rectF(g, 5, 2, 6, 1, "#a88a5a");
        break;
      // bald：无发（背面同 front，仅光头）
    }
    if (native) rectF(g, 8, 0, 1, 3, "#f5f0e0");   // 原住民羽饰
    return outlineSprite(cv, "#1a1a26");
  });
}

// 躺睡侧头：4×4 侧脸 + 后脑发色 2px（与 sleep 横躺身体对位 x0-3 rows9-12）
function agentHeadLieSprite(skin, hairC) {
  return sprGet(`hl${skin}_${hairC}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    rectF(g, 0, 9, 4, 4, skin);
    rectF(g, 0, 9, 2, 4, hairC);
    pxF(g, 2, 10, "#1a1a26");
    return outlineSprite(cv, "#1a1a26");
  });
}

// ---- 背包：8×8 点阵（haul 槽 item → 麻袋/柴捆/灰石/沙袋/水桶/果篮/酒坛/咖啡袋/豆袋）----
function agentPackSprite(res) {
  return sprGet(`k${res}`, () => {
    const { cv, g } = sprCtx(8, 8);
    if (res === "food") {
      rectF(g, 1, 2, 6, 5, "#d9c27a");
      rectF(g, 2, 1, 4, 1, "#b8a05a");       // 袋口扎绳
      rectF(g, 1, 6, 6, 1, "#bfa76a");
    } else if (res === "wood") {
      rectF(g, 1, 3, 6, 4, "#8a6236");
      rectF(g, 2, 3, 1, 4, "#5c4426"); rectF(g, 5, 3, 1, 4, "#5c4426");   // 捆绳
      pxF(g, 1, 4, "#a87c4a"); pxF(g, 6, 4, "#a87c4a");                    // 木段截面
    } else if (res === "stone") {
      rectF(g, 2, 3, 4, 1, "#9a9a92");
      rectF(g, 1, 4, 6, 3, "#9a9a92");
      pxF(g, 2, 4, "#c2c2ba");
      rectF(g, 2, 6, 4, 1, "#7e7e78");
    } else if (res === "water") {
      rectF(g, 1, 2, 6, 5, "#8a6236");       // 木水桶
      rectF(g, 1, 3, 6, 1, "#6e5232"); rectF(g, 1, 5, 6, 1, "#6e5232");   // 桶箍
      rectF(g, 2, 0, 4, 1, "#5c4426");       // 提手
      rectF(g, 2, 2, 4, 1, "#7ab8cc");       // 桶内水面
    } else if (res === "juice") {
      rectF(g, 1, 3, 6, 4, "#b89040");       // 果篮
      rectF(g, 2, 4, 1, 3, "#8a6a30"); rectF(g, 5, 4, 1, 3, "#8a6a30");
      rectF(g, 2, 1, 2, 2, "#e06060"); rectF(g, 4, 0, 2, 2, "#e8a13b");   // 果实冒头
    } else if (res === "beer") {
      rectF(g, 2, 2, 4, 5, "#b98a4a");       // 酒坛
      rectF(g, 3, 1, 2, 1, "#8a6236");       // 坛口
      rectF(g, 2, 4, 4, 1, "#8a5a2a");       // 坛箍
      pxF(g, 3, 3, "#d9a86a");
    } else if (res === "coffee") {
      rectF(g, 1, 2, 6, 5, "#6a4a34");       // 咖啡袋
      rectF(g, 2, 1, 4, 1, "#4a3222");       // 袋口
      rectF(g, 2, 4, 4, 2, "#5a3e2c");       // 袋身标块
      pxF(g, 3, 5, "#c9a86a"); pxF(g, 5, 5, "#c9a86a");
    } else if (res === "beans") {
      rectF(g, 1, 2, 6, 5, "#c9b08a");       // 豆袋
      rectF(g, 2, 1, 4, 1, "#a8906a");
      pxF(g, 2, 3, "#8a5a3a"); pxF(g, 4, 4, "#8a5a3a"); pxF(g, 6, 3, "#8a5a3a");   // 豆粒
    } else {
      rectF(g, 1, 2, 6, 5, "#d8c890");
      rectF(g, 2, 1, 4, 1, "#b8a860");
      pxF(g, 3, 4, "#b8a860"); pxF(g, 4, 5, "#b8a860");   // 沙袋褶皱
    }
    return outlineSprite(cv, "#1a1a26");
  });
}

// ============================================================
// 动物：程序化点阵（透明底 + 深色轮廓），脸朝右
// ============================================================
function bakeCow() {
  const { cv, g } = sprCtx(24, 16);
  fillEllipseF(g, 10, 7, 8, 4, "#8a5a3a");
  fillEllipseF(g, 6, 6, 3, 2, "#e8e0d0");            // 白斑
  fillEllipseF(g, 13, 8, 2.5, 1.8, "#e8e0d0");
  rectF(g, 17, 4, 5, 6, "#8a5a3a");                  // 头
  rectF(g, 18, 9, 4, 2, "#c9a08a");                  // 吻部
  pxF(g, 20, 6, "#1a1a1a");                          // 眼
  rectF(g, 16, 3, 1, 2, "#e8e0d0"); rectF(g, 22, 3, 1, 2, "#e8e0d0");  // 角
  for (const lx of [4, 8, 12, 16]) {                 // 腿 + 蹄
    rectF(g, lx, 11, 2, 4, "#7a4a30");
    pxF(g, lx, 15, "#3d2a1a"); pxF(g, lx + 1, 15, "#3d2a1a");
  }
  rectF(g, 1, 6, 1, 4, "#7a4a30");                   // 尾
  return outlineSprite(cv, "#241812");
}
function bakeGoat() {
  const { cv, g } = sprCtx(22, 14);
  fillEllipseF(g, 9, 6, 7, 3.6, "#e8e4da");
  rectF(g, 15, 3, 5, 5, "#6b6b6b");                  // 头
  rectF(g, 19, 6, 2, 2, "#b8b4ac");                  // 吻
  pxF(g, 18, 5, "#111111");
  rectF(g, 16, 1, 1, 2, "#d9c9a8"); rectF(g, 19, 1, 1, 2, "#d9c9a8");  // 角
  pxF(g, 18, 9, "#6b6b6b");                          // 胡须
  for (const lx of [4, 8, 12]) {
    rectF(g, lx, 9, 2, 4, "#d9d4c8");
    pxF(g, lx, 13, "#3a3a3a"); pxF(g, lx + 1, 13, "#3a3a3a");
  }
  pxF(g, 1, 4, "#e8e4da");                           // 尾
  return outlineSprite(cv, "#4a4640");
}
function bakeDeer() {
  const { cv, g } = sprCtx(22, 16);
  fillEllipseF(g, 9, 8, 7, 3.4, "#a5713d");
  rectF(g, 14, 4, 3, 5, "#a5713d");                  // 颈
  rectF(g, 14, 2, 5, 4, "#a5713d");                  // 头
  pxF(g, 17, 3, "#111111");
  rectF(g, 14, 0, 1, 2, "#5c3a1a"); pxF(g, 13, 0, "#5c3a1a");   // 鹿角
  rectF(g, 17, 0, 1, 2, "#5c3a1a"); pxF(g, 18, 1, "#5c3a1a");
  pxF(g, 19, 5, "#7a4f28");                          // 吻
  for (const lx of [4, 7, 11, 14]) {                 // 细腿
    rectF(g, lx, 11, 1, 4, "#8a5a2e");
    pxF(g, lx, 15, "#3d2812");
  }
  pxF(g, 2, 6, "#f0e8d8");                           // 白尾
  return outlineSprite(cv, "#3d2812");
}
function bakeBoar() {
  const { cv, g } = sprCtx(22, 14);
  fillEllipseF(g, 9, 7, 8, 4.4, "#5c4632");
  fillEllipseF(g, 16, 7, 4, 3.4, "#5c4632");         // 头
  fillEllipseF(g, 20, 8, 1.6, 1.4, "#7a5a44");       // 獾吻
  pxF(g, 19, 10, "#f0ead8");                         // 獠牙
  pxF(g, 17, 5, "#111111");
  rectF(g, 6, 2, 8, 1, "#4a3626");                   // 背鬃
  for (const lx of [4, 8, 13, 16]) rectF(g, lx, 11, 2, 2, "#4a3626");
  return outlineSprite(cv, "#241a10");
}
function bakeWolf() {
  const { cv, g } = sprCtx(24, 14);
  fillEllipseF(g, 10, 7, 9, 3.6, "#787882");
  fillEllipseF(g, 18, 5, 3, 2.6, "#787882");         // 头
  rectF(g, 16, 1, 1, 2, "#5a5a64"); rectF(g, 20, 1, 1, 2, "#5a5a64");  // 竖耳
  rectF(g, 21, 5, 3, 2, "#5a5a64");                  // 尖吻
  pxF(g, 19, 4, "#ffd966");                          // 琥珀眼
  fillEllipseF(g, 1, 5, 2.6, 2, "#787882");          // 蓬尾
  rectF(g, 6, 3, 8, 1, "#6a6a74");                   // 背脊
  for (const lx of [5, 9, 13, 17]) rectF(g, lx, 10, 2, 3, "#6a6a74");
  return outlineSprite(cv, "#2c2c34");
}
function bakeDog() {
  const { cv, g } = sprCtx(18, 13);
  fillEllipseF(g, 8, 7, 6, 3, "#8a8a92");
  rectF(g, 12, 3, 4, 4, "#8a8a92");                  // 头
  rectF(g, 12, 2, 1, 2, "#5a5a62");                  // 垂耳
  pxF(g, 14, 4, "#111111");
  pxF(g, 15, 6, "#c9c9d0");                          // 吻
  rectF(g, 2, 4, 1, 3, "#8a8a92");                   // 竖尾
  rectF(g, 11, 6, 1, 2, "#c23b3b");                  // 项圈
  for (const lx of [4, 7, 10]) rectF(g, lx, 10, 2, 2, "#7a7a84");
  return outlineSprite(cv, "#33333c");
}
function bakeTurtle() {
  const { cv, g } = sprCtx(14, 11);
  fillEllipseF(g, 6, 6, 5, 3.6, "#4a7a55");
  pxF(g, 4, 5, "#33604a"); pxF(g, 7, 4, "#33604a");  // 壳纹
  pxF(g, 9, 6, "#33604a"); pxF(g, 5, 8, "#33604a");
  rectF(g, 1, 9, 10, 1, "#3a6a48");                  // 壳缘
  rectF(g, 11, 5, 2, 3, "#6a9a75");                  // 头
  pxF(g, 12, 5, "#111111");
  rectF(g, 2, 10, 2, 1, "#4a7a55"); rectF(g, 9, 10, 2, 1, "#4a7a55");  // 鳍
  return outlineSprite(cv, "#1e3a28");
}
function bakeWhale() {
  const { cv, g } = sprCtx(36, 18);
  fillEllipseF(g, 20, 9, 13, 6, "#2c4a66");          // 躯干（中心偏右，头朝右——与全游戏侧视约定一致）
  fillEllipseF(g, 21, 12, 10, 3, "#3d6284");         // 白腹
  rectF(g, 6, 8, 4, 3, "#2c4a66");                   // 尾柄（左）
  fillEllipseF(g, 3, 6, 3.4, 2.4, "#2c4a66");        // 尾鳍上叶（左）
  fillEllipseF(g, 3, 12, 3.4, 2.4, "#2c4a66");       // 尾鳍下叶（左）
  fillEllipseF(g, 24, 13, 2.6, 1.4, "#24405a");      // 胸鳍（近头侧）
  pxF(g, 29, 7, "#cfe4f2");                          // 眼（头端）
  rectF(g, 28, 11, 5, 1, "#24405a");                 // 嘴线（头端）
  return outlineSprite(cv, "#122234");
}
function bakeFish() {
  const { cv, g } = sprCtx(6, 4);
  rectF(g, 2, 1, 4, 2, "#78b4dc");                   // 身（头朝右）
  rectF(g, 0, 1, 2, 2, "#5a94bc");                   // 尾（左）
  pxF(g, 4, 1, "#0a2438");                           // 眼
  return cv;
}
function bakeBird(frame, view) {
  if (view === "front" || view === "back") {   // 正/背视：双翅对称上/下扑
    const rows = frame
      ? ["..........", "...b..b...", "....bb....", ".w......w.", "..w....w.."]
      : ["..........", "..w....w..", ".w......w.", "....bb....", "...b..b..."];
    return bakeArt(10, 5, rows, { w: "#3a3a44", b: "#4a4a56" }, 1);
  }
  const rows = frame
    ? ["..........", "....bb....", "...wbbw...", "..w....w..", ".w......w."]
    : ["..........", ".w......w.", "..w....w..", "...wbbw...", "....bb...."];
  return bakeArt(10, 5, rows, { w: "#3a3a44", b: "#4a4a56" }, 1);
}

// ---- 新物种侧视图（v0.5.0，头朝右与全游戏约定一致）----
function bakeRabbit() {
  const { cv, g } = sprCtx(10, 11);
  fillEllipseF(g, 4, 7, 3.4, 2.4, "#c9b8a8");            // 圆身
  fillEllipseF(g, 7, 5, 2.2, 2, "#c9b8a8");              // 头（右）
  rectF(g, 6, 1, 1, 3, "#c9b8a8"); rectF(g, 8, 1, 1, 3, "#c9b8a8");   // 长耳
  pxF(g, 8, 5, "#1a1a1a");
  fillEllipseF(g, 1.2, 6.5, 1.6, 1.4, "#f0ece4");        // 短尾（左）
  rectF(g, 3, 9, 1, 2, "#8a7a68"); rectF(g, 6, 9, 1, 2, "#8a7a68");
  return outlineSprite(cv, "#5a4a3a");
}
function bakeFox() {
  const { cv, g } = sprCtx(20, 12);
  fillEllipseF(g, 9, 7, 6.4, 3, "#d9762e");              // 躯干
  fillEllipseF(g, 15, 5, 3, 2.4, "#d9762e");             // 头
  fillEllipseF(g, 18, 6, 1.8, 1.2, "#f0e8dc");           // 尖吻
  pxF(g, 16, 4, "#1a1a1a");
  rectF(g, 13, 1, 1, 2, "#8a4a1a"); rectF(g, 16, 1, 1, 2, "#8a4a1a"); // 竖耳
  fillEllipseF(g, 2.5, 5, 3, 1.6, "#d9762e");            // 蓬尾（左）
  pxF(g, 0.5, 5, "#f0e8dc");                             // 尾尖白
  for (const lx of [5, 8, 12, 14]) rectF(g, lx, 9, 1, 2, "#8a4a1a");
  return outlineSprite(cv, "#5a2a10");
}
function bakeBear() {
  const { cv, g } = sprCtx(26, 17);
  fillEllipseF(g, 11, 9, 9, 5, "#6b4a33");               // 壮躯
  fillEllipseF(g, 19, 7, 4, 3.6, "#6b4a33");             // 头
  fillEllipseF(g, 22, 9, 1.8, 1.4, "#4a3222");           // 吻
  pxF(g, 20, 6, "#111111");
  rectF(g, 16, 3, 1, 2, "#4a3222"); rectF(g, 20, 3, 1, 2, "#4a3222"); // 圆耳
  for (const lx of [4, 8, 13, 17]) {
    rectF(g, lx, 13, 2, 3, "#5a3e2a");
    pxF(g, lx, 16, "#2a1a10"); pxF(g, lx + 1, 16, "#2a1a10");
  }
  return outlineSprite(cv, "#2a1a10");
}
function bakeHorse() {
  const { cv, g } = sprCtx(24, 17);
  fillEllipseF(g, 10, 8, 8, 3.8, "#8a6238");             // 躯干
  rectF(g, 16, 4, 2, 4, "#8a6238");                      // 颈
  rectF(g, 17, 2, 5, 4, "#8a6238");                      // 头
  rectF(g, 21, 3, 2, 1.4, "#6a4a28");                    // 吻
  pxF(g, 19, 3, "#111111");
  rectF(g, 16, 0, 1, 3, "#4a3220");                      // 鬃
  fillEllipseF(g, 2, 7, 2.2, 2.6, "#4a3220");            // 尾
  for (const lx of [4, 8, 13, 17]) { rectF(g, lx, 11, 1.6, 5, "#7a5430"); pxF(g, lx, 16, "#2a1a10"); }
  return outlineSprite(cv, "#2a1a10");
}
function bakeUnicorn() {
  const { cv, g } = sprCtx(24, 17);
  fillEllipseF(g, 10, 8, 8, 3.8, "#f0ecf4");             // 雪白躯干
  rectF(g, 16, 4, 2, 4, "#f0ecf4");                      // 颈
  rectF(g, 17, 2, 5, 4, "#f0ecf4");                      // 头
  rectF(g, 22, 3, 2, 1.4, "#d8cfe4");                    // 吻
  pxF(g, 19, 3, "#4a7ac2");                              // 蓝眼
  rectF(g, 22, 0, 1, 2, "#e8c85a");                      // 金角
  fillEllipseF(g, 2, 6, 2, 3, "#d8c8e8");                // 淡紫尾
  for (const lx of [4, 8, 13, 17]) rectF(g, lx, 11, 1.6, 5, "#d8d0e4");
  return outlineSprite(cv, "#8a80a0");
}

// v0.6.10：骑手 sprite（马 + 背上骑手，侧视 16×24 底行锚定；left 由渲染层镜像、up/down 复用 side——与船内划手同口径）
function bakeRiderSide(frame) {
  const { cv, g } = sprCtx(16, 24);
  const bob = frame === 1 ? 1 : 0;                       // 骑手随步伐 1px 起伏
  fillEllipseF(g, 1.5, 15.5, 1.8, 2.4, "#4a3220");       // 尾
  // 四腿对角相位交换（gallop 两帧）：[x, 蹄底y]，近侧踏底行、远侧抬起 1px
  const legs = frame === 0
    ? [[12, 23], [14, 22], [4, 23], [2, 22]]             // 伸展：前腿前伸、后腿后蹬
    : [[10, 23], [12, 22], [5, 23], [3, 22]];            // 收拢：换相
  for (const [lx, hy] of legs) {
    rectF(g, lx, 18, 1.4, hy - 18, shadeHex("#8a6238", 0.85));
    pxF(g, lx, hy, "#2a1a10");                           // 蹄
  }
  fillEllipseF(g, 7, 16.5, 5.5, 3.1, "#8a6238");         // 躯干（配色对齐 QUAD_VIEW.horse）
  rectF(g, 10, 12, 2, 5, "#8a6238");                     // 颈
  rectF(g, 11, 9, 4, 3, "#8a6238");                      // 头
  rectF(g, 14, 10, 2, 1, "#6a4a28");                     // 吻
  pxF(g, 12, 9, "#111111");                              // 眼
  rectF(g, 10, 8, 1, 4, "#4a3220");                      // 鬃毛
  // —— 骑手（坐姿前倾，随 bob 整体 1px 起伏）——
  rectF(g, 6, 11.5 + bob, 4, 1.6, "#4a3520");            // 臀/大腿贴背前伸（裤）
  rectF(g, 9, 13 + bob, 1.5, 3.5, "#4a3520");            // 小腿下垂
  pxF(g, 9, 16 + bob, "#241a10");                        // 靴
  rectF(g, 6.5, 6.5 + bob, 2.5, 5.5, "#b0554a");         // 躯干前倾（衣）
  pxF(g, 9, 7 + bob, "#b0554a");                         // 前倾肩
  pxF(g, 10, 8 + bob, "#d9a878");                        // 手（伸向马首）
  pxF(g, 11, 8 + bob, "#4a3220");                        // 缰绳 1px 连到马首
  rectF(g, 8, 4 + bob, 2, 2, "#d9a878");                 // 头（肤）
  rectF(g, 8, 3 + bob, 2, 1, "#3a2416");                 // 发顶（深色）
  pxF(g, 8, 5 + bob, "#3a2416");                         // 发后
  pxF(g, 9, 4 + bob, "#111111");                         // 眼
  return outlineSprite(cv, "#2a1a10");
}
// 契约 API（S5 → 渲染层消费）：frame∈{0,1} 马步腿两帧；缓存键 rider{frame}
function riderSprite(frame) {
  const f = frame === 1 ? 1 : 0;
  return sprGet(`rider${f}`, () => bakeRiderSide(f));
}
function bakePenguin() {
  const { cv, g } = sprCtx(11, 13);
  fillEllipseF(g, 5, 7.5, 3.6, 4.8, "#2c3440");          // 直立身体
  fillEllipseF(g, 5.5, 8.5, 2.2, 3.2, "#f0f4f8");        // 白腹
  fillEllipseF(g, 5.5, 2.8, 2.3, 2, "#2c3440");          // 头
  pxF(g, 6.5, 2.2, "#111111");                           // 眼
  rectF(g, 7.5, 2.8, 2, 1, "#f0b030");                   // 喙（朝右）
  rectF(g, 2.2, 6, 1, 3, "#222a34"); rectF(g, 7.2, 6, 1, 3, "#222a34"); // 鳍翅
  rectF(g, 3.5, 12, 1.4, 1, "#f0b030"); rectF(g, 6, 12, 1.4, 1, "#f0b030"); // 橙脚
  return outlineSprite(cv, "#141a22");
}
function bakeCrab() {
  const { cv, g } = sprCtx(13, 9);
  fillEllipseF(g, 6.5, 4.5, 4, 2.6, "#d95a3a");          // 甲壳
  pxF(g, 8.5, 2.8, "#111111"); pxF(g, 10, 3.4, "#111111"); // 眼（头右）
  fillEllipseF(g, 1.5, 2, 1.6, 1.2, "#b8422a"); fillEllipseF(g, 1.5, 7, 1.6, 1.2, "#b8422a"); // 左螯
  fillEllipseF(g, 11.5, 2, 1.6, 1.2, "#b8422a"); fillEllipseF(g, 11.5, 7, 1.6, 1.2, "#b8422a"); // 右螯
  for (const lx of [4, 6.5, 9]) { pxF(g, lx, 8, "#b8422a"); pxF(g, lx, 1, "#b8422a"); }   // 步足
  return outlineSprite(cv, "#7a2a18");
}
function bakeDolphin() {
  const { cv, g } = sprCtx(24, 12);
  fillEllipseF(g, 12, 6, 9, 3.4, "#7a9ab8");             // 纺锤身（头右）
  fillEllipseF(g, 19, 5.5, 3.6, 2.6, "#8aa8c4");         // 头
  rectF(g, 22, 5, 2, 1.4, "#8aa8c4");                    // 喙
  pxF(g, 20, 4.5, "#101820");                            // 眼
  fillEllipseF(g, 10, 2.6, 3, 1.6, "#6a8aa8");           // 背鳍
  fillEllipseF(g, 12, 9.4, 2.6, 1.4, "#6a8aa8");         // 腹鳍
  rectF(g, 2, 4.5, 3, 3, "#7a9ab8");                     // 尾柄
  fillEllipseF(g, 1.5, 4, 1.6, 2, "#6a8aa8");            // 尾叶上
  fillEllipseF(g, 1.5, 8.5, 1.6, 2, "#6a8aa8");          // 尾叶下
  return outlineSprite(cv, "#3a5a78");
}
function bakeShark() {
  const { cv, g } = sprCtx(30, 14);
  fillEllipseF(g, 15, 7, 12, 4, "#5a6a78");
  fillEllipseF(g, 24, 7, 4.4, 3.2, "#5a6a78");           // 头
  rectF(g, 27, 6, 3, 1.6, "#8a9aac");                    // 吻
  pxF(g, 25, 5.5, "#101820");                            // 眼
  rectF(g, 22, 10, 5, 1, "#c9d2dc");                     // 白腹线
  fillEllipseF(g, 14, 2.2, 3.4, 2, "#4a5a68");           // 高背鳍
  fillEllipseF(g, 13, 11.5, 2.6, 1.4, "#4a5a68");        // 腹鳍
  rectF(g, 3, 5, 4, 4, "#5a6a78");                       // 尾柄
  fillEllipseF(g, 2, 3.5, 2, 2.4, "#4a5a68");            // 尾上叶
  fillEllipseF(g, 2, 10.5, 2, 2.4, "#4a5a68");           // 尾下叶
  return outlineSprite(cv, "#2a3644");
}
function bakeMermaid() {   // 人鱼：青绿鳞尾 + 橙发，侧游姿态（头右）
  const { cv, g } = sprCtx(18, 14);
  fillEllipseF(g, 11, 4, 2.6, 2.6, "#f0d0b0");           // 头
  pxF(g, 12.5, 3.6, "#111111");                          // 眼
  fillEllipseF(g, 8.5, 3.6, 2.6, 1.8, "#e88a4a");        // 橙红长发
  rectF(g, 8, 6, 6, 3, "#3aa88a");                       // 身躯
  fillEllipseF(g, 4, 8.5, 4, 2, "#3aa88a");              // 尾根
  fillEllipseF(g, 1, 8.5, 1.8, 3, "#2a8870");            // 尾鳍
  pxF(g, 10, 7, "#8ad8c0"); pxF(g, 11, 8, "#8ad8c0");    // 鳞光
  return outlineSprite(cv, "#1a5a48");
}
function bakeKoi() {       // 锦鲤：白底红斑金尾，头朝右
  const { cv, g } = sprCtx(12, 6);
  fillEllipseF(g, 7, 3, 4.2, 2.2, "#f0ece4");
  fillEllipseF(g, 6, 2.4, 1.6, 1, "#d94a3a");            // 红斑
  fillEllipseF(g, 9, 3.8, 1.2, 0.8, "#d94a3a");
  rectF(g, 0.5, 2, 3, 2, "#e8a03a");                     // 金尾
  pxF(g, 10, 2, "#101820");
  rectF(g, 8, 4.8, 1.4, 1, "#e8a03a");                   // 腹鳍
  return outlineSprite(cv, "#8a5a2a");
}
function bakeMoonfish() {  // 月光鱼：幽蓝发光，头朝右
  const { cv, g } = sprCtx(12, 6);
  fillEllipseF(g, 7, 3, 4.2, 2.2, "#8ab8e8");
  fillEllipseF(g, 7, 3, 2.4, 1.2, "#d8ecfc");            // 月晕腹
  rectF(g, 0.5, 2, 3, 2, "#5a88c4");                     // 尾
  pxF(g, 10, 2, "#101830");
  pxF(g, 4, 0.8, "#f0f8ff"); pxF(g, 9, 4.6, "#f0f8ff");  // 星光点
  return outlineSprite(cv, "#3a5a8a");
}

// ---- 飞行生物泛化（v0.5.0）：鸟/凤凰/小仙龙共用扑翼两帧点阵，配色区分 ----
const FLYER_PAL = {
  bird:    { w: "#3a3a44", b: "#4a4a56" },
  phoenix: { w: "#e8a03a", b: "#d94a3a", g: "#f0d060" },   // 金红凤羽 + 亮焰
  fairy:   { w: "#8ad8c0", b: "#c08ae8", g: "#e8fff4" },   // 仙龙青紫 + 荧光
};
function bakeFlier(type, frame, vw) {
  if (type === "bird") return bakeBird(frame, vw);
  const pal = FLYER_PAL[type] || FLYER_PAL.bird;
  if (vw === "front" || vw === "back") {
    const rows = frame
      ? ["..........", "...b..b...", "....bb....", ".w......w.", "..w..g.w.."]
      : ["..........", "..w....w..", ".w......w.", "....bb....", "...b.gb..."];
    return bakeArt(10, 5, rows, pal, 1);
  }
  const rows = frame
    ? ["..........", "....bb....", "...gbbw...", "..w....w..", ".w......w."]
    : ["..........", ".w......w.", "..w....w..", "...wbbg...", "....bb...."];
  return bakeArt(10, 5, rows, pal, 1);
}

const BAKE_CREATURES = {
  cow: bakeCow, goat: bakeGoat, deer: bakeDeer, boar: bakeBoar, wolf: bakeWolf,
  dog: bakeDog, turtle: bakeTurtle, whale: bakeWhale, fish: bakeFish,
  rabbit: bakeRabbit, fox: bakeFox, bear: bakeBear, horse: bakeHorse,
  penguin: bakePenguin, crab: bakeCrab, dolphin: bakeDolphin, shark: bakeShark,
  unicorn: bakeUnicorn, mermaid: bakeMermaid, koi: bakeKoi, moonfish: bakeMoonfish,
};
function creatureSprite(type, frame, view) {
  const vw = view === "front" || view === "back" ? view : "side";
  return sprGet(`c${type}_${frame || 0}_${vw}`, () => {
    const meta = CREATURE_META[type];
    if (meta && meta.flier) return bakeFlier(type, frame || 0, vw);   // 飞行生物泛化（两帧扑翼）
    if (vw !== "side") return bakeCreatureVert(type, vw);
    return BAKE_CREATURES[type] ? BAKE_CREATURES[type]() : bakeCow();
  });
}

// ---- 动物正/背视图：四足兽通用点阵 + 水生/飞行特例（view 已归一为 front|back）----
const QUAD_VIEW = {   // 四足兽配色与体型（正/背视通用）
  cow:  { body: "#8a5a3a", patch: "#e8e0d0", dk: "#241812", w: 14, hh: 4, head: 7 },
  goat: { body: "#e8e4da", patch: null,      dk: "#4a4640", w: 12, hh: 4, head: 6 },
  deer: { body: "#a5713d", patch: null,      dk: "#3d2812", w: 12, hh: 4, head: 6 },
  boar: { body: "#5c4632", patch: null,      dk: "#241a10", w: 13, hh: 5, head: 7 },
  wolf: { body: "#787882", patch: null,      dk: "#2c2c34", w: 13, hh: 4, head: 6 },
  dog:  { body: "#8a8a92", patch: null,      dk: "#33333c", w: 11, hh: 3, head: 5 },
  // v0.5.0 新四足兽：兔/狐/熊/马/独角兽（正/背视图由通用四足画法自动获得）
  rabbit:  { body: "#c9b8a8", patch: null,      dk: "#5a4a3a", w: 9,  hh: 3, head: 5 },
  fox:     { body: "#d9762e", patch: null,      dk: "#5a2a10", w: 10, hh: 3, head: 5 },
  bear:    { body: "#6b4a33", patch: null,      dk: "#2a1a10", w: 14, hh: 5, head: 7 },
  horse:   { body: "#8a6238", patch: null,      dk: "#2a1a10", w: 13, hh: 4, head: 6 },
  unicorn: { body: "#f0ecf4", patch: null,      dk: "#8a80a0", w: 13, hh: 4, head: 6 },
};
function bakeCreatureVert(type, view) {
  const front = view === "front";
  if (QUAD_VIEW[type]) {
    const q = QUAD_VIEW[type];
    const { cv, g } = sprCtx(24, 16);
    const cx = 12;
    if (front) {   // 正面：圆头居中（双眼+耳）+ 躯干在后 + 四腿外敞
      fillEllipseF(g, cx, 9, q.w / 2, q.hh, q.body);
      if (q.patch) fillEllipseF(g, cx, 9, 3, 2, q.patch);
      fillEllipseF(g, cx, 4, q.head / 2, 3.2, q.body);            // 头
      pxF(g, cx - 2, 3, "#1a1a1a"); pxF(g, cx + 1, 3, "#1a1a1a"); // 双眼
      pxF(g, cx - q.head / 2 - 1, 2, q.body); pxF(g, cx + q.head / 2, 2, q.body);  // 耳
      rectF(g, cx - 1, 7, 2, 1, shadeHex(q.body, 0.8));           // 吻
      for (const lx of [cx - 5, cx - 2, cx + 1, cx + 4]) {        // 四腿
        rectF(g, lx, 12, 2, 3, shadeHex(q.body, 0.85));
        pxF(g, lx, 15, q.dk); pxF(g, lx + 1, 15, q.dk);
      }
    } else {       // 背面：臀背 + 尾 + 四腿，不见头
      fillEllipseF(g, cx, 8, q.w / 2, q.hh + 1, q.body);
      fillEllipseF(g, cx, 3, 2, 2, q.body);                       // 尾根
      for (const lx of [cx - 5, cx - 2, cx + 1, cx + 4]) {
        rectF(g, lx, 11, 2, 4, shadeHex(q.body, 0.85));
        pxF(g, lx, 15, q.dk); pxF(g, lx + 1, 15, q.dk);
      }
      pxF(g, cx - 6, 4, q.body); pxF(g, cx + 5, 4, q.body);       // 背面露耳尖
    }
    return outlineSprite(cv, q.dk);
  }
  if (type === "turtle") {
    const { cv, g } = sprCtx(14, 11);
    if (front) {
      fillEllipseF(g, 6, 6, 5, 3.6, "#4a7a55");
      pxF(g, 4, 5, "#33604a"); pxF(g, 8, 5, "#33604a");
      rectF(g, 5, 8, 4, 1, "#3a6a48");
      rectF(g, 5, 1, 4, 3, "#6a9a75");                            // 头前伸
      pxF(g, 5, 2, "#111111"); pxF(g, 8, 2, "#111111");
    } else {
      fillEllipseF(g, 6, 5, 5, 4, "#4a7a55");
      rectF(g, 4, 1, 6, 2, "#33604a");
      rectF(g, 5, 9, 3, 2, "#6a9a75");                            // 尾
    }
    return outlineSprite(cv, "#1e3a28");
  }
  if (type === "whale") {
    const { cv, g } = sprCtx(36, 18);
    if (front) {   // 头视图：圆头 + 双眼 + 胸鳍两侧
      fillEllipseF(g, 18, 9, 12, 7, "#2c4a66");
      fillEllipseF(g, 18, 13, 9, 3, "#3d6284");
      pxF(g, 13, 7, "#cfe4f2"); pxF(g, 23, 7, "#cfe4f2");
      fillEllipseF(g, 5, 12, 3, 1.6, "#24405a"); fillEllipseF(g, 31, 12, 3, 1.6, "#24405a");
    } else {       // 尾视图：双叶尾鳍
      fillEllipseF(g, 18, 9, 5, 4, "#2c4a66");
      fillEllipseF(g, 10, 6, 6, 4, "#2c4a66"); fillEllipseF(g, 26, 6, 6, 4, "#2c4a66");
      fillEllipseF(g, 10, 12, 6, 4, "#2c4a66"); fillEllipseF(g, 26, 12, 6, 4, "#2c4a66");
    }
    return outlineSprite(cv, "#122234");
  }
  if (type === "penguin") {   // v0.5.0：企鹅正/背视（直立小胖身）
    const { cv, g } = sprCtx(12, 13);
    if (front) {
      fillEllipseF(g, 6, 7.5, 4, 5, "#2c3440");
      fillEllipseF(g, 6, 8.5, 2.4, 3.4, "#f0f4f8");       // 白腹
      fillEllipseF(g, 6, 2.8, 2.4, 2, "#2c3440");
      pxF(g, 4.5, 2.4, "#111111"); pxF(g, 7.5, 2.4, "#111111");   // 双眼
      rectF(g, 5, 3.8, 2, 1, "#f0b030");                   // 喙中缝
      rectF(g, 1.5, 6, 1.2, 3.4, "#222a34"); rectF(g, 9.3, 6, 1.2, 3.4, "#222a34"); // 双鳍
      rectF(g, 3.5, 12, 1.6, 1, "#f0b030"); rectF(g, 7, 12, 1.6, 1, "#f0b030");
    } else {
      fillEllipseF(g, 6, 7.5, 4, 5, "#2c3440");
      fillEllipseF(g, 6, 2.8, 2.4, 2, "#2c3440");
      rectF(g, 4, 0.5, 1.2, 2, "#2c3440"); rectF(g, 7, 0.5, 1.2, 2, "#2c3440");   // 背视露耳/头顶
      rectF(g, 1.5, 6, 1.2, 3.4, "#222a34"); rectF(g, 9.3, 6, 1.2, 3.4, "#222a34");
      rectF(g, 3.5, 12, 1.6, 1, "#f0b030"); rectF(g, 7, 12, 1.6, 1, "#f0b030");
    }
    return outlineSprite(cv, "#141a22");
  }
  if (type === "crab") {      // v0.5.0：蟹正/背视（对称圆身 + 双螯）
    const { cv, g } = sprCtx(14, 10);
    fillEllipseF(g, 7, 5, 4.4, 2.8, "#d95a3a");
    fillEllipseF(g, 2, 3, 1.8, 1.4, "#b8422a"); fillEllipseF(g, 2, 7.5, 1.8, 1.4, "#b8422a");
    fillEllipseF(g, 12, 3, 1.8, 1.4, "#b8422a"); fillEllipseF(g, 12, 7.5, 1.8, 1.4, "#b8422a");
    for (const lx of [4.5, 7, 9.5]) { pxF(g, lx, 9, "#b8422a"); pxF(g, lx, 1, "#b8422a"); }
    if (front) { pxF(g, 5.5, 3.4, "#111111"); pxF(g, 8.5, 3.4, "#111111"); }   // 正视双眼前缘
    return outlineSprite(cv, "#7a2a18");
  }
  if (type === "dolphin") {   // v0.5.0：海豚正/背视（小号鲸式）
    const { cv, g } = sprCtx(20, 12);
    if (front) {
      fillEllipseF(g, 10, 6, 7, 4.4, "#7a9ab8");
      fillEllipseF(g, 10, 9, 5, 2, "#8aa8c4");
      pxF(g, 7, 4.5, "#101820"); pxF(g, 13, 4.5, "#101820");
      fillEllipseF(g, 2.5, 9, 2, 1.2, "#6a8aa8"); fillEllipseF(g, 17.5, 9, 2, 1.2, "#6a8aa8");
    } else {
      fillEllipseF(g, 10, 6, 4, 3, "#7a9ab8");
      fillEllipseF(g, 4.5, 5, 4.5, 3, "#6a8aa8"); fillEllipseF(g, 15.5, 5, 4.5, 3, "#6a8aa8");
      fillEllipseF(g, 4.5, 9, 4.5, 2.4, "#6a8aa8"); fillEllipseF(g, 15.5, 9, 4.5, 2.4, "#6a8aa8");
      fillEllipseF(g, 10, 2.6, 1.4, 1.2, "#6a8aa8");   // 背鳍
    }
    return outlineSprite(cv, "#3a5a78");
  }
  if (type === "shark") {     // v0.5.0：鲨正/背视（大号鲸式 + 背鳍）
    const { cv, g } = sprCtx(28, 16);
    if (front) {
      fillEllipseF(g, 14, 8, 10, 6, "#5a6a78");
      fillEllipseF(g, 14, 11.5, 7, 2.4, "#c9d2dc");
      pxF(g, 10, 5.5, "#101820"); pxF(g, 18, 5.5, "#101820");
      fillEllipseF(g, 3, 12, 2.6, 1.6, "#4a5a68"); fillEllipseF(g, 25, 12, 2.6, 1.6, "#4a5a68");
    } else {
      fillEllipseF(g, 14, 8, 5, 4, "#5a6a78");
      fillEllipseF(g, 5.5, 6, 6, 3.6, "#4a5a68"); fillEllipseF(g, 22.5, 6, 6, 3.6, "#4a5a68");
      fillEllipseF(g, 5.5, 11, 6, 3, "#4a5a68"); fillEllipseF(g, 22.5, 11, 6, 3, "#4a5a68");
      fillEllipseF(g, 14, 2.4, 2, 1.8, "#4a5a68");   // 背鳍
    }
    return outlineSprite(cv, "#2a3644");
  }
  if (type === "mermaid") {   // v0.5.0：人鱼正/背视（头肩 + 鳞尾分叉）
    const { cv, g } = sprCtx(14, 14);
    if (front) {
      fillEllipseF(g, 7, 3.5, 2.6, 2.6, "#f0d0b0");
      pxF(g, 5.5, 3, "#111111"); pxF(g, 8.5, 3, "#111111");
      fillEllipseF(g, 7, 1.6, 2.6, 1.4, "#e88a4a");       // 发
      rectF(g, 4.5, 6, 5, 4, "#3aa88a");                   // 身
      fillEllipseF(g, 7, 11, 2.4, 2.4, "#3aa88a");         // 尾根
      fillEllipseF(g, 4.5, 12.5, 1.6, 1.6, "#2a8870"); fillEllipseF(g, 9.5, 12.5, 1.6, 1.6, "#2a8870");   // 尾鳍分叉
    } else {
      fillEllipseF(g, 7, 3.5, 2.8, 2.6, "#e88a4a");        // 背视满头橙发
      rectF(g, 4.5, 6, 5, 4, "#2f9078");
      fillEllipseF(g, 7, 11, 2.4, 2.4, "#2f9078");
      fillEllipseF(g, 4.5, 12.5, 1.6, 1.6, "#20705c"); fillEllipseF(g, 9.5, 12.5, 1.6, 1.6, "#20705c");
    }
    return outlineSprite(cv, "#1a5a48");
  }
  if (type === "koi" || type === "moonfish") {   // v0.5.0：珍稀鱼正/背视（小圆身 + 对称尾）
    const body = type === "koi" ? "#f0ece4" : "#8ab8e8";
    const fin = type === "koi" ? "#e8a03a" : "#5a88c4";
    const dk = type === "koi" ? "#8a5a2a" : "#3a5a8a";
    const { cv, g } = sprCtx(8, 8);
    if (front) {
      fillEllipseF(g, 4, 4, 2.6, 2.6, body);
      pxF(g, 2.8, 3.2, "#101820"); pxF(g, 5.2, 3.2, "#101820");
      fillEllipseF(g, 4, 6.6, 1.4, 1, fin);
    } else {
      fillEllipseF(g, 4, 4, 2, 2, body);
      fillEllipseF(g, 1.6, 2.6, 1.4, 1.4, fin); fillEllipseF(g, 6.4, 2.6, 1.4, 1.4, fin);
      fillEllipseF(g, 1.6, 5.6, 1.4, 1.4, fin); fillEllipseF(g, 6.4, 5.6, 1.4, 1.4, fin);
    }
    return outlineSprite(cv, dk);
  }
  // fish（鱼群）：正/背视小圆身 + 对称尾
  const { cv, g } = sprCtx(6, 6);
  if (front) {
    fillEllipseF(g, 3, 3, 2, 2, "#78b4dc");
    pxF(g, 2, 2, "#0a2438"); pxF(g, 4, 2, "#0a2438");
    rectF(g, 2, 5, 2, 1, "#5a94bc");
  } else {
    fillEllipseF(g, 3, 2, 2, 1.5, "#78b4dc");
    rectF(g, 1, 4, 4, 2, "#5a94bc");                              // 尾鳍视图
  }
  return cv;
}

// ============================================================
// 河流 / 新工坊建筑 / 咖啡田（v0.3.0 契约 API，S7 渲染消费）
// ============================================================
const RIVER_VARIANTS = ["#2f7a8a", "#33808f", "#378795", "#3b8e9b"];   // 比海亮、偏青绿
function riverSprite(v, frame) {
  return sprGet(`r${v}_${frame}`, () =>
    bakeWater(v, frame, RIVER_VARIANTS[v], shade(RIVER_VARIANTS[v], 1.25), "#dff2fc", 3));
}

// 工坊建筑：16×24 画布，底部 16 行锚定 tile、上 8 行向上探出；v=hash 变体（0-3）
function buildingSprite(tile, v) {
  return sprGet(`bd${tile}_${v}`, () => {
    const bright = V_BRIGHT[v] || 1;
    const H = 24;
    const { cv, g } = sprCtx(SPR, H);
    const y0 = 8;   // tile 顶对应画布 y=8
    if (tile === T.WELL) {   // 石砌圆井 + 辘轳架 + 吊桶
      fillEllipseF(g, 8, y0 + 11, 6, 4, "#8f9aa3");
      fillEllipseF(g, 8, y0 + 11, 4, 2.5, "#5a636e");
      fillEllipseF(g, 8, y0 + 11, 3, 2, "#1a2530");
      rectF(g, 3, y0 - 1, 1, 12, "#7a5a30"); rectF(g, 12, y0 - 1, 1, 12, "#7a5a30");
      rectF(g, 3, y0 - 2, 10, 1, "#8a6236"); rectF(g, 3, y0 - 3, 10, 1, "#6e5232");
      rectF(g, 8, y0 - 2, 1, 6, "#d9c9a8");                        // 井绳
      rectF(g, 6, y0 + 4, 4, 3, "#8a6236"); rectF(g, 6, y0 + 4, 4, 1, "#5c4426");   // 吊桶
    } else if (tile === T.BREWERY) {   // 酒坊：木屋 + 红幌子 + 酒坛
      rectF(g, 2, y0 + 8, 12, 8, "#a0785a");
      rectF(g, 2, y0 + 15, 12, 1, shadeHex("#a0785a", 0.72));
      for (let y = y0 + 2; y < y0 + 8; y++) {
        const k = (y - y0 - 2) / 6;
        rectF(g, 8 - Math.round(2 + k * 6), y, Math.round(4 + k * 12), 1, "#8a4a3a");
      }
      rectF(g, 6, y0 + 11, 4, 5, "#4a2e18");                       // 门
      rectF(g, 12, y0 - 4, 1, 6, "#4a3520"); rectF(g, 13, y0 - 4, 2, 3, "#d9483b");   // 幌子
      rectF(g, 1, y0 + 12, 3, 4, "#b98a4a"); pxF(g, 2, y0 + 12, "#8a6236");           // 酒坛
    } else if (tile === T.PRESS) {   // 压榨坊：敞棚 + 木榨槽 + 果堆 + 压杆
      rectF(g, 2, y0 + 4, 1, 12, "#7a5a30"); rectF(g, 13, y0 + 4, 1, 12, "#7a5a30");
      rectF(g, 1, y0 + 2, 14, 2, "#8a6236"); rectF(g, 1, y0 + 3, 14, 1, "#6e5232");
      rectF(g, 3, y0 + 11, 10, 4, "#8a6236"); rectF(g, 3, y0 + 11, 10, 1, "#a87c4a"); // 榨槽
      rectF(g, 4, y0 + 8, 8, 2, "#c23b3b"); pxF(g, 5, y0 + 7, "#e8a13b"); pxF(g, 9, y0 + 7, "#e06060");   // 果堆
      rectF(g, 7, y0 + 5, 1, 7, "#5c4426");                        // 压杆
    } else if (tile === T.PAVILION) {   // 凉亭：四柱 + 攒尖顶 + 石凳
      rectF(g, 3, y0 + 6, 1, 10, "#7a5a30"); rectF(g, 12, y0 + 6, 1, 10, "#7a5a30");
      rectF(g, 5, y0 + 8, 1, 8, "#7a5a30"); rectF(g, 10, y0 + 8, 1, 8, "#7a5a30");
      for (let y = 0; y < 6; y++) {
        const w = 16 - y * 2;
        rectF(g, 8 - w / 2, y0 + y, w, 1, y < 2 ? "#b0554a" : "#9c463c");   // 攒尖顶
      }
      pxF(g, 7, y0 - 1, "#d9a05a"); pxF(g, 8, y0 - 1, "#d9a05a");   // 顶珠
      rectF(g, 4, y0 + 12, 3, 2, "#9a9aa2"); rectF(g, 9, y0 + 12, 3, 2, "#9a9aa2");   // 石凳
    } else if (tile === T.THEATER) {   // 戏台：高台 + 双柱 + 幕幔 + 锣
      rectF(g, 1, y0 + 10, 14, 6, "#8a6236"); rectF(g, 1, y0 + 15, 14, 1, "#5c4426");
      rectF(g, 2, y0 + 2, 1, 8, "#7a5a30"); rectF(g, 13, y0 + 2, 1, 8, "#7a5a30");
      rectF(g, 1, y0 + 1, 14, 1, "#8a6236");                        // 横梁
      for (const [rx, rc] of [[3, "#c23b3b"], [7, "#e8a13b"], [11, "#c23b3b"]]) {
        rectF(g, rx, y0 + 3, 2, 6, rc);                             // 幕幔三片
      }
      rectF(g, 6, y0 + 4, 4, 4, "#4a3520");                         // 台口深色
      fillEllipseF(g, 4, y0 + 9, 1.6, 1.6, "#d9a05a");              // 锣
    } else if (tile === T.ARENA) {   // 斗兽场：环形看台 + 场地 + 旗
      fillEllipseF(g, 8, y0 + 10, 7, 5, "#b0a088");
      fillEllipseF(g, 8, y0 + 10, 4.6, 3.2, "#8f8068");
      fillEllipseF(g, 8, y0 + 10, 3, 2, "#c9b98a");                 // 场地沙
      for (let a = 0; a < 8; a++) {                                  // 看台坐席点
        const ax = 8 + Math.cos(a * Math.PI / 4) * 5.8, ay = y0 + 10 + Math.sin(a * Math.PI / 4) * 4;
        pxF(g, Math.round(ax), Math.round(ay), "#6e6250");
      }
      rectF(g, 7, y0 + 1, 1, 5, "#7a5a30"); rectF(g, 8, y0 + 1, 2, 2, "#d9483b");   // 中央旗
    } else if (tile === T.PARK_GATE) {   // 游乐园门楼：双塔 + 拱门 + 彩旗
      rectF(g, 2, y0 + 2, 3, 14, "#c07840"); rectF(g, 11, y0 + 2, 3, 14, "#c07840");
      rectF(g, 2, y0 + 15, 3, 1, "#8a5426"); rectF(g, 11, y0 + 15, 3, 1, "#8a5426");
      rectF(g, 5, y0 + 4, 6, 2, "#d0885a"); rectF(g, 5, y0 + 2, 6, 1, "#e8a86a");   // 拱梁
      rectF(g, 6, y0 + 6, 4, 10, "#3a2a1a");                        // 门洞
      for (const [fx, fc] of [[5, "#c23b3b"], [8, "#4a90d9"], [11, "#e8a13b"]]) {
        pxF(g, fx, y0 - 1, fc); pxF(g, fx, y0 - 2, fc);             // 彩旗
      }
      rectF(g, 5, y0 - 3, 7, 1, "#8a6236");
    } else if (tile === T.FERRIS) {   // 摩天轮：A 字支架 + 大轮辐 + 吊舱
      rectF(g, 6, y0 + 8, 1, 8, "#6a6a72"); rectF(g, 9, y0 + 8, 1, 8, "#6a6a72");
      rectF(g, 5, y0 + 15, 6, 1, "#55555c");
      const R2 = 6.4, cx2 = 8, cy2 = y0 + 6;
      for (let a = 0; a < 8; a++) {                                  // 轮辐
        const ax = cx2 + Math.cos(a * Math.PI / 4) * R2, ay = cy2 + Math.sin(a * Math.PI / 4) * R2;
        rectF(g, cx2, cy2, 1, 1, "#8a92a0");
        // 简化辐条：从中心向轮缘分段描点
        for (let rr = 2; rr <= R2; rr += 1.5) {
          pxF(g, Math.round(cx2 + Math.cos(a * Math.PI / 4) * rr), Math.round(cy2 + Math.sin(a * Math.PI / 4) * rr), "#8a92a0");
        }
        fillEllipseF(g, ax, ay, 1.4, 1.4, ["#c23b3b", "#e8a13b", "#4a90d9", "#6fae4e"][a % 4]);   // 彩色吊舱
      }
      fillEllipseF(g, cx2, cy2, 1.6, 1.6, "#d9a05a");                // 轮心
    } else if (tile === T.CAROUSEL) {   // 旋转木马：圆顶尖顶 + 中心柱 + 两匹木马
      for (let y = 0; y < 5; y++) {
        const w = 14 - y * 2;
        rectF(g, 8 - w / 2, y0 + y, w, 1, y < 1 ? "#e88aa8" : y < 3 ? "#d0688c" : "#b8587a");
      }
      pxF(g, 7, y0 - 1, "#f0d060"); pxF(g, 8, y0 - 1, "#f0d060");
      rectF(g, 3, y0 + 5, 1, 9, "#d9c9a8"); rectF(g, 12, y0 + 5, 1, 9, "#d9c9a8");   // 檐柱
      rectF(g, 7, y0 + 5, 2, 10, "#c9a08a");                         // 中心柱
      fillEllipseF(g, 4.6, y0 + 11, 2.2, 1.4, "#f0ead8");            // 白马
      pxF(g, 5.6, y0 + 10, "#1a1a1a");
      fillEllipseF(g, 11.4, y0 + 11, 2.2, 1.4, "#c9b0d8");           // 紫马
      pxF(g, 12.2, y0 + 10, "#1a1a1a");
      rectF(g, 2, y0 + 15, 12, 1, "#8a5426");                        // 底座
    } else if (tile === T.COASTER) {   // 过山车：起伏轨道 + 支柱 + 小车
      rectF(g, 1, y0 + 12, 1, 4, "#7a5a30"); rectF(g, 6, y0 + 9, 1, 7, "#7a5a30");
      rectF(g, 11, y0 + 6, 1, 10, "#7a5a30"); rectF(g, 14, y0 + 10, 1, 6, "#7a5a30");
      for (let x = 0; x < 16; x++) {                                  // 正弦轨道
        const ty = y0 + 9 - Math.round(Math.sin(x / 16 * Math.PI * 2) * 3);
        pxF(g, x, ty, "#c07840"); pxF(g, x, ty + 1, "#8a5426");
      }
      rectF(g, 10, y0 + 4, 3, 2, "#c23b3b"); pxF(g, 10, y0 + 4, "#e06060");   // 小车
    } else {   // ROASTERY 烘焙坊：矮房 + 烟囱 + 炉火 + 咖啡麻袋
      rectF(g, 2, y0 + 7, 12, 9, "#7a6248");
      rectF(g, 2, y0 + 15, 12, 1, shadeHex("#7a6248", 0.72));
      for (let y = y0 + 2; y < y0 + 7; y++) {
        const k = (y - y0 - 2) / 5;
        rectF(g, 8 - Math.round(2 + k * 6), y, Math.round(4 + k * 12), 1, "#4a3a2e");
      }
      rectF(g, 11, y0 - 3, 2, 6, "#6a6a72");                       // 烟囱
      pxF(g, 11, y0 - 4, "#9a9aa2"); pxF(g, 12, y0 - 5, "#b8b8c0");   // 炊烟
      rectF(g, 5, y0 + 11, 4, 5, "#4a3520");                       // 炉口
      rectF(g, 6, y0 + 13, 2, 2, "#ff9f43"); pxF(g, 6, y0 + 12, "#ffd166");   // 炉火
      rectF(g, 1, y0 + 12, 3, 4, "#6a4a34"); rectF(g, 12, y0 + 12, 3, 4, "#6a4a34");  // 咖啡袋
    }
    return cv;
  });
}

// 咖啡田：深土垄 + 两行咖啡矮株 + 红果（eTier 海拔档 × v hash 变体）
function coffeeFarmSprite(eTier, v) {
  const bright = ELEV_TIERS[eTier] * (V_BRIGHT[v] || 1);
  return sprGet(`cf${eTier}_${v}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    rectF(g, 0, 0, 16, 16, shade("#6a5238", bright));
    for (let r = 0; r < 2; r++) {
      const y = 3 + r * 7;
      rectF(g, 0, y + 4, 16, 1, shade("#57432c", bright));         // 垄沟
      for (const px2 of [3, 8, 13]) {                              // 三株一行
        fillEllipseF(g, px2, y + 2, 2, 2, shade("#2a5a2e", bright));
        pxF(g, px2 - 1, y + 1, shade("#c23b3b", bright));
        pxF(g, px2 + 1, y + 2, shade("#e06060", bright));
      }
    }
    return cv;
  });
}

// ============================================================
// 船：远航帆船（白帆/救援红旗/无帆停泊）与渔船，画布透明底、船头朝右
// ============================================================
function shipSprite(kind) {
  return sprGet(`s${kind}`, () => {
    if (kind === "boat") {
      const { cv, g } = sprCtx(18, 12);
      rectF(g, 2, 6, 14, 3, "#5c6470");
      rectF(g, 1, 6, 1, 1, "#5c6470"); rectF(g, 16, 6, 1, 1, "#5c6470");
      rectF(g, 2, 6, 14, 1, "#6e7682");              // 舷缘亮线
      rectF(g, 4, 9, 10, 1, "#454c56");
      rectF(g, 9, 1, 1, 5, "#3a3f48");               // 桅杆
      rectF(g, 10, 1, 3, 2, "#8fa3b8");              // 小旗
      return outlineSprite(cv, "#20242c");
    }
    const { cv, g } = sprCtx(26, 18);
    const hull = "#7a5a30", hullD = "#5c4426";
    rectF(g, 3, 11, 20, 3, hull);
    rectF(g, 1, 12, 2, 1, hull); rectF(g, 23, 11, 2, 2, hull);   // 船头艉收角
    rectF(g, 3, 14, 20, 1, hullD);
    rectF(g, 2, 11, 22, 1, "#8f6c3c");              // 舷缘亮线
    rectF(g, 13, 2, 1, 9, "#4a3520");               // 桅杆
    if (kind === "ship" || kind === "rescue") {
      const sail = kind === "rescue" ? "#d9483b" : "#f0ead8";
      for (let y = 3; y < 10; y++) {
        const w = 1 + Math.round((y - 3) * 0.8);
        rectF(g, 14, y, w, 1, sail);                // 帆（右张）
      }
      rectF(g, 11, 2, 2, 1, "#e8d9a0");             // 桅顶旗
    }
    return outlineSprite(cv, "#2a1e10");
  });
}

// ============================================================
// 细节叠加：海岸浪花（水格靠陆 4 向）与 草地→沙滩 抖动过渡
// ============================================================
function foamSprite(dir) {   // dir 0上 1下 2左 3右
  return sprGet(`foam${dir}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    for (let t = 0; t < SPR; t++) {
      const d1 = ((t * 5 + dir * 7) % 6) < 4;
      const d2 = ((t * 3 + dir * 5) % 7) < 2;
      const p1 = dir === 0 ? [t, 1] : dir === 1 ? [t, 14] : dir === 2 ? [1, t] : [14, t];
      const p2 = dir === 0 ? [t, 3] : dir === 1 ? [t, 12] : dir === 2 ? [3, t] : [12, t];
      if (d1) pxF(g, p1[0], p1[1], "#d8eef8");
      if (d2) pxF(g, p2[0], p2[1], "#a8d0e8");
    }
    return cv;
  });
}
function ditherSprite(dir) { // 沙滩格靠草一侧撒上草色碎点（dir = 草所在方向）
  return sprGet(`dith${dir}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    for (let t = 0; t < SPR; t++) for (let r = 0; r < 3; r++) {
      if (((t + r * 2) % 4) >= 2) continue;
      const off = 1 + r;
      const x = dir === 2 ? off : dir === 3 ? 15 - off : t;
      const y = dir === 0 ? off : dir === 1 ? 15 - off : t;
      pxF(g, x, y, "#5e8c4f");
    }
    return cv;
  });
}

// ============================================================
// 气候要素贴花（v0.6.16）：取代整格 tint——浮冰/积雪斑/雪帽/枯草斑四类 sticker。
// 透明底、惰性烘焙、每类 3 个 hash 变体；render.js 按强度场概率撒点
// （深处浓密、交界犬牙稀疏）。固定调色板参照 foam/dither 先例，shade 只喂 hex。
// ============================================================
const ICE_SHAPES = [
  [   // 浮冰 v0：圆棱冰盘，左上受光白、右下厚度缘，斜向裂纹
    "....WWWWW.....",
    "..WWWWWWWWB...",
    ".WWWWWWWCWWD..",
    ".WWWWWWCCWWD..",
    "WWWWWWCWWWWWD.",
    "WWWWWCWWWWWWD.",
    ".WWWCCWWWWWDD.",
    "..BBWCWWWDDDD.",
    "...BBCBBDDDD..",
    ".....DDDDD....",
  ],
  [   // 浮冰 v1：狭长碎冰排，反斜裂纹
    "...WWWWW......",
    ".WWWWWWWWWD...",
    ".WCWWWWWWWWD..",
    "WWCWWWWWWWWWD.",
    ".WCWWWWWWWWDD.",
    ".BWCWWWWWWWDD.",
    "..BCWWWWWWDDD.",
    "...BBWCWWDDDD.",
    "....BBCCBDDD..",
    "......DDDD....",
  ],
];
const ICE_PAL = { W: "#f2f8fd", B: "#cfe4f2", D: "#a9c9de", C: "#7fa8c4" };
function iceSprite(v) {   // 浮冰：水面不规则冰块（v2 = v0 镜像），透明底
  return sprGet(`ice${v}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    const rows = v === 2 ? mirrorRows(ICE_SHAPES[0]) : ICE_SHAPES[v % 2];
    stampArt(g, rows, ICE_PAL, 1, 1, 2);
    return cv;
  });
}

function snowPatchSprite(v) {   // 草地积雪斑：白斑 + 淡蓝底影 + 露草点
  return sprGet(`sp${v}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    const P = [[6.4, 3.4, 7.5, 7.5], [5.6, 4.1, 8, 7], [6.8, 3.1, 8, 8.5]][v % 3];
    fillEllipseF(g, P[2], P[3] + 1.2, P[0], P[1], "#c9dcea");                                  // 淡蓝底影
    fillEllipseF(g, P[2], P[3], P[0], P[1], "#eef5fb");                                        // 积雪斑
    fillEllipseF(g, P[2] - P[0] * 0.3, P[3] - P[1] * 0.35, P[0] * 0.5, P[1] * 0.45, "#fbfdff");// 受光高光
    for (let i = 0; i < 3; i++) {   // 斑缘露草 2~3 点（草尖顶破雪层）
      const ang = hash2(v * 17 + i * 31, v * 29 + i * 7) * 6.283;
      pxF(g, Math.round(P[2] + Math.cos(ang) * P[0] * (0.72 + hash2(v + i, i * 13) * 0.36)),
               Math.round(P[3] + Math.sin(ang) * P[1] * (0.72 + hash2(i * 5, v + i) * 0.36)),
          i === 2 ? "#4d7842" : "#5e8c4f");
    }
    pxF(g, Math.round(P[2] + (hash2(v, 99) - 0.5) * P[0]), Math.round(P[3] + (hash2(99, v) - 0.5) * P[1]), "#3f6838");
    return cv;
  });
}

function dryPatchSprite(v) {    // 枯草斑：枯黄斑 + 裸土点 + 干裂纹 + 枯茎
  return sprGet(`dp${v}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    const P = [[6.2, 3.6, 8, 7.5], [5.4, 4.2, 7.5, 8], [6.6, 3.2, 8.5, 7]][v % 3];
    fillEllipseF(g, P[2], P[3] + 1, P[0], P[1], shade("#a08a3e", 0.85));                       // 落影
    fillEllipseF(g, P[2], P[3], P[0], P[1], "#c8ae55");                                        // 枯黄斑
    fillEllipseF(g, P[2] - P[0] * 0.25, P[3] - P[1] * 0.3, P[0] * 0.45, P[1] * 0.4, "#d8c06a");// 亮芯
    for (let i = 0; i < 3; i++) {   // 裸土点
      pxF(g, Math.round(P[2] + (hash2(i * 3, v * 11 + i) - 0.5) * 1.6 * P[0]),
               Math.round(P[3] + (hash2(v * 13 + i * 41, v * 7 + i * 17) - 0.5) * 1.6 * P[1]),
          i === 1 ? "#8a6b46" : "#9a7b52");
    }
    const cx2 = Math.round(P[2] - P[0] * 0.4), cy2 = Math.round(P[3]);
    rectF(g, cx2, cy2, 3, 1, "#7c6438");                                                       // 干裂纹（两段折线）
    pxF(g, cx2 + 3, cy2 - 1, "#7c6438");
    const dx2 = Math.round(P[2] + P[0] * 0.2), dy2 = Math.round(P[3] + P[1] * 0.4);
    pxF(g, dx2, dy2, "#7c6438"); pxF(g, dx2 + 1, dy2 + 1, "#7c6438"); pxF(g, dx2 + 2, dy2, "#7c6438");
    const sx2 = Math.round(P[2] + (hash2(v, 57) - 0.5) * P[0]);                                // 枯茎 2 根
    rectF(g, sx2, Math.round(P[3] - P[1] * 0.6), 1, 3, "#a08a3e");
    rectF(g, sx2 + 3, Math.round(P[3] - P[1] * 0.3), 1, 3, "#93803a");
    return cv;
  });
}

const CAP_SHAPES = [
  ["...WWWWWW...", ".WWWWWWWWWW.", "WWWWWWWWWWWW", "BBBWWBBBWWBB"],
  ["..WWWWWWWW..", ".WWWWWWWWWW.", "WWWWWWWWWWWW", "BWWBBWWBBWWB"],
  [".WWWWWWWWW..", "WWWWWWWWWWWW", "WWWWWWWWWWWW", "WWBBBWWBBBWW"],
];
function snowCapSprite(v) {     // 雪帽：山脊/树顶白帽（上白下沿淡蓝锯齿雪线）
  return sprGet(`cap${v}`, () => {
    const { cv, g } = sprCtx(SPR, SPR);
    stampArt(g, CAP_SHAPES[v % 3], { W: "#f4f9fd", B: "#c9dcea" }, 1, 2, 5);
    return cv;
  });
}
