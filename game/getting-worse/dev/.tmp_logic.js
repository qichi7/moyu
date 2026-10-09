"use strict";
// ============ 全局配置：PC宇宙 · 越玩越菜（副标题：生存退化） ============
const BUILD_ID = "v0.1.0";

// 退化链四形态：牛马 →（1万倍）猴子 →（1亿倍）草履虫 →（再1万倍）阿巴阿巴分子
const FORMS = [
  { key: "worker",     name: "牛马",       multLabel: "0",    speed: 150, radius: 10, dash: true },
  { key: "monkey",     name: "猴子",       multLabel: "1万",  speed: 112, radius: 13, dash: false },
  { key: "paramecium", name: "草履虫",     multLabel: "1亿",  speed: 68,  radius: 6,  dash: false },
  { key: "molecule",   name: "阿巴阿巴分子", multLabel: "1万亿", speed: 0,   radius: 5,  dash: false, brownian: true },
];

// 累计退化倍数（HUD 计数器按形态跳变）
const MULTIPLIERS = [1, 1e4, 1e8, 1e12];

// 分子变异体（彩蛋）：学名=几X化几Y 计数法；化学式=元素名+数字；俗名=按分子式原子排列顺序连读
// 分子式必须按读音节拍排列（阿-巴-阿-巴 → 阿巴阿巴；嗯-嗯-阿-阿 → 嗯嗯阿阿）
const MOLECULES = [
  { key: "ababa",  folk: "阿巴阿巴", formal: "二阿化二巴", formula: "阿2巴2",
    atoms: ["a", "b", "a", "b"], sigma: 260, damp: 1.2, vmax: 220, sound: ["a", "b", "a", "b"] },
  { key: "enenaa", folk: "嗯嗯阿阿", formal: "二嗯化二阿", formula: "嗯2阿2",
    atoms: ["e", "e", "a", "a"], sigma: 90,  damp: 2.2, vmax: 90,  sound: ["e", "e", "a", "a"] },
  { key: "wayaya", folk: "哇呀哇呀", formal: "二哇化二呀", formula: "哇2呀2",
    atoms: ["w", "y", "w", "y"], sigma: 420, damp: 1.6, vmax: 300, sound: ["w", "y", "w", "y"] },
];

// 捕食者（老板同步退化）：下标=形态；分子形态无敌，无天敌
const PREDATORS = [
  { key: "boss",    name: "西装老板", speed: 105, radius: 12 },
  { key: "gorilla", name: "猩猩老板", speed: 95,  radius: 15 },
  { key: "flea",    name: "水蚤",     speed: 60,  radius: 6  },
  null,
];

// 模拟参数
const SIM = {
  STEP: 1 / 60,            // 固定步长
  DEVOLVE_SECONDS: 20,     // 强制退化周期
  INVULN_AFTER_DEVOLVE: 2, // 退化后无敌秒数（防连环抓）
  PRED_STUN_ON_DEVOLVE: 1.2, // 退化瞬间天敌集体愣神
  DASH_SPEED: 340, DASH_TIME: 0.25, DASH_CD: 2.5,
  KNOCKBACK_SPEED: 300, KNOCKBACK_TIME: 0.45,  // 被抓击退（防墙角被永久钉死）
  PRED_GROW_TIME: 240, PRED_GROW_MAX: 0.35,  // 天敌速度成长 ×(1+min(t/240, .35))
  PRED_COUNT_BASE: 2, PRED_COUNT_EVERY: 15, PRED_COUNT_CAP: 6,
  SPAWN_MIN_DIST: 140,     // 天敌生成点离玩家最小距离
  CATALYST_EVERY: 8, CATALYST_LIFE: 12, CATALYST_RADIUS: 9, // 分子形态触媒
};

// 退化/事件文案（{form}=形态名 {mult}=倍数 {pred}=天敌 {mol}=俗名 {formal}=学名）
const DEVOLVE_TOASTS = {
  timer: [
    "假越放越长，你退化成了{form}（已退化{mult}倍）",
    "没人叫你上班，你退化成了{form}",
    "工位都长草了，你退化成了{form}（已退化{mult}倍）",
  ],
  caught: [
    "被{pred}当场抓获！你退化成了{form}（已退化{mult}倍）",
    "{pred}：上班时间想去哪？你退化成了{form}",
  ],
  molecule: "再退化1万倍……你变成了{mol}分子（{formal}），布朗运动开始，无限遨游",
  mutate: "触媒摄入！你变异成了{mol}分子（{formal}）",
};

// 结算吐槽（按存活时长分档）
const OVER_QUIPS = [
  { min: 0,  text: "退化速度惊人，老板看了都沉默。" },
  { min: 15, text: "这退化效率，年终奖是没戏了。" },
  { min: 35, text: "坚持得不错，可惜假期才是最强的进化压力。" },
  { min: 58, text: "满分牛马！硬撑到分子才肯罢休，敬佩。" },
];


"use strict";
// ============ 种子随机与哈希（mulberry32） ============
let _rngState = 1;

function rngInit(seed) {
  _rngState = (seed >>> 0) || 1;
}

function rand() {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randRange(a, b) {
  return a + rand() * (b - a);
}

// 标准正态（Box-Muller），布朗运动用
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 坐标确定性哈希 0~1（背景装饰撒点用，无每帧随机）
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}


"use strict";
// ============ 事件总线：逻辑层 emit，表现层订阅；headless 下无订阅者即空转 ============
const _evListeners = {};

function onEvent(name, fn) {
  if (!_evListeners[name]) _evListeners[name] = [];
  _evListeners[name].push(fn);
}

function emit(name, data) {
  const l = _evListeners[name];
  if (!l) return;
  for (const fn of l.slice()) fn(data);
}


"use strict";
// ============ 模拟核心（零 DOM，node headless 可跑） ============
// PC宇宙退化链：牛马放假后不断退化。每 20 秒强制退化一级；
// 被天敌（老板同步退化）抓到立即退化一级；分子形态布朗运动、无敌、分数冻结、手动结束。

const sim = {
  running: false, over: false,
  w: 800, h: 600,
  time: 0,              // 存活计分（分子形态冻结）
  formIdx: 0,
  devolveIn: 0,         // 距下次强制退化
  player: null,
  preds: [],            // 天敌（形态决定种类，位置跨形态保留——老板同步退化）
  cats: [],             // 触媒（分子形态彩蛋）
  catTimer: 0,
  molIdx: 0,            // 当前分子变异体（MOLECULES 下标）
  input: { x: 0, y: 0 },
  seed: 0,
  stats: { catches: 0, dashes: 0, mutations: 0 },
};

function simInit(seed, w, h) {
  sim.seed = seed >>> 0;
  rngInit(sim.seed);
  sim.w = w || 800;
  sim.h = h || 600;
  sim.running = false;
  sim.over = false;
  sim.time = 0;
  sim.formIdx = 0;
  sim.devolveIn = SIM.DEVOLVE_SECONDS;
  sim.player = { x: sim.w / 2, y: sim.h / 2, px: sim.w / 2, py: sim.h / 2, vx: 0, vy: 0,
                 face: 1, dashT: 0, dashCd: 0, dashVx: 0, dashVy: 0, invulnT: SIM.INVULN_AFTER_DEVOLVE };
  sim.preds = [];
  sim.cats = [];
  sim.catTimer = 0;
  sim.molIdx = 0;
  sim.input = { x: 0, y: 0 };
  sim.stats = { catches: 0, dashes: 0, mutations: 0 };
  _predSyncCount();
}

function simStart() {
  if (sim.over) return;
  sim.running = true;
  emit("start", {});
}

function simEndRun() {
  if (sim.over || !sim.running) return;
  sim.over = true;
  sim.running = false;
  emit("end", { time: sim.time, formIdx: sim.formIdx, mol: MOLECULES[sim.molIdx], stats: sim.stats });
}

function simResize(w, h) {
  sim.w = Math.max(200, w);
  sim.h = Math.max(200, h);
  if (!sim.player) return;
  const clampE = (e, r) => {
    e.x = Math.min(Math.max(e.x, r), sim.w - r);
    e.y = Math.min(Math.max(e.y, r), sim.h - r);
  };
  clampE(sim.player, FORMS[sim.formIdx].radius);
  for (const p of sim.preds) {
    const def = PREDATORS[sim.formIdx];
    if (def) clampE(p, def.radius);
  }
  for (const c of sim.cats) clampE(c, SIM.CATALYST_RADIUS);
}

function simSetInput(x, y) {
  const l = Math.hypot(x, y);
  sim.input.x = l > 1 ? x / l : x;
  sim.input.y = l > 1 ? y / l : y;
}

function simDash() {
  const p = sim.player;
  if (!sim.running || sim.over || sim.formIdx !== 0 || p.dashCd > 0) return;
  let dx = sim.input.x, dy = sim.input.y;
  if (!dx && !dy) { dx = p.face; dy = 0; }
  const len = Math.hypot(dx, dy) || 1;
  p.dashVx = dx / len * SIM.DASH_SPEED;
  p.dashVy = dy / len * SIM.DASH_SPEED;
  p.dashT = SIM.DASH_TIME;
  p.dashCd = SIM.DASH_CD;
  sim.stats.dashes++;
  emit("dash", {});
}

function simUpdate(dt) {
  if (!sim.running || sim.over) return;
  dt = Math.min(dt, 0.1);
  const form = FORMS[sim.formIdx];
  const def = PREDATORS[sim.formIdx];
  const molecule = sim.formIdx === 3;

  if (molecule) {
    _catalystTick(dt);        // 分子形态：分数冻结，只有触媒与布朗运动
  } else {
    sim.time += dt;
    sim.devolveIn -= dt;
    if (sim.devolveIn <= 0) { _devolve("timer"); return; }
  }

  _updatePlayer(dt, form, molecule);
  _updatePreds(dt, def);
  if (def) _collide(def);
}

// ---- 玩家 ----
function _updatePlayer(dt, form, molecule) {
  const p = sim.player;
  p.px = p.x; p.py = p.y;                       // 记录本帧起点（扫掠碰撞用）
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.dashT = Math.max(0, p.dashT - dt);

  if (molecule) {
    // 布朗运动（Ornstein-Uhlenbeck 抖动 + 限速 + 弹墙），输入无效——越玩越菜的最高境界
    const mol = MOLECULES[sim.molIdx];
    p.vx += (mol.sigma * randn() - mol.damp * p.vx) * dt;
    p.vy += (mol.sigma * randn() - mol.damp * p.vy) * dt;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > mol.vmax) { p.vx *= mol.vmax / sp; p.vy *= mol.vmax / sp; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < form.radius) { p.x = form.radius; p.vx = Math.abs(p.vx) * 0.8; }
    if (p.x > sim.w - form.radius) { p.x = sim.w - form.radius; p.vx = -Math.abs(p.vx) * 0.8; }
    if (p.y < form.radius) { p.y = form.radius; p.vy = Math.abs(p.vy) * 0.8; }
    if (p.y > sim.h - form.radius) { p.y = sim.h - form.radius; p.vy = -Math.abs(p.vy) * 0.8; }
    return;
  }

  let vx = sim.input.x * form.speed;
  let vy = sim.input.y * form.speed;
  if (form.key === "paramecium") {
    // 纤毛滑行：移动方向随时间摆动，一顿一顿的 struggled 感
    const wob = Math.sin(sim.time * 9) * 0.55;
    const c = Math.cos(wob), s = Math.sin(wob);
    const tx = vx * c - vy * s, ty = vx * s + vy * c;
    vx = tx; vy = ty;
  }
  if (p.dashT > 0) {
    const k = p.dashT / SIM.DASH_TIME;
    vx = p.dashVx * k + vx * 0.4;
    vy = p.dashVy * k + vy * 0.4;
  }
  p.vx = vx; p.vy = vy;
  if (Math.abs(vx) > 4) p.face = vx > 0 ? 1 : -1;
  p.x += vx * dt; p.y += vy * dt;
  if (p.x < form.radius) { p.x = form.radius; }
  if (p.x > sim.w - form.radius) { p.x = sim.w - form.radius; }
  if (p.y < form.radius) { p.y = form.radius; }
  if (p.y > sim.h - form.radius) { p.y = sim.h - form.radius; }
}

// ---- 天敌 ----
function _predTargetCount() {
  return Math.min(SIM.PRED_COUNT_BASE + Math.floor(sim.time / SIM.PRED_COUNT_EVERY), SIM.PRED_COUNT_CAP);
}

function _predSpeedMul() {
  return 1 + Math.min(sim.time / SIM.PRED_GROW_TIME, SIM.PRED_GROW_MAX);
}

function _spawnPred() {
  const def = PREDATORS[sim.formIdx];
  if (!def) return;
  let x = sim.w / 2, y = 0;
  for (let tries = 0; tries < 24; tries++) {
    const edge = (rand() * 4) | 0;
    if (edge === 0) { x = randRange(0, sim.w); y = 0; }
    else if (edge === 1) { x = sim.w; y = randRange(0, sim.h); }
    else if (edge === 2) { x = randRange(0, sim.w); y = sim.h; }
    else { x = 0; y = randRange(0, sim.h); }
    if (Math.hypot(x - sim.player.x, y - sim.player.y) >= SIM.SPAWN_MIN_DIST) break;
  }
  sim.preds.push({ x, y, vx: 0, vy: 0, phase: rand() * 6.28, burstT: randRange(0.6, 1.4), burst: 0, stun: 0 });
}

// 数量对齐 + 形态切换时天敌同步退化（原地改种，位置保留）
function _predSyncCount() {
  const def = PREDATORS[sim.formIdx];
  if (!def) { sim.preds.length = 0; return; }
  while (sim.preds.length < _predTargetCount()) _spawnPred();
}

function _updatePreds(dt, def) {
  if (!def) return;
  const mul = _predSpeedMul();
  const p = sim.player;
  for (const pr of sim.preds) {
    pr.stun = Math.max(0, pr.stun - dt);
    if (pr.stun > 0) continue;
    const dx = p.x - pr.x, dy = p.y - pr.y;
    const dist = Math.hypot(dx, dy) || 1;
    let sp = def.speed * mul;
    let ang = Math.atan2(dy, dx);
    if (def.key === "flea") {
      // 水蚤：慢速游走 + 猝发冲刺（草履虫的天敌捕食方式）
      pr.burstT -= dt;
      if (pr.burstT <= 0) { pr.burstT = randRange(0.9, 1.6); pr.burst = 0.28; }
      if (pr.burst > 0) { pr.burst -= dt; sp *= 2.6; ang += randRange(-0.25, 0.25); }
      else sp *= 0.35;
    } else {
      // 老板系：直线追击 + 包抄摆动
      ang += Math.sin(sim.time * (def.key === "gorilla" ? 1.7 : 2.3) + pr.phase) * 0.35;
    }
    pr.vx = Math.cos(ang) * sp;
    pr.vy = Math.sin(ang) * sp;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    const r = def.radius;
    if (pr.x < r) pr.x = r;
    if (pr.x > sim.w - r) pr.x = sim.w - r;
    if (pr.y < r) pr.y = r;
    if (pr.y > sim.h - r) pr.y = sim.h - r;
  }
}

// ---- 碰撞（扫掠采样防高速穿越） ----
function _collide(def) {
  const p = sim.player;
  if (p.invulnT > 0) return;
  const rr = def.radius + FORMS[sim.formIdx].radius;
  for (const pr of sim.preds) {
    if (pr.stun > 0) continue;
    let hit = Math.hypot(p.x - pr.x, p.y - pr.y) < rr;
    if (!hit) {
      const mx = (p.px + p.x) / 2, my = (p.py + p.y) / 2;   // 中间位置采样
      hit = Math.hypot(mx - pr.x, my - pr.y) < rr;
    }
    if (hit) { _onCatch(pr); return; }
  }
}

function _onCatch(pr) {
  sim.stats.catches++;
  emit("catch", { pred: PREDATORS[sim.formIdx].name });
  for (const q of sim.preds) q.stun = SIM.PRED_STUN_ON_DEVOLVE;   // 全体愣神看退化
  _devolve("caught");
  // 击退：朝「远离捕食者 + 偏向场心」方向弹飞（防墙角被永久钉死）
  const p = sim.player;
  const ax = p.x - pr.x, ay = p.y - pr.y;
  const al = Math.hypot(ax, ay) || 1;
  const cx = sim.w / 2 - p.x, cy = sim.h / 2 - p.y;
  const cl = Math.hypot(cx, cy) || 1;
  const kx = ax / al + 0.6 * cx / cl, ky = ay / al + 0.6 * cy / cl;
  const kl = Math.hypot(kx, ky) || 1;
  p.dashVx = kx / kl * SIM.KNOCKBACK_SPEED;
  p.dashVy = ky / kl * SIM.KNOCKBACK_SPEED;
  p.dashT = SIM.KNOCKBACK_TIME;
}

// ---- 退化链 ----
function _devolve(cause) {
  if (sim.formIdx >= 3) return;
  const from = sim.formIdx;
  sim.formIdx++;
  sim.devolveIn = SIM.DEVOLVE_SECONDS;
  const p = sim.player;
  p.invulnT = SIM.INVULN_AFTER_DEVOLVE;
  p.dashT = 0;
  p.vx *= 0.3; p.vy *= 0.3;
  _predSyncCount();
  emit("devolve", { from, to: sim.formIdx, cause,
                    formName: FORMS[sim.formIdx].name, multLabel: FORMS[sim.formIdx].multLabel });
  if (sim.formIdx === 3) emit("molecule", { mol: MOLECULES[sim.molIdx] });
}

// ---- 触媒与分子变异（彩蛋） ----
function _catalystTick(dt) {
  sim.catTimer -= dt;
  const p = sim.player;
  for (let i = sim.cats.length - 1; i >= 0; i--) {
    const c = sim.cats[i];
    c.t -= dt;
    if (c.t <= 0) { sim.cats.splice(i, 1); continue; }
    if (Math.hypot(c.x - p.x, c.y - p.y) < SIM.CATALYST_RADIUS + FORMS[3].radius + 4) {
      sim.cats.splice(i, 1);
      _mutate();
    }
  }
  if (sim.catTimer <= 0 && sim.cats.length < 1) {
    sim.catTimer = SIM.CATALYST_EVERY;
    sim.cats.push({ x: randRange(30, sim.w - 30), y: randRange(30, sim.h - 30), t: SIM.CATALYST_LIFE });
    emit("catalyst", {});
  }
}

function _mutate() {
  let idx = (rand() * (MOLECULES.length - 1)) | 0;
  if (idx >= sim.molIdx) idx++;
  const from = sim.molIdx;
  sim.molIdx = idx;
  sim.stats.mutations++;
  emit("mutate", { from, to: idx, mol: MOLECULES[idx] });
}
