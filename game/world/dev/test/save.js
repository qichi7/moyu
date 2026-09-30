// headless 专项测试：存档与读档（v0.7.0）
// ⚠️ 依赖构建产物 .tmp_logic.js（先 node dev/build.js）；PNG 编解码段为异步（CompressionStream），
//    通过 __done 回调与外层脚本握手。断言口径见任务书阶段 4（8 组）。
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

const test = `
${logic}

// ===== 测试主体 =====
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

const STEP = 0.1;
simInit(42);
for (let i = 0; i < 5000; i++) simUpdate(STEP);   // 5000 步 ≈ 500 sim 秒
assert(agents.length >= 12 && creatures.length > 0 && tasks.list.length > 0,
  "前置：5000 步后世界有居民/生物/任务（agents=" + agents.length + " creatures=" + creatures.length + " tasks=" + tasks.list.length + "）");

// 构造可验证的引用图：驯化一只狗认主 + 骑乘互指 + 一名救援互指 + 任务加两名工人
const dog = creatures.find(c => c.type === "dog" && !c.dead);
const tamer = agents[1];
if (dog && tamer) { dog.tamed = true; dog.owner = tamer; tamer.mount = dog; dog.riddenBy = tamer; }
const victim = creatures.find(c => !c.dead && c !== dog);
if (victim && agents[3]) { victim.rescuer = agents[3]; agents[3].rescuing = victim; victim.carriedBy = agents[3]; }
const task0 = tasks.list.find(t => !t.done) || tasks.list[0];
if (task0) { task0.workers.add(agents[1]); task0.workers.add(agents[3]); }

// 抽样 20 个已点亮格记录 tile（读档后地形比对基准）
const litSample = [];
{
  const arr = [...world.litCells];
  for (let i = 0; i < 20 && arr.length; i++) {
    const k = arr[(i * 977 + 13) % arr.length];
    const p = k.split(",");
    litSample.push({ x: +p[0], y: +p[1], t: tileAt(+p[0], +p[1]) });
  }
}

// rand 续演基准：快照前取 8 个（推进状态），快照后再取 8 个 = 读档后续演的逐位真值
const seqBefore = []; for (let i = 0; i < 8; i++) seqBefore.push(rand());
const snap = saveExport();   // 纯函数不消耗 rand
const seqTruth = []; for (let i = 0; i < 8; i++) seqTruth.push(rand());

// ---- 故意破坏世界 ----
agents[0].die("测试事故"); agents[2].die("测试事故"); agents[4].die("测试事故");
const cs = creatures.filter(c => !c.dead);
if (cs[0]) { cs[0].x += 37.5; cs[0].y -= 21.5; }
if (cs[1]) { cs[1].x -= 11.5; cs[1].y += 5.5; }
if (world.settlements[0]) ensureStock(world.settlements[0]).wood = 0;
world.time += 999;
for (let i = 0; i < 50; i++) rand();
assert(agents.length < snap.agents.length + 3 && world.time === snap.time + 999, "前置：世界已破坏（3 死/挪兽/清资源/+999s/+50 rand）");

// ---- 读档（经 JSON 往返模拟真实序列化）----
const ok = saveImport(JSON.parse(JSON.stringify(snap)));
assert(ok === true, "读档：saveImport 成功返回");

// ① agents 长度与逐字段等于快照前
{
  let bad = 0, why = "";
  if (agents.length !== snap.agents.length) { bad++; why = "长度 " + agents.length + "≠" + snap.agents.length; }
  for (let i = 0; i < snap.agents.length && !bad; i++) {
    const d = snap.agents[i], a = agents[i];
    if (!a || a.name !== d.name || Math.abs(a.x - d.x) > 1e-9 || Math.abs(a.y - d.y) > 1e-9 ||
        a.job !== d.job || a.mood !== d.mood || JSON.stringify(a.pack) !== JSON.stringify(d.pack)) {
      bad++; why = "agent#" + i;
    }
  }
  assert(bad === 0, "① agents 长度与逐字段（名字/位置/job/pack/mood）等于快照前" + (bad ? "（" + why + "）" : "，n=" + agents.length));
}

// ② 驯化生物 owner 回指正确（含 mount/riddenBy/carriedBy/rescuer 双向引用图）
{
  const d = snap.creatures.find(c => c.owid !== undefined);
  let pass = !!d;
  if (d) {
    const c = creatures[snap.creatures.indexOf(d)];
    pass = c && c.owner && c.owner.id === d.owid && c.owner.mount === c && c.riddenBy === c.owner;
    const v = snap.creatures.find(cc => cc.cbid !== undefined);
    if (v) { const cv = creatures[snap.creatures.indexOf(v)]; pass = pass && cv && cv.carriedBy && cv.carriedBy.id === v.cbid && cv.carriedBy.rescuing === cv; }
  }
  assert(pass, "② 驯化生物 owner 回指正确（mount/riddenBy/carriedBy/rescuing 双向互指）");
}

// ③ 任务的 workers 集合重建（成员为 agent 实体、与快照 id 集一致）
{
  const d = snap.tasks.find(t => t.workers && t.workers.length >= 2);
  let pass = false;
  if (d) {
    const t = tasks.list[snap.tasks.indexOf(d)];
    pass = t && t.workers.size === d.workers.length &&
      [...t.workers].every(a => d.workers.includes(a.id));
  }
  assert(pass, "③ 任务 workers 集合重建（成员实体回指、id 集与快照一致）");
}

// ④ tiles 抽样 20 格相等
{
  let bad = 0;
  for (const s of litSample) if (tileAt(s.x, s.y) !== s.t) bad++;
  assert(bad === 0 && litSample.length === 20, "④ tiles 抽样 20 格与快照前相等（bad=" + bad + "）");
}

// ⑤ rand 序列逐位续演
{
  const seqAfter = []; for (let i = 0; i < 8; i++) seqAfter.push(rand());
  let same = true;
  for (let i = 0; i < 8; i++) if (seqAfter[i] !== seqTruth[i]) same = false;
  assert(same, "⑤ rand 续演逐位相等（快照后真值 vs 读档后实测 8 值）");
  if (!same) console.log("  truth: " + seqTruth.map(v => v.toFixed(9)).join(" ") + "\\n  after: " + seqAfter.map(v => v.toFixed(9)).join(" "));
}

// ⑥ logSeq/logs 连续
assert(world.logSeq === snap.logSeq && JSON.stringify(world.logs) === JSON.stringify(snap.logs),
  "⑥ logSeq=" + world.logSeq + " 与 logs 内容与快照一致");

// ⑦ 继续模拟 2000 步：无 NaN/无异常、agent.id 不重复
{
  let nanHit = "";
  try {
    for (let i = 0; i < 2000; i++) {
      simUpdate(STEP);
      if ((i & 63) === 0) {
        for (const a of agents) {
          if (![a.x, a.y, a.hunger, a.energy, a.thirst, a.mood].every(Number.isFinite)) { nanHit = "agent#" + a.id + "@" + i; break; }
        }
        for (const c of creatures) {
          if (![c.x, c.y].every(Number.isFinite)) { nanHit = "creature#" + c.type + "@" + i; break; }
        }
        if (nanHit) break;
      }
    }
  } catch (e) { nanHit = "异常: " + e.message; }
  const ids = new Set(agents.map(a => a.id));
  assert(!nanHit && ids.size === agents.length,
    "⑦ 续演 2000 步无 NaN/无异常、agent.id 不重复（pop=" + agents.length + "）" + (nanHit ? "（" + nanHit + "）" : ""));
}

// ⑧ 旧档兼容：删字段读档 → 不崩且字段走默认（兜底机制对任意版本生效）
{
  const old = JSON.parse(JSON.stringify(snap));
  delete old.agents[0].joyProfile;
  delete old.agents[1].mcid;   // 骑乘引用占位：删后读档 mount 走默认 null（引用缺失不悬空）
  const cd = old.creatures.findIndex(c => "tameness" in c);
  if (cd >= 0) delete old.creatures[cd].tameness;
  delete old.agents[0].thirst;
  let pass = true, why = "";
  try {
    saveImport(old);
    const a0 = agents[0];
    if (!a0.joyProfile || typeof a0.joyProfile !== "object") { pass = false; why = "joyProfile 未重建"; }
    if (a0.thirst !== 100) { pass = false; why = "thirst 未走默认 100"; }
    if (agents[1] && agents[1].mount !== null) { pass = false; why = "mount 未走默认 null"; }
    const c = creatures[cd >= 0 ? cd : 0];
    if (c && c.tameness !== 0) { pass = false; why = "tameness 未走默认 0"; }
  } catch (e) { pass = false; why = "异常: " + e.message; }
  assert(pass, "⑧ 旧档兼容：删 joyProfile/mcid/tameness/thirst 读档不崩且走默认" + (why ? "（" + why + "）" : ""));
  // 兼容档再续演 300 步确认稳定
  let stable = true;
  try { for (let i = 0; i < 300; i++) simUpdate(STEP); } catch (e) { stable = false; }
  assert(stable, "⑧ 附：兼容档续演 300 步无异常");
}

// ---- PNG 载体：tEXt 注入/提取与整体往返（异步段）----
(async () => {
  const fakePng = buildFakePng();
  assert(pngExtractTExt(fakePng, "XJSJ_SAVE") === null, "PNG：无元数据时提取返回 null");
  snap.camera = { x: 3.25, y: -4.5, zoom: 1.6 };
  const png = await buildSavePng(fakePng, snap);
  assert(png && png.length > fakePng.length && png[0] === 137 && png[png.length - 4] === 174 && png[png.length - 3] === 66 && png[png.length - 2] === 96 && png[png.length - 1] === 130,
    "PNG：tEXt 注入在 IEND 前（长度增长、签名与 IEND CRC 完好）");
  const back = await readSavePng(png);
  assert(back && JSON.stringify(back) === JSON.stringify(snap), "PNG：readSavePng 往返与存档对象逐字节等值");
  assert((await readSavePng(fakePng)) === null, "PNG：非存档图片 readSavePng 返回 null");
  assert(pngInjectTExt(new Uint8Array([1, 2, 3]), "K", "v") === null, "PNG：非法字节流注入返回 null");

  // deflate 退化路径："P" 前缀未压缩分支可被同一读入口解析
  const pText = await deflateB64(JSON.stringify(snap));
  assert(pText[0] === "Z" || pText[0] === "P", "deflateB64：产出自描述前缀（" + pText[0] + "）");
  const inflated = await inflateB64(pText);
  assert(inflated === JSON.stringify(snap), "inflateB64：往返等值（CompressionStream " + (typeof CompressionStream === "function" ? "可用" : "缺失→退化") + "）");

  console.log("---- save.js 断言结束 ----");
  __done();

  // ---- 工具：构造最小合法 PNG 字节流（签名+IHDR+IDAT+IEND，CRC 正确）----
  function buildFakePng() {
    const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
    const tbl = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = (x & 1) ? (0xEDB88320 ^ (x >>> 1)) : (x >>> 1); t[n] = x >>> 0; } return t; })();
    const chunk = (type, data) => {
      const head = [...u32(data.length)];
      for (const ch of type) head.push(ch.charCodeAt(0));
      for (const b of data) head.push(b);
      let c = 0xFFFFFFFF;
      for (let i = 4; i < head.length; i++) c = tbl[(c ^ head[i]) & 255] ^ (c >>> 8);
      return [...head, ...u32((c ^ 0xFFFFFFFF) >>> 0)];
    };
    const out = [137, 80, 78, 71, 13, 10, 26, 10];
    out.push(...chunk("IHDR", new Array(13).fill(0)));
    out.push(...chunk("IDAT", new Array(64).fill(7)));
    out.push(...chunk("IEND", []));
    return new Uint8Array(out);
  }
})().catch(e => { console.log("FAIL PNG/异步段抛异常: " + (e && e.stack || e)); __failed = true; __done(); });
`;

const ctx = vm.createContext({
  console,
  Blob, Response, CompressionStream, DecompressionStream, TextEncoder, TextDecoder,
  setTimeout,
});
ctx.__failed = false;
let doneResolve;
const doneP = new Promise(r => { doneResolve = r; });
ctx.__done = doneResolve;
try {
  vm.runInContext(test, ctx, { filename: "save.js", timeout: 900000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
Promise.race([doneP, new Promise(r => setTimeout(r, 120000))]).then(() => {
  if (ctx.__failed) process.exitCode = 1;
});
