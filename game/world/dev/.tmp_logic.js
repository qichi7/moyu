"use strict";
// ============ 事件总线：逻辑层发事件，表现层订阅 ============
// 逻辑层不依赖音频/DOM（headless 测试可跑）；未注册监听时 emit 是 no-op

const _listeners = {};

function onEvent(name, fn) {
  (_listeners[name] = _listeners[name] || []).push(fn);
}

function emit(name, data) {
  const l = _listeners[name];
  if (l) for (const f of l) f(data);
}


"use strict";
// ============ 全局配置 ============
const BUILD_ID = "v0.1.0";

// tile 类型
const T = {
  VOID: 0, DEEP: 1, WATER: 2, SAND: 3, GRASS: 4, TREE: 5,
  MOUNTAIN: 6, FARM: 7, HOUSE: 8, PATH: 9, SITE: 10, BRIDGE: 11,
  BERRY: 12, FRUIT: 13, PASTURE: 14, CAVE: 15, CLIFF: 16, FENCE: 17,
  QUARRY: 18, SANDPIT: 19,
};

const TILE_META = {
  [T.VOID]:     { name: "虚空", color: "#0a0d13", walk: false, h: 0 },
  [T.DEEP]:     { name: "深海", color: "#123a5e", walk: false, fillable: true, fillTo: T.SAND, hp: 14 },
  [T.WATER]:    { name: "浅海", color: "#235d96", walk: false, fillable: true, bridgeable: true, fillTo: T.SAND, hp: 8 },
  [T.SAND]:     { name: "沙滩", color: "#cfc08a", walk: true, h: 0 },
  [T.GRASS]:    { name: "草地", color: "#5e8c4f", walk: true, h: 0 },
  [T.TREE]:     { name: "森林", color: "#2f5e33", walk: false, diggable: true, digTo: T.GRASS, hp: 4 },
  [T.MOUNTAIN]: { name: "山",   color: "#7a7d84", walk: false, diggable: true, digTo: T.GRASS, hp: 16 },
  [T.FARM]:     { name: "农田", color: "#a5b04a", walk: true, h: 0 },
  [T.HOUSE]:    { name: "房屋", color: "#8a5a33", walk: false, h: 0 },
  [T.PATH]:     { name: "道路", color: "#b09a72", walk: true, h: 0 },
  [T.SITE]:     { name: "工地", color: "#c9b98a", walk: true, h: 0 },
  [T.BRIDGE]:   { name: "木桥", color: "#a97b48", walk: true, h: 0 },
  [T.BERRY]:    { name: "浆果丛", color: "#3e6b35", walk: true, h: 0 },
  [T.FRUIT]:    { name: "果树", color: "#4a7a3a", walk: true, h: 0 },
  [T.PASTURE]:  { name: "牧场", color: "#9a8a5a", walk: true, h: 0 },
  [T.CAVE]:     { name: "洞穴", color: "#2d2d34", walk: false, h: 0 },
  [T.CLIFF]:    { name: "悬崖", color: "#62666e", walk: false, h: 0 },
  [T.FENCE]:    { name: "围栏", color: "#7a5a2e", walk: false, h: 0 },
  [T.QUARRY]:   { name: "采石场", color: "#8d8478", walk: true, h: 0 },
  [T.SANDPIT]:  { name: "沙场", color: "#d8c890", walk: true, h: 0 },
};

const WORLD_W = 240, WORLD_H = 180;
const INIT_REGION = { x: 68, y: 50, w: 104, h: 80 }; // 初始大陆区域

const SIM = {
  DAY_LEN: 90,          // 一个昼夜 = 90 sim 秒
  NIGHT_START: 0.82,    // timeOfDay > 0.82 或 < 0.18 为夜
  NIGHT_END: 0.18,
  PLANNER_INTERVAL: 4,  // 规划器每 4 sim 秒跑一次
  AGENT_SPEED: 1.7,     // tile/秒 基准
  HUNGER_DECAY: 1.1,    // hunger 每秒下降
  ENERGY_DECAY: 0.9,    // 醒着时 energy 每秒下降
  ENERGY_REGEN: 9,      // 睡觉时每秒恢复
  WORK_EFFORT: 1.3,     // 每个工人每秒任务进度
  FARM_MATURITY: 55,    // 农田成熟秒数
  FARM_YIELD: 4,        // 每次成熟产粮
  BIRTH_CHECK: 0.015,   // 每秒出生判定概率
  EXPAND_POP_CAP: 22,   // 人口达到此值触发扩张（每次扩张 +22）
  SETTLEMENT_SCORE: [24, 70, 150],   // 聚落升级分数线：村庄/城镇/城市
  SETTLEMENT_RADIUS: 14,             // 聚落繁荣度统计半径
  BRIDGE_HP: 3,         // 架一座桥所需工时（比填海快得多）
  EXPLORE_CHANCE: 0.06, // 探索欲 1.0 的小人每次决策触发探索的概率
  EXPLORE_LEGS: 6,      // 一次探索旅程最多延伸的段数
  REVEAL_RADIUS: 12,    // 探索点亮的斑块半径上限（格），实际大小随机且边界有噪声扰动
  // ---- 食物体系 ----
  BERRY_STOCK: 3,       // 每丛浆果/果树的果量上限
  BERRY_REGEN: 60,      // 每 60 秒再生 1 份
  GATHER_YIELD: 3,      // 采集一次入粮池
  HUNT_YIELD: { cow: 8, goat: 5 },
  PASTURE_INTERVAL: 80, // 牧场产粮周期（秒）
  PASTURE_YIELD: 2,     // 每次产粮
  PASTURE_CAP: 6,       // 单牧场圈养上限
  BREED_CHANCE: 0.1,    // 繁殖概率（每 120 秒判定）
  WILD_BREED_CAP: 60,   // 野生动物总量上限
  // ---- 历法与年龄 ----
  YEAR_DAYS: 12,        // 1 昼夜 = 1 个月，12 昼夜 = 1 年（1 岁）
};

// 物种寿命与年龄分档（岁）：幼年 < s0、青年 < s1、中年 < s2、老年 ≥ s2；超过 lifespan 封顶
const SPECIES_AGE = {
  human: { name: "人",   lifespan: 80, stages: [15, 40, 60] },
  cow:   { name: "牛",   lifespan: 15, stages: [2, 8, 12] },
  goat:  { name: "羊",   lifespan: 12, stages: [2, 6, 9] },
  dog:   { name: "狗",   lifespan: 10, stages: [2, 5, 8] },
};

// 时代划分：按已达到的最高聚落等级 / 人口里程碑
const ERAS = [
  { name: "蛮荒时代", need: null },      // 初始
  { name: "定居时代", need: { settle: 1 } },
  { name: "城邦时代", need: { settle: 2 } },   // 解锁功能分区
  { name: "文明时代", need: { settle: 3 } },   // 解锁高楼社区
  { name: "黄金时代", need: { pop: 150, cities: 2 } },
];


"use strict";
// ============ 随机与噪声 ============

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 全局模拟用 rng（有种子，可复现）
const rng = mulberry32(20260916);
const rand = () => rng();
const randRange = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(a + rng() * (b - a + 1));

function makeNoise(seed) {
  const next = mulberry32(seed);
  const P = 256;
  const perm = new Uint8Array(P * 2);
  const val = new Float32Array(P);
  for (let i = 0; i < P; i++) { perm[i] = i; val[i] = next(); }
  for (let i = P - 1; i > 0; i--) { const j = (next() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < P; i++) perm[i + P] = perm[i];

  // 值噪声：网格随机值 + 平滑双线性插值
  function n2(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xi = fx & 255, yi = fy & 255;
    const xf = x - fx, yf = y - fy;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (X, Y) => val[perm[perm[X & 255] + (Y & 255)]];
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 分形叠加，输出约 0..1
  function fbm(x, y, oct) {
    let f = 0, amp = 0.5, s = 1, norm = 0;
    for (let i = 0; i < oct; i++) { f += amp * n2(x * s, y * s); norm += amp; s *= 2; amp *= 0.5; }
    return f / norm;
  }
  return { n2, fbm };
}

// tile 坐标 hash，用于渲染微扰（稳定不闪烁）
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}


"use strict";
// ============ BFS 寻路（窗口制，支持无限地图/负坐标） ============
// 窗口：以起点为中心 160×160；目标出窗视为不可达（走廊工程会逐步推进，无需跨窗寻路）

const PF_W = 160, PF_H = 160;
const _pfPrev = new Int32Array(PF_W * PF_H);
const _pfStamp = new Int32Array(PF_W * PF_H);
const _pfQueue = new Int32Array(PF_W * PF_H);
let _pfGen = 0;

// 返回 { path, blocked }
// blocked = 搜到过离起点最近的不可通行格（山/水/树），用于触发改造
function findPath(sx, sy, tx, ty, maxNodes) {
  maxNodes = maxNodes || 20000;
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  const wx0 = sx - (PF_W >> 1), wy0 = sy - (PF_H >> 1);

  // 目标不可走 → 找它相邻的可走格作为实际目标
  if (!walkable(tx, ty)) {
    const alt = neighborsOf(tx, ty).find(p => walkable(p.x, p.y));
    if (!alt) return { path: null, blocked: null };
    tx = alt.x; ty = alt.y;
  }
  if (sx === tx && sy === ty) return { path: [], blocked: null };

  // 目标/起点出窗 → 不可达
  if (tx < wx0 || tx >= wx0 + PF_W || ty < wy0 || ty >= wy0 + PF_H ||
      sx < wx0 || sx >= wx0 + PF_W || sy < wy0 || sy >= wy0 + PF_H) {
    return { path: null, blocked: null };
  }

  const widx = (x, y) => (y - wy0) * PF_W + (x - wx0);
  _pfGen++;
  let qh = 0, qt = 0, nodes = 0;
  const si = widx(sx, sy);
  _pfQueue[qt++] = si;
  _pfStamp[si] = _pfGen;
  _pfPrev[si] = -1;

  let blocked = null, blockedD = 1e9;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;

  while (qh < qt && nodes < maxNodes) {
    const cur = _pfQueue[qh++];
    const cx = wx0 + (cur % PF_W), cy = wy0 + ((cur / PF_W) | 0);
    nodes++;

    for (let k = 0; k < 4; k++) {
      const nx = cx + D[k][0], ny = cy + D[k][1];
      if (nx < wx0 || nx >= wx0 + PF_W || ny < wy0 || ny >= wy0 + PF_H) continue;
      const ni = widx(nx, ny);
      if (_pfStamp[ni] === _pfGen) continue;
      _pfStamp[ni] = _pfGen;

      if (!walkable(nx, ny)) {
        const d = Math.abs(nx - sx) + Math.abs(ny - sy);
        if (d < blockedD) {
          const meta = TILE_META[tileAt(nx, ny)];
          if (meta.diggable || meta.fillable) { blockedD = d; blocked = { x: nx, y: ny }; }
        }
        continue;
      }
      _pfPrev[ni] = cur;
      if (nx === tx && ny === ty) { found = true; qh = qt; break; }
      _pfQueue[qt++] = ni;
    }
  }
  if (!found) return { path: null, blocked };

  const path = [];
  let cur = widx(tx, ty);
  while (cur !== -1) {
    path.push({ x: wx0 + (cur % PF_W), y: wy0 + ((cur / PF_W) | 0) });
    cur = _pfPrev[cur];
  }
  path.pop(); // 起点不要
  path.reverse();
  return { path, blocked };
}

function neighborsOf(x, y) {
  return [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
}


"use strict";
// ============ 世界：无限地图（chunk 按需生成） / 群岛 / 改造 ============
// 坐标系统：原点 (0,0) = 主岛中心，支持负坐标
// chunk 32×32；未生成区域等价于 VOID（不可走、渲染为深渊色）

const CHUNK = 32;

const world = {
  chunks: new Map(),  // "cx,cy" -> { tiles: Uint8Array, hp: Float32Array, gen: bool }
  noise: null,
  time: 0,
  timeOfDay: 0.3,
  food: 130,
  houses: [],        // [{x,y}]
  farms: [],         // [{x,y}]
  store: { x: 0, y: 0 },  // 主粮仓（原点附近）
  popCap: SIM.EXPAND_POP_CAP,
  expansions: 0,
  era: 0,            // 时代索引（见 config.ERAS）
  zonesVersion: 0,   // 分区变化标记（渲染缓存重建用）
  active: { x0: 0, y0: 0, x1: 0, y1: 0 }, // 已开发包围盒（供扩张参考）
  islands: [],       // [{x,y,r,claimed}]
  settlements: [],   // [{x,y,name,level}]
  foundGrid: new Set(), // 已探索到的发现网格 "gx,gy"
  litCells: new Set(),  // 已被探索点亮的格子 "x,y"（点亮永久，重算时不黑回）
  berryStock: new Map(),// 浆果/果树果量 "x,y" → 份数
  fishStock: new Map(), // 浅海鱼群 "x,y" → 份数
  pastures: [],         // [{x,y}] 牧场
  caves: [],            // [{x,y}] 洞穴（采石场选址）
  quarries: [],         // [{x,y}] 采石场（定期产石材）
  sandpits: [],         // [{x,y}] 沙场（定期产沙土）
  logs: [],
};

function logMsg(text) {
  world.logs.unshift({ t: world.time, text });
  if (world.logs.length > 200) world.logs.pop();
}

// ---- chunk 与 tile 访问 ----
const chunkKey = (cx, cy) => cx + "," + cy;

function ensureChunk(cx, cy) {
  const k = chunkKey(cx, cy);
  let c = world.chunks.get(k);
  if (!c) {
    c = { tiles: new Uint8Array(CHUNK * CHUNK), hp: new Float32Array(CHUNK * CHUNK), gen: false };
    world.chunks.set(k, c);
  }
  return c;
}

const cIdx = (x, y) => (y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1));

// 未生成的 chunk = 虚空（不可走、渲染为深渊色），探索到后由 generateRegion 显现内容
function tileAt(x, y) {
  const c = world.chunks.get(chunkKey(x >> 5, y >> 5));
  if (!c || !c.gen) return T.VOID;
  return c.tiles[cIdx(x, y)];
}
const walkable = (x, y) => TILE_META[tileAt(x, y)].walk === true;

function setTile(x, y, t) {
  const c = ensureChunk(x >> 5, y >> 5);
  c.gen = true;
  const i = cIdx(x, y);
  c.tiles[i] = t;
  c.hp[i] = 0;
}

// 兼容旧调用点：无限地图无边界
const inWorld = () => true;

// ---- 探索发现：虚空被探索到时，随机显现小岛（确定性 hash，同一网格结果恒定） ----
const DISCOVERY_GRID = 48;
const DISCOVERY_CHANCE = 0.16;

function discoveryIslandAt(gx, gy) {
  if (hash2(gx * 7919 + 13, gy * 104729 + 7) > DISCOVERY_CHANCE) return null;
  return {
    x: gx * DISCOVERY_GRID + 8 + hash2(gx + 101, gy + 57) * (DISCOVERY_GRID - 16),
    y: gy * DISCOVERY_GRID + 8 + hash2(gx + 911, gy + 37) * (DISCOVERY_GRID - 16),
    r: 3.5 + hash2(gx + 5, gy + 555) * 4.5,
  };
}

// 收集本区域覆盖的发现岛：首次见到 → 记录日志并注册为可定居的无人岛（远离已知岛时）
function collectDiscoveries(x0, y0, x1, y1) {
  const found = [];
  const gx0 = Math.floor(x0 / DISCOVERY_GRID), gx1 = Math.floor(x1 / DISCOVERY_GRID);
  const gy0 = Math.floor(y0 / DISCOVERY_GRID), gy1 = Math.floor(y1 / DISCOVERY_GRID);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const key = gx + "," + gy;
      if (world.foundGrid.has(key)) continue;
      const d = discoveryIslandAt(gx, gy);
      if (!d) continue;
      if (world.islands.some(o => Math.hypot(o.x - d.x, o.y - d.y) < o.r + d.r + 20)) { world.foundGrid.add(key); continue; }
      world.foundGrid.add(key);
      d.x = Math.round(d.x); d.y = Math.round(d.y);   // 岛心坐标取整
      found.push(d);
      world.islands.push({ x: d.x, y: d.y, r: d.r, claimed: false });
      logThrottled("探险队在未知的远方发现了新的陆地！", 12);
    }
  }
  return found;
}

// ---- 区域生成：已知岛屿 + 探索发现物 ----
// reveal=false（视口生成/重算）：无陆地影响 → 虚空（首生成）或保持原值（重算不黑回）
// reveal=true （居民点亮）：无陆地影响 → litTest 判定通过则点亮为深海，否则保留
// 返回本次新注册的发现岛列表（调用方负责对其周边做虚空重算）
function generateRegion(x0, y0, x1, y1, noDiscover, reveal, litTest) {
  const N = world.noise;
  const ex0 = Math.floor(x0 / CHUNK) * CHUNK;
  const ex1 = Math.floor(x1 / CHUNK) * CHUNK + CHUNK - 1;
  const ey0 = Math.floor(y0 / CHUNK) * CHUNK;
  const ey1 = Math.floor(y1 / CHUNK) * CHUNK + CHUNK - 1;
  const discovered = noDiscover ? [] : collectDiscoveries(ex0, ey0, ex1, ey1);
  // 预过滤：只保留影响圈可能与本区域相交的岛
  const relevant = world.islands.filter(o =>
    o.x + o.r + 9 >= ex0 && o.x - o.r - 9 <= ex1 &&
    o.y + o.r + 9 >= ey0 && o.y - o.r - 9 <= ey1);
  for (const d of discovered) {
    if (d.x + d.r + 9 >= ex0 && d.x - d.r - 9 <= ex1 && d.y + d.r + 9 >= ey0 && d.y - d.r - 9 <= ey1) relevant.push(d);
  }
  const w = ex1 - ex0 + 1, h = ey1 - ey0 + 1;
  const elev = new Float32Array(w * h);    // 海拔场：悬崖判定与地势渲染共用
  const firstPass = new Uint8Array(w * h); // 1 = 陆地候选
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      const c = ensureChunk(x >> 5, y >> 5);
      const wasGen = c.gen;
      c.gen = true;
      const i = cIdx(x, y);
      const li = (y - ey0) * w + (x - ex0);
      if (!relevant.length) { settleFarTile(c, i, x, y, reveal, litTest, wasGen); continue; }
      let bump = 0, inInfluence = false;
      for (const o of relevant) {
        const d = Math.hypot(x - o.x, y - o.y);
        if (d < o.r + 9) {
          inInfluence = true;
          const b = d < o.r ? 0.45 * (1 - d / o.r) + 0.1 : 0.1 * (1 - (d - o.r) / 9);
          if (b > bump) bump = b;
        }
      }
      if (!inInfluence) { settleFarTile(c, i, x, y, reveal, litTest, wasGen); elev[li] = -1; continue; }
      const e = N.fbm(x * 0.05, y * 0.05, 4) * 0.55 + bump;
      const m = N.fbm(x * 0.06 + 90, y * 0.06 + 55, 3);
      elev[li] = e;
      firstPass[li] = 1;
      let t;
      if (e < 0.28) t = T.DEEP;
      else if (e < 0.38) {
        t = T.WATER;
        if (hash2(x + 555, y + 777) < 0.02) world.fishStock.set(x + "," + y, 3);   // 浅海鱼群
      }
      else if (e < 0.42) t = T.SAND;
      else if (e > 0.68) {
        t = hash2(x + 123, y + 321) < 0.03 ? T.CAVE : T.MOUNTAIN;
        if (t === T.CAVE) world.caves.push({ x, y });   // 洞穴：富矿点（采石场选址）
      }
      else {
        t = T.GRASS;
        if (m > 0.58 && hash2(x, y) < 0.55) t = T.TREE;
        else if (hash2(x + 777, y + 331) < 0.012) { t = T.BERRY; world.berryStock.set(x + "," + y, SIM.BERRY_STOCK); }
        else if (hash2(x + 919, y + 553) < 0.005) { t = T.FRUIT; world.berryStock.set(x + "," + y, SIM.BERRY_STOCK); }
      }
      c.tiles[i] = t;
    }
  }
  // 第二遍：悬崖判定——陆地格与相邻格海拔落差大处（山脚/高地边缘）生成悬崖
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      const li = (y - ey0) * w + (x - ex0);
      if (!firstPass[li]) continue;
      const e = elev[li];
      if (e <= 0.42) continue;
      const er = x < ex1 && firstPass[li + 1] ? elev[li + 1] : e;
      const ed = y < ey1 && firstPass[li + w] ? elev[li + w] : e;
      if (e > 0.5 && Math.max(e - er, e - ed) > 0.11) {
        const c = world.chunks.get(chunkKey(x >> 5, y >> 5));
        c.tiles[cIdx(x, y)] = T.CLIFF;
      }
    }
  }
  // 地势渲染数据：chunk 记录海拔场
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      const li = (y - ey0) * w + (x - ex0);
      if (elev[li] < 0) continue;
      const c = world.chunks.get(chunkKey(x >> 5, y >> 5));
      if (!c.elev) { c.elev = new Float32Array(CHUNK * CHUNK).fill(-1); }
      c.elev[cIdx(x, y)] = elev[li];
    }
  }
  // 地形写入完成后才广播发现事件（监听器需要可通行的岛面来安置原住民）
  for (const d of discovered) emit("discovery", d);
  return discovered;
}

// 采石场/沙场产出（sim 每秒调用一次）：不可再生资源的稳定获取渠道
function quarryTick() {
  if (world.time % 80 > 1) return;
  for (const q of world.quarries) {
    const s = nearestSettlement(q.x, q.y);
    if (s) ensureStock(s).stone += 3;
  }
  for (const p of world.sandpits) {
    const s = nearestSettlement(p.x, p.y);
    if (s) ensureStock(s).sand += 2;
  }
}

// 河流刻蚀：从岛上山地出发，蜿蜒流向海（沿途草地/森林变水域，山体被冲开）
// 每座岛只刻蚀一次；河中偶有鱼群；沿岸冲积沙滩成为沙土采集点
function carveRiver(isl) {
  if (isl.riverDone) return;
  isl.riverDone = true;
  let x = Math.round(isl.x + randRange(-isl.r / 2, isl.r / 2));
  let y = Math.round(isl.y + randRange(-isl.r / 2, isl.r / 2));
  let ang = rand() * Math.PI * 2;
  const steps = Math.round(isl.r * 2.5);
  let carved = 0;
  for (let i = 0; i < steps; i++) {
    const t = tileAt(x, y);
    if (t === T.DEEP || t === T.WATER || t === T.BRIDGE) break;   // 入海
    if (t !== T.VOID) {
      setTile(x, y, T.WATER);
      if (hash2(x + 31, y + 97) < 0.08) world.fishStock.set(x + "," + y, 3);
      // 河岸冲积沙滩
      for (const p of neighborsOf(x, y)) {
        if (tileAt(p.x, p.y) === T.GRASS && hash2(p.x + 5, p.y + 9) < 0.5) setTile(p.x, p.y, T.SAND);
      }
      carved++;
    }
    ang += (rand() - 0.5) * 1.1;   // 蜿蜒
    x += Math.round(Math.cos(ang));
    y += Math.round(Math.sin(ang));
    if (!inWorld(x, y)) break;
  }
  if (carved > 4) logMsg(`勘探发现一条河流蜿蜒穿过「${isl.name || "岛屿"}」，河岸沙土丰厚。`);
}

// 无陆地影响格的落格规则（点亮永久不黑回）
function settleFarTile(c, i, x, y, reveal, litTest, wasGen) {
  if (reveal) {
    if (!litTest || litTest(x, y)) {
      c.tiles[i] = T.DEEP;
      world.litCells.add(x + "," + y);
    }
    // 斑块外：保留原状（虚空留给未来探索）
  } else if (!wasGen) {
    c.tiles[i] = T.VOID;                       // 首次视口生成：未探索虚空
  } else if (world.litCells.has(x + "," + y)) {
    c.tiles[i] = T.DEEP;                       // 重算时已点亮的格保持点亮
  }
  // 其余重算：保持原值
}

// 居民探索点亮：把目标区域一块随机大小、边界自然的连续斑块显形（海 + 随机发现岛）
// 斑块边界：3+5 倍频角向噪声叠加 + 椭圆偏心 + 逐格 hash 抖动 → 自然凹凸的不规则形状
function revealArea(cx, cy, r) {
  const pr = r * (0.75 + rand() * 0.5);
  const wob = 2.5 + rand() * 4;
  const ph = rand() * Math.PI * 2;
  const stretch = 0.8 + rand() * 0.45;   // 椭圆长短轴偏心
  const litTest = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const ang = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy);
    const edge = pr +
      Math.sin(ang * 3 + ph) * wob +
      Math.sin(ang * 5 + ph * 1.7) * wob * 0.55 +
      (hash2(x, y) - 0.5) * 2.5;
    return d <= edge * (1 + Math.cos(ang - ph) * (stretch - 1));
  };
  const pad = Math.ceil(pr + wob + 9);
  const discovered = generateRegion(cx - pad, cy - pad, cx + pad, cy + pad, false, true, litTest);
  // 发现岛整体显现（不受斑块限制），周边虚空改造成岛缘海
  for (const isl of discovered) {
    generateRegion(
      Math.floor(isl.x - isl.r - 10), Math.floor(isl.y - isl.r - 10),
      Math.ceil(isl.x + isl.r + 10), Math.ceil(isl.y + isl.r + 10), true, true
    );
  }
}

// 居民探索点亮：把目标区域的虚空显形（生成海 + 随机发现岛），并重算新发现岛周边
function revealArea(cx, cy, r) {
  const d = generateRegion(cx - r, cy - r, cx + r, cy + r, false, true);
  for (const isl of d) {
    generateRegion(
      Math.floor(isl.x - isl.r - 10), Math.floor(isl.y - isl.r - 10),
      Math.ceil(isl.x + isl.r + 10), Math.ceil(isl.y + isl.r + 10), true, true
    );
  }
}

// 生成 + 揭示：对新注册的发现岛强制重算周边 bounding，把旧虚空改造成岛与海域
function generateAndReveal(x0, y0, x1, y1, noDiscover) {
  const discovered = generateRegion(x0, y0, x1, y1, noDiscover);
  for (const d of discovered) {
    generateRegion(
      Math.floor(d.x - d.r - 10), Math.floor(d.y - d.r - 10),
      Math.ceil(d.x + d.r + 10), Math.ceil(d.y + d.r + 10), true
    );
  }
  return discovered;
}

// 探索队列：视口触及的未生成 chunk 先入队，逐帧散开（探索有过程感，虚空可见）
const _exploreQueue = [];
const _queued = new Set();

function ensureChunksFor(x0, y0, x1, y1) {
  const cx0 = x0 >> 5, cy0 = y0 >> 5, cx1 = x1 >> 5, cy1 = y1 >> 5;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const k = chunkKey(cx, cy);
      const c = world.chunks.get(k);
      if (c && c.gen) continue;
      if (!_queued.has(k)) { _queued.add(k); _exploreQueue.push({ cx, cy }); }
    }
  }
  processExplore(3);   // 每帧最多点亮 3 个 chunk
}

function processExplore(budget) {
  let discovered = [];
  while (budget-- > 0 && _exploreQueue.length) {
    const { cx, cy } = _exploreQueue.shift();
    _queued.delete(chunkKey(cx, cy));
    const c = world.chunks.get(chunkKey(cx, cy));
    if (c && c.gen) continue;
    discovered = discovered.concat(
      generateRegion(cx * CHUNK, cy * CHUNK, cx * CHUNK + CHUNK - 1, cy * CHUNK + CHUNK - 1, true)
    );
  }
  // 新发现的岛屿：强制重算周边 bounding，把旧虚空改造成岛与海域
  for (const d of discovered) {
    generateRegion(
      Math.floor(d.x - d.r - 10), Math.floor(d.y - d.r - 10),
      Math.ceil(d.x + d.r + 10), Math.ceil(d.y + d.r + 10), true
    );
  }
}

// ---- 初始生成：主岛在原点，5 座无人岛环布四周 ----
function genWorld(seed) {
  world.noise = makeNoise(seed || 1);
  world.chunks = new Map();
  world.islands = [];
  world.settlements = [];
  world.houses = [];
  world.farms = [];
  world.foundGrid = new Set();
  world.berryStock = new Map();
  world.fishStock = new Map();
  world.pastures = [];
  world.caves = [];
  world.quarries = [];
  world.sandpits = [];

  world.islands.push({ x: 0, y: 0, r: 14, claimed: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.6;
    const d = 34 + rand() * 10;
    world.islands.push({
      x: Math.round(Math.cos(a) * d),
      y: Math.round(Math.sin(a) * d),
      r: 10 + rand() * 5,
      claimed: false,
    });
  }

  generateAndReveal(-26, -26, 26, 26, true);
  world.active = { x0: -26, y0: -26, x1: 26, y1: 26 };

  const sc = findSpot(0, 0, 0, 5, T.GRASS) || { x: 0, y: 0 };
  world.store = { x: sc.x, y: sc.y };
  setTile(sc.x, sc.y, T.HOUSE);
  world.houses.push({ x: sc.x, y: sc.y, granary: true });
  world.settlements.push({ x: sc.x, y: sc.y, name: pickName(true), level: 0, stock: { wood: 40, stone: 15, sand: 30 } });

  for (let i = 0; i < 3; i++) {
    const s = findSpot(sc.x, sc.y, 3, 10, T.GRASS);
    if (s) { setTile(s.x, s.y, T.HOUSE); world.houses.push({ x: s.x, y: s.y }); }
  }
  logMsg(`先民在世界原点「${world.settlements[0].name}」登陆定居，粮仓落成。`);
}

const _NAME1 = ["临", "青", "沧", "月", "枫", "云", "石", "南", "白", "金", "岚", "汀"];
const _NAME2 = ["溪", "屿", "港", "湾", "崖", "林", "岩", "川", "沙", "浦"];
function pickName(main) {
  let n;
  do { n = _NAME1[randInt(0, _NAME1.length - 1)] + _NAME2[randInt(0, _NAME2.length - 1)]; }
  while (world.settlements.some(s => s.name === n));
  return main ? n + "城" : n;
}

// 在 (cx,cy) 附近 [rMin,rMax] 范围随机找一个 want 类型、周围干净的格子
function findSpot(cx, cy, rMin, rMax, want, around) {
  for (let i = 0; i < 300; i++) {
    const a = rand() * Math.PI * 2;
    const r = rMin + rand() * (rMax - rMin);
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (tileAt(x, y) !== want) continue;
    if (nearAny(x, y, around || [T.HOUSE, T.FARM, T.SITE], 2)) continue;
    return { x, y };
  }
  return null;
}

function nearAny(x, y, types, r) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (types.includes(tileAt(x + dx, y + dy))) return true;
  return false;
}

// ---- 世界扩张：优先渡海激活无人岛；没有就向远海造新岛 ----
function expand() {
  if (world.islands.length >= 40) { world.popCap += 20; return; } // 岛屿上限，仅放宽人口
  world.expansions++;
  const acx = (world.active.x0 + world.active.x1) / 2;
  const acy = (world.active.y0 + world.active.y1) / 2;

  let nx, ny, d;
  const unclaimed = world.islands.filter(o => !o.claimed);
  if (unclaimed.length) {
    unclaimed.sort((a, b) =>
      (Math.abs(a.x - acx) + Math.abs(a.y - acy)) - (Math.abs(b.x - acx) + Math.abs(b.y - acy)));
    const target = unclaimed[0];
    target.claimed = true;
    nx = target.x | 0; ny = target.y | 0; d = { name: pickIslandName(target) };
    generateAndReveal(nx - target.r - 10, ny - target.r - 10, nx + target.r + 10, ny + target.r + 10, true);
  } else {
    // 在岛群外缘随机方向造新岛，与既有岛保持距离
    let sx = 0, sy = 0, maxD = 0;
    for (const o of world.islands) { sx += o.x; sy += o.y; }
    sx /= world.islands.length; sy /= world.islands.length;
    for (const o of world.islands) maxD = Math.max(maxD, Math.hypot(o.x - sx, o.y - sy));
    nx = ny = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = rand() * Math.PI * 2;
      const dist = maxD + 45 + rand() * 30;
      const cx2 = Math.round(sx + Math.cos(a) * dist), cy2 = Math.round(sy + Math.sin(a) * dist);
      if (world.islands.every(o => Math.hypot(o.x - cx2, o.y - cy2) > 50)) { nx = cx2; ny = cy2; break; }
    }
    if (nx === 0 && ny === 0) { world.popCap += 20; world.expansions--; return; }
    const r = 14 + randInt(0, 5);
    world.islands.push({ x: nx, y: ny, r, claimed: true });
    d = { name: pickName(false) };
    generateAndReveal(nx - r - 10, ny - r - 10, nx + r + 10, ny + r + 10, true);
  }

  // 更新开发包围盒
  world.active.x0 = Math.min(world.active.x0, nx - 25);
  world.active.y0 = Math.min(world.active.y0, ny - 25);
  world.active.x1 = Math.max(world.active.x1, nx + 25);
  world.active.y1 = Math.max(world.active.y1, ny + 25);

  // 航线工程：主城 → 新区，7 格宽条带。浅水架桥（快），深海填海（慢），山移平，林砍开
  // 走廊可能落在未生成区，先生成走廊带再立项
  const sx0 = world.store.x, sy0 = world.store.y;
  const steps = Math.max(Math.abs(nx - sx0), Math.abs(ny - sy0));
  const dxs = (nx - sx0) / steps, dys = (ny - sy0) / steps;
  const pxv = -dys, pyv = dxs;
  generateAndReveal(
    Math.min(sx0, nx) - 8, Math.min(sy0, ny) - 8,
    Math.max(sx0, nx) + 8, Math.max(sy0, ny) + 8, true
  );
  let bridges = 0, fills = 0, digs = 0;
  const seen = new Set();
  const addWork = (x, y) => {
    if (seen.has(x + "|" + y)) return;
    seen.add(x + "|" + y);
    const t = tileAt(x, y);
    if (t === T.WATER) { tasksAdd({ type: "BRIDGE", x, y }); bridges++; }
    else if (t === T.DEEP) { tasksAdd({ type: "FILL", x, y }); fills++; }
    else if (t === T.TREE || t === T.MOUNTAIN) { tasksAdd({ type: "DIG", x, y }); digs++; }
  };
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(sx0 + dxs * i), y = Math.round(sy0 + dys * i);
    for (const w of [-3, -2, -1, 0, 1, 2, 3]) addWork(Math.round(x + pxv * w), Math.round(y + pyv * w));
    if (i % 7 === 0 && tileAt(x, y) === T.GRASS) {
      const roadSettle = nearestSettlement(x, y);
      if (roadSettle) {
        const stock = ensureStock(roadSettle);
        if (stock.stone >= 1) { stock.stone -= 1; setTile(x, y, T.PATH); }
      }
    }
  }

  // 新区配套：粮仓直接落成 + 预置建房/开荒任务，注册新聚落
  const g = findSpot(nx, ny, 2, 10, T.GRASS);
  if (g) {
    setTile(g.x, g.y, T.HOUSE);
    world.houses.push({ x: g.x, y: g.y, granary: true });
    world.settlements.push({ x: g.x, y: g.y, name: d.name, level: 0, stock: { wood: 15, stone: 5, sand: 10 } });
    logMsg(`渡海开辟「${d.name}」，粮仓落成，聚落注册。`);
  } else {
    logMsg(`渡海开辟${d.name}，先民登岛勘察。`);
  }
  for (let i = 0; i < 3; i++) {
    const s = findSpot(nx, ny, 3, 13, T.GRASS);
    if (s) tasksAdd({ type: "BUILD", x: s.x, y: s.y });
  }
  for (let i = 0; i < 2; i++) {
    const s = findSpot(nx, ny, 3, 13, T.GRASS);
    if (s) tasksAdd({ type: "FARM", x: s.x, y: s.y });
  }

  world.popCap += SIM.EXPAND_POP_CAP;
  logMsg(`国土工程：航线上需架桥 ${bridges} 座、填海 ${fills} 处、开山伐林 ${digs} 处（人口上限 → ${world.popCap}）。`);
  populateIslandCreatures(nx, ny, 16);   // 新岛屿也有野生动物
  emit("expand");
}

function pickIslandName(o) {
  if (o.name) return o.name;   // 探索者已命名的岛沿用其名
  const s = world.settlements.find(s => Math.abs(s.x - o.x) + Math.abs(s.y - o.y) < o.r + 20);
  if (s) return s.name;
  return pickName(false);
}

// 浆果/果树/鱼群再生（sim 每秒调用一次）
function berryTick() {
  if (world.time % 60 > 1) return;   // 粗粒度：每 60 sim 秒再生一轮
  for (const [k, v] of world.berryStock) if (v < SIM.BERRY_STOCK) world.berryStock.set(k, v + 1);
  for (const [k, v] of world.fishStock) if (v < 3) world.fishStock.set(k, v + 1);
}

// 采集一份果量（返回是否成功）
function gatherBerry(x, y) {
  const k = x + "," + y;
  const v = world.berryStock.get(k) || 0;
  if (v <= 0) return false;
  world.berryStock.set(k, v - 1);
  return true;
}

// 捕一条鱼
function catchFish(x, y) {
  const k = x + "," + y;
  const v = world.fishStock.get(k) || 0;
  if (v <= 0) return false;
  world.fishStock.set(k, v - 1);
  return true;
}

// 距离 (x,y) 最近的聚落（资源产出/消耗的归属方）
function nearestSettlement(x, y) {
  let best = null, bd = 1e9;
  for (const s of world.settlements) {
    const d = Math.abs(s.x - x) + Math.abs(s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// 聚落资源库存（wood 木材 / stone 石材 / sand 沙土；粮为全局共享池）
function ensureStock(s) {
  if (!s.stock) s.stock = { wood: 0, stone: 0, sand: 0 };
  return s.stock;
}

// 联合库存：国家级工程（架桥/造陆）跨聚落汇总与扣费
function jointStock(res) {
  return world.settlements.reduce((sum, s) => sum + (s.stock ? s.stock[res] || 0 : 0), 0);
}
function jointConsume(res, n) {
  for (const s of world.settlements) {
    const st = ensureStock(s);
    const take = Math.min(st[res] || 0, n);
    if (take > 0) { st[res] -= take; n -= take; }
    if (n <= 0) return;
  }
}

// ---- tile 改造：按任务类型决定成果 ----
function workTile(task, amount) {
  const x = task.x, y = task.y;
  const c = world.chunks.get(chunkKey(x >> 5, y >> 5));
  if (!c || !c.gen) return false;
  const t = c.tiles[cIdx(x, y)];
  const meta = TILE_META[t];
  let hpMax, target;
  if (task.type === "DIG" && meta.diggable) { hpMax = meta.hp; target = meta.digTo; }
  else if (task.type === "FILL" && meta.fillable) { hpMax = meta.hp; target = meta.fillTo; }
  else if (task.type === "BRIDGE" && meta.bridgeable) { hpMax = SIM.BRIDGE_HP; target = T.BRIDGE; }
  else return false;

  const i = cIdx(x, y);
  if (c.hp[i] <= 0) c.hp[i] = hpMax;
  c.hp[i] -= amount;
  if (c.hp[i] <= 0) {
    setTile(x, y, target);
    return true;
  }
  return false;
}


"use strict";
// ============ 任务系统：建造 / 开荒 / 移山 / 填海 ============

let _taskId = 1;
const tasks = {
  list: [],
};

const TASK_DEFAULT_NEED = { BUILD: 10, FARM: 9, GATHER: 4, HUNT: 6, PASTURE: 16, CAPTURE: 5, FISH: 5, PLANT: 6, QUARRY: 18, SANDPIT: 12, PLANT_BERRY: 5, BRIDGE: 3 };
// 工程资源消耗：架桥耗木材、造陆耗沙土（完工时从最近聚落库存扣除）
const TASK_RESOURCE_COST = { BRIDGE: { wood: 1 }, FILL: { sand: 2 } };

function tasksAdd(t) {
  t.id = _taskId++;
  t.progress = 0;
  t.need = t.need !== undefined ? t.need : (TASK_DEFAULT_NEED[t.type] || 0); // 兜底：漏设 need 的任务永不完工、占死名额
  t.workers = new Set();
  if (t.type === "BUILD" || t.type === "FARM" || t.type === "PASTURE") setTile(t.x, t.y, T.SITE); // 立项即圈地
  tasks.list.push(t);
  return t;
}

function tasksPending(type, excludeFrozen) {
  return tasks.list.filter(t => (!type || t.type === type) && !t.done && (!excludeFrozen || (t.blockedCount || 0) < 3));
}

// 任务 → 职业偏好映射（DIG 按 res 区分伐木/采石）
function taskJobPref(t) {
  switch (t.type) {
    case "FARM": return "FARM";
    case "BUILD": case "PASTURE": case "PLANT": case "PLANT_BERRY": case "QUARRY": case "SANDPIT": return "BUILD";
    case "HUNT": case "CAPTURE": return "HUNT";
    case "FISH": return "FISH";
    case "DIG": return t.res === "stone" ? "DIG_STONE" : "DIG_WOOD";
    default: return null;
  }
}

// 小人领取任务：职业匹配者优先（不锁死，防止没人干导致停摆）；
// 工程任务资源不足时跳过（小人转去做资源采集，不空转）；
// 先做"够得着"的（blockedCount 低者优先），再按距离取最近
function tasksTake(agent) {
  const ax = agent.x | 0, ay = agent.y | 0;
  const myJob = JOBS[agent.job] ? JOBS[agent.job].task : null;
  let best = null, bestScore = Infinity;
  for (const t of tasks.list) {
    if (t.done) continue;
    if ((t.blockedCount || 0) >= 3) continue;
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const lack = Object.keys(cost).some(k => jointStock(k) < cost[k]);
      if (lack) continue;   // 库存不够一格的 → 不领
    }
    const cap = t.type === "BUILD" || t.type === "FARM" ? 2 : 4;
    if (t.workers.size >= cap) continue;
    const d = Math.abs(t.x - ax) + Math.abs(t.y - ay);
    const jobMatch = myJob && taskJobPref(t) === myJob ? 1 : 0;
    const score = (t.blockedCount || 0) * 100000 + d * 10 - jobMatch * 5000;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function tasksRelease(t, agent) {
  if (t) t.workers.delete(agent);
}

function tasksFinish(t) {
  t.done = true;
  // 同任务的其他工人：引用清空 + 状态复位（否则他们对已完成任务继续施工——卡死/重复结算）
  for (const w of t.workers) {
    if (w.task === t) { w.task = null; w.onArrive = null; }
    if (w.state === "work") w.state = "idle";
  }
  t.workers.clear();
  const i = tasks.list.indexOf(t);
  if (i >= 0) tasks.list.splice(i, 1);

  // 改造完成会改变通行性，解锁附近被冻结的任务
  for (const k of tasks.list) {
    if (Math.abs(k.x - t.x) + Math.abs(k.y - t.y) < 30) k.blockedCount = 0;
  }

  switch (t.type) {
    case "BUILD": {
      setTile(t.x, t.y, T.HOUSE);
      // 楼层：文明时代的高楼社区任务指定 3 层；城镇辖区 2 层小楼；其余平房
      const s = world.settlements.find(k => Math.abs(k.x - t.x) + Math.abs(k.y - t.y) <= SIM.SETTLEMENT_RADIUS);
      const floors = t.floors || (s ? (s.level >= 3 ? 3 : s.level >= 2 ? 2 : 1) : 1);
      world.houses.push({ x: t.x, y: t.y, floors });
      logMsg(`新居落成（${world.houses.length} 座房屋）。`);
      emit("build-done");
      break;
    }
    case "FARM": {
      setTile(t.x, t.y, T.FARM);
      world.farms.push({ x: t.x, y: t.y, grow: randRange(0, SIM.FARM_MATURITY * 0.5) });
      logMsg(`开垦新农田（共 ${world.farms.length} 块）。`);
      emit("farm-done");
      break;
    }
    case "DIG": {
      const was = tileAt(t.x, t.y);
      setTile(t.x, t.y, T.GRASS);
      // 产出由工人搬运回仓：伐木得木材、采石得石材
      if (was === T.TREE) return { res: "wood", amount: 4 };
      if (was === T.MOUNTAIN) return { res: "stone", amount: 5 };
      break;
    }
    case "FILL": {
      const s = nearestSettlement(t.x, t.y);
      if (s) ensureStock(s).sand += 2;   // 挖海泥回填，就地结算
      setTile(t.x, t.y, T.SAND);
      break;
    }
    case "BRIDGE": {
      setTile(t.x, t.y, T.BRIDGE);
      logThrottled("工匠们在海峡上架起了木桥。", 30);
      break;
    }
    case "PLANT": {
      setTile(t.x, t.y, T.TREE);   // 种树：木材可持续再生
      logThrottled("居民种下了新的树苗，森林会慢慢长回来。", 30);
      break;
    }
    case "PLANT_BERRY": {
      // 种浆果：从现有丛采种培育新丛（果量 1 份起步，随时间再生到 3）
      setTile(t.x, t.y, T.BERRY);
      world.berryStock.set(t.x + "," + t.y, 1);
      logThrottled("居民培育了新的浆果丛，来年就有源源不断的果子。", 30);
      break;
    }
    case "FISH": {
      if (catchFish(t.fishX, t.fishY)) return { res: "food", amount: 4 };
      break;
    }
    case "GATHER": {
      // 采集：浆果/果树 → 粮；沙滩 → 沙土（产出由工人搬运回仓）
      if (t.res === "sand") return { res: "sand", amount: 2 };
      if (gatherBerry(t.x, t.y)) return { res: "food", amount: SIM.GATHER_YIELD };
      break;
    }
    case "HUNT": {
      // 狩猎：猎物从世界移除，肉由猎手搬运回仓
      const c = t.creature;
      if (c && !c.dead) {
        c.dead = true;
        return { res: "food", amount: huntReward(c) };
      }
      break;
    }
    case "PASTURE": {
      setTile(t.x, t.y, T.PASTURE);
      // 自动圈地：牧场四周立起围栏，圈养的牲畜从此只能在栏内活动
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const tt = tileAt(t.x + dx, t.y + dy);
          if (tt === T.GRASS || tt === T.SAND) setTile(t.x + dx, t.y + dy, T.FENCE);
        }
      }
      world.pastures.push({ x: t.x, y: t.y });
      logMsg(`新的牧场建成了，围栏圈地，圈养的牲畜将定期供给奶食。`);
      break;
    }
    case "QUARRY": {
      setTile(t.x, t.y, T.QUARRY);
      world.quarries.push({ x: t.x, y: t.y });
      logMsg(`采石场在洞穴旁建成，石材将源源不断。`);
      break;
    }
    case "SANDPIT": {
      setTile(t.x, t.y, T.SANDPIT);
      world.sandpits.push({ x: t.x, y: t.y });
      logMsg(`河滩沙场开工，沙土供给稳定了。`);
      break;
    }
    case "CAPTURE": {
      // 捕获：把野生牲畜安置进牧场
      const c = t.creature;
      if (c && !c.dead && c.isWild()) {
        c.pasture = { x: t.pasture.x, y: t.pasture.y };
        c.x = t.pasture.x + 0.5; c.y = t.pasture.y + 0.5;
        logThrottled("牧民把新的牲畜赶进了牧场。", 25);
      }
      break;
    }
  }
}


"use strict";
// ============ 动物实体：牛 / 羊 / 狗 ============
// 牛羊：野生兽群游荡，可狩猎（HUNT）；城邦时代后可捕获圈养（牧场产粮+繁殖）
// 狗：聚落伙伴，跟随最近的小人，主人狩猎时在旁助阵（围堵猎物）

const CREATURE_META = {
  cow:  { name: "牛",  yield: 8, speed: 0.55, flee: 1.1, size: 1.0 },
  goat: { name: "羊",  yield: 5, speed: 0.7,  flee: 1.25, size: 0.8 },
  dog:  { name: "狗",  yield: 0, speed: 2.2,  flee: 0,   size: 0.55 },
};

const creatures = [];

class Creature {
  constructor(x, y, type) {
    const meta = CREATURE_META[type];
    const spAge = SPECIES_AGE[type];
    this.type = type;
    this.x = x + 0.5; this.y = y + 0.5;
    this.speed = meta.speed;
    this.dead = false;
    this.age = randRange(spAge.stages[1], spAge.stages[2]);   // 初始青年~中年
    this.pasture = null;      // {x,y} 圈养位置（null = 野生）
    this.moveCd = randRange(0, 2);
    this.breedCd = 120;
    this.outputCd = SIM.PASTURE_INTERVAL;
  }

  isWild() { return !this.pasture && this.type !== "dog"; }

  update(dt) {
    if (this.dead) return;
    // 年龄：1 游戏年长 1 岁，寿命封顶
    const spAge = SPECIES_AGE[this.type];
    this.age = Math.min(spAge.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));
    if (this.pasture) { this.updatePasture(dt); return; }
    if (this.type === "dog") { this.updateDog(dt); return; }
    this.updateWild(dt);
  }

  // 野生：游荡；有猎人逼近则远离（附近有狗则逃跑变慢——被围堵）
  updateWild(dt) {
    // 逃跑判定
    let threat = null, threatD = 2.8;
    for (const a of agents) {
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      if (d < threatD) { threatD = d; threat = a; }
    }
    let dogNear = false;
    for (const c of creatures) {
      if (c.type === "dog" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 4) { dogNear = true; break; }
    }
    if (threat) {
      const sp = (dogNear ? 0.55 : CREATURE_META[this.type].flee) * dt;
      const dx = this.x - threat.x, dy = this.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      this.moveBy((dx / d) * sp, (dy / d) * sp);
      return;
    }
    // 游荡
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const nx = Math.round(this.x + Math.cos(a) * 2), ny = Math.round(this.y + Math.sin(a) * 2);
      if (walkable(nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);
  }

  // 狗：认定了固定主人就一生跟随（主人去世后才重新认主）
  // 狗：野生幼犬需要被驯化——有人靠近停留累计驯化进度，成功后一生认定固定主人
  updateDog(dt) {
    if (!this.tamed || !this.owner || this.owner.dead) {
      // 未驯化（或主人去世重新待驯）：游荡 + 驯化检测
      this.tamed = false;
      this.owner = null;
      this.moveCd -= dt;
      if (this.moveCd <= 0) {
        this.moveCd = 1.5 + rand() * 2;
        const a = rand() * Math.PI * 2;
        const nx = Math.round(this.x + Math.cos(a) * 2), ny = Math.round(this.y + Math.sin(a) * 2);
        if (walkable(nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
      }
      if (this.target) this.stepToward(this.target, this.speed * dt);
      // 驯化：有小人靠近（1.5 格内）累计驯化度，喜爱牲畜的人在旁进度翻倍
      let tamer = null, tamerD = 1.5;
      for (const a of agents) {
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d < tamerD) { tamerD = d; tamer = a; }
      }
      if (tamer) {
        this.tameness += dt * (tamer.hobby === "animal" ? 2 : 1);
        if (this.tameness >= 3) {
          this.tamed = true;
          this.owner = tamer;
          logThrottled(`${tamer.name} 驯服了一条狗，狗认定他为主人。`, 15);
        }
      }
      return;
    }
    const d = Math.hypot(this.owner.x - this.x, this.owner.y - this.y);
    if (d > 4) this.stepToward(this.owner, this.speed * dt);
  }

  // 圈养：在栏内小范围活动，定期产粮 + 繁殖
  updatePasture(dt) {
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 1.5 + rand() * 2;
      const a = rand() * Math.PI * 2;
      const tx = this.pasture.x + 0.5 + Math.cos(a) * 2.5, ty = this.pasture.y + 0.5 + Math.sin(a) * 2.5;
      if (walkable(Math.round(tx), Math.round(ty))) this.target = { x: tx, y: ty };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);

    this.outputCd -= dt;
    if (this.outputCd <= 0) {
      this.outputCd = SIM.PASTURE_INTERVAL;
      world.food += SIM.PASTURE_YIELD;
    }
    this.breedCd -= dt;
    if (this.breedCd <= 0) {
      this.breedCd = 120;
      const pen = creatures.filter(c => c.pasture && !c.dead && c.type === this.type &&
        Math.abs(c.x - this.pasture.x) + Math.abs(c.y - this.pasture.y) < 6);
      if (pen.length < SIM.PASTURE_CAP && rand() < SIM.BREED_CHANCE) {
        spawnCreature(this.pasture.x, this.pasture.y, this.type, true);
      }
    }
  }

  stepToward(t, step) {
    const dx = t.x - this.x, dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) { this.x = t.x; this.y = t.y; this.target = null; return; }
    this.moveBy((dx / d) * step, (dy / d) * step);
  }

  moveBy(mx, my) {
    const nx = this.x + mx, ny = this.y + my;
    if (walkable(Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
    else this.target = null;
  }
}

function spawnCreature(x, y, type, captured) {
  const c = new Creature(x, y, type);
  if (captured) c.pasture = { x, y };
  // 狗出生时是野生的，需要有人靠近驯化后才会认主
  creatures.push(c);
  return c;
}

// 在一座岛上散布兽群（按草地面积，牛羊混编）
function populateIslandCreatures(bx, by, r) {
  let grass = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (tileAt(bx + dx, by + dy) === T.GRASS) grass++;
  if (grass < 12) return 0;
  const herds = 1 + Math.floor(grass / 60);
  let n = 0;
  for (let h = 0; h < herds; h++) {
    const type = rand() < 0.5 ? "cow" : "goat";
    const cnt = type === "cow" ? 3 + randInt(0, 3) : 4 + randInt(0, 4);
    const cx = bx + randInt(-r + 3, r - 3), cy = by + randInt(-r + 3, r - 3);
    for (let i = 0; i < cnt; i++) {
      const s = findSpot(cx, cy, 0, 4, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, type); n++; }
    }
  }
  return n;
}

// 野生总量自然增长（防止猎绝；有上限）
function wildBreedTick() {
  if (world.time % 120 > 1) return;
  const wild = creatures.filter(c => c.isWild() && !c.dead);
  if (wild.length >= SIM.WILD_BREED_CAP || wild.length < 4) return;
  const c = wild[randInt(0, wild.length - 1)];
  const p = findSpot(Math.round(c.x), Math.round(c.y), 0, 3, T.GRASS);
  if (p) spawnCreature(p.x, p.y, c.type);
}

// 狩猎收益
function huntReward(c) {
  return CREATURE_META[c.type].yield;
}


"use strict";
// ============ 小人 Agent ============

// 命名：尽量不重复（池约 8000 组合，耗尽后允许重名）
const _SURNAMES = ["张", "王", "李", "陈", "杨", "赵", "周", "吴", "郑", "孙", "林", "何", "高", "苏", "叶", "宋", "罗", "程", "袁", "许"];
const _GIVEN = ["石", "禾", "安", "松", "竹", "梅", "青", "远", "川", "云", "枫", "桥", "岚", "星", "野", "宁", "秋", "白", "舟", "棠"];
const _usedNames = new Set();
function pickAgentName() {
  for (let i = 0; i < 40; i++) {
    const n = _SURNAMES[randInt(0, _SURNAMES.length - 1)] +
              _GIVEN[randInt(0, _GIVEN.length - 1)] +
              (rand() < 0.4 ? _GIVEN[randInt(0, _GIVEN.length - 1)] : "");
    if (!_usedNames.has(n)) { _usedNames.add(n); return n; }
  }
  return "居民" + (agents.length + 1);
}

// 原住民部落小名
const _NATIVE = ["岩", "木", "禾", "川", "石", "叶", "风", "泉", "星", "鹿", "火", "溪"];
const pickNativeName = () => "阿" + _NATIVE[randInt(0, _NATIVE.length - 1)];

let _agentIdSeq = 1;

// 职业表与社会需求比例：探险家看探索欲、工匠看勤劳，其余随机
const JOBS = {
  farmer:      { name: "农夫",   task: "FARM" },
  lumberjack:  { name: "伐木工", task: "DIG_WOOD" },
  miner:       { name: "采石工", task: "DIG_STONE" },
  hunter:      { name: "猎人",   task: "HUNT" },
  fisher:      { name: "渔民",   task: "FISH" },
  builder:     { name: "工匠",   task: "BUILD" },
  explorer:    { name: "探险家", task: null },
};
const _JOB_POOL = ["farmer", "farmer", "lumberjack", "miner", "hunter", "fisher", "builder"];

// 喜好（私人生活倾向，驱动空闲时的自发行为）：
// explore 向往远方 / homebody 恋家 / animal 喜爱牲畜（陪伴加成牧场） / fishing 垂钓 / none 随遇而安
const _HOBBY_ROLL = () => {
  const r = rand();
  return r < 0.22 ? "explore" : r < 0.44 ? "homebody" : r < 0.64 ? "animal" : r < 0.84 ? "fishing" : "none";
};

class Agent {
  constructor(x, y, native) {
    this.x = x + 0.5; this.y = y + 0.5;   // 浮点 tile 坐标，格中心
    this.id = _agentIdSeq++;               // 稳定唯一 id（名册引用，不受数组增删影响）
    this.dead = false;
    this.native = !!native;                // 原住民（被发现岛屿上的部落居民）
    this.name = this.native ? pickNativeName() : pickAgentName();

    // 个体属性（0~1，人各不同）
    this.adventure = this.native ? randRange(0.5, 1) : randRange(0.05, 1); // 探索欲：高的常远行，低的恋家
    this.diligence = randRange(0.25, 1);   // 勤劳：影响干活效率
    this.age = randRange(16, 45);          // 岁数：1 游戏年（12 昼夜）长 1 岁
    // 职业：探险家看探索欲，工匠看勤劳，其余按社会需求比例随机
    this.job = this.adventure > 0.75 ? "explorer"
             : this.diligence > 0.8 ? "builder"
             : _JOB_POOL[randInt(0, _JOB_POOL.length - 1)];
    // 喜好：与探索欲自洽——爱探索的人探索欲天然高，宅家的人天然低
    this.hobby = this.adventure > 0.7 ? "explore"
               : this.adventure < 0.22 ? "homebody"
               : _HOBBY_ROLL();
    this.hunger = randRange(60, 100);      // 100 = 吃饱
    this.energy = randRange(55, 100);
    this.home = null;                      // {x,y} 房屋
    this.task = null;
    this.path = null;
    this.pi = 0;
    this.state = "idle";                   // idle/walk/eat/sleep/work
    this.thinkCd = randRange(0, 0.5);      // 决策冷却，防抖
    this.speed = SIM.AGENT_SPEED * randRange(0.85, 1.2);
    this.phase = rand() * 10;              // 动画相位
    this.starving = false;
  }

  update(dt) {
    this.phase += dt;
    this.thinkCd -= dt;
    // 年龄：1 游戏年（12 昼夜）长 1 岁，寿命封顶
    this.age = Math.min(SPECIES_AGE.human.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));

    // ---- 登岛命名：第一个踏上未知岛屿的人为它取名 ----
    this.islandCheckCd = (this.islandCheckCd || 0) - dt;
    if (this.islandCheckCd <= 0) {
      this.islandCheckCd = 1;
      const tx = Math.round(this.x), ty = Math.round(this.y);
      const standing = tileAt(tx, ty);
      if (standing !== T.VOID && standing !== T.DEEP && standing !== T.WATER) {
        for (const o of world.islands) {
          if (o.name) continue;   // 已有名字的岛跳过
          if (Math.hypot(o.x - tx, o.y - ty) <= o.r + 1) {
            o.name = pickName(false);
            logMsg(`${this.name} 第一个登上未知岛屿，将它命名为「${o.name}」。`);
            emit("island-named", o);
            break;
          }
        }
      }
    }

    // ---- 死亡机制 ----
    // 老死：进入老年后每天判定，越老概率越高（60 岁日均 1%，此后每岁 +0.3%）
    if (this.age >= SPECIES_AGE.human.stages[2]) {
      this.oldAgeRoll = (this.oldAgeRoll || 0) + dt;
      if (this.oldAgeRoll >= SIM.DAY_LEN) {
        this.oldAgeRoll = 0;
        const over = this.age - SPECIES_AGE.human.stages[2];
        if (rand() < 0.01 + over * 0.003) { this.die("寿终正寝"); return; }
      }
    }
    // 生病：饥饿或精力归零持续 30 秒 → 病倒；再持续 60 秒无救治 → 死亡
    //      痊愈条件：饱食与精力都恢复到 40 以上
    const ailment = this.hunger <= 0 ? "hunger" : (this.energy <= 0 ? "energy" : null);
    if (ailment) {
      this.ailmentCd = (this.ailmentCd || 0) + dt;
      if (!this.sick && this.ailmentCd > 30) {
        this.sick = true;
        this.sickSource = ailment;
        this.sickTime = 0;
        logThrottled(`${this.name} 病倒了……`, 10);
      }
      if (this.sick) {
        this.sickTime += dt;
        if (this.sickTime > 60) {
          this.die(ailment === "hunger" ? "因长期饥饿病倒，不治身亡" : "积劳成疾，撒手人寰");
          return;
        }
      }
    } else {
      this.ailmentCd = 0;
      if (this.sick && this.hunger > 40 && this.energy > 40) {
        this.sick = false;
        logThrottled(`${this.name} 痊愈了，重新投入生活。`, 20);
      }
    }

    // 需求演化
    this.hunger -= SIM.HUNGER_DECAY * dt;
    if (this.state !== "sleep") this.energy -= SIM.ENERGY_DECAY * dt;

    if (this.hunger <= 0) {
      this.hunger = 0;
      if (!this.starving) { this.starving = true; logThrottled("有人饿着肚子在挨饿！", 8); }
    } else this.starving = false;

    // 长期挨饿 → 迁居到食物充裕的街区（饥饿的后果不是死亡，是搬家）
    if (this.hunger < 10) this.starveT = (this.starveT || 0) + dt;
    else this.starveT = 0;
    if (this.starveT > 40) { this.starveT = 0; this.migrate(); }

    if (this.thinkCd <= 0) { this.thinkCd = 0.4 + rand() * 0.3; this.decide(); }

    switch (this.state) {
      case "walk": this.stepAlong(dt); break;
      case "eat":
        if (world.food > 0) {
          world.food -= 1; this.hunger = 100;
          this.state = "idle";
        } else { this.state = "idle"; } // 没粮，回去等规划器开荒
        break;
      case "sleep":
        this.energy += SIM.ENERGY_REGEN * dt;
        if (this.energy >= 100 || isDaytime()) this.state = "idle";
        break;
      case "work": this.doWork(dt); break;
    }
  }

  decide() {
    if (this.state === "sleep") return;
    // 有明确目的地的行走途中不做重新决策，防止反复重设路径
    if (this.state === "walk" && this.onArrive) return;
    const night = !isDaytime();

    // 1. 累了或天黑 → 回家睡（工作可以被打断，活着比干活重要）
    if (this.energy < 18 || (night && this.energy < 92)) {
      this.goSleep();
      return;
    }
    // 2. 饿了 → 就近取食（最近的农田或粮仓）
    if (this.hunger < 30) {
      const dest = this.nearestFoodSpot();
      if (dest && this.goTo(dest.x, dest.y)) {
        this.state = "walk";
        this.onArrive = () => { this.state = "eat"; };
        return;
      }
    }
    // 3. 领任务干活
    if (!this.task) {
      const t = tasksTake(this);
      if (t) {
        this.task = t;
        t.workers.add(this);
        if (this.goTo(t.x, t.y)) {
          this.state = "walk";
          this.onArrive = () => { this.state = "work"; };
          return;
        }
        // 去不了工地 → 记一次"路不通"，累计 3 次该任务冻结（等周边改造后解锁）
        t.blockedCount = (t.blockedCount || 0) + 1;
        this.abandonTask();
        return;
      }
    } else if (this.state !== "work" && this.state !== "walk") {
      // 手上有任务但走丢了（被打断）→ 继续去工地
      if (this.goTo(this.task.x, this.task.y)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; return; }
    }
    // 3.5 搬运：身上有产出先送回仓库入库（名称即语义：仓库里的才算资源）
    if (this.carrying && this.state === "idle") {
      const s = nearestSettlement(Math.round(this.x), Math.round(this.y));
      if (s && this.goTo(s.x, s.y)) {
        this.state = "walk";
        this.onArrive = () => this.deposit();
        return;
      }
      this.deposit();   // 仓库不可达的兜底（就地登记入库）
    }

    // 4. 探索欲：高探索欲的居民会主动向未知远方进发（点亮虚空、发现新岛）
    if (!this.task) {
      if (this.exploring) {
        // 探索旅程进行中：精力/饥饿尚可且腿数未满 → 继续向外延伸
        if (this.energy > 30 && this.hunger > 40 && this.exploreLegs < 2 + this.adventure * 4) {
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
        this.exploring = null;   // 探索结束
      } else if (this.state === "idle" && rand() < SIM.EXPLORE_CHANCE * this.adventure) {
        // 选方向：8 向采样，优先「虚空出现最近」的方向
        let best = null;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
          const dx = Math.cos(a), dy = Math.sin(a);
          let voidAt = Infinity;
          for (let k = 4; k <= 18; k++) {
            if (tileAt(Math.round(this.x + dx * k), Math.round(this.y + dy * k)) === T.VOID) { voidAt = k; break; }
          }
          if (!best || voidAt < best.voidAt) best = { dx, dy, voidAt };
        }
        if (best && best.voidAt < Infinity) {
          this.exploring = best;
          this.exploreLegs = 0;
          logThrottled("有居民怀着探索的欲望向未知的远方进发。", 20);
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
      }
    }

    // 5. 闲逛（恋家的人活动半径更小）
    if (this.state === "idle") {
      const homebody = this.adventure < 0.3;
      const tx = (this.x | 0) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      const ty = (this.y | 0) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      if (this.goTo(tx, ty)) this.state = "walk";
    }
  }

  // 入库：把搬运的产出登记进仓库（粮为全局共享池，其余进最近聚落库存）
  deposit() {
    if (!this.carrying) return;
    const { res, amount } = this.carrying;
    this.carrying = null;
    if (res === "food") {
      world.food += amount;
    } else {
      const s = nearestSettlement(Math.round(this.x), Math.round(this.y));
      if (s) ensureStock(s)[res] += amount;
    }
  }

  // 死亡结算：释放任务与住房，通知世界（背包里的产出随之散失）
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    if (this.task) { tasksRelease(this.task, this); this.task = null; }
    this.home = null;
    logMsg(`${this.name} ${reason}，享年 ${Math.floor(this.age)} 岁。`);
    emit("agent-death", this);
  }

  // 探索延伸一腿：从小人当前位置贴身向前点亮（斑块与脚下接壤），然后走向点亮区
  exploreLeg() {
    // 前方 2~5 格处为点亮中心，保证斑块边缘与当前位置接壤
    const dist = 3 + rand() * 3;
    const tx = Math.round(this.x + this.exploring.dx * dist);
    const ty = Math.round(this.y + this.exploring.dy * dist);
    revealArea(tx, ty, randRange(5, SIM.REVEAL_RADIUS));
    // 走向点亮区前沿（而非跳过它）
    const stepTo = Math.min(dist, 5);
    const gx = Math.round(this.x + this.exploring.dx * stepTo);
    const gy = Math.round(this.y + this.exploring.dy * stepTo);
    if (this.goTo(gx, gy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    // 前沿走不通（点亮后仍是海/山）→ 尝试侧向一次
    const sx = Math.round(this.x + (this.exploring.dx * 0.7 - this.exploring.dy * 0.7) * dist);
    const sy = Math.round(this.y + (this.exploring.dy * 0.7 + this.exploring.dx * 0.7) * dist);
    revealArea(sx, sy, randRange(4, SIM.REVEAL_RADIUS * 0.7));
    if (this.goTo(sx, sy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    logThrottled("探索者抵达了已知世界的边缘，止步于茫茫大海。", 25);
    this.exploring = null;
    this.state = "idle";
  }

  goSleep() {
    if (this.home && this.goTo(this.home.x, this.home.y)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "sleep"; };
    } else {
      this.state = "sleep"; // 没家，就地睡（心情差点，v1 不建模心情）
    }
  }

  // 最近的进食点：粮仓（含新区粮仓）或任一农田，避免全城挤一个仓
  nearestFoodSpot() {
    return nearestFoodTo(this.x, this.y).spot;
  }

  // 设置去 (tx,ty) 的路径；顺带处理"路被堵"→ 触发移山填海
  goTo(tx, ty) {
    const r = findPath(this.x | 0, this.y | 0, tx, ty);
    if (r && r.path) {
      this.path = r.path; this.pi = 0;
      return true;
    }
    // 不可达：如果挡路的是山/水/树，有概率立项改造（协作修路的来源之一）
    if (r && r.blocked && rand() < 0.6) {
      const b = r.blocked;
      const t = tileAt(b.x, b.y);
      const meta = TILE_META[t];
      if (meta.diggable || meta.fillable) {
        const exist = tasks.list.find(k => !k.done && k.x === b.x && k.y === b.y);
        if (!exist) {
          const type = meta.diggable ? "DIG" : (meta.bridgeable ? "BRIDGE" : "FILL");
          tasksAdd({ type, x: b.x, y: b.y });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的${meta.name}挡住了去路，立项${type === "BRIDGE" ? "架桥" : "改造"}。`, 15);
        }
      }
    }
    return false;
  }

  // 迁居：放弃旧居，搬到最近进食点旁"还有名额"的房子
  migrate() {
    this.home = null;
    const spot = this.nearestFoodSpot();
    let best = null, bestD = Infinity;
    for (const h of world.houses) {
      const d = Math.abs(h.x - spot.x) + Math.abs(h.y - spot.y);
      const occ = agents.filter(a => a.home && a.home.x === h.x && a.home.y === h.y).length;
      if (d < bestD && occ < 3) { bestD = d; best = h; }
    }
    if (best) this.home = { x: best.x, y: best.y };
    logThrottled("饥民迁居：一批人搬往食物充裕的街区。", 60);
  }

  abandonTask() {
    if (!this.task) return;
    tasksRelease(this.task, this);
    this.task = null;
    this.state = "idle";
  }

  stepAlong(dt) {
    if (!this.path || this.pi >= this.path.length) {
      this.path = null;
      if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); }
      else this.state = "idle";
      return;
    }
    const target = this.path[this.pi];
    const gx = target.x + 0.5, gy = target.y + 0.5;
    const dx = gx - this.x, dy = gy - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this.x = gx; this.y = gy;
      this.pi++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  doWork(dt) {
    const t = this.task;
    if (!t) { this.state = "idle"; return; }
    if (t.done) { this.task = null; this.state = "idle"; return; }   // 任务已被其他工人完成（防御网）

    // 狩猎/捕获：猎物会跑，实时追踪；猎物消失则任务作废
    let gx = t.x, gy = t.y, chaseR = 2.2;
    if (t.creature) {
      if (t.creature.dead) { this.abandonTask(); return; }
      gx = t.creature.x - 0.5; gy = t.creature.y - 0.5;
      chaseR = 1.4;
      const d = Math.hypot(gx + 0.5 - this.x, gy + 0.5 - this.y);
      if (d > 3.5) {
        if (this.goTo(Math.round(gx), Math.round(gy))) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
        else this.abandonTask();
        return;
      }
    }
    const d = Math.abs((gx + 0.5) - this.x) + Math.abs((gy + 0.5) - this.y);
    if (d > chaseR) {
      if (this.goTo(gx, gy)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
      else this.abandonTask();
      return;
    }
    // 干活：建造类推进任务进度；改造类直接磨 tile 血量（勤劳的人手快）
    let effort = SIM.WORK_EFFORT * (0.7 + this.diligence * 0.6) * dt;
    // 猎犬助阵：主人狩猎且随行狗在 6 格内 → 效率 ×1.5
    if (t.type === "HUNT") {
      for (const c of creatures) {
        if (c.type === "dog" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 6) {
          effort *= 1.5;
          logThrottled("猎犬紧紧咬住猎物的退路，狩猎顺利多了。", 40);
          break;
        }
      }
    }
    // 工程资源检查：架桥耗木材、造陆耗沙土（联合库存，跨聚落汇总），不足则挂起等补给
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const res = Object.keys(cost)[0];
      if (jointStock(res) < cost[res]) {
        logThrottled(`${res === "wood" ? "木材" : "沙土"}不足，工程暂停等待补给。`, 30);
        return;
      }
      t.progress += effort;
      if (t.progress >= (t.need || 0)) {
        jointConsume(res, cost[res]);   // 完工结算资源
        this.task = null;
        tasksFinish(t);
        this.state = "idle";
      }
      this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
      return;
    }
    if (t.type === "DIG") {
      // 伐木/采石：磨 tile 血量，产出由工人搬运回仓
      if (workTile(t, effort)) {
        const y = tasksFinish(t, this);   // 完成任务，取得搬运产出
        this.task = null;
        this.state = "idle";
        if (y) {
          this.carrying = y;
          this.state = "idle";           // 下一轮决策将回仓入库
        }
      }
    } else {
      // 其余任务一律进度制（建造/农牧/畜牧/采集/狩猎等），防止无出口的假 workTile 卡死
      t.progress += effort;
      if (t.progress >= t.need) {
        const y = tasksFinish(t, this);   // 完成任务，取得搬运产出
        this.task = null;
        this.state = "idle";
        if (y) {
          this.carrying = y;
          this.state = "idle";           // 下一轮决策将回仓入库
        }
      }
    }
    this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
  }
}

function isDaytime() {
  return world.timeOfDay > SIM.NIGHT_END && world.timeOfDay < SIM.NIGHT_START;
}

// 节流日志：同类消息 minGap（sim 秒）内只发一次
const _logLast = {};
function logThrottled(text, minGap) {
  const now = world.time;
  const gap = minGap || 30;
  if (_logLast[text] !== undefined && now - _logLast[text] < gap) return;
  _logLast[text] = now;
  logMsg(text);
}


"use strict";
// ============ 模拟调度：出生 / 规划器（需求聚合） / 主更新 ============

const agents = [];

function spawnAgent(x, y, native) {
  const a = new Agent(x, y, native);
  agents.push(a);
  return a;
}

// 发现岛上的原住民部落：友好相遇，帮他们盖第一座居所，并纳入世界体系
onEvent("discovery", isl => {
  carveRiver(isl);                                 // 显现的岛可能带河流
  populateIslandCreatures(Math.round(isl.x), Math.round(isl.y), Math.ceil(isl.r));   // 岛上兽群
  if (rand() >= 0.6) return;                       // 60% 的发现岛有原住民
  let born = 0;
  for (let i = 0; i < 30 && born < 2 + randInt(0, 2); i++) {
    const spot = findSpot(Math.round(isl.x), Math.round(isl.y), 0, Math.max(3, isl.r), T.GRASS);
    if (spot) { spawnAgent(spot.x, spot.y, true); born++; }
  }
  if (!born) return;
  const s = findSpot(Math.round(isl.x), Math.round(isl.y), 2, Math.max(5, isl.r), T.GRASS);
  if (s) tasksAdd({ type: "BUILD", x: s.x, y: s.y, need: 10 });
  logMsg(`探险队与远方原住民部落友好相遇（${born} 人），并为他们筹划第一座居所。`);
});

// 全局：离 (x,y) 最近的进食点（主粮仓 + 新区粮仓 + 农田）
// exclude: 排除与该坐标重合的粮仓（测锚点自身缺粮程度时用）
function nearestFoodTo(x, y, exclude) {
  let best = world.store;
  let bestD = Math.abs(world.store.x - x) + Math.abs(world.store.y - y);
  const consider = (px, py) => {
    if (exclude && px === exclude.x && py === exclude.y) return;
    const d = Math.abs(px - x) + Math.abs(py - y);
    if (d < bestD) { bestD = d; best = { x: px, y: py }; }
  };
  for (const f of world.farms) consider(f.x, f.y);
  for (const h of world.houses) {
    if (!h.granary) continue;
    consider(h.x, h.y);
  }
  return { spot: best, dist: bestD };
}

// 一群点的重心
function centroidOf(list) {
  if (!list.length) return null;
  let sx = 0, sy = 0;
  for (const a of list) { sx += a.x; sy += a.y; }
  return { x: sx / list.length, y: sy / list.length };
}

// 给无房小人分配房屋（一房三户，与"房屋容量 = 房数×3"的口径一致）
// 评分 = 离人距离×0.3 + 离食物距离×1：住得离吃的太远的房子会被强烈劝退
function assignHomes() {
  const count = {};
  const key = h => `${h.x},${h.y}`;
  for (const a of agents) {
    if (a.home) count[key(a.home)] = (count[key(a.home)] || 0) + 1;
  }
  for (const a of agents) {
    if (a.home) continue;
    let best = null, bestScore = Infinity, bestKey = null;
    for (const h of world.houses) {
      const k = key(h);
      if ((count[k] || 0) >= 3) continue;
      const food = nearestFoodTo(h.x, h.y).dist;
      const score = (Math.abs(h.x - a.x) + Math.abs(h.y - a.y)) * 0.3 + food;
      if (score < bestScore) { bestScore = score; best = h; bestKey = k; }
    }
    if (best) {
      a.home = { x: best.x, y: best.y };
      count[bestKey] = (count[bestKey] || 0) + 1;
    }
  }
}

// 选址锚点：主粮仓 + 各新区粮仓。建筑围绕各自的生活区生长，不再全部挤在出生点
function pickAnchor() {
  const anchors = [world.store];
  for (const h of world.houses) {
    if (h.granary && !(h.x === world.store.x && h.y === world.store.y)) anchors.push(h);
  }
  return anchors[randInt(0, anchors.length - 1)];
}

// ---- 规划器：聚合小人状态 → 触发世界变化 ----
function plannerTick() {
  const pop = agents.length;
  const homeless = agents.filter(a => !a.home).length;

  // 1. 住房前瞻：容量余量不足（或已有人无家）→ 建房；选址失败说明本区
  //    已无立足之地 → 直接开辟新区。房屋富余（够住且多 3 间以上）则不新建
  //    闸门只统计"还在正常推进"的任务，冻结任务不算数，防止堵死建房通道；
  //    无家者超过 6 人时无视账面容量富余，强制补建（孤立地段的房不算有效容量）
  const capacity = world.houses.length * 3;
  if ((homeless > 6 || capacity - pop <= 2) && capacity <= pop + 8 && tasksPending("BUILD", true).length < 3) {
    // 锚点优先：城邦时代后有居住区划的聚落 → 居住区；再无家者重心；再粮仓锚点
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "housing");
      if (z) { s = findSpot(z.x, z.y, 0, z.r, T.GRASS); if (s) break; }
    }
    if (!s) {
      const c = centroidOf(agents.filter(a => !a.home));
      s = c && findSpot(c.x | 0, c.y | 0, 2, 14, T.GRASS);
    }
    if (!s) {
      const a = pickAnchor();
      s = findSpot(a.x, a.y, 3, 18, T.GRASS);
    }
    if (s) {
      tasksAdd({ type: "BUILD", x: s.x, y: s.y, need: 14 });
      logThrottled(`规划署：${homeless} 人无家可归，批准在 (${s.x},${s.y}) 兴建新居。`, 10);
    } else {
      logMsg(`规划署：本区已无建房空间，人口压力迫使向外开辟疆土。`);
      expand();
      return;
    }
  }

  // 2. 粮食压力 → 多渠道补粮：农田 / 浆果采集 / 狩猎 / 畜牧（城邦解锁）
  if (world.farms.length * 6 < pop + 8 && tasksPending("FARM", true).length < 2) {
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "farm");
      if (z) { s = findSpot(z.x, z.y, 0, z.r, T.GRASS, [T.HOUSE, T.SITE]); if (s) break; }
    }
    if (!s) {
      const starving = agents.filter(a => a.hunger < 40);
      const c = starving.length >= 3 ? centroidOf(starving) : null;
      s = c && findSpot(c.x | 0, c.y | 0, 3, 16, T.GRASS, [T.HOUSE, T.SITE]);
    }
    if (!s) {
      const a = pickAnchor();
      s = findSpot(a.x, a.y, 4, 26, T.GRASS, [T.HOUSE, T.SITE]);
    }
    if (s) {
      tasksAdd({ type: "FARM", x: s.x, y: s.y, need: 9 });
      logThrottled(`规划署：粮食储备吃紧（${Math.floor(world.food)}），批准开垦 (${s.x},${s.y})。`, 10);
    }
  }
  // 2b. 采集：附近有果量充足的浆果丛/果树 → 采集队
  if (world.food < 60 + pop * 3 && tasksPending("GATHER", true).length < 2) {
    for (const [k, v] of world.berryStock) {
      if (v < 2) continue;
      const [bx, by] = k.split(",").map(Number);
      const a = pickAnchor();
      if (Math.abs(bx - a.x) + Math.abs(by - a.y) < 26 && tileAt(bx, by) !== T.VOID) {
        tasksAdd({ type: "GATHER", x: bx, y: by, need: 4 });
        break;
      }
    }
  }
  // 2c. 狩猎：附近有野生牛羊 → 猎队
  if (world.food < 60 + pop * 3 && tasksPending("HUNT", true).length < 1) {
    const a = pickAnchor();
    const wild = creatures.filter(c => c.isWild() && !c.dead &&
      Math.abs(c.x - a.x) + Math.abs(c.y - a.y) < 30 && !tasks.list.some(k => k.creature === c && !k.done));
    if (wild.length) {
      const c = wild[0];
      tasksAdd({ type: "HUNT", x: Math.round(c.x - 0.5), y: Math.round(c.y - 0.5), creature: c });
    }
  }
  // 2d. 畜牧（定居时代解锁：驯化早于城市文明）：无牧场 → 建牧场；有牧场有空位且附近有野生牲畜 → 捕获
  if (world.era >= 1) {
    if (world.pastures.length === 0 && tasksPending("PASTURE", true).length < 1) {
      const a = pickAnchor();
      const s = findSpot(a.x, a.y, 4, 14, T.GRASS);
      if (s) tasksAdd({ type: "PASTURE", x: s.x, y: s.y, need: 16 });
    } else if (world.pastures.length > 0 && tasksPending("CAPTURE", true).length < 1) {
      const pas = world.pastures[0];
      const cap = creatures.filter(c => c.isWild() && !c.dead &&
        Math.hypot(c.x - pas.x, c.y - pas.y) < 40 && c.type !== "dog" &&
        creatures.filter(k => k.pasture && k.type === c.type).length < SIM.PASTURE_CAP);
      if (cap.length) {
        const c = cap[0];
        tasksAdd({ type: "CAPTURE", x: Math.round(c.x - 0.5), y: Math.round(c.y - 0.5), creature: c, pasture: pas });
      }
    }
  }
  // 2e. 资源采集：各聚落木材/石材/沙土低于阈值 → 立项伐木/采石/采沙/植树
  for (const s of world.settlements) {
    const stock = ensureStock(s);
    const digPending = type => tasksPending("DIG", true).filter(t => t.res === type).length;
    if (stock.wood < 10 && digPending("wood") < 2) {
      const t = findSpot(s.x, s.y, 2, 16, T.TREE);
      if (t) tasksAdd({ type: "DIG", x: t.x, y: t.y, res: "wood" });
    }
    if (stock.stone < 8 && digPending("stone") < 1) {
      const t = findSpot(s.x, s.y, 2, 18, T.MOUNTAIN);
      if (t) tasksAdd({ type: "DIG", x: t.x, y: t.y, res: "stone" });
    }
    if (stock.sand < 6 && tasksPending("GATHER", true).filter(t => t.res === "sand").length < 3) {
      const t = findSpot(s.x, s.y, 2, 18, T.SAND);
      if (t) tasksAdd({ type: "GATHER", x: t.x, y: t.y, need: 4, res: "sand" });
    }
    if (stock.wood < 15 && tasksPending("PLANT", true).length < 1) {
      const t = findSpot(s.x, s.y, 3, 12, T.GRASS);
      if (t) tasksAdd({ type: "PLANT", x: t.x, y: t.y, need: 6 });
    }
    // 不可再生资源的替代渠道（城邦解锁）：洞穴旁建采石场、河滩建沙场
    if (world.era >= 2) {
      if (world.quarries.length < 2 && tasksPending("QUARRY", true).length < 1) {
        const cave = world.caves.find(cv => Math.abs(cv.x - s.x) + Math.abs(cv.y - s.y) < 60 &&
          !world.quarries.some(q => Math.abs(q.x - cv.x) + Math.abs(q.y - cv.y) < 8));
        if (cave) {
          const spot = neighborsOf(cave.x, cave.y).find(p => walkable(p.x, p.y));
          if (spot) tasksAdd({ type: "QUARRY", x: spot.x, y: spot.y, need: 18 });
        }
      }
      if (world.sandpits.length < 3 && tasksPending("SANDPIT", true).length < 1) {
        const shore = findSpot(s.x, s.y, 2, 30, T.SAND, [T.QUARRY, T.SANDPIT]);
        if (shore && neighborsOf(shore.x, shore.y).some(p => tileAt(p.x, p.y) === T.WATER)) {
          tasksAdd({ type: "SANDPIT", x: shore.x, y: shore.y, need: 12 });
        }
      }
    }
  }
  // 2g. 浆果可持续：丛数低于人口需求（且有丛可采种）→ 培育新丛
  const berryTotal = world.berryStock.size;
  const berryHealthy = [...world.berryStock.values()].filter(v => v >= 1).length;
  if ((berryTotal < 6 + Math.floor(pop / 4) || berryHealthy < 3) && tasksPending("PLANT_BERRY", true).length < 2) {
    const seedFrom = [...world.berryStock.entries()].find(([k, v]) => v >= 1);
    if (seedFrom) {
      for (const s of world.settlements) {
        const spot = findSpot(s.x, s.y, 4, 18, T.GRASS, [T.BERRY, T.FRUIT]);
        if (spot && !nearAny(spot.x, spot.y, [T.BERRY, T.FRUIT], 3)) {
          tasksAdd({ type: "PLANT_BERRY", x: spot.x, y: spot.y, need: 5 });
          const [sx, sy] = seedFrom[0].split(",").map(Number);
          gatherBerry(sx, sy);   // 从现有丛取一份做种（有损耗，种植是投资）
          break;
        }
      }
    }
  }
  // 2h. 捕鱼：食物压力且有近海鱼群（海岸可站立）
  if (world.food < 60 + pop * 3 && tasksPending("FISH", true).length < 2) {
    const a = pickAnchor();
    for (const [k, v] of world.fishStock) {
      if (v < 2) continue;
      const [fx, fy] = k.split(",").map(Number);
      if (Math.abs(fx - a.x) + Math.abs(fy - a.y) > 26) continue;
      const shore = neighborsOf(fx, fy).find(p => walkable(p.x, p.y));
      if (shore && !tasks.list.some(t => !t.done && t.type === "FISH" && t.fishX === fx && t.fishY === fy)) {
        tasksAdd({ type: "FISH", x: shore.x, y: shore.y, need: 5, fishX: fx, fishY: fy });
        break;
      }
    }
  }

  // 3. 饥荒告警（一天最多提醒一次，避免刷屏）
  const days = world.food / Math.max(1, pop * 0.9);
  if (days < 1 && pop > 0) { logThrottled(`饥荒告警：存粮仅够 ${days.toFixed(1)} 天！`, SIM.DAY_LEN); emit("famine"); }

  // 4. 人口自然增长：由农田承载余量驱动（田先于人到位），饥荒期停止生育
  //    出生安全垫随人口放大（food > 100 + 人口×4），防止出生率超过承载力引发饿死潮
  //    BIRTH_CHECK 是每秒概率，规划器每 PLANNER_INTERVAL 秒才判一次，需换算成窗口概率
  const hasRoom = world.houses.length * 3 > pop;
  if (pop > 0 && pop < world.popCap && world.food > 40 && world.farms.length * 5 >= pop + 4 && hasRoom && rand() < SIM.BIRTH_CHECK * SIM.PLANNER_INTERVAL) {
    const near = findBirthSpot();
    if (near) {
      const baby = spawnAgent(near.x, near.y);
      baby.age = 0;   // 新生儿从 0 岁长大（1 游戏年 = 1 岁）
      logThrottled(`新生命降临，人口达到 ${pop + 1}。`, 8);
      emit("birth");
    }
  }

  // 5. 人口触顶 → 世界扩张
  if (pop >= world.popCap) {
    expand();
  }

  // 6. 冻结任务自愈：冻结超 60 秒的工程，自动把周围 2 格同类障碍补成立项，
  //    相当于推进前沿自动横向扩宽，避免被凹形海岸卡死。
  //    建造类任务累计冻结 180 秒仍无法施工 → 放弃，退地恢复草地，释放名额
  for (let i = tasks.list.length - 1; i >= 0; i--) {
    const t = tasks.list[i];
    if ((t.blockedCount || 0) < 3) continue;
    t.freezeAge = (t.freezeAge || 0) + SIM.PLANNER_INTERVAL;

    if (t.freezeAge >= 180 && (t.type === "BUILD" || t.type === "FARM")) {
      setTile(t.x, t.y, T.GRASS);
      tasks.list.splice(i, 1);
      logThrottled("规划署放弃了一处无法施工的地块。", 60);
      continue;
    }
    if (t.freezeAge < 60) continue;
    t.freezeAge = 0;
    t.blockedCount = 0;
    for (let dy2 = -2; dy2 <= 2; dy2++) {
      for (let dx2 = -2; dx2 <= 2; dx2++) {
        const nx2 = t.x + dx2, ny2 = t.y + dy2;
        const meta2 = TILE_META[tileAt(nx2, ny2)];
        if ((meta2.diggable || meta2.fillable) && !tasks.list.some(k => !k.done && k.x === nx2 && k.y === ny2)) {
          tasksAdd({ type: meta2.diggable ? "DIG" : "FILL", x: nx2, y: ny2 });
        }
      }
    }
  }

  // 7. 丰收宴席：存粮远超需求时全城共食（每 3 天最多一次），富余粮食有了出口
  if (pop > 0 && world.food > 60 + pop * 5 && world.time - _lastFeast > SIM.DAY_LEN * 3) {
    world.food -= 40 + pop;
    _lastFeast = world.time;
    for (const a of agents) { a.hunger = 100; a.energy = Math.min(100, a.energy + 30); }
    logMsg("丰收宴席：全城共食，欢声笑语。");
    emit("feast");
  }

  // 8. 聚落发展：繁荣度 = 辖区内房×3 + 田×2；达到分数线升级为 村庄/城镇/城市
  for (const s of world.settlements) {
    let score = 0;
    for (const h of world.houses) {
      if (Math.abs(h.x - s.x) + Math.abs(h.y - s.y) <= SIM.SETTLEMENT_RADIUS) score += 3;
    }
    for (const f of world.farms) {
      if (Math.abs(f.x - s.x) + Math.abs(f.y - s.y) <= SIM.SETTLEMENT_RADIUS) score += 2;
    }
    const lv = score >= SIM.SETTLEMENT_SCORE[2] ? 3
             : score >= SIM.SETTLEMENT_SCORE[1] ? 2
             : score >= SIM.SETTLEMENT_SCORE[0] ? 1 : 0;
    if (lv > s.level) {
      s.level = lv;
      const title = ["定居点", "村庄", "城镇", "城市"][lv];
      logMsg(`「${s.name}」繁荣兴盛，升级为${title}。`);
      emit("settlement-up");
      if (lv >= 2) {
        // 城邦时代：划定功能区（农业区/居住区/市中心），后续选址向对应分区倾斜
        const a = rand() * Math.PI * 2;
        s.zones = [
          { type: "farm", x: Math.round(s.x + Math.cos(a) * 9), y: Math.round(s.y + Math.sin(a) * 9), r: 6 },
          { type: "housing", x: Math.round(s.x + Math.cos(a + Math.PI) * 8), y: Math.round(s.y + Math.sin(a + Math.PI) * 8), r: 6 },
          { type: "market", x: s.x, y: s.y, r: 4 },
        ];
        world.zonesVersion = (world.zonesVersion || 0) + 1;
        logMsg(`「${s.name}」划定功能区：农业区、居住区与市中心。`);
        buildTownRoads(s);
      }
      if (lv >= 3) {
        // 文明时代：在居住区兴建高层住宅社区
        const z = s.zones && s.zones.find(z => z.type === "housing");
        const base = z ? findSpot(z.x, z.y, 0, z.r, T.GRASS) : null;
        if (base) {
          let built = 0;
          for (let dx = 0; dx < 3; dx++) {
            if (tileAt(base.x + dx, base.y) === T.GRASS) {
              tasksAdd({ type: "BUILD", x: base.x + dx, y: base.y, need: 12, floors: 3 });
              built++;
            }
          }
          if (built) logMsg(`「${s.name}」兴建高层住宅社区（${built} 栋高楼）。`);
        }
      }
    }
  }

  // 9. 时代演进：文明整体迈入新纪元
  eraCheck(pop);

  assignHomes();
}

function freeNeighbor(x, y) {
  const c = neighborsOf(x, y).filter(p => walkable(p.x, p.y));
  return c.length ? c[randInt(0, c.length - 1)] : null;
}

// 时代演进：按最高聚落等级与人口里程碑判定（见 config.ERAS）
function eraCheck(pop) {
  let target = 0;
  const maxLevel = world.settlements.reduce((m, s) => Math.max(m, s.level), 0);
  if (maxLevel >= 1) target = 1;
  if (maxLevel >= 2) target = 2;
  if (maxLevel >= 3) target = 3;
  if (pop >= 150 && world.settlements.filter(s => s.level >= 3).length >= 2) target = 4;
  if (target > world.era) {
    world.era = target;
    logMsg(`文明迈入新的纪元——${ERAS[target].name}！`);
    emit("era-up");
  }
}
// 城内筑路：聚落辖区内的房/田沿直线铺路到粮仓（每格消耗 1 石材，石材不足则停工）
function buildTownRoads(s) {
  const R = SIM.SETTLEMENT_RADIUS;
  const buildings = [...world.houses, ...world.farms];
  let laid = 0;
  const stock = ensureStock(s);
  for (const b of buildings) {
    const d = Math.abs(b.x - s.x) + Math.abs(b.y - s.y);
    if (d <= 1 || d > R) continue;
    const n = Math.max(Math.abs(b.x - s.x), Math.abs(b.y - s.y));
    for (let i = 1; i < n; i++) {
      const x = Math.round(s.x + (b.x - s.x) * (i / n));
      const y = Math.round(s.y + (b.y - s.y) * (i / n));
      if (tileAt(x, y) === T.GRASS) {
        if (stock.stone < 1) continue;
        stock.stone -= 1;
        setTile(x, y, T.PATH);
        laid++;
      }
    }
  }
  if (laid > 0) logMsg(`「${s.name}」修筑道路 ${laid} 段，城内通衢成型。`);
}

// 出生点：任选一栋房屋找邻格空地；6 成概率偏向已成型的聚落（人往城里走）
function findBirthSpot() {
  const towns = world.settlements.filter(s => s.level >= 1);
  if (towns.length && rand() < 0.6) {
    const s = towns[randInt(0, towns.length - 1)];
    const p = freeNeighbor(s.x, s.y);
    if (p) return p;
  }
  for (let i = 0; i < 8; i++) {
    const h = world.houses[randInt(0, world.houses.length - 1)];
    const p = freeNeighbor(h.x, h.y);
    if (p) return p;
  }
  return null;
}

// ---- 农田生长 ----
function farmTick(dt) {
  for (const f of world.farms) {
    f.grow += dt;
    if (f.grow >= SIM.FARM_MATURITY) {
      f.grow = 0;
      world.food += SIM.FARM_YIELD;
      f.flash = 0.6; // 成熟闪光（渲染用）
    }
    if (f.flash > 0) f.flash -= dt;
  }
}

// ---- 模拟主步进 ----
let _plannerCd = SIM.PLANNER_INTERVAL;
let _lastFeast = -999;

function simUpdate(dt) {
  world.time += dt;
  world.timeOfDay = (world.time % SIM.DAY_LEN) / SIM.DAY_LEN;

  for (const a of agents) a.update(dt);
  for (const c of creatures) c.update(dt);
  // 死者退场（名册/住房/任务引用同步释放）
  for (let i = agents.length - 1; i >= 0; i--) {
    if (agents[i].dead) agents.splice(i, 1);
  }
  farmTick(dt);
  berryTick();
  wildBreedTick();
  quarryTick();

  _plannerCd -= dt;
  if (_plannerCd <= 0) { _plannerCd = SIM.PLANNER_INTERVAL; plannerTick(); }
}

// ---- 初始化模拟 ----
function simInit(seed) {
  genWorld(seed);
  // 初始 12 个小人：在任意房屋附近找落点（某些 seed 下粮仓邻格可能被堵死）
  let n = 0, guard = 0;
  while (n < 12 && guard++ < 400) {
    const p = findBirthSpot();
    if (p) { spawnAgent(p.x, p.y); n++; }
  }
  assignHomes();
  // 主岛：兽群、伙伴狗、河流刻蚀
  populateIslandCreatures(world.store.x, world.store.y, 14);
  carveRiver(world.islands[0]);
  for (let i = 0; i < 2; i++) {
    const p = freeNeighbor(world.store.x, world.store.y);
    if (p) spawnCreature(p.x, p.y, "dog");
  }
}
