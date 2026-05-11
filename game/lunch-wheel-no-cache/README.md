# 中午吃点啥 🍜

一个基于 Canvas 的午餐轮盘抽奖游戏，使用 GitHub Gist 存储数据。

---

## 无缓存版本特性

本版本使用 **no-cache skill** 方案重构，确保每次都获取最新数据：

### 核心改进

1. **URL添加时间戳**
   - 请求 URL 添加 `?_=Date.now()` 参数
   - 100% 绕开浏览器缓存

2. **设置请求头禁止缓存**
   - 使用 `cache: 'no-store'`
   - 添加 `Cache-Control: 'no-cache'`
   - 双保险策略

3. **写入后等待同步**
   - 写入成功后等待 1.5秒
   - 确保 Gist API 同步完成

4. **本地短时缓存优化**
   - 5秒内使用本地缓存
   - 仅用于性能优化，不影响浏览器缓存
   - `clearCache()` 强制刷新会绕过本地缓存

### 解决的问题

- ✅ 更新数据后立即看到最新版本
- ✅ 多人协作时不会看到旧数据
- ✅ 防止 CDN 缓存导致数据延迟
- ✅ 避免 API 同步延迟问题

---

## 功能介绍

### 核心功能

- 🎰 转盘抽奖 - 随机选择午餐
- 📜 最近三次排除 - 避免重复吃同样的
- ➕ 添加选项 - 自定义菜单
- 🗑️ 清空记录 - 重置排除列表
- 📝 管理选项 - 删除不需要的选项
- ⚙️ Gist设置 - 支持个人/共享菜单

### 数据存储

- 使用 GitHub Gist 存储数据
- 公共默认 Gist 提供共享菜单
- 支持切换到个人 Gist

---

## 使用方法

1. 打开网页即可使用公共菜单
2. 点击"我要吃"开始抽奖
3. 抽到后可以记录这次选择（自动排除）
4. 添加选项需要 GitHub Token（gist 权限）

---

## 创建个人 Gist

1. 访问 https://gist.github.com/
2. 创建新 Gist，文件名 `lunch-options.json`
3. 内容填 `{"options":[],"history":[]}`
4. 复制 Gist ID（URL 最后一串字符）
5. 在设置中粘贴保存

---

## 创建 Token

1. 访问 https://github.com/settings/tokens/new
2. Note: 输入 `lunch-wheel`
3. Expiration: "No expiration"
4. Select scopes: 只勾选 **gist** 权限
5. 点击 "Generate token"
6. 复制 Token（只显示一次）

---

## 无缓存方案对比

| 方案 | 原版本 | 无缓存版本 |
|------|--------|-----------|
| 浏览器缓存 | 依赖浏览器缓存机制 | 时间戳 + no-store 绕过 |
| 本地缓存 | 5秒缓存，难以控制 | 5秒缓存，clearCache 强制刷新 |
| 写入同步 | 写入后立即更新缓存 | 写入后等待 1.5秒同步 |
| 数据新鲜度 | 可能看到旧数据 | 确保每次获取最新 |

---

## 技术实现

```javascript
// 无缓存获取最新数据
async readData() {
    const apiUrl = `https://api.github.com/gists/${gistId}`;
    const urlWithNoCache = `${apiUrl}?_=${Date.now()}`;
    
    const response = await fetch(urlWithNoCache, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache'
        }
    });
    
    return response.json();
}

// 写入后等待同步
async writeData(data, token, gistId) {
    const response = await fetch(apiUrl, { method: 'PATCH', ... });
    
    if (response.ok) {
        // 等待 Gist 同步
        await new Promise(resolve => setTimeout(resolve, 1500));
        this.clearCache();
    }
    
    return response.ok;
}
```

---

## 文件结构

```
lunch-wheel-no-cache/
├── index.html          # 游戏入口
├── style.css           # 样式文件
├── gist-manager.js     # Gist数据管理（无缓存版本）
├── wheel.js            # 轮盘逻辑（无缓存版本）
└── README.md           # 说明文档
```

---

## 与原版本的区别

原版本路径：`/home/qichi/moyu/game/lunch-wheel/`

重构版本路径：`/home/qichi/moyu/game/lunch-wheel-no-cache/`

主要区别：
- **gist-manager.js** - 应用无缓存方案
- **wheel.js** - 强化 clearCache 调用，确保关键操作获取最新数据

---

Made with ❤️ and no-cache skill