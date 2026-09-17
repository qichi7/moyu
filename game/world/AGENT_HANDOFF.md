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
open index.html          # 人工验收
```

- `index.html` 是**构建产物**，永远不要直接编辑
- 根目录只放三个东西：`index.html`（产物）、`README.md`（用户文档）、`AGENT_HANDOFF.md`（本文档）
- 一切工程文件在 `dev/` 下：`src/`（10 个模块）、`test/`、`template.html`、`build.js`、`package.json`

## 2. 架构铁律（违反 = 测试爆炸或运行时崩溃）

1. **逻辑层零 DOM 依赖**：`src/` 中 events/config/noise/path/world/tasks/creature/agent/sim 必须能在 node 里 headless 跑（`test/smoke.js` 依赖这一点）。禁止在逻辑层引用 `document/window/canvas`。表现层是 audio/render/main。
2. **通信只走事件总线**（`events.js` 的 `onEvent/emit`）：逻辑层 emit、表现层订阅。逻辑层**不知道**音频/UI 的存在。事件数据必须真的传（历史上 emit("discovery") 漏传岛对象导致原住民系统崩）。
3. **加载顺序即拼接顺序**（`build.js` 的 `logicFiles`）：events → config → noise → path → world → tasks → **creature** → agent → sim。同作用域拼接，函数声明提升可用，但 **const/let 有 TDZ**——`main.js` 里曾因 `const el` 在使用后才声明导致整个入口崩（黑屏/全零），`test/entry.js` 就是为防这类问题存在的。新增文件必须同时加进 `logicFiles`。
4. **新任务类型必须**：a) 加进 `tasks.js` 的 `TASK_DEFAULT_NEED`（漏了 = `need===undefined` 永不完工、占死名额——历史死锁 #1）；b) 进度类任务加进 `agent.js` `doWork` 的进度分支列表；c) 需要 tile 改造的走 `workTile`，需要圈地的加入 `tasksAdd` 的 SITE 列表。
5. **区域生成必须 chunk 对齐**：`generateRegion` 内部已做对齐扩展——绕过它直接写 chunk 会产生「半写 chunk」（bounding 只盖 chunk 一部分，其余格保持默认值 0 = VOID 且永不修复——历史死锁 #2）。
6. **点亮永不黑回**：VOID→DEEP 的转换记录在 `world.litCells`，`settleFarTile` 的三分支语义（reveal 点亮 / 首次 VOID / 重算保持原值）不要动。
7. **发现只由居民点亮触发**：`generateRegion` 的 `noDiscover` 参数——视口生成（`processExplore`）、工程生成（`expand`/`genWorld`）一律传 `true`；只有 `revealArea`（居民探索）允许触发发现网格。漏传会导致「拖一下视角虚空冒岛」的叙事崩坏。
8. **资源计数 = 仓库库存**：采集/狩猎产出由小人 `carrying` 背包搬运，走到最近聚落 `deposit()` 才入 `settlement.stock`/全局粮池；死亡时背包散失。名册显示的就是这个库存。工程（BRIDGE/FILL）完工扣资源、库存不足在 `doWork` 与 `tasksTake` 双处挂起。
9. **生物引用用稳定 id**：`agent.id` 自增唯一（名册 `data-id`、查找用 `agents.find(id)`），`agents.indexOf` 会因死亡 splice 错位。

## 3. 代码地图

| 文件 | 职责 | 关键入口 |
|------|------|---------|
| events.js | 事件总线 | `onEvent(name,fn)` / `emit(name,data)` |
| config.js | 全部常量：tile 表 `T`+`TILE_META`、模拟参数 `SIM`、时代 `ERAS` | 调数值先看这里 |
| noise.js | 种子随机 `rng/rand/randInt`、值噪声 `makeNoise().fbm`、`hash2(x,y)` | 确定性生成全靠它 |
| path.js | BFS 寻路（160×160 窗口、负坐标、blocked 检测） | `findPath(sx,sy,tx,ty)` |
| world.js | chunk 系统、`generateRegion`（岛公式+发现网格+点亮）、`expand` 扩张、tile 读写、资源库存 | `tileAt/setTile/findSpot/ensureStock/revealArea` |
| creature.js | 牛/羊/狗实体（游荡/逃跑/跟随/圈养/繁殖） | `creatures` 数组、`populateIslandCreatures` |
| tasks.js | 任务系统：立项/领任务（可做性优先）/完成结算 | `tasksAdd/tasksTake/tasksFinish` |
| agent.js | 小人：个体属性（探索欲/勤劳）、状态机、探索旅程、迁居、命名 | `Agent.update → decide` |
| sim.js | 调度核心：`plannerTick`（9 个分支的需求聚合）、时代演进、出生、宴席 | `simInit / simUpdate / plannerTick` |
| render.js | Canvas 渲染：tile 细节、小人/动物、chunk 缩略图（zoom<0.4）、昼夜 | `drawScene` |
| audio.js | 程序化音效（振荡器合成，无音频文件） | `sfx.play(name)` |
| main.js | 主循环（固定步长+100×档）、相机/缩放、点击拾取、信息面板、居民名册 | `focusAgent / handlePick / updateRoster` |

## 4. 已校准的死锁（改相关代码前必读）

| # | 症状 | 根因 | 现行防线 |
|---|------|------|---------|
| 1 | 建房停止、任务堆积 | 任务 `need===undefined` 永不完工占死闸门 | `TASK_DEFAULT_NEED` 兜底 |
| 2 | 虚空洞残留 | 非对齐 bounding 半写 chunk | `generateRegion` 内部 chunk 对齐扩展 |
| 3 | 走廊填海卡死 | 1 维直线任务四周全是水 | 7 格宽条带 + 冻结自愈（60s 扩前沿/180s 放弃） |
| 4 | 人口-农田互锁 | 开荒线与出生线区间不衔接 | 开荒 `田×5<人口+8` ≥ 出生线 `田×5>=人口+4`（边界含等号） |
| 5 | 工蜂化（能量 -5000） | 干活者被排除在需求结算外 | 需求优先级恒高于工作（decide 前 2 分支无 state 排除） |
| 6 | 黑屏/全零/时间停 | 入口函数 TDZ | `el` 在 IIFE 首行 + `test/entry.js` |
| 7 | 资源链瘫痪 | 聚落零启动资源，桥全挂起 | genWorld/expand 初始 stock（木40石15沙30 / 15/5/10） |
| 8 | 协作工人卡死+重复结算 | 一人完成任务后，同任务其他工人 `agent.task` 仍引用已死任务：改造类对废工地无限发呆、进度类重复结算（观测 2106 次挂引用/808 次卡死） | `tasksFinish` 遍历清空所有协同工人引用 + `doWork` 开头 `t.done` 防御网 |
| 9 | 拖视角虚空冒岛 | `processExplore`（视口生成）未传 `noDiscover`，意外触发发现网格 | 发现只由 `revealArea`（居民点亮）触发，其余生成路径一律 `noDiscover=true` |
| 10 | 出生冻结在 popCap-1 | 出生线 `田×5>人口+4` 在边界严格大于卡死 | 出生线改 `>=`；开荒选址半径扩至 26 |
| 11 | 桥一格都建不成 | BRIDGE 漏配 need（=0）+ 资源按最近聚落结算错配（桥格全在缺木聚落侧挂起，隔壁聚落木材闲置） | BRIDGE 补 need=3；国家级工程（BRIDGE/FILL）改联合库存 `jointStock/jointConsume`（跨聚落汇总扣费） |

数值敏感点：农田真实产能 **6.6 人/块**（4 粮÷55s vs 0.011 粮/s/人），规划器按 6 人/块开荒；人口出生由「农田承载余量」驱动（`田×5 >= 人口+4`），只看存粮会导致繁荣-饥荒震荡。工程任务（BRIDGE/FILL）的资源消耗检查在 `doWork`（挂起）与 `tasksTake`（跳过领取）**双处**生效且都用**联合库存** `jointStock`，改一处必须改另一处；聚落本地库存（`settlement.stock`）只用于名册展示与城内铺路（`buildTownRoads`）。

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

```
改 dev/src/*.js
→ node dev/build.js        （产物刷到根目录 index.html）
→ node dev/test/smoke.js   （逻辑回归，10 项）
→ node dev/test/entry.js   （入口回归，7 项）
→ open index.html          （人工看一眼）
```

测试失败的处理顺序：先看是不是**新代码**破坏了既有语义（对照第 4 节死锁表），再考虑断言本身是否需要随设计更新（改断言要说明理由，禁止静默放松）。

## 7. 当前状态快照（2026-09-17 交接时）

- 已实现：无限 chunk 地图（探索发现+原住民+登岛命名+河流/悬崖/洞穴/瀑布/地势渲染）、小人个体属性与喜好、职业分工（7 职业+任务加权）、任务系统 11 种、四线食物体系（农田/浆果采集与培育/捕鱼/狩猎畜牧围栏）、聚落资源库存（木/石/沙，搬运回仓制）、聚落 4 级演化+功能分区+高楼社区、时代 5 档、**死亡机制（老死/病亡）**、居民名册（地区定位+人物对话框）、程序化音效、昼夜、100× 变速、0.1~6× 缩放（远景缩略图）
- 已知边界：粮池无上限（宴席是主要出口）、无存档、小人死亡无墓地实体、动物无老死（寿命封顶）、野生兽群 `WILD_BREED_CAP=60` 全局共享、远景缩略图缓存不随施工失效（1.4px/格 下不可感知）
- 种子：`main.js` `simInit(随机)`；测试固定 `simInit(42)`
