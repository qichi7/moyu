// 构建脚本：把 src 拼接成单文件 index.html（产物输出到项目根目录）
const fs = require("fs");
const path = require("path");

const root = __dirname;                // dev/
const outRoot = path.join(root, ".."); // 项目根（index.html 所在）
const read = f => fs.readFileSync(path.join(root, "src", f), "utf8");

// 拼接顺序即加载顺序：逻辑层（零 DOM，headless 可跑）→ 表现层 → 主入口
const logicFiles = ["config.js", "rng.js", "events.js", "sim.js"];
const logic = logicFiles.map(read).join("\n\n");
const render = read("sprites.js") + "\n\n" + read("audio.js") + "\n\n" + read("render.js");
const main = read("main.js");

const tpl = fs.readFileSync(path.join(root, "template.html"), "utf8");
const out = tpl
  .replaceAll("__BUILD_ID__", "v" + require("./package.json").version)
  .replace("/*__LOGIC__*/", logic)
  .replace("/*__RENDER__*/", render)
  .replace("/*__MAIN__*/", main);

fs.writeFileSync(path.join(outRoot, "index.html"), out);
fs.writeFileSync(path.join(root, ".tmp_logic.js"), logic); // 供 node 冒烟测试用
console.log("built index.html (" + (out.length / 1024).toFixed(1) + " KB)");
