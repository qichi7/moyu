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

数据存储在 GitHub Gist 中。**默认从公共 Gist 读取一份共享菜单**，开箱即可使用，不需任何配置。

### 默认体验（只读）

打开网页即可看到共享菜单与最近吃过的记录、点击「我要吃」抽奖。无需登录、无需 Token。

### 写操作（添加 / 记录 / 清空 / 删除）

写操作需要在表单中提供：

1. **Gist ID**（20–40 位十六进制）
   - 想编辑公共菜单：使用 `8db89a5ec373b9e93642971d839a8e49`
   - 想自己维护一份：在 [gist.github.com](https://gist.github.com/) 创建文件名为 `lunch-options.json`、内容为 `{"options":[],"history":[]}` 的 Gist，使用其 ID
2. **GitHub Token**（含 `gist` 权限）
   - 创建：[Personal Access Token](https://github.com/settings/tokens)
   - 仅用于一次写入；勾选"记住 Token"时仅存入 sessionStorage（关闭标签页即清除）

勾选"在本浏览器记住 Gist ID"后，下次打开就直接使用该 Gist 读 / 写（一份"私有空间"）。在「⚙️ 设置」中可随时切换或恢复公共默认。

> 所有数据都仅在你的浏览器与 GitHub Gist 之间往返，本项目没有任何后端。

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