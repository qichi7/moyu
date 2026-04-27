# GoodMorning 社交游戏 - 开发计划

---

## 项目概述

**游戏名称**：GoodMorning  
**游戏类型**：多人在线社交游戏  
**技术栈**：HTML5 Canvas + JavaScript + GitHub Gist API  
**核心特点**：基于Gist的高频实时数据同步、角色自定义、社交互动

---

## 架构设计

### 文件结构

```
goodmorning-game/
├── index.html          # 游戏入口和UI
├── style.css           # 样式文件
├── game.js            # 主游戏逻辑
├── gist-manager.js    # Gist数据管理
├── character.js       # 角色绘制和状态
├── map.js             # 地图系统
├── settings.js        # 设置界面
└── README.md          # 项目说明
```

### 核心类设计

```
┌─────────────────────────────────────────────────────────────┐
│                        Game (主类)                          │
├─────────────────────────────────────────────────────────────┤
│ - gistManager: GistManager                                  │
│ - characterManager: CharacterManager                        │
│ - mapManager: MapManager                                    │
│ - settings: Settings                                        │
│ - currentCharacter: Character                               │
│ - otherCharacters: Map<name, Character>                     │
├─────────────────────────────────────────────────────────────┤
│ + gameLoop(timestamp)                                       │
│ + update(deltaTime)                                         │
│ + render()                                                  │
│ + handleInput()                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     GistManager                             │
├─────────────────────────────────────────────────────────────┤
│ - statusGistId: string (硬编码)                             │
│ - positionGistId: string (硬编码)                           │
│ - mapGistId: string (硬编码)                                │
│ - token: string                                             │
├─────────────────────────────────────────────────────────────┤
│ + readStatus() → Promise<Object>                            │
│ + writeStatus(data) → Promise<boolean>                      │
│ + readPosition() → Promise<Object>                          │
│ + writePosition(data) → Promise<boolean>                    │
│ + readMap() → Promise<Object>                               │
│ + changeName(oldName, newName) → Promise<boolean>           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Character                               │
├─────────────────────────────────────────────────────────────┤
│ - name: string                                              │
│ - x: number, y: number                                      │
│ - gender: 'male' | 'female'                                 │
│ - height: number (0.8-1.2)                                 │
│ - hairStyle: string                                         │
│ - hairColor: string                                         │
│ - clothingStyle: string                                     │
│ - clothingColor: string                                     │
│ - chatMessage: string                                       │
│ - chatTimeout: number                                       │
│ - lastUpdate: number                                        │
├─────────────────────────────────────────────────────────────┤
│ + getDefaultStatus() → Object                               │
│ + draw(ctx, isCurrentPlayer)                                │
│ + updatePosition(x, y)                                      │
│ + setChat(message, duration)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据结构设计

### Gist 1: 状态信息 (status-gist.json)

```json
{
  "players": {
    "张三": {
      "gender": "male",
      "height": 1.0,
      "hairStyle": "short",
      "hairColor": "#333333",
      "clothingStyle": "casual",
      "clothingColor": "#3498db",
      "accessories": ["glasses", "watch"],
      "skinColor": "#f5d0c5",
      "chatMessage": "大家好！",
      "chatExpiry": 1714224000000,
      "lastUpdate": 1714224000000
    }
  }
}
```

### Gist 2: 位置信息 (position-gist.json)

```json
{
  "positions": {
    "张三": {
      "x": 150,
      "y": 200,
      "direction": "right",
      "lastUpdate": 1714224000000
    }
  }
}
```

### Gist 3: 地图信息 (map-gist.json)

```json
{
  "width": 50,
  "height": 50,
  "tileSize": 32,
  "tiles": [
    [1, 1, 1, 2, 2, 2, ...],
    [1, 1, 1, 3, 3, 2, ...],
    ...
  ],
  "tileTypes": {
    "1": { "name": "grass", "walkable": true, "color": "#7cba5f" },
    "2": { "name": "flower", "walkable": true, "color": "#f5a5d8" },
    "3": { "name": "water", "walkable": false, "color": "#5dade2" }
  }
}
```

---

## 状态信息默认值

```javascript
const DEFAULT_STATUS = {
  gender: 'male',           // 性别：male/female
  height: 1.0,              // 身高比例：0.8-1.2
  hairStyle: 'short',       // 发型：short/long/curly/bald
  hairColor: '#333333',     // 发色：十六进制颜色
  clothingStyle: 'casual',  // 衣服样式：casual/formal/sporty
  clothingColor: '#3498db', // 衣服颜色：十六进制颜色
  accessories: [],          // 配饰：glasses/hat/watch/earring
  skinColor: '#f5d0c5',     // 肤色：十六进制颜色
  eyeColor: '#4a4a4a',      // 眼睛颜色
  chatMessage: '',          // 聊天消息
  chatExpiry: 0,            // 聊天过期时间戳
  lastUpdate: Date.now()    // 最后更新时间
};

const DEFAULT_POSITION = {
  x: 100,
  y: 100,
  direction: 'down',        // 朝向：up/down/left/right
  lastUpdate: Date.now()
};

// 获取带默认值的状态
function getStatusWithDefaults(status) {
  return {
    ...DEFAULT_STATUS,
    ...status,
    // 确保accessories是数组
    accessories: status?.accessories || [],
    // 确保数值类型
    height: parseFloat(status?.height) || DEFAULT_STATUS.height
  };
}
```

---

## 刷新机制设计

### 刷新时间间隔配置

```javascript
const REFRESH_CONFIG = {
  statusReadInterval: 200,    // 状态读取间隔：200ms
  statusWriteOnUpdate: true,  // 状态修改时立即写入
  positionReadInterval: 200,  // 位置读取间隔：200ms
  positionWriteInterval: 200  // 位置写入间隔：200ms
};
```

### 数据同步流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      当前玩家循环                                │
├─────────────────────────────────────────────────────────────────┤
│  每200ms:                                                       │
│  1. 检测移动 → 如有移动，更新本地位置                            │
│  2. 写入位置gist → 保存当前位置                                 │
│  3. 读取位置gist → 获取其他玩家位置                             │
│  4. 读取状态gist → 获取其他玩家状态                             │
│  5. 如有状态修改 → 写入状态gist                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      其他玩家处理                               │
├─────────────────────────────────────────────────────────────────┤
│  每200ms:                                                       │
│  1. 从gist读取位置 → 更新otherCharacters位置                    │
│  2. 从gist读取状态 → 更新otherCharacters外观                    │
│  3. 检查聊天消息 → 显示/隐藏聊天气泡                            │
│  4. 过期玩家清理 → 超过10秒未更新的玩家标记为离线               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 详细任务列表

### 阶段一：基础架构搭建

#### 任务 1.1：创建项目文件
- [ ] 创建 index.html（游戏入口、UI结构）
- [ ] 创建 style.css（基础样式、响应式布局）
- [ ] 创建 game.js（主游戏类框架）
- [ ] 创建 README.md（项目说明）

#### 任务 1.2：Gist管理器实现
- [ ] 创建 gist-manager.js
- [ ] 实现三个Gist ID硬编码配置
- [ ] 实现Token输入和存储（sessionStorage）
- [ ] 实现readStatus()方法
- [ ] 实现writeStatus()方法
- [ ] 实现readPosition()方法
- [ ] 实现writePosition()方法
- [ ] 实现readMap()方法
- [ ] 实现changeName()方法（同步修改两个gist）

#### 任务 1.3：角色类实现
- [ ] 创建 character.js
- [ ] 定义角色状态默认值
- [ ] 实现角色绘制方法（Canvas）
- [ ] 实现根据状态绘制外观（性别、身高、头发、衣服等）
- [ ] 实现聊天气泡绘制
- [ ] 实现名字标签绘制

### 阶段二：核心功能开发

#### 任务 2.1：地图系统
- [ ] 创建 map.js
- [ ] 实现地图数据结构
- [ ] 实现地图绘制（草地、花草）
- [ ] 实现地图碰撞检测
- [ ] 预留房屋建造功能接口
- [ ] 创建默认地图gist数据

#### 任务 2.2：角色移动系统
- [ ] 实现轮盘控制器（虚拟摇杆）
- [ ] 实现键盘方向键控制
- [ ] 实现角色平滑移动
- [ ] 实现视角跟随（当前玩家居中）
- [ ] 实现地图边界处理
- [ ] 实现移动时位置写入gist

#### 任务 2.3：数据同步系统
- [ ] 实现定时读取位置gist
- [ ] 实现定时读取状态gist
- [ ] 实现状态修改时写入gist
- [ ] 实现其他玩家位置更新
- [ ] 实现其他玩家外观更新
- [ ] 实现过期玩家清理

### 阶段三：用户界面

#### 任务 3.1：登录/创建角色界面
- [ ] 实现Token输入界面
- [ ] 实现角色名称输入
- [ ] 实现角色创建流程
- [ ] 实现角色选择流程（已存在角色）

#### 任务 3.2：设置界面
- [ ] 实现设置面板UI
- [ ] 实现姓名修改功能
- [ ] 实现性别选择
- [ ] 实现身高调节
- [ ] 实现发型选择
- [ ] 实现发色选择
- [ ] 实现衣服样式选择
- [ ] 实现衣服颜色选择
- [ ] 实现配饰选择
- [ ] 实现刷新时间间隔设置

#### 任务 3.3：聊天系统UI
- [ ] 实现聊天输入框
- [ ] 实现发送聊天按钮
- [ ] 实现取消聊天功能
- [ ] 实现聊天消息显示在头顶
- [ ] 实现聊天消息自动过期

### 阶段四：优化和完善

#### 任务 4.1：性能优化
- [ ] 实现Canvas离屏渲染
- [ ] 优化gist请求频率
- [ ] 实现数据缓存策略
- [ ] 优化大量玩家渲染

#### 任务 4.2：移动端适配
- [ ] 实现响应式布局
- [ ] 优化触控体验
- [ ] 适配不同屏幕尺寸
- [ ] iOS Safari特殊处理

#### 任务 4.3：错误处理
- [ ] 网络错误处理
- [ ] Gist API限流处理
- [ ] 数据格式错误处理
- [ ] 玩家离线处理

#### 任务 4.4：测试和文档
- [ ] 功能测试
- [ ] 多人联调测试
- [ ] 编写README文档
- [ ] 编写使用说明

---

## 角色绘制设计

### 角色组成

```
      ┌─────────┐
      │  头发   │  ← 发型 + 发色
      ├─────────┤
      │  脸部   │  ← 肤色 + 眼睛
      ├─────────┤
      │  身体   │  ← 衣服样式 + 颜色
      ├─────────┤
      │  腿部   │  ← 裤子/裙子
      └─────────┘
      │ 名字   │  ← 底部名字标签
      └─────────┘
      │ 聊天   │  ← 头顶聊天气泡
      └─────────┘
```

### 身高影响

- height = 0.8 → 角色缩小20%
- height = 1.0 → 标准大小
- height = 1.2 → 角色放大20%

### 性别差异

- 男性：短发、裤子、较宽身体
- 女性：可选长发、裙子、较窄身体

### 发型样式

```javascript
const HAIR_STYLES = {
  short: '短发',
  long: '长发',
  curly: '卷发',
  bald: '光头',
  ponytail: '马尾',
  spiky: '刺头'
};
```

### 衣服样式

```javascript
const CLOTHING_STYLES = {
  casual: '休闲装',    // T恤 + 牛仔裤
  formal: '正装',      // 西装/衬衫
  sporty: '运动装',    // 运动服
  dress: '连衣裙',     // 裙子（女性）
  hoodie: '卫衣'       // 连帽衫
};
```

### 配饰系统

```javascript
const ACCESSORIES = {
  glasses: { name: '眼镜', position: 'face' },
  hat: { name: '帽子', position: 'head' },
  watch: { name: '手表', position: 'wrist' },
  earring: { name: '耳环', position: 'ear' },
  necklace: { name: '项链', position: 'neck' },
  backpack: { name: '背包', position: 'back' }
};
```

---

## 技术要点

### 1. Canvas绘制优化

```javascript
// 离屏渲染地图
class MapManager {
  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
  }
  
  prerenderMap() {
    // 预渲染地图到离屏canvas
    // 游戏循环中直接drawImage
  }
}
```

### 2. 视角跟随

```javascript
// 视角以当前玩家为中心
class Camera {
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
  }
  
  follow(target) {
    this.x = target.x - this.width / 2;
    this.y = target.y - this.height / 2;
  }
}
```

### 3. Gist API限流处理

```javascript
// 避免超过GitHub API限制
class GistManager {
  constructor() {
    this.lastRequestTime = 0;
    this.minInterval = 100; // 最小请求间隔100ms
  }
  
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}
```

### 4. 名称修改同步

```javascript
// 修改名称时同步更新两个gist
async changeName(oldName, newName) {
  // 1. 读取状态gist
  const status = await this.readStatus();
  
  // 2. 读取位置gist
  const position = await this.readPosition();
  
  // 3. 更新两个gist中的键名
  if (status.players[oldName]) {
    status.players[newName] = status.players[oldName];
    delete status.players[oldName];
  }
  
  if (position.positions[oldName]) {
    position.positions[newName] = position.positions[oldName];
    delete position.positions[oldName];
  }
  
  // 4. 写入两个gist
  await this.writeStatus(status);
  await this.writePosition(position);
}
```

---

## 风险评估

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Gist API限流 | 数据同步延迟 | 本地缓存 + 请求节流 |
| 网络延迟 | 体验不流畅 | 预测移动 + 平滑插值 |
| 并发写入 | 数据丢失 | 时间戳比较 + 合并策略 |
| 浏览器兼容性 | 功能异常 | Polyfill + 降级处理 |

### 性能风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 大量玩家 | 渲染卡顿 | 视口裁剪 + 批量渲染 |
| 高频请求 | API限流 | 本地缓存 + 合理间隔 |
| Canvas重绘 | 性能下降 | 脏区域渲染 + 离屏canvas |

---

## 开发计划时间表

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段一 | 基础架构搭建 | 2小时 |
| 阶段二 | 核心功能开发 | 3小时 |
| 阶段三 | 用户界面 | 2小时 |
| 阶段四 | 优化和完善 | 2小时 |
| **总计** | | **约9小时** |

---

## 验收标准

### 功能验收

- [ ] 玩家可以使用Token登录
- [ ] 玩家可以创建角色并自定义外观
- [ ] 玩家可以使用轮盘移动角色
- [ ] 玩家可以在地图上看到其他玩家
- [ ] 玩家可以发送聊天消息
- [ ] 玩家可以修改姓名和状态
- [ ] 玩家可以调整刷新时间间隔
- [ ] 数据能正确同步到Gist

### 性能验收

- [ ] 游戏帧率稳定在30fps以上
- [ ] 移动操作无延迟感
- [ ] 数据同步延迟在可接受范围

### 兼容性验收

- [ ] 桌面浏览器正常运行
- [ ] 移动端浏览器正常运行
- [ ] 不同屏幕尺寸正常显示

---

## 备注

1. **三个Gist需要提前创建**：
   - 状态gist: `status-gist.json`
   - 位置gist: `position-gist.json`
   - 地图gist: `map-gist.json`

2. **Token权限**：需要gist权限的GitHub Token

3. **默认刷新间隔**：200ms（可调整）

4. **玩家超时清理**：10秒未更新的玩家标记为离线

---

**创建时间**：2026-04-27  
**状态**：待审核