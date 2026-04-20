# GitHub Gist 排行榜部署说明

## 方案概述

使用 **GitHub Gist** 存储排行榜数据：
- ✅ 免费，无限存储
- ✅ 数据公开可见，同事可以查看
- ✅ 您已有 GitHub 账号，无需额外注册
- ✅ 国内访问速度比 Cloudflare 快（GitHub 在国内有 CDN）

---

## 部署步骤

### 步骤 1: 创建 Gist

1. 访问 https://gist.github.com/
2. 点击 "New gist"
3. 文件名输入：`leaderboard.json`
4. 内容输入：`[]`
5. 选择 "Create secret gist"（私有）或 "Create public gist"（公开）
   - 推荐：**Public gist**（公开，同事可以直接查看）
6. 点击 "Create gist"

创建后会获得一个 URL，如：
```
https://gist.github.com/你的用户名/abc123def456
```

**Gist ID** 就是最后那段：`abc123def456`

---

### 步骤 2: 创建 Personal Access Token（可选）

如果要**写入数据**（保存成绩），需要 Token：

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. Note: 输入 `pacman-leaderboard`
4. Expiration: 选择 "No expiration"（永久）或自定义
5. Select scopes: 只勾选 **gist** 权限
6. 点击 "Generate token"
7. **复制 Token**（只显示一次，保存好）

---

### 步骤 3: 配置前端

修改前端代码，添加 GitHub Gist 配置：

```javascript
// 在 LeaderboardManager 中添加
this.gistId = '你的Gist_ID';
this.gistToken = '你的Token'; // 可选，不填只能读取
```

---

## 查看排行榜

同事可以通过 Gist URL 直接查看排行榜：
```
https://gist.github.com/你的用户名/abc123def456
```

---

## API 限制

| 类型 | 每小时请求 | 是否需要 Token |
|------|-----------|---------------|
| 读取 | 60 次（未认证） | 不需要 |
| 读取 | 5000 次（认证） | 需要 |
| 写入 | 5000 次 | **需要 Token** |

---

## 注意事项

1. **Token 安全**：不要公开分享 Token
2. **数据公开**：Public Gist 任何人可见
3. **数据备份**：Gist 有版本历史，可以恢复

---

## 与其他方案对比

| 方案 | 免费 | 国内速度 | 配置难度 | 数据公开 |
|------|-----|---------|---------|---------|
| GitHub Gist | ✅ 无限 | 较快 | ⭐ 最简单 | ✅ |
| Cloudflare Workers | ✅ 10万次/日 | 较慢 | ⭐⭐ | ✅ |
| LeanCloud | ✅ 1万次/月 | 最快 | ⭐⭐⭐ | ❌ |

**GitHub Gist 是最简单的方案！**