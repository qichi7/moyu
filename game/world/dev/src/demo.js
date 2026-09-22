"use strict";
// ============ 机制演示引擎（v0.6.0 / v0.6.1 迷你沙盘版）============
// 每个机制 = 一张字符画布迷你地图（dStage 铺 tile）+ 出场角色（小人/动物关键帧移动）+ 特效
// （驯化进度环/浮动标签/点亮光圈/灰云/桥链生长/建筑落成）。播放时主世界暂停（main.js 负责
// setSpeed(0)/恢复），可 0.5~4× 倍速；播完提示「当前机制演示完毕」并在左侧菜单打勾。
// 面板为双栏：左侧滚动菜单（点击即打断当前演示切换），右侧固定沙盘（不随滚动）。
// 绘制复用全局 sprite 图集（拼接在 sprites/render 之后）；DOM 只在打开弹窗时触碰。

// ---- 字符画布 → tile 映射（地图作者用字符排版）----
const STAGE_TILES = {
  G: T.GRASS, W: T.WATER, D: T.DEEP, S: T.SAND, T: T.TREE, H: T.HOUSE, F: T.FARM,
  B: T.BRIDGE, L: T.CLIFF, K: T.DOCK, E: T.WELL, R: T.BREWERY, C: T.PRESS, O: T.ROASTERY,
  P: T.PASTURE, N: T.FENCE, A: T.GATE, I: T.PIER, M: T.PARK_GATE, V: T.PAVILION,
  X: T.THEATER, Z: T.ARENA, U: T.FERRIS, J: T.CAROUSEL, Q: T.COASTER, Y: T.PATH,
  b: T.BERRY, "!": T.SITE,
};
// 底锚建筑（16×24/28 向上探出）走 buildingSprite/houseSprite；其余走 tileSprite；水走 waterSprite 动画
const STAGE_BUILDINGS = new Set([T.HOUSE, T.WELL, T.BREWERY, T.PRESS, T.ROASTERY,
  T.PAVILION, T.THEATER, T.ARENA, T.PARK_GATE, T.FERRIS, T.CAROUSEL, T.COASTER]);

// ---- 绘制小工具 ----
function dBar2(g, x, y, w, h, ratio, color, label) {
  g.fillStyle = "#1c2333"; g.fillRect(x, y, w, h);
  g.fillStyle = color; g.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
  g.strokeStyle = "#2a3448"; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) { g.fillStyle = "#8a93a8"; g.font = "9px sans-serif"; g.fillText(label, x, y - 2); }
}
function dCloud2(g, x, y, s) {
  g.fillStyle = "rgba(150,160,180,0.9)";
  g.beginPath();
  g.arc(x, y, s * 0.28, 0, 7); g.arc(x + s * 0.3, y - s * 0.1, s * 0.22, 0, 7); g.arc(x - s * 0.3, y - s * 0.08, s * 0.2, 0, 7);
  g.fill();
}

// ---- 角色绘制：分层小人（agentLook 外观 + side 视图 + 移动镜像）----
function dMan2(g, x, y, s, o) {
  const look = agentLook(o.look || 1);
  const sex = o.sex || "m";
  const style = (sex === "f" ? HAIR_STYLES_F : HAIR_STYLES_M)[look.hairStyle] || "short";
  const shirt = o.shirt || look.shirt;
  const body = o.body || "stand", legs = o.legs || "stand";
  const bob = (body === "walk1" || body === "walk2") ? Math.abs(Math.sin((o.phase || 0) * 9)) * s * 0.08 : 0;
  const y0 = y - bob;
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.beginPath(); g.ellipse(x + s / 2, y + s * 0.92, s * 0.3, s * 0.09, 0, 0, 7); g.fill();
  g.save();
  if (o.face === -1) { g.translate(x + s, y0); g.scale(-1, 1); } else g.translate(x, y0);
  if (body !== "sleep") g.drawImage(agentPantsSprite(look.pants, legs, sex, look.skin, "side"), 0, 0, s + 0.5, s + 0.5);
  g.drawImage(agentBodySprite(shirt, body, sex, "side"), 0, 0, s + 0.5, s + 0.5);
  g.drawImage(agentHeadSprite(look.skin, style, look.hairC, sex, false, "side"), 0, 0, s + 0.5, s + 0.5);
  g.restore();
}
function dAnimal(g, type, x, y, s, face) {
  const meta = CREATURE_META[type];
  const spr = creatureSprite(type, 0, "side");
  const w = Math.max(8, s * 0.85 * meta.size);
  const hh = w * spr.height / spr.width;
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.beginPath(); g.ellipse(x + s / 2, y + s * 0.9, w * 0.35, s * 0.07, 0, 0, 7); g.fill();
  g.save();
  if (face === -1) { g.translate(x + s, y); g.scale(-1, 1); } else g.translate(x, y);
  g.drawImage(spr, (s - w) / 2, s - hh - s * 0.08, w, hh);
  g.restore();
}

// ---- 关键帧：moves = [{t0,t1,from:[c,r],to:[c,r],anim?}]；t 在段外取端点站立 ----
function actorState(a, t) {
  const ms = a.moves || [];
  if (!ms.length) return { gx: a.at ? a.at[0] : 2, gy: a.at ? a.at[1] : 2, anim: a.anim || "stand", face: a.face || 1 };
  let seg = null, pos = null, anim = "stand";
  if (t < ms[0].t0) { pos = ms[0].from; }
  else {
    for (const m of ms) {
      if (t >= m.t0 && t < m.t1) {
        const k = m.t1 > m.t0 ? (t - m.t0) / (m.t1 - m.t0) : 1;
        pos = [m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k];
        anim = m.anim || (m.from[0] !== m.to[0] || m.from[1] !== m.to[1] ? "walk" : "stand");
        seg = m; break;
      }
    }
    if (!seg) { const last = ms[ms.length - 1]; pos = last.to; anim = last.rest || "stand"; }
  }
  // 朝向：由水平移动方向决定（沿用最后一段的方向）
  let face = a.face || 1;
  for (const m of ms) {
    if (m.from[0] !== m.to[0] && t >= m.t0) face = m.to[0] > m.from[0] ? 1 : -1;
    if (t < m.t0) break;
  }
  return { gx: pos[0], gy: pos[1], anim, face };
}
// 姿态键映射（body/legs 两层）
function animKeys(anim, t) {
  const f2 = Math.floor(t * 6) % 2;
  switch (anim) {
    case "walk": return { body: f2 ? "walk2" : "walk1", legs: f2 ? "walk2" : "walk1" };
    case "work": return { body: f2 ? "work2" : "work1", legs: "stand" };
    case "drink": return { body: f2 ? "drink2" : "drink1", legs: "stand" };
    case "eat": return { body: f2 ? "eat2" : "eat1", legs: "stand" };
    case "cheer": return { body: f2 ? "drink2" : "drink1", legs: "stand" };
    case "sleep": return { body: "sleep", legs: null };
    case "stumble": return { body: "stumble", legs: "stand" };
    default: return { body: "stand", legs: "stand" };
  }
}

// ---- 沙盘渲染：地形 → 桥链/落成 fx → 角色（动物在下、小人在上）→ 环/标签特效 ----
function dStage(g, W, H, st, t, actors, fxs) {
  const rows = st.rows, rowsN = rows.length, cols = rows[0].length;
  const cell = Math.min(W / cols, H / rowsN);
  const ox = (W - cell * cols) / 2, oy = (H - cell * rowsN) / 2;
  st._ox = ox; st._oy = oy; st._c = cell;
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = STAGE_TILES[rows[r][c]];
      if (!tile) continue;
      const x = ox + c * cell, y = oy + r * cell;
      if (tile === T.HOUSE) {
        g.drawImage(houseSprite(1, false, false, false), x, y + cell - 28 * (cell / 16), cell + 0.5, 28 * (cell / 16));
      } else if (STAGE_BUILDINGS.has(tile)) {
        g.drawImage(buildingSprite(tile, 0), x, y + cell - 24 * (cell / 16), cell + 0.5, 24 * (cell / 16));
      } else if (tile === T.WATER || tile === T.DEEP) {
        g.drawImage(waterSprite(tile, 2, 0, Math.floor(t * 2) % 4), x, y, cell + 0.5, cell + 0.5);
      } else {
        g.drawImage(tileSprite(tile, 2, 0), x, y, cell + 0.5, cell + 0.5);
      }
    }
  }
  // 特效（tiles 桥链在角色之下，建筑落成在角色之下）
  for (const f of (fxs || [])) {
    if (t < f.t0 || t > f.t1) continue;
    const at = f.at || [0, 0];
    if (f.type === "bridge") {
      const n = Math.min(f.to[0] - f.from[0], Math.floor((t - f.t0) / (f.interval || 0.7)) + 1);
      for (let i = 0; i <= n; i++) {
        const bx = ox + (f.from[0] + i) * cell, by = oy + f.from[1] * cell;
        g.drawImage(tileSprite(T.BRIDGE, 2, 0), bx, by, cell + 0.5, cell + 0.5);
      }
    } else if (f.type === "building") {
      const k = Math.min(1, (t - f.t0) / 0.5);
      const s2 = cell * (0.4 + 0.6 * k);
      g.drawImage(buildingSprite(f.tile, 0), ox + at[0] * cell, oy + at[1] * cell + cell - 24 * (s2 / 16), s2 + 0.5, 24 * (s2 / 16));
    }
  }
  // 角色：动物先画（小人在上）
  if (actors) {
    const order = actors.map((a, i) => i).sort((i, j) => (actors[i].kind === "man" ? 1 : 0) - (actors[j].kind === "man" ? 1 : 0));
    for (const i of order) {
      const a = actors[i];
      if (a.hideAt !== undefined && t >= a.hideAt) continue;
      if (a.showAt !== undefined && t < a.showAt) continue;
      const s = actorState(a, t);
      const px = ox + s.gx * cell, py = oy + s.gy * cell;
      const k = animKeys(s.anim, t);
      if (a.kind === "ship") {
        const spr = shipSprite(a.boat ? "boat" : "ship");
        const w = cell * (a.boat ? 1.5 : 1.9);
        g.drawImage(spr, px + cell * 0.5 - w / 2, py + cell * 0.18, w, w * spr.height / spr.width);
      } else if (a.kind === "man") {
        dMan2(g, px, py, cell, { look: a.look, sex: a.sex, body: k.body, legs: k.legs, face: s.face, phase: t, shirt: a.shirt });
      } else {
        dAnimal(g, a.type, px, py, cell, s.face);
      }
      if (a.kind === "man" && s.anim === "work" && Math.floor(t * 3) % 2) {
        g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(px + cell * 0.55, py - cell * 0.1, 3, 2);   // 施工火花
      }
    }
  }
  // 上层特效（环/标签/心/云/光圈/轮播高亮）
  for (const f of (fxs || [])) {
    if (t < f.t0 || t > f.t1) continue;
    const k = (t - f.t0) / Math.max(0.001, f.t1 - f.t0);
    if (f.type === "cycle") {
      const idx = Math.floor((t - f.t0) / (f.step || 0.75)) % f.pts.length;
      const p = f.pts[idx];
      const px = ox + p[0] * cell + cell / 2, py = oy + p[1] * cell + cell / 2;
      g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.6;
      g.beginPath(); g.arc(px, py, cell * 0.62, 0, 7); g.stroke();
      g.fillStyle = "#e8d9a0"; g.font = "bold 12px sans-serif"; g.textAlign = "center";
      g.fillText(p[2], W / 2, H - 8); g.textAlign = "left";
    } else {
      const ax = f.at ? ox + f.at[0] * cell : 0, ay = f.at ? oy + f.at[1] * cell : 0;
      if (f.type === "label") {
        g.fillStyle = f.color || "#e8d9a0"; g.font = "bold 11px sans-serif"; g.textAlign = "center";
        g.globalAlpha = Math.min(1, (1 - k) * 2.5);
        g.fillText(typeof f.text === "function" ? f.text(t) : f.text, ax + cell / 2, ay - 6 - k * 14);
        g.globalAlpha = 1; g.textAlign = "left";
      } else if (f.type === "ring") {
        const pr = typeof f.ratio === "function" ? f.ratio(t) : k;
        g.strokeStyle = "#e8c15a"; g.lineWidth = 3;
        g.beginPath(); g.arc(ax + cell / 2, ay, cell * 0.55, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); g.stroke();
        g.fillStyle = "#e8c15a"; g.font = "10px sans-serif"; g.textAlign = "center";
        g.fillText(Math.round(pr * 100) + "%", ax + cell / 2, ay - cell * 0.75); g.textAlign = "left";
      } else if (f.type === "heart") {
        g.fillStyle = "#e06a8a"; g.font = `${Math.round(cell * (0.5 + 0.25 * Math.sin(k * Math.PI)))}px sans-serif`;
        g.textAlign = "center"; g.fillText("♥", ax + cell / 2, ay - cell * 0.6); g.textAlign = "left";
      } else if (f.type === "cloud") {
        dCloud2(g, ax + cell / 2, ay - cell * 0.55, cell * 0.8);
      } else if (f.type === "reveal") {
        g.strokeStyle = `rgba(220,240,255,${0.6 * (1 - k)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(ax + cell / 2, ay + cell / 2, cell * (0.4 + k * f.r || 1), 0, 7); g.stroke();
      }
    }
  }
}

// ---- 演示主题（stage 迷你地图 + actors 角色 + fx 特效 + hud 覆盖层）----
const DEMO_TOPICS = [
  {
    id: "survival", name: "需求与生存", desc: "四维生命线 / 吃喝睡 / 生死线", dur: 14,
    steps: [
      { t: 0, text: "每个小人都有四条生命线：饱食、渴值、精力、心情——随时间与行为实时增减。" },
      { t: 4, text: "渴了走去找水井直饮（一口回满），饿了去粮仓吃饭，深夜精力见底就回家睡觉。" },
      { t: 9, text: "需求跌破警戒线有真实后果：脱水病倒、积劳成疾，60 秒不治会离世。" },
      { t: 12, text: "还有极小概率的意外：崖边失足、浅滩遇鲨、进食噎住——世界自有无常。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GHGGGGGGGGGEGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGWWWGGGGGGG",
      "GGGGGWWWGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 3, moves: [
        { t0: 0, t1: 3.5, from: [1, 2], to: [10, 2] },
        { t0: 3.5, t1: 5.5, from: [10, 2], to: [10, 2], anim: "drink" },
        { t0: 5.5, t1: 8, from: [10, 2], to: [5, 4] },
        { t0: 8, t1: 10.5, from: [5, 4], to: [5, 4], anim: "drink" },
        { t0: 10.5, t1: 13, from: [5, 4], to: [1, 2] },
        { t0: 13, t1: 14, from: [1, 2], to: [1, 2], anim: "sleep", rest: "sleep" },
      ] },
    ],
    fx: [
      { type: "label", t0: 3.8, t1: 5.4, at: [10, 1], text: "甘甜！渴值回满" },
      { type: "label", t0: 11, t1: 13, at: [1, 1], text: "🌙 夜深了，回家睡" },
      { type: "bar", t0: 0, t1: 14, at: [12, 4], ratio: t => t < 3.5 ? 1 - t * 0.18 : t < 5.5 ? 1 : 0.5 - (t - 8) * 0.03, color: "#4aa0c2", label: "渴值" },
    ],
    hud(g, W, H, t) {
      const bx = W * 0.58, bw = W * 0.34;
      dBar2(g, bx, H * 0.16, bw, 9, 0.5 + Math.sin(t * 0.7) * 0.45, "#6fae4e", "饱食");
      dBar2(g, bx, H * 0.34, bw, 9, 0.5 + Math.cos(t * 0.9) * 0.45, "#5a8fd0", "精力");
      dBar2(g, bx, H * 0.52, bw, 9, 0.8, "#e8c15a", "心情");
    },
  },
  {
    id: "mood", name: "心情与抑郁", desc: "工作磨人 / 喜好回甘 / 抑郁与走出", dur: 15,
    steps: [
      { t: 0, text: "心情值 0~100：工作最磨人（衰减 ×1.9），睡觉慢慢回神，随遇而安的人看得开。" },
      { t: 4, text: "做喜好匹配的事转快乐：向往远方的出海架桥、爱牲畜的牧羊驯兽、垂钓者的钓鱼。" },
      { t: 8, text: "喝酒 +30、果汁 +12、宴席全体 +25——心情低落时小人会主动去找乐子。" },
      { t: 11.5, text: "心情 <12 持续 → 抑郁（灰雨云）：什么都不想干；长期走不出会郁结成疾。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGRGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGTGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 5, moves: [
        { t0: 0, t1: 4, from: [3, 3], to: [3, 3], anim: "work" },
        { t0: 4, t1: 6, from: [3, 3], to: [4, 3] },
        { t0: 6, t1: 9.5, from: [4, 3], to: [4, 3], anim: "drink" },
        { t0: 9.5, t1: 12, from: [4, 3], to: [4, 3], rest: "stand" },
        { t0: 12, t1: 15, from: [4, 3], to: [8, 4] },
      ] },
      { kind: "animal", type: "goat", showAt: 4, hideAt: 9.5, at: [6, 3] },
    ],
    fx: [
      { type: "label", t0: 0.5, t1: 3.5, at: [3, 2], text: "搬砖使人心情 -0.6/s", color: "#d9915a" },
      { type: "label", t0: 6.5, t1: 9, at: [4, 2], text: "🍺 +30", color: "#e8c15a" },
      { type: "cloud", t0: 9.5, t1: 12.5, at: [4, 2] },
      { type: "label", t0: 9.7, t1: 12.3, at: [4, 1.2], text: "抑郁：什么都不想干…", color: "#9a8ba8" },
      { type: "label", t0: 12.3, t1: 14.5, at: [6, 3.5], text: "走出阴影，重新振作", color: "#6fae4e" },
      { type: "bar", t0: 0, t1: 15, at: [11, 4], ratio: t => t < 4 ? Math.max(0.1, 1 - t * 0.22) : t < 6 ? 0.35 : t < 9.5 ? Math.min(1, 0.5 + (t - 6) * 0.14) : t < 12 ? Math.max(0.08, 0.85 - (t - 9.5) * 0.3) : Math.min(1, 0.15 + (t - 12) * 0.2), color: "#e8c15a", label: "心情" },
    ],
  },
  {
    id: "drinks", name: "饮品链", desc: "水井→工坊→酒/汁/咖啡的效果", dur: 15,
    steps: [
      { t: 0, text: "水井落成后居民挑水入库——存水是整条饮品链的原料。" },
      { t: 4, text: "压榨坊榨果汁、酒坊酿麦酒、烘焙坊烘咖啡：各自消耗水 + 原料（果/粮/豆）。" },
      { t: 8.5, text: "喝麦酒微醺 40 秒（脚步飘、饿得慢）、咖啡提神 120 秒（精力耐用）、果汁回精力。" },
      { t: 12.5, text: "渴了自动找喝的：城库按「咖啡 > 果汁 > 麦酒 > 清水」优先取用，不挑不拣喝高阶。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGGCGRGOGGGGEGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGWWWGGGGGGG",
      "GGGGGWWWGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 8, moves: [
        { t0: 0, t1: 1.5, from: [12, 2], to: [12, 2], anim: "drink" },
        { t0: 1.5, t1: 4, from: [12, 2], to: [3, 2] },
        { t0: 4, t1: 7, from: [3, 2], to: [3, 2], anim: "work" },
        { t0: 7, t1: 9, from: [3, 2], to: [5, 2] },
        { t0: 9, t1: 11.5, from: [5, 2], to: [5, 2], anim: "work" },
        { t0: 11.5, t1: 13.5, from: [5, 2], to: [7, 2] },
        { t0: 13.5, t1: 15, from: [7, 2], to: [7, 2], anim: "work" },
      ] },
    ],
    fx: [
      { type: "label", t0: 0.2, t1: 1.4, at: [12, 1], text: "💧 打水入库" },
      { type: "label", t0: 4.2, t1: 6.8, at: [3, 1], text: "🧃 果汁 = 水1+粮2" },
      { type: "label", t0: 9.2, t1: 11.3, at: [5, 1], text: "🍺 麦酒 = 水1+粮3" },
      { type: "label", t0: 13.7, t1: 15, at: [7, 1], text: "☕ 咖啡 = 水1+豆2" },
      { type: "bar", t0: 0, t1: 15, at: [11, 4], ratio: t => Math.min(1, 0.3 + t * 0.05), color: "#4aa0c2", label: "城库存水" },
    ],
  },
  {
    id: "jobs", name: "职业与任务", desc: "规划立项 → 领任务 → 施工入库 → 转职", dur: 15,
    steps: [
      { t: 0, text: "规划署每 4 秒聚合需求自动立项：缺房建房、缺粮开荒、缺木伐木、缺水挖塘。" },
      { t: 4.5, text: "小人按职业优先领任务（农夫开荒、工匠建造……），远任务会老化插队不吃亏。" },
      { t: 9, text: "产出先进随身背包（haul 槽），走回仓库入库——名册里的数字永远是仓库里的。" },
      { t: 12.5, text: "劳动力市场：活计干完太久会自动转职，社会永远缺什么补什么。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GHGGGGGGGGGGHGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGG!GGTGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGFFGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 11, moves: [
        { t0: 0, t1: 3, from: [1, 2], to: [6, 2] },
        { t0: 3, t1: 8, from: [6, 2], to: [6, 2], anim: "work" },
        { t0: 8, t1: 10.5, from: [6, 2], to: [12, 2] },
        { t0: 10.5, t1: 12, from: [12, 2], to: [12, 2], rest: "stand" },
        { t0: 12, t1: 15, from: [12, 2], to: [6, 2] },
      ] },
    ],
    fx: [
      { type: "ring", t0: 3, t1: 8, at: [6, 2], ratio: t => Math.min(1, (t - 3) / 5) },
      { type: "label", t0: 8.2, t1: 10.3, at: [8, 2], text: "🪵 木材×6 入包（回仓入库中）" },
      { type: "label", t0: 10.7, t1: 12, at: [12, 1], text: "✓ 入库" },
      { type: "bar", t0: 3, t1: 15, at: [10, 4.6], ratio: t => t < 8 ? (t - 3) / 5 : t < 10.5 ? 1 : 1, color: "#e8a13b", label: "工程进度" },
      { type: "bar", t0: 8, t1: 15, at: [10, 5.4], ratio: t => t < 8 ? 0 : t < 10.5 ? (t - 8) / 2.5 : 0, color: "#6fae4e", label: "背包 haul 槽（入库后清空）" },
    ],
  },
  {
    id: "voyage", name: "航海探索", desc: "码头出海 / 点亮虚空 / 登岛命名 / 救援", dur: 16,
    steps: [
      { t: 0, text: "码头（era≥1）建成即开启航海时代——探险家们的浪漫从这里起航。" },
      { t: 4, text: "消耗木材造船出海：船带粮草，沿途每 2 秒点亮一片虚空，地图向星辰推进。" },
      { t: 8.5, text: "触碰陆地即下船：第一个登岛的人为岛屿命名，命名即定居化（粮仓+房屋+农田）。" },
      { t: 12.5, text: "船可以穿过桥；补给耗尽会被困呼救——存粮足够时全城自动派出救援船。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGGGDDDDDDDDGGG",
      "GGKDDDDDDDDDHGG",
      "GGGDDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
    ] },
    actors: [
      { kind: "ship", moves: [
        { t0: 1, t1: 8, from: [3.2, 2.4], to: [10.6, 2.4] },
        { t0: 8, t1: 16, from: [10.6, 2.4], to: [10.6, 2.4], rest: "stand" },
      ] },
      { kind: "man", look: 2, showAt: 9.5, moves: [
        { t0: 9.5, t1: 11, from: [11.5, 2], to: [12.3, 2] },
        { t0: 11, t1: 16, from: [12.3, 2], to: [12.3, 2], rest: "stand" },
      ] },
    ],
    fx: [
      { type: "reveal", t0: 4, t1: 5.4, at: [5, 2.4], r: 2.2 },
      { type: "reveal", t0: 6, t1: 7.4, at: [7, 2.4], r: 2.4 },
      { type: "reveal", t0: 8, t1: 9.4, at: [9, 2.6], r: 2.6 },
      { type: "label", t0: 10, t1: 16, at: [12, 1], text: "「云岚屿」— 第一个登岛的人为它命名", color: "#e8d9a0" },
      { type: "bar", t0: 0, t1: 16, at: [10, 4.6], ratio: t => Math.max(0, 1 - t / 26), color: "#6fae4e", label: "船载粮草（耗尽会被困呼救）" },
    ],
  },
  {
    id: "bridges", name: "岛际大桥", desc: "命名岛连线 · 深海架桥 · 链式贯通", dur: 13,
    steps: [
      { t: 0, text: "已命名的邻近岛屿（中心距 ≤50）之间，规划署会立项跨海大桥。" },
      { t: 3, text: "沿两岛中心连线逐格架桥——浅海架桥，深海也架桥，绝不填海绕路。" },
      { t: 8, text: "桥一格接一格生长（链式 corridor），直到踏上对岸——两岛从此陆路相通。" },
    ],
    stage: { rows: [
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
      "GGGGDDDDDDDDGGG",
    ] },
    actors: [
      { kind: "man", look: 4, showAt: 8.5, moves: [
        { t0: 8.5, t1: 12, from: [3, 3], to: [12, 3] },
        { t0: 12, t1: 13, from: [12, 3], to: [12, 3], rest: "stand" },
      ] },
    ],
    fx: [
      { type: "bridge", t0: 2, t1: 8.4, from: [4, 3], to: [11, 3], interval: 0.6 },
      { type: "label", t0: 0.2, t1: 12.8, at: [1, 1], text: "测试西岛", color: "#e8d9a0" },
      { type: "label", t0: 0.2, t1: 12.8, at: [12, 1], text: "测试东岛", color: "#e8d9a0" },
      { type: "label", t0: 12.2, t1: 13, at: [7, 1.6], text: "贯通！两岛陆路相通", color: "#6fae4e" },
    ],
  },
  {
    id: "ranch", name: "畜牧与渔场", desc: "围栏留门 / 驯狗认主 / 渔船起网", dur: 15,
    steps: [
      { t: 0, text: "牧场围栏圈地——但必留一道门：牲畜会自己出门，在附近溜达再回家。" },
      { t: 4, text: "圈养牛羊定期产粮 +2、缓慢繁衍；喜爱牲畜的居民在旁陪伴还能加速。" },
      { t: 8, text: "驯化：在小人身边停留 3 秒（喜爱牲畜 ×2 速率）——野犬、独角兽都会认定主人，驯服瞬间开心大涨。" },
      { t: 12, text: "水生动物不进陆上牧场：鱼群圈进水域渔场，渔船近海起网满舱回港。狼捕野羊——自然自有生态。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGNNNGGGGGTGGGG",
      "GGNPNNGGGGGGGGG",
      "GGNANNGGGGGGGGG",
      "GGNNNGGGGGGGGGG",
      "GGGGGGGGGGWWWWW",
      "GGGGGGGGGGWWWWW",
    ] },
    actors: [
      { kind: "animal", type: "cow", moves: [
        { t0: 0, t1: 3, from: [3, 2], to: [3.4, 2.3] },
        { t0: 3, t1: 6, from: [3.4, 2.3], to: [3, 2] },
        { t0: 6, t1: 9, from: [3, 2], to: [3.3, 2.2] },
        { t0: 9, t1: 15, from: [3.3, 2.2], to: [3, 2] },
      ] },
      { kind: "animal", type: "goat", moves: [
        { t0: 0, t1: 3, from: [3, 3], to: [3, 3], anim: "stand" },
        { t0: 3, t1: 5, from: [3, 3], to: [3, 4.6] },
        { t0: 5, t1: 8, from: [3, 4.6], to: [5, 4.8] },
        { t0: 8, t1: 11, from: [5, 4.8], to: [5, 4.8], anim: "stand" },
        { t0: 11, t1: 15, from: [5, 4.8], to: [3, 3] },
      ] },
      { kind: "animal", type: "dog", moves: [
        { t0: 0, t1: 5, from: [6.5, 2], to: [7, 2.2] },
        { t0: 5, t1: 10.5, from: [7, 2.2], to: [7, 2.2], rest: "stand" },
        { t0: 10.5, t1: 14, from: [7, 2.2], to: [4.5, 4.5] },
        { t0: 14, t1: 15, from: [4.5, 4.5], to: [4.5, 4.5], rest: "stand" },
      ] },
      { kind: "man", look: 7, moves: [
        { t0: 0, t1: 5, from: [8.5, 1], to: [6.2, 2] },
        { t0: 5, t1: 10.5, from: [6.2, 2], to: [6.2, 2], rest: "stand" },
        { t0: 10.5, t1: 14, from: [6.2, 2], to: [4, 4.5] },
        { t0: 14, t1: 15, from: [4, 4.5], to: [4, 4.5], rest: "stand" },
      ] },
      { kind: "ship", boat: true, moves: [
        { t0: 0, t1: 6, from: [11, 5.3], to: [13, 5.3] },
        { t0: 6, t1: 12, from: [13, 5.3], to: [11, 5.3] },
        { t0: 12, t1: 15, from: [11, 5.3], to: [13, 5.3] },
      ] },
      { kind: "animal", type: "fish", at: [12, 5.6] },
    ],
    fx: [
      { type: "label", t0: 0.3, t1: 3, at: [3, 1.2], text: "围栏留了一道门", color: "#e8c15a" },
      { type: "label", t0: 3.4, t1: 5, at: [3, 4.4], text: "自己出门溜达" },
      { type: "ring", t0: 5.5, t1: 10.5, at: [7, 2.2], ratio: t => Math.min(1, (t - 5.5) / 4) },
      { type: "label", t0: 5.5, t1: 10.5, at: [7, 1.2], text: "驯化中（喜爱牲畜 ×2 速率）" },
      { type: "heart", t0: 10.5, t1: 11.5, at: [7, 2.2] },
      { type: "label", t0: 10.6, t1: 13, at: [7, 1.2], text: "认主！驯服的喜悦 +15（独角兽 +25）", color: "#e06a8a" },
      { type: "label", t0: 12.2, t1: 14.8, at: [5.5, 3.6], text: "狗狗终生跟随主人" },
    ],
  },
  {
    id: "species", name: "物种图鉴", desc: "17+ 种生灵按栖息地轮番亮相", dur: 17,
    steps: [
      { t: 0, text: "群岛栖居着 17 种生灵：草地、沙滩、林缘、浅海、深海、天空各有其主。" },
      { t: 2, text: "普通生灵可猎可捕；珍稀物种（独角兽/月光鱼/锦鲤/凤凰/仙龙/人鱼）可遇不可求。" },
      { t: 8, text: "独角兽可以驯化认主（+25 心情）；月光鱼与锦鲤可垂钓（钓到开心大涨）。" },
      { t: 13, text: "一切生物都会老去：分栖息地繁衍、超龄离世——种群永续，不必担心猎绝。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGTGGGGGGGGGTGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGSSSGGGGGGGGGG",
      "GGSSSGWWWWWDDDD",
      "GGSSSGWWWWWDDDD",
    ] },
    actors: [
      { kind: "animal", type: "cow", at: [1, 3] },
      { kind: "animal", type: "goat", at: [3, 3] },
      { kind: "animal", type: "rabbit", at: [4.5, 2.2] },
      { kind: "animal", type: "horse", at: [7, 3] },
      { kind: "animal", type: "deer", at: [5.5, 3] },
      { kind: "animal", type: "boar", at: [2, 1.6] },
      { kind: "animal", type: "wolf", at: [10, 2] },
      { kind: "animal", type: "fox", at: [3, 2] },
      { kind: "animal", type: "bear", at: [12, 1.8] },
      { kind: "animal", type: "dog", at: [8, 2.2] },
      { kind: "animal", type: "unicorn", at: [13.5, 3] },
      { kind: "animal", type: "penguin", at: [2, 4.3] },
      { kind: "animal", type: "crab", at: [3.5, 4.4] },
      { kind: "animal", type: "fish", at: [7.5, 5.5] },
      { kind: "animal", type: "turtle", at: [9, 5.5] },
      { kind: "animal", type: "dolphin", at: [10.5, 5.4] },
      { kind: "animal", type: "koi", at: [8, 6.4] },
      { kind: "animal", type: "mermaid", at: [10, 6.4] },
      { kind: "animal", type: "shark", at: [13, 5.4] },
      { kind: "animal", type: "moonfish", at: [12.5, 6.4] },
      { kind: "animal", type: "whale", at: [14, 5.8] },
      { kind: "animal", type: "phoenix", at: [6, -0.7] },
      { kind: "animal", type: "fairy", at: [9, -0.6] },
      { kind: "animal", type: "bird", at: [3.5, -0.5] },
    ],
    fx: [
      { type: "cycle", t0: 0, t1: 17, step: 0.75, pts: [
        [1, 3, "牛 · 可猎+8"], [3, 3, "羊 · 可猎+5"], [4.5, 2.2, "兔 · 可猎+2"], [7, 3, "马"], [5.5, 3, "鹿 · 可猎+4"],
        [2, 1.6, "野猪 · 可猎+6"], [10, 2, "狼 · 捕食野羊"], [3, 2, "狐 · 可猎+3"], [12, 1.8, "熊 · 可猎+10"], [8, 2.2, "狗 · 可驯化+15"],
        [13.5, 3, "独角兽 · 珍稀可驯化+25"], [2, 4.3, "企鹅"], [3.5, 4.4, "蟹 · 可猎+1"],
        [7.5, 5.5, "鱼群 · 可圈养"], [9, 5.5, "海龟"], [10.5, 5.4, "海豚 · 追随航船"], [8, 6.4, "锦鲤 · 珍稀可钓+15"], [10, 6.4, "人鱼 · 珍稀"],
        [13, 5.4, "鲨"], [12.5, 6.4, "月光鱼 · 珍稀可钓+25"], [14, 5.8, "鲸"],
        [6, -0.7, "凤凰 · 珍稀"], [9, -0.6, "小仙龙 · 珍稀"], [3.5, -0.5, "鸟"],
      ] },
    ],
  },
  {
    id: "fate", name: "意外与死亡", desc: "老死病亡 / 意外 / 全屏讣告", dur: 14,
    steps: [
      { t: 0, text: "生命有尽头：老死（60 岁后概率渐增）、饥饿/力竭/脱水病倒、抑郁郁郁而终。" },
      { t: 5, text: "还有极小概率的世界无常：崖边失足（1/20000 每秒）、浅滩遇鲨、进食噎住。" },
      { t: 9, text: "被视角跟随的居民去世 → 全屏讣告：姓名、死因、享年、地点与时刻，点击致哀。" },
      { t: 12, text: "死者长已矣——名册静默更新，房屋与任务释放，世界继续向前。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGGGGLLLGGGGGGG",
      "GGGGGGGGGGGDDGG",
      "GGGGGGGGGGGDDGG",
      "GGGGGGGGGGGDDGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 9, hideAt: 5.2, moves: [
        { t0: 0, t1: 3, from: [4, 2], to: [5.6, 2] },
        { t0: 3, t1: 5.2, from: [5.6, 2], to: [5.9, 2], anim: "stumble" },
      ] },
      { kind: "man", look: 12, hideAt: 9.2, moves: [
        { t0: 0, t1: 6, from: [8, 3], to: [9.5, 3] },
        { t0: 6, t1: 9.2, from: [9.5, 3], to: [9.5, 3], rest: "stand" },
      ] },
      { kind: "animal", type: "shark", showAt: 5.5, hideAt: 9.4, moves: [
        { t0: 5.5, t1: 9, from: [12, 3.4], to: [10, 3.1] },
      ] },
    ],
    fx: [
      { type: "label", t0: 0.3, t1: 4.8, at: [5.6, 1.2], text: "1/20000 每秒：崖边失足", color: "#d9915a" },
      { type: "label", t0: 5.3, t1: 7.5, at: [5.8, 2], text: "✕ 坠落…当场身亡", color: "#c96a6a" },
      { type: "label", t0: 6, t1: 8.8, at: [9.5, 2.2], text: "浅滩戏水…鲨鱼逼近", color: "#d9915a" },
      { type: "label", t0: 9, t1: 11, at: [9.5, 2], text: "✕ 被拖下了水", color: "#c96a6a" },
    ],
    hud(g, W, H, t) {
      if (t >= 9.5) {
        g.fillStyle = "rgba(26,13,15,0.94)"; g.fillRect(W * 0.3, H * 0.14, W * 0.44, H * 0.52);
        g.strokeStyle = "#7a3a3a"; g.strokeRect(W * 0.3, H * 0.14, W * 0.44, H * 0.52);
        g.fillStyle = "#c96a6a"; g.font = "11px sans-serif"; g.textAlign = "center";
        g.fillText("讣 告", W * 0.52, H * 0.24);
        g.fillStyle = "#f0e6d0"; g.font = "15px sans-serif"; g.fillText("张 川", W * 0.52, H * 0.34);
        g.fillStyle = "#b8a89a"; g.font = "10px sans-serif";
        g.fillText("在崖边失足坠落，当场身亡（享年 34 岁）", W * 0.52, H * 0.43);
        g.fillText("卒于 主岛城 · 第3年第7月 14:20", W * 0.52, H * 0.5);
        g.fillStyle = "#5f5a58"; g.fillText("—— 被跟随的居民去世，讣告昭告全境 ——", W * 0.52, H * 0.6);
        g.textAlign = "left";
      }
    },
  },
  {
    id: "park", name: "娱乐与游乐园", desc: "凉亭戏台斗兽场 / 海上浮台游乐园", dur: 16,
    steps: [
      { t: 0, text: "时代进步带来娱乐：凉亭（era1）小憩、戏台与斗兽场（era2）看戏观演。" },
      { t: 5, text: "文明时代（era3·人口 16）建游乐园——选址陆地 3×3 草地，也可以是海上浮台园区。" },
      { t: 9.5, text: "摩天轮、旋转木马、过山车在园区内逐个立起。" },
      { t: 13, text: "尽兴而归：心情 +35，余韵 300 秒内衰减 ×0.35——这一份开心，很持久。" },
    ],
    stage: { rows: [
      "GGGGGGGGGGGGGGG",
      "GGGGWIWIWGGGGGG",
      "GVXZIIMIWGGGGGG",
      "GGGGWIWIWGGGGGG",
      "GGGGWWWWWWGGGGG",
      "GGGGGGGGGGGGGGG",
      "GGGGGGGGGGGGGGG",
    ] },
    actors: [
      { kind: "man", look: 15, moves: [
        { t0: 0, t1: 3.5, from: [1, 4], to: [6, 2.5] },
        { t0: 3.5, t1: 6, from: [6, 2.5], to: [6, 2.5], rest: "stand" },
        { t0: 6, t1: 10, from: [6, 2.5], to: [6, 2.5], anim: "cheer" },
        { t0: 10, t1: 14, from: [6, 2.5], to: [6, 2.5], rest: "stand" },
        { t0: 14, t1: 16, from: [6, 2.5], to: [2, 4] },
      ] },
    ],
    fx: [
      { type: "label", t0: 0.3, t1: 4.8, at: [1, 1], text: "+12" },
      { type: "label", t0: 1.1, t1: 4.8, at: [2, 1], text: "+18" },
      { type: "label", t0: 2, t1: 4.8, at: [3, 1], text: "+20" },
      { type: "building", t0: 5.5, t1: 16, tile: T.FERRIS, at: [5, 1] },
      { type: "building", t0: 7, t1: 16, tile: T.CAROUSEL, at: [7, 1] },
      { type: "building", t0: 9.5, t1: 16, tile: T.COASTER, at: [6, 3] },
      { type: "label", t0: 6.2, t1: 9.8, at: [6, 1.6], text: "游玩中 ♪♪", color: "#e8c15a" },
      { type: "label", t0: 10, t1: 12.8, at: [6, 1.6], text: "尽兴而归！心情 +35", color: "#6fae4e" },
      { type: "bar", t0: 0, t1: 16, at: [10, 4.6], ratio: t => t < 6 ? Math.max(0.1, 0.6 - t * 0.06) : t < 10 ? Math.min(1, 0.3 + (t - 6) * 0.18) : Math.max(0.55, 1 - (t - 10) * 0.05), color: "#e8c15a", label: "心情（余韵期衰减 ×0.35）" },
    ],
  },
];

// ---- 播放器状态与驱动 ----
const DEMO_DONE = new Set();      // 已看完的主题 id（菜单打勾，内存态）
let demoState = null;             // { topic, t, speed, done, cv, g }
let demoLastSpeed = 1;            // 跨主题切换保持倍速

function demoRefreshMenu() {
  const listEl = document.getElementById("demo-list");
  if (!listEl) return;
  listEl.innerHTML = DEMO_TOPICS.map(tp => {
    const playing = demoState && demoState.topic.id === tp.id;
    return `<div class="demo-item${playing ? " selected" : ""}" data-demo="${tp.id}">` +
      `<span class="di-name">${DEMO_DONE.has(tp.id) ? "✓ " : playing ? "▶ " : ""}${tp.name}</span>` +
      `<span class="di-desc">${tp.desc}</span></div>`;
  }).join("");
}

// 点击菜单即打断当前演示、立刻切换（t 归零、速度沿用上次选择）
function demoStart(id) {
  const tp = DEMO_TOPICS.find(k => k.id === id);
  if (!tp) return;
  demoState = { topic: tp, t: 0, speed: demoLastSpeed, done: false };
  const cv = document.getElementById("demo-cv");
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  demoState.cv = cv; demoState.g = g;
  const wEl = document.getElementById("demo-welcome");
  if (wEl) wEl.classList.add("hidden");
  demoRefreshMenu();
}

// 主循环每帧调用（realDt 真实秒；主世界此时已被暂停）
function demoTick(realDt) {
  if (!demoState) return;
  const d = demoState;
  if (!d.done) d.t += realDt * d.speed;
  if (!d.done && d.t >= d.topic.dur) {
    d.done = true;
    DEMO_DONE.add(d.topic.id);
    demoRefreshMenu();
  }
  const { g, cv, topic } = d;
  const W = cv.width, H = cv.height;
  g.fillStyle = "#0a0e16"; g.fillRect(0, 0, W, H);
  const tt = Math.min(d.t, topic.dur);
  if (topic.stage) dStage(g, W, H, topic.stage, tt, topic.actors, topic.fx);
  if (topic.hud) topic.hud(g, W, H, tt);
  const capEl = document.getElementById("demo-caption");
  if (d.done) {
    capEl.textContent = "✓ 当前机制演示完毕（点左侧换一个，或「↻ 重播」再看一遍）";
    capEl.classList.add("done");
  } else {
    let text = topic.steps[0].text;
    for (const st of topic.steps) if (d.t >= st.t) text = st.text;
    capEl.textContent = text;
    capEl.classList.remove("done");
  }
  document.getElementById("demo-prog").textContent = Math.min(100, Math.round(d.t / topic.dur * 100)) + "%";
}

// 打开面板时的欢迎底图（未开始任何演示时右侧沙盘的静态画面）
function demoWelcome() {
  const cv = document.getElementById("demo-cv");
  if (!cv) return;
  const g = cv.getContext("2d");
  g.fillStyle = "#0a0e16"; g.fillRect(0, 0, cv.width, cv.height);
  const first = DEMO_TOPICS[0];
  if (first && first.stage) dStage(g, cv.width, cv.height, first.stage, 1, first.actors, first.fx);
  g.fillStyle = "rgba(4,6,12,0.66)"; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#e8d9a0"; g.font = "13px sans-serif"; g.textAlign = "center";
  g.fillText("点击左侧任意机制，开始演示", cv.width / 2, cv.height / 2 - 8);
  g.fillStyle = "#8a93a8"; g.font = "11px sans-serif";
  g.fillText("（主世界将暂停，关闭弹窗后恢复）", cv.width / 2, cv.height / 2 + 14);
  g.textAlign = "left";
  const wEl = document.getElementById("demo-welcome");
  if (wEl) wEl.classList.remove("hidden");
}
