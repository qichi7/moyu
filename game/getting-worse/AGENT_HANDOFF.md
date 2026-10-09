# AGENT HANDOFF · 越玩越菜（getting-worse）接手文档

> 本文档写给接手本工程的 AI agent（或人类）。目标：10 分钟内建立完整心智模型，安全地继续开发。
> 详细游戏机制与数值表见同目录 `README.md`，本文档只讲「怎么改、什么不能碰、坑在哪」。

---

## 0. 项目一句话

浏览器单文件生存退化小游戏（PC宇宙）：牛马放假后沿 牛马→猴子→草履虫→阿巴阿巴分子 退化链不可逆退化，天敌（同步退化的老板）追捕加速退化，存活时间即分数，分子形态布朗运动无限遨游。零依赖零资源文件。

**核心主旨（不可违背）**：**越玩越菜——能力只降不升**。退化链永远单向，任何「升级/回退形态」的道具或机制都违背主旨，**不得主动实现，必须交用户拍板**。分子形态是终点而非奖励（无敌、不可控、分数冻结、手动终局）。

**世界观锚点（改文案/加内容时不得偏离）**：
- PC宇宙 / PC世界观；牛马放假 → 大部分退化 1 万倍（猴子）、放假过久的退化 1 亿倍（草履虫）→ 草履虫再退化 1 万倍 = 分子；
- **分子命名法三轨**：学名=几X化几Y（二阿化二巴）、化学式=元素+数字（阿2巴2）、俗名=按分子式原子排列顺序连读（阿巴阿巴）；**分子式必须按读音节拍排列**（阿-巴-阿-巴，不是 阿-阿-巴-巴）；分子震动时发出自己的连读名；
- 新分子彩蛋必须遵循同一命名法（现有：嗯嗯阿阿=二嗯化二阿=嗯2阿2、哇呀哇呀=二哇化二呀=哇2呀2）。

## 1. 上手三件事（先跑通再改代码）

```bash
node dev/build.js         # 构建产物 → 根目录 index.html（改任何 src 后必须重新构建）
cd dev && npm test        # 全量测试 = smoke + sprite + entry（三套全过才算绿）
node dev/test/smoke.js    # 逻辑冒烟：headless 跑退化链/被抓流/resize/手动结束，24 项断言（依赖 .tmp_logic.js，先 build）
node dev/test/sprite.js   # 渲染冒烟：软件光栅化跑全套 sprite 烘焙与各形态 drawScene，37 项断言
node dev/test/entry.js    # 入口冒烟：stub DOM 跑构建产物启动链 + 开始流程 + 文案契约，19 项断言
open index.html           # 人工验收
```

- `index.html` 是**构建产物**，永远不要直接编辑
- 根目录只放三个东西：`index.html`（产物）、`README.md`（用户文档）、`AGENT_HANDOFF.md`（本文档）
- 一切工程文件在 `dev/` 下：`src/`（8 个模块）、`test/`、`template.html`、`build.js`、`package.json`

## 2. 架构铁律（违反 = 测试爆炸或运行时崩溃）

1. **逻辑层零 DOM 依赖**：`src/` 中 config/rng/events/sim 必须能在 node 里 headless 跑（`test/smoke.js` 依赖这一点）。禁止在逻辑层引用 `document/window/canvas`。表现层是 sprites/audio/render/main。
2. **通信只走事件总线**（`events.js` 的 `onEvent/emit`）：逻辑层 emit、表现层订阅。逻辑层不知道音频/UI 的存在。
3. **加载顺序即拼接顺序**（`build.js`）：逻辑层 config → rng → events → sim；表现层 sprites → audio → render；最后 main。同作用域拼接，函数声明提升可用，但 **const/let 有 TDZ**——`main.js` 的 `el` 必须是 IIFE 首行（历史教训来自 world 工程，`test/entry.js` 就是防这类黑屏的）。新增文件必须同时加进 `build.js` 拼接串。
4. **数值只改 `config.js`**：形态表 FORMS（速度/半径/倍数）、天敌 PREDATORS、分子 MOLECULES、模拟参数 SIM、文案 DEVOLVE_TOASTS/OVER_QUIPS 全部集中在这里。改完跑 smoke 看断言（smoke 的冻结时间阈值是探针标定的，见下）。
5. **新增分子彩蛋的步骤**：a) `config.js` MOLECULES 加条目（folk/formal/formula/atoms 四要素**必须自洽**，atoms 数组顺序=连读节拍）；b) `sprites.js` ATOM_COLORS 加原子配色（无配色原子会被 mol 画家跳过且 sprite 测试仍绿——务必人工确认画出来了）；c) `audio.js` speak 的 FREQ 表加音节映射。`test/sprite.js` 有「atoms 与 sound 逐位一致」断言兜底。
6. **sprite 烘焙三条**：a) 缓存键=完整 key（`名字:帧`），新 sprite 忘加 painter 会画空白——`test/sprite.js` 断言每个 key ≥N 实心像素；b) 全部绘制走 fillRect 助手（_px/_rect/_disc），别用 arc/fill 路径（软件光栅化 stub 不支持）；c) 16×16 画布内作画，越界像素会被静默裁剪。
7. **实体坐标取整/边界**：玩家与天敌边界钳制都在 sim 内完成，渲染层不要改坐标；resize 走 `simResize`（会钳制全部实体），勿在 main 里单独挪实体。
8. **被抓击退不能删**：`_onCatch` 的击退（KNOCKBACK_*）是防「墙角永久钉死」的平衡修复——探针实测删掉后玩家会被连续抓到 2s 无敌一过就秒抓，直接退化到分子。动平衡前先跑 smoke 的「被抓加速退化」场景。
9. **分数冻结语义**：分子形态 `sim.time` 不再增长（`simUpdate` 的 molecule 分支），任何「分子形态继续涨分」的想法都违背已拍板设计（无限遨游、分数冻结、手动终局）。
10. **移动端约定**（沿 game-maker-checklist）：touch 监听挂 `document`（`isUiTarget` 排除 button/.screen）、passive:false 才能 preventDefault、touch-action:none + position:fixed 锁页面、resize 防抖 120ms。摇杆半径 44px 与 `simSetInput` 归一化配合。

## 3. 代码地图

| 文件 | 职责 | 关键入口 |
|------|------|---------|
| config.js | BUILD_ID、FORMS 四形态（key/name/multLabel/speed/radius/dash）、MULTIPLIERS 累计倍数、MOLECULES 三分子（folk/formal/formula/atoms/sigma/damp/vmax/sound）、PREDATORS（下标=形态，分子为 null）、SIM 全部数值、DEVOLVE_TOASTS 文案模板、OVER_QUIPS 分档吐槽 | 调数值先看这里 |
| rng.js | mulberry32 种子随机 `rngInit/rand/randRange/randn`（Box-Muller 正态，布朗运动用）、`hash2` 坐标确定性哈希（背景装饰撒点） | 测试固定 seed 42 |
| events.js | 事件总线 `onEvent/emit` | 逻辑→表现唯一通道 |
| sim.js | 全部游戏逻辑：`simInit/simStart/simEndRun/simResize/simSetInput/simDash/simUpdate`；玩家移动（牛马冲刺/草履虫纤毛摆动/分子布朗 OU 过程）、天敌 AI（追击摆动/水蚤猝发）、扫掠碰撞（中间点采样防穿越）、`_devolve` 退化链、`_predSyncCount` 天敌同步退化与补员、`_catalystTick/_mutate` 触媒变异、被抓击退 | 全局状态对象 `sim`（tests 直读） |
| sprites.js | 16×16 点阵图集：`getSprite(key)` 惰性烘焙（缓存 Map）、`drawSprite(ctx,key,cx,cy,face,scale)`（face=-1 水平翻转）、画家表 `_painters`（worker/monkey/paramecium/boss/gorilla/flea/mol/catalyst/decor）、ATOM_COLORS 原子配色 | `getSprite("worker:0")` |
| audio.js | 程序化音效 `sfx.init/play/speak`（init 必须由用户手势触发；speak 按分子连读音节发声） | `sfx.play("devolve")` |
| render.js | `drawScene(ctx, sim, t)`：背景色 + 装饰撒点（DECOR_CELL 44px 格 hash 确定性）+ 触媒/天敌/玩家贴图（无敌闪烁）+ 分子氛围粒子（globalAlpha 0.35） | 只 drawImage，不改逻辑 |
| main.js | 主入口 IIFE（`el` 首行防 TDZ）：画布 DPR 适配与 resize 防抖、键盘/摇杆输入、startRun/endRun 流程、事件接线（toast/sfx/按钮）、HUD 节流刷新、localStorage 纪录、固定步长主循环（SIM.STEP 1/60，每帧最多 6 步补帧） | `startRun()` |

## 4. 已踩过的坑（改相关代码前必读）

| # | 症状 | 根因 | 现行防线 |
|---|------|------|---------|
| 1 | 机器人在墙角被「无敌一过就秒抓」连环退化 | 被捕只加无敌无位移，天敌贴脸站着等 | `_onCatch` 击退（远离天敌+偏向场心），勿删 |
| 2 | smoke 走位流分数异常低（曾 9.6s 到分子） | 测试策略的 1/d 斥力长程 herd 玩家进角落 | 改 1/d² 近身斥力 + 质心/最近逃离 + 墙角向心力；策略属于测试资产，与游戏逻辑无关 |
| 3 | sprite 测试场景帧全空 | 测试里 canvas 忘设尺寸（默认 1×1 全裁剪） | sceneSolid 里显式 `cv.width=320` |
| 4 | vm 测试里 assert 未定义 | assert 忘注入 createContext sandbox | 两个 vm 测试都已 `{ console, assert }` 注入 |
| 5 | devolve caught 文案拿不到天敌名 | catch 事件先于 devolve 事件，但文案在 devolve 里拼 | main.js 用 `_lastPredName` 缓存 catch 事件携带的名字 |
| 6 | toast 重复弹两次 | devolve 事件被注册了两个处理器 | 单一处理器，改文案只改一处 |
| 7 | smoke 冻结时间阈值拍脑袋会随策略漂移 | 机器人能力与断言耦合 | 阈值 27 = 5 种子探针最低 29.1 − 2 余量（注释里有标定记录，world 工程同款惯例）；改机器人策略须重测 5 种子再改阈值 |

## 5. 常见开发任务模板

**调平衡**：只改 `config.js` 的 SIM/FORMS/PREDATORS，然后 `cd dev && npm test`。注意 smoke 的 frozenTime 阈值是按当前数值标定的——改天敌速度/数量/成长会直接影响，重跑 `node dev/test/smoke.js` 看 FAIL 信息里的实测值再决定是改数值还是（确认新平衡合理后）改阈值并注明新标定。

**加新形态（扩退化链）**：FORMS 加条目 + MULTIPLIERS 加倍数 + PREDATORS 对应下标加天敌（或 null）+ sprites.js 加画家 + smoke 断言的退化次数/形态名同步改。注意 README 形态表和世界观倍数体系要自洽（草履虫 1 亿 → 分子再 1 万的倍数链是用户拍板的世界观，扩链要交用户确认）。

**加新分子彩蛋**：见铁律 5。

**加新事件**：逻辑层 `emit("xxx", data)` → main.js `onEvent("xxx", ...)` 订阅（toast/sfx/UI）。事件数据必须真的传（world 工程的历史教训）。

**改 UI/布局**：template.html（DOM+CSS）→ main.js 接线（`el()` 获取，必须在 IIFE 顶部 `el` 定义之后）。动效过渡 150-200ms cubic-bezier（checklist 约定）。

## 6. 修改工作流

```
改 dev/src/*.js → node dev/build.js → cd dev && npm test（三套全过）→ open index.html 人工验收
```

- 测试失败的处理顺序：先看是不是**新代码**破坏了既有语义（对照第 4 节坑表），再考虑断言本身是否需要随设计更新（改断言要说明理由并留下标定注释，禁止静默放松）
- 文档同步：改机制/数值必须同步 README.md（形态表/机制章节/更新日志加行）；版本号改 `dev/package.json` 的 version（BUILD_ID 徽章与 `<title>` 随构建自动注入）
- 不 git 提交（除非用户明确要求）；不碰本文件夹以外的任何文件

## 7. 当前状态快照（2026-10-10 交接 · v0.1.0 首发）

- 退化链四形态全部落地，三套测试 80 项断言全绿（smoke 24 + sprite 37 + entry 19）
- 分子形态：OU 布朗运动 + 三分子触媒变异 + 连读发声 + 手动终局按钮
- 移动端：虚拟摇杆 + 冲刺按钮 + iOS 锁滚动；桌面：键盘 + Enter 快捷开始
- 已知边界：smoke 的走位机器人是反应式力场策略（非智能），冻结时间 29~46s；人类理论满勤 60s。若未来把天敌 AI 改强（如预判拦截），须重新标定 smoke 阈值
