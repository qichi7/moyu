"use strict";
// ============ 全局配置：PC宇宙 · 越玩越菜（副标题：生存退化） ============
const BUILD_ID = "v0.1.0";

// 退化链四形态：牛马 →（1万倍）猴子 →（1亿倍）草履虫 →（再1万倍）阿巴阿巴分子
const FORMS = [
  { key: "worker",     name: "牛马",       multLabel: "0",    speed: 150, radius: 10, dash: true },
  { key: "monkey",     name: "猴子",       multLabel: "1万",  speed: 112, radius: 13, dash: false },
  { key: "paramecium", name: "草履虫",     multLabel: "1亿",  speed: 68,  radius: 6,  dash: false },
  { key: "molecule",   name: "阿巴阿巴分子", multLabel: "1万亿", speed: 0,   radius: 5,  dash: false, brownian: true },
];

// 累计退化倍数（HUD 计数器按形态跳变）
const MULTIPLIERS = [1, 1e4, 1e8, 1e12];

// 分子变异体（彩蛋）：学名=几X化几Y 计数法；化学式=元素名+数字；俗名=按分子式原子排列顺序连读
// 分子式必须按读音节拍排列（阿-巴-阿-巴 → 阿巴阿巴；嗯-嗯-阿-阿 → 嗯嗯阿阿）
const MOLECULES = [
  { key: "ababa",  folk: "阿巴阿巴", formal: "二阿化二巴", formula: "阿2巴2",
    atoms: ["a", "b", "a", "b"], sigma: 260, damp: 1.2, vmax: 220, sound: ["a", "b", "a", "b"] },
  { key: "enenaa", folk: "嗯嗯阿阿", formal: "二嗯化二阿", formula: "嗯2阿2",
    atoms: ["e", "e", "a", "a"], sigma: 90,  damp: 2.2, vmax: 90,  sound: ["e", "e", "a", "a"] },
  { key: "wayaya", folk: "哇呀哇呀", formal: "二哇化二呀", formula: "哇2呀2",
    atoms: ["w", "y", "w", "y"], sigma: 420, damp: 1.6, vmax: 300, sound: ["w", "y", "w", "y"] },
];

// 捕食者（老板同步退化）：下标=形态；分子形态无敌，无天敌
const PREDATORS = [
  { key: "boss",    name: "西装老板", speed: 105, radius: 12 },
  { key: "gorilla", name: "猩猩老板", speed: 95,  radius: 15 },
  { key: "flea",    name: "水蚤",     speed: 60,  radius: 6  },
  null,
];

// 模拟参数
const SIM = {
  STEP: 1 / 60,            // 固定步长
  DEVOLVE_SECONDS: 20,     // 强制退化周期
  INVULN_AFTER_DEVOLVE: 2, // 退化后无敌秒数（防连环抓）
  PRED_STUN_ON_DEVOLVE: 1.2, // 退化瞬间天敌集体愣神
  DASH_SPEED: 340, DASH_TIME: 0.25, DASH_CD: 2.5,
  KNOCKBACK_SPEED: 300, KNOCKBACK_TIME: 0.45,  // 被抓击退（防墙角被永久钉死）
  PRED_GROW_TIME: 240, PRED_GROW_MAX: 0.35,  // 天敌速度成长 ×(1+min(t/240, .35))
  PRED_COUNT_BASE: 2, PRED_COUNT_EVERY: 15, PRED_COUNT_CAP: 6,
  SPAWN_MIN_DIST: 140,     // 天敌生成点离玩家最小距离
  CATALYST_EVERY: 8, CATALYST_LIFE: 12, CATALYST_RADIUS: 9, // 分子形态触媒
};

// 退化/事件文案（{form}=形态名 {mult}=倍数 {pred}=天敌 {mol}=俗名 {formal}=学名）
const DEVOLVE_TOASTS = {
  timer: [
    "假越放越长，你退化成了{form}（已退化{mult}倍）",
    "没人叫你上班，你退化成了{form}",
    "工位都长草了，你退化成了{form}（已退化{mult}倍）",
  ],
  caught: [
    "被{pred}当场抓获！你退化成了{form}（已退化{mult}倍）",
    "{pred}：上班时间想去哪？你退化成了{form}",
  ],
  molecule: "再退化1万倍……你变成了{mol}分子（{formal}），布朗运动开始，无限遨游",
  mutate: "触媒摄入！你变异成了{mol}分子（{formal}）",
};

// 结算吐槽（按存活时长分档）
const OVER_QUIPS = [
  { min: 0,  text: "退化速度惊人，老板看了都沉默。" },
  { min: 15, text: "这退化效率，年终奖是没戏了。" },
  { min: 35, text: "坚持得不错，可惜假期才是最强的进化压力。" },
  { min: 58, text: "满分牛马！硬撑到分子才肯罢休，敬佩。" },
];
