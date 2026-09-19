"use strict";
// ============ 任务系统：建造 / 开荒 / 移山 / 填海 ============

let _taskId = 1;
let _lastPond = null;   // 最近挖的塘（池塘聚簇：下一个塘贴着它挖）
const tasks = {
  list: [],
};

const TASK_DEFAULT_NEED = { BUILD: 10, FARM: 9, GATHER: 4, HUNT: 6, PASTURE: 16, CAPTURE: 5, FISH: 5, PLANT: 4, QUARRY: 18, SANDPIT: 12, PLANT_BERRY: 5, BRIDGE: 3, FILL: 10, EXCAV: 8 };
// 工程资源消耗：架桥耗木材、造陆耗沙土（完工时从最近聚落库存扣除）
const TASK_RESOURCE_COST = { BRIDGE: { wood: 1 }, FILL: { sand: 1 } };

function tasksAdd(t) {
  t.id = _taskId++;
  t.progress = 0;
  t.need = t.need !== undefined ? t.need : (TASK_DEFAULT_NEED[t.type] || 0); // 兜底：漏设 need 的任务永不完工、占死名额
  t.born = world.time;   // 立项时间：任务老化防饥饿（越久越优先被领取）
  t.workers = new Set();
  if (t.type === "BUILD" || t.type === "FARM" || t.type === "PASTURE") setTile(t.x, t.y, T.SITE); // 立项即圈地
  tasks.list.push(t);
  return t;
}

function tasksPending(type, excludeFrozen) {
  return tasks.list.filter(t => (!type || t.type === type) && !t.done && (!excludeFrozen || (t.blockedCount || 0) < 3));
}

// 任务 → 职业偏好映射（DIG 按 res 区分伐木/采石；CAPTURE 鱼群归渔民、牲畜归猎人）
function taskJobPref(t) {
  switch (t.type) {
    case "FARM": return "FARM";
    case "BUILD": case "PASTURE": case "PLANT": case "PLANT_BERRY": case "QUARRY": case "SANDPIT": case "EXCAV": return "BUILD";
    case "CAPTURE": return t.creature && t.creature.type === "fish" ? "FISH" : "HUNT";
    case "HUNT": return "HUNT";
    case "FISH": return "FISH";
    case "DIG": return t.res === "stone" ? "DIG_STONE" : "DIG_WOOD";
    default: return null;
  }
}

// 小人领取任务：职业匹配者优先（不锁死，防止没人干导致停摆）；
// 工程任务资源不足时跳过（小人转去做资源采集，不空转）；
// 先做"够得着"的（blockedCount 低者优先），再按距离取最近
function tasksTake(agent) {
  const ax = agent.x | 0, ay = agent.y | 0;
  const myJob = JOBS[agent.job] ? JOBS[agent.job].task : null;
  let best = null, bestScore = Infinity;
  for (const t of tasks.list) {
    if (t.done) continue;
    if ((t.blockedCount || 0) >= 3) continue;
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const lack = Object.keys(cost).some(k => jointStock(k) < cost[k]);
      if (lack) continue;   // 库存不够一格的 → 不领
    }
    const cap = t.type === "BUILD" || t.type === "FARM" ? 2 : 4;
    if (t.workers.size >= cap) continue;
    const d = Math.abs(t.x - ax) + Math.abs(t.y - ay);
    const jobMatch = myJob && taskJobPref(t) === myJob ? 1 : 0;
    const age = world.time - (t.born || world.time);   // 任务老化：立项越久越优先，远任务不饿死
    // 资源危机升权：联合木材枯竭时伐木任务急速提级（否则桥/船工程全饿死）
    const crisis = (t.type === "DIG" && t.res === "wood") ? Math.max(0, 8 - jointStock("wood")) * 200 : 0;
    // 走廊桥是国家工程（两岛间唯一通路），优先级高于日常任务
    const natl = t.type === "BRIDGE" && t.corridor ? 1500 : 0;
    const score = (t.blockedCount || 0) * 100000 + d * 10 - jobMatch * 5000 - age * 3 - crisis - natl;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function tasksRelease(t, agent) {
  if (t) t.workers.delete(agent);
}

function tasksFinish(t, agent, was) {
  t.done = true;
  // 同任务的其他工人：引用清空 + 状态复位（否则他们对已完成任务继续施工——卡死/重复结算）
  for (const w of t.workers) {
    if (w.task === t) { w.task = null; w.onArrive = null; }
    if (w.state === "work") w.state = "idle";
  }
  t.workers.clear();
  const i = tasks.list.indexOf(t);
  if (i >= 0) tasks.list.splice(i, 1);

  // 改造完成会改变通行性，解锁附近被冻结的任务
  for (const k of tasks.list) {
    if (Math.abs(k.x - t.x) + Math.abs(k.y - t.y) < 30) k.blockedCount = 0;
  }

  switch (t.type) {
    case "BUILD": {
      setTile(t.x, t.y, T.HOUSE);
      // 楼层：文明时代的高楼社区任务指定 3 层；城镇辖区 2 层小楼；其余平房
      const s = world.settlements.find(k => Math.abs(k.x - t.x) + Math.abs(k.y - t.y) <= SIM.SETTLEMENT_RADIUS);
      const floors = t.floors || (s ? (s.level >= 3 ? 3 : s.level >= 2 ? 2 : 1) : 1);
      world.houses.push({ x: t.x, y: t.y, floors });
      logMsg(`新居落成（${world.houses.length} 座房屋）。`);
      emit("build-done");
      break;
    }
    case "FARM": {
      setTile(t.x, t.y, T.FARM);
      world.farms.push({ x: t.x, y: t.y, grow: randRange(0, SIM.FARM_MATURITY * 0.5) });
      logMsg(`开垦新农田（共 ${world.farms.length} 块）。`);
      emit("farm-done");
      break;
    }
    case "DIG": {
      setTile(t.x, t.y, T.GRASS);
      // 产出由工人搬运回仓：伐木得木材、采石得石材（was 由 workTile 传入——完工后 tile 已改写，不能重读）
      if (was === T.TREE) return { res: "wood", amount: 6 };
      if (was === T.MOUNTAIN) return { res: "stone", amount: 7 };
      break;
    }
    case "FILL": {
      const s = nearestSettlement(t.x, t.y);
      if (s) ensureStock(s).sand += 2;   // 挖海泥回填，就地结算
      setTile(t.x, t.y, T.SAND);
      // 该格原有鱼群被填：移除鱼群实体与库存
      const fk = t.x + "," + t.y;
      if (world.fishStock.has(fk)) {
        world.fishStock.delete(fk);
        for (let i = creatures.length - 1; i >= 0; i--) {
          const c = creatures[i];
          if (c.type === "fish" && Math.hypot(c.x - t.x - 0.5, c.y - t.y - 0.5) < 1.5) creatures.splice(i, 1);
        }
      }
      break;
    }
    case "BRIDGE": {
      setTile(t.x, t.y, T.BRIDGE);
      logThrottled("工匠们在海峡上架起了木桥。", 30);
      // 链式生长：沿 corridor 方向续立下一格（remain 递减到 0 停——桥不无限穿海）
      if (t.corridor && t.corridor.remain > 0) {
        const nx3 = t.x + t.corridor.dx, ny3 = t.y + t.corridor.dy;
        const tt = tileAt(nx3, ny3);
        if ((tt === T.WATER || tt === T.DEEP) &&
            !tasks.list.some(k => !k.done && k.x === nx3 && k.y === ny3)) {
          tasksAdd({ type: "BRIDGE", x: nx3, y: ny3,
            corridor: { dx: t.corridor.dx, dy: t.corridor.dy, remain: t.corridor.remain - 1 } });
        }
      }
      break;
    }
    case "PLANT": {
      setTile(t.x, t.y, T.TREE);   // 种树：木材可持续再生
      logThrottled("居民种下了新的树苗，森林会慢慢长回来。", 30);
      break;
    }
    case "PLANT_BERRY": {
      // 种浆果：从现有丛采种培育新丛（果量 1 份起步，随时间再生到 3）
      setTile(t.x, t.y, T.BERRY);
      world.berryStock.set(t.x + "," + t.y, 1);
      logThrottled("居民培育了新的浆果丛，来年就有源源不断的果子。", 30);
      break;
    }
    case "FISH": {
      if (catchFish(t.fishX, t.fishY)) return { res: "food", amount: 4 };
      break;
    }
    case "GATHER": {
      // 采集：浆果/果树 → 粮；沙滩 → 沙土（产出由工人搬运回仓）
      if (t.res === "sand") return { res: "sand", amount: 3 };
      if (gatherBerry(t.x, t.y)) return { res: "food", amount: SIM.GATHER_YIELD };
      break;
    }
    case "HUNT": {
      // 狩猎：猎物从世界移除，肉由猎手搬运回仓；同时撤销绑同一猎物的捕获任务
      const c = t.creature;
      if (c && !c.dead) {
        c.dead = true;
        for (let i = tasks.list.length - 1; i >= 0; i--) {
          const k = tasks.list[i];
          if (k !== t && k.creature === c && !k.done) {
            for (const w of k.workers) { if (w.task === k) { w.task = null; if (w.state === "walk" || w.state === "work") w.state = "idle"; } }
            tasks.list.splice(i, 1);
          }
        }
        return { res: "food", amount: huntReward(c) };
      }
      break;
    }
    case "PASTURE": {
      setTile(t.x, t.y, T.PASTURE);
      // 自动圈地：牧场四周立起围栏，圈养的牲畜从此只能在栏内活动
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const tt = tileAt(t.x + dx, t.y + dy);
          if (tt === T.GRASS || tt === T.SAND) setTile(t.x + dx, t.y + dy, T.FENCE);
        }
      }
      world.pastures.push({ x: t.x, y: t.y });
      logMsg(`新的牧场建成了，围栏圈地，圈养的牲畜将定期供给奶食。`);
      break;
    }
    case "QUARRY": {
      setTile(t.x, t.y, T.QUARRY);
      world.quarries.push({ x: t.x, y: t.y });
      logMsg(`采石场在洞穴旁建成，石材将源源不断。`);
      break;
    }
    case "SANDPIT": {
      setTile(t.x, t.y, T.SANDPIT);
      world.sandpits.push({ x: t.x, y: t.y });
      logMsg(`河滩沙场开工，沙土供给稳定了。`);
      break;
    }
    case "DOCK": {
      setTile(t.x, t.y, T.DOCK);
      world.docks.push({ x: t.x, y: t.y });
      logMsg(`码头建成，航海家们开始筹划远航。`);
      break;
    }
    case "EXCAV": {
      // 挖塘：陆格挖成水（灌溉/养鱼的人工水域，显示为池塘）
      setTile(t.x, t.y, T.WATER);
      world.ponds.add(t.x + "," + t.y);
      _lastPond = { x: t.x, y: t.y };   // 连击记忆：下一个塘默认贴着这个挖
      logThrottled("居民挖出了新的水塘，水波在塘里荡开。", 30);
      break;
    }
    case "CAPTURE": {
      // 捕获：把野生牲畜安置进牧场；鱼群圈进水域渔场（t.dest 指定时运往该处圈养，否则原地）
      const c = t.creature;
      if (c && !c.dead && c.isWild()) {
        const dest = t.dest || t.pasture;
        c.pasture = { x: dest.x, y: dest.y };
        c.x = dest.x + 0.5; c.y = dest.y + 0.5;
        if (c.type === "fish") {
          world.fishStock.delete(dest.x + "," + dest.y);   // 圈养后走渔场产出，不再作野生钓点
          world.fishStock.delete(t.pasture.x + "," + t.pasture.y);
          logThrottled(t.dest ? "渔人把鱼苗挑到了新挖的水塘里放养。" : "渔人把鱼群圈进了水上渔场，渔场将定期供给鲜鱼。", 25);
        } else {
          logThrottled("牧民把新的牲畜赶进了牧场。", 25);
        }
      }
      break;
    }
  }
}
