"use strict";
// ============ 模拟调度：出生 / 规划器（需求聚合） / 主更新 ============

const agents = [];

function spawnAgent(x, y, native) {
  const a = new Agent(x, y, native);
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
  for (const f of world.farms) consider(f.x, f.y);
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
function plannerTick() {
  const pop = agents.length;
  const homeless = agents.filter(a => !a.home).length;

  // 1. 住房前瞻：容量余量不足（或已有人无家）→ 建房；选址失败说明本区
  //    已无立足之地 → 直接开辟新区。房屋富余（够住且多 3 间以上）则不新建
  //    闸门只统计"还在正常推进"的任务，冻结任务不算数，防止堵死建房通道；
  //    无家者超过 6 人时无视账面容量富余，强制补建（孤立地段的房不算有效容量）
  const capacity = world.houses.length * 3;
  if ((homeless > 6 || capacity - pop <= 2) && capacity <= pop + 8 && tasksPending("BUILD", true).length < 3) {
    // 锚点优先：城邦时代后有居住区划的聚落 → 居住区；再无家者重心；再粮仓锚点
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "housing");
      if (z) { s = findSpot(z.x, z.y, 0, z.r, T.GRASS); if (s) break; }
    }
    if (!s) {
      const c = centroidOf(agents.filter(a => !a.home));
      s = c && findSpot(c.x | 0, c.y | 0, 2, 14, T.GRASS);
    }
    if (!s) {
      const a = pickAnchor();
      s = findSpot(a.x, a.y, 3, 18, T.GRASS);
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
  if (world.farms.length * 6 < pop + 8 && tasksPending("FARM", true).length < 2) {
    let s = null;
    for (const st of world.settlements) {
      if (!st.zones) continue;
      const z = st.zones.find(z => z.type === "farm");
      if (z) { s = findSpot(z.x, z.y, 0, z.r, T.GRASS, [T.HOUSE, T.SITE]); if (s) break; }
    }
    if (!s) {
      const starving = agents.filter(a => a.hunger < 40);
      const c = starving.length >= 3 ? centroidOf(starving) : null;
      s = c && findSpot(c.x | 0, c.y | 0, 3, 16, T.GRASS, [T.HOUSE, T.SITE]);
    }
    if (!s) {
      const a = pickAnchor();
      s = findSpot(a.x, a.y, 4, 26, T.GRASS, [T.HOUSE, T.SITE]);
    }
    if (s) {
      tasksAdd({ type: "FARM", x: s.x, y: s.y, need: 9 });
      logThrottled(`规划署：粮食储备吃紧（${Math.floor(world.food)}），批准开垦 (${s.x},${s.y})。`, 10);
    }
  }
  // 2b. 采集：附近有果量充足的浆果丛/果树 → 采集队
  if (world.food < 60 + pop * 3 && tasksPending("GATHER", true).length < 2) {
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
  if (world.food < 60 + pop * 3 && tasksPending("HUNT", true).length < 1) {
    const a = pickAnchor();
    const wild = creatures.filter(c => c.isWild() && !c.dead &&
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
  // 2e. 资源采集：各聚落木材/石材/沙土低于阈值 → 立项伐木/采石/采沙/植树
  for (const s of world.settlements) {
    const stock = ensureStock(s);
    const digPending = type => tasksPending("DIG", true).filter(t => t.res === type).length;
    if (stock.wood < 10 && digPending("wood") < 6) {
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
  if (world.food < 60 + pop * 3 && tasksPending("FISH", true).length < 2) {
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

  // 3. 饥荒告警（一天最多提醒一次，避免刷屏）
  const days = world.food / Math.max(1, pop * 0.9);
  if (days < 1 && pop > 0) { logThrottled(`饥荒告警：存粮仅够 ${days.toFixed(1)} 天！`, SIM.DAY_LEN); emit("famine"); }

  // 4. 人口自然增长：由农田承载余量驱动（田先于人到位），饥荒期停止生育
  //    出生安全垫随人口放大（food > 100 + 人口×4），防止出生率超过承载力引发饿死潮
  //    BIRTH_CHECK 是每秒概率，规划器每 PLANNER_INTERVAL 秒才判一次，需换算成窗口概率
  const hasRoom = world.houses.length * 3 > pop;
  if (pop > 0 && world.food > 40 && world.farms.length * 5 >= pop + 4 && hasRoom && rand() < SIM.BIRTH_CHECK * SIM.PLANNER_INTERVAL) {
    const near = findBirthSpot();
    if (near) {
      const baby = spawnAgent(near.x, near.y);
      baby.age = 0;   // 新生儿从 0 岁长大（1 游戏年 = 1 岁）
      logThrottled(`新生命降临，人口达到 ${pop + 1}。`, 8);
      emit("birth");
    }
  }

  // 5. 疆土随人口生长：每增长约 25 人，规划署主动开辟一片新疆土（无人口上限）
  if (pop >= (world.expansions + 1) * 25) {
    expand();
  }

  // 6. 冻结任务自愈：冻结超 60 秒的工程，自动把周围 2 格同类障碍补成立项，
  //    相当于推进前沿自动横向扩宽，避免被凹形海岸卡死。
  //    建造类任务累计冻结 180 秒仍无法施工 → 放弃，退地恢复草地，释放名额
  for (let i = tasks.list.length - 1; i >= 0; i--) {
    const t = tasks.list[i];
    if ((t.blockedCount || 0) < 3) continue;
    t.freezeAge = (t.freezeAge || 0) + SIM.PLANNER_INTERVAL;

    if (t.freezeAge >= 180 && (t.type === "BUILD" || t.type === "FARM")) {
      setTile(t.x, t.y, T.GRASS);
      tasks.list.splice(i, 1);
      logThrottled("规划署放弃了一处无法施工的地块。", 60);
      continue;
    }
    if (t.freezeAge < 60) continue;
    t.freezeAge = 0;
    t.blockedCount = 0;
    for (let dy2 = -2; dy2 <= 2; dy2++) {
      for (let dx2 = -2; dx2 <= 2; dx2++) {
        const nx2 = t.x + dx2, ny2 = t.y + dy2;
        const meta2 = TILE_META[tileAt(nx2, ny2)];
        if ((meta2.diggable || meta2.fillable) && !tasks.list.some(k => !k.done && k.x === nx2 && k.y === ny2)) {
          tasksAdd({ type: meta2.diggable ? "DIG" : "FILL", x: nx2, y: ny2 });
        }
      }
    }
  }

  // 7. 丰收宴席：存粮远超需求时全城共食（每 3 天最多一次），富余粮食有了出口
  if (pop > 0 && world.food > 60 + pop * 5 && world.time - _lastFeast > SIM.DAY_LEN * 3) {
    world.food -= 40 + pop;
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

// ---- 农田生长 ----
function farmTick(dt) {
  for (const f of world.farms) {
    f.grow += dt;
    if (f.grow >= SIM.FARM_MATURITY) {
      f.grow = 0;
      world.food += SIM.FARM_YIELD;
      f.flash = 0.6; // 成熟闪光（渲染用）
    }
    if (f.flash > 0) f.flash -= dt;
  }
}

// ---- 模拟主步进 ----
let _plannerCd = SIM.PLANNER_INTERVAL;
let _lastFeast = -999;

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
  quarryTick();

  _plannerCd -= dt;
  if (_plannerCd <= 0) { _plannerCd = SIM.PLANNER_INTERVAL; plannerTick(); }
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
