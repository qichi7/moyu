"use strict";
// ============ 存档与读档（v0.7.0）============
// 逻辑层纯函数：零 DOM、node 可测（test/save.js）。PNG 注入/提取、deflate 编解码、
// saveExport（全量状态序列化）与 saveImport（世界重建）都在这里。
//
// 载体格式（用户拍板口径）：PNG + tEXt 元数据块——
//   keyword = "XJSJ_SAVE"，值 = "Z" + base64(deflate-raw(JSON))
//   （环境缺 CompressionStream/DecompressionStream 时退化为 "P" + base64(JSON)，自描述前缀无损互认）
// 地图本体 = 已点亮全图 2px/tile 着色（main.js renderMapImage 生成），状态信息附加在图片上。
// 兼容铁律：历史只加不减——saveVersion 起步 1；hydrate 兜底按构造默认补缺失字段，只保证向后兼容
// （读未来版本存档明确拒绝）。rand 序列逐位续演：rngSnapshot/rngRestore（noise.js）。

const SAVE_VERSION = 1;
const SAVE_KEYWORD = "XJSJ_SAVE";

// ---- base64（手写表驱动，不依赖 Buffer/btoa，node 与浏览器同源可用）----
const _B64T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function u8ToB64(u8) {
  let out = "";
  const n = u8.length;
  for (let i = 0; i < n; i += 3) {
    const a = u8[i], b = i + 1 < n ? u8[i + 1] : 0, c = i + 2 < n ? u8[i + 2] : 0;
    out += _B64T[a >> 2] + _B64T[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < n ? _B64T[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < n ? _B64T[c & 63] : "=";
  }
  return out;
}
function b64ToU8(s) {
  const out = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = _B64T.indexOf(s[i]);
    if (v < 0) continue;   // 填充符/意外字符跳过（宽容解码：6bit 累积不满一字节自然丢弃）
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  return new Uint8Array(out);
}

// ---- tile RLE 游程（Uint8Array 1024 → "v:n,v:n" 串；定长格值重复率高，串体极小）----
function rleEncode(u8) {
  let out = "", i = 0;
  while (i < u8.length) {
    const v = u8[i]; let n = 1;
    while (i + n < u8.length && u8[i + n] === v) n++;
    out += (out ? "," : "") + v + ":" + n;
    i += n;
  }
  return out;
}
function rleDecode(s) {
  const out = new Uint8Array(CHUNK * CHUNK);
  let o = 0;
  for (const seg of s.split(",")) {
    const p = seg.indexOf(":");
    out.fill(+seg.slice(0, p), o, o + +seg.slice(p + 1));
    o += +seg.slice(p + 1);
  }
  return out;
}

// ---- Float32Array ↔ base64（原始字节；小端序——全平台 JS 引擎一致）----
function f32ToB64(f32) {
  if (!f32) return null;
  return u8ToB64(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength));
}
function b64ToF32(s) {
  if (!s) return null;
  const u8 = b64ToU8(s);
  return new Float32Array(u8.buffer, 0, Math.floor(u8.length / 4));
}

// ---- CRC32（表驱动，PNG chunk 校验用）----
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8, start, end) {
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = _CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---- PNG chunk 流操作（纯字节，无图片解码）----
const _PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
function pngChunkType(u8, off) {
  return String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
}
// 在 IEND 前插入一个 tEXt chunk（len+type+keyword\0+text+CRC32），返回新字节流；非法 PNG 返回 null
function pngInjectTExt(png, keyword, text) {
  if (!png || png.length < 16) return null;
  for (let i = 0; i < 8; i++) if (png[i] !== _PNG_SIG[i]) return null;
  let off = 8, iendStart = -1;
  while (off + 8 <= png.length) {
    const len = ((png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3]) >>> 0;
    if (pngChunkType(png, off) === "IEND") { iendStart = off; break; }
    off += 12 + len;
  }
  if (iendStart < 0) return null;
  const data = [];
  for (let i = 0; i < keyword.length; i++) data.push(keyword.charCodeAt(i) & 255);
  data.push(0);
  for (let i = 0; i < text.length; i++) data.push(text.charCodeAt(i) & 255);
  const dataLen = data.length;
  const out = new Uint8Array(png.length + 12 + dataLen);
  out.set(png.subarray(0, iendStart), 0);
  let o = iendStart;
  out[o++] = (dataLen >>> 24) & 255; out[o++] = (dataLen >>> 16) & 255;
  out[o++] = (dataLen >>> 8) & 255; out[o++] = dataLen & 255;
  out[o++] = 116; out[o++] = 69; out[o++] = 88; out[o++] = 116;   // "tEXt"
  for (let i = 0; i < dataLen; i++) out[o++] = data[i];
  const crc = crc32(out, iendStart + 4, o);   // CRC 覆盖 type + data
  out[o++] = (crc >>> 24) & 255; out[o++] = (crc >>> 16) & 255;
  out[o++] = (crc >>> 8) & 255; out[o++] = crc & 255;
  out.set(png.subarray(iendStart), o);
  return out;
}
// 提取指定 keyword 的 tEXt 文本；无则 null
function pngExtractTExt(png, keyword) {
  if (!png || png.length < 16) return null;
  for (let i = 0; i < 8; i++) if (png[i] !== _PNG_SIG[i]) return null;
  let off = 8;
  while (off + 8 <= png.length) {
    const len = ((png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3]) >>> 0;
    const type = pngChunkType(png, off);
    const d0 = off + 8, d1 = d0 + len;
    if (d1 + 4 > png.length) return null;
    if (type === "tEXt") {
      let z = -1;
      for (let i = d0; i < d1; i++) if (png[i] === 0) { z = i; break; }
      if (z > d0) {
        let kw = "";
        for (let i = d0; i < z; i++) kw += String.fromCharCode(png[i]);
        if (kw === keyword) {
          const parts = [];
          for (let i = z + 1; i < d1; i += 4096) parts.push(String.fromCharCode.apply(null, png.subarray(i, Math.min(i + 4096, d1))));
          return parts.join("");
        }
      }
    }
    if (type === "IEND") return null;
    off = d1 + 4;
  }
  return null;
}

// ---- deflate 编解码（CompressionStream 'deflate-raw'；缺失退化未压缩，前缀自描述）----
async function deflateB64(str) {
  const bytes = new TextEncoder().encode(str);
  if (typeof CompressionStream !== "function") return "P" + u8ToB64(bytes);
  const cs = new CompressionStream("deflate-raw");
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return "Z" + u8ToB64(new Uint8Array(ab));
}
async function inflateB64(s) {
  const flag = s[0], payload = s.slice(1);
  if (flag === "P") return new TextDecoder().decode(b64ToU8(payload));
  if (typeof DecompressionStream !== "function") return null;   // 有压缩数据但环境不支持：无法还原
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([b64ToU8(payload)]).stream().pipeThrough(ds)).arrayBuffer();
  return new TextDecoder().decode(ab);
}

// ---- 存档 PNG 组装/解析 ----
async function buildSavePng(mapPngU8, data) {
  const text = await deflateB64(JSON.stringify(data));
  const out = pngInjectTExt(mapPngU8, SAVE_KEYWORD, text);
  if (!out) throw new Error("非法的 PNG 字节流");
  return out;
}
async function readSavePng(pngU8) {
  const text = pngExtractTExt(pngU8, SAVE_KEYWORD);
  if (!text) return null;
  try {
    const json = await inflateB64(text);
    const data = JSON.parse(json);
    return (data && typeof data === "object" && data.saveVersion !== undefined) ? data : null;
  } catch (e) { return null; }
}

// ---- 导出：全量状态 → 可 JSON 序列化对象 ----
// 引用图约定（导出侧）：creature 引用 → 导出序号（creatures 数组下标，导出与重建顺序一致）
//   task.creature→cr / agent.mount→mcid / agent.rescuing→rcid
//   creature.owner→owid / riddenBy→rbid / carriedBy→cbid / rescuer→rsid（agent id）
//   ship.sailor→said（agent id）/ rescue 船 target→tship（ships 下标）
function dumpPlain(o) {
  const out = {};
  if (!o) return out;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v !== "function") out[k] = v;   // onArrive 等闭包不可序列化，跳过
  }
  return out;
}

function saveExport() {
  const w = world;
  const cidx = new Map();
  creatures.forEach((c, i) => cidx.set(c, i));
  const raw = {
    saveVersion: SAVE_VERSION,
    build: BUILD_ID,
    seed: w.seed,
    rng: rngSnapshot(),
    time: w.time, timeOfDay: w.timeOfDay, era: w.era,
    expansions: w.expansions || 0, birthSeq: w.birthSeq || 0,
    zonesVersion: w.zonesVersion || 0,
    active: { x0: w.active.x0, y0: w.active.y0, x1: w.active.x1, y1: w.active.y1 },
    store: { x: w.store.x, y: w.store.y },
    meteor: w.meteor, meteorNext: w.meteorNext || 0, storm: w.storm,
    lastBridgeHead: w.lastBridgeHead, lastBridgeDir: w.lastBridgeDir,
    rivers: w.rivers ? [...w.rivers] : null,
    foundGrid: [...w.foundGrid], litCells: [...w.litCells],
    ponds: [...w.ponds], mushrooms: [...w.mushrooms], interBridges: [...w.interBridges],
    berryStock: [...w.berryStock], fishStock: [...w.fishStock],
    islands: w.islands.map(dumpPlain),
    settlements: w.settlements.map(s => { const d = dumpPlain(s); ensureStock(d); return d; }),   // 库存 9 字段规范化（缺省补 0，读档往返稳定）
    houses: w.houses.map(dumpPlain),
    farms: w.farms.map(dumpPlain),
    parks: w.parks.map(dumpPlain),
    pastures: w.pastures.map(dumpPlain),
    docks: w.docks.map(dumpPlain),
    caves: w.caves.map(dumpPlain),
    quarries: w.quarries.map(dumpPlain),
    sandpits: w.sandpits.map(dumpPlain),
    ships: w.ships.map(s => {
      const d = dumpPlain(s);
      delete d.sailor; delete d.target;
      if (s.sailor) d.said = s.sailor.id;
      if (s.state === "rescue" && s.target) d.tship = w.ships.indexOf(s.target);
      return d;
    }),
    tasks: tasks.list.map(t => {
      const d = dumpPlain(t);
      delete d.workers; delete d.creature;
      if (t.creature) d.cr = cidx.get(t.creature);
      d.workers = [...t.workers].map(a => a.id);
      return d;
    }),
    agents: agents.map(a => {
      const d = dumpPlain(a);
      delete d.task; delete d.mount; delete d.rescuing;
      if (a.task) d.tid = a.task.id;
      if (a.mount) d.mcid = cidx.get(a.mount);
      if (a.rescuing) d.rcid = cidx.get(a.rescuing);
      return d;
    }),
    creatures: creatures.map(c => {
      const d = dumpPlain(c);
      delete d.owner; delete d.riddenBy; delete d.carriedBy; delete d.rescuer;
      if (c.owner) d.owid = c.owner.id;
      if (c.riddenBy) d.rbid = c.riddenBy.id;
      if (c.carriedBy) d.cbid = c.carriedBy.id;
      if (c.rescuer) d.rsid = c.rescuer.id;
      return d;
    }),
    logs: w.logs.slice(0, 100).map(l => ({ t: l.t, text: l.text })),
    logSeq: w.logSeq || 0,
    names: agentNamePoolDump(),
    camera: null,   // 相机由表现层（main.js）填充，逻辑层不感知
  };
  raw.chunks = [];
  for (const [k, c] of w.chunks) {
    if (!c.gen) continue;   // 未生成 chunk = 全零默认态，读档侧惰性重建，不入档（最少信息）
    const p = k.split(",");
    const ch = { cx: +p[0], cy: +p[1], gen: true, tiles: rleEncode(c.tiles), hp: f32ToB64(c.hp) };
    if (c.elev) ch.elev = f32ToB64(c.elev);
    raw.chunks.push(ch);
  }
  // 深拷贝出即时快照：导出返回与 PNG 组装（相机 toBlob 异步窗口）之间模拟仍在跑，
  // 共享引用会被并发改动——JSON 往返既冻结现场又顺带验证了全量状态的可序列化性
  return JSON.parse(JSON.stringify(raw));
}

// ---- 兼容兜底（hydrate）：缺失字段按构造默认补——历史只加不减 ----
// 默认表只含构造器必赋字段：完整 v1 档读入时逐项存在（零覆盖），旧档/缺字段档按默认补齐
const _AGENT_DEFAULTS = {
  dead: false, native: false, hunger: 100, energy: 100, thirst: 100, mood: 90,
  depressed: false, cheerT: 0, drunkT: 0, coffeeT: 0, mountCd: 0,
  face: "down", faceHoldT: 1, task: null, path: null, pi: 0, state: "idle",
  thinkCd: 0, phase: 0,   starving: false, speed: 1.7, adventure: 0.5, diligence: 0.5,
  age: 30, job: "farmer", hobby: "none", surname: "", father: null, mother: null, mount: null,
};
const _CREATURE_DEFAULTS = {
  dead: false, pasture: null, face: "down", faceHoldT: 1, moveCd: 0,
  breedCd: 120, outputCd: 0, tameness: 0, riddenBy: null, migration: null, migNext: 0,
};
function hydrateAgent(a) {
  for (const k in _AGENT_DEFAULTS) if (a[k] === undefined) a[k] = _AGENT_DEFAULTS[k];
  if (!Array.isArray(a.pack) || a.pack.length !== 10) a.pack = new Array(10).fill(null);
  else for (let i = 0; i < 10; i++) if (a.pack[i] === undefined) a.pack[i] = null;
  if (!a.joyProfile) {   // 旧档缺画像：按构造口径 hash2 确定性重建（零 rand 消耗）
    a.joyProfile = {};
    for (const k of SIM.JOY_KEYS) {
      let tier = SIM.JOY_TIERS[(hash2(a.id, SIM.JOY_SALTS[k]) * 5) | 0];
      if (k === _HOBBY_JOY[a.hobby]) tier = Math.max(tier, SIM.JOY_HOBBY_MIN);
      a.joyProfile[k] = tier;
    }
  }
  return a;
}
function hydrateCreature(c) {
  for (const k in _CREATURE_DEFAULTS) if (c[k] === undefined) c[k] = _CREATURE_DEFAULTS[k];
  return c;
}

// ---- 导入：存档对象 → 世界重建 ----
// 流程：genWorld(data.seed) 建骨架（种子/噪声，产出全部被覆写）→ 标量覆写 → chunks Map 重建
// → 集合/映射重建 → 实体重建（agents/creatures 走原型实例，ships/tasks plain assign）
// → 引用图二次回填 → id 序列/名字池/随机流恢复 → 缓存失效清扫。
// 返回 true/false（false = 版本不兼容或数据非法）。
function saveImport(data) {
  if (!data || typeof data !== "object") return false;
  const v = data.saveVersion | 0;
  if (v > SAVE_VERSION) return false;   // 未来版本存档：明确拒绝（兼容方向只有向后）

  genWorld(data.seed);   // 骨架：噪声/chunks Map/初始岛屿——下方全部覆写

  const w = world;
  w.time = data.time || 0;
  w.timeOfDay = data.timeOfDay !== undefined ? data.timeOfDay : w.timeOfDay;
  w.era = data.era || 0;
  w.expansions = data.expansions || 0;
  w.birthSeq = data.birthSeq || 0;
  w.zonesVersion = data.zonesVersion || 0;
  w.active = data.active ? { x0: data.active.x0 | 0, y0: data.active.y0 | 0, x1: data.active.x1 | 0, y1: data.active.y1 | 0 } : { x0: -26, y0: -26, x1: 26, y1: 26 };
  w.store = data.store ? { x: data.store.x, y: data.store.y } : w.store;
  w.meteor = data.meteor || null;
  w.meteorNext = data.meteorNext || 0;
  w.storm = data.storm || null;
  w.lastBridgeHead = data.lastBridgeHead || null;
  w.lastBridgeDir = data.lastBridgeDir || null;
  w.rivers = new Set(data.rivers || []);
  w.foundGrid = new Set(data.foundGrid || []);
  w.litCells = new Set(data.litCells || []);
  w.ponds = new Set(data.ponds || []);
  w.mushrooms = new Set(data.mushrooms || []);
  w.interBridges = new Set(data.interBridges || []);
  w.berryStock = new Map(data.berryStock || []);
  w.fishStock = new Map(data.fishStock || []);

  // chunks 重建：thumbDirty 全部置真（远景缩略图缓存整体失效重建）
  w.chunks = new Map();
  for (const cd of (data.chunks || [])) {
    const c = {
      tiles: rleDecode(cd.tiles),
      hp: b64ToF32(cd.hp) || new Float32Array(CHUNK * CHUNK),
      gen: true,
      thumbDirty: true,
    };
    if (cd.elev) c.elev = b64ToF32(cd.elev);
    w.chunks.set(cd.cx + "," + cd.cy, c);
  }

  // 实体表：plain 对象直接重建（引用字段延后回填）
  w.islands = (data.islands || []).map(o => Object.assign({}, o));
  w.settlements = (data.settlements || []).map(o => {
    const s = Object.assign({}, o);
    ensureStock(s);   // 9 字段缺省补 0（旧档兼容口径与运行时一致）
    if (s.level === undefined) s.level = 0;
    if (!s.name) s.name = "无名聚落";
    return s;
  });
  w.houses = (data.houses || []).map(o => Object.assign({}, o));
  w.farms = (data.farms || []).map(o => Object.assign({}, o));
  w.parks = (data.parks || []).map(o => Object.assign({}, o));
  w.pastures = (data.pastures || []).map(o => Object.assign({}, o));
  w.docks = (data.docks || []).map(o => Object.assign({}, o));
  w.caves = (data.caves || []).map(o => Object.assign({}, o));
  w.quarries = (data.quarries || []).map(o => Object.assign({}, o));
  w.sandpits = (data.sandpits || []).map(o => Object.assign({}, o));
  w.ships = (data.ships || []).map(o => Object.assign({}, o));

  tasks.list.length = 0;
  for (const td of (data.tasks || [])) {
    const t = Object.assign({}, td);
    t.workers = new Set();
    delete t.cr;
    tasks.list.push(t);
  }

  // creatures：原型实例 + 自有属性覆盖（方法在原型上）
  creatures.length = 0;
  const cDump = data.creatures || [];
  for (const cd of cDump) {
    const c = Object.create(Creature.prototype);
    Object.assign(c, cd);
    hydrateCreature(c);
    delete c.owid; delete c.rbid; delete c.cbid; delete c.rsid;
    creatures.push(c);
  }
  // agents：原型实例 + 自有属性覆盖
  agents.length = 0;
  const aDump = data.agents || [];
  for (const ad of aDump) {
    const a = Object.create(Agent.prototype);
    Object.assign(a, ad);
    hydrateAgent(a);
    delete a.tid; delete a.mcid; delete a.rcid;
    agents.push(a);
  }

  // 引用图二次回填（先建 id→实体 Map 再挂引用）
  const aMap = new Map(), cMap = new Map(), tMap = new Map();
  for (const a of agents) aMap.set(a.id, a);
  for (let i = 0; i < creatures.length; i++) cMap.set(i, creatures[i]);   // 导出序号 = 数组下标
  for (const t of tasks.list) tMap.set(t.id, t);
  for (let i = 0; i < aDump.length; i++) {
    const d = aDump[i], a = agents[i];
    if ("tid" in d) a.task = tMap.get(d.tid) || null;
    if ("mcid" in d) a.mount = cMap.get(d.mcid) || null;
    if ("rcid" in d) a.rescuing = cMap.get(d.rcid) || null;
  }
  for (let i = 0; i < cDump.length; i++) {
    const d = cDump[i], c = creatures[i];
    if ("owid" in d) c.owner = aMap.get(d.owid) || null;
    if ("rbid" in d) c.riddenBy = aMap.get(d.rbid) || null;
    if ("cbid" in d) c.carriedBy = aMap.get(d.cbid) || null;
    if ("rsid" in d) c.rescuer = aMap.get(d.rsid) || null;
  }
  for (let i = 0; i < (data.tasks || []).length; i++) {
    const d = data.tasks[i], t = tasks.list[i];
    if ("cr" in d) t.creature = cMap.get(d.cr) || undefined;
    for (const aid of (d.workers || [])) { const wa = aMap.get(aid); if (wa) t.workers.add(wa); }
  }
  for (let i = 0; i < (data.ships || []).length; i++) {
    const d = data.ships[i], s = w.ships[i];
    s.sailor = ("said" in d) ? (aMap.get(d.said) || null) : null;
    if ("tship" in d) s.target = w.ships[d.tship] || null;
    delete s.said; delete s.tship;
  }

  // 纪事与单调计数（logSeq 截断安全：与 logs 内容一并恢复）
  w.logs = (data.logs || []).map(l => ({ t: l.t, text: l.text }));
  w.logSeq = data.logSeq || w.logs.length;

  // 名字唯一池 / id 序列 / 随机流（写回必须晚于 genWorld——它会消耗 rand 与名字池）
  agentNamePoolRestore(data.names);
  let maxA = 0; for (const a of agents) if (a.id > maxA) maxA = a.id;
  agentIdSeqSet(maxA + 1);
  let maxT = 0; for (const t of tasks.list) if (t.id > maxT) maxT = t.id;
  taskIdSeqSet(maxT + 1);
  if (data.rng !== undefined) rngRestore(data.rng);

  // 失效清扫：联合库存缓存 / 缩略图 / 视口探索队列 / 受困动物扫描缓存（跨世界引用一律作废）
  jointStockDirty();
  for (const [, c] of w.chunks) c.thumbDirty = true;
  _exploreQueue.length = 0; _queued.clear();
  _rescueScan.t = -9; _rescueScan.victim = null;
  _lastPond = null;
  return true;
}
