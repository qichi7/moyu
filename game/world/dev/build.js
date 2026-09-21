// 构建脚本：把 src 拼接成单文件 index.html（产物输出到项目根目录）
const fs = require("fs");
const path = require("path");

const root = __dirname;              // dev/
const outRoot = path.join(root, ".."); // 项目根（index.html 所在）
const read = f => fs.readFileSync(path.join(root, "src", f), "utf8");

const logicFiles = ["events.js", "config.js", "noise.js", "path.js", "world.js", "tasks.js", "creature.js", "agent.js", "sim.js"];
const logic = logicFiles.map(read).join("\n\n");
const render = read("audio.js") + "\n\n" + read("sprites.js") + "\n\n" + read("render.js") + "\n\n" + read("demo.js");
const main = read("main.js");

const tpl = fs.readFileSync(path.join(root, "template.html"), "utf8");
const out = tpl
  .replace("__BUILD_ID__", "v" + require("./package.json").version)
  .replace("/*__LOGIC__*/", logic)
  .replace("/*__RENDER__*/", render)
  .replace("/*__MAIN__*/", main);

fs.writeFileSync(path.join(outRoot, "index.html"), out);
fs.writeFileSync(path.join(root, ".tmp_logic.js"), logic); // 供 node 冒烟测试用
console.log("built index.html (" + (out.length / 1024).toFixed(1) + " KB)");
