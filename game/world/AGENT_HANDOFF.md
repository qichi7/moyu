# AGENT HANDOFF · 小世界（tiny-world）接手文档

> 本文档写给接手本工程的 AI agent（或人类）。目标：10 分钟内建立完整心智模型，安全地继续开发。
> 详细游戏机制与数值表见同目录 `README.md`，本文档只讲「怎么改、什么不能碰、坑在哪」。

---

## 0. 项目一句话

浏览器单文件群岛文明模拟：小人自主生活，需求聚合驱动世界生成（建房/开荒/架桥/探索/聚落演化），无限地图，零依赖零资源文件。

## 1. 上手三件事（先跑通再改代码）

```bash
node dev/build.js        # 构建产物 → 根目录 index.html（改任何 src 后必须重新构建）
node dev/test/smoke.js   # 逻辑冒烟：headless 12000 sim 秒（120000 步 × 0.1s），11 项断言
node dev/test/entry.js   # 入口冒烟：stub DOM 跑构建产物启动链 + demo 契约/打断切换/沙盘绘制扫描 + 更新日志弹窗存在性，12 项断言
node dev/test/voyage.js  # 航海专项：满载返航 / 低补给被困救援闭环 / 船穿桥 / 岛际大桥立项与贯通，25 项断言
node dev/test/creature.js # 动物专项：老死 / 搁浅死亡与救援 / 繁衍 / 渔场 / 渔船 / 挖塘 / 运鱼 / 灌溉 / 岛数随机 / 牧场门与水生圈养排除 / 散养回栏与门通行 / 动物育龄 / deathReason 标注，47 项断言
node dev/test/explorer.js # 探索者专项：保底转职 / 前沿点亮 / 腿数解除，6 项断言
node dev/test/family.js  # 亲子专项：固定姓/去重/sex 确定性/随亲姓/出生点/育龄边界 19-20-60-61，40 项断言
node dev/test/pixel.js   # 渲染专项：软件光栅化跑 drawScene 与全套 sprite 烘焙，64 项断言
node dev/test/drink.js   # 饮品专项：口渴/状态差分/饮用结算/醉酒减速/咖啡田不产粮/face 朝向契约（含持锁迟滞），28 项断言（依赖 build 产物 .tmp_logic.js，先 node dev/build.js）
node dev/test/pack.js    # 背包专项：槽位合并/容量/haul 搬运链/deposit/工具与加成，41 项断言
node dev/test/mood.js    # 心情专项：衰减/喜好快乐/饮用分档/抑郁闭环/找乐子/宴席/余韵/迁居/意外死亡三分支，30 项断言（依赖 .tmp_logic.js）
node dev/test/species.js # 物种专项：新物种表/栖息地/上限守卫/驯化泛化/珍稀渔获/月光花光环/海豚追随，26 项断言（依赖 .tmp_logic.js）
node dev/test/park.js    # 娱乐专项：立项门槛/完工 tile/游乐园圈地浮台/设施补建/游玩闭环，26 项断言（依赖 .tmp_logic.js）
open index.html          # 人工验收（agent 每次修改完成后必须自动执行，见第 6 节）
```

- `index.html` 是**构建产物**，永远不要直接编辑
- 根目录只放三个东西：`index.html`（产物）、`README.md`（用户文档）、`AGENT_HANDOFF.md`（本文档）
- 一切工程文件在 `dev/` 下：`src/`（12 个模块）、`test/`、`template.html`、`build.js`、`package.json`

## 2. 架构铁律（违反 = 测试爆炸或运行时崩溃）

1. **逻辑层零 DOM 依赖**：`src/` 中 events/config/noise/path/world/tasks/creature/agent/sim 必须能在 node 里 headless 跑（`test/smoke.js` 依赖这一点）。禁止在逻辑层引用 `document/window/canvas`。表现层是 audio/render/main。
2. **通信只走事件总线**（`events.js` 的 `onEvent/emit`）：逻辑层 emit、表现层订阅。逻辑层**不知道**音频/UI 的存在。事件数据必须真的传（历史上 emit("discovery") 漏传岛对象导致原住民系统崩）。
3. **加载顺序即拼接顺序**（`build.js` 的 `logicFiles`）：events → config → noise → path → world → tasks → **creature** → agent → sim；表现层拼接序：audio → **sprites** → render → **demo** → main（v0.6.0 起 demo.js 参与 render 拼接，改 build.js 时勿漏）。同作用域拼接，函数声明提升可用，但 **const/let 有 TDZ**——`main.js` 里曾因 `const el` 在使用后才声明导致整个入口崩（黑屏/全零），`test/entry.js` 就是为防这类问题存在的。新增文件必须同时加进 `logicFiles`（或 render 拼接串）。
4. **新任务类型必须**：a) 加进 `tasks.js` 的 `TASK_DEFAULT_NEED`（漏了 = `need===undefined` 永不完工、占死名额——历史死锁 #1）；b) 进度类任务加进 `agent.js` `doWork` 的进度分支列表；c) 需要 tile 改造的走 `workTile`，需要圈地的加入 `tasksAdd` 的 SITE 列表。
5. **区域生成必须 chunk 对齐**：`generateRegion` 内部已做对齐扩展——绕过它直接写 chunk 会产生「半写 chunk」（bounding 只盖 chunk 一部分，其余格保持默认值 0 = VOID 且永不修复——历史死锁 #2）。
6. **点亮永不黑回**：VOID→DEEP 的转换记录在 `world.litCells`，`settleFarTile` 的三分支语义（reveal 点亮 / 首次 VOID / 重算保持原值）不要动。**发现岛显现必须用 combined litTest（探索斑块 ∪ 岛缘海圆）**——直接对矩形 bounding 做 reveal 全亮会留下方形亮海块（历史 bug）。
7. **发现只由居民点亮触发**：`generateRegion` 的 `noDiscover` 参数——视口生成（`processExplore`）、工程生成（`expand`/`genWorld`）一律传 `true`；只有 `revealArea`（居民探索）允许触发发现网格。漏传会导致「拖一下视角虚空冒岛」的叙事崩坏。
8. **资源计数 = 仓库库存**：采集/狩猎/打水/伐木/采石/采沙产出经 `grantCarry`（tasks.js）入小人背包 **haul 槽**（`packAdd(pack, res, n, true)`，包满差额就地入库兜底），走到最近聚落 `deposit()` 清 haul 槽才入 `settlement.stock`；**个人口粮/饮品槽不上缴**；死亡时 haul 槽就地登记、个人物品散失。名册显示的就是这个库存。工程（BRIDGE/FILL）完工扣资源、库存不足在 `doWork` 与 `tasksTake` 双处挂起。
9. **生物引用用稳定 id**：`agent.id` 自增唯一（名册 `data-id`、查找用 `agents.find(id)`），`agents.indexOf` 会因死亡 splice 错位。
10. **视觉与逻辑时钟分离**：昼夜明暗用 `visualTod`（main.js 维护，增速封顶 **10×**）、波光用 `waveT`（暂停即静止）——两者经参数传入 `drawScene`，**勿在渲染层直接读 `world.timeOfDay` 或 `performance.now()`**；小人作息等逻辑仍用 `world.timeOfDay`（模拟时间，`isDaytime()` 勿动）。
11. **航海状态冻结需求**：`agent.state === "voyage"` 时 `update` 提前 return（坐标由船携带、hunger/energy 不衰减）——防止远航饿死；船实体在 `world.ships`（sailing/return/docked 三态 + 航程上限），靠岸/返航/清理见 `shipTick`；造船消耗联合木材 `SIM.SHIP_COST`。
12. **出生与测试种子**：`main.js` 用随机种子开局（每次新地图），`dev/test/*.js` 固定 `simInit(42)`——新增断言必须对任意 seed 稳定（禁止依赖具体人口数值，用范围/趋势断言；entry.js 的出生断言即因此用 `>= 12`）。
13. **Sprite 图集（sprites.js）三条铁律**：a) **缓存键 = 全部视觉输入**（tile/海拔档/hash 变体/动画帧/楼层/石砌/粮仓/亮窗/姿态/果量/**视图**；小人分层缓存键含 pose/性别/发型/背包资源，f 腿层另含肤色），漏键 = 复用错图；b) **`shade()` 只吃 hex**——产出的 `rgb(...)` 字符串再喂回 `shade()`/`stampArt` 调色板会变 NaN 色（必须走 `shadeHex` 或由调用方预着色，历史 bug ×2：池塘波纹、小人暗部）；c) 渲染缩放语义：zoom≥1 关平滑（方块感）、0.4~1 开平滑、<0.4 缩略图关平滑——勿在 drawScene 外部改 `imageSmoothingEnabled`。小人/动物按 `face` 取视图（down=front/up=back/左右=side+left 水平镜像，**face undefined 容错按 "right"**）；船内划手固定 side 视图（船体旋转已带方向感）。渲染回归用 `test/pixel.js`（软件光栅化，能抓全空 sprite/NaN 色；S6 类契约断言未落地时自动 SKIP、落地后半成品如实 FAIL）。
14. **生物位置取整一律 Math.floor**（v0.5.0）：实体坐标是 tile 中心 +0.5，`Math.round(10.5)=11` 会向东偏一格——岸边生物被误判「假搁浅」→ 救援吸干劳动力 → 农田停摆饥荒（round/floor 家族，同死锁 #20）。habitatOk 的搁浅判定与 moveBy 的移动判定双处都要 floor。
15. **生物生成必带上限**（v0.5.0）：generateRegion 的 hash 散布与 populateIslandCreatures 的每岛散布都要查 `SIM.SPECIES_CAP` 全局计数；鱼点登记（fishStock）与鱼群实体解耦——上限只限实体，渔场经济资源恒定登记。死生物必须从 `creatures` 数组退场（simUpdate 内 splice），否则尸体会被全表扫描白白遍历（性能杀手）。
16. **任务冻结必须有出口**（v0.5.0）：追踪/采集类（HUNT/CAPTURE/GATHER/FISH/FETCH_WATER/PLANT/PLANT_BERRY/EXCAV）冻结 180s、DIG 300s 按 `freezeTotal`（永不重置——60s 自愈会清 freezeAge，别用它做放弃判定）放弃撤销；DIG 自愈 5×5 撒种受 40 条总量护栏；goTo 的 blocked 补救立项同受护栏。否则跨海不可达目标会让任务表永动膨胀（观测 259 条、plannerTick 单次 10ms）。

## 3. 代码地图

| 文件 | 职责 | 关键入口 |
|------|------|---------|
| events.js | 事件总线 | `onEvent(name,fn)` / `emit(name,data)` |
| config.js | 全部常量：tile 表 `T`+`TILE_META`（24 种，新增水井/酒坊/压榨坊/烘焙坊）、模拟参数 `SIM`——含**口渴/饮品链**（`THIRST_DECAY`、状态衰减系数 `STATE_HUNGER/ENERGY/THIRST`、`DRINK_RESTORE`、`DRUNK_TIME/DRUNK_SPEED_FACTOR/BEER_HUNGER_FACTOR`、`COFFEE_TIME/COFFEE_ENERGY_FACTOR`、`DEHYDRY_TIME`）与**咖啡田**（`COFFEE_MATURITY/COFFEE_YIELD`）、物种寿命 `SPECIES_AGE`、时代 `ERAS`、航海参数、背包 `PACK_RESTOCK/PACK_LOW/PACK_STACK/PACK_RESTORE/PACK_TOOL_BONUS/PACK_JUICE_ENERGY` | 调数值先看这里 |
| noise.js | 种子随机 `rng/rand/randInt`、值噪声 `makeNoise().fbm`、`hash2(x,y)` | 确定性生成全靠它 |
| path.js | BFS 寻路（160×160 窗口、负坐标、blocked 检测） | `findPath(sx,sy,tx,ty)` |
| world.js | chunk 系统、`generateRegion`（两遍生成：海拔场+悬崖/洞穴，岛公式+发现网格+点亮）、`carveRiver` 河流（逐格登记 `world.rivers` 惰性 Set，河流信息框/渲染/直饮判定用）、`expand` 扩张、tile 读写、资源库存（`ensureStock` **9 字段**：wood/stone/sand/food/water/juice/beer/coffee/beans，缺失字段统一补 0）与联合库存、世界纪事 `logMsg`（每条递增单调计数 `world.logSeq`——logs 截断 200 条后 length 恒定，HUD 判刷新必须用 logSeq） | `tileAt/setTile/findSpot/ensureStock/revealArea/jointStock/jointConsume/carveRiver/logMsg` |
| tasks.js | 任务系统 **23 种**（新增水井/酒坊/压榨坊/烘焙坊 4 建筑 + 打水/榨汁/酿酒/烘咖啡 4 制作；FARM 可带 `crop:"coffee"` 透传成咖啡田，消费方须容错缺省）：立项/领任务（职业匹配+任务老化+资源过滤）/完成结算；**成本结算两类**——BRIDGE/FILL 走联合库存（doWork 挂起 + tasksTake 跳过双处）；榨汁/酿酒/烘咖啡走**所属城市库存**（tasksTake 领取过滤 + tasksFinish 完工扣除双处，缺料钳 0 防负库存；产出直接入库不走搬运；打水走背包搬运回仓）；**产出经 `grantCarry` 入背包 haul 槽**（v0.4.1 槽位制，包满差额就地入库） | `tasksAdd/tasksTake/tasksFinish/TASK_RESOURCE_COST/grantCarry` |
| creature.js | 十种生物实体（栖息地系统 `habitatOk`：游荡/逃跑疲劳/跟随/驯化/圈养/繁殖/狼捕食；野生繁衍分栖息地上限；老死；搁浅被困死亡——施工改变地形后等待救援或死亡，`carriedBy` 被人搬运）+ **四方向朝向**（`updateFace` 走统一入口 `faceTurn` 持锁迟滞，按实际位移主轴更新、被挡不动保持；逃跑/游荡/跟随各移动路径实际位移才更新）+ **散养/育龄/死因（v0.6.2）**：`breedAgeOk` 幼年不育/老年停育（无寿命表物种不限，四处亲代池过滤）、updatePasture 散养 roam 11/4 + 离心 >6 确定性回栏 + moveBy 放行 GATE 门格、死亡点标注 `deathReason` | `creatures` 数组、`populateIslandCreatures`、`habitatOk`、`wildBreedTick`、`breedAgeOk` |
| agent.js | 小人：个体属性（探索欲/勤劳）、喜好（explore/homebody/animal/fishing/none）、职业（7 种可转职）、状态机、探索旅程、**航海（startVoyage）**、迁居、登岛命名即定居化、年龄死亡；性别（id hash 确定性）/父姓母姓记录/性别化名字池；**口渴与饮品（thirst/drunkT/coffeeT；`DRINK_ORDER` 城库取用顺序 coffee>juice>beer>water；drink 态原地 2 秒结算；`nearestWaterSpot` 水井/河湖直饮找水，圈扫 40 格结果缓存 2s；thirst<8 持续 40s 脱水病倒 `sickSource="thirst"`）**；**四方向朝向**（统一入口 `faceOf/faceTurn` 在 agent.js 顶层定义、creature.js 同作用域共用——`faceTurn` 带持锁迟滞：反向掉头立即切、90° 变向需 `faceHoldT` 满 0.8s（update 累计封顶 1、切换归 0 重计，undefined 视为 1 首设不受锁），`stepAlong` 按实际位移主轴更新 + `faceTo` 开工面向任务格（显式设向绕锁直设并重置计锁））；**随身槽位背包**（4 助手 `packCount/packAdd/packTake/packFree` + `packHaulCount` 为唯一读写入口，资源/工具/补给全走助手） | `Agent.update → decide / die / startVoyage` |
| sim.js | 调度核心：`plannerTick`（10 分支需求聚合 + **饮品链立项**（设施 era+人口≥8 门槛、粮仓周边全域唯一；打水/榨汁/酿酒/烘咖啡库存阈值触发；咖啡田扩种须 5 格内有水）+ **粮食产能口径排除咖啡田**（`foodFarms=!f.crop`，开荒线/出生线/进食点统一过滤，边界含等号语义未动）+ 死任务清理 + 亲子确定（**选亲育龄不分性别统一 20~60**，v0.6.4））、劳动力市场 `jobMarketTick`（builder 需求含 4 新工坊）、聚落演化、时代、出生、宴席、死亡清理、船舶 `shipTick`；**咖啡田独立结算**（farmTick：90s 产 2 豆进城市 beans，不产粮） | `simInit / simUpdate / plannerTick / shipTick` |
| render.js | 场景编排：drawScene 贴 sprite 图集 + 动态叠加层（工程进度/昼夜/分区底纹/地区名标注/选中环/瀑布）、**face→view 朝向映射与 left 翻转**（putLayer 包裹分层，影子/光环/状态粒子在翻转外）、**河流（水格三层判定：池塘→河流→海）/咖啡田（farmInfo 缓存 crop 变体）/四工坊（16×24 底部锚定）渲染，全部带契约未落地回退路径**、**醉酒 wobble**（sin 摆动+偶发 stumble，影子不随动）、**小人分层绘制与姿态分发 `agentPoseOf`（走/跑/吃/工具两帧/钓竿浮标/船内划手双桨固定 side/喝水 drink 两帧/酿造 brew 两帧/醉酒 stumble）**、动物朝向接线（drawC 翻转包裹/鱼群切线朝向）、chunk 缩略图（zoom<0.4）、缩放平滑语义（≥1 关/0.4~1 开） | `drawScene / agentPoseOf` |
| audio.js | 程序化音效（振荡器合成，无音频文件） | `sfx.play(name)` |
| sprites.js | 像素 Sprite 图集：全部 tile/房屋 24 变体/**小人分层像素系统三视图（`agentLook` 外观随机 + head/body/pants 三层 25 姿态 × 2 性别；body/pants front|back 归一 "vert"（中缝细节）、head front/side/back（双眼/侧脸/后脑）；新增 drink/brew/stumble 姿态）+ 背包 9 种（新增 water/juice/beer/coffee/beans）**/十种动物三视图（`QUAD_VIEW` 四足兽正/背视点阵 + turtle/whale/fish/bird 特例）/4 种船/**`riverSprite`（4 帧偏青绿）/`buildingSprite`（16×24 向上探出）/`coffeeFarmSprite`**/浪花抖动叠加层的 16×16 点阵惰性烘焙；色彩基建（shade/shadeHex/ELEV_TIERS/TILE_ELEV_VARIANTS/POND_VARIANTS/RIVER_VARIANTS）在此 | `tileSprite/waterSprite/pondSprite/riverSprite/houseSprite/buildingSprite/coffeeFarmSprite/propSprite/agentLook/agentBodySprite/agentPantsSprite/agentHeadSprite/agentHeadLieSprite/agentPackSprite/creatureSprite/shipSprite/foamSprite/ditherSprite` |
| demo.js | 机制演示引擎（v0.6.1 迷你沙盘版）：`DEMO_TOPICS` 10 主题 = 字符画布 `stage.rows`（STAGE_TILES 25 字符映射）+ `actors` 出场角色（man=agentLook 三层小人 / animal=creatureSprite / ship，moves 关键帧移动与朝向镜像）+ `fx`（label/ring 驯化环/heart/cloud/reveal/bridge 链生长/building 落成/cycle 轮播高亮）+ `hud` 覆盖条；播放器 `demoStart`（点击即打断切换）/`demoTick`（倍速 0.5~4×、完成自动打勾）/`demoRefreshMenu`/`demoWelcome`；绘制复用全局 sprite 图集；拼接在 render 之后 main 之前，**不进 .tmp_logic.js**（UI 层，entry.js 有契约+打断+绘制扫描断言） | `DEMO_TOPICS / demoStart / demoTick / demoRefreshMenu / demoWelcome` |
| main.js | 主循环（固定步长，速度 0/1/2/10/100/1000 档）、Pointer Events 相机（拖拽/捏合/点按）、视觉昼夜 `visualTod`、波光时钟 `waveT`、视角跟随、点击拾取、信息面板（**渴值条五档青蓝梯度（thirst 缺失整行隐藏）、状态行醉/咖啡标注、地块「河流 · 水源」判定（池塘优先）、meta 缺失兜底「建筑」**）、居民名册（**库存行含水/饮/酒/咖**）、**世界动态面板**（`collectActivities` 纯派生只读逻辑层 + `updateActivity` 0.6s 节流；九类活动目录，点击行随机 `focusAgent` 定位跟随）、**三面板折叠**（名册/纪事/动态标题 ▾/▸，内存态）、**纪事 HUD 判刷新用 `world.logSeq`（`\|\| logs.length` 容错回退）**、**死亡广播泛化（v0.6.3：信息框打开即广播、收 agent|creature，动物名兜底「一只」+物种名）**、**更新日志弹窗接线（v0.6.5：#changelog-btn/#changelog-modal，复用 help-btn 模式）** | `focusAgent / handlePick / updateRoster / updateActivity / collectActivities / packGridHtml / followMode / showDeathBroadcast` |

## 4. 已校准的死锁（改相关代码前必读）

| # | 症状 | 根因 | 现行防线 |
|---|------|------|---------|
| 1 | 建房停止、任务堆积 | 任务 `need===undefined` 永不完工占死闸门 | `TASK_DEFAULT_NEED` 兜底 |
| 2 | 虚空洞残留 | 非对齐 bounding 半写 chunk | `generateRegion` 内部 chunk 对齐扩展 |
| 3 | 走廊填海卡死 | 1 维直线任务四周全是水 | 防线已升级：跨水改链式 1 格宽桥线（见第 7 节「跨水通路」），自愈扩宽仅限 DIG（凹形山壁走廊） |
| 4 | 人口-农田互锁 | 开荒线与出生线区间不衔接 | 开荒 `田×5<人口+8` ≥ 出生线 `田×5>=人口+4`（边界含等号） |
| 5 | 工蜂化（能量 -5000） | 干活者被排除在需求结算外 | 需求优先级恒高于工作（decide 前 2 分支无 state 排除） |
| 6 | 黑屏/全零/时间停 | 入口函数 TDZ | `el` 在 IIFE 首行 + `test/entry.js` |
| 7 | 资源链瘫痪 | 聚落零启动资源，桥全挂起 | genWorld/expand 初始 stock（木40石15沙30 / 15/5/10） |
| 8 | 协作工人卡死+重复结算 | 一人完成任务后，同任务其他工人 `agent.task` 仍引用已死任务：改造类对废工地无限发呆、进度类重复结算（观测 2106 次挂引用/808 次卡死） | `tasksFinish` 遍历清空所有协同工人引用 + `doWork` 开头 `t.done` 防御网 |
| 9 | 拖视角虚空冒岛 | `processExplore`（视口生成）未传 `noDiscover`，意外触发发现网格 | 发现只由 `revealArea`（居民点亮）触发，其余生成路径一律 `noDiscover=true` |
| 10 | 出生冻结在 popCap-1 | 出生线 `田×5>人口+4` 在边界严格大于卡死 | 出生线改 `>=`；开荒选址半径扩至 26 |
| 11 | 桥一格都建不成 | BRIDGE 漏配 need（=0）+ 资源按最近聚落结算错配（桥格全在缺木聚落侧挂起，隔壁聚落木材闲置） | BRIDGE 补 need=3；国家级工程（BRIDGE/FILL）改联合库存 `jointStock/jointConsume`（跨聚落汇总扣费） |
| 12 | 牧场/采石场/沙场永不成 | 「落成型」建筑任务（PASTURE 等）走 `workTile` 磨血路径，SITE 无 diggable 语义 → 永远 false 无出口，工人名额满编卡死 | doWork 白名单反转：**仅 DIG 走 workTile**，其余任务一律进度制（新建筑任务自动免疫） |
| 13 | 远距离任务饥饿（如 CAPTURE 立项后无人执行） | 领任务按距离排序，近距离任务充足时远任务永远排不上 | 任务老化因子 `score -= age×3`（立项越久越优先）+ 动物逃跑疲劳（被追 8 秒减速 60%，追击必成） |
| 14 | 船冻结在原地不出航（水手永久 voyage） | 模块级 `const ships` 与 `world.ships` 割裂：shipTick 遍历前者（空），startVoyage/render 操作后者 | 已删除模块级常量，shipTick 内 `const ships = world.ships` 统一引用；新代码禁止再建平行数组 |
| 15 | 探索点亮呈方形亮块（历史 bug 复现） | world.js 曾存在两个同名 `revealArea`（后定义的矩形全亮版覆盖了噪声斑块版，JS 函数声明后覆盖前） | 已删除矩形版，只保留噪声斑块版（combined litTest）；同作用域禁重名函数 |
| 16 | 伐木/采石产出为零、木材经济崩溃 | `workTile` 完工时先 `setTile` 改写 tile，`tasksFinish` 再读 `was=tileAt()` 永远读到草——产出自游戏诞生起为零（初始 40 木库存掩盖） | `workTile` 返回 `{done, was}`，`tasksFinish(t, agent, was)` 用改造前 tile 判定产出；配套：领任务入口 `deposit()` 保险、`die()` 遗产就地登记、接任务体力门控、`ENERGY_DECAY` 0.6、伐木危机升权、造船木材余量 +12 |
| 17 | 工蜂化渴死（v0.3.0 预防） | 喝水判定若排在领任务之后，专注干活者会一路渴到脱水病倒 | 喝水分支 2.5 位于领任务前（与吃饭/睡觉同级，需求优先级恒高于工作）；且 `DEHYDRY_TIME`=40s 缓冲才病倒，`nearestWaterSpot` 结果缓存 2s 防连帧全图扫描 |
| 18 | **开局死亡螺旋（v0.3.0 集成回归，已修复）**：seed42 下开局 12 人曾在 t≈100~600s 大批死于脱水/饥饿（人口一度跌至 0~4，smoke 3 项 + voyage 1 项 FAIL；T1 插桩定位后修复，全套 8 套件复跑全绿，smoke 人口 12→35） | 三因叠加：①渴值快速衰减（walk 1.68/s）×「步行隧道视野」（decide 有目的地时不重入）——48 步 HUNT 往返途中渴值无人照看；②低体力 sleep↔idle 抖动期（isDaytime 即醒）睡觉分支无条件抢占吃喝，抖动期渴饿双归零；③夜间睡眠照常脱水（-69/夜）且睡中无法喝水，dehydrT 睡眠中照常累计 → 睡梦中病倒不治 | **行程预算抢救**（config.SAFE_THIRST=12/SAFE_HUNGER=8：decide 头部按剩余路程×1.5 冲刺包络推算抵达时渴/饿值，跌破即弃程先吃喝；目的地为水/食点豁免防抖动活锁）+ **分支 1 放行**（hunger/thirst ≥30 才允许睡，抖动期生命需求优先）+ **分支 3 行程门**（thirst<min(65,22+d×1.7)/hunger<min(55,18+d×1.3) 缓领任务，任务老化保证远任务仍被领）；配套 `seekDrink()` 提取共用。教训：叠加会衰减的新需求时，必须审查全部「移动隧道/睡眠/抖动」路径的需求可达性 |
| 19 | **世界记事面板永久停更（v0.3.1 修复）**：纪事一旦累积到 200 条封顶就再不刷新（前 200 条正常，之后冻结） | logs 截断在 200 条（`logMsg` 超 200 弹出最旧），`world.logs.length` 从此恒定不变；HUD 曾以 `logs.length !== lastLogLen` 判「有新日志」——达到上限后该判据**永假**，面板从此静默 | `world.logSeq` 单调计数（`logMsg` 内每条 +1，与截断无关），main.js 改用 `logSeq !== lastLogSeq` 判刷新且取 `world.logSeq \|\| logs.length` 容错回退（logSeq 未接入的旧产物退回 length 判据不崩）；smoke.js 断言 `logSeq >= 100` 兜底回归（日志断流即 FAIL）。教训：**以「容器长度变化」当变更信号的地方，凡容器有上限截断都会永久失效——必须用单调计数** |
| 20 | **负坐标 `\|0` 向零截断（v0.3.2 修复）**：开局同坐标连环渴死/饿死（10 连亡）、救援超时、寻路离奇失败 | 位置取整用 `\|0`：负坐标向零截断（y=-3 格的居民被当成 y=-2 行）——站草地被判进山体、寻路起点必败、gTo/选址全错行；探针实锤开局 10 连亡全在同一坐标 | **位置取整一律 `Math.floor`**（agent.js goTo/walkComponentHas/findEscapeSpot/闲逛基点、tasks.js tasksTake、sim.js 选址×2、world.js 发现岛锚点）；受困补「挤缝隙」脱身兜底。教训：**JS `\|0` 是向零截断不是向下取整，tile 坐标必须 Math.floor** |
| 21 | **物种扩容后人口崩到 0（v0.5.0 修复）**：smoke minPop=0、开局 144s 饥荒连环死亡、creature 鲸救援场景卡死 | 生物坐标 tile 中心 +0.5 但栖息地判定用 `Math.round`（10.5→11 向东偏一格）——岸边鱼/蟹/锦鲤被误判假搁浅（16 秒 19 只）→ 救援分支吸走 3-6 名工人 → 农田停摆 → 饥荒螺旋；叠加驯化 tameness 从未初始化（undefined+dt=NaN 永远 <3，**驯化自上线起静默失效**） | 生物位置取整统一 Math.floor（铁律 14）+ Creature 构造器初始化 tameness=0；教训：**给实体加新字段必须初始化，NaN 比较恒 false 是静默失效之王** |
| 22 | **性能雪崩：smoke 15 分钟超时（v0.5.0 修复）**：每步 1.1ms → 5ms，全套验证 >25 分钟 | 四处叠加：①死生物从不 splice（900+ 尸体被全表扫描遍历）；②鱼群生成无上限（211+）与每岛散布不受繁衍上限约束；③冻结任务永动膨胀（DIG 自愈每 60s 撒 24 个新任务 + 不可达 HUNT/CAPTURE 永久占位，259 条任务表）；④findFrontier 80×80 螺旋 + neighborsOf 每格分配数组（19.4s/万步）、每只可猎兽每帧遍历全部小人找威胁、资源选址 findSpot 每规划周期全扫 | 死者退场（simUpdate splice）+ SPECIES_CAP 生成/散布双处守卫 + freezeTotal 永不重置的放弃表（180/300s）与 40 条护栏 + findFrontier 内联 4 邻且 8s 节流 + 威胁 0.3s 缓存 + 资源选址 20s 节流 + tileAt 单槽 chunk 记忆 → smoke 189s |

数值敏感点：农田真实产能 **6.6 人/块**（4 粮÷55s vs 0.011 粮/s/人），规划器按 6 人/块开荒；人口出生由「农田承载余量」驱动（`田×5 >= 人口+4`），只看存粮会导致繁荣-饥荒震荡。**v0.3.0 产能口径已改**：咖啡田（`crop:"coffee"`）不产粮——开荒线/出生线/进食点统一按 `foodFarms`（`!f.crop`）过滤，**边界含等号语义未动**；咖啡田 90s 产 2 豆进城市 `beans`（90s/2 豆 = `COFFEE_MATURITY/COFFEE_YIELD`）。工程任务（BRIDGE/FILL）的资源消耗检查在 `doWork`（挂起）与 `tasksTake`（跳过领取）**双处**生效且都用**联合库存** `jointStock`，改一处必须改另一处；榨汁/酿酒/烘咖啡的制作成本（水/粮/豆）同理双处，但走**所属城市库存**（`ownerSettle`，非联合库存）。聚落本地库存（`settlement.stock`）含 food 与饮品链 9 字段——**粮食城市内共享**（进食/出生/宴席城内结算，`totalFood()` 仅为全局视角指标），木/石/沙仍走联合库存结算；名册展示各城自己的库存（含水/饮/酒/咖）。

## 5. 常见开发任务模板

**加一种新 tile**：
1. `config.js`：`T.XXX` 编号 + `TILE_META` 项（`walk`/`diggable`/`fillable` 等标志）
2. `world.js`：需要生成散布就在 `generateRegion` 地形分支加概率；需要库存就建 Map + 再生 tick
3. `render.js`：`drawScene` tile 链加绘制分支（记得远景缩略图 `chunkThumb` 会自动用 `TILE_VARIANTS` 底色）
4. `node dev/build.js` + 测试

**加一种新任务类型**：见架构铁律 4；采集类（GATHER 模式）在 `tasksFinish` 结算收益；追踪类（HUNT 模式）绑 `t.creature` 并在 `doWork` 走实时追踪分支。

**加一种新资源**：`settlement.stock` 加字段（`ensureStock`，现 **9 字段** wood/stone/sand/food/water/juice/beer/coffee/beans——新字段须同时加进初始字面量与兼容补 0 循环，两处缺一即旧聚落 NaN）→ 获取途径（任务产出：搬运型如打水 FETCH_WATER 走背包回仓，或制作型如榨汁/酿酒/烘咖啡走城市库存双处结算）→ 消耗点（`TASK_RESOURCE_COST` 或直接扣）→ 规划器低于阈值自动立项 → 名册显示（`updateRoster`）。

**加一个新 UI 面板**：`template.html` 加 DOM+CSS → `main.js` 用 `el()` 获取（**必须在 IIFE 顶部 `el` 定义之后**）→ 数据节流刷新（参考 `updateRoster` 的 0.6s 模式）→ 用户手势交互走事件委托。

**调平衡**：只改 `config.js` 的 `SIM`，然后跑 `smoke.js` 看断言（断言失败先看是不是数值把节奏拖过了 12000 秒窗口）。

## 6. 修改工作流

### 6.0 子 agent 分发策略（按任务规模选模式，v0.3.0 起固化）

**模式选择**（按「文件所有权零交集的独立子任务数」判定）：

| 子任务规模 | 模式 | 实例 |
|-----------|------|------|
| 1 个 | 单子 agent 串行 | 小改动 |
| 2 个 | **双 agent 并行**（各自改码+自跑回归+各自改文档，文件零交集即可并行） | v0.2.1 视觉/逻辑双线 |
| **≥3 个（或任一子任务跨多文件）** | **波次模式（N+2）** | v0.3.0 七码+测试+文档 |

**波次模式（N+2）**——大特性包的标准下发法：

**第一波：N 个并行代码 agent**（N=独立文件组数，上限≈文件数）
1. **文件所有权零交集**是并行前提：按文件拆（v0.3.0 实例：config+world / tasks / agent+creature / sim / main / sprites / render+pixel 七组）；同文件不可拆给两人
2. **契约逐字冻结**：跨 agent 的枚举值/函数签名/字段名/缓存键/状态值/数值常量，写成一节「冻结契约」逐字放进每份任务书；消费方一律 **falsy 容错**（契约方未落地时退化旧行为不崩）
3. **两个禁止**：禁跑 `node dev/build.js`（并发构建竞态，构建归第二波 T1 独占）；禁改 README/HANDOFF（N 方同文件冲突——文档更新点写进回报，交 T2 集中写）
4. 自验只做 `node --check` + 逻辑自洽检查；测试探针可用 **SKIP 机制**（依赖未落地自动 SKIP 不误报，参照 pixel.js 的 assertS6）

**第二波：T1 + T2 并行**
- **T1 全栈测试收口**：独占 build；运行/修复新测试；跑全套回归；**唯一持有多文件修改授权**（跨文件接缝修复）；修完必须复跑全套
- **T2 文档集中更新**：对照 `git diff` 核实代码实况（**不得轻信第一波回报**）后统一改写 README/HANDOFF；禁碰版本历史与「当前版本」行（归主 agent）；禁碰代码

**主 agent 最终收口**：①**亲自复跑全套回归裁定**——并行回报可能互相矛盾（时序快照差异，v0.3.0 实例：T1 称全绿而 T2 报 FAIL，实为 T2 读到修复前状态），以自己复跑结果为准；②修正文档中的过期标注；③版本号 + 版本历史；④复跑受影响套件；⑤`open index.html` 只开一次。

**已验证的教训（v0.3.0）**：
- 同文件大任务子 agent 可能**连续静默失败**（空回报、零改动）——两次即止损转主 agent 亲自执行（S6 教训）；怀疑点：源码行数过大疑似超子 agent 上下文，拆片重发或自己上
- 编辑工具锚点**禁止用短子串**（`    } else {` 是 8 空格行的子串，曾把代码插进错误函数）——锚点取带唯一标识的两行以上
- 行为性新需求（新增会衰减的需求/新决策分支）会使既有 rand() 调用序列漂移——契约里预先声明「数值断言为范围/结构型」；若要求逐位一致则新逻辑全部走 hash 确定性（v0.2.1 sex 字段先例）
- 契约消费方（如渲染层）的函数存在性用 `typeof x === "function"` + 内容探针双保险，防旧签名假绿

### 6.1 标准收口流程

```
主 agent 拆分任务 → 按规模选模式（6.0）下发
→ 全部子 agent 完成 → 主 agent：node dev/build.js    （产物刷到根目录 index.html）
→ node dev/test/smoke.js   （逻辑回归，11 项）
→ node dev/test/entry.js   （入口回归，12 项：启动链 + demo 契约/绘制扫描 + changelog 存在性）
→ node dev/test/voyage.js  （航海回归，25 项）
→ node dev/test/creature.js（动物回归，47 项）
→ node dev/test/explorer.js（探索者回归，6 项）
→ node dev/test/pixel.js   （渲染回归，64 项）
→ node dev/test/family.js  （亲子回归，40 项）
→ node dev/test/pack.js    （背包回归，41 项）
→ node dev/test/drink.js   （饮品回归，28 项）
→ node dev/test/mood.js    （心情回归，30 项）
→ node dev/test/species.js （物种回归，26 项）
→ node dev/test/park.js    （娱乐回归，26 项）
→ open index.html          （运行游戏，只开一次）
```

**看护矩阵（功能 → 套件，v0.6.0 审计后）**：生存需求=smoke+mood / 心情抑郁=mood / 饮品=drink+mood / 背包=pack / 任务与规划=smoke+park / 航海与船桥=voyage / 岛际大桥贯通=voyage 场景D / 动物生态=creature / 物种扩充=species / 娱乐链=park / 迁居与意外死亡=mood / 亲子=family / 探索者=explorer / 渲染=sprite=pixel / 启动链与演示=entry / 教程与弹窗=entry（stub 级）/ **圈养散养与动物育龄=creature（v0.6.2）** / **人类育龄=family（v0.6.4）** / **更新日志=entry（stub 级，v0.6.5）** / **死亡广播=人工验收（stub 级，v0.6.3）**。DOM 交互细节（轮播/信息栏布局/讣告展示）为 stub 级覆盖，需人工验收。

**强制约定：所有子 agent 执行完毕且收口回归（build + 测试全过）后，必须自动执行 `open index.html` 打开浏览器运行游戏供用户验收**——不要等用户要求，也不要只在汇报里说"可以人工验收"；子 agent 未全部完成前不要提前打开。测试失败则由对应子 agent 先修复，全部通过后照常打开。

测试失败的处理顺序：先看是不是**新代码**破坏了既有语义（对照第 4 节死锁表），再考虑断言本身是否需要随设计更新（改断言要说明理由，禁止静默放松）。

## 7. 当前状态快照（2026-09-22 交接 · v0.6.5 增量）

- **v0.6.5 更新日志**：template #changelog-modal 弹窗（23 条功能版本记录，纯修复版本 v0.2/v0.3.2/v0.5.5 不收录）+ 顶栏「日志」按钮 #changelog-btn——接线复用 help-btn 模式（toggle openModal/closeModal）+ 通用 data-close 委托关闭；`.cl-line b` 高亮版本号+标题
- **v0.6.4 育龄统一**：sim.js 出生选亲池**不分性别统一 20≤age≤60**（母池/父池同口径，0 岁新生儿天然不在内）
- **v0.6.3 死亡广播扩展**：updateInfoPanel 居民死亡分支去掉 followMode 条件——**信息框打开即广播**；生物死亡分支同样播报 `showDeathBroadcast(c)`；showDeathBroadcast 泛化收 agent|creature——name = 姓名 || 「一只」+物种名（CREATURE_META 查不到兜底「生物」）、deathReason falsy 兜底「与世长辞」；8 秒收起/点击致哀机制不变
- **v0.6.2 圈养散养与动物育龄**（creature.js + tasks.js）：updatePasture 陆生 roam 5→**11**（可经门出栏）、水生 2.5→**4**；离牧场中心 >**6** 格的陆生牲畜下一目标改**确定性回栏**（朝栏心 min(d,5) 直走，不掷随机角度、不消耗 rand 流）；moveBy 对圈养动物（this.pasture 非空）放行 **T.GATE 门格**（`habitatOk || (pasture && tileAt===GATE)`，野生语义不动）；顶层 `breedAgeOk(c)`——幼年（<stages[0]）不育、老年（≥stages[2]）停育、无 SPECIES_AGE 物种不限，updatePasture 繁殖 + wildBreedTick 四处亲代池统一过滤；生物死亡点标注 `deathReason` 六值（寿终正寝/搁浅身亡/被困于陌生的地形/成了狼群的晚餐/被狩猎/被钓起）；附带：updatePasture 目标格判定 Math.round→Math.floor（对齐铁律 14）；**收口接缝修复三处**——①moveBy 同时放行**栏心 PASTURE 地板**（圈养牲畜生于栏心 PASTURE tile、栖息地不含它，不放行会把陆生牲畜钉死在栏心一格——v0.5.3「出门溜达」对陆生从未生效的根因）；②wildBreedTick 上限计数恢复**全体个体**（breedAgeOk 只用于亲代挑选，否则老幼个体绕过 SPECIES_CAP 无限累积、species 套件超时）；③agent.js 初始年龄 randRange(16,45)→**randRange(20,45)** 对齐育龄下限（否则 seed42 仅 2 名育龄女性，抑郁早亡后全境断代、smoke 人口崩 0——初始 16~19 岁要 4 游戏年才够育龄，超出 12000s 窗口）
- **v0.6.1 演示迷你沙盘**：demo.js 重构——dStage 字符画布渲染器（STAGE_TILES 25 字符映射，底锚建筑/水动画/tileSprite 三路绘制）+ 角色系统（moves 关键帧段：from/to/anim，朝向由水平移动推导并镜像，man=agentLook 三层小人、animal=creatureSprite、ship=shipSprite）+ fx（label/ring 驯化环/heart/cloud/reveal/bridge 链生长/building 落成/cycle 物种轮播高亮）；**双栏面板**：demo-layout flex——左 #demo-list 滚动菜单（点击即打断 demoStart 切换，selected/✓ 高亮），右 #demo-right 固定沙盘（modal-box overflow hidden，仅左栏滚）；demoLastSpeed 跨主题保持倍速；完成自动打勾（demoTick 内 DEMO_DONE.add+refreshMenu）；「↻ 重播」按钮；entry.js 断言升级：画布行宽一致性 + 打断切换（mood→drinks t<0.2）+ 全主题全时段沙盘绘制扫描
- **v0.6.0 看护与教学（三任务一次发布）**：
  - **看护补齐**：迁居机制（mood.js 21）、意外死亡三分支（概率 config 化 `SIM.ACCIDENT`，mood.js 22 强制触发验证——**测试注意：y 向 half-up 取整要用 .4 偏移**）、岛际大桥 corridor 贯通（voyage.js 场景 D 驱动工匠实建 8+ 格含深海）；「看护矩阵」= 各功能 → 套件映射见 §6.1
  - **机制演示**：dev/src/demo.js（新文件，进 render 拼接链）——10 主题 × 时间轴 steps + draw 回调；main.js 打开弹窗即 setSpeed(0)（savedSpeed 关闭恢复）；demoTick 挂主循环 realDt；entry.js 新增 3 断言（契约 + 绘制扫描，sprite 用 stub）
  - **玩法教程**：template.html 静态弹窗（help-modal），main.js 开关接线；弹窗关闭统一走 data-close 委托 + 遮罩点击
- **v0.5.1~v0.5.9 九连小版本**：
  - **v0.5.1 岛际大桥**：planner 2f3——已命名岛屿对（中心距 ≤50、`world.interBridges` Set 去重、30s 节流）沿中心连线立项首格 BRIDGE（corridor 链式生长直达对岸即停，DEEP 亦可架）；立项条件=海上首格的前驱或邻格可站立
  - **v0.5.2 信息栏简化**：agentPanelHtml 重排——标题行合并（名/性别/年龄/职业）、状态行 tags 数组 join、四维条 `ip-bars` 2×2 网格（ip-b: 标签+条）、性格合并行；tier 文案函数保留未删
  - **v0.5.3 牧场门**：tasksFinish PASTURE 环上**必留门**（T.GATE=36 可走，优先南→正交→对角）；sim.js 2d 捕获过滤 `habitat !== "water"/"deep"`（水生走 2d2 渔场路径）；updatePasture 陆生游荡半径 2.5→5（出门溜达）
  - **v0.5.4 节奏放缓**：HUNGER_DECAY 0.55 / THIRST_DECAY 0.35（减半）；pack.js 数值契约同步更新
  - **v0.5.5 命名修复**：pickAgentName 两轮尝试（40+400，第二轮双字/三字放开）+ 终极兜底「姓+氏+序号」——「居民44」绝迹（旧兜底用 agents.length 会错位且不唯一）
  - **v0.5.6 兽不避人**：updateWild 逃跑/疲劳/猎犬围堵整体移除（meta.flee 字段保留未用）；狩猎纯工时
  - **v0.5.7 动态轮播**：main.js `actRot` 游标——每 0.6s 刷新轮换展示参与者（点击定位仍随机）
  - **v0.5.8 意外死亡**：agent.update 每秒掷骰（accCd）——临悬崖 1/20000 坠亡、近鲨 2.2 格 1/15000、eat 态 1/6000 噎死；die() 记录 `deathReason`
  - **v0.5.9 死亡广播**：被跟随（followMode）的小人死亡 → `showDeathBroadcast`（template #death-broadcast 横幅：姓名/死因/享年/地点=岛屿或城市/时刻），8 真实秒自动收起、点击致哀；死亡时 infoPanel/followMode 照旧清理
- **v0.5.0 大版本（心情 + 船桥 + 物种 + 娱乐，一次发布）**：
  - **心情系统**：`a.mood` 0~100（id hash 确定性起步 80~100，**不消耗 rand 流**）；`STATE_MOOD` 状态差分（work ×1.9）；`likedJoyOf`（agent.js 顶层）判定喜好匹配的快乐（explore=航海/BRIDGE/FILL/探索远行、animal=CAPTURE/PASTURE/牧羊邻近[pastureNear 1s 缓存]、fishing=FISH、homebody=守家、none=衰减 ×0.8）；睡眠回复 MOOD_SLEEP_REGEN；饮用分档（`SIM["MOOD_"+RES]`）；抑郁三计时器（depressT/moodOkT/depressAge）→ `sickSource="mood"` 走 60s 不治线；decide 分支 2.9 找乐子（`seekDrink(["beer","juice"])` 偏好参数，落空冷却 JOY_CD）；工作分支（3/3.5/3.8/3.95/4/2.8）全部 `!this.depressed` 门控；**航海喜悦必须插在 update 的 voyage 早退之前**
  - **船穿桥**：world.js 五处碰撞判定（sailing/return/rescue/fishing/fishingReturn）桥格视为水域 + 靠岸点搜索排除桥格——改船舶碰撞必须五处同改
  - **物种扩充 17 种**：CREATURE_META 数据驱动（tamable/tameJoy/flier/rare/fishJoy 标志）；`updateDog` 泛化为 tamable 通用驯化、`updateBird` 泛化为 flier；habitat "sand"；海豚追随船（updateDolphin）；散布在 populateIslandCreatures（上限守卫 underCap）+ generateRegion hash（cap 守卫）；`SIM.SPECIES_CAP` 驱动繁衍；**fishStock 与鱼群实体解耦**；sprites：四足兽进 QUAD_VIEW 自动得正/背视、flier 走 FLYER_PAL 点阵、其余手写 side+vert
  - **娱乐链**：tile 28~35（PAVILION/THEATER/ARENA/PARK_GATE/FERRIS/CAROUSEL/COASTER/PIER）；7 新任务（TASK_DEFAULT_NEED/SITE/taskJobPref→BUILD/taskToolOf→hammer 铁律全接线）；PARK 立项铺 SITE 全域 + waterCells 登记 → 完工水面转 PIER + 门楼 + `world.parks` 注册；planner 2f2 娱乐分支（单格设施 per-city 查重 settlementFacility + **busy 集合防同帧撞格**；游乐园选址先陆后海 3×3；园区设施每周期一项目 + **placed 短路**）；agent 分支 2.95 游玩（mood<45 必去 / <70 掷骰 0.15 / 粮荒 totalFood<pop×2 不玩 / PLAY_CD 120s）+ state "play"（decide 早退已含）+ cheerT 余韵（MOOD_CHEER_FACTOR 0.35）
  - **珍稀捕获喜悦**：FISH 完工查鱼点 1.5 格内 rare+fishJoy → 消耗 + 8 粮 + mood + fishJoy + 纪事
  - **驯化修复**：tameness 初始化（死锁 #21）
  - **性能护栏**（死锁 #22）：死者 splice / SPECIES_CAP / freezeTotal 放弃表 / findFrontier 内联+8s / 威胁 0.3s / 资源选址 20s（`_resScanTick`）/ tileAt 单槽记忆（ensureChunk 与 genWorld 换 Map 时失效）
  - 回归：mood.js 26 + species.js 21 + park.js 26；voyage +3（船穿桥场景 C）
- **背包系统（v0.4.0）**：每人 10 格随身背包 `a.pack`（food/water/juice/beer/coffee 堆叠 ×3 + rod/axe/pick/hoe/hammer ×1）——补给三触发点（吃饭结算/入库 deposit/领远任务 d>15，扣城库、工具不补）；路上自用（update 内 hunger/thirst<35 原地秒用不停步，包空才走 seekDrink/SAFE_* 老路，**睡眠中也可自用**——顺带封死锁 #18 的睡中脱水路径）；工具首次做对应工作经 tasksTake 挂钩自动领取（FISH→rod 扣联合木 1 不足照发、DIG伐木→axe、DIG石→pick、FARM→hoe、BUILD/BRIDGE/FILL/DOCK→hammer），永久持有，doWork/workTile 双进度路径共用 effort 源头 ×1.2；信息框 2×5 格子（packGridHtml，falsy 容错全暗格）；**渴节奏重调**：THIRST_DECAY **0.7**、DRINK_RESTORE 四项 **100**、直饮 100、drinkWait 1s（探针：直饮 -31%/城库饮用 -72%）；数值全在 config PACK_* 表；回归 test/pack.js 24 项。历史注：v0.3.2 曾报 THIRST_DECAY 落 1.1 但实文件未落（1.4 残留），v0.4.0 直落 0.7——**改 config 后必须 grep 复核实值**
- **槽位背包（v0.4.1）**：背包重构为**真·槽位制**——`a.pack = Array(10).fill(null)`，槽位 `null | {item, n, haul?}`；4 助手（agent.js 顶层 `packCount/packAdd/packTake/packFree` + `packHaulCount`）为唯一读写入口；同 item 同 haul 先合并、堆满开新格、**总容量 10 格**；堆叠消耗品/资源（wood/stone/sand 新增）×3、工具 ×1；**搬运系统并入**：`a.carrying` 已删除，tasksFinish 产出经 `grantCarry` 入 haul 槽（包满差额就地入库），`deposit()` 只清 haul 槽（个人口粮不上缴、无主时保留不蒸发），decide 搬运分支/die 遗产/render 叠加层/main「背着」行全部由 haul 槽派生；drink.js 的 zeroPack 改 `new Array(10).fill(null)`；回归 test/pack.js 41 项。**朝向修正（v0.4.1 末）**：鲸鱼/小鱼侧视图曾头尾反置（尾鳍画在右侧、与全游戏「头朝右」约定相反），bakeWhale/bakeFish 重绘；**鲸鱼喷水柱系 v0.2.0 像素化时遗失、已恢复**（相位 world.time，与缩放解耦）

- **v0.3.1 增量（三并行子 agent：记事停更修复 / 朝向持锁 / 动态面板）**：①**世界记事停更修复**——`world.logSeq` 单调计数（`logMsg` 内 +1），main.js 纪事 HUD 以 `logSeq !== lastLogSeq` 判刷新（`|| logs.length` 容错回退），见死锁 **#19**；②**朝向持锁迟滞**——统一入口 `faceOf/faceTurn`（agent.js 顶层，creature.js 同作用域共用）：反向掉头立即切、90° 变向需 `faceHoldT` 满 0.8s（各实体 update 累计封顶 1、切换归 0 重计），`faceTo` 开工面向绕锁直设；creature 逃跑/游荡/跟随各路径「实际位移才更新」同口径；drink.js 含锁行为断言（10c 持锁抑制 + 锁满自然转向）；③**世界动态面板**——右侧活动目录九类（航海/喝酒/喝咖啡/喝水/垂钓/搬运动物/牧羊/酿造/探索），`collectActivities` 纯派生只读逻辑层 + 0.6s 节流，点击行随机 `focusAgent` 定位跟随；**三面板折叠**（居民名册/世界纪事/世界动态标题 ▾/▸，收起状态仅存内存）；**信息框状态行**新增「搬运中：移动X」（`a.rescuing && a.rescuing.carriedBy === a` 派生，物种名查 `CREATURE_META[type].name`，查不到兜底「搬运动物中」）

- **像素画风（v0.2.0）**：全画面 16×16 细像素点阵——`sprites.js` 程序化烘焙（tile 21 种 × 海拔 5 档 × hash 4 变体惰性缓存、房屋 24 变体、小人 4 状态色 × 6 姿态（含躺睡/抡锤两帧）、十种动物、船 4 种、海岸浪花/草沙抖动叠加层）；`TILE_PX=16`；main.js resize 按 devicePixelRatio 烘焙 + template `image-rendering: pixelated`；缩放语义：zoom≥1 关平滑 / 0.4~1 开平滑 / <0.4 像素缩略图；水面 4 帧波纹动画（waveT 驱动，暂停冻结）；夜间亮窗（night>0.3）；鱼/鸟/鲸动画改用 `world.time`（旧版误用缩放值）；渲染回归 `test/pixel.js`（软件光栅化 stub：可重设尺寸 canvas + fillRect/drawImage/getImageData，断言全部 sprite 非空 + 场景帧色系）
- **饮品链（v0.3.0）**：4 新 tile（水井/酒坊/压榨坊/烘焙坊，T 表共 24 种）+ 8 新任务（4 建筑 + 打水 FETCH_WATER/榨汁 PRESS_JUICE/酿酒 BREW_BEER/烘咖啡 BREW_COFFEE，任务共 23 种）+ 库存扩 **9 字段**（新增 water/juice/beer/coffee/beans，`ensureStock` 兼容补 0）。立项规则：设施**全域唯一**且先建人口最多的城，一律立**粮仓周边**（`expandSpot(g,1,6,GRASS)` → `findSpot(g,1,8)` 兜底）；era 1/2/2/3 解锁且整组门槛人口 ≥8；检索不扫全图——`facilityNear` 沿各粮仓扫 ±9 格邻域（**tile 即真相，不设 wells/breweries 平行数组**）。触发阈值：存水 < pop×0.4（立在存水最少的有井之城）、酒/汁 < pop/12（酿酒另需粮食富余线 `60+pop×5` 与宴席同款）、咖啡 < pop/15 且全域 beans≥2；咖啡田 < pop/20 且 5 格内有水（**不为咖啡挖塘**，水源优先保粮田）。新建筑纳入 180s 冻结放弃清单（恢复草地）
- **口渴与状态消耗差分（v0.3.0）**：thirst 每秒 -1.4；hunger/energy/thirst 三项均按 `SIM.STATE_*` 状态系数差分（run 判定与渲染同口径：探索冲刺/速度>1.85/追猎任务 且 walk 态；eat/drink 等缺省态按 idle 兜底）。thirst<30 触发喝水（decide 分支 **2.5，先于领任务**——防工蜂化渴死）：城库按 `DRINK_ORDER`（coffee>juice>beer>water，有货优先喝高阶）去粮仓饮用，否则找水井/河湖直饮 +40（`nearestWaterSpot` 圈扫 40 格、结果缓存 2s）；drink 态原地 2 秒结算（期间 decide 跳过）。效果：麦酒醉 40s（移速 ×0.65、饥饿衰减 ×0.85、渲染 wobble+偶发 stumble）、咖啡 120s（体力衰减 ×0.55）、果汁 +10 精力、清水无副作用
- **脱水病倒（v0.3.0）**：thirst<8 持续 `DEHYDRY_TIME`（40s）→ 复用病倒机制（`sickSource="thirst"`），死亡文案「因脱水病倒，不治身亡」；**病倒恶化/痊愈判定已重构**：hunger/energy/thirst 三源 ailment 统一汇总，共用 60 秒不治线；脱水痊愈在原 hunger/energy>40 之上追加 `sickSource!=="thirst" || thirst>30`
- **四方向朝向（v0.3.0）**：agent/creature 均有 `face`（up/down/left/right，初值 "down"）——移动按本帧实际位移主轴更新（`stepAlong`/`updateFace`，被挡不动保持）；开工 `faceTo` 面向任务格；渲染 face→view 映射（down=front/up=back/左右=side+left 水平镜像，**undefined 容错按 "right"**）；船内划手固定 side 视图；鱼群 3 尾各自按绕行切线朝向选视图/翻转
- **渲染扩展（v0.3.0）**：sprites 三视图落地（body/pants front|back 归一 "vert" 含中缝细节、head front/side/back、25 姿态含 drink/brew/stumble、动物 `QUAD_VIEW` 正/背视点阵、背包 9 种）+ `riverSprite`（4 帧偏青绿）/`buildingSprite`（16×24 向上探出、底部锚定 tile）/`coffeeFarmSprite` 契约 API；render 水格三层判定（池塘→河流→海）、咖啡田走 `farmInfo` 缓存 crop 变体。**渲染层全部带未落地回退路径**（typeof 探测回退旧 tileSprite/tile 底图）——tile 契约与渲染契约解耦的参考模板；pixel.js 33→**52** 断言（S6 探针未落地自动 SKIP、落地后半成品如实 FAIL）
- **S6 教训（主 agent 救场）**：S6（sprites 三视图 + 河流/工坊/咖啡田渲染）两次下发子 agent 均静默空回报，最终由主 agent 亲自实现（sprites 全部视图维度 + render 动物朝向接线/drawC 翻转包裹/鱼群切线朝向）。**教训：同文件大任务连续两次子 agent 空回报时，应及时转主 agent 亲自执行，不要第三次下发**；另：编辑工具锚点勿用短子串（`} else {` 子串多匹配踩坑一次——锚点要带足上下文）
- 已实现：无限 chunk 地图（探索点亮不规则斑块 + 发现岛 + 原住民 + 登岛命名即定居化 + 河流/悬崖/洞穴/瀑布/地势亮度渲染）、小人个体属性（探索欲/勤劳）与喜好（向往远方/恋家/喜爱牲畜/垂钓）、职业分工（7 职业 + 劳动力市场自动转职）、任务系统 **23 种**、四线食物体系（农田/浆果采集与培育/捕鱼/狩猎畜牧围栏）、**饮品链（水井/酒坊/压榨坊/烘焙坊 + 打水/榨汁/酿酒/烘咖啡 + 咖啡田）**、聚落资源库存（木/石/沙/粮 + 饮品 5 字段，搬运回仓制 + 联合库存；**粮食城市内共享**，各城独立粮仓）、聚落 4 级演化+功能分区+高楼社区、时代 5 档、**死亡机制（老死/病亡/脱水/痊愈）**、十种生物图鉴（含狼捕食生态、鲸、驯化狗）、**航海系统（码头/坐船出海/点亮开拓/靠岸定居 + 补给/被困/救援）**、居民名册（地区定位+人物对话框+视角跟随 F，跟随已在主循环实现平滑追踪）、程序化音效、历法（昼夜=月/12 月=年）、变速 0/1/2/10/100/1000×、缩放 0.1~6×（远景缩略图）、昼夜明暗封顶 10×、波光暂停即静止、移动端触摸适配（单指拖拽/双指捏合/点按）、人口不设上限（疆土每 20 人生长，走廊 1 格细线）
- 航海补给机制：船带 `prov`（粮）按 `SHIP_PROVISION_RATE` 每秒消耗；出海装粮 `min(SHIP_PROVISION_LOAD, 码头所属城市库存)`，不足也出海（警告）；余量 < 回程所需×1.3 → 预留返航（正常情况永远够回家）；补给归零 → `stranded` 被困呼救（水手 voyage 冻结不会饿死）→ 主港城市存粮足够时自动派救援船（红旗）→ 会合送达 `SHIP_RESCUE_RESUPPLY` → 双双返航；救援船使命必达（prov 不设预留）
- 动物生态：野生繁衍分栖息地（陆生可猎+狼 ≤60 / 海龟 ≤12 / 鲸 ≤5）；老死（寿命耗尽后平均 3 天内离世）；施工改变地形致动物脚下失去栖息地 → 搁浅（不可移动 + 求救标记），180 秒无人救援死亡；居民（`decide` 分支 2.8，**优先于领任务**）认领救援 → `carriedBy` 搬运 → 从岸边送回最近栖息地；接近失败冷却 60s 重试；**鱼群可被 CAPTURE 圈养进水上渔场**（原地水域，圈养产粮+繁衍，`updatePasture` 水生分支走 `habitatOk`）；初始岛屿 3~7 随机（`genWorld`）
- **信息框跟随按钮**：`showPanel` 打开时同步 `syncFollowBtn()`——按钮显隐此前只在点击/F 键/死亡清理时刷新，残留的 display:none 会带到后续所有面板（表现为"有些生物没跟随按钮"）
- **跨水通路（细长桥线）**：跨海一律**链式 1 格宽桥线**——goTo 被水挡住时立项「首格」（blocked 必邻工人所站格，必可达）带 `corridor {dx,dy,remain}`（朝目标方向+剩余步数），完工后 `tasksFinish` 的 BRIDGE case 沿方向续立下一格（remain 递减到 0 停）；同海峡去重（`nearAny(b,[BRIDGE],25)` 内有桥不另起）；全域在建桥上限 40 格。**DEEP 深海只架桥不填**（meta 去 fillable 加 bridgeable，path.js 的 blocked 记录条件同步加 bridgeable）；**走廊工程（expand）已从 7 格宽条带收窄为 1 格细线**（水架桥/山开凿，不再 5×5 铺沙）；自愈扩宽仅限 DIG；FILL 冻结 180s 放弃恢复为水。**已知坑：tasksFinish 的 switch 里同名 case 会被前一个短路（BRIDGE 曾被 split 成两个 case，链式续立永不执行）**
- **池塘系统**：`world.ponds` Set 标记 EXCAV 水格，信息框显示「池塘 · 水源」、渲染青绿色（`POND_VARIANTS`，区别海蓝）；**池塘聚簇选址** `findPondSpot`（①邻水 ②近水缘 3 格 ③内陆兜底）+ `_lastPond` 连击（渔场下一塘贴上次的挖）+ 灌溉方向性（向最近天然水源的水缘挖，塘从水"长"向农田）；**小水域不架桥**：`waterRegionSmall` flood fill 连通 ≤4 格 → 立项填海，≥5 格才架桥；BRIDGE 渲染水面打底 + 木板留缝（桥下显水）
- **缩略图一致性**：`chunk.thumbDirty` 脏标记（setTile + generateRegion 置）+ `chunkThumb` 失效重建（每帧限 6 块）——tile 被点亮/施工改写后远景缩略图自动刷新；`world.ponds` 在缩略图同样呈青绿
- **点亮/扩张提速**：探索者名额 = 人口/20（至少 1）；前沿扫描 80 格 + 到达后连击（斑块边缘再点 2 处）；探索者体力门控系数 0.4（其余 0.75）；出生城市存粮门槛 12；扩张阈值每 20 人；**E5 边疆拓殖**（`_frontierCd` 30s）：探索者 home 距前沿 >50 格 → 迁往前沿 15 格内的空房，无房则 `expandSpot(front, 2, 8)` 立项边疆新居——房子跟着边界走
- **性能护栏**：点亮半径平方效应（1.5 倍半径 = 2.25 倍格数）曾拖垮 sim（15 分钟/测试）——`generateRegion` 海拔 fbm 按 `chunk.elev` 缓存（**仅 bump=0 的无岛影响格**用缓存，岛缘格必须重算否则发现岛会生成为海）；已生成格有海拔数据即跳过 fbm
- **地形保护（重要）**：`generateRegion` 的 inInfluence 重算与 `settleFarTile` 的 reveal 分支**只对 `tiles[i]===T.VOID` 的格生效**——已生成的房屋/道路/桥/农田/已点亮地形绝不被改写（此前洞穴/山体重算会吞房屋、点亮海域会吞人工路，且 houses 数组不回滚导致"隐形房屋"）；改地形生成逻辑必须保持这一语义
- **名字唯一**：人名（`_usedNames`）、原住民名（`_usedNative`，含双字扩展+编号兜底）、地名（`pickName` 查聚落+已命名岛屿；两字池 120 用尽自动三字 1200，再尽编号兜底——无限扩张不死循环）
- **亲子与性别（v0.2.1）**：sex 由 id hash 确定性推导（`hash2(this.id, 9172)`，不消耗 rand 流）、名字分男女池（`_GIVEN_M`/`_GIVEN_F` 各 10 字）、新生儿随父姓或母姓（`world.birthSeq` + `hash2(seq, salt)` 选亲，零 rand 消耗保持随机流逐位一致；父亲选取：同屋→同聚落（SETTLEMENT_RADIUS）→全体成年男，单亲随在世方）；出生点偏向母亲家（`findSpot(母亲家, 1, 4)`，无房走 findBirthSpot 兜底）；信息框显示性别与父母，名册带 ♀♂（`updateRoster` 两处名字条）；回归测试 `dev/test/family.js`。**v0.2.2：56 单姓+20 复姓（占比约 9%）、名池 24/24、agent.surname 字段化（复姓前缀检测），选亲直接继承 surname 字段**
- **粮食城市内共享**：`settlement.stock.food`（`ensureStock` 兜底），产出（农田/牧场/渔船/采集）进 `ownerSettle`（无半径最近聚落），进食只吃所在城市库存，出生检查出生城市存粮 ≥12，宴席由存粮最多的城市承担；HUD/闸门/告警用 `totalFood()`（全局视角指标）；world.food 已移除
- **挖塘/运鱼/灌溉**：`EXCAV` 任务（进度制）把陆格挖成水塘；渔场三级策略——①近岸野生鱼群原地圈养 ②`CAPTURE` 带 `dest` 从远处鱼群捕苗运往聚落近处水域圈养 ③无水域先挖塘；**农田 5 格内有水才能生长**（`farmTick` 门控 + `irrigated` 缓存 2s 节流，缺水停滞不倒退），FARM 立项先查水、无水先挖塘（`expandSpot(s, 2, 6)` 紧贴选址）
- **设施聚簇**：房挨房（`expandSpot` rMin=2 留走道）、田连田（rMin=1 紧贴），基准点=同聚落内最近的同类设施（`localFacilities` 用 `ownerSettle` 无半径归属——注意 nearestSettlement 有 SETTLEMENT_RADIUS 上限会误判无主）；新区预置（expand/登岛）围绕粮仓聚簇 + `planned` Set 防撞位；跨聚落天然不聚集
- **P0 修复（产出蒸发）**：`workTile` 完工时先 setTile 改写 tile → `tasksFinish` 重读 `was` 永远读到草 → **伐木/采石产出自游戏诞生起为零**；现由 `workTile` 返回 `{done, was}` 传入 `tasksFinish(t, agent, was)` 判定产出；配套修复：领任务入口 `deposit()` 保险（防产出被覆盖蒸发）、`die()` 遗产就地登记、领任务体力门控（`energy < 18+d×0.75` 不接，防远途过劳死）、`ENERGY_DECAY` 0.9→0.6、伐木危机升权（joint wood<8 时 score -200/单位）、造船木材安全余量（+12）、伐木储备线 25
- 渔船：渔民（垂钓喜好/渔民职业）驾小船近海捕捞（`boat:true`，state fishing/fishingReturn），起网扣 `fishStock`、渔获满舱 20 回港卸进就近城市粮仓、渔民休整 30s 再出港、上限 2 艘、造价 4 木；**所有人类单位贴边被动点亮**（agent `litCd` 节流 2.5s + 渔船同款，先探 VOID 邻格再 reveal，避免已点亮区白算 generateRegion）
- **探索者名额与前沿探索**：`jobMarketTick` 按人口/20 配置探索者（至少 1 名），缺额从人数最多的非探索者职业抽 adventure 最高者转职（**不抽 <2 人的独苗职业**，防止渔夫被抽干）；`decide` 分支 3.95 前沿螺旋：`findFrontier` 扫 80 格内「walkable 且 4 邻含 VOID」格 → 前往 → 大斑块点亮（12+adventure×6，含连击 2 次）；扫描 2 sim 秒节流（`frontScanT`/`frontCache`）；扫不到前沿 → 50% 概率走码头出海（航海回退）；探索者 `exploreLegs` 无上限、体力门控系数 0.4（其余 0.75）
- **性能模型（重要）**：高倍速语义为**尽力而为**——main.js 帧预算制（每帧模拟 ≤6ms CPU，超时丢弃积压，保底 1 步），1000× 不再承诺精确加速；HUD「实际速率」显示真实 sim 秒/真实秒；`SCHED.decideBudget`（config.js）在 speed>10 时每帧 20 次决策轮询（headless 测试默认 Infinity 不受影响）；`generateRegion` 缓冲模块级复用（`_grElev`，所有分支必须显式写 elev[li]）；`jointStock` 每 sim 秒缓存（`jointConsume`/`genWorld`/手动改库存后须 `jointStockDirty()` 失效）；speed>100 渲染隔帧
- 已知边界：各城粮仓无上限（宴席是主要出口）、无存档、小人死亡无墓地实体、野生兽群 `WILD_BREED_CAP=60` 全局共享、1000× 时帧率受模拟步进限制（每帧 1200 步上限）、航海撞岸点若无 walkable 邻居则转向绕行（水手不硬着陆）
- 种子：`main.js` `simInit(Math.floor(Math.random()*1e9))`（随机新地图）；测试固定 `simInit(42)`
