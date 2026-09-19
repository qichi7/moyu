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
  QUARRY: 18, SANDPIT: 19, DOCK: 20,
};

const TILE_META = {
  [T.VOID]:     { name: "虚空", color: "#0a0d13", walk: false, h: 0 },
  [T.DEEP]:     { name: "深海", color: "#123a5e", walk: false, bridgeable: true, hp: 8 },
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
  [T.DOCK]:     { name: "码头", color: "#8a6a42", walk: true, h: 0 },
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
  ENERGY_DECAY: 0.6,    // 醒着时 energy 每秒下降（0.9 时 100 能量只够往返 95 格，扩张区任务必过劳死）
  ENERGY_REGEN: 9,      // 睡觉时每秒恢复
  WORK_EFFORT: 1.3,     // 每个工人每秒任务进度
  FARM_MATURITY: 55,    // 农田成熟秒数
  FARM_YIELD: 4,        // 每次成熟产粮
  BIRTH_CHECK: 0.05,    // 出生概率（规划器内按 4 秒窗口换算）
  // EXPAND_POP_CAP 已废弃：人口不设上限，扩张由住房饱和与选址失败驱动
  SETTLEMENT_SCORE: [12, 60, 140],   // 聚落升级分数线：村庄/城镇/城市
  SETTLEMENT_RADIUS: 14,             // 聚落繁荣度统计半径
  BRIDGE_HP: 3,         // 架一座桥所需工时（比填海快得多）
  EXPLORE_CHANCE: 0.06, // 探索欲 1.0 的小人每次决策触发探索的概率
  EXPLORE_LEGS: 6,      // 一次探索旅程最多延伸的段数
  REVEAL_RADIUS: 18,    // 探索点亮的斑块半径上限（格），实际大小随机且边界有噪声扰动
  // ---- 食物体系 ----
  BERRY_STOCK: 3,       // 每丛浆果/果树的果量上限
  BERRY_REGEN: 60,      // 每 60 秒再生 1 份
  GATHER_YIELD: 3,      // 采集一次入粮池
  HUNT_YIELD: { cow: 8, goat: 5 },
  PASTURE_INTERVAL: 80, // 牧场产粮周期（秒）
  PASTURE_YIELD: 2,     // 每次产粮
  PASTURE_CAP: 6,       // 单牧场圈养上限
  BREED_CHANCE: 0.1,    // 繁殖概率（每 120 秒判定）
  WILD_BREED_CAP: 60,   // 野生可猎动物总量上限
  TURTLE_CAP: 12,       // 海龟总量上限
  WHALE_CAP: 5,         // 鲸总量上限
  ANIMAL_STRAND_DEATH: 180, // 动物被困（脚下不再是栖息地）坚持时长（秒），超时死亡——给救援留足窗口
  // ---- 航海 ----
  SHIP_COST: 10,        // 造一艘远航船耗木材（联合库存）
  SHIP_SPEED: 3,        // 船速（格/秒）
  SHIP_MAX_DIST: 220,   // 单次远航最大航程
  SHIP_PROVISION_RATE: 0.15,  // 船只补给消耗（粮/秒）——船速 3 格/s 即每格 0.05 粮
  SHIP_PROVISION_LOAD: 40,    // 出航满载补给（粮）——满载续航 267s ≈ 800 格，正常往返富余
  SHIP_RESCUE_RESUPPLY: 25,   // 救援船送达的补给量（粮）——最远被困点返航需 11 粮，足够
  BOAT_COST: 4,               // 小渔船耗木材（联合库存）——远低于远航船
  FISHING_BOAT_CAP: 2,        // 同时在海的渔船数上限
  BOAT_HOLD_CAP: 20,          // 渔船满舱载鱼量（粮）
  BOAT_FISH_YIELD: 2,         // 渔船每次起网渔获
  FISHING_INTERVAL: 10,       // 渔船起网周期（秒）
  // ---- 历法与年龄 ----
  YEAR_DAYS: 12,        // 1 昼夜 = 1 个月，12 昼夜 = 1 年（1 岁）
};

// 高倍速模拟调度：decide 每帧预算（main.js 按倍速写入，agent 消费；headless 测试默认不限）
const SCHED = { decideBudget: Infinity };

// 物种寿命与年龄分档（岁）：幼年 < s0、青年 < s1、中年 < s2、老年 ≥ s2；超过 lifespan 封顶
const SPECIES_AGE = {
  human: { name: "人",   lifespan: 80, stages: [15, 40, 60] },
  cow:   { name: "牛",   lifespan: 15, stages: [2, 8, 12] },
  goat:  { name: "羊",   lifespan: 12, stages: [2, 6, 9] },
  dog:   { name: "狗",   lifespan: 10, stages: [2, 5, 8] },
  deer:  { name: "鹿",   lifespan: 12, stages: [2, 5, 8] },
  boar:  { name: "野猪", lifespan: 10, stages: [2, 5, 7] },
  wolf:  { name: "狼",   lifespan: 10, stages: [2, 5, 7] },
  fish:  { name: "鱼群", lifespan: 5,  stages: [1, 2, 3] },
  turtle:{ name: "海龟", lifespan: 30, stages: [5, 15, 22] },
  whale: { name: "鲸",   lifespan: 50, stages: [10, 25, 38] },
  bird:  { name: "鸟",   lifespan: 6,  stages: [1, 3, 4] },
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
          if (meta.diggable || meta.fillable || meta.bridgeable) { blockedD = d; blocked = { x: nx, y: ny }; }
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
  ponds: new Set(),     // 人工池塘格 "x,y"（EXCAV 挖出来的水，显示为池塘而非浅海）
  lastBridgeHead: null, // 上一条桥线的桥头（续接锚点）
  lastBridgeDir: null,  // 上一条桥线的走向（续接沿此直线延伸，保证笔直）
  pastures: [],         // [{x,y}] 牧场
  docks: [],            // [{x,y}] 码头
  ships: [],            // 远航船实体
  caves: [],            // [{x,y}] 洞穴（采石场选址）
  quarries: [],         // [{x,y}] 采石场（定期产石材）
  sandpits: [],         // [{x,y}] 沙场（定期产沙土）
  ponds: new Set(),     // 人工池塘（genWorld 重置）
  lastBridgeHead: null,
  lastBridgeDir: null,
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
  c.thumbDirty = true;                              // 缩略图缓存失效
  const k = x + "," + y;
  if (t !== T.WATER) world.ponds.delete(k);          // 水格被改作他用：池塘标记移除
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
let _grElev = new Float32Array(0);   // generateRegion 复用缓冲（海拔场）
let _grFirst = new Uint8Array(0);    // generateRegion 复用缓冲（陆地候选标记）

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
  // 缓冲复用：elev/firstPass 模块级按需扩容（高频点亮时消除每次分配的 GC 压力）
  const need = w * h;
  if (_grElev.length < need) { _grElev = new Float32Array(need); _grFirst = new Uint8Array(need); }
  const elev = _grElev, firstPass = _grFirst;
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      const c = ensureChunk(x >> 5, y >> 5);
      c.thumbDirty = true;   // 缩略图缓存失效（tile 可能被点亮/生成改写）
      const wasGen = c.gen;
      c.gen = true;
      const i = cIdx(x, y);
      const li = (y - ey0) * w + (x - ex0);
      if (!relevant.length) { settleFarTile(c, i, x, y, reveal, litTest, wasGen); elev[li] = -1; continue; }
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
      const curTile = c.tiles[i];
      const cachedE = c.elev ? c.elev[i] : -1;
      if (curTile !== T.VOID) {
        // 已生成格（房屋/道路/桥/农田/已点亮地形）：绝不改写 tile——点亮只属于虚空。
        // 海拔场已有数据（缓存）则零成本跳过；首次缺数据才补一次（渲染地势用）
        if (cachedE < 0) elev[li] = N.fbm(x * 0.05, y * 0.05, 4) * 0.55 + bump;
        else elev[li] = cachedE;
        continue;
      }
      // VOID 格完整生成：bump=0（无岛影响）时海拔取 chunk 缓存——重叠点亮区零重复 fbm；
      // 岛缘格（bump>0）必须重算：发现岛的抬升依赖本轮 bump，缓存里没有
      const e = (cachedE >= 0 && bump === 0) ? cachedE : N.fbm(x * 0.05, y * 0.05, 4) * 0.55 + bump;
      const m = N.fbm(x * 0.06 + 90, y * 0.06 + 55, 3);
      elev[li] = e;
      firstPass[li] = 1;
      let t;
      if (e < 0.28) {
        t = T.DEEP;
        // 深海鲸：概率极低，同格防重（区域重算不重复生成）
        if (hash2(x + 441, y + 819) < 0.008 && !creatures.some(c => Math.hypot(c.x - x - 0.5, c.y - y - 0.5) < 1.5)) spawnCreature(x, y, "whale");
      }
      else if (e < 0.38) {
        t = T.WATER;
        if (hash2(x + 555, y + 777) < 0.02) {
          world.fishStock.set(x + "," + y, 3);
          if (!creatures.some(c => Math.hypot(c.x - x - 0.5, c.y - y - 0.5) < 1.5)) spawnCreature(x, y, "fish");
        }
        else if (hash2(x + 613, y + 209) < 0.005 && !creatures.some(c => Math.hypot(c.x - x - 0.5, c.y - y - 0.5) < 1.5)) spawnCreature(x, y, "turtle");
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

// 远航船：航海家坐船出海开拓地图——沿途点亮大片虚空，遇陆地靠岸（命名/定居化自然触发）
// 统一引用 world.ships（此前模块级 const ships 与 world.ships 割裂：玩家船冻结原地/救援船对渲染隐形）

// 补给归零的被困判定：船停航呼救，等待救援船（水手需求冻结由 agent.state==="voyage" 覆盖）
function shipTick(dt) {
  const ships = world.ships;
  tickFishingBoats(dt);   // 渔船独立状态机（fishing/fishingReturn），与远航船共用实体表
  // 被困呼救：为每艘被困船派一艘救援船（粮池足够才出发，不足则等待并提示）
  for (const s of ships) {
    if (s.state !== "stranded" || s.rescueQueued) continue;
    if (ships.some(r => r.state === "rescue" && r.target === s)) { s.rescueQueued = true; continue; }
    const d = Math.hypot(s.x - world.store.x, s.y - world.store.y);
    const need = Math.ceil(d * SIM.SHIP_PROVISION_RATE * 1.3 + SIM.SHIP_RESCUE_RESUPPLY);
    const homePort = ownerSettle(world.store.x, world.store.y);
    if (!homePort || ensureStock(homePort).food < need) { logThrottled("粮草不足，救援船队在码头待命……", 60); continue; }
    ensureStock(homePort).food -= need;
    ships.push({
      x: world.store.x + 0.5, y: world.store.y + 0.5,
      ang: Math.atan2(s.y - world.store.y, s.x - world.store.x),
      sailor: null, state: "rescue", target: s,
      prov: d * SIM.SHIP_PROVISION_RATE * 1.3, dist: 0, revealCd: 0,
    });
    s.rescueQueued = true;
    logMsg("救援船满载粮草出港，前去营救被困的航海家。");
  }
  for (const s of ships) {
    if (s.state !== "sailing") continue;
    s.ang += (rand() - 0.5) * 0.25;   // 轻微偏航，航线自然弯曲
    // 补给消耗与预留：余量不足以返航即调头（无特殊情况时永远预留足够回程物资）
    s.prov -= SIM.SHIP_PROVISION_RATE * dt;
    const dHome = Math.hypot(world.store.x - s.x, world.store.y - s.y);
    if (s.prov <= 0) {
      s.state = "stranded";
      if (s.sailor) logMsg(`航海家 ${s.sailor.name} 的船补给耗尽，被困海上，发出求救信号！`);
      continue;
    }
    if (s.prov < dHome * SIM.SHIP_PROVISION_RATE * 1.3) {
      s.state = "return";
      if (s.sailor) logMsg(`航海家 ${s.sailor.name} 的船补给仅够回程，调头返航。`);
      continue;
    }
    const nx = s.x + Math.cos(s.ang) * SIM.SHIP_SPEED * dt;
    const ny = s.y + Math.sin(s.ang) * SIM.SHIP_SPEED * dt;
    // 航行沿途大面积点亮虚空（航海开拓的核心价值）
    s.revealCd -= dt;
    if (s.revealCd <= 0) { s.revealCd = 2; revealArea(Math.round(nx), Math.round(ny), 15); }
    const aheadX = Math.round(nx + Math.cos(s.ang) * 2.5), aheadY = Math.round(ny + Math.sin(s.ang) * 2.5);
    const ahead = tileAt(aheadX, aheadY);
    if (ahead !== T.VOID && ahead !== T.DEEP && ahead !== T.WATER) {
      // 发现陆地：靠岸下船（登岛命名/定居化由小人自身逻辑触发）
      const sailor = s.sailor;
      const shore = [{ x: aheadX, y: aheadY }, ...neighborsOf(aheadX, aheadY)].find(p => walkable(p.x, p.y));
      if (shore && sailor) {
        s.state = "docked";
        s.dockedAt = world.time;
        sailor.x = shore.x + 0.5; sailor.y = shore.y + 0.5;
        sailor.state = "idle"; sailor.voyaging = false;
        logMsg(`航海家 ${sailor.name} 的船靠岸了，新的土地已在眼前。`);
      } else if (sailor) {
        // 撞岸点无立足之地：大幅转向绕行，防止原地反复撞击（水手不硬着陆）
        s.ang += (rand() < 0.5 ? 1 : -1) * Math.PI / 3;
      } else {
        s.state = "docked"; s.dockedAt = world.time;   // 无水手船照常停靠
      }
      continue;
    }
    s.x = nx; s.y = ny;
    if (s.sailor) { s.sailor.x = s.x; s.sailor.y = s.y; }
    s.dist += SIM.SHIP_SPEED * dt;
    if (s.dist > SIM.SHIP_MAX_DIST) s.state = "return";   // 航程尽头：调头返航
  }
  for (const s of ships) {
    if (s.state !== "return") continue;
    const dx = world.store.x - s.x, dy = world.store.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    s.prov -= SIM.SHIP_PROVISION_RATE * dt;
    if (s.prov <= 0) {
      s.state = "stranded";
      if (s.sailor) logMsg(`航海家 ${s.sailor.name} 的船在归途中补给耗尽，被困海上，发出求救信号！`);
      continue;
    }
    const nx = s.x + (dx / d) * SIM.SHIP_SPEED * dt, ny = s.y + (dy / d) * SIM.SHIP_SPEED * dt;
    s.revealCd -= dt;
    if (s.revealCd <= 0) { s.revealCd = 2; revealArea(Math.round(nx), Math.round(ny), 15); }
    const aheadT = tileAt(Math.round(nx), Math.round(ny));
    if (walkable(Math.round(nx), Math.round(ny)) && aheadT !== T.WATER && aheadT !== T.DEEP) {
      s.state = "docked"; s.dockedAt = world.time;
      if (s.sailor) { s.sailor.x = nx; s.sailor.y = ny; s.sailor.state = "idle"; s.sailor.voyaging = false; }
      continue;
    }
    s.x = nx; s.y = ny;
    if (s.sailor) { s.sailor.x = s.x; s.sailor.y = s.y; }
  }
  for (const s of ships) {
    if (s.state !== "rescue") continue;
    const t = s.target;
    // 目标已自行脱困或消失 → 转入返航
    if (!t || t.state !== "stranded") { s.state = "return"; continue; }
    // 救援船补给可耗尽：营救使命优先，不设返航预留（路线偏离的余量已计入装载）
    s.prov -= SIM.SHIP_PROVISION_RATE * dt;
    const dx = t.x - s.x, dy = t.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 2.5) {
      // 会合：送达补给，两船各自返航
      t.prov += SIM.SHIP_RESCUE_RESUPPLY;
      t.state = "return"; t.rescueQueued = false;
      s.state = "return";
      if (t.sailor) logMsg(`救援船与航海家 ${t.sailor.name} 的船会合，粮草已送达，船队踏上归途。`);
      continue;
    }
    // 朝目标平滑转向；前方近处是陆地则侧向绕行
    const ax = Math.round(s.x + Math.cos(s.ang) * 3), ay = Math.round(s.y + Math.sin(s.ang) * 3);
    const aheadT = tileAt(ax, ay);
    if (aheadT !== T.VOID && aheadT !== T.DEEP && aheadT !== T.WATER) {
      s.ang += (hash2(Math.round(s.x), Math.round(s.y)) < 0.5 ? 1 : -1) * 1.8 * dt;
    } else {
      let diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.ang), Math.cos(Math.atan2(dy, dx) - s.ang));
      s.ang += diff * Math.min(1, dt * 2);
    }
    s.x += Math.cos(s.ang) * SIM.SHIP_SPEED * dt;
    s.y += Math.sin(s.ang) * SIM.SHIP_SPEED * dt;
  }
  // 长期停靠的船清理（远航需另造新船）
  for (let i = ships.length - 1; i >= 0; i--) {
    if (ships[i].state === "docked" && world.time - ships[i].dockedAt > 600) ships.splice(i, 1);
  }
}

// 渔船：近海捕捞（渔民驾船到鱼点起网，满舱或鱼点枯竭即返航卸货；渔民同为人类单位，贴边点亮）
function tickFishingBoats(dt) {
  const ships = world.ships;
  for (const s of ships) {
    if (s.state !== "fishing") continue;
    s.revealCd -= dt;
    if (s.revealCd <= 0) {
      s.revealCd = 2;
      const cx = Math.round(s.x), cy = Math.round(s.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(cx + dx, cy + dy) === T.VOID) { revealArea(cx + dx * 2, cy + dy * 2, 9); break; }
      }
    }
    // 无目标 / 满舱 → 返航
    if (!s.target || s.hold >= SIM.BOAT_HOLD_CAP) {
      if (s.hold > 0 && s.hold >= SIM.BOAT_HOLD_CAP && s.sailor) logMsg(`${s.sailor.name} 的渔船满载而归。`);
      s.state = "fishingReturn";
      continue;
    }
    const fk = Math.round(s.target.x - 0.5) + "," + Math.round(s.target.y - 0.5);
    if ((world.fishStock.get(fk) || 0) <= 0) {
      // 鱼点枯竭：换下一个近海鱼点，无鱼可捕则空舱返航
      const next = pickFishingSpot({ x: s.x, y: s.y });
      if (next) { s.target = next; }
      else {
        s.state = "fishingReturn";
        if (s.sailor) logMsg(`${s.sailor.name} 发现近海鱼群稀少，转舵回港。`);
        continue;
      }
    }
    const dx = s.target.x - s.x, dy = s.target.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 1.2) {
      // 朝鱼点航行；前方近处是陆地则侧向绕行
      const ax = Math.round(s.x + Math.cos(s.ang) * 3), ay = Math.round(s.y + Math.sin(s.ang) * 3);
      const aheadT = tileAt(ax, ay);
      if (aheadT !== T.VOID && aheadT !== T.DEEP && aheadT !== T.WATER) {
        s.ang += (hash2(Math.round(s.x), Math.round(s.y)) < 0.5 ? 1 : -1) * 1.8 * dt;
      } else {
        const want = Math.atan2(dy, dx);
        s.ang += Math.atan2(Math.sin(want - s.ang), Math.cos(want - s.ang)) * Math.min(1, dt * 2);
      }
      s.x += Math.cos(s.ang) * SIM.SHIP_SPEED * dt;
      s.y += Math.sin(s.ang) * SIM.SHIP_SPEED * dt;
    } else {
      // 到点起网：扣鱼群资源，渔获入舱
      s.fishCd -= dt;
      if (s.fishCd <= 0) {
        s.fishCd = SIM.FISHING_INTERVAL;
        catchFish(Math.round(s.target.x - 0.5), Math.round(s.target.y - 0.5));
        s.hold += SIM.BOAT_FISH_YIELD;
      }
    }
    if (s.sailor) { s.sailor.x = s.x; s.sailor.y = s.y; }
  }
  for (const s of ships) {
    if (s.state !== "fishingReturn") continue;
    const dx = world.store.x - s.x, dy = world.store.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = s.x + (dx / d) * SIM.SHIP_SPEED * dt, ny = s.y + (dy / d) * SIM.SHIP_SPEED * dt;
    const aheadT = tileAt(Math.round(nx), Math.round(ny));
    if (walkable(Math.round(nx), Math.round(ny)) && aheadT !== T.WATER && aheadT !== T.DEEP) {
      // 靠岸卸货：渔获就地入粮池，渔民下船休整（渔船停靠码头，由常规清理回收）
      s.state = "docked"; s.dockedAt = world.time;
      if (s.sailor) {
        s.sailor.x = nx; s.sailor.y = ny;
        s.sailor.state = "idle"; s.sailor.voyaging = false;
        if (s.hold > 0) { ensureStock(ownerSettle(s.x, s.y)).food += s.hold; logMsg(`渔船回港，${s.hold} 粮渔获入库。`); s.hold = 0; }
        s.sailor.boatRestT = world.time + 30;   // 渔民休整后才再出港
      }
      continue;
    }
    s.x = nx; s.y = ny;
    if (s.sailor) { s.sailor.x = s.x; s.sailor.y = s.y; }
  }
}

// 采石场/沙场产出（sim 每秒调用一次）：不可再生资源的稳定获取渠道
function quarryTick() {
  if (world.time % 60 > 1) return;
  for (const q of world.quarries) {
    const s = nearestSettlement(q.x, q.y);
    if (s) ensureStock(s).stone += 4;
  }
  for (const p of world.sandpits) {
    const s = nearestSettlement(p.x, p.y);
    if (s) ensureStock(s).sand += 3;
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
    // 点亮只作用于虚空（未生成格）：已生成的地形/造物绝不被海域覆盖
    if (c.tiles[i] === T.VOID && (!litTest || litTest(x, y))) {
      c.tiles[i] = T.DEEP;
      world.litCells.add(x + "," + y);
    }
    // 非 VOID 或斑块外：保持原状（虚空留给未来探索）
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
  // 发现岛显现：点亮范围 = 探索斑块 ∪ 岛缘海圆（r+9）——无矩形 bounding 痕迹
  for (const isl of discovered) {
    const ir = Math.ceil(isl.r) + 9;
    const islTest = (x, y) => Math.hypot(x - isl.x, y - isl.y) <= ir;
    const combined = (x, y) => litTest(x, y) || islTest(x, y);
    generateRegion(
      Math.floor(isl.x - ir - 2), Math.floor(isl.y - ir - 2),
      Math.ceil(isl.x + ir + 2), Math.ceil(isl.y + ir + 2), true, true, combined
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
  _jsCache.t = -1;   // 新世界：联合库存缓存失效
  world.chunks = new Map();
  world.islands = [];
  world.settlements = [];
  world.houses = [];
  world.farms = [];
  world.foundGrid = new Set();
  world.berryStock = new Map();
  world.fishStock = new Map();
  world.pastures = [];
  world.docks = [];
  world.ships = [];
  world.caves = [];
  world.quarries = [];
  world.sandpits = [];

  world.islands.push({ x: 0, y: 0, r: 14, claimed: true });
  const islN = 2 + randInt(0, 4);   // 初始 2~6 座无人岛（总岛数 3~7 随机）
  for (let i = 0; i < islN; i++) {
    const a = (i / 5) * Math.PI * 2 + rand() * 0.6;
    const d = 28 + rand() * 8;
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
// 地名查重：聚落名与已命名岛屿都在同一命名空间（基础名不重复）；
// 两字池（120）用尽自动升级三字（1200），再耗尽走编号兜底——无限扩张不会死循环
function pickName(main) {
  const used = new Set();
  for (const s of world.settlements) used.add(s.name.replace(/城$/, ""));
  for (const o of world.islands) if (o.name) used.add(o.name);
  for (let i = 0; i < 200; i++) {
    const a = _NAME1[randInt(0, _NAME1.length - 1)], b = _NAME2[randInt(0, _NAME2.length - 1)];
    let n = a + b;
    if (used.has(n)) n = a + b + _NAME2[randInt(0, _NAME2.length - 1)];   // 直接升级三字
    if (!used.has(n)) return main ? n + "城" : n;
  }
  let k = used.size;
  while (used.has("新地" + k)) k++;
  return main ? "新地城" + k : "新地" + k;
}

// 在 (cx,cy) 附近 [rMin,rMax] 范围随机找一个 want 类型、周围干净的格子
function findSpot(cx, cy, rMin, rMax, want, around) {
  for (let i = 0; i < 150; i++) {
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

// 设施聚簇：从基准设施 ref 逐圈向外（确定性，紧贴扩展）找 want 类型格
// 房屋传 rMin=2（房间留 1 格走道），农田传 rMin=1（田可紧贴连片）；跨聚落天然不聚集（逐圈局部性）
// exclude: 已规划占位（"x,y" 集合），同批多栋外扩时防撞位；want=GRASS 天然不与建筑/工地叠格，无需 around 排除
function expandSpot(ref, rMin, maxR, want, exclude) {
  for (let r = rMin; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只扫当前圈
        const x = ref.x + dx, y = ref.y + dy;
        if (exclude && exclude.has(x + "," + y)) continue;
        if (tileAt(x, y) !== want) continue;
        return { x, y };
      }
    }
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
  if (world.islands.length >= 500) return;   // 防极端内存保护，实际无限扩张
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
      const dist = maxD + 35 + rand() * 25;
      const cx2 = Math.round(sx + Math.cos(a) * dist), cy2 = Math.round(sy + Math.sin(a) * dist);
      if (world.islands.every(o => Math.hypot(o.x - cx2, o.y - cy2) > 50)) { nx = cx2; ny = cy2; break; }
    }
    if (nx === 0 && ny === 0) { world.expansions--; return; }
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

  // 航线工程：主城 → 新区，1 格宽细长走廊线（细木桥跨水、开凿穿山——不再铺宽条带/菱形沙块）。
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
  const addWork = (x, y, i) => {
    if (seen.has(x + "|" + y)) return;
    seen.add(x + "|" + y);
    const t = tileAt(x, y);
    // 跨水段不预置桥：工人的 goTo 被水挡住时动态立项（blocked 必邻工人所站格，首格必可达），
    // 完工后沿 corridor 链式续立到对岸
    if (t === T.WATER || t === T.DEEP) { bridges++; }
    else if (t === T.TREE || t === T.MOUNTAIN) { tasksAdd({ type: "DIG", x, y }); digs++; }
  };
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(sx0 + dxs * i), y = Math.round(sy0 + dys * i);
    addWork(x, y, i);
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
  // 新区预置：房与田围绕本区粮仓聚簇成村（确定性外扩 + 占位防撞；田链式锚定前一块，连片生长）
  const planned = new Set();
  if (g) planned.add(g.x + "," + g.y);
  for (let i = 0; i < 3; i++) {
    const s = (g && expandSpot(g, 2, 8, T.GRASS, planned)) || findSpot(nx, ny, 3, 13, T.GRASS);
    if (s) {
      tasksAdd({ type: "BUILD", x: s.x, y: s.y });
      planned.add(s.x + "," + s.y);
    }
  }
  let lastFarm = null;
  for (let i = 0; i < 2; i++) {
    const refF = lastFarm || g;
    const s = (refF && expandSpot(refF, 1, 8, T.GRASS, planned)) || findSpot(nx, ny, 3, 13, T.GRASS);
    if (s) {
      tasksAdd({ type: "FARM", x: s.x, y: s.y });
      planned.add(s.x + "," + s.y);
      lastFarm = s;
    }
  }


  logMsg(`国土工程：航线上需架桥 ${bridges} 座、填海 ${fills} 处、开山伐林 ${digs} 处（航线已纳入疆域图）。`);
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

// 选一个离锚点最近的仍有鱼的近海鱼点（渔船目标）
function pickFishingSpot(near) {
  let best = null, bd = 1e9;
  for (const [k, v] of world.fishStock) {
    if (v <= 0) continue;
    const [x, y] = k.split(",").map(Number);
    const d = Math.abs(x - near.x) + Math.abs(y - near.y);
    if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  return best;
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

// 聚落资源库存（wood/stone/sand/food——粮食城市内共享，不是全图共享池）
function ensureStock(s) {
  if (!s.stock) s.stock = { wood: 0, stone: 0, sand: 0, food: 0 };
  if (s.stock.food === undefined) s.stock.food = 0;   // 旧聚落兼容
  return s.stock;
}
// 无半径最近的归属聚落（田/牧场/粮食产出的归属方；nearestSettlement 有 SETTLEMENT_RADIUS 上限不适用）
function ownerSettle(x, y) {
  let best = null, bd = 1e9;
  for (const s of world.settlements) {
    const d = Math.abs(s.x - x) + Math.abs(s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// 池塘选址：三级优先——①邻水格（贴着海/河/塘连片）②近水缘（3 格内有水）③纯内陆兜底
// anchor 为需求点（农田/聚落），maxR 限定寻找范围；一切以"塘连塘成湖，不零散"为纲
function findPondSpot(anchor, maxR) {
  // ① 邻水：anchor 附近逐圈找「GRASS 且 4 邻含水」
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = anchor.x + dx, y = anchor.y + dy;
      if (tileAt(x, y) !== T.GRASS || !walkable(x, y)) continue;
      if (nearAny(x, y, [T.HOUSE, T.SITE], 1)) continue;
      if (neighborsOf(x, y).some(p => tileAt(p.x, p.y) === T.WATER || tileAt(p.x, p.y) === T.DEEP)) return { x, y };
    }
  }
  // ② 近水缘：GRASS 且 3 格内有水（半连片）
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = anchor.x + dx, y = anchor.y + dy;
      if (tileAt(x, y) !== T.GRASS || !walkable(x, y)) continue;
      if (nearAny(x, y, [T.HOUSE, T.SITE], 1)) continue;
      if (nearAny(x, y, [T.WATER, T.DEEP], 3)) return { x, y };
    }
  }
  // ③ 纯内陆兜底：anchor 旁任意干净草地
  return findSpot(anchor.x, anchor.y, 2, Math.max(5, maxR), T.GRASS, [T.HOUSE, T.SITE]);
}
// 全域存粮总和（HUD/规划/告警的全局视角指标；实际进食只消耗所在城市库存）
function totalFood() {
  return world.settlements.reduce((sum, s) => sum + (s.stock ? s.stock.food || 0 : 0), 0);
}

// 联合库存：国家级工程（架桥/造陆）跨聚落汇总与扣费
// 缓存：每 sim 秒刷新一次快照（tasksTake 等高频调用共享），扣减后强制失效
let _jsCache = { t: -1, wood: 0, stone: 0, sand: 0 };
function jointStock(res) {
  const sec = world.time | 0;
  if (_jsCache.t !== sec) {
    _jsCache = { t: sec };
    for (const r of ["wood", "stone", "sand"]) {
      _jsCache[r] = world.settlements.reduce((sum, s) => sum + (s.stock ? s.stock[r] || 0 : 0), 0);
    }
  }
  return _jsCache[res] || 0;
}
// 外部直接修改 settlement.stock 后调用（缓存以 sim 秒为桶，步进外的写入不会自动失效）
function jointStockDirty() { _jsCache.t = -1; }
function jointConsume(res, n) {
  _jsCache.t = -1;   // 扣减后失效缓存
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
    const was = t;   // 改造前 tile：tasksFinish 依赖它判产出（完工后 setTile 已改写，不能重读）
    setTile(x, y, target);
    return { done: true, was };
  }
  return false;
}


"use strict";
// ============ 任务系统：建造 / 开荒 / 移山 / 填海 ============

let _taskId = 1;
let _lastPond = null;   // 最近挖的塘（池塘聚簇：下一个塘贴着它挖）
const tasks = {
  list: [],
};

const TASK_DEFAULT_NEED = { BUILD: 10, FARM: 9, GATHER: 4, HUNT: 6, PASTURE: 16, CAPTURE: 5, FISH: 5, PLANT: 4, QUARRY: 18, SANDPIT: 12, PLANT_BERRY: 5, BRIDGE: 3, FILL: 10, EXCAV: 8 };
// 工程资源消耗：架桥耗木材、造陆耗沙土（完工时从最近聚落库存扣除）
const TASK_RESOURCE_COST = { BRIDGE: { wood: 1 }, FILL: { sand: 1 } };

function tasksAdd(t) {
  t.id = _taskId++;
  t.progress = 0;
  t.need = t.need !== undefined ? t.need : (TASK_DEFAULT_NEED[t.type] || 0); // 兜底：漏设 need 的任务永不完工、占死名额
  t.born = world.time;   // 立项时间：任务老化防饥饿（越久越优先被领取）
  t.workers = new Set();
  if (t.type === "BUILD" || t.type === "FARM" || t.type === "PASTURE") setTile(t.x, t.y, T.SITE); // 立项即圈地
  tasks.list.push(t);
  return t;
}

function tasksPending(type, excludeFrozen) {
  return tasks.list.filter(t => (!type || t.type === type) && !t.done && (!excludeFrozen || (t.blockedCount || 0) < 3));
}

// 任务 → 职业偏好映射（DIG 按 res 区分伐木/采石；CAPTURE 鱼群归渔民、牲畜归猎人）
function taskJobPref(t) {
  switch (t.type) {
    case "FARM": return "FARM";
    case "BUILD": case "PASTURE": case "PLANT": case "PLANT_BERRY": case "QUARRY": case "SANDPIT": case "EXCAV": return "BUILD";
    case "CAPTURE": return t.creature && t.creature.type === "fish" ? "FISH" : "HUNT";
    case "HUNT": return "HUNT";
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
    const age = world.time - (t.born || world.time);   // 任务老化：立项越久越优先，远任务不饿死
    // 资源危机升权：联合木材枯竭时伐木任务急速提级（否则桥/船工程全饿死）
    const crisis = (t.type === "DIG" && t.res === "wood") ? Math.max(0, 8 - jointStock("wood")) * 200 : 0;
    // 走廊桥是国家工程（两岛间唯一通路），优先级高于日常任务
    const natl = t.type === "BRIDGE" && t.corridor ? 1500 : 0;
    const score = (t.blockedCount || 0) * 100000 + d * 10 - jobMatch * 5000 - age * 3 - crisis - natl;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function tasksRelease(t, agent) {
  if (t) t.workers.delete(agent);
}

function tasksFinish(t, agent, was) {
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
      setTile(t.x, t.y, T.GRASS);
      // 产出由工人搬运回仓：伐木得木材、采石得石材（was 由 workTile 传入——完工后 tile 已改写，不能重读）
      if (was === T.TREE) return { res: "wood", amount: 6 };
      if (was === T.MOUNTAIN) return { res: "stone", amount: 7 };
      break;
    }
    case "FILL": {
      const s = nearestSettlement(t.x, t.y);
      if (s) ensureStock(s).sand += 2;   // 挖海泥回填，就地结算
      setTile(t.x, t.y, T.SAND);
      // 该格原有鱼群被填：移除鱼群实体与库存
      const fk = t.x + "," + t.y;
      if (world.fishStock.has(fk)) {
        world.fishStock.delete(fk);
        for (let i = creatures.length - 1; i >= 0; i--) {
          const c = creatures[i];
          if (c.type === "fish" && Math.hypot(c.x - t.x - 0.5, c.y - t.y - 0.5) < 1.5) creatures.splice(i, 1);
        }
      }
      break;
    }
    case "BRIDGE": {
      setTile(t.x, t.y, T.BRIDGE);
      logThrottled("工匠们在海峡上架起了木桥。", 30);
      // 链式生长：沿 corridor 方向续立下一格（remain 递减到 0 停——桥不无限穿海）
      if (t.corridor && t.corridor.remain > 0) {
        const nx3 = t.x + t.corridor.dx, ny3 = t.y + t.corridor.dy;
        const tt = tileAt(nx3, ny3);
        if ((tt === T.WATER || tt === T.DEEP) &&
            !tasks.list.some(k => !k.done && k.x === nx3 && k.y === ny3)) {
          tasksAdd({ type: "BRIDGE", x: nx3, y: ny3,
            corridor: { dx: t.corridor.dx, dy: t.corridor.dy, remain: t.corridor.remain - 1 } });
        }
      }
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
      if (t.res === "sand") return { res: "sand", amount: 3 };
      if (gatherBerry(t.x, t.y)) return { res: "food", amount: SIM.GATHER_YIELD };
      break;
    }
    case "HUNT": {
      // 狩猎：猎物从世界移除，肉由猎手搬运回仓；同时撤销绑同一猎物的捕获任务
      const c = t.creature;
      if (c && !c.dead) {
        c.dead = true;
        for (let i = tasks.list.length - 1; i >= 0; i--) {
          const k = tasks.list[i];
          if (k !== t && k.creature === c && !k.done) {
            for (const w of k.workers) { if (w.task === k) { w.task = null; if (w.state === "walk" || w.state === "work") w.state = "idle"; } }
            tasks.list.splice(i, 1);
          }
        }
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
    case "DOCK": {
      setTile(t.x, t.y, T.DOCK);
      world.docks.push({ x: t.x, y: t.y });
      logMsg(`码头建成，航海家们开始筹划远航。`);
      break;
    }
    case "EXCAV": {
      // 挖塘：陆格挖成水（灌溉/养鱼的人工水域，显示为池塘）
      setTile(t.x, t.y, T.WATER);
      world.ponds.add(t.x + "," + t.y);
      _lastPond = { x: t.x, y: t.y };   // 连击记忆：下一个塘默认贴着这个挖
      logThrottled("居民挖出了新的水塘，水波在塘里荡开。", 30);
      break;
    }
    case "CAPTURE": {
      // 捕获：把野生牲畜安置进牧场；鱼群圈进水域渔场（t.dest 指定时运往该处圈养，否则原地）
      const c = t.creature;
      if (c && !c.dead && c.isWild()) {
        const dest = t.dest || t.pasture;
        c.pasture = { x: dest.x, y: dest.y };
        c.x = dest.x + 0.5; c.y = dest.y + 0.5;
        if (c.type === "fish") {
          world.fishStock.delete(dest.x + "," + dest.y);   // 圈养后走渔场产出，不再作野生钓点
          world.fishStock.delete(t.pasture.x + "," + t.pasture.y);
          logThrottled(t.dest ? "渔人把鱼苗挑到了新挖的水塘里放养。" : "渔人把鱼群圈进了水上渔场，渔场将定期供给鲜鱼。", 25);
        } else {
          logThrottled("牧民把新的牲畜赶进了牧场。", 25);
        }
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
  cow:   { name: "牛",   yield: 8, speed: 0.55, flee: 1.1,  size: 1.0,  habitat: "grass",  hunt: true },
  goat:  { name: "羊",   yield: 5, speed: 0.7,  flee: 1.25, size: 0.8,  habitat: "grass",  hunt: true },
  deer:  { name: "鹿",   yield: 4, speed: 1.3,  flee: 1.7,  size: 0.85, habitat: "grass",  hunt: true },
  boar:  { name: "野猪", yield: 6, speed: 0.9,  flee: 1.0,  size: 0.9,  habitat: "forest", hunt: true },
  dog:   { name: "狗",   yield: 0, speed: 2.2,  flee: 0,    size: 0.55, habitat: "grass",  hunt: false },
  wolf:  { name: "狼",   yield: 0, speed: 1.2,  flee: 0,    size: 0.7,  habitat: "forest", hunt: false, predates: "goat" },
  fish:  { name: "鱼群", yield: 0, speed: 0.8,  flee: 0,    size: 0.5,  habitat: "water",  hunt: false, school: 4 },
  turtle:{ name: "海龟", yield: 0, speed: 0.25, flee: 0,    size: 0.6,  habitat: "water",  hunt: false },
  whale: { name: "鲸",   yield: 0, speed: 0.6,  flee: 0,    size: 2.6,  habitat: "deep",   hunt: false },
  bird:  { name: "鸟",   yield: 0, speed: 2.5,  flee: 0,    size: 0.3,  habitat: "air",    hunt: false },
};

// 栖息地判定：生物只在自己的栖息地内活动
function habitatOk(c, x, y) {
  const t = tileAt(x, y);
  switch (CREATURE_META[c.type].habitat) {
    case "water":  return t === T.WATER;
    case "deep":   return t === T.DEEP || t === T.WATER;
    case "forest": return t === T.GRASS || t === T.TREE;
    case "air":    return true;   // 鸟在天上飞，不受地形限制
    default:       return t === T.GRASS || t === T.SAND;
  }
}

const creatures = [];

class Creature {
  constructor(x, y, type) {
    const meta = CREATURE_META[type];
    const spAge = SPECIES_AGE[type];
    this.type = type;
    this.x = x + 0.5; this.y = y + 0.5;
    this.speed = meta.speed;
    this.dead = false;
    this.age = spAge ? randRange(spAge.stages[1], spAge.stages[2]) : 1;   // 初始青年~中年（无寿命表物种兜底）
    this.pasture = null;      // {x,y} 圈养位置（null = 野生）
    this.moveCd = randRange(0, 2);
    this.breedCd = 120;
    this.outputCd = SIM.PASTURE_INTERVAL;
  }

  isWild() { return !this.pasture && this.type !== "dog" && this.type !== "bird"; }

  update(dt) {
    if (this.dead) return;
    // 被人搬运：坐标跟随搬运者，跳过一切自主行为（搬运者死亡则掉落原地）
    if (this.carriedBy) {
      if (this.carriedBy.dead) { this.carriedBy = null; return; }
      this.x = this.carriedBy.x - 0.4; this.y = this.carriedBy.y - 0.4;
      return;
    }
    // 年龄：1 游戏年长 1 岁，寿命封顶（无寿命表的物种不老化）
    const spAge = SPECIES_AGE[this.type];
    if (spAge) this.age = Math.min(spAge.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));
    // 老死：寿命耗尽后平均 3 天内自然离世（概率衰减避免同龄瞬灭）
    if (spAge && this.age >= spAge.lifespan && rand() < dt / (SIM.DAY_LEN * 3)) {
      this.dead = true;
      logMsg(`一只年迈的${CREATURE_META[this.type].name}寿终正寝。`);
      return;
    }
    // 搁浅/被困：施工（填海/造陆）改变地形后脚下不再是栖息地，困太久会死，等待有人救援
    // （圈养动物在人类管理的牧场里，脚下是 PASTURE tile，不参与搁浅判定）
    if (this.type !== "bird" && !this.pasture && !habitatOk(this, Math.round(this.x), Math.round(this.y))) {
      this.strandT = (this.strandT || 0) + dt;
      if (this.strandT > SIM.ANIMAL_STRAND_DEATH) {
        this.dead = true;
        logMsg(this.type === "whale"
          ? "搁浅的鲸在滩涂上停止了呼吸。"
          : `一只${CREATURE_META[this.type].name}被困在陌生的地形里，没能撑下去。`);
        return;
      }
      return;   // 被困时无法移动（移动路径本就被 habitatOk 挡住），原地等待
    }
    this.strandT = 0;
    if (this.pasture) { this.updatePasture(dt); return; }
    if (this.type === "dog") { this.updateDog(dt); return; }
    if (this.type === "bird") { this.updateBird(dt); return; }
    if (this.type === "wolf") { this.updateWolf(dt); return; }
    this.updateWild(dt);
  }

  // 野生：游荡（栖息地内）；可猎物种会被猎人逼近而逃离（附近有狗则被围堵减速）
  updateWild(dt) {
    const meta = CREATURE_META[this.type];
    // 逃跑判定：只对可猎物种生效
    if (meta.hunt) {
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
        this.fleeT = (this.fleeT || 0) + dt;
        const tired = this.fleeT > 8 ? 0.4 : 1;
        const sp = (dogNear ? 0.55 : meta.flee) * tired * dt;
        const dx = this.x - threat.x, dy = this.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        this.moveBy((dx / d) * sp, (dy / d) * sp);
        return;
      }
      this.fleeT = 0;
    }
    // 游荡：栖息地内随机走
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const dist = meta.habitat === "deep" || meta.habitat === "air" ? 4 : 2;
      const nx = Math.round(this.x + Math.cos(a) * dist), ny = Math.round(this.y + Math.sin(a) * dist);
      if (habitatOk(this, nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = meta.speed * dt;
      const nx = this.x + (dx / d) * sp, ny = this.y + (dy / d) * sp;
      if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
      if (d <= sp) this.target = null;
    }
  }

  // 狼：捕食野生羊（自然生态——靠近羊群停留数秒后羊消失），不主动攻击人
  updateWolf(dt) {
    this.moveCd -= dt;
    const prey = creatures.find(c => !c.dead && c.type === "goat" && c.isWild() &&
      Math.hypot(c.x - this.x, c.y - this.y) < 4);
    if (prey) {
      this.preyT = (this.preyT || 0) + dt;
      if (this.preyT > 4) {
        prey.dead = true;
        this.preyT = 0;
        logThrottled("林间传来狼嚎——有野羊成了狼群的晚餐。", 60);
      }
      return;
    }
    this.preyT = 0;
    if (this.moveCd <= 0) {
      this.moveCd = 2 + rand() * 3;
      const a = rand() * Math.PI * 2;
      const nx = Math.round(this.x + Math.cos(a) * 3), ny = Math.round(this.y + Math.sin(a) * 3);
      if (habitatOk(this, nx, ny)) this.target = { x: nx + 0.5, y: ny + 0.5 };
    }
    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = CREATURE_META[this.type].speed * dt;
      const nx = this.x + (dx / d) * sp, ny = this.y + (dy / d) * sp;
      if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
      if (d <= sp) this.target = null;
    }
  }

  // 鸟：空中缓慢漂移（纯装饰，不受地形限制）
  updateBird(dt) {
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 3 + rand() * 3;
      const a = rand() * Math.PI * 2;
      this.target = { x: this.x + Math.cos(a) * 8, y: this.y + Math.sin(a) * 8 };
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

  // 圈养：在栏内小范围活动，定期产粮 + 繁殖（水生物种圈养于水域渔场，游荡判定走栖息地）
  updatePasture(dt) {
    const waterBound = CREATURE_META[this.type].habitat === "water" || CREATURE_META[this.type].habitat === "deep";
    this.moveCd -= dt;
    if (this.moveCd <= 0) {
      this.moveCd = 1.5 + rand() * 2;
      const a = rand() * Math.PI * 2;
      const tx = this.pasture.x + 0.5 + Math.cos(a) * 2.5, ty = this.pasture.y + 0.5 + Math.sin(a) * 2.5;
      const ok = waterBound
        ? habitatOk(this, Math.round(tx), Math.round(ty))
        : walkable(Math.round(tx), Math.round(ty));
      if (ok) this.target = { x: tx, y: ty };
    }
    if (this.target) this.stepToward(this.target, this.speed * dt);

    this.outputCd -= dt;
    if (this.outputCd <= 0) {
      this.outputCd = SIM.PASTURE_INTERVAL;
      const st = ownerSettle(this.pasture.x, this.pasture.y);
      if (st) ensureStock(st).food += SIM.PASTURE_YIELD;
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
    if (habitatOk(this, Math.round(nx), Math.round(ny))) { this.x = nx; this.y = ny; }
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

// 在一座岛上散布生物：牲畜兽群 + 野生鹿/野猪/狼 + 海龟（按栖息地落位）
function populateIslandCreatures(bx, by, r) {
  let grass = 0, forestEdge = 0, water = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const t = tileAt(bx + dx, by + dy);
    if (t === T.GRASS) grass++;
    if (t === T.TREE) forestEdge++;
    if (t === T.WATER) water++;
  }
  let n = 0;
  if (grass < 12) return 0;
  // 牲畜兽群
  const herds = 1 + Math.floor(grass / 60);
  for (let h = 0; h < herds; h++) {
    const type = rand() < 0.5 ? "cow" : "goat";
    const cnt = type === "cow" ? 3 + randInt(0, 3) : 4 + randInt(0, 4);
    const cx = bx + randInt(-r + 3, r - 3), cy = by + randInt(-r + 3, r - 3);
    for (let i = 0; i < cnt; i++) {
      const s = findSpot(cx, cy, 0, 4, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, type); n++; }
    }
  }
  // 野生鹿群（草地）
  const deerCnt = 2 + randInt(0, 3);
  for (let i = 0; i < deerCnt; i++) {
    const s = findSpot(bx, by, 3, r, T.GRASS);
    if (s) { spawnCreature(s.x, s.y, "deer"); n++; }
  }
  // 野猪与狼（林地边缘）
  if (forestEdge > 6) {
    for (let i = 0; i < 2 + randInt(0, 2); i++) {
      const s = findSpot(bx, by, 2, r, T.GRASS, [T.BERRY, T.FRUIT]);
      if (s) { spawnCreature(s.x, s.y, "boar"); n++; }
    }
    if (rand() < 0.5) {
      const s = findSpot(bx, by, 2, r, T.GRASS);
      if (s) { spawnCreature(s.x, s.y, "wolf"); n++; }
    }
  }
  // 海龟（浅水）
  for (let i = 0; i < 2 && water > 8; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const cx = bx + randInt(-r, r), cy = by + randInt(-r, r);
      if (tileAt(cx, cy) === T.WATER) { spawnCreature(cx, cy, "turtle"); n++; break; }
    }
  }
  return n;
}

// 野生总量自然增长（防止猎绝；分栖息地设上限）
function wildBreedTick() {
  if (world.time % 120 > 1) return;
  // 陆生：可猎物种 + 狼（捕食者种群也需延续，与羊群构成生态闭环）
  const land = creatures.filter(c => c.isWild() && !c.dead && (CREATURE_META[c.type].hunt || c.type === "wolf"));
  if (land.length < SIM.WILD_BREED_CAP && land.length >= 4) {
    const c = land[randInt(0, land.length - 1)];
    const p = findSpot(Math.round(c.x), Math.round(c.y), 0, 3, T.GRASS) ||
              (c.type === "wolf" ? findSpot(Math.round(c.x), Math.round(c.y), 0, 5, T.TREE) : null);   // 森林深处的狼可在林地繁衍
    if (p) spawnCreature(p.x, p.y, c.type);
  }
  // 海龟（浅水繁殖）
  const turtles = creatures.filter(c => c.isWild() && !c.dead && c.type === "turtle");
  if (turtles.length > 0 && turtles.length < SIM.TURTLE_CAP) {
    const t0 = turtles[randInt(0, turtles.length - 1)];
    const ps = findSpot(Math.round(t0.x), Math.round(t0.y), 0, 5, T.WATER);
    if (ps) spawnCreature(ps.x, ps.y, "turtle");
  }
  // 鲸（深海繁殖）
  const whales = creatures.filter(c => !c.dead && c.type === "whale");
  if (whales.length > 0 && whales.length < SIM.WHALE_CAP) {
    const w0 = whales[randInt(0, whales.length - 1)];
    const pw = findSpot(Math.round(w0.x), Math.round(w0.y), 0, 8, T.DEEP);
    if (pw) spawnCreature(pw.x, pw.y, "whale");
  }
}
// 鲸：深海罕见生物（航海氛围），随深海探索偶现
function spawnWhaleOccasionally() {
  if (world.time % 240 > 1) return;
  if (creatures.filter(c => c.type === "whale" && !c.dead).length >= SIM.WHALE_CAP) return;
  for (let tries = 0; tries < 60; tries++) {
    const x = Math.round(world.store.x + randRange(-160, 160));
    const y = Math.round(world.store.y + randRange(-160, 160));
    if (tileAt(x, y) === T.DEEP && !creatures.some(c => !c.dead && Math.hypot(c.x - x, c.y - y) < 40)) {
      spawnCreature(x, y, "whale");
      return;
    }
  }
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

// 原住民部落小名（查重：原住民多，12 个单字必重，扩展双字组合 + 池尽编号）
const _NATIVE = ["岩", "木", "禾", "川", "石", "叶", "风", "泉", "星", "鹿", "火", "溪"];
const _usedNative = new Set();
function pickNativeName() {
  for (let i = 0; i < 60; i++) {
    const n = "阿" + _NATIVE[randInt(0, _NATIVE.length - 1)] +
              (rand() < 0.5 ? _NATIVE[randInt(0, _NATIVE.length - 1)] : "");
    if (!_usedNative.has(n)) { _usedNative.add(n); return n; }
  }
  let k = 1;
  while (_usedNative.has("阿石" + k)) k++;
  _usedNative.add("阿石" + k);
  return "阿石" + k;
}

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

    // 航海中：一切需求冻结（船上有补给），坐标由船携带
    if (this.state === "voyage") return;

    // 被动点亮：所有人类单位走到已点亮区边缘时，顺手点亮眼前的虚空（探索不只属于探险家）
    this.litCd = (this.litCd || 0) - dt;
    if (this.litCd <= 0) {
      this.litCd = 2.5;
      const px = Math.round(this.x), py = Math.round(this.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(px + dx, py + dy) === T.VOID) {
          revealArea(px + dx * 2, py + dy * 2, 6);
          break;
        }
      }
    }

    // ---- 登岛命名：第一个踏上未知岛屿的人为它取名，并就地升格为定居点 ----
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
            o.claimed = true;
            logMsg(`${this.name} 第一个登上未知岛屿，将它命名为「${o.name}」。`);
            // 命名即定居化：面积足够的岛立即立城（粮仓+建房+开荒），纳入版图
            if (o.r >= 5 && !world.settlements.some(s => Math.hypot(s.x - o.x, s.y - o.y) < o.r + 5)) {
              const sc = findSpot(o.x, o.y, 0, Math.max(4, o.r * 0.6), T.GRASS);
              if (sc) {
                setTile(sc.x, sc.y, T.HOUSE);
                world.houses.push({ x: sc.x, y: sc.y, granary: true });
                world.settlements.push({ x: sc.x, y: sc.y, name: o.name, level: 0, stock: { wood: 15, stone: 5, sand: 10 } });
                // 房与田围绕粮仓聚簇成村（确定性外扩 + 占位防撞；田链式锚定前一块，连片生长）
                const planned = new Set([sc.x + "," + sc.y]);
                for (let i = 0; i < 3; i++) {
                  const b = expandSpot(sc, 2, Math.max(8, o.r * 0.8), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 2, Math.max(6, o.r * 0.8), T.GRASS);
                  if (b) { tasksAdd({ type: "BUILD", x: b.x, y: b.y, need: 10 }); planned.add(b.x + "," + b.y); }
                }
                let lastFarm = null;
                for (let i = 0; i < 2; i++) {
                  const refF = lastFarm || sc;
                  const f = expandSpot(refF, 1, Math.max(8, o.r), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 3, Math.max(8, o.r), T.GRASS, [T.HOUSE, T.SITE]);
                  if (f) { tasksAdd({ type: "FARM", x: f.x, y: f.y, need: 9 }); planned.add(f.x + "," + f.y); lastFarm = f; }
                }
                logMsg(`「${o.name}」升格为定居点，先民渡海建设，粮仓落成。`);
                emit("expand");
                emit("island-settled", o);
              }
            }
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

    // 决策：thinkCd 门控 + 高倍速下的全局轮询预算（SCHED.decideBudget 由 main.js 按倍速设定，
    // headless 测试默认 Infinity 不受影响）——未轮到时稍后重试，保证决策频率与倍速解耦
    if (this.thinkCd <= 0) {
      this.thinkCd = 0.4 + rand() * 0.3;
      if (SCHED.decideBudget > 0) { SCHED.decideBudget--; this.decide(); }
      else this.thinkCd = 0.05;
    }

    switch (this.state) {
      case "walk": this.stepAlong(dt); break;
      case "eat": {
        // 城市内共享粮食：吃所在城市（无半径最近聚落）的库存
        const sc = ownerSettle(this.x, this.y);
        const st = sc && ensureStock(sc);
        if (st && st.food > 0) {
          st.food -= 1; this.hunger = 100;
          this.state = "idle";
        } else { this.state = "idle"; } // 本城没粮，回去等规划器开荒/挖塘
        break;
      }
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
    // 2.8 救助被困动物：施工改变地形后，搁浅的动物需要有人送回栖息地（紧急事项，优先于领任务；喜爱牲畜者更积极）
    if (!this.task && !this.voyaging) {
      const victim = creatures.find(c => !c.dead && !c.carriedBy && !c.rescuer &&
        (c.strandT || 0) > 3 && c.type !== "bird" && c.type !== "fish" &&
        (!c.noRescueT || world.time > c.noRescueT));   // 曾接近失败：冷却 60s 后可重试（地形可能已改变）
      if (victim && rand() < (this.hobby === "animal" ? 0.5 : 0.15)) {
        if (this.goTo(victim.x, victim.y)) {
          victim.rescuer = this;
          this.rescuing = victim;
          this.state = "walk";
          this.onArrive = () => this.pickupAnimal(victim);
          return;
        }
        victim.noRescueT = world.time + 60;   // 暂时无法接近：冷却重试，不永久放弃
      }
    }

    // 3. 领任务干活
    if (!this.task) {
      // 保险：手上有产出先就地登记入库（否则领新任务 → 旧产出被下次完工覆盖而蒸发）
      if (this.carrying) this.deposit();
      const t = tasksTake(this);
      if (t) {
        // 劳动保护：路程耗能（ENERGY_DECAY 0.9/s ÷ 船速 1.7 格/s 往返）预估不足 → 先睡觉，防止远途过劳死
        const d = Math.abs(t.x - this.x) + Math.abs(t.y - this.y);
        if (this.energy < Math.min(95, 18 + d * (this.job === "explorer" ? 0.4 : 0.75))) { this.goSleep(); return; }   // 探索者耐走（系数减半）
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

    // 3.8 航海：探险家/向往远方的居民从码头坐船出海开拓（消耗联合木材造船）
    if (!this.task && !this.voyaging && world.docks.length &&
        (this.job === "explorer" || this.hobby === "explore") && this.adventure > 0.4 &&
        rand() < 0.08) {
      const dock = world.docks.reduce((b, d) =>
        !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
      if (dock && this.goTo(dock.x, dock.y)) {
        this.state = "walk";
        this.onArrive = () => this.startVoyage(dock);
        return;
      }
    }

    // 3.95 专职探索者：前沿螺旋探索——找到最近「陆地与虚空接壤」的前沿格前往大面积点亮；
    //      局部扫不到前沿（或前沿被水隔开）时倾向出海（航海回退，点亮新海域后前沿自然出现）
    if (this.job === "explorer" && !this.task && !this.voyaging && this.energy > 30 && this.hunger > 40) {
      // 前沿扫描节流：每 2 sim 秒一次，期间复用缓存（deide 高频不重复扫屏）
      if (world.time - (this.frontScanT || -9) > 2) {
        this.frontScanT = world.time;
        this.frontCache = findFrontier(Math.round(this.x), Math.round(this.y), 80);   // 扫描 80 格：点亮推进后新前沿仍在视野
      }
      const front = this.frontCache;
      if (front) {
        if (this.goTo(front.x, front.y)) {
          this.state = "walk";
          this.onArrive = () => {
            this.state = "idle";
            // 到达前沿：大面积点亮 + 连击（向斑块边缘再点 2 处，一次驻留推进一大片）
            if (tileAt(front.x, front.y) !== T.VOID) {
              revealArea(front.x, front.y, 12 + Math.round(this.adventure * 6));
              for (let k = 0; k < 2; k++) {
                const ang = rand() * Math.PI * 2, d2 = 10 + rand() * 10;
                const px = Math.round(front.x + Math.cos(ang) * d2), py = Math.round(front.y + Math.sin(ang) * d2);
                if (tileAt(px, py) === T.VOID) revealArea(px, py, 10);
              }
            }
          };
          return;
        }
        this.frontCache = null;   // 前沿被水隔开不可达：清缓存，转出海判定
      }
      if (!front && world.docks.length && rand() < 0.5) {
        const dock = world.docks.reduce((b, d) =>
          !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
        if (dock && this.goTo(dock.x, dock.y)) {
          this.state = "walk";
          this.onArrive = () => this.startVoyage(dock);
          return;
        }
      }
    }

    // 4. 探索欲：高探索欲的居民会主动向未知远方进发（点亮虚空、发现新岛）
    if (!this.task) {
      if (this.exploring) {
        // 探索旅程进行中：精力/饥饿尚可且腿数未满 → 继续向外延伸（专职探索者不受腿数限制）
        if (this.energy > 30 && this.hunger > 40 &&
            this.exploreLegs < (this.job === "explorer" ? Infinity : 2 + this.adventure * 4)) {
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

  // 入库：把搬运的产出登记进仓库（粮食与其他资源一致：进所属城市库存，城市内共享）
  deposit() {
    if (!this.carrying) return;
    const { res, amount } = this.carrying;
    this.carrying = null;
    const s = ownerSettle(Math.round(this.x), Math.round(this.y));
    if (s) ensureStock(s)[res] += amount;
  }

  // 死亡结算：释放任务与住房，通知世界（背包产出就地登记——拓荒者的遗物不白白散失）
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    if (this.task) { tasksRelease(this.task, this); this.task = null; }
    if (this.rescuing) { this.rescuing.rescuer = null; this.rescuing = null; }   // 释放被困动物的认领锁
    if (this.carrying) { this.deposit(); this.carrying = null; }   // 遗产：产出就地入库
    this.home = null;
    logMsg(`${this.name} ${reason}，享年 ${Math.floor(this.age)} 岁。`);
    emit("agent-death", this);
  }

  // 抱起搁浅动物：找最近的可达栖息地（水生物种由岸边送回水中），动身前往
  pickupAnimal(c) {
    if (c.dead || c.rescuer !== this) { this.rescuing = null; return; }
    const want = c.type === "whale" ? T.DEEP : (CREATURE_META[c.type].habitat === "water" ? T.WATER : T.GRASS);
    // 栖息格 + 小人可站立的岸边格配对（水格本身不可通行，从岸边把动物送下水）
    let spot = null, stand = null;
    for (let i = 0; i < 6 && !spot; i++) {
      const s = findSpot(Math.round(this.x), Math.round(this.y), 2, 30, want);
      if (!s) break;
      if (want === T.GRASS) { spot = s; stand = s; break; }   // 陆生直接走到放归点
      const sh = neighborsOf(s.x, s.y).find(p => walkable(p.x, p.y));
      if (sh) { spot = s; stand = sh; }
    }
    if (!spot) { c.rescuer = null; this.rescuing = null; return; }   // 附近找不到栖息地：放弃
    c.carriedBy = this;
    c.strandT = 0;
    if (!this.goTo(stand.x, stand.y)) {
      // 岸边不可达：就地放下（尽力了，动物回到原状态）
      c.carriedBy = null; c.rescuer = null; this.rescuing = null;
      return;
    }
    this.state = "walk";
    this.onArrive = () => this.releaseAnimal(c, spot);
  }

  // 到达放归点：动物回到栖息地，恢复自由
  releaseAnimal(c, spot) {
    c.carriedBy = null;
    if (!c.dead) {
      c.x = spot.x + 0.5; c.y = spot.y + 0.5;
      c.strandT = 0; c.target = null;
      logMsg(`${this.name} 把被困的${CREATURE_META[c.type].name}送回了安全的栖息地。`);
    }
    c.rescuer = null;
    this.rescuing = null;
    this.state = "idle";
  }

  // 驾小渔船出海捕鱼：造船耗少量联合木材，近海鱼点起网，满舱返航卸货（船逻辑见 shipTick 渔船分支）
  startFishingTrip(dock) {
    if (this.voyaging || this.state === "voyage") return false;   // 已在海上的人不能再出海
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停渔船。", 40); return; }
    // 木材安全余量：留 12 木给通路工程（桥/填海优先于渔船，防止工程被造船饿死）
    if (jointStock("wood") < SIM.BOAT_COST + 12) {
      logThrottled("木材不足，无力打造渔船。", 40);
      return;
    }
    jointConsume("wood", SIM.BOAT_COST);
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang: rand() * Math.PI * 2, sailor: this, state: "fishing",
      boat: true, hold: 0, fishCd: 0, target: pickFishingSpot(dock), revealCd: 0, dist: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`${this.name} 驾着小渔船出海捕鱼了。`);
    return true;
  }

  // 出海远航：造船消耗联合木材，装载粮草做补给，登船后航向未知海域（船逻辑见 world.shipTick）
  startVoyage(dock) {
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停船。", 40); return; }
    // 先探明码头周边水域（点亮生成真实地形，避免朝向落入"VOID 生成后变陆地"的陷阱）
    revealArea(water.x, water.y, 9);
    // 初始朝向：均匀扫描 24 个方位角找前方 3 格开阔的方向（确定性，地理允许即必命中）
    let ang = -1;
    for (let k = 0; k < 24; k++) {
      const tAng = (k / 24) * Math.PI * 2 + rand() * 0.15;
      let open = true;
      for (let d = 1.5; d <= 3; d += 0.5) {
        const t = tileAt(Math.round(water.x + Math.cos(tAng) * d), Math.round(water.y + Math.sin(tAng) * d));
        if (t !== T.VOID && t !== T.DEEP && t !== T.WATER) { open = false; break; }
      }
      if (open) { ang = tAng; break; }
    }
    if (ang < 0) { logThrottled("码头周边水路不畅，远航船无法出港。", 40); return; }
    // 同样留木材安全余量给通路工程
    if (jointStock("wood") < SIM.SHIP_COST + 12) {
      logThrottled("木材不足，无法造船远航。", 40);
      return;
    }
    jointConsume("wood", SIM.SHIP_COST);
    // 装载补给（粮食）：从码头所属城市库存装粮，有多少装多少，不满也出海
    const portCity = ownerSettle(dock.x, dock.y);
    const supply = portCity ? ensureStock(portCity).food : 0;
    const load = Math.min(SIM.SHIP_PROVISION_LOAD, Math.floor(supply));
    if (load < SIM.SHIP_PROVISION_LOAD) {
      logMsg(`${this.name} 的船粮草不满（${load}/${SIM.SHIP_PROVISION_LOAD}），仍执意扬帆出海。`);
    }
    if (portCity) ensureStock(portCity).food -= load;
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang, sailor: this, state: "sailing",
      prov: load, dist: 0, revealCd: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`航海家 ${this.name} 从码头扬帆出海，驶向未知的海域。`);
  }

  // 探索延伸一腿：从小人当前位置贴身向前点亮（斑块与脚下接壤），然后走向点亮区
  exploreLeg() {
    // 前方 2~5 格处为点亮中心，保证斑块边缘与当前位置接壤
    const dist = 3 + rand() * 3;
    const tx = Math.round(this.x + this.exploring.dx * dist);
    const ty = Math.round(this.y + this.exploring.dy * dist);
    revealArea(tx, ty, randRange(7.5, SIM.REVEAL_RADIUS));
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
      if (meta.diggable) {
        // 山/树：单格立项开凿
        const exist = tasks.list.find(k => !k.done && k.x === b.x && k.y === b.y);
        if (!exist) {
          tasksAdd({ type: "DIG", x: b.x, y: b.y });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的${meta.name}挡住了去路，立项改造。`, 15);
        }
      } else if (t === T.WATER || t === T.DEEP) {
        // 跨水：链式桥——立项首格（blocked 必邻工人所站格，必可达），带朝目标方向与剩余步数；
        // 建成后 tasksFinish 沿方向续立下一格（remain 递减到 0 停，桥不无限穿海），
        // 工人跟进过桥，走到新桥头再续——细长桥线直通对岸
        const dup = tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y);
        // 同海峡只架一条桥：25 格内已有桥（在建成线）则不另起炉灶，等它建成即可通行
        if (!dup && !nearAny(b.x, b.y, [T.BRIDGE], 25) && tasksPending("BRIDGE", true).length < 40) {
          tasksAdd({ type: "BRIDGE", x: b.x, y: b.y,
            corridor: { dx: Math.sign(tx - b.x) || 0, dy: Math.sign(ty - b.y) || 0,
              remain: Math.abs(tx - b.x) + Math.abs(ty - b.y) } });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的水域挡住了去路，开始架桥。`, 15);
        }
      } else if (meta.fillable) {
        // 其余可填格（罕见）：兜底单格填平
        if (!tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y)) tasksAdd({ type: "FILL", x: b.x, y: b.y });
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
    // 水生猎物（鱼群）不追踪——渔人守在立项给的岸边格，圈养水域由任务结算处理
    let gx = t.x, gy = t.y, chaseR = 2.2;
    if (t.creature) {
      if (t.creature.dead) { this.abandonTask(); return; }
      const waterPrey = CREATURE_META[t.creature.type].habitat === "water";
      if (!waterPrey) {
        gx = t.creature.x - 0.5; gy = t.creature.y - 0.5;
        chaseR = 5;
        const d = Math.hypot(gx + 0.5 - this.x, gy + 0.5 - this.y);
        if (d > 6) {
          if (this.goTo(Math.round(gx), Math.round(gy))) { this.state = "walk"; this.onArrive = () => { this.state = "work"; }; }
          else this.abandonTask();
          return;
        }
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
      const r = workTile(t, effort);
      if (r && r.done) {
        const y = tasksFinish(t, this, r.was);   // 完成任务，传入改造前 tile 判定产出
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

// 螺旋向外找最近的前沿格：可站立陆地且 4 邻含 VOID（探索者的目标点；只扫局部，成本受 maxR 约束）
function findFrontier(cx, cy, maxR) {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只扫当前圈
        const x = cx + dx, y = cy + dy;
        if (!walkable(x, y)) continue;
        if (neighborsOf(x, y).some(p => tileAt(p.x, p.y) === T.VOID)) return { x, y };
      }
    }
  }
  return null;
}

// 从 (x,y) 的连通浅水格数（只走 WATER）是否 ≤cap——小池塘不需要架桥
function waterRegionSmall(x, y, cap) {
  const seen = new Set([x + "," + y]);
  const q = [[x, y]];
  let count = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const p of neighborsOf(cx, cy)) {
      const k = p.x + "," + p.y;
      if (seen.has(k)) continue;
      if (tileAt(p.x, p.y) !== T.WATER) continue;
      seen.add(k); count++;
      if (count > cap) return false;
      q.push([p.x, p.y]);
    }
  }
  return true;
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
// 评分 = 离人距离×0.3 + 离食物距离 + 地区人口密度倾向：
//   探索型居民（先锋者）偏好人口少的地区（向往边疆），恋家者偏好人口多的成熟社区
function assignHomes() {
  const count = {};
  const key = h => `${h.x},${h.y}`;
  for (const a of agents) {
    if (a.home) count[key(a.home)] = (count[key(a.home)] || 0) + 1;
  }
  for (const a of agents) {
    if (a.home) continue;
    const pioneer = a.hobby === "explore" || a.adventure > 0.6;
    let best = null, bestScore = Infinity, bestKey = null;
    for (const h of world.houses) {
      const k = key(h);
      if ((count[k] || 0) >= 3) continue;
      const food = nearestFoodTo(h.x, h.y).dist;
      // 该房的当前住户数即拥挤度信号
      const crowd = count[k] || 0;
      const crowdTerm = pioneer ? -crowd * 1.2 : crowd * 0.5;
      const score = (Math.abs(h.x - a.x) + Math.abs(h.y - a.y)) * 0.3 + food + crowdTerm;
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
// 距 (x,y) 最近的同类设施（聚簇基准点）
function nearestOf(list, p) {
  let best = null, bd = 1e9;
  for (const o of list) {
    const d = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// 同聚落内的设施列表（聚簇只在区内进行——用户需求：不同地区之间不需要聚集）
// 归属判定用无半径最近聚落（设施选址半径可大于 SETTLEMENT_RADIUS，nearestSettlement 会误判为无主）
function localFacilities(list, settle) {
  if (!settle) return list;
  return list.filter(o => ownerSettle(o.x, o.y) === settle);
}
function plannerTick() {
  const pop = agents.length;
  const homeless = agents.filter(a => !a.home).length;

  // 1. 住房前瞻：容量余量不足（或已有人无家）→ 建房；选址失败说明本区
  //    已无立足之地 → 直接开辟新区。房屋富余（够住且多 3 间以上）则不新建
  //    闸门只统计"还在正常推进"的任务，冻结任务不算数，防止堵死建房通道；
  //    无家者超过 6 人时无视账面容量富余，强制补建（孤立地段的房不算有效容量）
  //    选址偏好：同聚落内房子聚簇（新屋挨着已有房屋 3 格内，房间距防贴脸），跨聚落不要求
  const capacity = world.houses.length * 3;
  if ((homeless > 6 || capacity - pop <= 2) && capacity <= pop + 8 && tasksPending("BUILD", true).length < 3) {
    // 锚点优先：有居住区划的聚落 → 居住区（区内也聚簇：新屋挨已有房屋）；再无家者重心；再粮仓锚点
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "housing");
      if (z) {
        const ref = nearestOf(localFacilities(world.houses, st), z);
        s = (ref && expandSpot(ref, 2, 6, T.GRASS)) ||
            findSpot(z.x, z.y, 0, z.r, T.GRASS);
        if (s) break;
      }
    }
    if (!s) {
      const c = centroidOf(agents.filter(a => !a.home));
      const anchor = c || pickAnchor();
      const ref = nearestOf(localFacilities(world.houses, nearestSettlement(anchor.x, anchor.y)), anchor);
      s = (ref && expandSpot(ref, 2, 6, T.GRASS)) ||
          (c && findSpot(c.x | 0, c.y | 0, 2, 14, T.GRASS)) ||
          findSpot(anchor.x, anchor.y, 3, 18, T.GRASS);
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
  //    选址偏好：同聚落内农田连片（新田挨着已有农田 3 格内，田可紧贴成片），跨聚落不要求
  if (world.farms.length * 6 < pop + 8 && tasksPending("FARM", true).length < 2) {
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "farm");
      if (z) {
        const ref = nearestOf(localFacilities(world.farms, st), z);
        s = (ref && expandSpot(ref, 1, 6, T.GRASS)) ||
            findSpot(z.x, z.y, 0, z.r, T.GRASS, [T.HOUSE, T.SITE]);
        if (s) break;
      }
    }
    if (!s) {
      const starving = agents.filter(a => a.hunger < 40);
      const c = starving.length >= 3 ? centroidOf(starving) : null;
      const anchor = c || pickAnchor();
      const ref = nearestOf(localFacilities(world.farms, nearestSettlement(anchor.x, anchor.y)), anchor);
      s = (ref && expandSpot(ref, 1, 6, T.GRASS)) ||
          findSpot(anchor.x, anchor.y, c ? 3 : 4, c ? 16 : 26, T.GRASS, [T.HOUSE, T.SITE]);
    }
    if (s) {
      // 灌溉约束：农田 5 格内需有水（海/塘均可）；选址无水 → 先挖塘引水
      // 挖塘方向性：向最近水源的水缘挖（塘从天然水"长"向农田，连片不零散）；无水可依才贴田独立挖
      if (nearAny(s.x, s.y, [T.WATER, T.DEEP], 5)) {
        tasksAdd({ type: "FARM", x: s.x, y: s.y, need: 9 });
        logThrottled(`规划署：粮食储备吃紧（${Math.floor(totalFood())}），批准开垦 (${s.x},${s.y})。`, 10);
      } else if (tasksPending("EXCAV", true).length < 1) {
        // 找最近水源：以农田为心螺旋 30 格
        let water = null;
        outerW:
        for (let r = 6; r <= 30; r++) {
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const t2 = tileAt(s.x + dx, s.y + dy);
            if (t2 === T.WATER || t2 === T.DEEP) { water = { x: s.x + dx, y: s.y + dy }; break outerW; }
          }
        }
        // 水缘朝农田侧挖（贴着天然水连片）；无水才贴田独立挖
        const pond = (water && findPondSpot(water, 4)) ||
                     (water && findPondSpot(s, 6)) ||
                     expandSpot(s, 2, 6, T.GRASS, new Set()) ||
                     findSpot(s.x, s.y, 2, 5, T.GRASS, [T.FARM, T.HOUSE]);
        if (pond) {
          tasksAdd({ type: "EXCAV", x: pond.x, y: pond.y, need: 8 });
          logThrottled(`规划署：新农田远离水源，先在 (${pond.x},${pond.y}) 挖塘引水。`, 20);
        } else {
          tasksAdd({ type: "FARM", x: s.x, y: s.y, need: 9 });   // 无处挖塘：照旧建田（等世界变化）
        }
      }
      // 已有 EXCAV 在挖：暂缓建田（水到渠成）
    }
  }
  // 2b. 采集：附近有果量充足的浆果丛/果树 → 采集队
  if (totalFood() < 60 + pop * 3 && tasksPending("GATHER", true).length < 2) {
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
  // 2c. 狩猎：附近有野生牛羊 → 猎队（立项前确认动物存活，且未被捕获任务占用）
  if (totalFood() < 60 + pop * 3 && tasksPending("HUNT", true).length < 1) {
    const a = pickAnchor();
    const wild = creatures.filter(c => c.isWild() && !c.dead && CREATURE_META[c.type].hunt &&
      Math.abs(c.x - a.x) + Math.abs(c.y - a.y) < 30 && !tasks.list.some(k => k.creature === c && !k.done));
    if (wild.length) {
      const c = wild[0];
      tasksAdd({ type: "HUNT", x: Math.round(c.x - 0.5), y: Math.round(c.y - 0.5), creature: c });
    }
  }
  // 兜底清理：猎物已死的 HUNT/CAPTURE 任务立即移除（否则永久占位阻塞该物种新立项）
  for (let i = tasks.list.length - 1; i >= 0; i--) {
    const t = tasks.list[i];
    if ((t.type === "HUNT" || t.type === "CAPTURE") && t.creature && t.creature.dead) {
      for (const w of t.workers) { if (w.task === t) { w.task = null; if (w.state === "walk" || w.state === "work") w.state = "idle"; } }
      tasks.list.splice(i, 1);
    }
  }
  // 2d. 畜牧（开局解锁：驯化早于定居文明）：无牧场 → 建牧场；有牧场有空位且附近有野生牲畜 → 捕获
  if (world.era >= 0) {
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
  // 2d2. 渔场：圈养鱼群不足 → 三级策略
  //      ① 近岸有野生鱼群 → 原地圈养（水域即渔场，无需建筑）
  //      ② 无近岸鱼群但聚落近处有水域 → 从远处野生鱼群捕苗运来圈养（dest 指定水域）
  //      ③ 连可用的水域都没有 → 先挖塘（EXCAV，塘成后回到②）
  if (tasksPending("CAPTURE", true).length < 1 &&
      creatures.filter(c => c.pasture && c.type === "fish" && !c.dead).length < SIM.PASTURE_CAP) {
    const a = pickAnchor();
    const wild = creatures.filter(c => c.isWild() && !c.dead && c.type === "fish" &&
      !tasks.list.some(k => k.creature === c && !k.done));
    let placed = false;
    // ① 原地圈养
    for (const f of wild) {
      const fx = Math.round(f.x - 0.5), fy = Math.round(f.y - 0.5);
      if (Math.abs(fx - a.x) + Math.abs(fy - a.y) > 30) continue;
      const shore = neighborsOf(fx, fy).find(p => walkable(p.x, p.y));
      if (shore) {
        tasksAdd({ type: "CAPTURE", x: shore.x, y: shore.y, need: 5, creature: f, pasture: { x: fx, y: fy } });
        placed = true;
        break;
      }
    }
    // ② 运鱼到聚落近处水域
    if (!placed) {
      const dest = findSpot(a.x, a.y, 4, 18, T.WATER, [T.DOCK]);
      if (dest && wild.length && !creatures.some(c => c.pasture && c.type === "fish" &&
          Math.abs(c.pasture.x - dest.x) + Math.abs(c.pasture.y - dest.y) < 3)) {
        const seed = wild[0];
        const sx = Math.round(seed.x - 0.5), sy = Math.round(seed.y - 0.5);
        const shore = neighborsOf(sx, sy).find(p => walkable(p.x, p.y));
        if (shore) {
          tasksAdd({ type: "CAPTURE", x: shore.x, y: shore.y, need: 5, creature: seed,
            pasture: { x: sx, y: sy }, dest: { x: dest.x, y: dest.y } });
          logThrottled("渔人打算捕些鱼苗，送到近处的水域里放养。", 30);
          placed = true;
        }
      }
    }
    // ③ 挖塘：聚簇选址（连击优先贴上次的塘，其次贴天然水，最后独立）
    if (!placed && tasksPending("EXCAV", true).length < 1) {
      const pond = (_lastPond && expandSpot(_lastPond, 1, 6, T.GRASS, new Set())) ||
                   findPondSpot(a, 12) ||
                   findSpot(a.x, a.y, 3, 12, T.GRASS, [T.FARM, T.HOUSE]);
      if (pond) {
        tasksAdd({ type: "EXCAV", x: pond.x, y: pond.y, need: 8 });
        logThrottled("规划署：近处没有可养鱼的水域，先挖一口鱼塘。", 30);
      }
    }
  }
  // 2e. 资源采集：各聚落木材/石材/沙土低于阈值 → 立项伐木/采石/采沙/植树
  for (const s of world.settlements) {
    const stock = ensureStock(s);
    const digPending = type => tasksPending("DIG", true).filter(t => t.res === type).length;
    if (stock.wood < 25 && digPending("wood") < 6) {   // 储备线 25：造船消耗大，伐木要跑在前面
      const t = findSpot(s.x, s.y, 2, 30, T.TREE);
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
    if (stock.wood < 15 && tasksPending("PLANT", true).length < 2) {
      const t = findSpot(s.x, s.y, 3, 12, T.GRASS);
      if (t) tasksAdd({ type: "PLANT", x: t.x, y: t.y, need: 4 });
    }
  }
  // 2e2. 码头（定居时代解锁）：临水草地建码头，开启航海时代
  if (world.era >= 1 && world.docks.length === 0 && tasksPending("DOCK", true).length < 1) {
    for (const s of world.settlements) {
      const shore = findSpot(s.x, s.y, 3, 26, T.GRASS, [T.DOCK]);
      if (shore && neighborsOf(shore.x, shore.y).some(p => tileAt(p.x, p.y) === T.WATER)) {
        tasksAdd({ type: "DOCK", x: shore.x, y: shore.y, need: 20 });
        break;
      }
      // 找不到临水格 → 聚落 30 格内找浅水邻格的草地
      let placed = false;
      for (let tries = 0; tries < 100 && !placed; tries++) {
        const cx = s.x + randInt(-30, 30), cy = s.y + randInt(-30, 30);
        if (tileAt(cx, cy) !== T.GRASS) continue;
        if (neighborsOf(cx, cy).some(p => tileAt(p.x, p.y) === T.WATER)) {
          tasksAdd({ type: "DOCK", x: cx, y: cy, need: 20 });
          placed = true;
        }
      }
      if (placed) break;
    }
  }
  // 不可再生资源的替代渠道（城邦解锁）：洞穴旁建采石场、河滩建沙场
  if (world.era >= 2) {
    for (const s of world.settlements) {
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
  if (totalFood() < 60 + pop * 3 && tasksPending("FISH", true).length < 2) {
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

  // 2h2. 渔船：有码头且海上有鱼群 → 渔民驾小渔船近海捕捞（渔获回港入粮池；渔民休整后才再出港）
  if (world.era >= 1 && world.docks.length &&
      world.ships.filter(s => s.boat).length < SIM.FISHING_BOAT_CAP &&
      world.fishStock.size > 0) {
    const fisher = agents.find(x => !x.dead && !x.task && !x.voyaging && !x.rescuing &&
      (x.hobby === "fishing" || x.job === "fisher") &&
      (!x.boatRestT || world.time > x.boatRestT));
    if (fisher) {
      const dock = world.docks.reduce((b, d) =>
        !b || Math.abs(d.x - fisher.x) + Math.abs(d.y - fisher.y) < Math.abs(b.x - fisher.x) + Math.abs(b.y - fisher.y) ? d : b, null);
      if (dock && fisher.goTo(dock.x, dock.y)) {
        fisher.state = "walk";
        fisher.onArrive = () => fisher.startFishingTrip(dock);
      }
    }
  }

  // 2h3. 探索者边疆拓殖：探索者的家随前沿迁移（每 30s 检查一次），前沿旁无房则立项建房——城市向星空生长
  if (world.time - (_frontierCd || -999) > 30) {
    _frontierCd = world.time;
    for (const e of agents.filter(a => !a.dead && a.job === "explorer" && a.home && !a.voyaging)) {
      const front = findFrontier(e.home.x | 0, e.home.y | 0, 60);
      if (!front) continue;
      const dHome = Math.abs(front.x - e.home.x) + Math.abs(front.y - e.home.y);
      if (dHome <= 50) continue;   // 家离前沿足够近
      // 前沿附近找已有房子迁居
      const nearHouse = world.houses.find(h => Math.abs(h.x - front.x) + Math.abs(h.y - front.y) < 15 &&
        !agents.some(a2 => !a2.dead && a2 !== e && a2.home === h));
      if (nearHouse) {
        e.home = { x: nearHouse.x, y: nearHouse.y };
        logMsg(`探索者 ${e.name} 把家搬到了边疆，离世界边界更近了。`);
      } else if (!tasks.list.some(k => !k.done && k.type === "BUILD" &&
          Math.abs(k.x - front.x) + Math.abs(k.y - front.y) < 12)) {
        // 前沿旁无房：立项边疆新居（不与其他建房任务挤在一起）
        const spot = expandSpot(front, 2, 8, T.GRASS, new Set()) || findSpot(front.x, front.y, 2, 8, T.GRASS);
        if (spot) {
          tasksAdd({ type: "BUILD", x: spot.x, y: spot.y, need: 14 });
          logMsg(`边疆营帐：探索者的新居将立在前沿 (${spot.x},${spot.y}) 旁。`);
        }
      }
    }
  }

  // 3. 饥荒告警（一天最多提醒一次，避免刷屏）
  const days = totalFood() / Math.max(1, pop * 0.9);
  if (days < 1 && pop > 0) { logThrottled(`饥荒告警：存粮仅够 ${days.toFixed(1)} 天！`, SIM.DAY_LEN); emit("famine"); }

  // 4. 人口自然增长：由农田承载余量驱动（田先于人到位），饥荒期停止生育
  //    出生安全垫随人口放大（food > 100 + 人口×4），防止出生率超过承载力引发饿死潮
  //    BIRTH_CHECK 是每秒概率，规划器每 PLANNER_INTERVAL 秒才判一次，需换算成窗口概率
  const hasRoom = world.houses.length * 3 > pop;
  if (pop > 0 && totalFood() > 40 && world.farms.length * 5 >= pop + 4 && hasRoom && rand() < SIM.BIRTH_CHECK * SIM.PLANNER_INTERVAL) {
    const near = findBirthSpot();
    const birthCity = near && ownerSettle(near.x, near.y);
    if (near && birthCity && ensureStock(birthCity).food < 12) { /* 出生城市存粮不足：暂缓生育 */ }
    else if (near) {
      const baby = spawnAgent(near.x, near.y);
      baby.age = 0;   // 新生儿从 0 岁长大（1 游戏年 = 1 岁）
      logThrottled(`新生命降临，人口达到 ${pop + 1}。`, 8);
      emit("birth");
    }
  }

  // 5. 疆土随人口生长：每增长约 25 人，规划署主动开辟一片新疆土（无人口上限）
  if (pop >= (world.expansions + 1) * 20) {   // 每 20 人生长一次疆土
    expand();
  }

  // 6. 冻结任务自愈：冻结超 60 秒的**开凿**工程，自动把周围 2 格同类障碍补成立项（山地走廊保留宽度机制）。
  //    FILL/BRIDGE 不参与扩散：跨水通路由 goTo 的连续水段桥线一次成型（1 格宽细桥，不再菱形铺沙）。
  //    建造/填海类任务累计冻结 180 秒仍无法施工 → 放弃（填海恢复为水），释放名额
  for (let i = tasks.list.length - 1; i >= 0; i--) {
    const t = tasks.list[i];
    if ((t.blockedCount || 0) < 3) continue;
    t.freezeAge = (t.freezeAge || 0) + SIM.PLANNER_INTERVAL;

    if (t.freezeAge >= 180 && (t.type === "BUILD" || t.type === "FARM" || t.type === "FILL")) {
      setTile(t.x, t.y, t.type === "FILL" ? T.WATER : T.GRASS);   // 填海放弃恢复为水
      tasks.list.splice(i, 1);
      logThrottled("规划署放弃了一处无法施工的地块。", 60);
      continue;
    }
    if (t.freezeAge < 60) continue;
    t.freezeAge = 0;
    t.blockedCount = 0;
    if (t.type !== "DIG") continue;   // 只有开凿需要横向扩宽（凹形山壁卡死），水路已改用桥线
    for (let dy2 = -2; dy2 <= 2; dy2++) {
      for (let dx2 = -2; dx2 <= 2; dx2++) {
        const nx2 = t.x + dx2, ny2 = t.y + dy2;
        const meta2 = TILE_META[tileAt(nx2, ny2)];
        if (meta2.diggable && !tasks.list.some(k => !k.done && k.x === nx2 && k.y === ny2)) {
          tasksAdd({ type: "DIG", x: nx2, y: ny2 });
        }
      }
    }
  }

  // 7. 丰收宴席：存粮远超需求时全城共食（每 3 天最多一次），富余粮食有了出口
  if (pop > 0 && totalFood() > 60 + pop * 5 && world.time - _lastFeast > SIM.DAY_LEN * 3) {
    // 宴席消耗由存粮最多的城市承担
    const rich = world.settlements.slice().sort((a, b) => (b.stock ? b.stock.food || 0 : 0) - (a.stock ? a.stock.food || 0 : 0))[0];
    if (rich) ensureStock(rich).food = Math.max(0, ensureStock(rich).food - (40 + pop));
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

  // 10. 劳动力市场：职业随需求流转（没活干会转行）
  jobMarketTick(pop);

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

// ---- 农田生长（需水灌溉：5 格以内有水才能成熟，缺水停滞；结果缓存 2 秒节流） ----
function farmTick(dt) {
  for (const f of world.farms) {
    f.waterCd = (f.waterCd || 0) - dt;
    if (f.waterCd <= 0) {
      f.waterCd = 2;
      const was = f.irrigated;
      f.irrigated = nearAny(f.x, f.y, [T.WATER, T.DEEP], 5);
      if (was && !f.irrigated) logThrottled("一片农田失去了灌溉水源，收成停滞了。", 60);
    }
    if (!f.irrigated) continue;   // 缺水：停止生长（不倒退，等水来了继续）
    f.grow += dt;
    if (f.grow >= SIM.FARM_MATURITY) {
      f.grow = 0;
      const st = ownerSettle(f.x, f.y);
      if (st) ensureStock(st).food += SIM.FARM_YIELD;   // 粮食进所属城市库存
      f.flash = 0.6; // 成熟闪光（渲染用）
    }
    if (f.flash > 0) f.flash -= dt;
  }
}

// ---- 模拟主步进 ----
let _plannerCd = SIM.PLANNER_INTERVAL;
let _lastFeast = -999;
let _frontierCd = -999;

function simUpdate(dt) {
  world.time += dt;
  world.timeOfDay = (world.time % SIM.DAY_LEN) / SIM.DAY_LEN;

  for (const a of agents) a.update(dt);
  for (const c of creatures) c.update(dt);
  shipTick(dt);
  // 死者退场（名册/住房/任务引用同步释放）
  for (let i = agents.length - 1; i >= 0; i--) {
    if (agents[i].dead) agents.splice(i, 1);
  }
  farmTick(dt);
  berryTick();
  wildBreedTick();
  spawnWhaleOccasionally();
  quarryTick();

  _plannerCd -= dt;
  if (_plannerCd <= 0) { _plannerCd = SIM.PLANNER_INTERVAL; plannerTick(); }
}

// 劳动力市场：职业随需求平滑流转——零待办的职业逐渐转出，最缺工的职业逐渐补入
function jobMarketTick(pop) {
  // 探索者名额：按人口每 20 人 1 名（世界边界推进的主力），至少 1 人
  // 缺额时从人数最多的非探索者职业中挑 adventure 最高者转职（不抽独苗职业，避免抽走唯一的渔夫/猎人）
  const explorerN = agents.filter(a => !a.dead && a.job === "explorer").length;
  const explorerWant = Math.max(1, Math.floor(agents.length / 20));
  if (explorerN < explorerWant) {
    const byJob = {};
    for (const a of agents) if (!a.dead && a.job !== "explorer") (byJob[a.job] = byJob[a.job] || []).push(a);
    let pool = null;
    for (const j of Object.keys(byJob)) {
      if (byJob[j].length < 2) continue;
      if (!pool || byJob[j].length > pool.length) pool = byJob[j];
    }
    if (pool) {
      const best = pool.sort((a, b) => b.adventure - a.adventure)[0];
      best.job = "explorer";
      logMsg(`${best.name} 放下手中活计，专职成为探索者——去把世界的边界找出来。（${explorerN + 1}/${explorerWant}）`);
    }
  }
  const demand = {
    farmer:      tasksPending("FARM", true).length,
    lumberjack:  tasksPending("DIG", true).filter(t => t.res === "wood").length,
    miner:       tasksPending("DIG", true).filter(t => t.res === "stone").length,
    hunter:      tasksPending("HUNT", true).length + tasksPending("CAPTURE", true).length,
    fisher:      tasksPending("FISH", true).length,
    builder:     tasksPending("BUILD", true).length + tasksPending("PASTURE", true).length +
                 tasksPending("DOCK", true).length + tasksPending("QUARRY", true).length +
                 tasksPending("SANDPIT", true).length + tasksPending("PLANT", true).length +
                 tasksPending("PLANT_BERRY", true).length,
    explorer:    1,   // 探索自有行为，恒有需求
  };
  const workers = {};
  for (const a of agents) if (!a.dead) workers[a.job] = (workers[a.job] || 0) + 1;
  world.jobIdle = world.jobIdle || {};

  // 供过于求的职业：零待办持续 60 秒，或从业人数超过需求 4 倍
  const oversupply = [];
  for (const j of Object.keys(JOBS)) {
    if (j === "explorer") continue;
    const d = demand[j], w = workers[j] || 0;
    if (d === 0) {
      world.jobIdle[j] = (world.jobIdle[j] || 0) + SIM.PLANNER_INTERVAL;
      if (world.jobIdle[j] > 60) oversupply.push(j);
    } else {
      if (w > d * 4) oversupply.push(j);
      world.jobIdle[j] = 0;
    }
  }
  // 转入目标：人均需求最大且仍有待办的职业
  const target = Object.keys(JOBS).filter(j => demand[j] > 0)
    .sort((a, b) => demand[b] / Math.max(1, workers[b] || 0) - demand[a] / Math.max(1, workers[a] || 0))[0];
  if (!target || !oversupply.length || target === oversupply[0]) return;
  // 每周期最多转 2 人（平滑流动防振荡）
  let moved = 0;
  for (const j of oversupply) {
    const ws = agents.filter(a => a.job === j && !a.dead);
    if (!ws.length) continue;
    ws[0].job = target;
    moved++;
    if (moved >= 2) break;
  }
  if (moved) logThrottled(`${JOBS[oversupply[0]].name}转职为${JOBS[target].name}——劳动力随需求流动。`, 40);
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
