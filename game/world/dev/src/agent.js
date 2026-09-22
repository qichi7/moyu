"use strict";
// ============ 小人 Agent ============

// 命名：尽量不重复；单姓 56 个、复姓 20 个（抽取占比约 9%，稀有感）；名用字分男女池（各 24 字）
const _SURNAMES = ["张", "王", "李", "陈", "杨", "赵", "周", "吴", "郑", "孙", "林", "何", "高", "苏", "叶", "宋", "罗", "程", "袁", "许",
  "黄", "谢", "唐", "韩", "曹", "萧", "石", "冯", "蒋", "沈", "卢", "崔", "姜", "邹", "孟", "秦", "严", "薛", "杜", "魏",
  "范", "彭", "吕", "董", "贾", "毛", "邓", "康", "傅", "邵", "温", "于", "徐", "马", "朱", "胡"];
const _SURNAMES_CP = ["欧阳", "司马", "诸葛", "上官", "东方", "独孤", "南宫", "西门", "慕容", "皇甫",
  "尉迟", "公孙", "长孙", "宇文", "轩辕", "令狐", "夏侯", "钟离", "闻人", "澹台"];
const _GIVEN_M = ["石", "安", "松", "青", "远", "川", "枫", "桥", "野", "舟",
  "岳", "峰", "磊", "恒", "铮", "弘", "毅", "昊", "霆", "潮", "湃", "澈", "瀚", "煜"];   // 男名用字
const _GIVEN_F = ["禾", "梅", "竹", "云", "岚", "星", "宁", "秋", "白", "棠",
  "汀", "芷", "若", "蕙", "萱", "蓉", "莺", "湘", "沁", "潇", "澜", "玥", "珊", "瑶"];   // 女名用字
const _usedNames = new Set();
function pickAgentName(sex, surname) {
  const pool = sex === "f" ? _GIVEN_F : _GIVEN_M;
  // 两轮尝试（40 + 400 次）：第二轮放开双字名概率并加大尝试量——姓氏传家（新生儿继承父/母姓）
  // 时同名池会被同姓挤穿，40 次撞满就会掉进「居民44」这类编号兜底（v0.5.5 修复）
  for (let round = 0; round < 2; round++) {
    const tries = round === 0 ? 40 : 400;
    for (let i = 0; i < tries; i++) {
      const si = randInt(0, _SURNAMES.length * 3 + _SURNAMES_CP.length - 1);
      const sn = surname || (si < _SURNAMES.length * 3 ? _SURNAMES[si % _SURNAMES.length] : _SURNAMES_CP[si - _SURNAMES.length * 3]);
      const g1 = pool[randInt(0, pool.length - 1)];
      const g2 = pool[randInt(0, pool.length - 1)];
      // 第二轮：名字长度不限（双字概率拉满，缀第三字 20%），大幅扩大组合空间
      const n = round === 0
        ? sn + g1 + (rand() < 0.4 ? g2 : "")
        : sn + g1 + (rand() < 0.8 ? g2 : "") + (rand() < 0.2 ? pool[randInt(0, pool.length - 1)] : "");
      if (!_usedNames.has(n)) { _usedNames.add(n); return n; }
    }
  }
  // 终极兜底：单姓 + 「氏」+ 序号——永远唯一，绝不再出现「居民44」
  const base = surname || _SURNAMES[0];
  let k = 1;
  while (_usedNames.has(base + "氏" + (k > 1 ? k : ""))) k++;
  const n = base + "氏" + (k > 1 ? k : "");
  _usedNames.add(n);
  return n;
}

// 姓氏：命中复姓前缀取前两字，否则取首字
function surnameOf(name) {
  for (const s of _SURNAMES_CP) if (name.startsWith(s)) return s;
  return name[0];
}

// 原住民部落小名（查重：原住民多，12 个单字必重，扩展双字组合 + 池尽编号）
const _NATIVE = ["岩", "木", "禾", "川", "石", "叶", "风", "泉", "星", "鹿", "火", "溪"];
const _usedNative = new Set();
function pickNativeName() {
  for (let i = 0; i < 60; i++) {
    const n = "阿" + _NATIVE[randInt(0, _NATIVE.length - 1)] +
              (rand() < 0.5 ? _NATIVE[randInt(0, _NATIVE.length - 1)] : "");
    if (!_usedNative.has(n)) { _usedNative.add(n); return n; }
  }
  let k = 1;
  while (_usedNative.has("阿石" + k)) k++;
  _usedNative.add("阿石" + k);
  return "阿石" + k;
}

let _agentIdSeq = 1;

// 受困动物扫描缓存（decide 2.8 全局 1s 节流，见 decide）
const _rescueScan = { t: -9, victim: null };

// 职业表与社会需求比例：探险家看探索欲、工匠看勤劳，其余随机
const JOBS = {
  farmer:      { name: "农夫",   task: "FARM" },
  lumberjack:  { name: "伐木工", task: "DIG_WOOD" },
  miner:       { name: "采石工", task: "DIG_STONE" },
  hunter:      { name: "猎人",   task: "HUNT" },
  fisher:      { name: "渔民",   task: "FISH" },
  builder:     { name: "工匠",   task: "BUILD" },
  explorer:    { name: "探险家", task: null },
};
const _JOB_POOL = ["farmer", "farmer", "lumberjack", "miner", "hunter", "fisher", "builder"];

// ---- 口渴与饮品（冻结契约 v0.3.0）----
// 全部数值常量（THIRST_DECAY/STATE_*/DRINK_RESTORE/DRUNK_*/COFFEE_*/DEHYDRY_TIME 等）统一定义在
// config.js 的 SIM 里（调数值去那里）；此处只留取用顺序表（纯逻辑，非数值）
const DRINK_ORDER = ["coffee", "juice", "beer", "water"];   // 城库取用顺序：有货者优先喝高阶

// 喜好（私人生活倾向，驱动空闲时的自发行为）：
// explore 向往远方 / homebody 恋家 / animal 喜爱牲畜（陪伴加成牧场） / fishing 垂钓 / none 随遇而安
const _HOBBY_ROLL = () => {
  const r = rand();
  return r < 0.22 ? "explore" : r < 0.44 ? "homebody" : r < 0.64 ? "animal" : r < 0.84 ? "fishing" : "none";
};

// ---- 心情与喜好快乐（冻结契约 v0.5.0）----
// likedJoyOf：小人此刻是否在做「喜好匹配」的事——命中返回 1（每秒回 MOOD_LIKED_JOY，覆盖工作衰减），否则 0。
// 映射（用户口径逐字落地）：
//   explore 向往远方 → 航海（voyage）/铺路搭桥（BRIDGE/FILL 工程）/自发探索远行
//   animal  喜爱牲畜 → 捕获/建牧场任务；idle/walk 时 4 格内有圈养牲畜（牧羊）
//   fishing 垂钓爱好者 → FISH 捕鱼任务
//   homebody 恋家 → idle 时守在家里 2.5 格内
//   none 随遇而安 → 无专属快乐，但心情衰减 ×0.8（看得开，在 updateMood 内实现）
// 判定纯读 agent/creature 状态零副作用；creature.js 在拼接序中先于 agent.js，creatures 可直接引用
function likedJoyOf(a) {
  if (a.hobby === "explore") {
    if (a.state === "voyage" || a.exploring) return 1;
    if (a.state === "work" && a.task && (a.task.type === "BRIDGE" || a.task.type === "FILL")) return 1;
  }
  if (a.hobby === "fishing" && a.state === "work" && a.task && a.task.type === "FISH") return 1;
  if (a.hobby === "animal") {
    if (a.state === "work" && a.task && (a.task.type === "CAPTURE" || a.task.type === "PASTURE")) return 1;
    // 牧羊邻近判定走 1s 节流缓存（a.pastureNear，update 内扫描）——生物扩容后逐帧全表扫是性能热点
    if ((a.state === "idle" || a.state === "walk") && a.pastureNear) return 1;
  }
  if (a.hobby === "homebody" && a.home && (a.state === "idle" || a.state === "walk") &&
      Math.hypot(a.home.x + 0.5 - a.x, a.home.y + 0.5 - a.y) < 2.5) return 1;
  return 0;
}

// ---- 四方向朝向（冻结契约）：主轴判定 + 持锁迟滞（agent 与 creature 统一口径）----
// faceOf：位移方向 → 朝向主轴（|dx|>|dy| 取水平，否则取垂直）
function faceOf(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}

// faceTurn：带「持锁迟滞」的朝向变更判定——
// - 与当前朝向相同：不动；
// - 反向（left↔right / up↔down）：掉头立即切（玩家预期即时响应）；
// - 非反向（90° 转向）：需持锁计时 faceHoldT >= 0.8 才切（undefined 视为 1 = 首次设向不受锁）。
// faceHoldT 由各实体 update(dt) 累计（+dt 封顶 1），切换后归 0 重新计锁。
// 效果：BFS 阶梯步（斜向行进时水平/垂直步交替，变向间隔 ~0.5s < 0.8s 锁）期间朝向稳定不抖动；
// 持续直行 0.8s 后自然转向。显式朝向（faceTo 开工面向任务格）绕过本锁直接设。
function faceTurn(e, dx, dy) {
  const want = faceOf(dx, dy);
  if (want === e.face) return;
  const reverse = (want === "left" && e.face === "right") || (want === "right" && e.face === "left") ||
                  (want === "up" && e.face === "down") || (want === "down" && e.face === "up");
  if (!reverse && (e.faceHoldT === undefined ? 1 : e.faceHoldT) < 0.8) return;   // 持锁中：保持原朝向
  e.face = want;
  e.faceHoldT = 0;
}

// ---- 槽位背包（冻结契约 v0.4.1）：10 个物理格子装任意东西 ----
// a.pack = Array(10).fill(null)；slot = { item, n, haul? }，haul=true 的槽是搬运货（回仓 deposit 自动入库）。
// 堆叠上限查 config.SIM.PACK_STACK（消耗品/资源 ×3、工具 ×1）；可 haul 类型：wood/stone/sand/food/water。
// 合并规则：同 item 且同 haul 标记（haul 有无视为不同类）先合并，堆满开新格，无空格返回实装数（< 请求数）。
// haul 参数缺省 = 非 haul 槽。四个助手 + packHaulCount 定义在顶层：tasks.js/render.js 同作用域直接调用。
function packCount(pack, item, haul) {
  if (!pack) return 0;
  const flag = !!haul;
  let sum = 0;
  for (const s of pack) if (s && s.item === item && !!s.haul === flag) sum += s.n;
  return sum;
}

function packAdd(pack, item, n, haul) {
  if (!pack || n <= 0) return 0;
  const cap = SIM.PACK_STACK[item] || 0;
  if (cap <= 0) return 0;
  const flag = !!haul;
  let left = n;
  const hasSame = pack.some(s => s && s.item === item && !!s.haul === flag);
  for (const s of pack) {          // ① 同类槽先合并（同 item 且同 haul 标记）
    if (left <= 0) break;
    if (s && s.item === item && !!s.haul === flag && s.n < cap) {
      const put = Math.min(cap - s.n, left);
      s.n += put; left -= put;
    }
  }
  for (let i = 0; i < pack.length && left > 0; i++) {   // ② 堆满开新格；无空格剩余作罢
    if (pack[i]) continue;
    if (cap <= 1 && hasSame) break;   // 唯一物（工具 ×1）已持有：拒绝重复，不再开格
    const put = Math.min(cap, left);
    pack[i] = { item, n: put, haul: flag };
    left -= put;
  }
  return n - left;                 // 实际装入数（包满时 < 请求数）
}

function packTake(pack, item, n, haul) {
  if (!pack || n <= 0) return 0;
  const flag = !!haul;
  let left = n;
  for (let i = 0; i < pack.length && left > 0; i++) {   // 跨格实扣，扣空置 null
    const s = pack[i];
    if (!s || s.item !== item || !!s.haul !== flag) continue;
    const take = Math.min(s.n, left);
    s.n -= take; left -= take;
    if (s.n <= 0) pack[i] = null;
  }
  return n - left;
}

function packFree(pack) {
  if (!pack) return 0;
  let c = 0;
  for (const s of pack) if (!s) c++;
  return c;
}

// 搬运货总量（haul 槽求和）：decide 搬运分支 / die 遗产 / 渲染叠加层共用
function packHaulCount(pack) {
  if (!pack) return 0;
  let sum = 0;
  for (const s of pack) if (s && s.haul) sum += s.n;
  return sum;
}

class Agent {
  constructor(x, y, native, opts) {
    this.x = x + 0.5; this.y = y + 0.5;   // 浮点 tile 坐标，格中心
    this.id = _agentIdSeq++;               // 稳定唯一 id（名册引用，不受数组增删影响）
    this.dead = false;
    this.native = !!native;                // 原住民（被发现岛屿上的部落居民）
    this.sex = hash2(this.id, 9172) < 0.5 ? "f" : "m";   // 性别：id 确定性推导（不消耗 rand 流），出生定死
    this.name = this.native ? pickNativeName() : pickAgentName(this.sex, opts && opts.surname);
    this.surname = (opts && opts.surname) || surnameOf(this.name);   // 姓氏字段：固定姓优先，否则从名字推导（复姓取前两字；原住民「阿」无害）
    this.father = (opts && opts.father) || null;   // 父名（字符串）
    this.mother = (opts && opts.mother) || null;   // 母名（字符串）

    // 个体属性（0~1，人各不同）
    this.adventure = this.native ? randRange(0.5, 1) : randRange(0.05, 1); // 探索欲：高的常远行，低的恋家
    this.diligence = randRange(0.25, 1);   // 勤劳：影响干活效率
    // 岁数：1 游戏年（12 昼夜）长 1 岁；下限随 v0.6.4 育龄 20 对齐——初始队列必须含育龄内女性，
    // 否则开局仅个别适龄女性、早亡后（抑郁/意外）全境再无育龄人口（幼年长到 20 岁需 20 游戏年），
    // 世界必然陷入绝育崩盘（seed42 smoke 实测人口归零）
    this.age = randRange(20, 45);
    // 职业：探险家看探索欲，工匠看勤劳，其余按社会需求比例随机
    this.job = this.adventure > 0.75 ? "explorer"
             : this.diligence > 0.8 ? "builder"
             : _JOB_POOL[randInt(0, _JOB_POOL.length - 1)];
    // 喜好：与探索欲自洽——爱探索的人探索欲天然高，宅家的人天然低
    this.hobby = this.adventure > 0.7 ? "explore"
               : this.adventure < 0.22 ? "homebody"
               : _HOBBY_ROLL();
    this.hunger = randRange(85, 100);      // 100 = 吃饱（85 起步：开局到首批口粮落地约 45s，
                                           // 60 起步的居民会在头粮前饿穿进入必死病程——开局崩盘的种子）
    this.energy = randRange(55, 100);
    this.thirst = 100;                     // 水分：0~100，100 = 不渴（<30 找水喝，<8 持续脱水病倒）
    // 心情：0~100，100 = 开心（工作磨人、喜好回甘；<12 持续抑郁，走不出会郁结成疾）。
    // 初值走 id hash 确定性（80~100 起步），不消耗 rand 流——保持既有随机序列逐位一致（v0.5.0 契约）
    this.mood = 80 + hash2(this.id, 7777) * 20;
    this.depressed = false;                // 抑郁：什么都不想干，长期走不出会病倒
    this.cheerT = 0;                       // 尽兴而归：游乐园游玩后心情衰减放缓的剩余秒数
    this.drunkT = 0;                       // 醉酒剩余秒数（喝麦酒：移速放缓、饥饿衰减放缓）
    this.coffeeT = 0;                      // 咖啡因剩余秒数（喝咖啡：精力衰减放缓）
    // 随身背包（冻结契约 v0.4.1）：10 个物理槽位装任意东西（slot = { item, n, haul? }，全空起步）
    this.pack = new Array(10).fill(null);
    this.face = "down";                    // 朝向：up/down/left/right（移动按实际位移更新，开工面向任务格）
    this.faceHoldT = 1;                    // 朝向持锁计时：1 = 不持锁（首次设向不受锁），切换后归 0 重新计锁
    this.home = null;                      // {x,y} 房屋
    this.task = null;
    this.path = null;
    this.pi = 0;
    this.state = "idle";                   // idle/walk/eat/sleep/work/drink/voyage
    this.thinkCd = randRange(0, 0.5);      // 决策冷却，防抖
    this.speed = SIM.AGENT_SPEED * randRange(0.85, 1.2);
    this.phase = rand() * 10;              // 动画相位
    this.starving = false;
  }

  update(dt) {
    this.phase += dt;
    this.thinkCd -= dt;
    // 朝向持锁计时累计（+dt 封顶 1；undefined 视为 1 首次不受锁）——faceTurn 的非反向变向闸门
    this.faceHoldT = Math.min(1, (this.faceHoldT === undefined ? 1 : this.faceHoldT) + dt);
    // 年龄：1 游戏年（12 昼夜）长 1 岁，寿命封顶
    this.age = Math.min(SPECIES_AGE.human.lifespan, this.age + dt / (SIM.DAY_LEN * SIM.YEAR_DAYS));

    // 航海中：一切需求冻结（船上有补给），坐标由船携带。
    // 例外——航海喜悦（v0.5.0）：向往远方的人出海是圆梦，心情照涨（必须在早退之前处理，否则远航心情永远冻结）
    if (this.state === "voyage") {
      if (this.hobby === "explore") this.mood = Math.min(100, this.mood + SIM.MOOD_LIKED_JOY * dt);
      return;
    }

    // 被动点亮：所有人类单位走到已点亮区边缘时，顺手点亮眼前的虚空（探索不只属于探险家）
    this.litCd = (this.litCd || 0) - dt;
    if (this.litCd <= 0) {
      this.litCd = 2.5;
      const px = Math.round(this.x), py = Math.round(this.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(px + dx, py + dy) === T.VOID) {
          revealArea(px + dx * 2, py + dy * 2, 6);
          break;
        }
      }
    }

    // ---- 登岛命名：第一个踏上未知岛屿的人为它取名，并就地升格为定居点 ----
    this.islandCheckCd = (this.islandCheckCd || 0) - dt;
    if (this.islandCheckCd <= 0) {
      this.islandCheckCd = 1;
      const tx = Math.round(this.x), ty = Math.round(this.y);
      const standing = tileAt(tx, ty);
      if (standing !== T.VOID && standing !== T.DEEP && standing !== T.WATER) {
        for (const o of world.islands) {
          if (o.name) continue;   // 已有名字的岛跳过
          if (Math.hypot(o.x - tx, o.y - ty) <= o.r + 1) {
            o.name = pickName(false);
            o.claimed = true;
            logMsg(`${this.name} 第一个登上未知岛屿，将它命名为「${o.name}」。`);
            // 命名即定居化：面积足够的岛立即立城（粮仓+建房+开荒），纳入版图
            if (o.r >= 5 && !world.settlements.some(s => Math.hypot(s.x - o.x, s.y - o.y) < o.r + 5)) {
              const sc = findSpot(o.x, o.y, 0, Math.max(4, o.r * 0.6), T.GRASS);
              if (sc) {
                setTile(sc.x, sc.y, T.HOUSE);
                world.houses.push({ x: sc.x, y: sc.y, granary: true });
                world.settlements.push({ x: sc.x, y: sc.y, name: o.name, level: 0, stock: { wood: 15, stone: 5, sand: 10 } });
                // 房与田围绕粮仓聚簇成村（确定性外扩 + 占位防撞；田链式锚定前一块，连片生长）
                const planned = new Set([sc.x + "," + sc.y]);
                for (let i = 0; i < 3; i++) {
                  const b = expandSpot(sc, 2, Math.max(8, o.r * 0.8), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 2, Math.max(6, o.r * 0.8), T.GRASS);
                  if (b) { tasksAdd({ type: "BUILD", x: b.x, y: b.y, need: 10 }); planned.add(b.x + "," + b.y); }
                }
                let lastFarm = null;
                for (let i = 0; i < 2; i++) {
                  const refF = lastFarm || sc;
                  const f = expandSpot(refF, 1, Math.max(8, o.r), T.GRASS, planned) ||
                            findSpot(sc.x, sc.y, 3, Math.max(8, o.r), T.GRASS, [T.HOUSE, T.SITE]);
                  if (f) { tasksAdd({ type: "FARM", x: f.x, y: f.y, need: 9 }); planned.add(f.x + "," + f.y); lastFarm = f; }
                }
                logMsg(`「${o.name}」升格为定居点，先民渡海建设，粮仓落成。`);
                emit("expand");
                emit("island-settled", o);
              }
            }
            break;
          }
        }
      }
    }

    // ---- 死亡机制 ----
    // 老死：进入老年后每天判定，越老概率越高（60 岁日均 1%，此后每岁 +0.3%）
    if (this.age >= SPECIES_AGE.human.stages[2]) {
      this.oldAgeRoll = (this.oldAgeRoll || 0) + dt;
      if (this.oldAgeRoll >= SIM.DAY_LEN) {
        this.oldAgeRoll = 0;
        const over = this.age - SPECIES_AGE.human.stages[2];
        if (rand() < 0.01 + over * 0.003) { this.die("寿终正寝"); return; }
      }
    }
    // ---- 意外死亡（v0.5.8，极小概率的世界事故；概率 v0.6.0 config 化便于测试与调参）----
    // 每秒掷一次：崖边失足 / 浅滩遇鲨 / 进食噎住——概率调得极低，只是生活的无常点缀
    this.accCd = (this.accCd || 0) - dt;
    if (this.accCd <= 0) {
      this.accCd = 1;
      const ax = Math.round(this.x), ay = Math.round(this.y);
      const ACC = SIM.ACCIDENT || { cliff: 1 / 20000, shark: 1 / 15000, choke: 1 / 6000 };
      if (neighborsOf(ax, ay).some(p => tileAt(p.x, p.y) === T.CLIFF) && rand() < ACC.cliff) {
        this.die("在崖边失足坠落，当场身亡");
        return;
      }
      if (creatures.some(c => c.type === "shark" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 2.2) &&
          rand() < ACC.shark) {
        this.die("在浅滩戏水时被鲨鱼拖下了水");
        return;
      }
      if (this.state === "eat" && rand() < ACC.choke) {
        this.die("进食时狼吞虎咽，不幸噎住身亡");
        return;
      }
    }

    // 脱水：thirst<8 持续 DEHYDRY_TIME 秒 → 复用病倒机制（sickSource="thirst"，痊愈需水分恢复）
    if (this.thirst < 8) {
      this.dehydrT = (this.dehydrT || 0) + dt;
      if (!this.sick && this.dehydrT >= SIM.DEHYDRY_TIME) {
        this.sick = true;
        this.sickSource = "thirst";
        this.sickTime = 0;
        logThrottled(`${this.name} 脱水病倒了……`, 10);
      }
    } else this.dehydrT = 0;

    // ---- 心情与抑郁（v0.5.0）----
    // mood < MOOD_DEPRESS 持续 DEPRESS_TIME → 抑郁（放下手头一切活计）；
    // mood ≥ MOOD_RECOVER 持续 MOOD_RECOVER_TIME → 走出抑郁；抑郁累计 MOOD_SICK_TIME → 郁结成疾
    if (this.mood < SIM.MOOD_DEPRESS && !this.depressed) {
      this.depressT = (this.depressT || 0) + dt;
      if (this.depressT >= SIM.DEPRESS_TIME) {
        this.depressed = true;
        this.depressT = 0;
        this.depressAge = 0;
        if (this.task) this.abandonTask();   // 什么都不想干：在施工地也一并放下（工位释放，防死任务占名额）
        logMsg(`${this.name} 陷入了抑郁，对什么都提不起劲……`);
      }
    } else if (this.mood >= SIM.MOOD_DEPRESS) this.depressT = 0;
    if (this.depressed) {
      if (this.mood >= SIM.MOOD_RECOVER) {
        this.moodOkT = (this.moodOkT || 0) + dt;
        if (this.moodOkT >= SIM.MOOD_RECOVER_TIME) {
          this.depressed = false;
          this.moodOkT = 0;
          this.depressAge = 0;
          logMsg(`${this.name} 走出了抑郁的阴影，重新振作起来。`);
        }
      } else this.moodOkT = 0;
      if (this.depressed) {   // 走出判定可能在上一帧刚生效：仍抑郁才累计病倒计时
        this.depressAge = (this.depressAge || 0) + dt;
        if (!this.sick && this.depressAge >= SIM.MOOD_SICK_TIME) {
          this.sick = true;
          this.sickSource = "mood";
          this.sickTime = 0;
          logMsg(`${this.name} 郁结于心，病倒了。`);
        }
      }
    } else this.depressAge = 0;

    // 生病：饥饿或精力归零持续 30 秒 → 病倒；脱水（thirst<8）持续 40 秒 → 病倒；抑郁走不出 → 郁结成疾；
    //      再持续 60 秒无救治 → 死亡。痊愈条件：饱食与精力都恢复到 40 以上（脱水另需水分恢复；抑郁另需走出）
    const ailment = this.hunger <= 0 ? "hunger" : (this.energy <= 0 ? "energy" :
      (this.thirst < 8 ? "thirst" : (this.depressed && this.sickSource === "mood" ? "mood" : null)));
    if (ailment === "hunger" || ailment === "energy") {
      this.ailmentCd = (this.ailmentCd || 0) + dt;
      if (!this.sick && this.ailmentCd > 30) {
        this.sick = true;
        this.sickSource = ailment;
        this.sickTime = 0;
        logThrottled(`${this.name} 病倒了……`, 10);
      }
    } else {
      this.ailmentCd = 0;
    }
    // 病倒后的恶化与痊愈（脱水与饥饿/力竭共用同一条 60 秒不治线）
    if (this.sick && ailment) {
      this.sickTime += dt;
      if (this.sickTime > 60) {
        this.die(ailment === "hunger" ? "因长期饥饿病倒，不治身亡"
               : ailment === "thirst" ? "因脱水病倒，不治身亡"
               : ailment === "mood" ? "因长期抑郁病倒，不治身亡"
               : "积劳成疾，撒手人寰");
        return;
      }
    } else if (!ailment && this.sick && this.hunger > 40 && this.energy > 40 &&
               (this.sickSource !== "thirst" || this.thirst > 30) &&
               (this.sickSource !== "mood" || !this.depressed)) {
      this.sick = false;
      logThrottled(`${this.name} 痊愈了，重新投入生活。`, 20);
    }

    // 需求演化：按状态系数衰减（"run" 判定与渲染同口径：探索冲刺/高速赶路/追猎 且 处于行走态）。
    // 状态系数表在 config.js 的 SIM.STATE_*；eat/drink 等缺省态按 idle 口径兜底
    const stKey = this.state === "walk" &&
      (this.exploring || this.speed > 1.85 || (this.task && (this.task.type === "HUNT" || this.task.type === "CAPTURE")))
      ? "run" : this.state;
    const stMul = tbl => (tbl[stKey] !== undefined ? tbl[stKey] : tbl.idle);
    // 饮品效果：醉酒时饥饿衰减放缓（酒液充饥）；咖啡因生效时精力衰减放缓（提神）
    this.hunger -= SIM.HUNGER_DECAY * stMul(SIM.STATE_HUNGER) * (this.drunkT > 0 ? SIM.BEER_HUNGER_FACTOR : 1) * dt;
    if (this.state !== "sleep") this.energy -= SIM.ENERGY_DECAY * stMul(SIM.STATE_ENERGY) * (this.coffeeT > 0 ? SIM.COFFEE_ENERGY_FACTOR : 1) * dt;
    this.thirst = Math.max(0, this.thirst - SIM.THIRST_DECAY * stMul(SIM.STATE_THIRST) * dt);
    this.updateMood(dt, stMul);

    // 饮品效果计时：醉酒/咖啡因随时间消退
    if (this.drunkT > 0) this.drunkT = Math.max(0, this.drunkT - dt);
    if (this.coffeeT > 0) this.coffeeT = Math.max(0, this.coffeeT - dt);

    // 月光花光环 + 牧羊邻近扫描（1s 节流；夜晚花田夜游的浪漫与牧羊的快乐，见 updateMood/likedJoyOf）
    this.bloomCd = (this.bloomCd || 0) - dt;
    if (this.bloomCd <= 0) {
      this.bloomCd = 1;
      this.scanBloom();
      this.pastureNear = false;
      if (this.hobby === "animal") {
        for (const c of creatures) {
          if (!c.dead && c.pasture && Math.hypot(c.x - this.x, c.y - this.y) < 4) { this.pastureNear = true; break; }
        }
      }
    }

    if (this.hunger <= 0) {
      this.hunger = 0;
      if (!this.starving) { this.starving = true; logThrottled("有人饿着肚子在挨饿！", 8); }
    } else this.starving = false;

    // 长期挨饿 → 迁居到食物充裕的街区（饥饿的后果不是死亡，是搬家）
    if (this.hunger < 10) this.starveT = (this.starveT || 0) + dt;
    else this.starveT = 0;
    if (this.starveT > 40) { this.starveT = 0; this.migrate(); }

    // ---- 背包路上自用（v0.4.1 槽位背包）：需求衰减后、决策（seekDrink 分支）前——
    // 包内有存货就地吃喝，不停步不换 state；包空才走 decide 里的 seekDrink/行程预算老路。
    // 取用顺序：自购（非 haul）槽优先，吃完才动搬运的口粮（同 item 的 haul 槽回退——
    // wood/stone/sand 的 haul 槽按 item 查找天然不在取食范围）----
    const pk = this.pack;
    if (pk && (this.hunger < SIM.PACK_LOW || this.thirst < SIM.PACK_LOW)) {
      if (this.hunger < SIM.PACK_LOW &&
          (packTake(pk, "food", 1) > 0 || packTake(pk, "food", 1, true) > 0)) {
        this.hunger = Math.min(100, this.hunger + SIM.PACK_RESTORE.food);
      }
      if (this.thirst < SIM.PACK_LOW) {
        if (packTake(pk, "water", 1) > 0 || packTake(pk, "water", 1, true) > 0) {
          this.thirst = Math.min(100, this.thirst + SIM.PACK_RESTORE.water);
        } else {
          // 无水但有其他饮品：依序取用果汁/麦酒/咖啡（恢复与副作用和城库饮用一致）
          const alt = packCount(pk, "juice") > 0 ? "juice" : packCount(pk, "beer") > 0 ? "beer" : packCount(pk, "coffee") > 0 ? "coffee" : null;
          if (alt) {
            packTake(pk, alt, 1);
            this.thirst = Math.min(100, this.thirst + SIM.PACK_RESTORE[alt]);
            if (alt === "juice") this.energy = Math.min(100, this.energy + SIM.PACK_JUICE_ENERGY);
            else if (alt === "beer") { this.drunkT = SIM.DRUNK_TIME; this.mood = Math.min(100, this.mood + SIM.MOOD_BEER); }
            else this.coffeeT = SIM.COFFEE_TIME;
          }
        }
      }
    }

    // 决策：thinkCd 门控 + 高倍速下的全局轮询预算（SCHED.decideBudget 由 main.js 按倍速设定，
    // headless 测试默认 Infinity 不受影响）——未轮到时稍后重试，保证决策频率与倍速解耦
    if (this.thinkCd <= 0) {
      this.thinkCd = 0.4 + rand() * 0.3;
      if (SCHED.decideBudget > 0) { SCHED.decideBudget--; this.decide(); }
      else this.thinkCd = 0.05;
    }

    switch (this.state) {
      case "walk": this.stepAlong(dt); break;
      case "eat": {
        // 城市内共享粮食：吃所在城市（无半径最近聚落）的库存
        const sc = ownerSettle(this.x, this.y);
        const st = sc && ensureStock(sc);
        if (st && st.food > 0) {
          st.food -= 1; this.hunger = 100;
          this.restockPack(sc);   // 粮仓结算顺路补给背包（补给点①）
          this.state = "idle";
        } else { this.state = "idle"; } // 本城没粮，回去等规划器开荒/挖塘
        break;
      }
      case "drink": {
        // 原地饮用 1 秒后结算：城库饮品扣库存 1 + 给效果；水井/河湖直饮 +100 无副作用
        this.drinkWait -= dt;
        if (this.drinkWait > 0) break;
        if (this.drinkRes && this.drinkCity) {
          const st = ensureStock(this.drinkCity);
          if ((st[this.drinkRes] || 0) > 0) {
            st[this.drinkRes] -= 1;
            this.thirst = Math.min(100, this.thirst + SIM.DRINK_RESTORE[this.drinkRes]);
            // 心情分档回复（v0.5.0）：酒最开心、果汁/咖啡其次、清水只是解渴
            this.mood = Math.min(100, this.mood + (SIM["MOOD_" + this.drinkRes.toUpperCase()] || 0));
            if (this.drinkRes === "beer") { this.drunkT = SIM.DRUNK_TIME; logThrottled(`${this.name} 畅饮了麦酒，脚步都有点飘了。`, 20); }
            else if (this.drinkRes === "coffee") { this.coffeeT = SIM.COFFEE_TIME; logThrottled(`${this.name} 畅饮了热咖啡，精神抖擞。`, 20); }
            else if (this.drinkRes === "juice") { this.energy = Math.min(100, this.energy + 10); logThrottled(`${this.name} 畅饮了鲜果汁。`, 20); }
            else logThrottled(`${this.name} 畅饮了清水。`, 20);
          }
          // 库存恰被喝光：白跑一趟，等下次决策另寻水源
        } else {
          this.thirst = Math.min(100, this.thirst + SIM.DRINK_RESTORE.water);   // 井水/河水直饮（恢复量与城库清水同源：100）
          this.mood = Math.min(100, this.mood + SIM.MOOD_WATER);
          logThrottled(`${this.name} 趴在水边畅饮了一通。`, 20);
        }
        this.drinkRes = null; this.drinkCity = null;
        this.state = "idle";
        break;
      }
      case "sleep":
        this.energy += SIM.ENERGY_REGEN * dt;
        if (this.energy >= 100 || isDaytime()) this.state = "idle";
        break;
      case "play": {
        // 游玩驻留（v0.5.0 娱乐链）：到点结算心情；游乐园另给 cheerT 余韵（衰减 ×0.35，开心很持久）
        this.playWait -= dt;
        if (this.playWait <= 0) {
          const m = SIM.PLAY_MOOD[this.playKind] || 10;
          this.mood = Math.min(100, this.mood + m);
          if (this.playKind === "park") {
            this.cheerT = SIM.CHEER_TIME;
            logThrottled(`${this.name} 在游乐园玩了个痛快，尽兴而归。`, 30);
          } else {
            logThrottled(`${this.name} 玩得很开心，心情舒畅多了。`, 30);
          }
          this.playCdUntil = world.time + (SIM.PLAY_CD || 120);
          this.state = "idle";
        }
        break;
      }
      case "work": this.doWork(dt); break;
    }
  }

  // 月光花光环扫描（1s 节流，T.MOONBLOOM 未接入时恒 false）：夜晚身旁 3 格内有月光花 → updateMood 缓慢回复
  scanBloom() {
    const bl = T.MOONBLOOM;
    if (bl === undefined) { this.bloomNear = false; return; }
    const bx = Math.round(this.x), by = Math.round(this.y);
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (tileAt(bx + dx, by + dy) === bl) { near = true; break; }
      }
    }
    this.bloomNear = near;
  }

  // 最近娱乐设施（decide 2.95 用，结果缓存 2s 防高频扫描）：
  // 游乐园走 world.parks 注册表（免扫屏）；单格设施（凉亭/戏台/斗兽场）螺旋扫 24 格。
  // mood<50 时优先游乐园（大乐子），否则取最近的任意设施
  nearestFunSpot() {
    if (this.funCache && world.time - (this.funScanT || 0) < 2) return this.funCache;
    this.funScanT = world.time;
    let park = null, parkD = Infinity;
    for (const p of (world.parks || [])) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < parkD) { parkD = d; park = { x: p.x, y: p.y, kind: "park" }; }
    }
    if (park && parkD < 80 && this.mood < 50) { this.funCache = park; return park; }
    const cx = Math.round(this.x), cy = Math.round(this.y);
    let best = null, bestD = Infinity;
    const R = 24;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const t = tileAt(cx + dx, cy + dy);
        let kind = null;
        if (t === T.PAVILION) kind = "gazebo";
        else if (t === T.THEATER) kind = "theater";
        else if (t === T.ARENA) kind = "arena";
        if (!kind) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = { x: cx + dx, y: cy + dy, kind }; }
      }
    }
    if (!best && park && parkD < 80) best = park;
    this.funCache = best;
    return best;
  }

  // 心情演化（v0.5.0）：基准衰减 × 状态倍率（睡觉不衰减、改按 MOOD_SLEEP_REGEN 回复——
  // 睡一觉约 +30，是不花资源的慢通道自愈）；做喜好匹配的事 → 快乐回复；醉酒微醺持续回甘；
  // 月光花夜间光环；cheerT 余韵（游乐园尽兴而归）期间衰减 ×MOOD_CHEER_FACTOR
  updateMood(dt, stMul) {
    if (this.cheerT > 0) this.cheerT = Math.max(0, this.cheerT - dt);
    if (this.state === "sleep") {
      this.mood = Math.min(100, this.mood + SIM.MOOD_SLEEP_REGEN * dt);
      return;
    }
    let decay = SIM.MOOD_DECAY * stMul(SIM.STATE_MOOD) * (this.hobby === "none" ? 0.8 : 1);
    if (this.cheerT > 0) decay *= SIM.MOOD_CHEER_FACTOR || 0.35;
    this.mood -= decay * dt;
    if (likedJoyOf(this) > 0) this.mood = Math.min(100, this.mood + SIM.MOOD_LIKED_JOY * dt);
    if (this.drunkT > 0) this.mood = Math.min(100, this.mood + SIM.MOOD_DRUNK_JOY * dt);
    if (this.bloomNear && !isDaytime()) this.mood = Math.min(100, this.mood + 0.5 * dt);
    if (this.mood < 0) this.mood = 0;
  }

  decide() {
    if (this.state === "sleep" || this.state === "drink" || this.state === "play") return;
    // 有明确目的地的行走途中不做重新决策，防止反复重设路径；
    // 例外（行程预算抢救）：按当前路径剩余距离推算到达时的渴/饿值，预计跌破生命线 →
    // 放弃当前目的地先吃喝（任务不清空，复工由下方"手上有任务但走丢了"分支承接）。
    // 正在赶去吃/喝的路上不抢救（目的地本身就是解药，弃了反而抖动活锁）。
    if (this.state === "walk" && this.onArrive && this.path && this.pi < this.path.length) {
      const remain = (this.path.length - this.pi) / Math.max(0.1, this.speed);
      const thArr = this.thirst - remain * SIM.THIRST_DECAY * 1.5;   // 1.5 = 冲刺(run)系数包络，宁早勿晚
      const huArr = this.hunger - remain * SIM.HUNGER_DECAY * 1.5;
      if (thArr < SIM.SAFE_THIRST || huArr < SIM.SAFE_HUNGER) {
        const dest = this.path[this.path.length - 1];
        const w = this.thirst < 30 ? this.nearestWaterSpot() : null;
        const f = this.hunger < 30 ? this.nearestFoodSpot() : null;
        // 救援途中（送搁浅动物回栖息地）豁免：路程短且使命必达，弃程反而把认领锁变成幽灵锁
        const headingToCure = this.rescuing ||
          (w && w.x === dest.x && w.y === dest.y) || (f && f.x === dest.x && f.y === dest.y);
        if (!headingToCure) {
          this.path = null; this.onArrive = null; this.state = "idle";
          // 真弃程时解开身上的认领锁：否则搁浅动物被不再赶路的「幽灵救援者」锁死到 timeout
          if (this.rescuing) {
            if (this.rescuing.rescuer === this) this.rescuing.rescuer = null;
            this.rescuing = null;
          }
        }
      }
    }
    if (this.state === "walk" && this.onArrive) return;
    const night = !isDaytime();

    // 1. 累了或天黑 → 回家睡（工作可以被打断，活着比干活重要）
    //    白天低体力会 sleep↔idle 抖动（isDaytime 即醒）：抖动期间不吃不喝会渴死/饿死——生命需求优先于休息
    if ((this.energy < 18 || (night && this.energy < 92)) && this.hunger >= 30 && this.thirst >= 30) {
      this.goSleep();
      return;
    }
    // 2. 饿了 → 就近取食（最近的农田或粮仓）。城库确有粮才动身：空库白跑会把人锁进
    //    「走→eat 失败→再走」死循环——本分支恒先于 2.5 喝水与 3 领任务，开局粮尽时
    //    居民会被掐断饮水与劳作，又渴又饿死在粮仓门口（探针实测 9/12 人死于这条隧道，
    //    死锁 #18 残留的真正根源；有粮时行为与旧版完全一致）
    if (this.hunger < 30) {
      const dest = this.nearestFoodSpot();
      const fcity = dest && ownerSettle(dest.x, dest.y);
      if (dest && (!fcity || ensureStock(fcity).food > 0) && this.goTo(dest.x, dest.y)) {
        this.state = "walk";
        this.onArrive = () => { this.state = "eat"; };
        return;
      }
    }
    // 2.5 渴了 → 喝水（确定性触发，无概率门；必须先于领任务——防工蜂化渴死）
    if (this.thirst < 30 && this.seekDrink()) return;
    // 2.8 救助被困动物：施工改变地形后，搁浅的动物需要有人送回栖息地（紧急事项，优先于领任务；喜爱牲畜者更积极）
    //     任务在身者同样响应：救援是短途使命，任务引用保留，放归后经「手上有任务」分支自动复工——
    //     否则全员在岗时救援无人可派（旧版只轮空手者，谁有空全看运气）。受困者（trapUntil，见 goTo）不参与
    //     抑郁者不参与（什么都不想干）
    //     受困扫描 1s 全局节流（v0.5.0）：生物扩容后 decide 高频全表扫成为热点——结果缓存共享，
    //     认领条件（rescuer/carriedBy/存活）在使用前重验，失效即强制重扫
    if (!this.voyaging && !this.depressed && world.time >= (this.trapUntil || 0)) {
      if (world.time - _rescueScan.t > 1) {
        _rescueScan.t = world.time;
        _rescueScan.victim = creatures.find(c => !c.dead && !c.carriedBy && !c.rescuer &&
          (c.strandT || 0) > 3 && c.type !== "bird" && c.type !== "fish" &&
          (!c.noRescueT || world.time > c.noRescueT)) || null;
      }
      let victim = _rescueScan.victim;
      if (victim && (victim.dead || victim.carriedBy || victim.rescuer || (victim.strandT || 0) <= 3)) {
        _rescueScan.t = -9; victim = null;   // 缓存失效：下帧重扫
      }
      if (victim && rand() < (this.hobby === "animal" ? 0.5 : 0.15)) {
        if (this.goTo(victim.x, victim.y)) {
          victim.rescuer = this;
          this.rescuing = victim;
          this.state = "walk";
          this.onArrive = () => this.pickupAnimal(victim);
          return;
        }
        victim.noRescueT = world.time + 60;   // 暂时无法接近：冷却重试，不永久放弃
        _rescueScan.t = -9;
      }
    }

    // 2.9 心情低落 → 找乐子（v0.5.0）：城库有酒/果汁就先去喝一杯——人不只为解渴而饮，也为开心。
    //     指定偏好清单（beer>juice），城库无货则放弃（不拿白水糊弄）并冷却 JOY_CD 防连帧重试；
    //     抑郁者跳过（连开心都懒得找，只能靠睡觉与运气自愈）
    if (!this.depressed && this.mood < SIM.MOOD_SEEK &&
        this.hunger >= 30 && this.thirst >= 30 && world.time >= (this.joyUntil || 0)) {
      if (!this.seekDrink(["beer", "juice"])) this.joyUntil = world.time + SIM.JOY_CD;
    }

    // 2.95 游玩（v0.5.0 娱乐链）：心情不满且附近有娱乐设施 → 去玩（凉亭/戏台/斗兽场/游乐园）。
    //     mood<45 必去，45~70 看心情掷骰；玩过有 PLAY_CD 冷却；抑郁者连玩都提不起劲；
    //     粮食紧张（<2 天消耗）时不游玩——肚子比开心优先，防娱乐挤垮食物链
    if (!this.depressed && this.hunger >= 30 && this.thirst >= 30 && this.energy > 25 &&
        totalFood() > agents.length * 2 &&
        world.time >= (this.playCdUntil || 0) &&
        (this.mood < 45 || (this.mood < SIM.PLAY_SEEK && rand() < 0.15))) {
      const spot = this.nearestFunSpot();
      if (spot) {
        if (this.goTo(spot.x, spot.y)) {
          this.state = "walk";
          this.onArrive = () => { this.state = "play"; this.playKind = spot.kind; this.playWait = SIM.PLAY_TIME[spot.kind] || 4; };
          return;
        }
        this.playCdUntil = world.time + 60;   // 设施不可达：冷却后重试（路修好再去）
      }
    }

    // 3. 领任务干活（受困者跳过：寻路必败只会把远处任务的 blockedCount 刷到冻结；抑郁者不想干活）
    if (!this.depressed && !this.task && world.time >= (this.trapUntil || 0)) {
      // 保险：手上有产出先就地登记入库（否则领新任务 → 旧产出被下次完工覆盖而蒸发）
      if (packHaulCount(this.pack) > 0) this.deposit();
      const t = tasksTake(this);
      if (t) {
        // 劳动保护：路程耗能（ENERGY_DECAY 0.9/s ÷ 船速 1.7 格/s 往返）预估不足 → 先睡觉，防止远途过劳死
        const d = Math.abs(t.x - this.x) + Math.abs(t.y - this.y);
        // 领远任务先补给背包（补给点③）：远途自给粮水，减少中途跑粮仓/水井的往返
        if (d > SIM.PACK_RESTOCK_DIST) this.restockPack(ownerSettle(this.x, this.y));
        if (this.energy < Math.min(95, 18 + d * (this.job === "explorer" ? 0.4 : 0.75))) { this.goSleep(); return; }   // 探索者耐走（系数减半）
        // 生命需求先行：渴跌破临界平线不接新任务（thirst<35 与分支 2.5 喝水线同档——
        // 旧版 min(65,22+d×1.7) 行程门曾把渴值常驻 30~65 区间的居民全数拦成「渴而不工」，
        // 打水任务因此恒 0 工人；现直饮/城库水恢复量已匹配低衰减，平线即可，且 seekDrink
        // 是自带出口的（喝完回来必过线）。任务老化因子保证远任务最终仍会被领走，不会死任务）。
        // 例外：近处的打水任务豁免——终点就是水井边，渴人打水顺路自饮（打水若也被拦，
        // 半数劳力沦为纯喝水人口，城库水永远攒不起来）；远水不救近渴，远的仍先喝。
        // hunger 门保持距离线：探针实测它不是过度拦截源（开局 famine 中 0 次拦截；
        // 全程 ~19% 拦截在吃完一顿 hunger=100 后自愈），压平徒增随机流漂移无收益
        if (this.thirst < 35 && !(t.type === "FETCH_WATER" && d <= 30)) { this.seekDrink(); return; }
        if (this.hunger < Math.min(55, 18 + d * 1.3)) return;
        this.task = t;
        t.workers.add(this);
        if (this.goTo(t.x, t.y)) {
          this.state = "walk";
          this.onArrive = () => { this.state = "work"; this.faceTo(t.x + 0.5, t.y + 0.5); };   // 开工面向任务格
          return;
        }
        // 去不了工地 → 记一次"路不通"，累计 3 次该任务冻结（等周边改造后解锁）
        t.blockedCount = (t.blockedCount || 0) + 1;
        this.abandonTask();
        return;
      }
    } else if (!this.depressed && this.task && this.state !== "work" && this.state !== "walk") {
      // 手上有任务但走丢了（被打断）→ 继续去工地
      const tk = this.task;   // 闭包捕获：onArrive 触发时任务可能已被协同完工释放
      if (this.goTo(tk.x, tk.y)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; this.faceTo(tk.x + 0.5, tk.y + 0.5); }; return; }
    }
    // 3.5 搬运：身上有产出（haul 槽）先送回仓库入库（名称即语义：仓库里的才算资源）；抑郁者不搬
    if (!this.depressed && packHaulCount(this.pack) > 0 && this.state === "idle") {
      const s = nearestSettlement(Math.round(this.x), Math.round(this.y));
      if (s && this.goTo(s.x, s.y)) {
        this.state = "walk";
        this.onArrive = () => this.deposit();
        return;
      }
      this.deposit();   // 仓库不可达的兜底（就地登记入库）
    }

    // 3.8 航海：探险家/向往远方的居民从码头坐船出海开拓（消耗联合木材造船）；抑郁者不出海
    if (!this.depressed && !this.task && !this.voyaging && world.docks.length &&
        (this.job === "explorer" || this.hobby === "explore") && this.adventure > 0.4 &&
        rand() < 0.08) {
      const dock = world.docks.reduce((b, d) =>
        !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
      if (dock && this.goTo(dock.x, dock.y)) {
        this.state = "walk";
        this.onArrive = () => this.startVoyage(dock);
        return;
      }
    }

    // 3.95 专职探索者：前沿螺旋探索——找到最近「陆地与虚空接壤」的前沿格前往大面积点亮；
    //      局部扫不到前沿（或前沿被水隔开）时倾向出海（航海回退，点亮新海域后前沿自然出现）
    if (!this.depressed && this.job === "explorer" && !this.task && !this.voyaging && this.energy > 30 && this.hunger > 40) {
      // 前沿扫描节流：每 8 sim 秒一次（v0.5.0 原 2s——80 格螺旋扫是热点，前沿推进速度用不着高频）
      if (world.time - (this.frontScanT || -9) > 8) {
        this.frontScanT = world.time;
        this.frontCache = findFrontier(Math.round(this.x), Math.round(this.y), 80);   // 扫描 80 格：点亮推进后新前沿仍在视野
      }
      const front = this.frontCache;
      if (front) {
        if (this.goTo(front.x, front.y)) {
          this.state = "walk";
          this.onArrive = () => {
            this.state = "idle";
            // 到达前沿：大面积点亮 + 连击（向斑块边缘再点 2 处，一次驻留推进一大片）
            if (tileAt(front.x, front.y) !== T.VOID) {
              revealArea(front.x, front.y, 12 + Math.round(this.adventure * 6));
              for (let k = 0; k < 2; k++) {
                const ang = rand() * Math.PI * 2, d2 = 10 + rand() * 10;
                const px = Math.round(front.x + Math.cos(ang) * d2), py = Math.round(front.y + Math.sin(ang) * d2);
                if (tileAt(px, py) === T.VOID) revealArea(px, py, 10);
              }
            }
          };
          return;
        }
        this.frontCache = null;   // 前沿被水隔开不可达：清缓存，转出海判定
      }
      if (!front && world.docks.length && rand() < 0.5) {
        const dock = world.docks.reduce((b, d) =>
          !b || Math.abs(d.x - this.x) + Math.abs(d.y - this.y) < Math.abs(b.x - this.x) + Math.abs(b.y - this.y) ? d : b, null);
        if (dock && this.goTo(dock.x, dock.y)) {
          this.state = "walk";
          this.onArrive = () => this.startVoyage(dock);
          return;
        }
      }
    }

    // 4. 探索欲：高探索欲的居民会主动向未知远方进发（点亮虚空、发现新岛）；抑郁者连远方都懒得看
    if (!this.depressed && !this.task) {
      if (this.exploring) {
        // 探索旅程进行中：精力/饥饿尚可且腿数未满 → 继续向外延伸（专职探索者不受腿数限制）
        if (this.energy > 30 && this.hunger > 40 &&
            this.exploreLegs < (this.job === "explorer" ? Infinity : 2 + this.adventure * 4)) {
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
        this.exploring = null;   // 探索结束
      } else if (this.state === "idle" && rand() < SIM.EXPLORE_CHANCE * this.adventure) {
        // 选方向：8 向采样，优先「虚空出现最近」的方向
        let best = null;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
          const dx = Math.cos(a), dy = Math.sin(a);
          let voidAt = Infinity;
          for (let k = 4; k <= 18; k++) {
            if (tileAt(Math.round(this.x + dx * k), Math.round(this.y + dy * k)) === T.VOID) { voidAt = k; break; }
          }
          if (!best || voidAt < best.voidAt) best = { dx, dy, voidAt };
        }
        if (best && best.voidAt < Infinity) {
          this.exploring = best;
          this.exploreLegs = 0;
          logThrottled("有居民怀着探索的欲望向未知的远方进发。", 20);
          this.exploreLegs++;
          this.exploreLeg();
          return;
        }
      }
    }

    // 5. 闲逛（恋家的人活动半径更小）
    if (this.state === "idle") {
      const homebody = this.adventure < 0.3;
      const tx = Math.floor(this.x) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      const ty = Math.floor(this.y) + randInt(homebody ? -2 : -5, homebody ? 2 : 5);
      if (this.goTo(tx, ty)) this.state = "walk";
    }
  }

  // 入库：把搬运的产出（haul 槽）登记进仓库（粮食与其他资源一致：进所属城市库存，城市内共享）。
  // 非 haul 槽不动——自己的口粮与工具不上缴；暂无归属聚落则货留在包里下次再送（不蒸发）
  deposit() {
    const p = this.pack;
    if (!p || packHaulCount(p) <= 0) return;
    const s = ownerSettle(Math.round(this.x), Math.round(this.y));
    if (!s) return;
    const st = ensureStock(s);
    let hauled = false;
    for (let i = 0; i < p.length; i++) {
      const sl = p[i];
      if (!sl || !sl.haul) continue;
      st[sl.item] += sl.n;
      p[i] = null;
      hauled = true;
    }
    if (hauled) this.restockPack(s);   // 入库结算顺路补给背包（补给点②）
  }

  // 背包补给（补给点③见 decide 领远任务分支；工具不补——首次执行对应工作时自动领取，永久持有）：
  // food 补至 3、water 补至 2、果汁/麦酒/咖啡各补 1，有城库货才拿并扣城库 stock（堆叠上限 PACK_STACK 封顶）
  restockPack(city) {
    const st = city && ensureStock(city);
    const p = this.pack;
    if (!st || !p) return;
    for (const k of Object.keys(SIM.PACK_RESTOCK)) {
      const have = packCount(p, k);   // 非 haul 计数（补给进自己的槽，不混入搬运货）
      const want = Math.min(SIM.PACK_RESTOCK[k] - have, (SIM.PACK_STACK[k] || 0) - have, st[k] || 0);
      if (want > 0) {
        const got = packAdd(p, k, want);   // 实装数可能 < want（无空格时）：按实装扣城库
        if (got > 0) st[k] -= got;
      }
    }
  }

  // 死亡结算：释放任务与住房，通知世界（背包产出就地登记——拓荒者的遗物不白白散失）
  die(reason) {
    if (this.dead) return;
    this.dead = true;
    this.deathReason = reason;   // 死因随行（v0.5.9 死亡广播用）
    if (this.task) { tasksRelease(this.task, this); this.task = null; }
    if (this.rescuing) { this.rescuing.rescuer = null; this.rescuing = null; }   // 释放被困动物的认领锁
    if (packHaulCount(this.pack) > 0) this.deposit();   // 遗产：搬运产出就地登记入库
    this.home = null;
    logMsg(`${this.name} ${reason}，享年 ${Math.floor(this.age)} 岁。`);
    emit("agent-death", this);
  }

  // 抱起搁浅动物：找最近的可达栖息地（水生物种由岸边送回水中），动身前往。
  // v0.5.0 加固：岸边不可达（跨海峡）曾直接放弃认领 → 无限「认领→失败→再认领」直到动物
  // 超过搁浅死亡线——现在多轮换候选栖息地重试，全败才放弃并给 noRescueT 冷却
  pickupAnimal(c) {
    if (c.dead || c.rescuer !== this) { this.rescuing = null; return; }
    const want = c.type === "whale" ? T.DEEP : (CREATURE_META[c.type].habitat === "water" ? T.WATER : T.GRASS);
    let carried = false;
    for (let attempt = 0; attempt < 4 && !carried; attempt++) {
      // 栖息格 + 小人可站立的岸边格配对（水格本身不可通行，从岸边把动物送下水）
      let spot = null, stand = null;
      for (let i = 0; i < 6 && !spot; i++) {
        const s = findSpot(Math.round(this.x), Math.round(this.y), 2, 30, want);
        if (!s) break;
        if (want === T.GRASS) { spot = s; stand = s; break; }   // 陆生直接走到放归点
        const sh = neighborsOf(s.x, s.y).find(p => walkable(p.x, p.y));
        if (sh) { spot = s; stand = sh; }
      }
      if (!spot) break;   // 附近找不到栖息地：放弃
      c.carriedBy = this;
      c.strandT = 0;
      if (this.goTo(stand.x, stand.y)) {
        this.state = "walk";
        this.onArrive = () => this.releaseAnimal(c, spot);
        carried = true;
      } else {
        c.carriedBy = null;   // 这处岸边不可达：换下一候选（跨海峡的放归点走不过去）
      }
    }
    if (!carried) {
      // 尽力了仍送不到：放下动物原地等待 + 60s 冷却（防无限认领循环耗尽搁浅耐受时长）
      c.rescuer = null;
      this.rescuing = null;
      c.noRescueT = world.time + 60;
    }
  }

  // 到达放归点：动物回到栖息地，恢复自由
  releaseAnimal(c, spot) {
    c.carriedBy = null;
    if (!c.dead) {
      c.x = spot.x + 0.5; c.y = spot.y + 0.5;
      c.strandT = 0; c.target = null;
      logMsg(`${this.name} 把被困的${CREATURE_META[c.type].name}送回了安全的栖息地。`);
    }
    c.rescuer = null;
    this.rescuing = null;
    this.state = "idle";
  }

  // 驾小渔船出海捕鱼：造船耗少量联合木材，近海鱼点起网，满舱返航卸货（船逻辑见 shipTick 渔船分支）
  startFishingTrip(dock) {
    if (this.voyaging || this.state === "voyage") return false;   // 已在海上的人不能再出海
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停渔船。", 40); return; }
    // 木材安全余量：留 12 木给通路工程（桥/填海优先于渔船，防止工程被造船饿死）
    if (jointStock("wood") < SIM.BOAT_COST + 12) {
      logThrottled("木材不足，无力打造渔船。", 40);
      return;
    }
    jointConsume("wood", SIM.BOAT_COST);
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang: rand() * Math.PI * 2, sailor: this, state: "fishing",
      boat: true, hold: 0, fishCd: 0, target: pickFishingSpot(dock), revealCd: 0, dist: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`${this.name} 驾着小渔船出海捕鱼了。`);
    return true;
  }

  // 出海远航：造船消耗联合木材，装载粮草做补给，登船后航向未知海域（船逻辑见 world.shipTick）
  startVoyage(dock) {
    const water = neighborsOf(dock.x, dock.y).find(p => tileAt(p.x, p.y) === T.WATER);
    if (!water) { logThrottled("码头旁没有足够的水域停船。", 40); return; }
    // 先探明码头周边水域（点亮生成真实地形，避免朝向落入"VOID 生成后变陆地"的陷阱）
    revealArea(water.x, water.y, 9);
    // 初始朝向：均匀扫描 24 个方位角找前方 3 格开阔的方向（确定性，地理允许即必命中）
    let ang = -1;
    for (let k = 0; k < 24; k++) {
      const tAng = (k / 24) * Math.PI * 2 + rand() * 0.15;
      let open = true;
      for (let d = 1.5; d <= 3; d += 0.5) {
        const t = tileAt(Math.round(water.x + Math.cos(tAng) * d), Math.round(water.y + Math.sin(tAng) * d));
        if (t !== T.VOID && t !== T.DEEP && t !== T.WATER) { open = false; break; }
      }
      if (open) { ang = tAng; break; }
    }
    if (ang < 0) { logThrottled("码头周边水路不畅，远航船无法出港。", 40); return; }
    // 同样留木材安全余量给通路工程
    if (jointStock("wood") < SIM.SHIP_COST + 12) {
      logThrottled("木材不足，无法造船远航。", 40);
      return;
    }
    jointConsume("wood", SIM.SHIP_COST);
    // 装载补给（粮食）：从码头所属城市库存装粮，有多少装多少，不满也出海
    const portCity = ownerSettle(dock.x, dock.y);
    const supply = portCity ? ensureStock(portCity).food : 0;
    const load = Math.min(SIM.SHIP_PROVISION_LOAD, Math.floor(supply));
    if (load < SIM.SHIP_PROVISION_LOAD) {
      logMsg(`${this.name} 的船粮草不满（${load}/${SIM.SHIP_PROVISION_LOAD}），仍执意扬帆出海。`);
    }
    if (portCity) ensureStock(portCity).food -= load;
    world.ships.push({
      x: water.x + 0.5, y: water.y + 0.5,
      ang, sailor: this, state: "sailing",
      prov: load, dist: 0, revealCd: 0,
    });
    this.state = "voyage";
    this.voyaging = true;
    this.task = null;
    logMsg(`航海家 ${this.name} 从码头扬帆出海，驶向未知的海域。`);
  }

  // 探索延伸一腿：从小人当前位置贴身向前点亮（斑块与脚下接壤），然后走向点亮区
  exploreLeg() {
    // 前方 2~5 格处为点亮中心，保证斑块边缘与当前位置接壤
    const dist = 3 + rand() * 3;
    const tx = Math.round(this.x + this.exploring.dx * dist);
    const ty = Math.round(this.y + this.exploring.dy * dist);
    revealArea(tx, ty, randRange(7.5, SIM.REVEAL_RADIUS));
    // 走向点亮区前沿（而非跳过它）
    const stepTo = Math.min(dist, 5);
    const gx = Math.round(this.x + this.exploring.dx * stepTo);
    const gy = Math.round(this.y + this.exploring.dy * stepTo);
    if (this.goTo(gx, gy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    // 前沿走不通（点亮后仍是海/山）→ 尝试侧向一次
    const sx = Math.round(this.x + (this.exploring.dx * 0.7 - this.exploring.dy * 0.7) * dist);
    const sy = Math.round(this.y + (this.exploring.dy * 0.7 + this.exploring.dx * 0.7) * dist);
    revealArea(sx, sy, randRange(4, SIM.REVEAL_RADIUS * 0.7));
    if (this.goTo(sx, sy)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "idle"; };
      return;
    }
    logThrottled("探索者抵达了已知世界的边缘，止步于茫茫大海。", 25);
    this.exploring = null;
    this.state = "idle";
  }

  goSleep() {
    if (this.home && this.goTo(this.home.x, this.home.y)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "sleep"; };
    } else {
      this.state = "sleep"; // 没家，就地睡（心情差点，v1 不建模心情）
    }
  }

  // 最近的进食点：粮仓（含新区粮仓）或任一农田，避免全城挤一个仓
  nearestFoodSpot() {
    return nearestFoodTo(this.x, this.y).spot;
  }

  // 最近可直饮水源：水井（T.WELL，世界未定义该 tile 前容错跳过）或河湖浅水格（须有可站立格）。
  // 口渴是高频决策，结果缓存 2 秒防重复全图扫描（找不到也缓存，避免连帧重扫）
  nearestWaterSpot() {
    if (this.waterCache && world.time - (this.waterScanT || 0) < 2) return this.waterCache;
    this.waterScanT = world.time;
    const well = typeof T.WELL === "number" ? T.WELL : null;   // 水井 tile（并行改造落地前缺省）
    const cx = Math.round(this.x), cy = Math.round(this.y);
    for (let r = 1; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只扫当前圈
          const x = cx + dx, y = cy + dy;
          const t = tileAt(x, y);
          if (t !== T.WATER && t !== well) continue;
          // 井/水格本身可站就直接站，否则站到可站立邻格喝
          const stand = walkable(x, y) ? { x, y } : neighborsOf(x, y).find(p => walkable(p.x, p.y));
          if (stand) { this.waterCache = stand; return stand; }
        }
      }
    }
    this.waterCache = null;
    return null;
  }

  // 寻水解渴（decide 2.5 与领任务行程门共用）：成功派出取水行程 → true，找不到水源 → false
  // ① 城库存有饮品：去最近聚落粮仓饮用（缺省按 coffee > juice > beer > water，有货者优先喝高阶；
  //    传 prefer 数组（如找乐子的 ["beer","juice"]）则按偏好序取用，城库无货 → false，不退而求其次）
  // ② 城库无饮品（或无城可归）：找最近水井/河湖水格直饮
  seekDrink(prefer) {
    const sc = nearestSettlement(Math.round(this.x), Math.round(this.y));
    const stk = sc && ensureStock(sc);
    let pick = null;
    if (stk) {
      const order = Array.isArray(prefer) ? prefer : DRINK_ORDER;
      for (const r of order) if ((stk[r] || 0) > 0) { pick = r; break; }
    }
    if (!pick && Array.isArray(prefer)) return false;   // 偏好落空：找乐子不能拿白水解，交由调用方冷却兜底
    if (pick && sc && this.goTo(sc.x, sc.y)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "drink"; this.drinkWait = 1; this.drinkRes = pick; this.drinkCity = sc; };
      return true;
    }
    const w = this.nearestWaterSpot();
    if (w && this.goTo(w.x, w.y)) {
      this.state = "walk";
      this.onArrive = () => { this.state = "drink"; this.drinkWait = 1; this.drinkRes = null; this.drinkCity = null; };
      return true;
    }
    return false;   // ③ 找不到任何水源：调用方回退后续分支
  }

  // 面向某点（world 坐标）：开工面向任务格是显式朝向——绕过持锁迟滞直接设（并重置计锁）；
  // 移动朝向由 stepAlong 按实际位移实时更新
  faceTo(px, py) {
    const dx = px - this.x, dy = py - this.y;
    if (dx === 0 && dy === 0) return;   // 原地：保持最后朝向
    this.face = faceOf(dx, dy);
    this.faceHoldT = 0;
  }

  // 设置去 (tx,ty) 的路径；顺带处理"路被堵"→ 触发移山填海
  // 浮点坐标取整必须用 Math.floor：负坐标段（出生区跨 y<0）用 |0 会向零截断错一行——
  // 站在 y=-3 行草地上的居民被当成 y=-2 行的山体，寻路起点落在不可通行格上必败，
  // 表现为「在粮仓门口活活渴死饿死」（开局连环死亡的真正根源，探针实锤）
  goTo(tx, ty) {
    const sx = Math.floor(this.x), sy = Math.floor(this.y);
    const r = findPath(sx, sy, tx, ty);
    if (r && r.path) {
      this.path = r.path; this.pi = 0;
      return true;
    }
    // 起点受困检测：脚下连通块又小又不含目标（房/树/围栏/水面完工把人围进死角）→
    // 挤到 2 格内最近的圈外开放格（施工缝隙）后重试寻路；找不到出口才标记受困 60s。
    // 否则围困是连环死亡陷阱：受困者喝不到水吃不到粮必然病死，还会垄断救援掷骰、
    // 把远处任务的 blockedCount 刷到冻结
    let res = r;
    if (r && !walkComponentHas(sx, sy, tx | 0, ty | 0)) {
      const out = findEscapeSpot(sx, sy);
      if (out) {
        this.x = out.x + 0.5; this.y = out.y + 0.5;
        logThrottled(`${this.name} 被施工围在了死角，从缝隙里挤了出来。`, 60);
        res = findPath(Math.floor(this.x), Math.floor(this.y), tx, ty);
        if (res && res.path) { this.path = res.path; this.pi = 0; return true; }
      } else {
        if (world.time >= (this.trapUntil || 0)) logThrottled(`${this.name} 被施工围在了死角，暂时动弹不得。`, 60);
        this.trapUntil = world.time + 60;
      }
    }
    // 不可达：如果挡路的是山/水/树，有概率立项改造（协作修路的来源之一）
    if (res && res.blocked && rand() < 0.6) {
      const b = res.blocked;
      const t = tileAt(b.x, b.y);
      const meta = TILE_META[t];
      if (meta.diggable) {
        // 山/树/竹：单格立项开凿（总量护栏：物种扩容后跨海不可达的 blocked 会 endless 立项——40 条封顶）
        const exist = tasks.list.find(k => !k.done && k.x === b.x && k.y === b.y);
        if (!exist && tasksPending("DIG").length < 40) {
          tasksAdd({ type: "DIG", x: b.x, y: b.y });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的${meta.name}挡住了去路，立项改造。`, 15);
        }
      } else if (t === T.WATER || t === T.DEEP) {
        // 跨水：链式桥——立项首格（blocked 必邻工人所站格，必可达），带朝目标方向与剩余步数；
        // 建成后 tasksFinish 沿方向续立下一格（remain 递减到 0 停，桥不无限穿海），
        // 工人跟进过桥，走到新桥头再续——细长桥线直通对岸
        const dup = tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y);
        // 同海峡只架一条桥：25 格内已有桥（在建成线）则不另起炉灶，等它建成即可通行
        if (!dup && !nearAny(b.x, b.y, [T.BRIDGE], 25) && tasksPending("BRIDGE", true).length < 40) {
          tasksAdd({ type: "BRIDGE", x: b.x, y: b.y,
            corridor: { dx: Math.sign(tx - b.x) || 0, dy: Math.sign(ty - b.y) || 0,
              remain: Math.abs(tx - b.x) + Math.abs(ty - b.y) } });
          logThrottled(`通路受阻：(${b.x},${b.y}) 的水域挡住了去路，开始架桥。`, 15);
        }
      } else if (meta.fillable) {
        // 其余可填格（罕见）：兜底单格填平
        if (!tasks.list.some(k => !k.done && k.x === b.x && k.y === b.y)) tasksAdd({ type: "FILL", x: b.x, y: b.y });
      }
    }
    return false;
  }

  // 迁居：放弃旧居，搬到最近进食点旁"还有名额"的房子
  migrate() {
    this.home = null;
    const spot = this.nearestFoodSpot();
    let best = null, bestD = Infinity;
    for (const h of world.houses) {
      const d = Math.abs(h.x - spot.x) + Math.abs(h.y - spot.y);
      const occ = agents.filter(a => a.home && a.home.x === h.x && a.home.y === h.y).length;
      if (d < bestD && occ < 3) { bestD = d; best = h; }
    }
    if (best) this.home = { x: best.x, y: best.y };
    logThrottled("饥民迁居：一批人搬往食物充裕的街区。", 60);
  }

  abandonTask() {
    if (!this.task) return;
    tasksRelease(this.task, this);
    this.task = null;
    this.state = "idle";
  }

  stepAlong(dt) {
    if (!this.path || this.pi >= this.path.length) {
      this.path = null;
      if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); }
      else this.state = "idle";
      return;
    }
    const target = this.path[this.pi];
    const gx = target.x + 0.5, gy = target.y + 0.5;
    const dx = gx - this.x, dy = gy - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt * (this.drunkT > 0 ? SIM.DRUNK_SPEED_FACTOR : 1);   // 醉酒移速放缓
    if (dist <= step) {
      this.x = gx; this.y = gy;
      this.pi++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    // 朝向：按本帧实际位移主轴更新——走 faceTurn 持锁迟滞（斜向阶梯步不抖动，反向即时掉头）
    if (dist > 1e-6) {
      faceTurn(this, dx, dy);
    }
  }

  doWork(dt) {
    const t = this.task;
    if (!t) { this.state = "idle"; return; }
    if (t.done) { this.task = null; this.state = "idle"; return; }   // 任务已被其他工人完成（防御网）

    // 狩猎/捕获：猎物会跑，实时追踪；猎物消失则任务作废
    // 水生猎物（鱼群）不追踪——渔人守在立项给的岸边格，圈养水域由任务结算处理
    let gx = t.x, gy = t.y, chaseR = 2.2;
    if (t.creature) {
      if (t.creature.dead) { this.abandonTask(); return; }
      const waterPrey = CREATURE_META[t.creature.type].habitat === "water";
      if (!waterPrey) {
        gx = t.creature.x - 0.5; gy = t.creature.y - 0.5;
        chaseR = 5;
        const d = Math.hypot(gx + 0.5 - this.x, gy + 0.5 - this.y);
        if (d > 6) {
          if (this.goTo(Math.round(gx), Math.round(gy))) { this.state = "walk"; this.onArrive = () => { this.state = "work"; this.faceTo(gx + 0.5, gy + 0.5); }; }
          else this.abandonTask();
          return;
        }
      }
    }
    const d = Math.abs((gx + 0.5) - this.x) + Math.abs((gy + 0.5) - this.y);
    if (d > chaseR) {
      if (this.goTo(gx, gy)) { this.state = "walk"; this.onArrive = () => { this.state = "work"; this.faceTo(gx + 0.5, gy + 0.5); }; }
      else this.abandonTask();
      return;
    }
    // 干活：建造类推进任务进度；改造类直接磨 tile 血量（勤劳的人手快）
    let effort = SIM.WORK_EFFORT * (0.7 + this.diligence * 0.6) * dt;
    // 猎犬助阵：主人狩猎且随行狗在 6 格内 → 效率 ×1.5
    if (t.type === "HUNT") {
      for (const c of creatures) {
        if (c.type === "dog" && !c.dead && Math.hypot(c.x - this.x, c.y - this.y) < 6) {
          effort *= 1.5;
          logThrottled("猎犬紧紧咬住猎物的退路，狩猎顺利多了。", 40);
          break;
        }
      }
    }
    // 工具加成（v0.4.1 槽位背包）：持有对应工具（首次执行该类工作自动领取，永久持有）→ 进度 ×1.2。
    // 加成加在 effort 源头：doWork 的进度制（t.progress += effort）与 DIG 的 workTile 磨血
    // （workTile(t, effort)）两条进度路径共用这一个变量，一处乘算两处生效
    const tool = taskToolOf(t);
    if (tool && packCount(this.pack, tool) > 0) effort *= SIM.PACK_TOOL_BONUS;
    // 工程资源检查：架桥耗木材、造陆耗沙土（联合库存，跨聚落汇总），不足则挂起等补给
    if (t.type === "BRIDGE" || t.type === "FILL") {
      const cost = TASK_RESOURCE_COST[t.type];
      const res = Object.keys(cost)[0];
      if (jointStock(res) < cost[res]) {
        logThrottled(`${res === "wood" ? "木材" : "沙土"}不足，工程暂停等待补给。`, 30);
        return;
      }
      t.progress += effort;
      if (t.progress >= (t.need || 0)) {
        jointConsume(res, cost[res]);   // 完工结算资源
        this.task = null;
        tasksFinish(t);
        this.state = "idle";
      }
      this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
      return;
    }
    if (t.type === "DIG") {
      // 伐木/采石：磨 tile 血量，产出由 tasksFinish 直接入包（haul 槽，回仓入库）
      const r = workTile(t, effort);
      if (r && r.done) {
        tasksFinish(t, this, r.was);   // 完成任务，传入改造前 tile 判定产出（死锁 #16 的 was 语义）
        this.task = null;
        this.state = "idle";           // 下一轮决策将回仓入库
      }
    } else {
      // 其余任务一律进度制（建造/农牧/畜牧/采集/狩猎等），防止无出口的假 workTile 卡死
      t.progress += effort;
      if (t.progress >= t.need) {
        tasksFinish(t, this);   // 完成任务，产出已由 tasksFinish 入包（haul 槽）
        this.task = null;
        this.state = "idle";    // 下一轮决策将回仓入库
      }
    }
    this.energy -= SIM.ENERGY_DECAY * dt * 0.5;
  }
}

// 起点连通块是否覆盖目标（容量 41 的局部 flood fill）：块小且不含目标 = 起点被施工围死；
// 块达到 41 上限即视为健康（大组件必有出路，远处/窗外目标不可达属正常失败，不判受困）
function walkComponentHas(sx, sy, tx, ty, cap) {
  cap = cap || 41;
  const seen = new Set([sx + "," + sy]);
  const q = [[sx, sy]];
  while (q.length) {
    const [cx, cy] = q.pop();
    if (cx === tx && cy === ty) return true;
    for (const p of neighborsOf(cx, cy)) {
      const k = p.x + "," + p.y;
      if (seen.has(k) || !walkable(p.x, p.y)) continue;
      if (seen.size >= cap) return true;   // 上限封顶：组件足够大，不判受困
      seen.add(k); q.push([p.x, p.y]);
    }
  }
  return false;
}

// 受困脱身：从 (sx,sy) 螺旋 2 格内找第一个「不在脚下小连通块里」的可站立格（刚围拢的施工缝隙）。
// 确定性扫描（环序、dy 主序），无出口返回 null（调用方转受困标记等待周边改造）
function findEscapeSpot(sx, sy) {
  const seen = new Set();
  {
    const q = [[sx, sy]];
    seen.add(sx + "," + sy);
    while (q.length && seen.size < 41) {
      const [cx, cy] = q.pop();
      for (const p of neighborsOf(cx, cy)) {
        const k = p.x + "," + p.y;
        if (seen.has(k) || !walkable(p.x, p.y)) continue;
        seen.add(k); q.push([p.x, p.y]);
      }
    }
  }
  for (let rr = 1; rr <= 2; rr++) {
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;   // 只扫当前圈
        const x = sx + dx, y = sy + dy;
        if (seen.has(x + "," + y) || !walkable(x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

// 螺旋向外找最近的前沿格：可站立陆地且 4 邻含 VOID（探索者的目标点；只扫局部，成本受 maxR 约束）。
// v0.5.0 性能：内联 4 邻判定（neighborsOf 每格分配数组是扫描热点），调用方另有 2s→8s 节流
function findFrontier(cx, cy, maxR) {
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只扫当前圈
        const x = cx + dx, y = cy + dy;
        if (!walkable(x, y)) continue;
        if (tileAt(x + 1, y) === T.VOID || tileAt(x - 1, y) === T.VOID ||
            tileAt(x, y + 1) === T.VOID || tileAt(x, y - 1) === T.VOID) return { x, y };
      }
    }
  }
  return null;
}

// 从 (x,y) 的连通浅水格数（只走 WATER）是否 ≤cap——小池塘不需要架桥
function waterRegionSmall(x, y, cap) {
  const seen = new Set([x + "," + y]);
  const q = [[x, y]];
  let count = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const p of neighborsOf(cx, cy)) {
      const k = p.x + "," + p.y;
      if (seen.has(k)) continue;
      if (tileAt(p.x, p.y) !== T.WATER) continue;
      seen.add(k); count++;
      if (count > cap) return false;
      q.push([p.x, p.y]);
    }
  }
  return true;
}

function isDaytime() {
  return world.timeOfDay > SIM.NIGHT_END && world.timeOfDay < SIM.NIGHT_START;
}

// 节流日志：同类消息 minGap（sim 秒）内只发一次
const _logLast = {};
function logThrottled(text, minGap) {
  const now = world.time;
  const gap = minGap || 30;
  if (_logLast[text] !== undefined && now - _logLast[text] < gap) return;
  _logLast[text] = now;
  logMsg(text);
}
