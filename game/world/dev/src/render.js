"use strict";
// ============ 渲染：像素 sprite 贴图 / 昼夜 / 工程进度 ============
// 画风：全部 tile 与实体走 sprites.js 预烘焙点阵图集，本文件只做场景编排与动态叠加层。
// zoom 语义：≥1 关闭平滑（锐利方块感）、0.4~1 开启平滑（缩小防闪烁）、<0.4 走像素缩略图。

const TILE_PX = 16;
const camera = { x: 0, y: 0, zoom: 1.6 };

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

// 相邻格查询（4 向，d: 0上 1下 2左 3右）
function neighborTile(x, y, d) {
  return tileAt(x + (d === 2 ? -1 : d === 3 ? 1 : 0), y + (d === 0 ? -1 : d === 1 ? 1 : 0));
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

  // 昼夜强度（视觉时钟 visualTod：与模拟速度分离，封顶 10×）
  const tod = visualTod;
  let night = 0;
  if (tod < SIM.NIGHT_END) night = 1 - tod / SIM.NIGHT_END;
  else if (tod > SIM.NIGHT_START) night = (tod - SIM.NIGHT_START) / (1 - SIM.NIGHT_START);

  // ---- 远景路径（zoom<0.4）：chunk 缩略图（1 格 = 1 像素，关平滑 = 硬边像素风）----
  if (camera.zoom < 0.4) {
    ctx.imageSmoothingEnabled = false;
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

  // 中近景：放大锐利（方块感）、缩小平滑（防闪烁）
  ctx.imageSmoothingEnabled = camera.zoom < 1;

  // 视口内 chunk 懒生成（外扩 8 格，拖拽时边缘更稳），未生成 = 虚空
  ensureChunksFor(x0 - 8, y0 - 8, x1 + 8, y1 + 8);

  const wFrameBase = waveT * 3;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tile = tileAt(x, y);
      if (tile === T.VOID) continue;   // 虚空：未被探索的深渊
      const h = hash2(x, y);
      // 海拔档位：地势差通过坐标海拔直接体现在底色明暗（高地亮、洼地暗）
      const cHere = world.chunks.get(chunkKey(x >> 5, y >> 5));
      let eTier = 2;
      if (cHere && cHere.elev) eTier = elevTierOf(cHere.elev[cIdx(x, y)]);
      const v = (h * 4) | 0;
      const px = ox + x * s, py = oy + y * s;

      if (tile === T.HOUSE) {
        // 房屋：参数化 sprite（楼层/石砌/粮仓/夜间亮窗），画布上探屋顶，锚定 tile 底
        const hInfo = houseInfo(x, y);
        const granary = !!(hInfo && hInfo.granary);
        const floors = hInfo ? (hInfo.floors || 1) : 1;
        let stone = false;
        if (!granary) {
          for (const st of world.settlements) {
            if (st.level >= 2 && Math.abs(st.x - x) + Math.abs(st.y - y) <= SIM.SETTLEMENT_RADIUS) { stone = true; break; }
          }
        }
        const hspr = houseSprite(floors, stone, granary, night > 0.3);
        const scale = s / SPR;
        ctx.drawImage(hspr, px, py + s - hspr.height * scale, s + 0.5, hspr.height * scale);
        const sett = granary ? settlementAt(x, y) : null;
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
        // 常规 tile：从图集取 sprite 整格贴图
        let spr;
        if (tile === T.WATER || tile === T.DEEP) {
          const wFrame = ((wFrameBase + h * 4) | 0) % 4;
          spr = (tile === T.WATER && world.ponds.has(x + "," + y))
            ? pondSprite(v, wFrame) : waterSprite(tile, eTier, v, wFrame);
        } else if (tile === T.BERRY || tile === T.FRUIT) {
          spr = propSprite(tile === T.BERRY ? "berry" : "fruit", eTier, v, world.berryStock.get(x + "," + y) || 0);
        } else {
          spr = tileSprite(tile, eTier, v);
        }
        ctx.drawImage(spr, px, py, s + 0.5, s + 0.5);

        // 海岸浪花：水格靠陆一侧描白沫
        if ((tile === T.WATER || tile === T.DEEP) && s >= 6) {
          for (let d = 0; d < 4; d++) {
            const nb = neighborTile(x, y, d);
            if (nb !== T.VOID && nb !== T.WATER && nb !== T.DEEP && nb !== T.BRIDGE)
              ctx.drawImage(foamSprite(d), px, py, s + 0.5, s + 0.5);
          }
        }
        // 草地→沙滩抖动过渡
        if (tile === T.SAND && s >= 8) {
          for (let d = 0; d < 4; d++) {
            if (neighborTile(x, y, d) === T.GRASS) ctx.drawImage(ditherSprite(d), px, py, s + 0.5, s + 0.5);
          }
        }
        // 瀑布：水域紧邻悬崖时画流动水帘
        if ((tile === T.WATER || tile === T.DEEP) && s >= 8) {
          let nearCliff = false;
          for (let d = 0; d < 4; d++) if (neighborTile(x, y, d) === T.CLIFF) { nearCliff = true; break; }
          if (nearCliff) {
            const ph2 = (t * 2.2 + h * 5) % 1;
            ctx.fillStyle = `rgba(240,248,255,${0.55 - ph2 * 0.3})`;
            for (let i = 0; i < 3; i++) {
              ctx.fillRect(px + s * (0.15 + i * 0.28), py + s * ((ph2 + i * 0.3) % 0.7), s * 0.14, s * 0.3);
            }
          }
        }
      }

      // 功能分区底纹（城邦时代后划定）
      const zn = zoneAt(x, y);
      if (zn) {
        ctx.fillStyle = ZONE_COLOR[zn];
        ctx.fillRect(px, py, s + 0.5, s + 0.5);
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

      if (c.type === "fish") {
        // 鱼群：3 尾小鱼绕群心游动
        for (let i = 0; i < 3; i++) {
          const ang = t * 0.8 + i * 2.1;
          const fx = px + Math.cos(ang) * s * 0.32, fy = py + Math.sin(ang) * s * 0.19;
          const fs = Math.max(3, s * 0.22);
          ctx.drawImage(creatureSprite("fish"), fx - fs / 2, fy - fs / 3, fs, fs * 0.6);
        }
      } else if (c.type === "bird") {
        // 鸟：空中飞行，两帧扑翼
        const fw = Math.floor(t * 6 + c.phase) % 2;
        const bw = Math.max(5, s * 0.34);
        ctx.drawImage(creatureSprite("bird", fw), px - bw / 2, py - s * 0.4 - bw * 0.25, bw, bw * 0.5);
      } else {
        const spr = creatureSprite(c.type);
        const w = Math.max(6, s * 0.66 * meta.size);
        const hh = w * spr.height / spr.width;
        // 影子
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath(); ctx.ellipse(px, py + hh * 0.3, w * 0.4, w * 0.12, 0, 0, 7); ctx.fill();
        if ((c.strandT || 0) > 3) {   // 搁浅求救标记（被困动物头顶红色感叹号）
          ctx.fillStyle = "#e74c3c";
          ctx.font = `bold ${Math.max(8, s * 0.5)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("!", px, py - hh * 0.9);
        }
        ctx.drawImage(spr, px - w / 2, py - hh * 0.62, w, hh);
      }
      if (c.pasture) { // 圈养标记
        ctx.strokeStyle = "rgba(200,170,80,0.8)"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(px, py, s * 0.3, 0, 7); ctx.stroke();
      }
      if (c === selectedCreature) { // 选中光环
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(px, py + s * 0.1, s * 0.4, s * 0.24, 0, 0, 7); ctx.stroke();
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

  // 船（远航帆船 / 渔船）：像素 sprite 旋转贴图
  for (const sh of world.ships) {
    const px = ox + sh.x * s, py = oy + sh.y * s;
    const sailing = sh.state === "sailing" || sh.state === "rescue";
    const kind = sh.boat ? "boat" : (sailing ? (sh.state === "rescue" ? "rescue" : "ship") : "shipH");
    const spr = shipSprite(kind);
    const L = Math.max(10, s * 1.15) * (sh.boat ? 0.7 : 1);
    const W2 = L * spr.height / spr.width;
    // 船影
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(px, py + W2 * 0.35, L * 0.42, W2 * 0.32, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(sh.ang);
    ctx.drawImage(spr, -L / 2, -W2 / 2, L, W2);
    ctx.restore();
    if (sh.state === "stranded") {   // 被困求救标记
      ctx.fillStyle = "#e74c3c";
      ctx.font = `bold ${Math.max(9, s * 1.4)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", px, py - W2);
    }
    if (sh.state === "fishing") {   // 捕捞涟漪
      ctx.strokeStyle = "rgba(240,240,220,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, L * (0.65 + Math.sin(sh.x * 7 + sh.y * 3) * 0.15), 0, 7);
      ctx.stroke();
    }
  }

  // 小人：像素 sprite（状态着色 + 走路/干活双帧摆动 + 睡觉躺平）
  for (const a of agents) {
    if (a.state === "voyage") continue;   // 航海中的人在船上
    const px = ox + a.x * s, py = oy + a.y * s;
    const r = Math.max(1.8, s * 0.15);

    // 影子
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(px, py + s * 0.22, r * 1.05, r * 0.42, 0, 0, 7); ctx.fill();

    // 选中光环
    if (a === selected && s >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(px, py + s * 0.12, r * 2.2, r * 1.5, 0, 0, 7); ctx.stroke();
    }

    if (s < 6) { // 极小缩放：单点降级
      ctx.fillStyle = AGENT_COLORS[a.state === "work" ? "work" : a.state === "eat" ? "eat" : a.state === "sleep" ? "sleep" : "idle"];
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, r), 0, 7); ctx.fill();
      continue;
    }

    const colorKey = a.state === "work" ? "work" : a.state === "eat" ? "eat" : a.state === "sleep" ? "sleep" : "idle";
    let pose = 0;
    if (a.state === "walk") pose = 1 + (Math.floor(a.phase * 3) % 2);
    else if (a.state === "work") pose = 4 + (Math.floor(a.phase * 3) % 2);
    else if (a.state === "sleep") pose = 3;
    const spr = agentSprite(colorKey, pose, a.native);
    const scale = s / SPR;
    const sh2 = spr.height * scale;
    const bob = a.state === "walk" ? Math.abs(Math.sin(a.phase * 9)) * r * 0.3 : 0;
    ctx.drawImage(spr, px - 8 * scale, py - sh2 * 0.62 - bob, 16 * scale, sh2);

    // 状态标记
    if (a.state === "work") {          // 敲击火花
      const k = (a.phase * 2.2) % 1;
      ctx.fillStyle = `rgba(255,255,255,${(0.9 - k * 0.9).toFixed(2)})`;
      ctx.fillRect(px - r * 0.4, py - s * 0.5 - k * r * 1.2, r * 0.8, r * 0.5);
    } else if (a.state === "eat") {    // 吃饭的小食物点
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath(); ctx.arc(px + r * 1.5, py - s * 0.25, r * 0.42, 0, 7); ctx.fill();
    } else if (a.state === "sleep" && s >= 10) { // 睡觉冒 z
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `${Math.max(7, s * 0.45)}px sans-serif`;
      ctx.fillText("z", px + r * 0.8, py - sh2 * 0.5);
    }
  }

  // 昼夜遮罩（night 已在函数开头计算）
  if (night > 0) {
    ctx.fillStyle = `rgba(12,18,48,${night * 0.45})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}
