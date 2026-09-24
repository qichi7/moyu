"use strict";
// ============ 全局配置 ============
const BUILD_ID = "v0.6.18";

// tile 类型
const T = {
  VOID: 0, DEEP: 1, WATER: 2, SAND: 3, GRASS: 4, TREE: 5,
  MOUNTAIN: 6, FARM: 7, HOUSE: 8, PATH: 9, SITE: 10, BRIDGE: 11,
  BERRY: 12, FRUIT: 13, PASTURE: 14, CAVE: 15, CLIFF: 16, FENCE: 17,
  QUARRY: 18, SANDPIT: 19, DOCK: 20,
  WELL: 21, BREWERY: 22, PRESS: 23, ROASTERY: 24,
  BAMBOO: 25, MUSHROOM: 26, MOONBLOOM: 27,   // v0.5.0 新植物：竹林（快木材）/蘑菇（林地小粮）/月光花（夜光环）
  PAVILION: 28, THEATER: 29, ARENA: 30,      // v0.5.0 娱乐链：凉亭（era1）/戏台（era2）/斗兽场（era2）
  PARK_GATE: 31, FERRIS: 32, CAROUSEL: 33, COASTER: 34, PIER: 35,   // 游乐园：门楼/摩天轮/旋转木马/过山车/水上浮台
  GATE: 36,                                // 牧场门（v0.5.3：围栏留门，牲畜可外出自由活动）
};

const TILE_META = {
  [T.VOID]:     { name: "虚空", color: "#0a0d13", walk: false, h: 0 },
  [T.DEEP]:     { name: "深海", color: "#123a5e", walk: false, bridgeable: true, hp: 8 },
  [T.WATER]:    { name: "浅海", color: "#235d96", walk: false, fillable: true, bridgeable: true, fillTo: T.SAND, hp: 8 },
  [T.SAND]:     { name: "沙滩", color: "#cfc08a", walk: true, h: 0 },
  [T.GRASS]:    { name: "草地", color: "#5e8c4f", walk: true, h: 0 },
  [T.TREE]:     { name: "森林", color: "#2f5e33", walk: false, diggable: true, digTo: T.GRASS, hp: 4 },
  [T.MOUNTAIN]: { name: "山",   color: "#7a7d84", walk: false, diggable: true, digTo: T.GRASS, hp: 16 },
  [T.FARM]:     { name: "农田", color: "#a5b04a", walk: true, h: 0 },
  [T.HOUSE]:    { name: "房屋", color: "#8a5a33", walk: false, h: 0 },
  [T.PATH]:     { name: "道路", color: "#b09a72", walk: true, h: 0 },
  [T.SITE]:     { name: "工地", color: "#c9b98a", walk: true, h: 0 },
  [T.BRIDGE]:   { name: "木桥", color: "#a97b48", walk: true, h: 0 },
  [T.BERRY]:    { name: "浆果丛", color: "#3e6b35", walk: true, h: 0 },
  [T.FRUIT]:    { name: "果树", color: "#4a7a3a", walk: true, h: 0 },
  [T.PASTURE]:  { name: "牧场", color: "#9a8a5a", walk: true, h: 0 },
  [T.CAVE]:     { name: "洞穴", color: "#2d2d34", walk: false, h: 0 },
  [T.CLIFF]:    { name: "悬崖", color: "#62666e", walk: false, h: 0 },
  [T.FENCE]:    { name: "围栏", color: "#7a5a2e", walk: false, h: 0 },
  [T.QUARRY]:   { name: "采石场", color: "#8d8478", walk: true, h: 0 },
  [T.SANDPIT]:  { name: "沙场", color: "#d8c890", walk: true, h: 0 },
  [T.DOCK]:     { name: "码头", color: "#8a6a42", walk: true, h: 0 },
  [T.WELL]:     { name: "水井",   color: "#8f9aa3", walk: false, h: 0 },
  [T.BREWERY]:  { name: "酒坊",   color: "#7a4a3a", walk: false, h: 0 },
  [T.PRESS]:    { name: "压榨坊", color: "#6a7a4a", walk: false, h: 0 },
  [T.ROASTERY]: { name: "烘焙坊", color: "#5a4a3a", walk: false, h: 0 },
  [T.BAMBOO]:   { name: "竹林",   color: "#3f7a3f", walk: false, diggable: true, digTo: T.GRASS, hp: 3 },
  [T.MUSHROOM]: { name: "蘑菇",   color: "#c9a37a", walk: true, h: 0 },
  [T.MOONBLOOM]:{ name: "月光花", color: "#aebfe4", walk: true, h: 0 },
  [T.PAVILION]: { name: "凉亭",   color: "#b0554a", walk: false, h: 0 },
  [T.THEATER]:  { name: "戏台",   color: "#a06048", walk: false, h: 0 },
  [T.ARENA]:    { name: "斗兽场", color: "#b0a088", walk: false, h: 0 },
  [T.PARK_GATE]:{ name: "游乐园门楼", color: "#d0885a", walk: false, h: 0 },
  [T.FERRIS]:   { name: "摩天轮", color: "#6a9ad0", walk: false, h: 0 },
  [T.CAROUSEL]: { name: "旋转木马", color: "#d08aa0", walk: false, h: 0 },
  [T.COASTER]:  { name: "过山车", color: "#c07840", walk: false, h: 0 },
  [T.PIER]:     { name: "水上浮台", color: "#9a8468", walk: true, h: 0 },
  [T.GATE]:     { name: "牧场门", color: "#7a5a2e", walk: true, h: 0 },
};

const WORLD_W = 240, WORLD_H = 180;   // 仅作语义参考：无限地图时代初始生成以主岛原点为中心（genWorld），无固定区域

const SIM = {
  DAY_LEN: 90,          // 一个昼夜 = 90 sim 秒
  NIGHT_START: 0.82,    // timeOfDay > 0.82 或 < 0.18 为夜
  NIGHT_END: 0.18,
  PLANNER_INTERVAL: 4,  // 规划器每 4 sim 秒跑一次
  AGENT_SPEED: 1.7,     // tile/秒 基准
  HUNGER_DECAY: 0.55,   // hunger 每秒下降（v0.5.4：减半——生活节奏放缓）
  ENERGY_DECAY: 0.6,    // 醒着时 energy 每秒下降（0.9 时 100 能量只够往返 95 格，扩张区任务必过劳死）
  ENERGY_REGEN: 9,      // 睡觉时每秒恢复
  WORK_EFFORT: 1.3,     // 每个工人每秒任务进度
  FARM_MATURITY: 55,    // 农田成熟秒数
  FARM_YIELD: 4,        // 每次成熟产粮
  BIRTH_CHECK: 0.05,    // 出生概率（规划器内按 4 秒窗口换算）
  // EXPAND_POP_CAP 已废弃：人口不设上限，扩张由住房饱和与选址失败驱动
  SETTLEMENT_SCORE: [12, 36, 90],    // 聚落升级分数线：村庄/城镇/城市（v0.6.18 调低：era2 城镇 ≈ 8 房+6 田/辖区，人口 35~45 时主聚落自然达成；era3 城市 80~100 人可达）
  EXPAND_EVERY: 30,                  // 疆土生长阈值（v0.6.18）：人口每增 30 人规划署开辟一片新疆土
  SETTLEMENT_RADIUS: 14,             // 聚落繁荣度统计半径
  BRIDGE_HP: 3,         // 架一座桥所需工时（比填海快得多）
  EXPLORE_CHANCE: 0.06, // 探索欲 1.0 的小人每次决策触发探索的概率
  EXPLORE_LEGS: 6,      // 一次探索旅程最多延伸的段数
  REVEAL_RADIUS: 18,    // 探索点亮的斑块半径上限（格），实际大小随机且边界有噪声扰动
  // ---- 食物体系 ----
  BERRY_STOCK: 3,       // 每丛浆果/果树的果量上限
  BERRY_REGEN: 60,      // 每 60 秒再生 1 份
  GATHER_YIELD: 3,      // 采集一次入粮池
  HUNT_YIELD: { cow: 8, goat: 5 },
  PASTURE_INTERVAL: 80, // 牧场产粮周期（秒）
  PASTURE_YIELD: 2,     // 每次产粮
  PASTURE_CAP: 6,       // 单牧场圈养上限
  BREED_CHANCE: 0.1,    // 繁殖概率（每 120 秒判定）
  WILD_BREED_CAP: 120,  // 陆生系野生总量护栏（v0.6.17 降级为全局性能护栏：繁衍均衡化后每物种各有硬上限，此值只防陆生系实体总量失控，超护栏当 tick 跳过陆生繁衍）
  WILD_BREED_SAFETY: 1.25,  // 均衡出生安全系数：期望出生 = 种群×tick÷寿命秒×此值（替换率 1.0 留 25% 爬坡余量，种群向物种上限缓慢恢复）
  TURTLE_CAP: 12,       // 海龟总量上限
  WHALE_CAP: 5,         // 鲸总量上限
  // ---- 物种扩充（v0.5.0）：新物种繁衍上限（珍稀物种种群小而延续；flier 飞行类不在此繁衍）----
  // v0.6.17 补：goat/deer/boar/wolf（旧版无专键 → 无每物种上限，wildBreedTick 全局池随机选亲致种群失衡灭绝）
  SPECIES_CAP: { fish: 60, rabbit: 30, fox: 16, bear: 8, horse: 14, penguin: 20, crab: 26,
    dolphin: 14, shark: 8, unicorn: 6, moonfish: 10, koi: 12, mermaid: 6,
    goat: 40, deer: 20, boar: 16, wolf: 6 },
  ECO_FLOOR: 4,         // 狩猎/捕获保护线（v0.6.17）：目标物种非圈养活体（驯服计入）≤ 此值 → 该物种不立项（在办任务照常完成）
  ANIMAL_STRAND_DEATH: 180, // 动物被困（脚下不再是栖息地）坚持时长（秒），超时死亡——给救援留足窗口
  // ---- 航海 ----
  SHIP_COST: 10,        // 造一艘远航船耗木材（联合库存）
  SHIP_SPEED: 3,        // 船速（格/秒）
  SHIP_MAX_DIST: 220,   // 单次远航最大航程
  SHIP_PROVISION_RATE: 0.15,  // 船只补给消耗（粮/秒）——船速 3 格/s 即每格 0.05 粮
  SHIP_PROVISION_LOAD: 40,    // 出航满载补给（粮）——满载续航 267s ≈ 800 格，正常往返富余
  SHIP_RESCUE_RESUPPLY: 25,   // 救援船送达的补给量（粮）——最远被困点返航需 11 粮，足够
  BOAT_COST: 4,               // 小渔船耗木材（联合库存）——远低于远航船
  FISHING_BOAT_CAP: 2,        // 同时在海的渔船数上限
  BOAT_HOLD_CAP: 20,          // 渔船满舱载鱼量（粮）
  BOAT_FISH_YIELD: 2,         // 渔船每次起网渔获
  FISHING_INTERVAL: 10,       // 渔船起网周期（秒）
  // ---- 口渴与饮品 ----
  THIRST_DECAY: 0.35,         // 口渴每秒下降（v0.5.4：减半——walk 实际 ≈0.42/s，直饮一次可撑 ~240s）
  STATE_HUNGER: { idle: 1.0, walk: 1.15, run: 1.5, work: 1.45, sleep: 0.5 },  // 饥饿衰减按状态倍率（睡觉减半）
  STATE_ENERGY: { idle: 0.85, walk: 1.1, run: 1.6, work: 1.35 },              // 体力衰减按状态倍率（睡觉不衰减，走 ENERGY_REGEN 恢复）
  STATE_THIRST: { idle: 1.0, walk: 1.2, run: 1.5, work: 1.3, sleep: 0.55 },   // 口渴衰减按状态倍率
  DRINK_RESTORE: { water: 100, juice: 100, beer: 100, coffee: 100 },          // 各饮品一次饮用的解渴量（统一 100 喝一次回满；果汁/麦酒/咖啡另有效果见下）
  DRUNK_TIME: 40,             // 醉酒状态持续时间（秒）
  COFFEE_TIME: 120,           // 咖啡因提神持续时间（秒）
  COFFEE_ENERGY_FACTOR: 0.55, // 咖啡因期间体力衰减倍率
  BEER_HUNGER_FACTOR: 0.85,   // 醉酒期间饥饿衰减倍率（酒能顶饿）
  DRUNK_SPEED_FACTOR: 0.65,   // 醉酒移动速度倍率
  DEHYDRY_TIME: 40,           // 口渴归零后的脱水耐受时长（秒），超时进入脱水伤害
  SAFE_THIRST: 12,            // 行程预算：按当前路径走完时渴值预计低于此 → 中途弃程先喝水（防隧道视野渴死）
  SAFE_HUNGER: 8,             // 行程预算：按当前路径走完时饥饿预计低于此 → 中途弃程先吃饭
  // ---- 背包（v0.4.0：粮仓补给 + 路上自用 + 工具加成）----
  PACK_RESTOCK_DIST: 15,      // 领任务距离超过此值 → 先补给背包再出发（近活不值得跑仓）
  PACK_LOW: 35,               // 路上自用阈值：hunger/thirst 低于此且包内有货 → 就地吃喝（不停步不换 state）
  PACK_TOOL_BONUS: 1.2,       // 持有对应工具时的工作进度倍率（首次执行该类工作自动领取，永久持有）
  PACK_STACK: { food: 3, water: 3, juice: 3, beer: 3, coffee: 3, wood: 3, stone: 3, sand: 3, rod: 1, axe: 1, pick: 1, hoe: 1, hammer: 1 },  // 背包堆叠上限（v0.4.1：资源入包 wood/stone/sand ×3）
  PACK_RESTOCK: { food: 3, water: 2, juice: 1, beer: 1, coffee: 1 },          // 补给目标量（有城库货才拿并扣城库 stock；工具不补）
  PACK_RESTORE: { food: 50, water: 65, juice: 75, beer: 60, coffee: 50 },     // 路上自用恢复量（果汁/麦酒/咖啡另有精力/醉/咖啡因效果）
  PACK_JUICE_ENERGY: 10,      // 果汁自用额外恢复的精力
  // ---- 心情与抑郁（v0.5.0）----
  MOOD_DECAY: 0.35,           // 心情基准衰减/秒（idle；工作最磨人，低落会找乐子）
  STATE_MOOD: { idle: 1.0, walk: 0.9, run: 1.1, work: 1.9, sleep: 0 },   // 心情衰减状态倍率（睡觉不衰减，另行回复）
  MOOD_SLEEP_REGEN: 1.0,      // 睡觉心情回复/秒（一夜约 +30：不用花钱的慢通道自愈）
  MOOD_BEER: 30,              // 喝麦酒的开心（附赠微醺）
  MOOD_JUICE: 12,             // 喝果汁的开心
  MOOD_COFFEE: 8,             // 喝咖啡的开心
  MOOD_WATER: 3,              // 喝清水的开心（解渴不等于开心）
  MOOD_DRUNK_JOY: 0.4,        // 醉醺醺期间持续微醺快乐/秒
  MOOD_LIKED_JOY: 1.0,        // 做喜好匹配的事/秒（覆盖工作衰减：干自己爱干的活不叫上班）
  MOOD_FEAST: 25,             // 丰收宴席全体+
  MOOD_TAME_BONUS: 15,        // 驯服狗的喜悦（奇幻物种另有 tameJoy）
  MOOD_SEEK: 35,              // 低于此 → 决策找乐子（城库有酒先喝一杯）
  MOOD_DEPRESS: 12,           // 心情低于此持续 DEPRESS_TIME → 抑郁
  DEPRESS_TIME: 60,           // 抑郁判定持续时长（秒）
  MOOD_RECOVER: 45,           // 心情回到此线持续 MOOD_RECOVER_TIME → 走出抑郁
  MOOD_RECOVER_TIME: 20,
  MOOD_SICK_TIME: 300,        // 抑郁累计此时长 → 郁结成疾病倒（sickSource="mood"，走不出则不治）
  JOY_CD: 60,                 // 找乐子失败冷却（城库无酒时防连帧重试）
  // ---- 乐事强度画像（v0.6.7）：每人每项乐事的愉悦倍率（hash2 确定性分档；调档值/盐值来这里）----
  JOY_KEYS: ["flower", "drink", "explore", "climb", "fish", "animal", "home"],
  JOY_NAMES: { flower: "赏花", drink: "喝酒", explore: "探险", climb: "爬山", fish: "垂钓", animal: "牧畜", home: "恋家" },
  JOY_TIERS: [0.4, 0.7, 1.0, 1.4, 1.8],
  JOY_SALTS: { flower: 7101, drink: 7103, explore: 7107, climb: 7111, fish: 7121, animal: 7127, home: 7133 },
  JOY_HOBBY_MIN: 1.4,          // 主喜好键保底档
  // ---- 意外死亡（v0.6.0 config 化：每秒掷骰概率，测试可临时调 1 强制触发）----
  ACCIDENT: { cliff: 1 / 20000, shark: 1 / 15000, choke: 1 / 6000 },
  // ---- 娱乐链与游乐园（v0.5.0）----
  ENT_POP_MIN: 6,             // 凉亭人口门槛（era≥1，每城一座）
  THEATER_POP_MIN: 10,        // 戏台/斗兽场人口门槛（era≥2，每城各一座）
  PARK_POP_MIN: 16,           // 游乐园人口门槛（era≥3，全域唯一）
  PARK_SIZE: 3,               // 游乐园边长（3×3）
  PLAY_MOOD: { gazebo: 12, theater: 18, arena: 20, park: 35 },   // 各设施游玩心情回复
  PLAY_TIME: { gazebo: 3, theater: 5, arena: 6, park: 8 },        // 游玩驻留秒数
  PLAY_SEEK: 70,              // 心情低于此会想去玩（<45 必去；45~70 看心情掷骰）
  PLAY_CD: 120,               // 玩过一次的冷却（防一直赖在游乐设施里）
  CHEER_TIME: 300,            // 尽兴而归：游乐园余韵时长（期间心情衰减 ×CHEER）
  MOOD_CHEER_FACTOR: 0.35,    // 余韵期间心情衰减倍率（「开心值很持久」的机制落点）
  // ---- 骑乘（v0.6.10）：驯服马可骑，长途赶路提速 ----
  RIDE_SPEED_FACTOR: 1.8,     // 骑乘移速倍率
  RIDE_MOUNT_DIST: 8,         // 剩余路径超过此格数才找马代步（短途不值得）
  RIDE_MOUNT_R: 1.5,          // 上马判定半径（格）
  // ---- 咖啡田 ----
  COFFEE_MATURITY: 90,        // 咖啡田成熟秒数（粮食田用 FARM_MATURITY）
  COFFEE_YIELD: 2,            // 咖啡田每次成熟产豆量
  // ---- 历法与年龄 ----
  YEAR_DAYS: 12,        // 1 昼夜 = 1 个月，12 昼夜 = 1 年（1 岁）
  // ---- 动物迁徙（v0.6.14）：兽群/候鸟/鲸群按周期远行 ----
  MIGRATION_PERIOD_MIN: 4 * 90,   // 迁徙间隔下限（sim 秒，4 游戏月；1 游戏月 = DAY_LEN = 90s；v0.6.17 修正旧版 ×30 的单位错误）
  MIGRATION_PERIOD_MAX: 6 * 90,   // 迁徙间隔上限（sim 秒，6 游戏月）
  MIGRATION_DIST_MIN: 30,     // 单次迁徙距离下限（格）
  MIGRATION_DIST_MAX: 80,     // 单次迁徙距离上限（格）
  // ---- 流星（v0.6.14）：夜间偶现，划空 3 秒；上颗之后 2~4 游戏夜冷却 ----
  METEOR_GAP_MIN: 90 * 2,
  METEOR_GAP_MAX: 90 * 4,
  METEOR_DUR: 3,
  METEOR_MOOD: 0.3,           // 目睹流星的心情回复/秒
  // ---- 气候与洋流（v0.6.15 定居区北缘雪原/南缘旱带+顺逆流航速+台风；v0.6.16 边界噪声曲线化+连续强度场+浮冰船速）----
  CLIMATE: { EDGE_INSET: 10, SNOW_FARM: 0.85, SNOW_BERRY: 0.8, DROUGHT_FARM: 0.8, DROUGHT_BERRY: 0.7,
    WOBBLE: 20, FADE: 30,                    // 雪线/旱线噪声扰动幅度（±格）/ 强度场爬坡带宽（格）
    ICE_P: 0.55, SNOW_P: 0.5, DRY_P: 0.5,    // 贴花概率基准：浮冰/积雪/干裂贴花出现概率（表现层按概率消费，非强度阈值）
    ICE_SHIP: 0.85 },                        // 浮冰海面船速倍率（水面且 climateIntensity≥0.5）
  CURRENT_SHIP_FAST: 1.15,    // 顺流航速倍率
  CURRENT_SHIP_SLOW: 0.9,     // 逆流航速倍率
  TYPHOON_R: 12,              // 台风影响半径（格）
  TYPHOON_SHIP: 0.6,          // 台风圈内船速倍率
  TYPHOON_MAN: 0.85,          // 台风圈内行人移速倍率
  TYPHOON_CHANCE: 1 / 20000,  // 每秒窗口生成概率
  TYPHOON_LIFE_MIN: 60,       // 台风寿命下限（秒）
  TYPHOON_LIFE_MAX: 120,      // 台风寿命上限（秒）
};

// 高倍速模拟调度：decide 每帧预算（main.js 按倍速写入，agent 消费；headless 测试默认不限）
const SCHED = { decideBudget: Infinity };

// 物种寿命与年龄分档（岁）：幼年 < s0、青年 < s1、中年 < s2、老年 ≥ s2；超过 lifespan 封顶
const SPECIES_AGE = {
  human: { name: "人",   lifespan: 80, stages: [15, 40, 60] },
  cow:   { name: "牛",   lifespan: 15, stages: [2, 8, 12] },
  goat:  { name: "羊",   lifespan: 12, stages: [2, 6, 9] },
  dog:   { name: "狗",   lifespan: 10, stages: [2, 5, 8] },
  deer:  { name: "鹿",   lifespan: 12, stages: [2, 5, 8] },
  boar:  { name: "野猪", lifespan: 10, stages: [2, 5, 7] },
  wolf:  { name: "狼",   lifespan: 10, stages: [2, 5, 7] },
  fish:  { name: "鱼群", lifespan: 5,  stages: [1, 2, 3] },
  turtle:{ name: "海龟", lifespan: 30, stages: [5, 15, 22] },
  whale: { name: "鲸",   lifespan: 50, stages: [10, 25, 38] },
  bird:  { name: "鸟",   lifespan: 6,  stages: [1, 3, 4] },
  // ---- 物种扩充（v0.5.0）----
  rabbit:  { name: "兔",     lifespan: 7,   stages: [0.5, 2, 4] },
  fox:     { name: "狐",     lifespan: 10,  stages: [1, 4, 7] },
  bear:    { name: "熊",     lifespan: 20,  stages: [2, 8, 14] },
  horse:   { name: "马",     lifespan: 22,  stages: [2, 8, 15] },
  penguin: { name: "企鹅",   lifespan: 12,  stages: [1, 4, 8] },
  crab:    { name: "蟹",     lifespan: 5,   stages: [0.5, 2, 3] },
  dolphin: { name: "海豚",   lifespan: 30,  stages: [3, 10, 20] },
  shark:   { name: "鲨",     lifespan: 25,  stages: [3, 10, 18] },
  unicorn: { name: "独角兽", lifespan: 120, stages: [10, 40, 80] },
  moonfish:{ name: "月光鱼", lifespan: 8,   stages: [1, 3, 5] },
  koi:     { name: "锦鲤",   lifespan: 15,  stages: [1, 5, 10] },
  phoenix: { name: "凤凰",   lifespan: 200, stages: [20, 80, 150] },
  fairy:   { name: "小仙龙", lifespan: 150, stages: [10, 50, 100] },
  mermaid: { name: "人鱼",   lifespan: 100, stages: [10, 40, 70] },
};

// 时代划分：按已达到的最高聚落等级 / 人口里程碑
const ERAS = [
  { name: "蛮荒时代", need: null },      // 初始
  { name: "定居时代", need: { settle: 1 } },
  { name: "城邦时代", need: { settle: 2 } },   // 解锁功能分区
  { name: "文明时代", need: { settle: 3 } },   // 解锁高楼社区
  { name: "黄金时代", need: { pop: 150, cities: 2 } },
];
