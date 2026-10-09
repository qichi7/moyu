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
