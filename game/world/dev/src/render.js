"use strict";
// ============ 渲染：tile / 小人 / 昼夜 / 工程进度 ============

const TILE_PX = 14;
const camera = { x: 0, y: 0, zoom: 1.6 };

// 预计算每个 tile 的 4 个亮度变体（地面不死板，hash 取色不闪烁）
function shade(hex, f) {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f));
  return `rgb(${r},${g},${b})`;
}
const TILE_VARIANTS = {};
const TILE_ELEV_VARIANTS = {};  // 按海拔 5 档预调亮度：地势差用坐标海拔直接体现在底色明暗上
const TILE_GLEAM = {};          // 波光高亮色，预计算（无限深海下逐帧 parseInt 会卡）
const POND_VARIANTS = ["#2a6e5c", "#2e7562", "#317c68", "#35836e"].map(c => c);  // 人工池塘青绿色（区别海蓝）
const ELEV_TIERS = [0.76, 0.88, 1.0, 1.12, 1.24];  // 各海拔档的亮度系数
(function initVariants() {
  for (const k in TILE_META) {
    const base = TILE_META[k].color;
    TILE_VARIANTS[k] = [0.92, 0.97, 1.0, 1.05].map(f => shade(base, f));
    TILE_ELEV_VARIANTS[k] = ELEV_TIERS.map(f =>
      [0.92, 0.97, 1.0, 1.05].map(g => shade(base, f * g)));
    TILE_GLEAM[k] = shade(base, 1.08);
  }
})();
function elevTierOf(e) {
  if (!(e >= 0.28)) return 2;
  return Math.max(0, Math.min(4, Math.floor((e - 0.28) / (0.92 - 0.28) * 5)));
}

// 房屋信息缓存（granary/floors；houses 只增不减，用长度做缓存标记）
let _hCache = null, _hCacheLen = -1;
function houseInfo(x, y) {
  if (!_hCache || world.houses.length !== _hCacheLen) {
    _hCache = new Map(world.houses.map(h => [h.x + "," + h.y, h]));
    _hCacheLen = world.houses.length;
  }
  return _hCache.get(x + "," + y);
}
// 该格属于哪个聚落（粮仓即聚落中心）
function settlementAt(x, y) {
  for (const s of world.settlements) if (s.x === x && s.y === y) return s;
  return null;
}

// 功能分区底纹缓存（zones 变化不频繁，按 zonesVersion 重建）
let _zCache = null, _zCacheVer = -1;
const ZONE_COLOR = { farm: "rgba(222,200,80,0.20)", housing: "rgba(230,150,90,0.18)", market: "rgba(120,180,220,0.18)" };
function zoneAt(x, y) {
  if (!_zCache || world.zonesVersion !== _zCacheVer) {
    _zCache = new Map();
    for (const s of world.settlements) {
      if (!s.zones) continue;
      for (const z of s.zones) {
        for (let dy = -z.r; dy <= z.r; dy++) {
          for (let dx = -z.r; dx <= z.r; dx++) {
            if (dx * dx + dy * dy > z.r * z.r) continue;
            const k = (z.x + dx) + "," + (z.y + dy);
            if (!_zCache.has(k)) _zCache.set(k, z.type);
          }
        }
      }
    }
    _zCacheVer = world.zonesVersion;
  }
  return _zCache.get(x + "," + y);
}

// 远景 chunk 缩略图缓存：zoom<0.4 时整块 drawImage，避免逐格绘制百万 tile 卡死
// thumbDirty 失效机制：tile 被点亮/施工改写后 chunk 标脏，渲染帧内限流重建——缩略图与实际地图保持一致
const _chunkThumbs = new Map();
let _thumbBudget = 6;   // 每帧最多重建 6 块（防点亮风暴时的重建尖峰）
function chunkThumb(cx, cy, c) {
  const k = cx + "," + cy;
  let cv = _chunkThumbs.get(k);
  if (cv && !c.thumbDirty) return cv;
  if (_thumbBudget <= 0 && cv) return cv;   // 预算耗尽：先用旧图（下一帧补上）
  _thumbBudget--;
  cv = cv || document.createElement("canvas");
  cv.width = CHUNK; cv.height = CHUNK;
  const c2 = cv.getContext("2d");
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const t = c.tiles[y * CHUNK + x];
      const eT = c.elev ? elevTierOf(c.elev[y * CHUNK + x]) : 2;
      const isPond = t === T.WATER && world.ponds.has((cx * CHUNK + x) + "," + (cy * CHUNK + y));
      c2.fillStyle = t === T.VOID ? "#05070c"
        : isPond ? POND_VARIANTS[(hash2(cx * CHUNK + x, cy * CHUNK + y) * 4) | 0]
        : TILE_ELEV_VARIANTS[t][eT][(hash2(cx * CHUNK + x, cy * CHUNK + y) * 4) | 0];
      c2.fillRect(x, y, 1, 1);
    }
  }
  c.thumbDirty = false;
  _chunkThumbs.set(k, cv);
  return cv;
}

function drawScene(ctx, cw, ch, selected, selectedCreature, visualTod, waveT) {
  // 背景为虚空深渊色：未生成区域（VOID）露出此色，探索到后显现海与岛屿
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, cw, ch);

  const s = TILE_PX * camera.zoom;
  const ox = cw / 2 - camera.x * s;
  const oy = ch / 2 - camera.y * s;
  const x0 = Math.floor(-ox / s);
  const y0 = Math.floor(-oy / s);
  const x1 = Math.ceil((cw - ox) / s);
  const y1 = Math.ceil((ch - oy) / s);
  const t = world.time;

  // 昼夜强度（窗光/遮罩都要用）
  // 昼夜强度（视觉时钟 visualTod：与模拟速度分离，封顶 10×）
  const tod = visualTod;
  let night = 0;
  if (tod < SIM.NIGHT_END) night = 1 - tod / SIM.NIGHT_END;
  else if (tod > SIM.NIGHT_START) night = (tod - SIM.NIGHT_START) / (1 - SIM.NIGHT_START);

  // ---- 远景路径（zoom<0.4）：chunk 缩略图，只生成相机中心附近，防内存/帧率爆炸 ----
  if (camera.zoom < 0.4) {
    _thumbBudget = 6;   // 每帧重建预算
    const R = 40;   // 中心 ±40 格范围内保证生成，更远保持虚空等待探索
    ensureChunksFor(Math.floor(camera.x - R), Math.floor(camera.y - R), Math.ceil(camera.x + R), Math.ceil(camera.y + R));
    const cs = CHUNK * s;
    const cx0 = Math.floor(-ox / cs), cy0 = Math.floor(-oy / cs);
    const cx1 = Math.ceil((cw - ox) / cs), cy1 = Math.ceil((ch - oy) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = world.chunks.get(chunkKey(cx, cy));
        if (!c || !c.gen) continue;
        ctx.drawImage(chunkThumb(cx, cy, c), ox + cx * cs, oy + cy * cs, cs + 0.5, cs + 0.5);
      }
    }
    if (night > 0) {
      ctx.fillStyle = `rgba(12,18,48,${night * 0.45})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    return;
  }

  // 视口内 chunk 懒生成（外扩 8 格，拖拽时边缘更稳），未生成 = 虚空
  ensureChunksFor(x0 - 8, y0 - 8, x1 + 8, y1 + 8);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = tileAt(x, y);
      if (tile === T.VOID) continue;   // 虚空：未被探索的深渊
      const h = hash2(x, y);
      // 海拔档位：地势差通过坐标海拔直接体现在底色明暗（高地亮、洼地暗）
      const cHere = world.chunks.get(chunkKey(x >> 5, y >> 5));
      let eTier = 2;
      if (cHere && cHere.elev) {
        eTier = elevTierOf(cHere.elev[cIdx(x, y)]);
      }
      let variant = TILE_ELEV_VARIANTS[tile][eTier][(h * 4) | 0];
      // 人工池塘：青绿色区分天然浅海（world.ponds 标记）
      if (tile === T.WATER && world.ponds.has(x + "," + y)) {
        variant = POND_VARIANTS[(h * 4) | 0];
      }
      // 水面波光：相位用波光时钟（暂停即静止，倍速不影响频率），高亮更柔和
      if ((tile === T.WATER || tile === T.DEEP) && ((h * 7 + waveT) % 1) < 0.08) {
        variant = TILE_GLEAM[tile];
      }
      const px = ox + x * s, py = oy + y * s;
      ctx.fillStyle = variant;
      ctx.fillRect(px, py, s + 0.5, s + 0.5);

      // 瀑布：水域紧邻悬崖时画流动水帘
      if ((tile === T.WATER || tile === T.DEEP) && s >= 8) {
        let nearCliff = false;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (tileAt(x + ddx, y + ddy) === T.CLIFF) { nearCliff = true; break; }
        }
        if (nearCliff) {
          const ph2 = (t * 2.2 + h * 5) % 1;
          ctx.fillStyle = `rgba(240,248,255,${0.55 - ph2 * 0.3})`;
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(px + s * (0.15 + i * 0.28), py + s * ((ph2 + i * 0.3) % 0.7), s * 0.14, s * 0.3);
          }
        }
      }

      // 功能分区底纹（城邦时代后划定）
      const zn = zoneAt(x, y);
      if (zn) {
        ctx.fillStyle = ZONE_COLOR[zn];
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
      }

      // 地表细节：投影 + 立体面 + 特征色，缩小时降级保特征
      if (tile === T.GRASS && s >= 10 && hash2(x + 8, y + 8) < 0.05) {
        // 草地点缀小花
        ctx.fillStyle = h < 0.5 ? "#e8d9a0" : "#d9909f";
        ctx.fillRect(px + s * (0.3 + h * 0.4), py + s * (0.4 + h * 0.2), s * 0.1, s * 0.1);
      }
      if (tile === T.TREE) {
        if (s >= 8) {
          ctx.fillStyle = "rgba(0,40,10,0.35)";
          ctx.beginPath(); ctx.ellipse(px + s * 0.62, py + s * 0.8, s * 0.3, s * 0.11, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#5a3a1e";
          ctx.fillRect(px + s * 0.44, py + s * 0.5, s * 0.12, s * 0.32);
          ctx.fillStyle = "#1d4a22";
          ctx.beginPath(); ctx.arc(px + s * 0.5, py + s * 0.4, s * 0.34, 0, 7); ctx.fill();
          ctx.fillStyle = shade("#2e6b35", 0.9 + h * 0.25);
          ctx.beginPath(); ctx.arc(px + s * 0.42, py + s * 0.32, s * 0.2, 0, 7); ctx.fill();
        } else {
          ctx.fillStyle = "#1d4a22";
          ctx.fillRect(px + s * 0.16, py + s * 0.1, s * 0.68, s * 0.7);
        }
      } else if (tile === T.MOUNTAIN) {
        if (s >= 8) {
          ctx.fillStyle = "rgba(0,0,25,0.3)";
          ctx.beginPath(); ctx.ellipse(px + s * 0.5, py + s * 0.84, s * 0.42, s * 0.09, 0, 0, 7); ctx.fill();
          const peakX = px + s * (0.32 + h * 0.36);
          ctx.fillStyle = "#8d9099";
          ctx.beginPath();
          ctx.moveTo(px + s * 0.06, py + s * 0.84);
          ctx.lineTo(peakX, py + s * 0.14);
          ctx.lineTo(px + s * 0.94, py + s * 0.84);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#5c606a"; // 右侧暗面 → 立体
          ctx.beginPath();
          ctx.moveTo(peakX, py + s * 0.14);
          ctx.lineTo(px + s * 0.94, py + s * 0.84);
          ctx.lineTo(peakX, py + s * 0.84);
          ctx.closePath(); ctx.fill();
          if (h > 0.55) { // 雪顶
            ctx.fillStyle = "#eceff4";
            ctx.beginPath();
            ctx.moveTo(peakX, py + s * 0.14);
            ctx.lineTo(peakX - s * 0.13, py + s * 0.34);
            ctx.lineTo(peakX + s * 0.13, py + s * 0.34);
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.fillStyle = "#767a84";
          ctx.beginPath();
          ctx.moveTo(px + s * 0.1, py + s * 0.85);
          ctx.lineTo(px + s * 0.5, py + s * 0.18);
          ctx.lineTo(px + s * 0.9, py + s * 0.85);
          ctx.closePath(); ctx.fill();
        }
      } else if (tile === T.HOUSE) {
        const hInfo = houseInfo(x, y);
        const granary = !!(hInfo && hInfo.granary);
        const floors = hInfo ? (hInfo.floors || 1) : 1;
        const sett = granary ? settlementAt(x, y) : null;
        // 城镇(2级)以上：民房变石砌，粮仓变市政厅
        let stone = false;
        if (!granary) {
          for (const st of world.settlements) {
            if (st.level >= 2 && Math.abs(st.x - x) + Math.abs(st.y - y) <= SIM.SETTLEMENT_RADIUS) { stone = true; break; }
          }
        }
        if (s >= 8) {
          const wallH = floors >= 3 ? 0.62 : floors >= 2 ? 0.54 : 0.46;   // 高楼更高
          ctx.fillStyle = stone ? "#c8cdd4" : "#e8dcc0";
          ctx.fillRect(px + s * 0.14, py + s * (1.0 - wallH), s * 0.72, s * wallH - s * 0.02);
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(px + s * 0.14, py + s * 0.82, s * 0.72, s * 0.05);
          ctx.fillStyle = granary ? "#d9a441" : (stone ? "#5d6b7a" : "#b0502e");
          ctx.beginPath();
          ctx.moveTo(px + s * 0.06, py + s * (1.04 - wallH));
          ctx.lineTo(px + s * 0.5, py + s * (1.0 - wallH) - s * 0.38);
          ctx.lineTo(px + s * 0.94, py + s * (1.04 - wallH));
          ctx.closePath(); ctx.fill();
          // 高楼窗户（随层数多排，夜间亮窗）
          if (floors >= 2) {
            const lit = night > 0.3;
            ctx.fillStyle = lit ? "rgba(255,220,130,0.95)" : "rgba(70,90,120,0.9)";
            for (let fl = 0; fl < floors - 1; fl++) {
              ctx.fillRect(px + s * 0.24, py + s * (0.34 - fl * 0.22), s * 0.16, s * 0.12);
              ctx.fillRect(px + s * 0.6, py + s * (0.34 - fl * 0.22), s * 0.16, s * 0.12);
            }
          }
          ctx.fillStyle = "#4a2e18";
          ctx.fillRect(px + s * (granary ? 0.36 : 0.42), py + s * 0.6, s * (granary ? 0.28 : 0.16), s * 0.26);
          if (sett && sett.level >= 2) { // 市政厅旗杆 + 三角旗
            ctx.fillStyle = "#3a2a18";
            ctx.fillRect(px + s * 0.5 - s * 0.03, py - s * 0.55, s * 0.06, s * 0.62);
            ctx.fillStyle = sett.level >= 3 ? "#c23b3b" : "#3b6ac2";
            ctx.beginPath();
            ctx.moveTo(px + s * 0.53, py - s * 0.55);
            ctx.lineTo(px + s * 0.95, py - s * 0.42);
            ctx.lineTo(px + s * 0.53, py - s * 0.28);
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.fillStyle = granary ? "#d9a441" : (stone ? "#5d6b7a" : "#b0502e");
          ctx.fillRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76);
        }
      } else if (tile === T.FENCE) {
        ctx.fillStyle = "#7a5a2e";
        ctx.fillRect(px, py + s * 0.3, s + 0.5, s * 0.12);
        ctx.fillRect(px, py + s * 0.62, s + 0.5, s * 0.12);
        ctx.fillStyle = "#5c3d1e";
        ctx.fillRect(px + s * 0.15, py + s * 0.2, s * 0.12, s * 0.62);
        ctx.fillRect(px + s * 0.73, py + s * 0.2, s * 0.12, s * 0.62);
      } else if (tile === T.CAVE) {
        ctx.fillStyle = "#3a3a42";   // 岩体
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "#0a0a10";   // 洞口
        ctx.beginPath(); ctx.arc(px + s * 0.5, py + s * 0.62, s * 0.26, Math.PI, 0); ctx.fill();
        ctx.fillRect(px + s * 0.24, py + s * 0.62, s * 0.52, s * 0.26);
        ctx.fillStyle = "#1a1a22";
        ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.2, s * 0.12);
      } else if (tile === T.CLIFF) {
        ctx.fillStyle = "#53565e";
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "#787c85";   // 顶部亮缘
        ctx.fillRect(px, py, s + 0.5, s * 0.22);
        ctx.fillStyle = "#3a3d45";   // 底部深裂
        ctx.fillRect(px + s * 0.1, py + s * 0.55, s * 0.25, s * 0.35);
        ctx.fillRect(px + s * 0.6, py + s * 0.45, s * 0.28, s * 0.45);
      } else if (tile === T.QUARRY) {
        ctx.fillStyle = "#9a9284";
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "#6e675c";
        ctx.fillRect(px + s * 0.15, py + s * 0.3, s * 0.3, s * 0.25);
        ctx.fillRect(px + s * 0.55, py + s * 0.5, s * 0.28, s * 0.3);
        ctx.fillStyle = "#c9c2b4";
        ctx.fillRect(px + s * 0.3, py + s * 0.15, s * 0.25, s * 0.18);
      } else if (tile === T.SANDPIT) {
        ctx.fillStyle = "#d8c890";
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "#b8a266";
        ctx.beginPath(); ctx.arc(px + s * 0.4, py + s * 0.55, s * 0.3, 0, 7); ctx.fill();
        ctx.fillStyle = "#efe2b0";
        ctx.beginPath(); ctx.arc(px + s * 0.55, py + s * 0.4, s * 0.18, 0, 7); ctx.fill();
      } else if (tile === T.DOCK) {
        ctx.fillStyle = "#8a6a42";
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "#6e5232";   // 木板
        ctx.fillRect(px, py + s * 0.1, s + 0.5, s * 0.16);
        ctx.fillRect(px, py + s * 0.42, s + 0.5, s * 0.16);
        ctx.fillRect(px, py + s * 0.74, s + 0.5, s * 0.16);
        ctx.fillStyle = "#4a3520";   // 系船桩
        ctx.fillRect(px + s * 0.42, py + s * 0.38, s * 0.16, s * 0.24);
      } else if (tile === T.BERRY) {
        if (s >= 8) {
          ctx.fillStyle = "#2e5a28";
          ctx.beginPath(); ctx.arc(px + s * 0.5, py + s * 0.55, s * 0.32, 0, 7); ctx.fill();
          ctx.fillStyle = "#c23b3b";
          const stock = world.berryStock.get(x + "," + y) || 0;
          for (let i = 0; i < stock; i++) {
            ctx.beginPath();
            ctx.arc(px + s * (0.3 + (i % 2) * 0.3), py + s * (0.4 + Math.floor(i / 2) * 0.25), s * 0.09, 0, 7);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = "#3e6b35"; ctx.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6);
        }
      } else if (tile === T.FRUIT) {
        if (s >= 8) {
          ctx.fillStyle = "#5a3a1e"; ctx.fillRect(px + s * 0.45, py + s * 0.5, s * 0.1, s * 0.3);
          ctx.fillStyle = "#3a7038";
          ctx.beginPath(); ctx.arc(px + s * 0.5, py + s * 0.38, s * 0.36, 0, 7); ctx.fill();
          ctx.fillStyle = "#e8a13b";
          const stock = world.berryStock.get(x + "," + y) || 0;
          for (let i = 0; i < stock; i++) {
            ctx.beginPath();
            ctx.arc(px + s * (0.3 + (i % 3) * 0.2), py + s * (0.3 + Math.floor(i / 3) * 0.18), s * 0.07, 0, 7);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = "#4a7a3a"; ctx.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6);
        }
      } else if (tile === T.PASTURE) {
        ctx.fillStyle = "#a89a62";
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.strokeStyle = "#7a6a3a"; ctx.lineWidth = 1;
        ctx.strokeRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.7);
        ctx.beginPath();
        ctx.moveTo(px + s * 0.15, py + s * 0.5); ctx.lineTo(px + s * 0.85, py + s * 0.5);
        ctx.moveTo(px + s * 0.5, py + s * 0.15); ctx.lineTo(px + s * 0.5, py + s * 0.85);
        ctx.stroke();
      } else if (tile === T.BRIDGE) {
        ctx.fillStyle = "#235d96"; // 桥下水面（透出蓝色，一眼可见桥在水上）
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
        ctx.fillStyle = "rgba(255,255,255,0.18)"; // 水面波纹
        for (let i = 0; i < 2; i++) ctx.fillRect(px + s * 0.15, py + s * (0.22 + i * 0.45), s * 0.7, s * 0.05);
        ctx.fillStyle = "#a97b48"; // 木板（留缝露水）
        for (let i = 0; i < 3; i++) ctx.fillRect(px + s * 0.06, py + s * (0.12 + i * 0.3), s * 0.88, s * 0.16);
        ctx.fillStyle = "#5c3d1e"; // 两侧栏杆
        ctx.fillRect(px, py, s + 0.5, s * 0.07);
        ctx.fillRect(px, py + s * 0.93, s + 0.5, s * 0.07);
      } else if (tile === T.FARM) {
        if (s >= 8) {
          ctx.fillStyle = "#9c7a46"; // 翻耕的土
          ctx.fillRect(px, py, s + 0.5, s + 0.5);
          ctx.fillStyle = "#6fae4e"; // 苗行
          for (let i = 0; i < 3; i++) ctx.fillRect(px + s * 0.12, py + s * (0.2 + i * 0.26), s * 0.76, s * 0.1);
        } else {
          ctx.fillStyle = "#9c7a46";
          ctx.fillRect(px, py, s + 0.5, s + 0.5);
          ctx.fillStyle = "#6fae4e";
          ctx.fillRect(px + s * 0.15, py + s * 0.35, s * 0.7, s * 0.3);
        }
      } else if (tile === T.SAND) {
        if (s >= 8) {
          ctx.fillStyle = "rgba(140,120,70,0.45)";
          ctx.fillRect(px + s * (0.2 + h * 0.3), py + s * 0.3, s * 0.08, s * 0.08);
          ctx.fillRect(px + s * (0.55 - h * 0.25), py + s * 0.66, s * 0.08, s * 0.08);
        }
      } else if (tile === T.PATH) {
        ctx.fillStyle = shade("#b09a72", 0.9 + h * 0.15);
        ctx.fillRect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84);
      }
    }
  }

  // 工程任务进度
  for (const task of tasks.list) {
    const px = ox + task.x * s, py = oy + task.y * s;
    if (task.type === "BUILD" || task.type === "FARM") {
      const p = Math.min(1, task.progress / task.need);
      ctx.fillStyle = "rgba(90,60,30,0.85)";
      ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8);
      ctx.strokeStyle = "#e8d9a0"; ctx.lineWidth = 1;
      ctx.strokeRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8);
      ctx.fillStyle = "#e8d9a0";
      ctx.fillRect(px + s * 0.15, py + s * 0.85, s * 0.7 * p, s * 0.1); // 进度条
    } else {
      // 挖山/填海/架桥：按 tile hp 画施工进度
      const meta = TILE_META[tileAt(task.x, task.y)];
      const hpMax = task.type === "BRIDGE" ? SIM.BRIDGE_HP : (meta.hp || 1);
      const ch2 = world.chunks.get(chunkKey(task.x >> 5, task.y >> 5));
      const hp = ch2 && ch2.gen ? ch2.hp[cIdx(task.x, task.y)] : 0;
      if (hp > 0 && hp < hpMax) {
        ctx.fillStyle = `rgba(255,255,240,${0.12 + 0.2 * (1 - hp / hpMax)})`;
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
      }
    }
  }

  // 动物（远景 zoom<0.4 时跳过，走 chunk 缩略图）
  if (s >= 5.6) {
    for (const c of creatures) {
      if (c.dead) continue;
      const px = ox + c.x * s, py = oy + c.y * s;
      const meta = CREATURE_META[c.type];
      const r = Math.max(1.5, s * 0.16 * meta.size);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(px, py + r * 0.8, r, r * 0.4, 0, 0, 7); ctx.fill();
      if ((c.strandT || 0) > 3) {   // 搁浅求救标记（被困动物头顶红色感叹号）
        ctx.fillStyle = "#e74c3c";
        ctx.font = `bold ${Math.max(8, s * 0.5)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", px, py - r * 2.2);
      }
      if (c.type === "cow") {
        ctx.fillStyle = "#8a5a3a";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.15, r * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#e8e0d0";
        ctx.fillRect(px - r * 0.9, py - r * 1.1, r * 0.3, r * 0.35);
        ctx.fillRect(px + r * 0.6, py - r * 1.1, r * 0.3, r * 0.35);
      } else if (c.type === "goat") {
        ctx.fillStyle = "#e8e4da";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.05, r * 0.75, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#6b6b6b";
        ctx.beginPath(); ctx.arc(px + r * 0.9, py - r * 0.3, r * 0.4, 0, 7); ctx.fill();
      } else if (c.type === "deer") {
        ctx.fillStyle = "#a5713d";
        ctx.beginPath(); ctx.ellipse(px, py, r * 0.95, r * 0.65, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#7a4f28";
        ctx.beginPath(); ctx.arc(px + r * 0.85, py - r * 0.45, r * 0.32, 0, 7); ctx.fill();
        ctx.strokeStyle = "#5c3a1a"; ctx.lineWidth = 0.8;   // 鹿角
        ctx.beginPath();
        ctx.moveTo(px + r * 0.9, py - r * 0.75); ctx.lineTo(px + r * 1.2, py - r * 1.25);
        ctx.moveTo(px + r * 1.0, py - r * 0.85); ctx.lineTo(px + r * 1.35, py - r * 1.0);
        ctx.stroke();
      } else if (c.type === "boar") {
        ctx.fillStyle = "#5c4632";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.1, r * 0.85, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#3d2e1e";
        ctx.beginPath(); ctx.arc(px + r * 0.95, py - r * 0.15, r * 0.45, 0, 7); ctx.fill();
      } else if (c.type === "wolf") {
        ctx.fillStyle = "#787882";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.2, r * 0.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#5a5a64";
        ctx.beginPath(); ctx.arc(px + r * 1.1, py - r * 0.35, r * 0.4, 0, 7); ctx.fill();
      } else if (c.type === "fish") {
        ctx.fillStyle = "rgba(120,180,220,0.85)";
        for (let i = 0; i < 3; i++) {
          const fx = px + Math.cos(s * 0.8 + i * 2.1) * r * 1.2, fy = py + Math.sin(s * 0.8 + i * 2.1) * r * 0.7;
          ctx.beginPath(); ctx.ellipse(fx, fy, r * 0.4, r * 0.18, s * 0.8 + i, 0, 7); ctx.fill();
        }
      } else if (c.type === "turtle") {
        ctx.fillStyle = "#4a7a55";
        ctx.beginPath(); ctx.ellipse(px, py, r * 0.95, r * 0.7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#33604a";
        ctx.beginPath(); ctx.ellipse(px, py, r * 0.6, r * 0.45, 0, 0, 7); ctx.fill();
      } else if (c.type === "whale") {
        ctx.fillStyle = "#2c4a66";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.6, r * 0.75, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#3d6284";
        ctx.beginPath(); ctx.ellipse(px - r * 0.3, py - r * 0.2, r * 0.9, r * 0.4, 0, 0, 7); ctx.fill();
        const sp2 = (s * 0.5) % 2;   // 喷水柱
        if (sp2 < 1) { ctx.fillStyle = `rgba(240,248,255,${0.6 - sp2 * 0.6})`; ctx.fillRect(px, py - r * 1.5 - sp2 * r, r * 0.15, r * 0.8); }
      } else if (c.type === "dog") {
        ctx.fillStyle = "#8a8a92";
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.1, r * 0.7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#5a5a62";
        ctx.beginPath(); ctx.arc(px - r * 0.9, py - r * 0.2, r * 0.42, 0, 7); ctx.fill();
      }
      if (c.type === "bird") {   // 鸟：空中飞行的小 V 形
        const fw = Math.sin(s * 6 + c.phase) * r * 0.5;
        ctx.strokeStyle = "#3a3a44"; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px - r * 1.2, py - fw * 0.5);
        ctx.lineTo(px, py - r * 0.4);
        ctx.lineTo(px + r * 1.2, py - fw * 0.5);
        ctx.stroke();
        continue;
      }
      if (c.pasture) { // 圈养标记
        ctx.strokeStyle = "rgba(200,170,80,0.8)"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(px, py, r * 1.5, 0, 7); ctx.stroke();
      }
      if (c === selectedCreature) { // 选中光环
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(px, py + r * 0.6, r * 2, r * 1.2, 0, 0, 7); ctx.stroke();
      }
    }
  }

  // 远景：显示各地区名字（缩小到看不清小人时，地图上标注地区名）
  if (camera.zoom < 0.8) {
    ctx.textAlign = "center";
    ctx.font = "bold 13px 'PingFang SC', sans-serif";
    const SETTLE_L = ["定居点", "村庄", "城镇", "城市"];
    const label = (x, y, text) => {
      const px = ox + x * s, py = oy + y * s - s * 0.6;
      const w = ctx.measureText(text).width + 10;
      ctx.fillStyle = "rgba(8,10,16,0.72)";
      ctx.fillRect(px - w / 2, py - 14, w, 18);
      ctx.fillStyle = "#e8d9a0";
      ctx.fillText(text, px, py);
    };
    for (const o of world.islands) {
      if (!o.name) continue;
      if (world.settlements.some(st => Math.hypot(st.x - o.x, st.y - o.y) < o.r + 5)) continue;   // 有聚落的岛显示聚落名
      label(o.x, o.y, o.name);
    }
    for (const st of world.settlements) {
      label(st.x, st.y, `${st.name} · ${SETTLE_L[st.level]}`);
    }
    ctx.textAlign = "left";
  }

  // 远航船（航海家在船上时不单独绘制小人）
  for (const s of world.ships) {
    const px = ox + s.x * s, py = oy + s.y * s;
    const boatScale = s.boat ? 0.75 : 1;   // 渔船比远航船小一号
    const r = Math.max(3, s * 0.55) * boatScale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.ang);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = s.boat ? "#5c6470" : "#7a5a30";   // 船身（渔船灰）
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.quadraticCurveTo(0, r * 0.85, -r * 1.1, r * 0.45);
    ctx.lineTo(-r * 1.1, -r * 0.45);
    ctx.quadraticCurveTo(0, -r * 0.85, r * 1.3, 0);
    ctx.closePath(); ctx.fill();
    if (s.state === "sailing" || s.state === "rescue") {   // 帆（救援船挂红旗）
      ctx.fillStyle = s.state === "rescue" ? "#d9483b" : "#f0ead8";
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.15);
      ctx.lineTo(r * 0.1, -r * 1.1);
      ctx.lineTo(r * 0.75, -r * 0.2);
      ctx.closePath(); ctx.fill();
    }
    if (s.boat) {   // 渔船小旗
      ctx.fillStyle = "#8fa3b8";
      ctx.fillRect(-r * 0.15, -r * 1.2, r * 0.12, r * 0.6);
    }
    if (s.state === "stranded") {   // 被困求救标记（抵消船体旋转保持竖直）
      ctx.rotate(-s.ang);
      ctx.fillStyle = "#e74c3c";
      ctx.font = `bold ${Math.max(9, s * 1.4)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", 0, -r * 1.9);
    }
    ctx.restore();
    if (s.state === "fishing") {   // 捕捞涟漪（不随船旋转）
      ctx.strokeStyle = "rgba(240,240,220,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, r * (1.6 + Math.sin(s.x * 7 + s.y * 3) * 0.4), 0, 7);
      ctx.stroke();
    }
  }

  // 小人：头 + 身两段式 + 深色描边，任何底色上一眼可辨
  for (const a of agents) {
    if (a.state === "voyage") continue;   // 航海中的人在船上
    const px = ox + a.x * s, py = oy + a.y * s;
    let c = "#f2ede0";
    if (a.state === "work") c = "#ff9f43";
    else if (a.state === "eat") c = "#ffd166";
    else if (a.state === "sleep") c = "#8fa3e8";   // 睡觉提亮，夜里也可见
    const r = Math.max(1.8, s * 0.15);             // 头半径
    const bw = r * 1.4, bh = r * 2.1;              // 身体

    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(px, py + bh * 0.7, r * 1.05, r * 0.42, 0, 0, 7); ctx.fill();

    // 选中光环
    if (a === selected && s >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(px, py + bh * 0.5, r * 2.2, r * 1.5, 0, 0, 7); ctx.stroke();
    }

    if (s < 6) { // 极小缩放：单点降级
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, r), 0, 7); ctx.fill();
      continue;
    }

    const bob = a.state === "walk" ? Math.abs(Math.sin(a.phase * 9)) * r * 0.3 : 0;
    ctx.save();
    ctx.translate(px, py - bob);
    let tilt = 0;
    if (a.state === "sleep") tilt = Math.PI / 2;               // 躺平
    else if (a.state === "work") tilt = Math.sin(a.phase * 13) * 0.16; // 干活前倾摆动
    ctx.rotate(tilt);

    ctx.fillStyle = c;
    ctx.strokeStyle = "rgba(15,15,25,0.85)";
    ctx.lineWidth = Math.max(0.6, s * 0.02);
    // 身体（椭圆）
    ctx.beginPath(); ctx.ellipse(0, bh * 0.18, bw * 0.5, bh * 0.5, 0, 0, 7);
    ctx.fill(); ctx.stroke();
    // 头
    ctx.beginPath(); ctx.arc(0, -bh * 0.5, r, 0, 7);
    ctx.fill(); ctx.stroke();
    // 原住民部族标记（头顶白色羽饰）
    if (a.native) {
      ctx.fillStyle = "#f5f0e0";
      ctx.fillRect(-r * 0.12, -bh * 0.5 - r * 1.7, r * 0.24, r * 1.1);
    }
    ctx.restore();

    // 状态标记
    if (a.state === "work") {          // 敲击火花
      const k = (a.phase * 2.2) % 1;
      ctx.fillStyle = `rgba(255,255,255,${(0.9 - k * 0.9).toFixed(2)})`;
      ctx.fillRect(px - r * 0.4, py - bh * 1.6 - k * r * 1.2, r * 0.8, r * 0.5);
    } else if (a.state === "eat") {    // 吃饭的小食物点
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath(); ctx.arc(px + r * 1.5, py - bh * 0.8, r * 0.42, 0, 7); ctx.fill();
    } else if (a.state === "sleep" && s >= 10) { // 睡觉冒 z
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `${Math.max(7, s * 0.45)}px sans-serif`;
      ctx.fillText("z", px + r * 0.8, py - bh * 0.8);
    }
  }

  // 昼夜遮罩（night 已在函数开头计算）
  if (night > 0) {
    ctx.fillStyle = `rgba(12,18,48,${night * 0.45})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}
