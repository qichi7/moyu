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
