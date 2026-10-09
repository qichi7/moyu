"use strict";
// ============ 主入口：主循环、相机画布、键盘/触屏输入、界面与 HUD、事件接线 ============
(function () {
  const el = (id) => document.getElementById(id);   // 必须在 IIFE 首行（防 TDZ 黑屏）

  const cv = el("cv");
  const ctx = cv.getContext("2d");
  const hud = el("hud"), hudTime = el("hud-time"), hudForm = el("hud-form"),
        hudMult = el("hud-mult"), hudCd = el("hud-cd"), hudCdV = el("hud-cd-v"), hudBest = el("hud-best");
  const screenStart = el("screen-start"), screenOver = el("screen-over");
  const btnStart = el("btn-start"), btnAgain = el("btn-again"), btnEnd = el("btn-end"), btnDash = el("btn-dash");
  const joyBase = el("joy-base"), joyStick = el("joy-stick"), toastsBox = el("toasts");
  const chainBox = el("chain-preview"), startBest = el("start-best");
  const overMol = el("over-mol"), overFormal = el("over-formal"), overStats = el("over-stats"),
        overQuip = el("over-quip"), overBest = el("over-best");

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const isTouch = "ontouchstart" in window;
  let viewW = 800, viewH = 600;

  // ---- 画布尺寸（resize 防抖 120ms，同步 simResize） ----
  let resizeTimer = null;
  function applySize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    cv.width = Math.round(viewW * DPR);
    cv.height = Math.round(viewH * DPR);
    cv.style.width = viewW + "px";
    cv.style.height = viewH + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    simResize(viewW, viewH);
  }
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 120);
  });

  // ---- 最高纪录（localStorage 容错） ----
  function loadBest() {
    try { const v = parseFloat(localStorage.getItem("getting-worse-best")); return isFinite(v) ? v : 0; }
    catch (e) { return 0; }
  }
  function saveBest(t) {
    try { localStorage.setItem("getting-worse-best", String(t)); } catch (e) {}
  }
  function fmtTime(t) { return t >= 60 ? Math.floor(t / 60) + "分" + (t % 60).toFixed(0) + "秒" : t.toFixed(1) + "秒"; }

  // ---- Toast ----
  function toast(text) {
    const d = document.createElement("div");
    d.className = "toast";
    d.textContent = text;
    toastsBox.appendChild(d);
    requestAnimationFrame(() => d.classList.add("show"));
    setTimeout(() => {
      d.classList.remove("show");
      setTimeout(() => d.remove(), 220);
    }, 2600);
    while (toastsBox.children.length > 3) toastsBox.firstChild.remove();
  }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function fill(str, map) { return str.replace(/\{(\w+)\}/g, (_, k) => map[k] != null ? map[k] : ""); }

  // ---- 开始界面形态链预览 ----
  function buildChainPreview() {
    if (!chainBox || chainBox.children.length) return;
    const labels = ["0倍", "1万倍", "1亿倍", "1万亿倍"];
    FORMS.forEach((f, i) => {
      if (i > 0) {
        const a = document.createElement("span");
        a.className = "arr"; a.textContent = "→";
        chainBox.appendChild(a);
      }
      const node = document.createElement("div");
      node.className = "node";
      const img = document.createElement("img");
      const key = (i === 3 ? "mol_" + MOLECULES[0].key : f.key) + ":0";
      try { img.src = getSprite(key).toDataURL(); } catch (e) { img.style.display = "none"; }
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = f.name;
      const mu = document.createElement("span"); mu.className = "mu"; mu.textContent = labels[i];
      node.appendChild(img); node.appendChild(nm); node.appendChild(mu);
      chainBox.appendChild(node);
    });
  }

  // ---- 流程 ----
  function refreshBestUi() {
    const b = loadBest();
    hudBest.textContent = b > 0 ? fmtTime(b) : "-";
    if (startBest) startBest.innerHTML = b > 0 ? "最高纪录：<b>" + fmtTime(b) + "</b>" : "尚无纪录——去创造最菜的纪录吧";
  }

  function startRun() {
    sfx.init();
    sfx.play("start");
    simInit((Math.random() * 1e9) | 0, viewW, viewH);
    simStart();
    screenStart.classList.add("hidden");
    screenOver.classList.add("hidden");
    hud.classList.remove("hidden");
    btnEnd.classList.add("hidden");
    sfx.play("tick");
  }

  function endRun(d) {
    const b0 = loadBest();
    const isNew = d.time > b0;
    if (isNew) saveBest(d.time);
    overMol.textContent = d.mol.folk + "分子";
    overFormal.textContent = d.mol.formal + "（" + d.mol.formula + "）";
    overStats.textContent = "存活 " + fmtTime(d.time) + " · 被抓 " + d.stats.catches +
                            " 次 · 冲刺 " + d.stats.dashes + " 次 · 变异 " + d.stats.mutations + " 次";
    let quip = OVER_QUIPS[0].text;
    for (const q of OVER_QUIPS) if (d.time >= q.min) quip = q.text;
    overQuip.textContent = quip;
    overBest.innerHTML = "最高纪录：<b>" + fmtTime(Math.max(b0, d.time)) + "</b>" + (isNew ? ' <span class="new">新纪录！</span>' : "");
    screenOver.classList.remove("hidden");
    hud.classList.add("hidden");
    btnEnd.classList.add("hidden");
    btnDash.classList.add("hidden");
    refreshBestUi();
  }

  // ---- 事件接线（逻辑层 emit，表现层订阅） ----
  // 捕获事件先于退化事件发生：缓存天敌名供 caught 文案使用
  let _lastPredName = "老板";
  let molTalkTimer = null;

  onEvent("catch", (d) => { sfx.play("catch"); _lastPredName = d.pred; });
  onEvent("devolve", (d) => {
    sfx.play("devolve");
    if (d.cause === "caught") {
      toast(fill(pick(DEVOLVE_TOASTS.caught), { form: d.formName, mult: d.multLabel, pred: _lastPredName }));
    } else {
      toast(fill(pick(DEVOLVE_TOASTS.timer), { form: d.formName, mult: d.multLabel }));
    }
  });
  onEvent("molecule", (d) => {
    sfx.play("molecule");
    toast(fill(DEVOLVE_TOASTS.molecule, { mol: d.mol.folk, formal: d.mol.formal }));
    btnEnd.classList.remove("hidden");
    clearInterval(molTalkTimer);
    molTalkTimer = setInterval(() => {         // 分子自言自语：念自己的连读名
      if (sim.running && sim.formIdx === 3 && !sim.over) sfx.speak(MOLECULES[sim.molIdx].sound);
    }, 2400);
  });
  onEvent("mutate", (d) => {
    sfx.play("pickup");
    toast(fill(DEVOLVE_TOASTS.mutate, { mol: d.mol.folk, formal: d.mol.formal }));
  });
  onEvent("dash", () => sfx.play("dash"));
  onEvent("end", (d) => {
    sfx.play("end");
    clearInterval(molTalkTimer);
    endRun(d);
  });

  // ---- 输入：键盘 ----
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    sfx.init();
    const k = e.key.toLowerCase();
    if (k === " " || e.code === "Space") {
      e.preventDefault();
      simDash();
      return;
    }
    if (k === "enter") {
      if (!screenStart.classList.contains("hidden") || !screenOver.classList.contains("hidden")) startRun();
      return;
    }
    keys.add(k);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  function keyVector() {
    let x = 0, y = 0;
    if (keys.has("arrowleft") || keys.has("a")) x -= 1;
    if (keys.has("arrowright") || keys.has("d")) x += 1;
    if (keys.has("arrowup") || keys.has("w")) y -= 1;
    if (keys.has("arrowdown") || keys.has("s")) y += 1;
    const l = Math.hypot(x, y);
    return l ? { x: x / l, y: y / l } : null;
  }

  // ---- 输入：触屏摇杆（监听整个 document；按钮/弹窗元素排除） ----
  let joyId = null, joyOx = 0, joyOy = 0, joyActive = false, touchSeen = false;
  const JOY_R = 44;

  function isUiTarget(t) { return !!(t && t.closest && t.closest("button, .screen")); }

  document.addEventListener("touchstart", (e) => {
    touchSeen = true;
    sfx.init();
    if (isUiTarget(e.target)) return;
    if (joyId !== null) return;
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyOx = t.clientX; joyOy = t.clientY;
    joyActive = true;
    joyBase.style.left = (joyOx - 48) + "px"; joyBase.style.top = (joyOy - 48) + "px";
    joyStick.style.left = (joyOx - 22) + "px"; joyStick.style.top = (joyOy - 22) + "px";
    joyBase.classList.remove("hidden"); joyStick.classList.remove("hidden");
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (joyId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = t.clientX - joyOx, dy = t.clientY - joyOy;
      const l = Math.hypot(dx, dy);
      if (l > JOY_R) { dx = dx / l * JOY_R; dy = dy / l * JOY_R; }
      simSetInput(dx / JOY_R, dy / JOY_R);
      joyStick.style.left = (joyOx + dx - 22) + "px";
      joyStick.style.top = (joyOy + dy - 22) + "px";
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  function joyEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null; joyActive = false;
      simSetInput(0, 0);
      joyBase.classList.add("hidden"); joyStick.classList.add("hidden");
    }
  }
  document.addEventListener("touchend", joyEnd);
  document.addEventListener("touchcancel", joyEnd);

  btnDash.addEventListener("touchstart", (e) => { e.stopPropagation(); simDash(); }, { passive: true });
  btnDash.addEventListener("click", () => simDash());

  // ---- 按钮 ----
  btnStart.addEventListener("click", startRun);
  btnAgain.addEventListener("click", startRun);
  btnEnd.addEventListener("click", () => { sfx.play("tick"); simEndRun(); });

  // ---- HUD ----
  function updateHud() {
    if (sim.over) return;
    hudTime.textContent = fmtTime(sim.time);
    hudForm.textContent = sim.formIdx === 3 ? MOLECULES[sim.molIdx].folk + "分子" : FORMS[sim.formIdx].name;
    hudMult.textContent = FORMS[sim.formIdx].multLabel + "倍";
    if (sim.formIdx === 3) {
      hudCd.classList.add("hidden");
    } else {
      hudCd.classList.remove("hidden");
      hudCdV.textContent = Math.ceil(sim.devolveIn) + "s";
      hudCd.classList.toggle("danger", sim.devolveIn < 5);
    }
    if (touchSeen) btnDash.classList.toggle("hidden", !(sim.running && sim.formIdx === 0));
  }

  // ---- 主循环：固定步长 + rAF ----
  let last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    if (sim.running && !sim.over) {
      const kv = keyVector();
      if (kv && !joyActive) simSetInput(kv.x, kv.y);
      else if (!joyActive && !kv) simSetInput(0, 0);
    }
    acc += realDt;
    let steps = 0;
    while (acc >= SIM.STEP && steps < 6) { simUpdate(SIM.STEP); acc -= SIM.STEP; steps++; }
    drawScene(ctx, sim, now / 1000);
    updateHud();
  }

  // ---- 启动 ----
  applySize();
  simInit((Math.random() * 1e9) | 0, viewW, viewH);   // 预初始化：开始界面背后已是待命赛场
  buildChainPreview();
  refreshBestUi();
  requestAnimationFrame(frame);
})();
