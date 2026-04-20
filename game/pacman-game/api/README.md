# 全局排行榜部署说明

## 方案概述

使用 **Cloudflare Workers + KV** 实现全局排行榜，特点：
- 全球CDN，速度快
- 每日100,000次请求免费
- KV存储免费额度1GB

---

## 部署步骤

### 1. 注册 Cloudflare 账号

访问 https://dash.cloudflare.com/sign-up 注册账号

### 2. 安装 Wrangler CLI

```bash
# 进入 API 目录
cd /home/qichi/moyu/game/pacman-game/api

# 安装依赖
npm install

# 登录 Cloudflare
wrangler login
```

### 3. 创建 KV Namespace

```bash
# 创建 KV namespace
wrangler kv:namespace create "LEADERBOARD_KV"

# 输出类似：
# Created namespace with id: xxxxxxxx
# Add the following to your wrangler.toml:
# { binding = "LEADERBOARD_KV", id = "xxxxxxxx" }
```

将输出的 id 复制到 `wrangler.toml` 文件中：

```toml
kv_namespaces = [
  { binding = "LEADERBOARD_KV", id = "你的KV_NAMESPACE_ID" }
]
```

### 4. 部署 Worker

```bash
# 部署到 Cloudflare
wrangler deploy

# 输出类似：
# Published pacman-leaderboard (production)
# https://pacman-leaderboard.your-subdomain.workers.dev
```

### 5. 配置前端

部署成功后，将 Worker URL 配置到游戏设置：

1. 打开游戏，点击"排行榜"按钮
2. 勾选"🌐 全局排行榜"
3. 输入 API 地址（如：`https://pacman-leaderboard.your-subdomain.workers.dev`）
4. 点击"保存"

---

## API 接口说明

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/leaderboard?type=all` | GET | 获取总榜 |
| `/api/leaderboard?type=today` | GET | 获取今日榜 |
| `/api/leaderboard?type=week` | GET | 获取本周榜 |
| `/api/leaderboard` | POST | 添加记录 |
| `/api/leaderboard` | DELETE | 清空排行榜 |

### POST 请求示例

```json
{
  "name": "玩家昵称",
  "score": 100,
  "isWin": true,
  "date": "2024/01/01",
  "timestamp": 1704067200000
}
```

---

## 本地开发

```bash
# 启动本地开发服务器
wrangler dev

# 本地地址：http://localhost:8787
```

---

## 查看日志

```bash
# 实时查看 Worker 日志
wrangler tail
```

---

## 注意事项

1. **免费额度**：
   - Workers: 每日 100,000 次请求
   - KV: 1GB 存储，每日 1,000 次读写

2. **CORS**：已配置允许跨域请求

3. **数据持久化**：KV 数据会持久保存

4. **安全性**：建议添加 API Key 验证（可选）

---

## 添加 API Key 验证（可选）

修改 `worker.js`：

```javascript
// 在 handlePost 和 handleDelete 中添加验证
async function handlePost(request, kv) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== 'your-secret-key') {
        return errorResponse('Invalid API key', 401);
    }
    // ...
}
```

前端请求时添加 header：

```javascript
headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-secret-key'
}
```

---

## 常见问题

### Q: 部署失败？
检查 wrangler.toml 配置，确保 KV namespace ID 正确。

### Q: API 无响应？
检查 Worker 日志：`wrangler tail`

### Q: 前端配置无效？
确保 API 地址完整（包含 https://），如：
`https://pacman-leaderboard.xxx.workers.dev`

---

## 相关链接

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [KV 存储文档](https://developers.cloudflare.com/kv/)