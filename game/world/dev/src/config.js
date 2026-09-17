"use strict";
// ============ 全局配置 ============
const BUILD_ID = "v0.1.0";

// tile 类型
const T = {
  VOID: 0, DEEP: 1, WATER: 2, SAND: 3, GRASS: 4, TREE: 5,
  MOUNTAIN: 6, FARM: 7, HOUSE: 8, PATH: 9, SITE: 10, BRIDGE: 11,
  BERRY: 12, FRUIT: 13, PASTURE: 14, CAVE: 15, CLIFF: 16, FENCE: 17,
  QUARRY: 18, SANDPIT: 19, DOCK: 20,
};

const TILE_META = {
  [T.VOID]:     { name: "虚空", color: "#0a0d13", walk: false, h: 0 },
  [T.DEEP]:     { name: "深海", color: "#123a5e", walk: false, fillable: true, fillTo: T.SAND, hp: 14 },
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
};

const WORLD_W = 240, WORLD_H = 180;
const INIT_REGION = { x: 68, y: 50, w: 104, h: 80 }; // 初始大陆区域

const SIM = {
  DAY_LEN: 90,          // 一个昼夜 = 90 sim 秒
  NIGHT_START: 0.82,    // timeOfDay > 0.82 或 < 0.18 为夜
  NIGHT_END: 0.18,
  PLANNER_INTERVAL: 4,  // 规划器每 4 sim 秒跑一次
  AGENT_SPEED: 1.7,     // tile/秒 基准
  HUNGER_DECAY: 1.1,    // hunger 每秒下降
  ENERGY_DECAY: 0.9,    // 醒着时 energy 每秒下降
  ENERGY_REGEN: 9,      // 睡觉时每秒恢复
  WORK_EFFORT: 1.3,     // 每个工人每秒任务进度
  FARM_MATURITY: 55,    // 农田成熟秒数
  FARM_YIELD: 4,        // 每次成熟产粮
  BIRTH_CHECK: 0.05,    // 出生概率（规划器内按 4 秒窗口换算）
  // EXPAND_POP_CAP 已废弃：人口不设上限，扩张由住房饱和与选址失败驱动
  SETTLEMENT_SCORE: [12, 60, 140],   // 聚落升级分数线：村庄/城镇/城市
  SETTLEMENT_RADIUS: 14,             // 聚落繁荣度统计半径
  BRIDGE_HP: 3,         // 架一座桥所需工时（比填海快得多）
  EXPLORE_CHANCE: 0.06, // 探索欲 1.0 的小人每次决策触发探索的概率
  EXPLORE_LEGS: 6,      // 一次探索旅程最多延伸的段数
  REVEAL_RADIUS: 12,    // 探索点亮的斑块半径上限（格），实际大小随机且边界有噪声扰动
  // ---- 食物体系 ----
  BERRY_STOCK: 3,       // 每丛浆果/果树的果量上限
  BERRY_REGEN: 60,      // 每 60 秒再生 1 份
  GATHER_YIELD: 3,      // 采集一次入粮池
  HUNT_YIELD: { cow: 8, goat: 5 },
  PASTURE_INTERVAL: 80, // 牧场产粮周期（秒）
  PASTURE_YIELD: 2,     // 每次产粮
  PASTURE_CAP: 6,       // 单牧场圈养上限
  BREED_CHANCE: 0.1,    // 繁殖概率（每 120 秒判定）
  WILD_BREED_CAP: 60,   // 野生动物总量上限
  // ---- 航海 ----
  SHIP_COST: 10,        // 造一艘远航船耗木材（联合库存）
  SHIP_SPEED: 3,        // 船速（格/秒）
  SHIP_MAX_DIST: 220,   // 单次远航最大航程
  // ---- 历法与年龄 ----
  YEAR_DAYS: 12,        // 1 昼夜 = 1 个月，12 昼夜 = 1 年（1 岁）
};

// 物种寿命与年龄分档（岁）：幼年 < s0、青年 < s1、中年 < s2、老年 ≥ s2；超过 lifespan 封顶
const SPECIES_AGE = {
  human: { name: "人",   lifespan: 80, stages: [15, 40, 60] },
  cow:   { name: "牛",   lifespan: 15, stages: [2, 8, 12] },
  goat:  { name: "羊",   lifespan: 12, stages: [2, 6, 9] },
  dog:   { name: "狗",   lifespan: 10, stages: [2, 5, 8] },
};

// 时代划分：按已达到的最高聚落等级 / 人口里程碑
const ERAS = [
  { name: "蛮荒时代", need: null },      // 初始
  { name: "定居时代", need: { settle: 1 } },
  { name: "城邦时代", need: { settle: 2 } },   // 解锁功能分区
  { name: "文明时代", need: { settle: 3 } },   // 解锁高楼社区
  { name: "黄金时代", need: { pop: 150, cities: 2 } },
];
