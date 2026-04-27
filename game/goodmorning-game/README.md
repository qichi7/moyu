# GoodMorning - 多人社交游戏

☀️ **GoodMorning** 是一个基于 GitHub Gist 的多人在线社交游戏。

---

## 游戏特点

- 🌐 **基于Gist的数据存储** - 使用GitHub Gist存储玩家数据和位置
- 👤 **角色自定义** - 自定义性别、身高、发型、衣服、配饰等外观
- 🎮 **实时移动** - 使用轮盘或键盘控制角色移动
- 💬 **社交互动** - 发送聊天消息与其他玩家交流
- 🔄 **实时同步** - 高频数据同步，实现多人在线体验

---

## 快速开始

### 1. 创建GitHub Token

访问 [GitHub Token设置](https://github.com/settings/tokens/new)，创建一个具有 `gist` 权限的Token。

### 2. 创建Gist文件

需要创建三个Gist文件：

#### 状态Gist (status-gist.json)
```json
{
  "players": {}
}
```

#### 位置Gist (position-gist.json)
```json
{
  "positions": {}
}
```

#### 地图Gist (map-gist.json)
```json
{
  "width": 50,
  "height": 50,
  "tileSize": 32,
  "tiles": [],
  "tileTypes": {
    "1": { "name": "grass", "walkable": true, "color": "#7cba5f" },
    "2": { "name": "flower", "walkable": true, "color": "#f5a5d8" }
  }
}
```

### 3. 配置Gist ID

将三个Gist的ID（URL最后一段）替换到 `game.js` 中的硬编码配置：

```javascript
static STATUS_GIST_ID = 'your-status-gist-id';
static POSITION_GIST_ID = 'your-position-gist-id';
static MAP_GIST_ID = 'your-map-gist-id';
```

### 4. 开始游戏

打开 `index.html`，输入Token和角色名称即可开始游戏。

---

## 游戏控制

### 移动控制
- **轮盘控制**：拖拽屏幕左下角的轮盘控制方向
- **键盘控制**：使用方向键或WASD移动

### 功能按钮
- **⚙️ 设置**：修改角色外观和刷新间隔
- **💬 聊天**：发送消息到头顶聊天框
- **🔄 刷新**：强制刷新所有玩家数据

---

## 角色外观系统

### 基本信息
- **性别**：男性/女性
- **身高比例**：0.8-1.2（影响角色大小）

### 头发
- **发型**：短发、长发、卷发、马尾、光头、刺头
- **发色**：自定义颜色

### 衣服
- **样式**：休闲装、正装、运动装、卫衣、连衣裙
- **颜色**：自定义颜色

### 配饰
- 眼镜、帽子、手表、耳环、项链、背包

---

## 数据同步机制

| 类型 | 操作 | 间隔 |
|------|------|------|
| 位置信息 | 写入当前位置 | 200ms（可调） |
| 位置信息 | 读取其他玩家位置 | 200ms（可调） |
| 状态信息 | 修改时立即写入 | 即时 |
| 状态信息 | 读取其他玩家状态 | 200ms（可调） |

### 刷新间隔设置
可在设置界面调整刷新时间间隔（100-1000ms），建议范围100-500ms。

---

## 文件结构

```
goodmorning-game/
├── index.html          # 游戏入口和UI
├── style.css           # 样式文件
├── game.js            # 主游戏逻辑
├── gist-manager.js    # Gist数据管理
├── character.js       # 角色绘制和状态
├── map.js             # 地图系统
├── PLAN.md            # 开发计划
└── README.md          # 项目说明
```

---

## 注意事项

1. **Token安全**：Token存储在sessionStorage中，关闭浏览器后失效
2. **API限流**：GitHub API有请求限制，建议刷新间隔不低于100ms
3. **玩家超时**：超过10秒未更新的玩家会被标记为离线
4. **名称修改**：修改名称时会同步更新两个Gist中的数据

---

## 技术栈

- HTML5 Canvas
- JavaScript (ES6+)
- GitHub Gist API
- CSS3 (Flexbox, Grid)

---

## 作者

qichi7

---

## 版本

v1.0.0 - 2026-04-27