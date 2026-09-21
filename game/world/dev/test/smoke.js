// headless 冒烟测试：跑 12000 sim 秒（120000 步 × 0.1s），验证核心循环都能发生
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const logic = fs.readFileSync(path.join(__dirname, "..", ".tmp_logic.js"), "utf8");

const test = `
${logic}

// ===== 测试主体 =====
function assert(cond, msg) {
  if (cond) { console.log("PASS", msg); return true; }
  console.log("FAIL", msg);
  __failed = true;
  return false;
}

simInit(42);
const mountains0 = countTile(T.MOUNTAIN), waters0 = countTile(T.WATER);
const islands0 = world.islands.length;

const STEP = 0.1;
// minPop 采样（每 1200 步 = 120 sim 秒一次，取各检查点人口最小值）：
// 守护死锁 #18 残留的开局崩盘——修复前 seed42 曾中段 12→1（更差的随机漂移分支直接灭世归 0），
// smoke 只断言终值会漏检中段低谷。阈值标定（探针实测，非拍脑袋）：
//   修复后自然低点 = 6（t≈240s 检查点采样；逐步真值最低 5）——开局饥荒谷底：12 人的初始饥饿存量
//   约 73s 耗尽 vs 首批口粮 48~104s 落地，属开局冷启动物理约束，与口渴链无关；
//   按「自然低点 − 2 余量」规则（规格示例：低点 8 → N=6）取 N=4。
let minPop = agents.length;
for (let i = 0; i < 120000; i++) {
  simUpdate(STEP);   // 12000 sim 秒（通路工程有充足建成时间）
  if (i % 1200 === 0 && agents.length < minPop) minPop = agents.length;
}

const mountains1 = countTile(T.MOUNTAIN), waters1 = countTile(T.WATER);
const bridges1 = countTile(T.BRIDGE);
let nanAgents = 0;
for (const a of agents) if (!isFinite(a.x) || !isFinite(a.y)) nanAgents++;

console.log("---- 12000 sim 秒后 ----");
console.log("人口:", agents.length, "（不设上限） 中段最低人口:", minPop);
console.log("房屋:", world.houses.length, " 农田:", world.farms.length, " 存粮:", Math.floor(totalFood()));
console.log("扩张:", world.expansions, "次 | 岛屿:", world.islands.length, "(初始", islands0 + ") | 待办任务:", tasks.list.length);
console.log("聚落:", world.settlements.map(function (s) { return s.name + "(L" + s.level + ")"; }).join(" "));
console.log("桥 tile:", bridges1, " 山:", mountains0, "->", mountains1, " 水:", waters0, "->", waters1);
console.log("---- 近期纪事 ----");
for (const l of world.logs.slice(0, 10).reverse()) console.log("  D" + (Math.floor(l.t / SIM.DAY_LEN) + 1), l.text);

function countTile(t) {
  let n = 0;
  for (const c of world.chunks.values()) {
    if (!c.gen) continue;
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === t) n++;
  }
  return n;
}

assert(agents.length >= 12, "人口自然增长");
assert(minPop >= 4, "中段无崩盘（minPop=" + minPop + " ≥ 4，标定见循环处注释）");
assert(world.settlements.length >= 2, "扩张注册新聚落");
assert(world.houses.length >= 4, "需求聚合触发自动建房");
assert(world.farms.length >= 1, "食物压力触发自动开荒");
assert(world.expansions >= 1, "居住空间压力触发世界扩张");
assert(bridges1 > 0 || waters1 < waters0, "架桥/填海实际发生");
assert(world.settlements.some(s => s.level >= 1), "聚落升级为村庄");
assert(nanAgents === 0, "小人坐标无 NaN");
assert(isFinite(totalFood()) && totalFood() >= 0, "存粮数值正常");
// 世界记事持续流动的回归证明：logs 截断在 200 条封顶，length 恒定不能判刷新；
// 实测 12000s logSeq≈1.3 万（seed42），阈值 100 极保守（日志断流才会跌破）
assert(world.logSeq >= 100, "世界记事持续产生（logSeq=" + world.logSeq + "）");
`;

const ctx = vm.createContext({ console });
ctx.__failed = false;
try {
  vm.runInContext(test, ctx, { filename: "smoke.js", timeout: 600000 });
} catch (e) {
  console.error("FAIL 测试抛异常:", e);
  process.exitCode = 1;
}
if (ctx.__failed) process.exitCode = 1;
