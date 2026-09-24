"use strict";
// ============ 任务系统：建造 / 开荒 / 移山 / 填海 ============

let _taskId = 1;
let _lastPond = null;   // 最近挖的塘（池塘聚簇：下一个塘贴着它挖）
const tasks = {
  list: [],
};

const TASK_DEFAULT_NEED = { BUILD: 10, FARM: 9, GATHER: 4, HUNT: 6, PASTURE: 16, CAPTURE: 5, FISH: 5, PLANT: 4, QUARRY: 18, SANDPIT: 12, PLANT_BERRY: 5, BRIDGE: 3, FILL: 10, EXCAV: 8,
  WELL: 12, BREWERY: 18, PRESS: 14, ROASTERY: 16, FETCH_WATER: 4, PRESS_JUICE: 6, BREW_BEER: 8, BREW_COFFEE: 7,
  GAZEBO: 8, THEATER: 14, ARENA: 16, PARK: 30, FERRIS: 24, CAROUSEL: 16, COASTER: 20 };
// 工程资源消耗：架桥耗木材、造陆耗沙土（联合库存结算，doWork 挂起 + tasksTake 跳过双处生效）；
// 制作型任务耗水/粮/豆（非联合库存：完工时从所属城市库存扣除，tasksTake 领取时同步过滤——不足跳过省工）
const TASK_RESOURCE_COST = { BRIDGE: { wood: 1 }, FILL: { sand: 1 },
  PRESS_JUICE: { water: 1, food: 2 }, BREW_BEER: { water: 1, food: 3 }, BREW_COFFEE: { water: 1, beans: 2 } };

function tasksAdd(t) {
  t.id = _taskId++;
  t.progress = 0;
  t.need = t.need !== undefined ? t.need : (TASK_DEFAULT_NEED[t.type] || 0); // 兜底：漏设 need 的任务永不完工、占死名额
  t.born = world.time;   // 立项时间：任务老化防饥饿（越久越优先被领取）
  t.workers = new Set();
  if (t.type === "BUILD" || t.type === "FARM" || t.type === "PASTURE" ||
      t.type === "WELL" || t.type === "BREWERY" || t.type === "PRESS" || t.type === "ROASTERY") setTile(t.x, t.y, T.SITE); // 立项即圈地（建筑类沿用 PASTURE 先例）
  // PARK 圈地（v0.5.0）：整个 bounding 铺 SITE 为工地；水面格登记进 waterCells（完工转浮台）
  if (t.type === "PARK") {
    t.waterCells = [];
    for (let y = t.y0; y <= t.y1; y++) for (let x = t.x0; x <= t.x1; x++) {
      const tt = tileAt(x, y);
      if (tt === T.WATER || tt === T.DEEP) t.waterCells.push(x + "," + y);
      setTile(x, y, T.SITE);
    }
  }
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
    case "BUILD": case "PASTURE": case "PLANT": case "PLANT_BERRY": case "QUARRY": case "SANDPIT": case "EXCAV":
    case "WELL": case "BREWERY": case "PRESS": case "ROASTERY":
    case "GAZEBO": case "THEATER": case "ARENA": case "PARK": case "FERRIS": case "CAROUSEL": case "COASTER": return "BUILD";
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
  const ax = Math.floor(agent.x), ay = Math.floor(agent.y);   // floor：负坐标段 |0 向零截断会错一行
  const myJob = JOBS[agent.job] ? JOBS[agent.job].task : null;
  let best = null, bestScore = Infinity;
  for (const t of tasks.list) {
    if (t.done) continue;
    if ((t.blockedCount || 0) >= 3) continue;
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const lack = Object.keys(cost).some(k => jointStock(k) < cost[k]);
      if (lack) continue;   // 库存不够一格的 → 不领
    } else if (t.type === "PRESS_JUICE" || t.type === "BREW_BEER" || t.type === "BREW_COFFEE") {
      // 制作型任务：原料在所属城市库存（非联合库存），不足则跳过领取（领了也得挂起，提前跳过省工）
      const s = ownerSettle(t.x, t.y) || nearestSettlement(t.x, t.y);
      const cost = TASK_RESOURCE_COST[t.type];
      const lack = !s || Object.keys(cost).some(k => (ensureStock(s)[k] || 0) < cost[k]);
      if (lack) continue;
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
    // 渴者优先派打水：打水终点就是水井边（顺路自饮），否则渴着的人与打水任务互相错过——
    // 行程门拦着渴人不接活、接活的人又不渴，城库水永远攒不起来（30 格内才导流，远途先喝）
    const thirstFetch = agent.thirst < 35 && t.type === "FETCH_WATER" && d <= 30 ? -800 : 0;
    const score = (t.blockedCount || 0) * 100000 + d * 10 - jobMatch * 5000 - age * 3 - crisis - natl + thirstFetch;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  if (best) grantTaskTool(best, agent);   // 成功领取 → 首次执行对应工作自动领取工具（v0.4.0）
  return best;
}

// ---- 背包工具（v0.4.0 冻结契约）----// 任务 → 对应工具：FISH→钓竿、DIG 伐木→斧头、DIG 其他（采石等）→镐、FARM→锄头、
// BUILD 及建造类（含 BRIDGE/FILL/DOCK 等工程）→锤子。DIG 的伐木判定与 taskJobPref 同口径
// （res==="stone" 为采石，其余含缺省视为伐木——走廊/扩区随手立项的 DIG 不带 res，多为清树）
function taskToolOf(t) {
  switch (t.type) {
    case "FISH": return "rod";
    case "FARM": return "hoe";
    case "DIG": return t.res === "stone" ? "pick" : "axe";
    case "BUILD": case "PASTURE": case "PLANT": case "PLANT_BERRY": case "QUARRY": case "SANDPIT":
    case "EXCAV": case "WELL": case "BREWERY": case "PRESS": case "ROASTERY":
    case "GAZEBO": case "THEATER": case "ARENA": case "PARK": case "FERRIS": case "CAROUSEL": case "COASTER":
    case "BRIDGE": case "FILL": case "DOCK": return "hammer";
    default: return null;   // HUNT/GATHER/CAPTURE/FETCH_WATER 等徒手活不发工具
  }
}

const _TOOL_NAMES = { rod: "钓竿", axe: "斧头", pick: "镐头", hoe: "锄头", hammer: "锤子" };

// 搬运产出入包（冻结契约 v0.4.1）：资源（木/石/沙/粮/水）先进背包 haul 槽，回仓 deposit 再入库；
// 包满装不下的差额就地入库兜底（产出不蒸发）。返回实装入包数
function grantCarry(agent, res, amount) {
  const got = agent && agent.pack ? packAdd(agent.pack, res, amount, true) : 0;
  if (got < amount) {
    const s = ownerSettle(agent.x, agent.y) || nearestSettlement(agent.x, agent.y);
    if (s) ensureStock(s)[res] += (amount - got);
  }
  return got;
}

// 发放工具：永久持有无限耐久，重复领取不加（对应工作进度 ×1.2 的加成判定在 agent.doWork）。
// 钓竿是木作：扣联合木 1，库存不足也照发（工具是劳动资料，不该被库存卡死生产），只记不同日志
function grantTaskTool(t, agent) {
  const tool = taskToolOf(t);
  if (!tool) return;
  const p = agent.pack || (agent.pack = new Array(10).fill(null));
  if (packCount(p, tool) > 0) return;   // 已持有：永久工具不重复领取
  packAdd(p, tool, 1);                  // 入槽（非 haul；工具堆叠上限 ×1）
  if (tool === "rod") {
    const ok = jointStock("wood") >= 1;
    if (ok) jointConsume("wood", 1);
    logThrottled(`${agent.name} 从仓库取了一根钓竿${ok ? "" : "（联合木料不足，仍先行发放）"}。`, 30);
  } else {
    logThrottled(`${agent.name} 从仓库取了一把${_TOOL_NAMES[tool]}。`, 30);
  }
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
      // crop 透传（"coffee"|undefined，undefined=普通粮田——消费方须容错缺省）
      world.farms.push({ x: t.x, y: t.y, grow: randRange(0, SIM.FARM_MATURITY * 0.5), crop: t.crop });
      logMsg(`开垦新农田（共 ${world.farms.length} 块）。`);
      emit("farm-done");
      break;
    }
    case "DIG": {
      setTile(t.x, t.y, T.GRASS);
      // 产出由工人背包搬运回仓：伐木得木材、采石得石材（was 由 workTile 传入——完工后 tile 已改写，不能重读）
      if (was === T.TREE) { grantCarry(agent, "wood", 6); return null; }
      if (was === T.BAMBOO) { grantCarry(agent, "wood", 4); return null; }   // 竹林：快木材（工时短产出略薄）
      if (was === T.MOUNTAIN) { grantCarry(agent, "stone", 7); return null; }
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
          if (c.type === "fish" && Math.hypot(c.x - t.x - 0.5, c.y - t.y - 0.5) < 1.5) {
            // v0.6.17 接缝修复：填海拆鱼不再静默抹除——鱼会游走，附近有可栖息水格则疏散
            //（生态普查实测 era3 填海潮把繁衍池静默抽干至全灭，且不走 dead 流程无任何纪事）；
            // 无处可去（海湾被整体填平）才移除实体
            const refuge = findSpot(Math.round(c.x), Math.round(c.y), 2, 8, T.WATER);
            if (refuge) { c.x = refuge.x + 0.5; c.y = refuge.y + 0.5; }
            else creatures.splice(i, 1);
          }
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
      // 珍稀渔获（v0.5.0）：鱼点旁有 rare+fishJoy 物种 → 消耗一条，丰厚渔获 + 巨大喜悦 + 纪事
      let rare = null;
      for (const c of creatures) {
        const rm = CREATURE_META[c.type];
        if (!c.dead && rm.rare && rm.fishJoy &&
            Math.hypot(c.x - (t.fishX + 0.5), c.y - (t.fishY + 0.5)) < 1.5) { rare = c; break; }
      }
      if (rare && agent) {
        rare.dead = true;
        rare.deathReason = "被钓起";
        grantCarry(agent, "food", 8);
        agent.mood = Math.min(100, (agent.mood || 0) + CREATURE_META[rare.type].fishJoy);
        logMsg(`${agent.name} 钓到了珍稀的${CREATURE_META[rare.type].name}！这足以炫耀好些天。`);
        return null;
      }
      if (catchFish(t.fishX, t.fishY)) { grantCarry(agent, "food", 4); return null; }
      break;
    }
    case "GATHER": {
      // 采集：浆果/果树 → 粮；沙滩 → 沙土；蘑菇 → 一次性采粮（tile 变回草地，v0.5.0）
      if (t.res === "sand") { grantCarry(agent, "sand", 3); return null; }
      if (tileAt(t.x, t.y) === T.MUSHROOM) {
        setTile(t.x, t.y, T.GRASS);
        if (world.mushrooms) world.mushrooms.delete(t.x + "," + t.y);
        grantCarry(agent, "food", 2);
        return null;
      }
      if (gatherBerry(t.x, t.y)) { grantCarry(agent, "food", SIM.GATHER_YIELD); return null; }
      break;
    }
    case "HUNT": {
      // 狩猎：猎物从世界移除，肉由猎手背包搬运回仓；同时撤销绑同一猎物的捕获任务
      const c = t.creature;
      if (c && !c.dead) {
        c.dead = true;
        c.deathReason = "被狩猎";
        for (let i = tasks.list.length - 1; i >= 0; i--) {
          const k = tasks.list[i];
          if (k !== t && k.creature === c && !k.done) {
            for (const w of k.workers) { if (w.task === k) { w.task = null; if (w.state === "walk" || w.state === "work") w.state = "idle"; } }
            tasks.list.splice(i, 1);
          }
        }
        grantCarry(agent, "food", huntReward(c));
        return null;
      }
      break;
    }
    case "PASTURE": {
      setTile(t.x, t.y, T.PASTURE);
      // 自动圈地：牧场四周立起围栏，圈养的牲畜从此只能在栏内活动
      // v0.5.3：环上必留一道门（T.GATE 可走）——牲畜可以自己出门在附近溜达，不必全程圈死；
      // 门优先取南侧正中，该格不可圈（水/建筑等）则取第一个可圈格，保证有环就有门
      const ring = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const tt = tileAt(t.x + dx, t.y + dy);
        if (tt === T.GRASS || tt === T.SAND) ring.push([dx, dy]);
      }
      const gate = ring.find(([dx, dy]) => dx === 0 && dy === 1) ||
                   ring.find(([dx, dy]) => dx === 0 || dy === 0) ||   // 门放在正交向（对角开门太怪）
                   ring[0] || null;
      for (const [dx, dy] of ring) {
        const isGate = gate && dx === gate[0] && dy === gate[1];
        setTile(t.x + dx, t.y + dy, isGate ? T.GATE : T.FENCE);
      }
      world.pastures.push({ x: t.x, y: t.y });
      logMsg(`新的牧场建成了，围栏圈地留了道门——牲畜偶尔会自己出门溜达。`);
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
    case "WELL": {
      // 水井落成（tile 常量由 config 契约提供，falsy 容错防集成期半成品崩溃）
      if (T.WELL !== undefined) setTile(t.x, t.y, T.WELL);
      logMsg(`水井落成，清冽的井水近在眼前。`);
      break;
    }
    case "BREWERY": {
      if (T.BREWERY !== undefined) setTile(t.x, t.y, T.BREWERY);
      logMsg(`酒坊落成，粮谷将在这里酿成醉人的麦酒。`);
      break;
    }
    case "PRESS": {
      if (T.PRESS !== undefined) setTile(t.x, t.y, T.PRESS);
      logMsg(`压榨坊落成，鲜果将在这里榨成清甜的果汁。`);
      break;
    }
    case "ROASTERY": {
      if (T.ROASTERY !== undefined) setTile(t.x, t.y, T.ROASTERY);
      logMsg(`烘焙坊落成，咖啡豆的焦香将唤醒小镇的清晨。`);
      break;
    }
    case "GAZEBO": {
      setTile(t.x, t.y, T.PAVILION);
      logMsg(`凉亭落成，路过的居民可以在此歇脚乘凉。`);
      break;
    }
    case "THEATER": {
      setTile(t.x, t.y, T.THEATER);
      logMsg(`戏台搭好了，锣鼓一响全城都热闹。`);
      break;
    }
    case "ARENA": {
      setTile(t.x, t.y, T.ARENA);
      logMsg(`斗兽场建成，勇者们有了展示胆识的舞台。`);
      break;
    }
    case "PARK": {
      // 游乐园开园（v0.5.0）：水面格转浮台 PIER，其余工地格还原草地，门楼落成，注册进 world.parks
      for (const k of (t.waterCells || [])) {
        const [px, py] = k.split(",").map(Number);
        setTile(px, py, T.PIER);
      }
      for (let y = t.y0; y <= t.y1; y++) for (let x = t.x0; x <= t.x1; x++) {
        if (tileAt(x, y) === T.SITE) setTile(x, y, T.GRASS);
      }
      setTile(t.gx, t.gy, T.PARK_GATE);
      world.parks.push({ x: t.gx, y: t.gy, x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, water: !!t.water });
      logMsg(`游乐园开园了！摩天轮与旋转木马即将立起，全城都盼着开玩。`);
      emit("build-done");
      break;
    }
    case "FERRIS": {
      setTile(t.x, t.y, T.FERRIS);
      logMsg(`摩天轮立起来了，坐在最高格能看到整片群岛。`);
      break;
    }
    case "CAROUSEL": {
      setTile(t.x, t.y, T.CAROUSEL);
      logThrottled(`旋转木马转起来了，音乐盒的旋律飘出很远。`, 30);
      break;
    }
    case "COASTER": {
      setTile(t.x, t.y, T.COASTER);
      logThrottled(`过山车铺完了最后一截轨道，尖叫声即将响彻园区。`, 30);
      break;
    }
    case "FETCH_WATER": {
      // 打水：完成者背包驮水回仓（haul 槽，deposit 入所属城市 water 字段）；
      // 一趟 5 桶跨两格驮（3+2，低衰减口径下一次直饮约抵 5 桶，库存才攒得起来，酿造链才有原料）
      grantCarry(agent, "water", 5);
      return null;
    }
    case "PRESS_JUICE": case "BREW_BEER": case "BREW_COFFEE": {
      // 制作：原料从所属城市库存扣除（与 tasksTake 领取过滤双处生效；不足时钳到 0 防负库存），
      // 产出直接入库不走搬运（ownerSettle 无主则最近聚落兜底，参照 FILL 就地结算写法）
      const s = ownerSettle(t.x, t.y) || nearestSettlement(t.x, t.y);
      const cost = TASK_RESOURCE_COST[t.type];
      if (s && cost) {
        const st = ensureStock(s);
        for (const k of Object.keys(cost)) st[k] = Math.max(0, (st[k] || 0) - cost[k]);
        const out = t.type === "PRESS_JUICE" ? "juice" : t.type === "BREW_BEER" ? "beer" : "coffee";
        st[out] = (st[out] || 0) + 1;
        logThrottled(t.type === "PRESS_JUICE" ? "压榨坊榨出了新鲜的果汁。"
          : t.type === "BREW_BEER" ? "酒坊酿出了一桶麦酒。" : "烘焙坊烘出了新一批咖啡。", 30);
      }
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
