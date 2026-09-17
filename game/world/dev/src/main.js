"use strict";
// ============ 主入口：主循环 / 相机输入 / UI ============

(function main() {
  const el = id => document.getElementById(id);   // DOM 快捷查找，全文件唯一定义（必须先于所有使用）
  const canvas = el("cv");
  const ctx = canvas.getContext("2d");
  let CW = 0, CH = 0;

  function resize() {
    CW = canvas.width = window.innerWidth;
    CH = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- 相机输入 ----
  let dragging = false, lastMX = 0, lastMY = 0;
  let downX = 0, downY = 0;   // 用于区分拖拽与点击
  let camTween = null;        // 回原点的平滑飞行
  canvas.addEventListener("mousedown", e => {
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    downX = e.clientX; downY = e.clientY;
    camTween = null;
  });
  window.addEventListener("mouseup", e => {
    if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) handlePick(e);
    dragging = false;
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    const s = TILE_PX * camera.zoom;
    camera.x -= (e.clientX - lastMX) / s;
    camera.y -= (e.clientY - lastMY) / s;
    lastMX = e.clientX; lastMY = e.clientY;
    clampCam();
  });
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    camTween = null;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;   // 缓速缩放
    applyZoom(camera.zoom * factor, e.clientX, e.clientY);
  }, { passive: false });

  // 统一缩放入口：nz 新倍率，(ax,ay) 屏幕锚点
  function applyZoom(nz, ax, ay) {
    nz = Math.min(6, Math.max(0.1, nz));
    const s0 = TILE_PX * camera.zoom, s1 = TILE_PX * nz;
    camera.x += (ax - CW / 2) * (1 / s0 - 1 / s1);
    camera.y += (ay - CH / 2) * (1 / s0 - 1 / s1);
    camera.zoom = nz;
    clampCam();
    syncZoomUI();
  }

  // 滑动轴与滚轮双向同步
  function syncZoomUI() {
    const sl = document.getElementById("zoom-slider");
    if (sl && +sl.value !== camera.zoom) sl.value = camera.zoom.toFixed(2);
    const zl = document.getElementById("zoom-label");
    if (zl) zl.textContent = camera.zoom.toFixed(1) + "×";
  }
  const zoomSlider = document.getElementById("zoom-slider");
  if (zoomSlider) {
    zoomSlider.addEventListener("input", () => applyZoom(+zoomSlider.value, CW / 2, CH / 2));
  }

  // 无限地图：相机不做边界限制（迷路可用「回原点」）
  function clampCam() {}

  // ---- 速度控制 ----
  let speed = 1;
  const speedBtns = {};
  function setSpeed(v) {
    speed = v;
    for (const k in speedBtns) speedBtns[k].classList.toggle("active", +k === v);
  }
  ["pause", "s1", "s2", "s4", "s100"].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    speedBtns[b.dataset.v] = b;
    b.addEventListener("click", () => { sfx.play("click"); setSpeed(+b.dataset.v); });
  });
  window.addEventListener("keydown", e => {
    if (e.code === "Space") { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
    if (e.key === "1") setSpeed(1);
    if (e.key === "2") setSpeed(2);
    if (e.key === "3") setSpeed(4);
    if (e.key === "4") setSpeed(100);
  });

  // ---- 音效：首次手势解锁 AudioContext（浏览器自动播放策略） ----
  function ensureAudio() { sfx.init(); sfx.resume(); }
  window.addEventListener("pointerdown", ensureAudio);
  window.addEventListener("keydown", ensureAudio);

  // ---- 回原点：平滑飞行（easeInOutCubic，zoom 同步缓动） ----
  const goHomeBtn = el("go-home");
  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      const dist = Math.hypot(camera.x, camera.y);
      camTween = {
        x0: camera.x, y0: camera.y, x1: 0, y1: 0,
        z0: camera.zoom, z1: Math.max(camera.zoom, 1.2), t: 0,
        dur: Math.min(2.6, 0.5 + dist / 300),
      };
      sfx.play("click");
    });
  }

  const sfxBtn = document.getElementById("sfx-toggle");
  if (sfxBtn) {
    sfxBtn.addEventListener("click", () => {
      const m = sfx.toggle();
      sfxBtn.textContent = m ? "音效:关" : "音效:开";
      if (!m) sfx.play("click");
    });
  }

  // ---- 启动模拟（每次开局随机生成一张新地图；测试用固定种子）----
  simInit(Math.floor(Math.random() * 1e9));
  camera.x = world.store.x; camera.y = world.store.y;
  syncZoomUI();

  // ---- 主循环：固定步长模拟 ----
  // 高倍速（100×）时允许更多步进/帧，同时截断积压防止螺旋卡死
  const STEP = 1 / 30;
  let acc = 0, lastT = performance.now();
  let lastPhase = "day";
  function frame(now) {
    const realDt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    acc += realDt * speed;
    const maxSteps = speed > 10 ? 240 : 12;
    let n = 0;
    while (acc >= STEP && n < maxSteps) { simUpdate(STEP); acc -= STEP; n++; }
    if (acc > STEP * maxSteps) acc = STEP * maxSteps;

    // 昼夜切换提示音
    const phase = isDaytime() ? "day" : "night";
    if (phase !== lastPhase) { lastPhase = phase; sfx.play(phase === "night" ? "dusk" : "dawn"); }

    // 相机飞行：easeInOutCubic —— 先慢加速、中段飞驰、末端缓缓减速落定（zoom 同步）
    if (camTween) {
      camTween.t += realDt / camTween.dur;
      const u = Math.min(1, camTween.t);
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      camera.x = camTween.x0 + (camTween.x1 - camTween.x0) * k;
      camera.y = camTween.y0 + (camTween.y1 - camTween.y0) * k;
      camera.zoom = camTween.z0 + (camTween.z1 - camTween.z0) * k;
      syncZoomUI();
      if (camTween.t >= 1) camTween = null;
    }

    drawScene(ctx, CW, CH, selectedAgent, selectedCreature);
    updateHud(realDt);
    updateInfoPanel(realDt);
    updateRoster(realDt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- HUD ----
  const hud = {
    pop: el("stat-pop"), food: el("stat-food"), houses: el("stat-houses"),
    date: el("stat-date"), clock: el("stat-clock"), logs: el("logs"),
    build: el("build-id"), era: el("stat-era"),
  };
  let lastLogLen = -1, hudCd = 0;

  function updateHud(dt) {
    hudCd -= dt;
    if (hudCd > 0) return;
    hudCd = 0.25;

    hud.pop.textContent = agents.length;
    hud.food.textContent = Math.floor(world.food);
    hud.houses.textContent = world.houses.length;
    // 历法：1 昼夜 = 1 个月，12 昼夜 = 1 年
    const totalDays = Math.floor(world.time / SIM.DAY_LEN);
    hud.date.textContent = (Math.floor(totalDays / SIM.YEAR_DAYS) + 1) + "年" + (totalDays % SIM.YEAR_DAYS + 1) + "月";
    hud.era.textContent = ERAS[world.era].name;
    const tod = world.timeOfDay;
    const hh = String(Math.floor(tod * 24)).padStart(2, "0");
    const mm = String(Math.floor((tod * 24 % 1) * 60)).padStart(2, "0");
    hud.clock.textContent = `${isDaytime() ? "☀" : "☾"} ${hh}:${mm}`;

    if (world.logs.length !== lastLogLen) {
      lastLogLen = world.logs.length;
      hud.logs.innerHTML = world.logs
        .map(l => `<div class="log-line"><span class="log-t">D${Math.floor(l.t / SIM.DAY_LEN) + 1}</span>${l.text}</div>`)
        .join("");
    }
  }
  hud.build.textContent = BUILD_ID;

  // ---- 点击拾取与信息面板 ----
  const infoPanel = el("info-panel"), infoBody = el("info-body"), infoClose = el("info-close");
  let selectedAgent = null;
  let selectedCreature = null;
  let infoCd = 0;   // 跟随面板内容刷新节流

    infoClose.addEventListener("click", () => {
    selectedAgent = null;
    selectedCreature = null;
    infoPanel.classList.add("hidden");
  });

  const screenToTile = (cx, cy) => {
    const s = TILE_PX * camera.zoom;
    return {
      x: Math.floor((cx - (CW / 2 - camera.x * s)) / s),
      y: Math.floor((cy - (CH / 2 - camera.y * s)) / s),
    };
  };

  const TASK_CN = { BUILD: "建造房屋", FARM: "开垦农田", DIG: "开山伐林", FILL: "填海造陆", BRIDGE: "架桥", GATHER: "采集", FISH: "捕鱼", HUNT: "狩猎", CAPTURE: "捕获", PASTURE: "建造牧场", PLANT: "植树" };
  const STATE_CN = { walk: "赶路中", eat: "进食", sleep: "酣睡", work: "干活", idle: "闲逛" };
  const SETTLE_CN = ["定居点", "村庄", "城镇", "城市"];

  // ---- 信息档位命名 ----
  const hungerTier = h => h > 75 ? "吃饱了" : h > 50 ? "不饿" : h > 25 ? "有点饿" : h > 10 ? "饥饿" : "危在旦夕";
  const energyTier = e => e > 65 ? "精力充沛" : e > 30 ? "有些疲惫" : "筋疲力尽";
  const adventureTier = v => v > 0.75 ? "天生探险家" : v > 0.5 ? "向往外面" : v > 0.25 ? "安分守己" : "家里蹲";
  const diligenceTier = v => v > 0.8 ? "工作狂" : v > 0.55 ? "勤快" : v > 0.3 ? "随大流" : "偷奸耍滑";
  const healthTier = a => a.sick ? "生病了" : hungerTier(a.hunger) === "危在旦夕" || energyTier(a.energy) === "筋疲力尽" ? "状态很差" : "健康";
  const ageTier = (age, species) => {
    const sp = SPECIES_AGE[species || "human"];
    if (age < sp.stages[0]) return "幼年";
    if (age < sp.stages[1]) return "青年";
    if (age < sp.stages[2]) return "中年";
    return "老年";
  };

  function settleOf(x, y) {
    for (const s of world.settlements) {
      if (Math.abs(s.x - x) + Math.abs(s.y - y) <= SIM.SETTLEMENT_RADIUS) return s;
    }
    return null;
  }

  function showPanel(title, html, px, py) {
    infoBody.innerHTML = `<div class="ip-title">${title}</div>${html}`;
    infoPanel.classList.remove("hidden");
    infoPanel.style.left = Math.min(CW - 230, px + 14) + "px";
    infoPanel.style.top = Math.max(48, Math.min(CH - 160, py - 20)) + "px";
  }

  function handlePick(e) {
    const { x: tx, y: ty } = screenToTile(e.clientX, e.clientY);
    if (!inWorld(tx, ty)) return;
    // 拾取优先级：小人 > 动物 > 地块
    let best = null, bestD = 0.8;
    for (const a of agents) {
      const d = Math.hypot(a.x - (tx + 0.5), a.y - (ty + 0.5));
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) {
      selectedCreature = null;
      selectedAgent = best;
      showAgentPanel(best, e.clientX, e.clientY);
      return;
    }
    let bestC = null, bestCD = 0.8;
    for (const c of creatures) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - (tx + 0.5), c.y - (ty + 0.5));
      if (d < bestCD) { bestCD = d; bestC = c; }
    }
    if (bestC) {
      selectedAgent = null;
      selectedCreature = bestC;
      infoCd = 0;
      showCreaturePanel(bestC);
      return;
    }
    selectedAgent = null;
    selectedCreature = null;
    showTilePanel(tx, ty, e.clientX, e.clientY);
  }

  function showTilePanel(tx, ty, cx, cy) {
    const t = tileAt(tx, ty);
    const meta = TILE_META[t];
    const lines = [];
    const sett = settleOf(tx, ty);
    if (sett) lines.push("辖区：" + sett.name + "（" + SETTLE_CN[sett.level] + "）");
    if (t === T.HOUSE) {
      const h = world.houses.find(k => k.x === tx && k.y === ty);
      if (h && h.granary) lines.push("粮仓 · 聚落中心");
    } else if (t === T.FARM) {
      const f = world.farms.find(k => k.x === tx && k.y === ty);
      if (f) lines.push("成熟进度 " + Math.floor(f.grow / SIM.FARM_MATURITY * 100) + "%");
    } else if (meta.diggable) lines.push("可开凿 · 工时 " + meta.hp);
    else if (meta.fillable) lines.push("可" + (meta.bridgeable ? "架桥/填埋" : "填埋") + " · 工时 " + meta.hp);
    const task = tasks.list.find(k => !k.done && k.x === tx && k.y === ty);
    if (task) {
      const p = task.need ? " " + Math.floor(Math.min(1, task.progress / task.need) * 100) + "%" : " 施工中";
      lines.push("工程：" + TASK_CN[task.type] + p);
    }
    if (t === T.VOID) lines.push("未知的虚空 · 尚未探索");
    showPanel(meta.name + ` (${tx}, ${ty})`, lines.map(l => "· " + l).join("<br>") || "寻常土地", cx, cy);
  }

  const JOBS_CN = { farmer: "农夫", lumberjack: "伐木工", miner: "采石工", hunter: "猎人", fisher: "渔民", builder: "工匠", explorer: "探险家" };
  const HOBBY_CN = { explore: "向往远方", homebody: "恋家", animal: "喜爱牲畜", fishing: "垂钓爱好者", none: "随遇而安" };

  function agentPanelHtml(a) {
    const foodC = a.hunger > 40 ? "#6fae4e" : a.hunger > 15 ? "#e0b64a" : "#c23b3b";
    const enC = a.energy > 35 ? "#5a8fd0" : "#c2623b";
    const home = a.home ? (() => {
      const s = settleOf(a.home.x, a.home.y);
      return s ? s.name : "自宅";
    })() : "无家可归";
    const RES_CN = { food: "粮", wood: "木材", stone: "石材", sand: "沙土" };
    const carry = a.carrying ? `<br>背着：${RES_CN[a.carrying.res] || a.carrying.res} ×${a.carrying.amount}（回仓入库中）` : "";
    return `职业：${JOBS_CN[a.job] || a.job}<br>` +
      `状态：${a.sick ? "生病了" : (STATE_CN[a.state] || a.state)}${a.task ? "（" + TASK_CN[a.task.type] + "）" : ""}<br>` +
      `年龄：${Math.floor(a.age)} 岁 · ${ageTier(a.age, "human")}<br>` +
      `健康：${healthTier(a)}<br>` +
      `饱食：${hungerTier(a.hunger)}<div class="ip-bar"><div style="width:${a.hunger}%;background:${foodC}"></div></div>` +
      `精力：${energyTier(a.energy)}<div class="ip-bar"><div style="width:${a.energy}%;background:${enC}"></div></div>` +
      `探索欲：${adventureTier(a.adventure)}<br>` +
      `勤劳：${diligenceTier(a.diligence)}<br>` +
      `喜好：${HOBBY_CN[a.hobby] || "随遇而安"}<br>` +
      `住所：${home}${carry}`;
  }

  function showAgentPanel(a, cx, cy) {
    const s = TILE_PX * camera.zoom;
    const px = CW / 2 + (a.x - camera.x) * s;
    const py = CH / 2 + (a.y - camera.y) * s;
    showPanel(a.name, agentPanelHtml(a), px, py);
    void cx; void cy;
  }

  function creaturePanelHtml(c) {
    const meta = CREATURE_META[c.type];
    const status = c.pasture ? "圈养于牧场" : c.type === "dog"
      ? (c.owner ? "陪伴着 " + c.owner.name : "四处溜达") : "在野";
    return `物种：${meta.name}<br>` +
      `年龄：${Math.floor(c.age)} 岁 · ${ageTier(c.age, c.type)}<br>` +
      `状态：${status}${c.isWild() && !c.dead ? "<br>· 可狩猎/可捕获" : ""}`;
  }

  function showCreaturePanel(c) {
    const s = TILE_PX * camera.zoom;
    const px = CW / 2 + (c.x - camera.x) * s;
    const py = CH / 2 + (c.y - camera.y) * s;
    showPanel(`${meta2name(c.type)} · ${c.pasture ? "圈养" : c.type === "dog" ? "伙伴" : "野生"}`, creaturePanelHtml(c), px, py);
  }

  function meta2name(type) { return CREATURE_META[type].name; }

  // 每帧：跟随选中的生物（小人优先）+ 定期刷新内容（对话框贴近头顶）
  function updateInfoPanel(realDt) {
    if (selectedAgent) {
      const a = selectedAgent;
      if (a.dead) { infoPanel.classList.add("hidden"); selectedAgent = null; return; }
      const s = TILE_PX * camera.zoom;
      const px = CW / 2 + (a.x - camera.x) * s;
      const py = CH / 2 + (a.y - camera.y) * s;
      infoPanel.style.left = Math.min(CW - 230, px + 16) + "px";
      infoPanel.style.top = Math.max(48, Math.min(CH - 170, py - 150)) + "px";
      infoCd -= realDt;
      if (infoCd <= 0) { infoCd = 0.25; infoBody.innerHTML = `<div class="ip-title">${a.name}</div>` + agentPanelHtml(a); }
      return;
    }
    if (selectedCreature) {
      const c = selectedCreature;
      if (c.dead) { infoPanel.classList.add("hidden"); selectedCreature = null; return; }
      const s = TILE_PX * camera.zoom;
      const px = CW / 2 + (c.x - camera.x) * s;
      const py = CH / 2 + (c.y - camera.y) * s;
      infoPanel.style.left = Math.min(CW - 230, px + 16) + "px";
      infoPanel.style.top = Math.max(48, Math.min(CH - 170, py - 130)) + "px";
      infoCd -= realDt;
      if (infoCd <= 0) { infoCd = 0.3; infoBody.innerHTML = `<div class="ip-title">${meta2name(c.type)}</div>` + creaturePanelHtml(c); }
    }
  }

  // ---- 居民名册（按居住地分组，点击组展开，点击名字定位小人） ----
  const rosterBody = el("roster-body");
  const expandedGroups = new Set();
  let rosterCd = 0;

  rosterBody.addEventListener("click", e => {
    // 定位按钮优先：飞往地区中心，不触发折叠
    const flyEl = e.target.closest(".fly-btn");
    if (flyEl) { flyTo(+flyEl.dataset.fx, +flyEl.dataset.fy); return; }
    // 点击无名岛条目本身也可定位
    const isleEl = e.target.closest("[data-fly]");
    if (isleEl) { flyTo(+isleEl.dataset.fx, +isleEl.dataset.fy); return; }
    const nameEl = e.target.closest(".roster-name");
    if (nameEl && nameEl.dataset.id !== undefined) {
      const a = agents[+nameEl.dataset.id];
      if (a) focusAgent(a);
      return;
    }
    const headEl = e.target.closest(".roster-group-head");
    if (headEl) {
      const g = headEl.dataset.g;
      if (expandedGroups.has(g)) expandedGroups.delete(g);
      else expandedGroups.add(g);
      rosterCd = 0;   // 立即重绘
    }
  });

  // 定位飞行：飞到地区中心，缩放太小则同步放大
  function flyTo(x, y) {
    sfx.play("click");
    const dist = Math.hypot(camera.x - x, camera.y - y);
    camTween = {
      x0: camera.x, y0: camera.y, x1: x, y1: y,
      z0: camera.zoom, z1: camera.zoom < 0.8 ? 1.2 : camera.zoom,
      t: 0, dur: Math.min(2.2, 0.4 + dist / 350),
    };
  }

  // 选中名册中的小人：相机飞过去 + 头顶对话框（修复：必须调用 showAgentPanel 移除 hidden）
  function focusAgent(a) {
    selectedAgent = a;
    sfx.play("click");
    const dist = Math.hypot(camera.x - a.x, camera.y - a.y);
    if (dist > 6) {
      camTween = {
        x0: camera.x, y0: camera.y, x1: a.x, y1: a.y,
        z0: camera.zoom, z1: Math.max(camera.zoom, 1.4), t: 0,
        dur: Math.min(1.6, 0.3 + dist / 400),
      };
    }
    showAgentPanel(a, 0, 0);   // 立即显示对话框（面板随后每帧跟随小人头顶）
    infoCd = 0;
  }

  function islandVisible(o) {
    const c = world.chunks.get(chunkKey(o.x >> 5, o.y >> 5));
    return !!(c && c.gen);
  }

  function updateRoster(dt) {
    rosterCd -= dt;
    if (rosterCd > 0) return;
    rosterCd = 0.6;

    const nameLine = a =>
      `<div class="roster-name${a === selectedAgent ? " selected" : ""}" data-id="${agents.indexOf(a)}">${a.name}<span class="nat">·${JOBS_CN[a.job] || ""}</span></div>`;
    const flyBtn = (x, y) => `<span class="fly-btn" data-fx="${x}" data-fy="${y}">⌖</span>`;

    let html = "";

    // ---- 地区段（唯一分组）：聚落（资源+居民）/ 未知岛屿 / 无归属居民 ----
    html += `<div class="roster-sec">地区</div>`;
    for (const s of world.settlements) {
      const stock = s.stock || { wood: 0, stone: 0, sand: 0 };
      const open = expandedGroups.has(s.name);
      html += `<div class="roster-group-head" data-g="${s.name}">` +
        `<span>${open ? "▾" : "▸"} ${s.name} <span class="lv">L${s.level}</span></span>${flyBtn(s.x, s.y)}</div>`;
      if (open) {
        const residents = agents.filter(a => a.home && settleOf(a.home.x, a.home.y) === s);
        html += `<div class="roster-names">` +
          `<div class="roster-res">木<b>${stock.wood}</b> 石<b>${stock.stone}</b> 沙<b>${stock.sand}</b> 粮<b>${Math.floor(world.food)}</b></div>` +
          (residents.length ? residents.map(nameLine).join("") : `<div class="roster-res">（尚无居民定居）</div>`) +
          `</div>`;
      }
    }
    const wild = world.islands.filter(o => !o.claimed && islandVisible(o));
    html += `<div class="roster-group-head" data-g="__wild"><span>${expandedGroups.has("__wild") ? "▾" : "▸"} 未知岛屿</span><span class="cnt">×${wild.length}</span></div>`;
    if (expandedGroups.has("__wild") && wild.length) {
      html += `<div class="roster-names">` + wild.map(o =>
        `<div class="roster-name" data-fly="1" data-fx="${o.x}" data-fy="${o.y}">${o.name ? o.name : "无名岛"} (${o.x},${o.y}) ${flyBtn(o.x, o.y)}</div>`
      ).join("") + `</div>`;
    }
    // 无归属居民组（无房者按身份分组）
    for (const key of ["无家可归", "原住民部落", "散居"]) {
      const list = agents.filter(a => {
        if (a.home) return false;
        if (key === "原住民部落") return a.native;
        if (key === "无家可归") return !a.native;
        return false;
      });
      if (!list.length) continue;
      const open = expandedGroups.has(key);
      html += `<div class="roster-group-head" data-g="${key}"><span>${open ? "▾" : "▸"} ${key}</span><span class="cnt">×${list.length}</span></div>`;
      if (open) html += `<div class="roster-names">` + list.map(a =>
        `<div class="roster-name${a === selectedAgent ? " selected" : ""}" data-id="${agents.indexOf(a)}">${a.name}<span class="nat">·${JOBS_CN[a.job] || ""}</span></div>`
      ).join("") + `</div>`;
    }
    rosterBody.innerHTML = html;
  }

  // ---- dev 热刷新：仅 http(s) 下生效，file:// 双击打开时静默跳过 ----
  if (location.protocol !== "file:") {
    let lastM = null;
    setInterval(async () => {
      try {
        const r = await fetch(location.href, { cache: "no-store" });
        const m = r.headers.get("last-modified");
        if (lastM && m && m !== lastM) location.reload();
        if (m) lastM = m;
      } catch (err) { /* 忽略 */ }
    }, 1500);
  }
})();
