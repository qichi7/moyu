# 中午吃点啥 🍜

一个午餐选择轮盘抽奖网页，帮助用户随机决定中午吃什么。

## 功能

- 🎡 **轮盘抽奖** - 点击"我要吃"按钮，随机选择午餐
- ➕ **添加选项** - 添加自己喜欢的菜品选项
- 📜 **历史记录** - 记录最近三次吃的，自动从轮盘排除
- 💾 **数据存储** - 使用GitHub Gist存储数据

## 使用方法

1. 打开网页
2. 点击中间的"我要吃"按钮开始抽奖
3. 查看结果，决定今天吃什么
4. 可以添加新的选项（需要GitHub Token）
5. 查看历史记录，了解最近吃过什么

## 技术栈

- HTML5 + CSS3 + JavaScript
- Canvas绘图
- GitHub Gist数据存储

## 数据存储

数据存储在你**自己的** GitHub Gist 中（每个用户独立一份）。

### 接入步骤

1. 访问 [gist.github.com](https://gist.github.com/) 创建一个新的 Gist（建议设为 secret）
2. 文件名填 `lunch-options.json`
3. 内容填：
   ```json
   {"options": [], "history": []}
   ```
4. 创建后从 URL 末尾复制 Gist ID（一串 20–40 位的十六进制）
5. 打开本页面，点击右下角"⚙️ 设置"按钮，粘贴 Gist ID 保存
6. 添加/记录/删除时再用一个有 `gist` 权限的 [Personal Access Token](https://github.com/settings/tokens) 写入

> Gist ID 仅保存在浏览器 localStorage；Token 仅在勾选"记住"时存入 sessionStorage（关闭标签页即清除）。两者都不会上传到任何后端。

## Bug修复记录

### 2026-05-06 - 修复添加选项时删除其他记录的bug

**问题描述**：
- 添加新选项时，原有数据会被删除
- 记录历史时，原有数据会被删除

**原因分析**：
1. `readData()` 在读取失败时返回空对象 `{ options: [], history: [] }`
2. `addOption()` 和 `recordHistory()` 接收到空对象后，将空对象 + 新数据写入gist，导致原有数据丢失
3. 缓存管理不当，写入后清除缓存可能导致后续读取失败

**修复方案**：
1. `readData()` 失败时返回缓存数据而不是空对象，避免数据丢失
2. `addOption()` 和 `recordHistory()` 在操作前清除缓存，确保读取最新数据
3. `writeData()` 添加数据格式验证，防止写入无效数据
4. 写入成功后更新缓存而不是清除缓存
5. 添加数据有效性验证，防止操作失败

**测试验证**：
- 打开 `test.html` 可以运行功能测试
- 测试内容包括：读取数据、缓存机制、清除缓存、重新读取等

## 测试文件

- `test.html` - GistManager功能测试页面，验证数据读取和缓存机制

## 在线访问

**🎮 游戏链接**: https://qichi7.github.io/moyu/lunch-wheel/

---

## 相关项目

- [GoodMorning](../goodmorning-game/) - 多人社交游戏

---

Made with ❤️ by qichi7