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
// 小人：4 状态色 × 6 姿态（B=状态色，b=暗部，t=锤柄，k=锤头）
// 姿态：0 站立 / 1-2 走路两帧 / 3 躺睡 / 4-5 干活抡锤两帧
// ============================================================
const AGENT_COLORS = { idle: "#f2ede0", work: "#ff9f43", eat: "#ffd166", sleep: "#8fa3e8" };
const _A_BODY = [
  "................",
  "................",
  "................",
  "......BBBB......",
  "......BBBB......",
  "......BBBB......",
  "......BBBB......",
  ".....BBBBBB.....",
  "....BBBBBBBB....",
  "....BBBBBBBB....",
  "....BBBBBBBB....",
  "....bBBBBBBb....",
];
const AGENT_POSES = [
  _A_BODY.concat([".....BB..BB.....", ".....BB..BB.....", ".....BB..BB.....", "................"]),
  _A_BODY.concat([".....BB..BB.....", "....BB....BB....", "....BB.....BB...", "................"]),
  _A_BODY.concat([".....BB..BB.....", ".....BBBB.......", "....BB...BB.....", "................"]),
  [
    "................", "................", "................", "................",
    "................", "................", "................", "................",
    "................", "..........BBBB..", "....BBBBBBBBBB..", "....BBBBBBBBBB..",
    "....bBBBBBBBbb..", "................", "................", "................",
  ],
  [
    "................", "................", "..........kk....", "..........kk....",
    "......BBBB..t...", "......BBBB..t...", "......BBBB..t...", ".....BBBBBBBt...",
    "....BBBBBBBB....", "....BBBBBBBB....", "....BBBBBBBB....", "....bBBBBBBb....",
    ".....BB..BB.....", ".....BB..BB.....", ".....BB..BB.....", "................",
  ],
  [
    "................", "................", "................", "................",
    "................", "................", "................", ".....BBBBBB.....",
    "....BBBBBBBB....", "....BBBBBBBB....", "....BBBBBBBBt...", "....bBBBBBBBt...",
    ".....BB..BBkk...", ".....BB..BB.....", ".....BB..BB.....", "................",
  ],
];
const NATIVE_FEATHER = [".......F........", ".......F........", ".......F........"];

function agentSprite(colorKey, pose, native) {
  return sprGet(`a${colorKey}_${pose}_${native ? 1 : 0}`, () => {
    const col = AGENT_COLORS[colorKey];
    const cv = bakeArt(SPR, SPR, AGENT_POSES[pose] || AGENT_POSES[0],
      { B: col, b: shadeHex(col, 0.78), t: "#7a5a30", k: "#9aa0a8" }, 1);
    if (native) stampArt(cv.getContext("2d"), NATIVE_FEATHER, { F: "#f5f0e0" }, 1, 0, pose === 3 ? 6 : 1);
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
  fillEllipseF(g, 14, 9, 13, 6, "#2c4a66");
  fillEllipseF(g, 13, 12, 10, 3, "#3d6284");         // 白腹
  rectF(g, 26, 8, 4, 3, "#2c4a66");                  // 尾柄
  fillEllipseF(g, 30, 6, 3.4, 2.4, "#2c4a66");       // 尾鳍上叶
  fillEllipseF(g, 30, 12, 3.4, 2.4, "#2c4a66");      // 尾鳍下叶
  fillEllipseF(g, 10, 13, 2.6, 1.4, "#24405a");      // 胸鳍
  pxF(g, 24, 7, "#cfe4f2");                          // 眼
  rectF(g, 24, 11, 6, 1, "#24405a");                 // 嘴线
  return outlineSprite(cv, "#122234");
}
function bakeFish() {
  const { cv, g } = sprCtx(6, 4);
  rectF(g, 0, 1, 4, 2, "#78b4dc");
  rectF(g, 4, 1, 2, 2, "#5a94bc");                   // 尾
  pxF(g, 1, 1, "#0a2438");                           // 眼
  return cv;
}
function bakeBird(frame) {
  const rows = frame
    ? ["..........", "....bb....", "...wbbw...", "..w....w..", ".w......w."]
    : ["..........", ".w......w.", "..w....w..", "...wbbw...", "....bb...."];
  return bakeArt(10, 5, rows, { w: "#3a3a44", b: "#4a4a56" }, 1);
}

const BAKE_CREATURES = {
  cow: bakeCow, goat: bakeGoat, deer: bakeDeer, boar: bakeBoar, wolf: bakeWolf,
  dog: bakeDog, turtle: bakeTurtle, whale: bakeWhale, fish: bakeFish,
};
function creatureSprite(type, frame) {
  return sprGet(`c${type}_${frame || 0}`, () => {
    if (type === "bird") return bakeBird(frame || 0);
    return BAKE_CREATURES[type] ? BAKE_CREATURES[type]() : bakeCow();
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
