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
  world.logSeq = (world.logSeq || 0) + 1; // 单调计数，供 HUD 判刷新——截断使 length 恒定，length 判据会永久停更
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
  world.rivers = world.rivers || new Set();   // 惰性初始化：河流水格登记表（主岛与发现岛都经此函数，天然全覆盖）
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
      world.rivers.add(x + "," + y);   // 登记被刻蚀为水的格（河流查询/灌溉判定用）
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
    nx = Math.floor(target.x); ny = Math.floor(target.y); d = { name: pickIslandName(target) };
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

// 聚落资源库存（wood/stone/sand/food + 饮品链 water/juice/beer/coffee/beans——粮食城市内共享，不是全图共享池）
function ensureStock(s) {
  if (!s.stock) s.stock = { wood: 0, stone: 0, sand: 0, food: 0, water: 0, juice: 0, beer: 0, coffee: 0, beans: 0 };
  // 旧聚落/字面量库存兼容：缺失字段统一补 0（含原有 food 兜底语义）
  for (const k of ["wood", "stone", "sand", "food", "water", "juice", "beer", "coffee", "beans"]) {
    if (s.stock[k] === undefined) s.stock[k] = 0;
  }
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
