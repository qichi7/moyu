// headless 亲子与性别测试：vm 加载 .tmp_logic.js（与 smoke.js 同款加载模式）
// 覆盖：男女分名池 / 固定单姓与固定复姓 / 名池规模 / 去重 / sex 确定性 / 新生儿随亲姓（surname 字段，支持复姓）
//      / 父母可追溯 / 出生点偏向母亲家 / 复姓入库（软断言） / surname 字段一致性 / 育龄边界 19/20/60/61（v0.6.4）
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

let failed = false;
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  failed = true;
  return false;
}

// ---- 第一部分：确定性上下文（跑两遍独立 vm：固定种子下 id→sex 映射必须全等）----
// 名字池测试也放进该脚本（两遍执行路径完全一致，不干扰 sex 确定性比较）
const detScript = `
${logic}

function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

// —— 名字池：男女分池 + 固定姓 ——
const nm = pickAgentName("m", "张");
assert(nm[0] === "张", "男名固定姓「张」生效: " + nm);
assert(nm.length >= 2 && nm.length <= 3, "男名长度 2~3: " + nm);
assert(_GIVEN_M.includes(nm[1]), "男名用字 ∈ _GIVEN_M: " + nm);
const nf = pickAgentName("f", "李");
assert(nf[0] === "李", "女名固定姓「李」生效: " + nf);
assert(nf.length >= 2 && nf.length <= 3, "女名长度 2~3: " + nf);
assert(_GIVEN_F.includes(nf[1]), "女名用字 ∈ _GIVEN_F: " + nf);

// —— 名池规模：单姓 56 / 复姓 20 / 男女名池各 24 ——
assert(_SURNAMES.length === 56, "单姓池扩充到 56 个: " + _SURNAMES.length);
assert(_SURNAMES_CP.length === 20, "复姓池 20 个: " + _SURNAMES_CP.length);
assert(_GIVEN_M.length === 24 && _GIVEN_F.length === 24, "男女名池各 24 字: " + _GIVEN_M.length + "/" + _GIVEN_F.length);

// —— 固定复姓：复姓前缀完整保留（surnameOf 取前两字），名字长度 3~4 ——
const nc1 = pickAgentName("m", "欧阳");
assert(nc1.startsWith("欧阳") && nc1.length >= 3 && nc1.length <= 4, "男名固定复姓「欧阳」生效且长度 3~4: " + nc1);
const nc2 = pickAgentName("f", "司马");
assert(nc2.startsWith("司马") && nc2.length >= 3 && nc2.length <= 4, "女名固定复姓「司马」生效且长度 3~4: " + nc2);
assert(surnameOf(nc1) === "欧阳" && surnameOf("阿岩") === "阿" && surnameOf("张三") === "张",
  "surnameOf：复姓取前两字，单姓/原住民取首字");

// —— 无姓调用 40 次：姓全部来自单姓池或复姓池，且互不重复（去重有效）——
const used = [];
for (let i = 0; i < 40; i++) used.push(pickAgentName(i % 2 ? "f" : "m"));
assert(used.every(n => _SURNAMES.includes(surnameOf(n)) || _SURNAMES_CP.includes(surnameOf(n))),
  "40 次无姓调用：姓全部来自单姓/复姓池");
assert(new Set(used).size === 40, "40 次无姓调用：名字互不重复（去重有效）");

// —— sex 确定性：收集 id→sex 映射 ——
simInit(42);
const sexMap = {};
for (const a of agents) sexMap[a.id] = a.sex;
console.log("初始人口:", agents.length);
__out(sexMap);
`;

function runDet(tag) {
  const ctx = vm.createContext({ console });
  ctx.__failed = false;
  ctx.__out = map => { ctx.__map = map; };
  try {
    vm.runInContext(detScript, ctx, { filename: "family-det-" + tag + ".js", timeout: 300000 });
  } catch (e) {
    console.error("FAIL 确定性上下文(" + tag + ")抛异常:", e);
    failed = true;
  }
  if (ctx.__failed) failed = true;
  return ctx.__map;
}

const mapA = runDet("A");
const mapB = runDet("B");
const idsA = Object.keys(mapA || {}).sort((a, b) => a - b);
const idsB = Object.keys(mapB || {}).sort((a, b) => a - b);
assert(mapA && mapB && idsA.join(",") === idsB.join(",") &&
  idsA.every(id => mapA[id] === mapB[id]),
  "sex 确定性：simInit(42) 两次独立运行 id→sex 映射全等（" + idsA.length + " 人）");

// ---- 第二部分：行为上下文（跑 2000 sim 秒，验证亲子逻辑真实发生）----
const runScript = `
${logic}

function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

// 记录出生瞬间：包裹 spawnAgent 捕捉新生儿出生坐标（测试专用，不动逻辑文件）
const _births = [];
const _rawSpawn = spawnAgent;
spawnAgent = function (x, y, native, opts) {
  const a = _rawSpawn(x, y, native, opts);
  if (opts && (opts.father || opts.mother)) _births.push({ x: a.x, y: a.y, mother: opts.mother || null });
  return a;
};
// 记录死亡名册：父母名可追溯的对照集合（测试专用，不动逻辑文件）
const _deadNames = new Set();
const _rawDie = Agent.prototype.die;
Agent.prototype.die = function (reason) { _deadNames.add(this.name); return _rawDie.call(this, reason); };

simInit(42);
const STEP = 1 / 30;
for (let i = 0; i < 60000; i++) simUpdate(STEP);   // 2000 sim 秒

const mc = agents.filter(a => a.sex === "m").length, fc = agents.length - mc;
console.log("---- 2000 sim 秒后 ----");
console.log("人口:", agents.length, "（男", mc, "/ 女", fc, "）出生记录:", _births.length);

// —— 新生儿：age < 5 且 father 或 mother 非空 ——
const withParents = agents.filter(a => a.age < 5 && (a.father || a.mother));
assert(withParents.length > 0, "存在 age<5 且记录了父母的新生儿（" + withParents.length + " 人）");

// —— 随亲姓：所有记录了父母者，名字以父姓或母姓开头（surname 字段语义；父母可能已亡故，用 surnameOf 从其名字推导，复姓取前两字）——
const recorded = agents.filter(a => a.father || a.mother);
const badSn = recorded.filter(a => {
  const fs = a.father ? surnameOf(a.father) : null;
  const ms = a.mother ? surnameOf(a.mother) : null;
  return !((fs && a.name.startsWith(fs)) || (ms && a.name.startsWith(ms)));
});
assert(badSn.length === 0, "所有记录父母者随父姓或母姓（name.startsWith(亲姓)，支持复姓）");

// —— 父母名可追溯：记录的父母名必须全部指向真实存在过的人（在世 ∪ 本局已故名册），100% 结构性校验 ——
//    v0.2.2 断言更新说明：原断言「≥80% 父母名在世可寻」与人口死亡率耦合（同一世界改动前基线
//    即为 59/72=81.9%，贴着门槛；名字池扩大→去重重试变少→随机流偏移后落到 57/74=77.0%，
//    两版死因分布一致、均为饥荒病亡正常波动），对任意 seed 不稳定（违反 HANDOFF 铁律 12 的
//    「范围/结构型断言」精神），故改为与随机流无关的强校验，在世率仅信息输出 ——
const alive = new Set(agents.map(a => a.name));
let total = 0, resolved = 0;
const missing = [];
for (const a of recorded) {
  for (const pn of [a.father, a.mother]) {
    if (!pn) continue;
    total++;
    if (alive.has(pn) || _deadNames.has(pn)) resolved++;
    else missing.push(pn);
  }
}
assert(total > 0 && resolved === total,
  "父母名可追溯：记录的父母全部指向真实存在过的人（" + resolved + "/" + total + "；未解析: " + missing.join("、") + "）");
let aliveCnt = 0;
for (const a of recorded) {
  if (a.father && alive.has(a.father)) aliveCnt++;
  if (a.mother && alive.has(a.mother)) aliveCnt++;
}
console.log("INFO 父母名在世率:", aliveCnt + "/" + total, "（与死亡率耦合、随随机流漂移，仅信息输出不做断言）");

// —— 出生点：婴儿生在母亲家 5 格内（母亲无房走兜底，全无房则降级通过）——
let nearCnt = 0, withHomeCnt = 0;
for (const rec of _births) {
  if (!rec.mother) continue;
  const mo = agents.find(a => a.name === rec.mother);
  if (!mo || !mo.home) continue;
  withHomeCnt++;
  if (Math.hypot(rec.x - (mo.home.x + 0.5), rec.y - (mo.home.y + 0.5)) <= 5) nearCnt++;
}
assert(nearCnt >= 1 || withHomeCnt === 0,
  "婴儿出生在母亲家旁（近旁 " + nearCnt + " 例 / 有房母亲 " + withHomeCnt + " 例；全部母亲无房则降级通过）");

// —— 性别比例：男女各半（35%~65% 区间）——
const ratio = agents.length ? mc / agents.length : 0.5;
assert(ratio >= 0.35 && ratio <= 0.65, "男女比例在 35%~65% 之间（男 " + Math.round(ratio * 100) + "%）");

// —— 复姓入库（软断言）：长跑后至少 1 人为复姓；0 个只打 WARN 不算 FAIL
//    （复姓抽取占比约 9%，小人口长跑可能恰好没抽到，属正常随机波动）——
const cpHits = agents.filter(a => _SURNAMES_CP.some(s => a.name.startsWith(s)));
if (cpHits.length > 0) {
  assert(true, "复姓入库：存在复姓居民（" + cpHits.map(a => a.name).join("、") + "）");
} else {
  console.log("WARN 复姓入库：本次长跑未抽到复姓居民（占比约 9%，小人口可能恰好错过，不算 FAIL）");
}

// —— surname 字段一致性：所有 agents（含原住民「阿X」、兜底名「居民N」）的 name 都以自身 surname 开头 ——
assert(agents.every(a => a.name.startsWith(a.surname)),
  "所有 agents 满足 name.startsWith(surname)（原住民「阿」也算一致）");
`;

{
  const ctx = vm.createContext({ console });
  ctx.__failed = false;
  try {
    vm.runInContext(runScript, ctx, { filename: "family-run.js", timeout: 900000 });
  } catch (e) {
    console.error("FAIL 行为上下文抛异常:", e);
    failed = true;
  }
  if (ctx.__failed) failed = true;
}

// ---- 第三部分：育龄边界（v0.6.4）——只留一名雌性 + 备足出生条件，19/20/60/61 四档强测 ----
// 每档独立 simInit(42) 保持确定性；plannerTick 每次出生判定概率 = BIRTH_CHECK×PLANNER_INTERVAL = 0.2，
// 跑 400 轮对冲（可育档漏网 0.8^400≈0）；注意清场后必须备足粮食/农田/房屋三闸门，否则出生线先卡死。
const boundScript = `
${logic}

function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

function boundaryCase(age) {
  simInit(42);
  const f = agents.find(a => !a.dead && a.sex === "f");
  if (!f) return { ok: false, mothered: -1, orphan: -1 };
  agents.length = 0;               // 清场：只留这一名雌性
  agents.push(f);
  tasks.list.length = 0;           // 清空初始任务，避免与清场人口纠缠
  f.age = age;
  // 备足出生三闸门：存粮 >40；产粮田×5 >= 人口+4（pop=1 → ≥1 块田）；房屋×3 > 人口（初始 4 间即足）
  world.settlements.forEach(s => { ensureStock(s).food = 500; });
  if (world.farms.filter(x => !x.crop).length < 1) {
    world.farms.push({ x: Math.floor(f.x), y: Math.floor(f.y), grow: 0 });
  }
  // 断言口径 = 「该女性名下的出生数」（mother 记录精确指向她）。世界全程只有这一名雌性且无雄性，
  // 任何有母记录的新生儿必然由她所出。孤儿出生（mother=null → findBirthSpot 兜底）是既有人口
  // 安全网（无育龄女性时世界唯一人口来源，HEAD~1 基线 smoke 依赖它存活），不可移除——只能绕开：
  // 本断言只考核被测机制（育龄池过滤），孤儿数仅作 INFO 输出。
  let mothered = 0, orphan = 0;
  const rawSpawn = spawnAgent;
  spawnAgent = function (x, y, native, opts) {
    const a = rawSpawn(x, y, native, opts);
    if (opts && opts.mother === f.name) mothered++;
    else if (!opts || (!opts.father && !opts.mother)) orphan++;
    return a;
  };
  const before = agents.length;
  for (let i = 0; i < 400; i++) plannerTick();
  spawnAgent = rawSpawn;
  return { ok: true, mothered, orphan, total: agents.length - before };
}

for (const age of [19, 61]) {
  const r = boundaryCase(age);
  console.log("INFO 育龄边界 age=" + age + "：名下出生 " + r.mothered + "，孤儿出生 " + r.orphan + "（安全网路径，不考核）");
  assert(r.ok && r.mothered === 0, "育龄边界：age=" + age + " 名下零出生（400 轮 plannerTick，名下 " + r.mothered + "）");
}
for (const age of [20, 60]) {
  const r = boundaryCase(age);
  assert(r.ok && r.mothered >= 1, "育龄边界：age=" + age + " 名下出生 ≥1（400 轮 plannerTick，名下 " + r.mothered + "）");
}
`;

{
  const ctx = vm.createContext({ console });
  ctx.__failed = false;
  try {
    vm.runInContext(boundScript, ctx, { filename: "family-bound.js", timeout: 300000 });
  } catch (e) {
    console.error("FAIL 育龄边界上下文抛异常:", e);
    failed = true;
  }
  if (ctx.__failed) failed = true;
}

if (failed) process.exitCode = 1;
