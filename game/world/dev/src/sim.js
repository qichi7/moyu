"use strict";
// ============ 模拟调度：出生 / 规划器（需求聚合） / 主更新 ============

const agents = [];

function spawnAgent(x, y, native, opts) {
  const a = new Agent(x, y, native, opts);
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
  for (const f of world.farms) {
    if (f.crop === "coffee") continue;   // 咖啡田不产粮：不算进食点
    consider(f.x, f.y);
  }
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

// 新式设施（水井/酒坊/压榨坊/烘焙坊）立项时一律立在各城粮仓周边（半径 ≤8 格），
// 因此检索不必扫全图：遍历粮仓、扫其 9 格邻域即可覆盖全域（世界对象不设 wells/breweries 平行数组，tile 即真相）
function facilityNear(cx, cy, type) {
  for (let dy = -9; dy <= 9; dy++)
    for (let dx = -9; dx <= 9; dx++)
      if (tileAt(cx + dx, cy + dy) === type) return { x: cx + dx, y: cy + dy };
  return null;
}
// 全域第一座指定设施（逐粮仓扫描，找到即早退）
function findFacility(type) {
  for (const h of world.houses) {
    if (!h.granary) continue;
    const p = facilityNear(h.x, h.y, type);
    if (p) return p;
  }
  return null;
}
// 指定聚落辖区内的设施（按粮仓归属聚落过滤）
function settlementFacility(s, type) {
  for (const h of world.houses) {
    if (!h.granary || ownerSettle(h.x, h.y) !== s) continue;
    const p = facilityNear(h.x, h.y, type);
    if (p) return p;
  }
  return null;
}
// 饮品链库存全域汇总（water/juice/beer/coffee/beans：逐城 ensureStock 兜底后求和，世界不设全局池）
function totalStockOf(res) {
  return world.settlements.reduce((sum, s) => sum + (ensureStock(s)[res] || 0), 0);
}

function plannerTick() {
  const pop = agents.length;
  const homeless = agents.filter(a => !a.home).length;
  // 产粮田数：咖啡田（crop==="coffee"）不产粮，排除出粮食产能口径；边界与阈值系数保持原样
  const foodFarms = world.farms.filter(f => !f.crop).length;

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
          (c && findSpot(Math.floor(c.x), Math.floor(c.y), 2, 14, T.GRASS)) ||
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
  if (foodFarms * 6 < pop + 8 && tasksPending("FARM", true).length < 2) {
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
  // 2f. 饮品链（时代解锁）：水井/打水 era≥1，酒坊/压榨坊 era≥2，烘焙坊/咖啡田 era≥3。
  //     新式建筑各城限 1 座（先建人口最多的城），立项前查全域 tile + pending 防重；
  //     触发阈值全部是库存/数量的确定性条件，不引入新的概率门（随机流保持原样）
  if (world.era >= 1 && pop >= 8) {
    // 人口最多的聚落（平局取先出现者，确定性）及其粮仓锚点：新式建筑一律立粮仓周边草地
    let metro = null, metroPop = -1;
    for (const s of world.settlements) {
      const n = agents.filter(a => !a.dead && ownerSettle(a.x, a.y) === s).length;
      if (n > metroPop) { metroPop = n; metro = s; }
    }
    if (metro) {
      const g = world.houses.find(h => h.granary && ownerSettle(h.x, h.y) === metro) || metro;
      // 水井：全域唯一，打水解渴的源头（pop≥8 才立项，小聚落就近吃塘水/雨水）
      if (!findFacility(T.WELL) && tasksPending("WELL", true).length < 1) {
        const spot = expandSpot(g, 1, 6, T.GRASS) || findSpot(g.x, g.y, 1, 8, T.GRASS);
        if (spot) {
          tasksAdd({ type: "WELL", x: spot.x, y: spot.y });
          logThrottled(`规划署在「${metro.name}」的粮仓旁打了一口水井。`, 20);
        }
      }
      // 酒坊（城邦解锁）
      if (world.era >= 2 && !findFacility(T.BREWERY) && tasksPending("BREWERY", true).length < 1) {
        const spot = expandSpot(g, 1, 6, T.GRASS) || findSpot(g.x, g.y, 1, 8, T.GRASS);
        if (spot) {
          tasksAdd({ type: "BREWERY", x: spot.x, y: spot.y });
          logThrottled(`规划署在「${metro.name}」的粮仓旁筹建酒坊。`, 20);
        }
      }
      // 压榨坊（城邦解锁）
      if (world.era >= 2 && !findFacility(T.PRESS) && tasksPending("PRESS", true).length < 1) {
        const spot = expandSpot(g, 1, 6, T.GRASS) || findSpot(g.x, g.y, 1, 8, T.GRASS);
        if (spot) {
          tasksAdd({ type: "PRESS", x: spot.x, y: spot.y });
          logThrottled(`规划署在「${metro.name}」的粮仓旁筹建压榨坊。`, 20);
        }
      }
      // 烘焙坊（文明解锁）
      if (world.era >= 3 && !findFacility(T.ROASTERY) && tasksPending("ROASTERY", true).length < 1) {
        const spot = expandSpot(g, 1, 6, T.GRASS) || findSpot(g.x, g.y, 1, 8, T.GRASS);
        if (spot) {
          tasksAdd({ type: "ROASTERY", x: spot.x, y: spot.y });
          logThrottled(`规划署在「${metro.name}」的粮仓旁筹建烘焙坊。`, 20);
        }
      }
    }
  }
  // 打水：全域存水低于人口底线（pop×0.4）→ 在存水最少的有井之城立项（无井则跳过，靠上面先建井）
  if (world.era >= 1 && totalStockOf("water") < pop * 0.4 && tasksPending("FETCH_WATER", true).length < 2) {
    let city = null, well = null, least = 1e9;
    for (const s of world.settlements) {
      const w = settlementFacility(s, T.WELL);
      if (!w) continue;
      const sw = ensureStock(s).water || 0;
      if (sw < least) { least = sw; city = s; well = w; }
    }
    if (well) {
      const shore = neighborsOf(well.x, well.y).find(p => walkable(p.x, p.y));
      if (shore) {
        tasksAdd({ type: "FETCH_WATER", x: shore.x, y: shore.y });
        logThrottled(`「${city.name}」的水缸见底了，居民挑起水桶去井边打水。`, 20);
      }
    }
  }
  // 酿酒：粮食富余（与丰收宴席同一条富余线，先吃饱再酿酒）且有酒坊 → 酿一桶麦酒
  if (world.era >= 2 && totalFood() > 60 + pop * 5 && totalStockOf("beer") < pop / 12 &&
      tasksPending("BREW_BEER", true).length < 1) {
    const br = findFacility(T.BREWERY);
    const spot = br && neighborsOf(br.x, br.y).find(p => walkable(p.x, p.y));
    if (spot) {
      tasksAdd({ type: "BREW_BEER", x: spot.x, y: spot.y });
      logThrottled("酒坊飘出麦香，一桶新酒正在酝酿。", 20);
    }
  }
  // 榨汁：有压榨坊且果汁不足（原料成本检查在 tasksTake，规划只看结果库存）
  if (world.era >= 2 && totalStockOf("juice") < pop / 12 && tasksPending("PRESS_JUICE", true).length < 1) {
    const pr = findFacility(T.PRESS);
    const spot = pr && neighborsOf(pr.x, pr.y).find(p => walkable(p.x, p.y));
    if (spot) {
      tasksAdd({ type: "PRESS_JUICE", x: spot.x, y: spot.y });
      logThrottled("压榨坊开工，鲜果正在榨汁入桶。", 20);
    }
  }
  // 烘咖啡：烘焙坊在、咖啡豆够烘一炉（全域 ≥2）且咖啡存量不足
  if (world.era >= 3 && totalStockOf("beans") >= 2 && totalStockOf("coffee") < pop / 15 &&
      tasksPending("BREW_COFFEE", true).length < 1) {
    const ro = findFacility(T.ROASTERY);
    const spot = ro && neighborsOf(ro.x, ro.y).find(p => walkable(p.x, p.y));
    if (spot) {
      tasksAdd({ type: "BREW_COFFEE", x: spot.x, y: spot.y });
      logThrottled("烘焙坊里咖啡豆噼啪作响，浓香飘满了小世界。", 20);
    }
  }
  // 咖啡田扩种：文明时代咖啡田不足（人口/20）→ 近水草地新垦（选址同开荒：农业分区聚簇 → 锚点兜底）
  if (world.era >= 3) {
    const coffeeFarms = world.farms.filter(f => f.crop === "coffee").length;
    if (coffeeFarms < pop / 20 && !tasksPending("FARM", true).some(t => t.crop === "coffee")) {
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
        const a = pickAnchor();
        const ref = nearestOf(localFacilities(world.farms, nearestSettlement(a.x, a.y)), a);
        s = (ref && expandSpot(ref, 1, 6, T.GRASS)) ||
            findSpot(a.x, a.y, 4, 18, T.GRASS, [T.HOUSE, T.SITE]);
      }
      // 咖啡田同样要灌溉：选址 5 格内无水则本轮放弃（不为咖啡挖塘，水源优先保粮食田）
      if (s && nearAny(s.x, s.y, [T.WATER, T.DEEP], 5)) {
        tasksAdd({ type: "FARM", x: s.x, y: s.y, need: 9, crop: "coffee" });
        logThrottled("规划署批准开垦一片咖啡田，异域的香气将在这里生根。", 20);
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
      const front = findFrontier(Math.floor(e.home.x), Math.floor(e.home.y), 60);
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
  // 出生线（死锁 #4/#10 的含等号边界）：产粮田×5 >= 人口+4；coffee 田不产粮不计入，只做排除、边界语义不变
  if (pop > 0 && totalFood() > 40 && foodFarms * 5 >= pop + 4 && hasRoom && rand() < SIM.BIRTH_CHECK * SIM.PLANNER_INTERVAL) {
    // 亲子：出生序号确定性选亲（hash2 不消耗 rand 流，保证固定种子回归与旧版逐位一致）
    const seq = (world.birthSeq = (world.birthSeq || 0) + 1);
    const mothers = agents.filter(a => !a.dead && a.sex === "f" && a.age >= 16 && a.age <= 45);   // 育龄母池（0 岁新生儿天然不在内）
    const mother = mothers.length ? mothers[(hash2(seq, 7717) * mothers.length) | 0] : null;
    let father = null;
    const adultM = agents.filter(a => !a.dead && a.sex === "m" && a.age >= 16);
    if (mother && adultM.length) {
      // 父亲选取：同屋优先 → 同聚落次之 → 全体成年男兜底（home 按坐标比较：各人 home 是独立对象，引用永不相同）
      const sameHouse = mother.home ? adultM.filter(a => a.home &&
          a.home.x === mother.home.x && a.home.y === mother.home.y) : [];
      const nearHome = sameHouse.length ? sameHouse
        : mother.home ? adultM.filter(a => a.home &&
            Math.abs(a.home.x - mother.home.x) + Math.abs(a.home.y - mother.home.y) <= SIM.SETTLEMENT_RADIUS) : [];
      const pool = nearHome.length ? nearHome : adultM;
      father = pool[(hash2(seq, 8819) * pool.length) | 0];
    }
    // 姓：50/50 随父姓或母姓（直接继承姓氏字段，支持复姓）；单亲随在世一方；双缺 null → 构造函数回退随机姓
    const sn = father && mother ? (hash2(seq, 9283) < 0.5 ? father.surname : mother.surname)
      : mother ? mother.surname : father ? father.surname : null;
    // 出生点：生在母亲家旁（母亲无房或选址失败 → 走原兜底），选址计算在选亲之后
    let near = null;
    if (mother && mother.home) near = findSpot(mother.home.x, mother.home.y, 1, 4, T.GRASS);   // 生在母亲家旁
    if (!near) near = findBirthSpot();
    const birthCity = near && ownerSettle(near.x, near.y);
    if (near && birthCity && ensureStock(birthCity).food < 12) { /* 出生城市存粮不足：暂缓生育 */ }
    else if (near) {
      const baby = spawnAgent(near.x, near.y, false, { surname: sn, father: father && father.name, mother: mother && mother.name });
      baby.age = 0;   // 新生儿从 0 岁长大（1 游戏年 = 1 岁）
      logThrottled(`新生命降临${mother ? `（${mother.name}${father ? " 与 " + father.name + " 之家" : "家"}）` : ""}，人口达到 ${pop + 1}。`, 8);
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

    // 新式饮品建筑与建房同款：累计冻结 180s 仍无法施工 → 放弃恢复草地，释放名额（防堵死饮品链）
    if (t.freezeAge >= 180 && (t.type === "BUILD" || t.type === "FARM" || t.type === "FILL" ||
        t.type === "WELL" || t.type === "BREWERY" || t.type === "PRESS" || t.type === "ROASTERY")) {
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
    // 咖啡田走独立成熟周期与产出：产咖啡豆（不产粮，不进粮食产能口径）
    if (f.grow >= (f.crop === "coffee" ? SIM.COFFEE_MATURITY : SIM.FARM_MATURITY)) {
      f.grow = 0;
      const st = ownerSettle(f.x, f.y);
      if (st) {
        if (f.crop === "coffee") ensureStock(st).beans += SIM.COFFEE_YIELD;   // 咖啡豆进所属城市库存
        else ensureStock(st).food += SIM.FARM_YIELD;   // 粮食进所属城市库存
      }
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
                 tasksPending("PLANT_BERRY", true).length +
                 tasksPending("WELL", true).length + tasksPending("BREWERY", true).length +
                 tasksPending("PRESS", true).length + tasksPending("ROASTERY", true).length,
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
