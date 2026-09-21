"use strict";
// ============ 机制演示引擎（v0.6.0）============
// 脚本化演示：每个机制一段时间轴（分步文案 + 画布绘制回调）。播放时主世界暂停（main.js 负责
// setSpeed(0)/恢复），演示自身可倍速（0.5/1/2/4×），播完提示「当前机制演示完毕」并打勾标记。
// 绘制复用全局 sprite 图集（本文件拼接在 sprites/render 之后、main 之前；DOM 只在打开弹窗时触碰）。

// ---- 绘制小工具（棋盘格场景拼贴 + 分层小人）----
function dTileAt(g, tile, x, y, s) {
  g.drawImage(tileSprite(tile, 2, 0), x, y, s + 0.5, s + 0.5);
}
function dWaterRow(g, x, y, n, s) {
  for (let i = 0; i < n; i++) g.drawImage(waterSprite(T.WATER, 2, 0, 0), x + i * s, y, s + 0.5, s + 0.5);
}
// 分层小人（影子+腿+身+头），view 固定正面；poseKey 取 sprites 姿态键
function dMan(g, x, y, s, opts) {
  const o = opts || {};
  const sex = o.sex || "m";
  const view = o.view || "front";
  const key = o.key || "stand";
  const shirt = o.shirt || "#7a92c4";
  const k = s / 16;
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.beginPath(); g.ellipse(x + s / 2, y + s * 0.95, s * 0.3, s * 0.1, 0, 0, 7); g.fill();
  const bob = (key === "walk1" || key === "walk2") ? Math.abs(Math.sin((o.phase || 0) * 9)) * s * 0.06 : 0;
  const px = x, py = y - bob;
  if (key !== "sleep") g.drawImage(agentPantsSprite(0, key === "work1" || key === "work2" ? "stand" : key, sex, 0, view === "side" ? "side" : "vert"), px, py, s + 0.5, s + 0.5);
  g.drawImage(agentBodySprite(shirt, key, sex, view), px, py, s + 0.5, s + 0.5);
  g.drawImage(agentHeadSprite(0, "short", "#4a3220", sex, !!o.native, view), px, py, s + 0.5, s + 0.5);
}
function dCreature(g, type, x, y, s, view) {
  const meta = CREATURE_META[type];
  const spr = creatureSprite(type, 0, view || "side");
  const w = Math.max(8, s * 0.8 * meta.size);
  const hh = w * spr.height / spr.width;
  g.drawImage(spr, x + (s - w) / 2, y + s - hh - s * 0.08, w, hh);
}
function dBuilding(g, tile, x, y, s) {
  g.drawImage(buildingSprite(tile, 0), x, y + s - 24 * (s / 16), s + 0.5, 24 * (s / 16));
}
// 状态条
function dBar(g, x, y, w, h, ratio, color, label) {
  g.fillStyle = "#1c2333"; g.fillRect(x, y, w, h);
  g.fillStyle = color; g.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h);
  g.strokeStyle = "#2a3448"; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) { g.fillStyle = "#8a93a8"; g.font = "9px sans-serif"; g.fillText(label, x, y - 2); }
}
// 云朵（抑郁标记）
function dCloud(g, x, y, s) {
  g.fillStyle = "rgba(150,160,180,0.9)";
  g.beginPath();
  g.arc(x, y, s * 0.28, 0, 7); g.arc(x + s * 0.3, y - s * 0.1, s * 0.22, 0, 7); g.arc(x - s * 0.3, y - s * 0.08, s * 0.2, 0, 7);
  g.fill();
}

// ---- 演示主题（时间轴 + 分步文案 + 绘制回调；t = 演示秒，已乘倍速）----
const DEMO_TOPICS = [
  {
    id: "survival", name: "需求与生存", desc: "饱食/渴值/精力/心情四维与生死线", dur: 14,
    steps: [
      { t: 0, text: "每个小人都有四条生命线：饱食、渴值、精力、心情——随时间与行为实时增减。" },
      { t: 4.5, text: "饿了去粮仓吃饭，渴了找水井河湖直饮，深夜精力见底就回家睡觉。" },
      { t: 9, text: "需求跌破警戒线有真实后果：脱水病倒、积劳成疾，60 秒不治会离世。" },
      { t: 12.5, text: "还有极小概率的意外：崖边失足、浅滩遇鲨、进食噎住——世界自有无常。" },
    ],
    draw(g, W, H, t) {
      const s = 26;
      dWaterRow(g, W * 0.06, H * 0.62, 3, s);
      dTileAt(g, T.GRASS, W * 0.32, H * 0.62, s); dTileAt(g, T.GRASS, W * 0.32 + s, H * 0.62, s);
      const walkPhase = (t * 0.6) % 1;
      const mx = W * 0.36 + walkPhase * s * 2 - s;
      dMan(g, mx, H * 0.62 - s * 0.55, s, { key: t % 2 < 1 ? "walk1" : "walk2", phase: t * 2 });
      dTileAt(g, T.WELL, W * 0.08, H * 0.62 - s, s);
      dBuilding(g, T.BREWERY, W * 0.06, H * 0.62 - s * 0.4, s);
      const bx = W * 0.58, bw = W * 0.34;
      dBar(g, bx, H * 0.18, bw, 9, 0.5 + Math.sin(t * 0.7) * 0.45, "#6fae4e", "饱食");
      dBar(g, bx, H * 0.34, bw, 9, 0.5 + Math.cos(t * 0.9) * 0.45, "#4aa0c2", "渴值");
      dBar(g, bx, H * 0.50, bw, 9, t % 8 < 4 ? 0.25 : 0.85, "#5a8fd0", "精力");
      dBar(g, bx, H * 0.66, bw, 9, 0.8, "#e8c15a", "心情");
    },
  },
  {
    id: "mood", name: "心情与抑郁", desc: "工作磨人 / 喜好回甘 / 抑郁与走出", dur: 15,
    steps: [
      { t: 0, text: "心情值 0~100：工作最磨人（衰减 ×1.9），睡觉慢慢回神，随遇而安的人看得开。" },
      { t: 4, text: "做喜好匹配的事转快乐：向往远方的出海架桥、爱牲畜的牧羊、垂钓者钓鱼、恋家的守家。" },
      { t: 8, text: "喝酒 +30、果汁 +12、宴席全体 +25——心情低落时小人会主动去找乐子。" },
      { t: 11.5, text: "心情 <12 持续 → 抑郁（灰雨云）：什么都不想干；长期走不出会郁结成疾，甚至郁郁而终。" },
    ],
    draw(g, W, H, t) {
      const s = 30;
      dTileAt(g, T.GRASS, W * 0.1, H * 0.55, s); dTileAt(g, T.GRASS, W * 0.1 + s, H * 0.55, s);
      if (t < 4) {
        dMan(g, W * 0.12, H * 0.55 - s * 0.6, s, { key: t % 1 < 0.5 ? "work1" : "work2", shirt: "#ff9f43" });
        if (t > 1.5 && Math.floor(t * 3) % 2) { g.fillStyle = "#fff"; g.fillRect(W * 0.16, H * 0.55 - s * 1.1, 3, 2); }
      } else if (t < 8) {
        dMan(g, W * 0.12, H * 0.55 - s * 0.6, s, { key: "stand" });
        dCreature(g, "goat", W * 0.24, H * 0.55 - s * 0.3, s);
        g.fillStyle = "#e8c15a"; g.font = "12px sans-serif"; g.fillText("♪ 做喜欢的事", W * 0.14, H * 0.42);
      } else if (t < 11.5) {
        dMan(g, W * 0.12, H * 0.55 - s * 0.6, s, { key: Math.floor(t * 2) % 2 ? "drink2" : "drink1" });
        dBuilding(g, T.BREWERY, W * 0.24, H * 0.55 - s * 0.4, s);
        g.fillStyle = "#e8a13b"; g.font = "12px sans-serif"; g.fillText("🍺 +30", W * 0.15, H * 0.4);
      } else {
        dMan(g, W * 0.12, H * 0.55 - s * 0.6, s, { key: "stand", shirt: "#8fa3e8" });
        dCloud(g, W * 0.15 + s * 0.5, H * 0.55 - s * 1.05, s);
      }
      const drop = t < 4 ? Math.max(0.15, 1 - t * 0.2) : t < 8 ? 0.4 + (t - 4) * 0.1 : t < 11.5 ? Math.min(1, 0.7 + (t - 8) * 0.1) : Math.max(0.05, 0.9 - (t - 11.5) * 0.2);
      dBar(g, W * 0.55, H * 0.3, W * 0.36, 12, drop, drop < 0.25 ? "#9a8ba8" : "#e8c15a", "心情 " + Math.round(drop * 100));
      dBar(g, W * 0.55, H * 0.5, W * 0.36, 9, 0.9 - (t % 5) * 0.15, "#6fae4e", "饱食（对照：正常增减）");
    },
  },
  {
    id: "drinks", name: "饮品链", desc: "水井→工坊→酒/汁/咖啡的效果", dur: 15,
    steps: [
      { t: 0, text: "水井落成后居民挑水入库——存水是整条饮品链的原料。" },
      { t: 4, text: "压榨坊榨果汁、酒坊酿麦酒、烘焙坊烘咖啡：各自消耗水 + 原料（果/粮/豆）。" },
      { t: 8.5, text: "喝麦酒微醺 40 秒（脚步飘、饿得慢）、咖啡提神 120 秒（精力耐用）、果汁回精力。" },
      { t: 12.5, text: "渴了自动找喝的：城库按「咖啡 > 果汁 > 麦酒 > 清水」优先取用，不挑不拣喝高阶。" },
    ],
    draw(g, W, H, t) {
      const s = 24;
      dTileAt(g, T.WELL, W * 0.1, H * 0.5, s);
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif"; g.fillText("水井", W * 0.11, H * 0.5 - 4);
      dBuilding(g, T.PRESS, W * 0.32, H * 0.42, s);
      dBuilding(g, T.BREWERY, W * 0.5, H * 0.42, s);
      dBuilding(g, T.ROASTERY, W * 0.68, H * 0.42, s);
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText("压榨坊", W * 0.33, H * 0.42 - 30 * (s / 16) + 26); g.fillText("酒坊", W * 0.52, H * 0.42 - 30 * (s / 16) + 26); g.fillText("烘焙坊", W * 0.69, H * 0.42 - 30 * (s / 16) + 26);
      dWaterRow(g, W * 0.08, H * 0.78, 12, s);
      dMan(g, W * 0.42 + (t % 6) * s * 0.8, H * 0.78 - s * 0.6, s * 0.9, { key: t % 2 < 1 ? "walk1" : "walk2", phase: t * 2, view: "side" });
      const label = t < 4 ? "💧 打水入库" : t < 8.5 ? "🧃🍺☕ 三坊开工" : t < 12.5 ? "🍺 微醺 ×0.65 移速   ☕ 提神 ×0.55 耗力" : "咖啡 > 果汁 > 麦酒 > 清水";
      g.fillStyle = "#e8d9a0"; g.font = "12px sans-serif"; g.fillText(label, W * 0.08, H * 0.2);
      dBar(g, W * 0.08, H * 0.3, W * 0.5, 10, Math.min(1, t / 10), "#4aa0c2", "渴值（喝一口回满 100）");
    },
  },
  {
    id: "jobs", name: "职业与任务", desc: "规划立项 → 领任务 → 施工入库 → 转职", dur: 15,
    steps: [
      { t: 0, text: "规划署每 4 秒聚合需求自动立项：缺房建房、缺粮开荒、缺木伐木、缺水挖塘。" },
      { t: 4.5, text: "小人按职业优先领任务（农夫开荒、工匠建造……），远任务会老化插队不吃亏。" },
      { t: 9, text: "产出先进随身背包（haul 槽），走回仓库入库——名册里的数字永远是仓库里的。" },
      { t: 12.5, text: "劳动力市场：活计干完太久会自动转职，社会永远缺什么补什么。" },
    ],
    draw(g, W, H, t) {
      const s = 26;
      dTileAt(g, T.GRASS, W * 0.08, H * 0.55, s); dTileAt(g, T.SITE, W * 0.08 + s, H * 0.55, s);
      dTileAt(g, T.HOUSE, W * 0.08 + s * 2, H * 0.55, s);
      dTileAt(g, T.FARM, W * 0.08, H * 0.55 + s, s); dTileAt(g, T.TREE, W * 0.08 + s, H * 0.55 + s, s);
      const phase = (t % 8) / 8;
      dMan(g, W * 0.08 + s + phase * s * 2 - s, H * 0.55 - s * 0.55, s, { key: t % 1 < 0.5 ? "walk1" : "walk2", phase: t * 2, shirt: phase < 0.5 ? "#ff9f43" : "#7a92c4", view: "side" });
      dBar(g, W * 0.6, H * 0.25, W * 0.32, 12, Math.min(1, phase * 1.4), "#e8a13b", "工程进度");
      dBar(g, W * 0.6, H * 0.45, W * 0.32, 9, Math.min(1, phase * 1.4), "#6fae4e", "背包 haul 槽");
      dBar(g, W * 0.6, H * 0.62, W * 0.32, 9, phase < 0.5 ? 0.2 : Math.min(1, 0.2 + phase), "#5a8fd0", "仓库库存（入库后 +）");
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText("规划署 → 任务牌 → 工人 → 背包 → 仓库", W * 0.08, H * 0.2);
    },
  },
  {
    id: "voyage", name: "航海探索", desc: "码头出海 / 点亮虚空 / 登岛命名 / 救援", dur: 16,
    steps: [
      { t: 0, text: "码头（era≥1）建成即开启航海时代——探险家们的浪漫从这里起航。" },
      { t: 4, text: "消耗木材造船出海：船带粮草，沿途每 2 秒点亮一片虚空，地图向星辰推进。" },
      { t: 8.5, text: "触碰陆地即下船：第一个登岛的人为岛屿命名，命名即定居化（粮仓+房屋+农田）。" },
      { t: 12.5, text: "船可以穿过桥；补给耗尽会被困呼救——存粮足够时全城自动派出救援船。" },
    ],
    draw(g, W, H, t) {
      const s = 24;
      for (let i = 0; i < 14; i++) g.drawImage(waterSprite(T.WATER, 2, 0, Math.floor(t * 2) % 4), W * 0.05 + i * s, H * 0.5, s + 0.5, s + 0.5);
      dTileAt(g, T.GRASS, W * 0.03, H * 0.5, s); dTileAt(g, T.GRASS, W * 0.03, H * 0.5 - s, s); dTileAt(g, T.DOCK, W * 0.03 + s, H * 0.5, s);
      const sailX = W * 0.06 + Math.min(1, t / 10) * W * 0.7;
      g.drawImage(shipSprite("ship"), sailX, H * 0.5 + s * 0.1, s * 1.4, s);
      // 点亮光圈
      const rv = Math.max(0, Math.sin((t - 4) * 0.8));
      if (rv > 0 && t > 4) {
        g.strokeStyle = `rgba(220,240,255,${0.5 * rv})`; g.lineWidth = 2;
        g.beginPath(); g.arc(sailX + s * 0.7, H * 0.5 + s * 0.5, s * (1 + rv), 0, 7); g.stroke();
      }
      dTileAt(g, T.GRASS, W * 0.86, H * 0.5, s); dTileAt(g, T.GRASS, W * 0.86, H * 0.5 - s, s); dTileAt(g, T.HOUSE, W * 0.86, H * 0.5 + s, s);
      if (t > 8.5) { g.fillStyle = "#e8d9a0"; g.font = "11px sans-serif"; g.fillText("「云岚屿」", W * 0.845, H * 0.5 - s - 6); }
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText(t < 8.5 ? "船速 3 格/秒 · 航程上限 220 格" : "船穿桥而过 · 桥不再是岸", W * 0.08, H * 0.24);
    },
  },
  {
    id: "bridges", name: "岛际大桥", desc: "命名岛连线 · 深海架桥 · 链式贯通", dur: 13,
    steps: [
      { t: 0, text: "已命名的邻近岛屿（中心距 ≤50）之间，规划署会立项跨海大桥。" },
      { t: 4, text: "沿两岛中心连线逐格架桥——浅海架桥，深海也架桥，绝不填海绕路。" },
      { t: 8, text: "桥一格接一格生长（链式 corridor），直到踏上对岸——两岛从此陆路相通。" },
    ],
    draw(g, W, H, t) {
      const s = 22;
      // 左右两座岛 + 中间深海
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) dTileAt(g, T.GRASS, W * 0.06 + c * s, H * 0.42 + r * s, s);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) dTileAt(g, T.GRASS, W * 0.82 + c * s, H * 0.42 + r * s, s);
      for (let i = 0; i < 12; i++) g.drawImage(waterSprite(T.DEEP, 2, 0, Math.floor(t) % 4), W * 0.06 + s * 2 + i * s, H * 0.42, s + 0.5, s + 0.5);
      for (let i = 0; i < 12; i++) g.drawImage(waterSprite(T.DEEP, 2, 0, Math.floor(t) % 4), W * 0.06 + s * 2 + i * s, H * 0.42 + s, s + 0.5, s + 0.5);
      const grown = Math.min(12, Math.max(0, Math.floor((t - 2) * 1.6)));
      for (let i = 0; i < grown; i++) dTileAt(g, T.BRIDGE, W * 0.06 + s * 2 + i * s, H * 0.42 + s * 0.5, s);
      const dMan2 = grown >= 12;
      if (dMan2) dMan(g, W * 0.3 + (t % 3) * s, H * 0.42 + s * 0.5 - s * 0.55, s * 0.9, { key: t % 1 < 0.5 ? "walk1" : "walk2", phase: t * 2, view: "side" });
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText(dMan2 ? "贯通！两岛陆路相通" : "海上段逐格生长中……", W * 0.08, H * 0.24);
      g.fillStyle = "#e8d9a0"; g.font = "12px sans-serif";
      g.fillText("测试西岛", W * 0.05, H * 0.36); g.fillText("测试东岛", W * 0.81, H * 0.36);
    },
  },
  {
    id: "ranch", name: "畜牧与渔场", desc: "围栏留门 / 圈养产粮 / 渔船起网", dur: 15,
    steps: [
      { t: 0, text: "牧场围栏圈地——但必留一道门：牲畜会自己出门，在附近溜达再回家。" },
      { t: 4.5, text: "圈养牛羊定期产粮 +2、缓慢繁衍；喜爱牲畜的居民在旁陪伴还能加速。" },
      { t: 9, text: "水生动物不进陆上牧场：鱼群圈进水域渔场或池塘，渔船近海起网满舱回港。" },
      { t: 12.5, text: "狼捕食野羊、野犬可驯化认主——人类的牧场之外，自然自有生态。" },
    ],
    draw(g, W, H, t) {
      const s = 24;
      const px = W * 0.08, py = H * 0.4;
      dTileAt(g, T.PASTURE, px + s, py + s, s);
      const ring = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
      ring.forEach(([c, r], i) => dTileAt(g, i === 4 ? T.GATE : T.FENCE, px + c * s, py + r * s, s));
      dCreature(g, "cow", px + s + 2, py + s + 2, s);
      const cowOut = Math.min(1, Math.max(0, (t - 4) / 3));
      dCreature(g, "goat", px + s + s * 1.2 + cowOut * s * 1.6, py + s * 2.6, s);
      dWaterRow(g, W * 0.55, H * 0.4, 7, s);
      dCreature(g, "fish", W * 0.58, H * 0.4 + 2, s * 0.8);
      dCreature(g, "fish", W * 0.64, H * 0.4 + 4, s * 0.8);
      g.drawImage(shipSprite("boat"), W * 0.62, H * 0.4 - 4, s * 1.1, s * 0.75);
      dCreature(g, "wolf", W * 0.85, H * 0.7, s);
      dCreature(g, "dog", W * 0.78, H * 0.72, s);
      dMan(g, W * 0.7, H * 0.7 - s * 0.5, s * 0.9, { key: "stand" });
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText("围栏留门 · 牲畜自由出入", W * 0.08, H * 0.3);
      g.fillText("渔船起网 +2 粮 / 10 秒", W * 0.55, H * 0.3);
    },
  },
  {
    id: "species", name: "物种图鉴", desc: "17+ 种生灵轮番亮相", dur: 17,
    steps: [
      { t: 0, text: "群岛栖居着 17 种生灵：草地、沙滩、林缘、浅海、深海、天空各有其主。" },
      { t: 2, text: "普通生灵可猎可捕；珍稀物种（独角兽/月光鱼/锦鲤/凤凰/仙龙/人鱼）可遇不可求。" },
      { t: 8, text: "独角兽可以驯化认主（+25 心情）；月光鱼与锦鲤可垂钓（钓到开心大涨）。" },
      { t: 13, text: "一切生物都会老去：分栖息地繁衍、超龄离世——种群永续，不必担心猎绝。" },
    ],
    draw(g, W, H, t) {
      const types = ["cow", "goat", "deer", "boar", "wolf", "dog", "rabbit", "fox", "bear", "horse",
        "penguin", "crab", "dolphin", "shark", "turtle", "whale", "unicorn", "moonfish", "koi", "phoenix", "fairy", "mermaid", "bird"];
      const idx = Math.floor(t / 0.75) % types.length;
      const cur = types[idx];
      const s = 46;
      g.fillStyle = "#131c2c"; g.fillRect(W * 0.32, H * 0.16, s * 2.4, s * 2.4);
      g.strokeStyle = "#2a3448"; g.strokeRect(W * 0.32, H * 0.16, s * 2.4, s * 2.4);
      dCreature(g, cur, W * 0.32 + s * 0.2, H * 0.16 + s * 0.2, s * 2);
      g.fillStyle = "#e8d9a0"; g.font = "13px sans-serif";
      g.fillText(CREATURE_META[cur].name + (CREATURE_META[cur].rare ? " · 珍稀" : "") + (CREATURE_META[cur].tamable ? " · 可驯化" : ""), W * 0.62, H * 0.3);
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      const hab = { grass: "草地", forest: "林缘", sand: "沙滩", water: "浅海", deep: "深海", air: "天空" }[CREATURE_META[cur].habitat] || "";
      g.fillText("栖息地：" + hab + (CREATURE_META[cur].hunt ? " · 可猎 +" + CREATURE_META[cur].yield : ""), W * 0.62, H * 0.38);
      g.fillText((idx + 1) + " / " + types.length, W * 0.62, H * 0.45);
    },
  },
  {
    id: "fate", name: "意外与死亡", desc: "老死病亡 / 意外 / 全屏讣告", dur: 14,
    steps: [
      { t: 0, text: "生命有尽头：老死（60 岁后概率渐增）、饥饿/力竭/脱水病倒、抑郁郁郁而终。" },
      { t: 5, text: "还有极小概率的世界无常：崖边失足（1/20000 每秒）、浅滩遇鲨、进食噎住。" },
      { t: 9, text: "被视角跟随的居民去世 → 全屏讣告：姓名、死因、享年、地点与时刻，点击致哀。" },
      { t: 12, text: "死者长已矣——名册静默更新，房屋与任务释放，世界继续向前。" },
    ],
    draw(g, W, H, t) {
      const s = 26;
      dTileAt(g, T.GRASS, W * 0.1, H * 0.5, s); dTileAt(g, T.GRASS, W * 0.1 + s, H * 0.5, s);
      dTileAt(g, T.CLIFF, W * 0.1 + s * 2, H * 0.5, s);
      if (t < 9) {
        const wob = t > 5 && t < 7 ? Math.sin(t * 20) * 3 : 0;
        dMan(g, W * 0.1 + s * 0.2 + wob, H * 0.5 - s * 0.6, s, { key: t < 5 ? "stand" : t < 7 ? "walk2" : "drink1" });
      }
      g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
      g.fillText(t < 5 ? "岁月与疾病" : t < 9 ? "无常的意外" : "讣告昭告全境", W * 0.1, H * 0.38);
      if (t >= 9) {
        g.fillStyle = "rgba(26,13,15,0.94)"; g.fillRect(W * 0.32, H * 0.2, W * 0.42, H * 0.5);
        g.strokeStyle = "#7a3a3a"; g.strokeRect(W * 0.32, H * 0.2, W * 0.42, H * 0.5);
        g.fillStyle = "#c96a6a"; g.font = "11px sans-serif"; g.fillText("讣 告", W * 0.48, H * 0.28);
        g.fillStyle = "#f0e6d0"; g.font = "14px sans-serif"; g.fillText("张 川", W * 0.47, H * 0.38);
        g.fillStyle = "#b8a89a"; g.font = "10px sans-serif";
        g.fillText("在崖边失足坠落，当场身亡（享年 34 岁）", W * 0.35, H * 0.46);
        g.fillText("卒于 主岛城 · 第3年第7月 14:20", W * 0.38, H * 0.53);
        g.fillStyle = "#5f5a58"; g.fillText("—— 点击任意处致哀 ——", W * 0.42, H * 0.63);
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
    draw(g, W, H, t) {
      const s = 24;
      if (t < 5) {
        dTileAt(g, T.GRASS, W * 0.12, H * 0.45, s); dTileAt(g, T.GRASS, W * 0.4, H * 0.45, s); dTileAt(g, T.GRASS, W * 0.68, H * 0.45, s);
        dBuilding(g, T.PAVILION, W * 0.12, H * 0.45 - 2, s);
        dBuilding(g, T.THEATER, W * 0.4, H * 0.45 - 2, s);
        dBuilding(g, T.ARENA, W * 0.68, H * 0.45 - 2, s);
        g.fillStyle = "#8a93a8"; g.font = "10px sans-serif";
        g.fillText("+12", W * 0.15, H * 0.36); g.fillText("+18", W * 0.43, H * 0.36); g.fillText("+20", W * 0.71, H * 0.36);
      } else {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const tt = (r === 1 && c === 1) ? T.PARK_GATE : T.PIER;
          dTileAt(g, tt, W * 0.12 + c * s, H * 0.4 + r * s, s);
        }
        dBuilding(g, T.FERRIS, W * 0.12, H * 0.4 - 2, s);
        if (t > 7) dBuilding(g, T.CAROUSEL, W * 0.12 + s * 2, H * 0.4 - 2, s);
        if (t > 9.5) dBuilding(g, T.COASTER, W * 0.12 + s, H * 0.4 + s * 2, s);
        dMan(g, W * 0.12 + s * 3.4, H * 0.4 + s - s * 0.55, s * 0.9, { key: t % 1 < 0.5 ? "drink2" : "drink1" });
        g.fillStyle = "#e8d9a0"; g.font = "11px sans-serif"; g.fillText("游乐园（水上浮台）", W * 0.12, H * 0.3);
        dBar(g, W * 0.6, H * 0.62, W * 0.3, 10, Math.min(1, 0.4 + t * 0.03), "#e8c15a", "心情（余韵期衰减 ×0.35）");
      }
    },
  },
];

// ---- 播放器状态与驱动 ----
const DEMO_DONE = new Set();      // 已看完的主题 id（列表打勾，内存态）
let demoState = null;             // { topic, t, speed, done, cv, g }

function demoOpenList() {
  const listEl = document.getElementById("demo-list");
  const stageEl = document.getElementById("demo-stage");
  if (!listEl) return;
  stageEl.classList.add("hidden");
  listEl.classList.remove("hidden");
  listEl.innerHTML = DEMO_TOPICS.map(tp =>
    `<div class="demo-item" data-demo="${tp.id}">` +
    `<span class="di-name">${DEMO_DONE.has(tp.id) ? "✓ " : ""}${tp.name}</span>` +
    `<span class="di-desc">${tp.desc}</span></div>`).join("");
}

function demoStart(id) {
  const tp = DEMO_TOPICS.find(k => k.id === id);
  if (!tp) return;
  demoState = { topic: tp, t: 0, speed: 1, done: false };
  const cv = document.getElementById("demo-cv");
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  demoState.cv = cv; demoState.g = g;
  document.getElementById("demo-list").classList.add("hidden");
  document.getElementById("demo-stage").classList.remove("hidden");
  document.getElementById("demo-caption").classList.remove("done");
  document.getElementById("demo-speed").textContent = "速度 1×";
}

// 主循环每帧调用（realDt 真实秒；主世界此时已被暂停）
function demoTick(realDt) {
  if (!demoState) return;
  const d = demoState;
  if (!d.done) d.t += realDt * d.speed;
  const { g, cv, topic } = d;
  const W = cv.width, H = cv.height;
  g.fillStyle = "#0a0e16"; g.fillRect(0, 0, W, H);
  topic.draw(g, W, H, Math.min(d.t, topic.dur));
  // 步骤文案：取 t 之前最近的 step
  const capEl = document.getElementById("demo-caption");
  if (d.done) {
    capEl.textContent = "✓ 当前机制演示完毕（点击左侧「■ 返回列表」继续看其他机制）";
    capEl.classList.add("done");
  } else {
    let text = topic.steps[0].text;
    for (const st of topic.steps) if (d.t >= st.t) text = st.text;
    capEl.textContent = text;
  }
  document.getElementById("demo-prog").textContent =
    Math.min(100, Math.round(d.t / topic.dur * 100)) + "%";
}
