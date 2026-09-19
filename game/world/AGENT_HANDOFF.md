# AGENT HANDOFF · 小世界（tiny-world）接手文档

> 本文档写给接手本工程的 AI agent（或人类）。目标：10 分钟内建立完整心智模型，安全地继续开发。
> 详细游戏机制与数值表见同目录 `README.md`，本文档只讲「怎么改、什么不能碰、坑在哪」。

---

## 0. 项目一句话

浏览器单文件群岛文明模拟：小人自主生活，需求聚合驱动世界生成（建房/开荒/架桥/探索/聚落演化），无限地图，零依赖零资源文件。

## 1. 上手三件事（先跑通再改代码）

```bash
node dev/build.js        # 构建产物 → 根目录 index.html（改任何 src 后必须重新构建）
node dev/test/smoke.js   # 逻辑冒烟：headless 4000 sim 秒，10 项断言
node dev/test/entry.js   # 入口冒烟：stub DOM 跑构建产物启动链，7 项断言
node dev/test/voyage.js  # 航海专项：满载返航 / 低补给被困救援闭环，17 项断言
node dev/test/creature.js # 动物专项：老死 / 搁浅死亡与救援 / 繁衍 / 渔场 / 渔船 / 挖塘 / 运鱼 / 灌溉 / 岛数随机，27 项断言
node dev/test/explorer.js # 探索者专项：保底转职 / 前沿点亮 / 腿数解除，6 项断言
open index.html          # 人工验收（agent 每次修改完成后必须自动执行，见第 6 节）
```

- `index.html` 是**构建产物**，永远不要直接编辑
- 根目录只放三个东西：`index.html`（产物）、`README.md`（用户文档）、`AGENT_HANDOFF.md`（本文档）
- 一切工程文件在 `dev/` 下：`src/`（12 个模块）、`test/`、`template.html`、`build.js`、`package.json`

## 2. 架构铁律（违反 = 测试爆炸或运行时崩溃）

1. **逻辑层零 DOM 依赖**：`src/` 中 events/config/noise/path/world/tasks/creature/agent/sim 必须能在 node 里 headless 跑（`test/smoke.js` 依赖这一点）。禁止在逻辑层引用 `document/window/canvas`。表现层是 audio/render/main。
2. **通信只走事件总线**（`events.js` 的 `onEvent/emit`）：逻辑层 emit、表现层订阅。逻辑层**不知道**音频/UI 的存在。事件数据必须真的传（历史上 emit("discovery") 漏传岛对象导致原住民系统崩）。
3. **加载顺序即拼接顺序**（`build.js` 的 `logicFiles`）：events → config → noise → path → world → tasks → **creature** → agent → sim。同作用域拼接，函数声明提升可用，但 **const/let 有 TDZ**——`main.js` 里曾因 `const el` 在使用后才声明导致整个入口崩（黑屏/全零），`test/entry.js` 就是为防这类问题存在的。新增文件必须同时加进 `logicFiles`。
4. **新任务类型必须**：a) 加进 `tasks.js` 的 `TASK_DEFAULT_NEED`（漏了 = `need===undefined` 永不完工、占死名额——历史死锁 #1）；b) 进度类任务加进 `agent.js` `doWork` 的进度分支列表；c) 需要 tile 改造的走 `workTile`，需要圈地的加入 `tasksAdd` 的 SITE 列表。
5. **区域生成必须 chunk 对齐**：`generateRegion` 内部已做对齐扩展——绕过它直接写 chunk 会产生「半写 chunk」（bounding 只盖 chunk 一部分，其余格保持默认值 0 = VOID 且永不修复——历史死锁 #2）。
6. **点亮永不黑回**：VOID→DEEP 的转换记录在 `world.litCells`，`settleFarTile` 的三分支语义（reveal 点亮 / 首次 VOID / 重算保持原值）不要动。**发现岛显现必须用 combined litTest（探索斑块 ∪ 岛缘海圆）**——直接对矩形 bounding 做 reveal 全亮会留下方形亮海块（历史 bug）。
7. **发现只由居民点亮触发**：`generateRegion` 的 `noDiscover` 参数——视口生成（`processExplore`）、工程生成（`expand`/`genWorld`）一律传 `true`；只有 `revealArea`（居民探索）允许触发发现网格。漏传会导致「拖一下视角虚空冒岛」的叙事崩坏。
8. **资源计数 = 仓库库存**：采集/狩猎产出由小人 `carrying` 背包搬运，走到最近聚落 `deposit()` 才入 `settlement.stock`/全局粮池；死亡时背包散失。名册显示的就是这个库存。工程（BRIDGE/FILL）完工扣资源、库存不足在 `doWork` 与 `tasksTake` 双处挂起。
9. **生物引用用稳定 id**：`agent.id` 自增唯一（名册 `data-id`、查找用 `agents.find(id)`），`agents.indexOf` 会因死亡 splice 错位。
10. **视觉与逻辑时钟分离**：昼夜明暗用 `visualTod`（main.js 维护，增速封顶 **10×**）、波光用 `waveT`（暂停即静止）——两者经参数传入 `drawScene`，**勿在渲染层直接读 `world.timeOfDay` 或 `performance.now()`**；小人作息等逻辑仍用 `world.timeOfDay`（模拟时间，`isDaytime()` 勿动）。
11. **航海状态冻结需求**：`agent.state === "voyage"` 时 `update` 提前 return（坐标由船携带、hunger/energy 不衰减）——防止远航饿死；船实体在 `world.ships`（sailing/return/docked 三态 + 航程上限），靠岸/返航/清理见 `shipTick`；造船消耗联合木材 `SIM.SHIP_COST`。
12. **出生与测试种子**：`main.js` 用随机种子开局（每次新地图），`dev/test/*.js` 固定 `simInit(42)`——新增断言必须对任意 seed 稳定（禁止依赖具体人口数值，用范围/趋势断言；entry.js 的出生断言即因此用 `>= 12`）。

## 3. 代码地图

| 文件 | 职责 | 关键入口 |
|------|------|---------|
| events.js | 事件总线 | `onEvent(name,fn)` / `emit(name,data)` |
| config.js | 全部常量：tile 表 `T`+`TILE_META`（20 种）、模拟参数 `SIM`、物种寿命 `SPECIES_AGE`、时代 `ERAS`、航海参数 | 调数值先看这里 |
| noise.js | 种子随机 `rng/rand/randInt`、值噪声 `makeNoise().fbm`、`hash2(x,y)` | 确定性生成全靠它 |
| path.js | BFS 寻路（160×160 窗口、负坐标、blocked 检测） | `findPath(sx,sy,tx,ty)` |
| world.js | chunk 系统、`generateRegion`（两遍生成：海拔场+悬崖/洞穴，岛公式+发现网格+点亮）、`carveRiver` 河流、`expand` 扩张、tile 读写、资源库存与联合库存 | `tileAt/setTile/findSpot/ensureStock/revealArea/jointStock/jointConsume/carveRiver` |
| tasks.js | 任务系统 15 种（含 EXCAV 挖塘）：立项/领任务（职业匹配+任务老化+资源过滤）/完成结算（产出搬运语义） | `tasksAdd/tasksTake/tasksFinish/TASK_RESOURCE_COST` |
| creature.js | 十种生物实体（栖息地系统 `habitatOk`：游荡/逃跑疲劳/跟随/驯化/圈养/繁殖/狼捕食；野生繁衍分栖息地上限；老死；搁浅被困死亡——施工改变地形后等待救援或死亡，`carriedBy` 被人搬运） | `creatures` 数组、`populateIslandCreatures`、`habitatOk`、`wildBreedTick` |
| agent.js | 小人：个体属性（探索欲/勤劳）、喜好（explore/homebody/animal/fishing/none）、职业（7 种可转职）、状态机、探索旅程、**航海（startVoyage）**、迁居、登岛命名即定居化、年龄死亡 | `Agent.update → decide / die / startVoyage` |
| sim.js | 调度核心：`plannerTick`（10 分支需求聚合 + 死任务清理）、**劳动力市场 `jobMarketTick`**、聚落演化、时代、出生、宴席、死亡清理、船舶 `shipTick` | `simInit / simUpdate / plannerTick / shipTick` |
| render.js | Canvas 渲染：tile 细节、小人/十种动物、工程进度、昼夜（visualTod）、地势亮度梯度、地区名标注、chunk 缩略图（zoom<0.4） | `drawScene` |
| audio.js | 程序化音效（振荡器合成，无音频文件） | `sfx.play(name)` |
| main.js | 主循环（固定步长，速度 0/1/2/10/100/1000 档）、Pointer Events 相机（拖拽/捏合/点按）、视觉昼夜 `visualTod`、波光时钟 `waveT`、视角跟随、点击拾取、信息面板、居民名册 | `focusAgent / handlePick / updateRoster / followMode` |

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

数值敏感点：农田真实产能 **6.6 人/块**（4 粮÷55s vs 0.011 粮/s/人），规划器按 6 人/块开荒；人口出生由「农田承载余量」驱动（`田×5 >= 人口+4`），只看存粮会导致繁荣-饥荒震荡。工程任务（BRIDGE/FILL）的资源消耗检查在 `doWork`（挂起）与 `tasksTake`（跳过领取）**双处**生效且都用**联合库存** `jointStock`，改一处必须改另一处；聚落本地库存（`settlement.stock`）含 food——**粮食城市内共享**（进食/出生/宴席城内结算，`totalFood()` 仅为全局视角指标），木/石/沙仍走联合库存结算；名册展示各城自己的库存。

## 5. 常见开发任务模板

**加一种新 tile**：
1. `config.js`：`T.XXX` 编号 + `TILE_META` 项（`walk`/`diggable`/`fillable` 等标志）
2. `world.js`：需要生成散布就在 `generateRegion` 地形分支加概率；需要库存就建 Map + 再生 tick
3. `render.js`：`drawScene` tile 链加绘制分支（记得远景缩略图 `chunkThumb` 会自动用 `TILE_VARIANTS` 底色）
4. `node dev/build.js` + 测试

**加一种新任务类型**：见架构铁律 4；采集类（GATHER 模式）在 `tasksFinish` 结算收益；追踪类（HUNT 模式）绑 `t.creature` 并在 `doWork` 走实时追踪分支。

**加一种新资源**：`settlement.stock` 加字段（`ensureStock`）→ 获取途径（任务产出）→ 消耗点（`TASK_RESOURCE_COST` 或直接扣）→ 规划器低于阈值自动立项 → 名册显示（`updateRoster`）。

**加一个新 UI 面板**：`template.html` 加 DOM+CSS → `main.js` 用 `el()` 获取（**必须在 IIFE 顶部 `el` 定义之后**）→ 数据节流刷新（参考 `updateRoster` 的 0.6s 模式）→ 用户手势交互走事件委托。

**调平衡**：只改 `config.js` 的 `SIM`，然后跑 `smoke.js` 看断言（断言失败先看是不是数值把节奏拖过了 4000 秒窗口）。

## 6. 修改工作流

**子 agent 分发约定**：接到修改任务（单个或多个）时，主 agent 下发**子 agent 去执行**——多个任务拆分给多个子 agent（相互独立的可并行，有依赖的按序串行）。每个子 agent 负责：修改 `dev/src/*.js`、跑相关回归测试、并**顺道更新本交接文档（第 4/7 节）与 README** 中受影响的内容。主 agent 在**所有子 agent 都执行完毕**后收口：统一 `node dev/build.js` → 跑全套回归（smoke/entry/voyage/creature/explorer）→ 全部通过后**只打开一次网页**。

```
主 agent 拆分任务 → 下发子 agent（各自：改代码 + 跑回归 + 更新 HANDOFF/README）
→ 全部子 agent 完成 → node dev/build.js    （产物刷到根目录 index.html）
→ node dev/test/smoke.js   （逻辑回归，10 项）
→ node dev/test/entry.js   （入口回归，7 项）
→ node dev/test/voyage.js  （航海回归，17 项）
→ node dev/test/creature.js（动物回归，27 项）
→ node dev/test/explorer.js（探索者回归，6 项）
→ open index.html          （运行游戏，只开一次）
```

**强制约定：所有子 agent 执行完毕且收口回归（build + 测试全过）后，必须自动执行 `open index.html` 打开浏览器运行游戏供用户验收**——不要等用户要求，也不要只在汇报里说"可以人工验收"；子 agent 未全部完成前不要提前打开。测试失败则由对应子 agent 先修复，全部通过后照常打开。

测试失败的处理顺序：先看是不是**新代码**破坏了既有语义（对照第 4 节死锁表），再考虑断言本身是否需要随设计更新（改断言要说明理由，禁止静默放松）。

## 7. 当前状态快照（2026-09-20 交接）

- 已实现：无限 chunk 地图（探索点亮不规则斑块 + 发现岛 + 原住民 + 登岛命名即定居化 + 河流/悬崖/洞穴/瀑布/地势亮度渲染）、小人个体属性（探索欲/勤劳）与喜好（向往远方/恋家/喜爱牲畜/垂钓）、职业分工（7 职业 + 劳动力市场自动转职）、任务系统 **15 种**、四线食物体系（农田/浆果采集与培育/捕鱼/狩猎畜牧围栏）、聚落资源库存（木/石/沙/粮，搬运回仓制 + 联合库存；**粮食城市内共享**，各城独立粮仓）、聚落 4 级演化+功能分区+高楼社区、时代 5 档、**死亡机制（老死/病亡/痊愈）**、十种生物图鉴（含狼捕食生态、鲸、驯化狗）、**航海系统（码头/坐船出海/点亮开拓/靠岸定居 + 补给/被困/救援）**、居民名册（地区定位+人物对话框+视角跟随 F，跟随已在主循环实现平滑追踪）、程序化音效、历法（昼夜=月/12 月=年）、变速 0/1/2/10/100/1000×、缩放 0.1~6×（远景缩略图）、昼夜明暗封顶 10×、波光暂停即静止、移动端触摸适配（单指拖拽/双指捏合/点按）、人口不设上限（疆土每 20 人生长，走廊 1 格细线）
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
- **粮食城市内共享**：`settlement.stock.food`（`ensureStock` 兜底），产出（农田/牧场/渔船/采集）进 `ownerSettle`（无半径最近聚落），进食只吃所在城市库存，出生检查出生城市存粮 ≥12，宴席由存粮最多的城市承担；HUD/闸门/告警用 `totalFood()`（全局视角指标）；world.food 已移除
- **挖塘/运鱼/灌溉**：`EXCAV` 任务（进度制）把陆格挖成水塘；渔场三级策略——①近岸野生鱼群原地圈养 ②`CAPTURE` 带 `dest` 从远处鱼群捕苗运往聚落近处水域圈养 ③无水域先挖塘；**农田 5 格内有水才能生长**（`farmTick` 门控 + `irrigated` 缓存 2s 节流，缺水停滞不倒退），FARM 立项先查水、无水先挖塘（`expandSpot(s, 2, 6)` 紧贴选址）
- **设施聚簇**：房挨房（`expandSpot` rMin=2 留走道）、田连田（rMin=1 紧贴），基准点=同聚落内最近的同类设施（`localFacilities` 用 `ownerSettle` 无半径归属——注意 nearestSettlement 有 SETTLEMENT_RADIUS 上限会误判无主）；新区预置（expand/登岛）围绕粮仓聚簇 + `planned` Set 防撞位；跨聚落天然不聚集
- **P0 修复（产出蒸发）**：`workTile` 完工时先 setTile 改写 tile → `tasksFinish` 重读 `was` 永远读到草 → **伐木/采石产出自游戏诞生起为零**；现由 `workTile` 返回 `{done, was}` 传入 `tasksFinish(t, agent, was)` 判定产出；配套修复：领任务入口 `deposit()` 保险（防产出被覆盖蒸发）、`die()` 遗产就地登记、领任务体力门控（`energy < 18+d×0.75` 不接，防远途过劳死）、`ENERGY_DECAY` 0.9→0.6、伐木危机升权（joint wood<8 时 score -200/单位）、造船木材安全余量（+12）、伐木储备线 25
- 渔船：渔民（垂钓喜好/渔民职业）驾小船近海捕捞（`boat:true`，state fishing/fishingReturn），起网扣 `fishStock`、渔获满舱 20 回港卸进就近城市粮仓、渔民休整 30s 再出港、上限 2 艘、造价 4 木；**所有人类单位贴边被动点亮**（agent `litCd` 节流 2.5s + 渔船同款，先探 VOID 邻格再 reveal，避免已点亮区白算 generateRegion）
- **探索者名额与前沿探索**：`jobMarketTick` 按人口/20 配置探索者（至少 1 名），缺额从人数最多的非探索者职业抽 adventure 最高者转职（**不抽 <2 人的独苗职业**，防止渔夫被抽干）；`decide` 分支 3.95 前沿螺旋：`findFrontier` 扫 80 格内「walkable 且 4 邻含 VOID」格 → 前往 → 大斑块点亮（12+adventure×6，含连击 2 次）；扫描 2 sim 秒节流（`frontScanT`/`frontCache`）；扫不到前沿 → 50% 概率走码头出海（航海回退）；探索者 `exploreLegs` 无上限、体力门控系数 0.4（其余 0.75）
- **性能模型（重要）**：高倍速语义为**尽力而为**——main.js 帧预算制（每帧模拟 ≤6ms CPU，超时丢弃积压，保底 1 步），1000× 不再承诺精确加速；HUD「实际速率」显示真实 sim 秒/真实秒；`SCHED.decideBudget`（config.js）在 speed>10 时每帧 20 次决策轮询（headless 测试默认 Infinity 不受影响）；`generateRegion` 缓冲模块级复用（`_grElev`，所有分支必须显式写 elev[li]）；`jointStock` 每 sim 秒缓存（`jointConsume`/`genWorld`/手动改库存后须 `jointStockDirty()` 失效）；speed>100 渲染隔帧
- 已知边界：各城粮仓无上限（宴席是主要出口）、无存档、小人死亡无墓地实体、野生兽群 `WILD_BREED_CAP=60` 全局共享、1000× 时帧率受模拟步进限制（每帧 1200 步上限）、航海撞岸点若无 walkable 邻居则转向绕行（水手不硬着陆）
- 种子：`main.js` `simInit(Math.floor(Math.random()*1e9))`（随机新地图）；测试固定 `simInit(42)`
