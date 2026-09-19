"use strict";
// ============ BFS 寻路（窗口制，支持无限地图/负坐标） ============
// 窗口：以起点为中心 160×160；目标出窗视为不可达（走廊工程会逐步推进，无需跨窗寻路）

const PF_W = 160, PF_H = 160;
const _pfPrev = new Int32Array(PF_W * PF_H);
const _pfStamp = new Int32Array(PF_W * PF_H);
const _pfQueue = new Int32Array(PF_W * PF_H);
let _pfGen = 0;

// 返回 { path, blocked }
// blocked = 搜到过离起点最近的不可通行格（山/水/树），用于触发改造
function findPath(sx, sy, tx, ty, maxNodes) {
  maxNodes = maxNodes || 20000;
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  const wx0 = sx - (PF_W >> 1), wy0 = sy - (PF_H >> 1);

  // 目标不可走 → 找它相邻的可走格作为实际目标
  if (!walkable(tx, ty)) {
    const alt = neighborsOf(tx, ty).find(p => walkable(p.x, p.y));
    if (!alt) return { path: null, blocked: null };
    tx = alt.x; ty = alt.y;
  }
  if (sx === tx && sy === ty) return { path: [], blocked: null };

  // 目标/起点出窗 → 不可达
  if (tx < wx0 || tx >= wx0 + PF_W || ty < wy0 || ty >= wy0 + PF_H ||
      sx < wx0 || sx >= wx0 + PF_W || sy < wy0 || sy >= wy0 + PF_H) {
    return { path: null, blocked: null };
  }

  const widx = (x, y) => (y - wy0) * PF_W + (x - wx0);
  _pfGen++;
  let qh = 0, qt = 0, nodes = 0;
  const si = widx(sx, sy);
  _pfQueue[qt++] = si;
  _pfStamp[si] = _pfGen;
  _pfPrev[si] = -1;

  let blocked = null, blockedD = 1e9;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let found = false;

  while (qh < qt && nodes < maxNodes) {
    const cur = _pfQueue[qh++];
    const cx = wx0 + (cur % PF_W), cy = wy0 + ((cur / PF_W) | 0);
    nodes++;

    for (let k = 0; k < 4; k++) {
      const nx = cx + D[k][0], ny = cy + D[k][1];
      if (nx < wx0 || nx >= wx0 + PF_W || ny < wy0 || ny >= wy0 + PF_H) continue;
      const ni = widx(nx, ny);
      if (_pfStamp[ni] === _pfGen) continue;
      _pfStamp[ni] = _pfGen;

      if (!walkable(nx, ny)) {
        const d = Math.abs(nx - sx) + Math.abs(ny - sy);
        if (d < blockedD) {
          const meta = TILE_META[tileAt(nx, ny)];
          if (meta.diggable || meta.fillable || meta.bridgeable) { blockedD = d; blocked = { x: nx, y: ny }; }
        }
        continue;
      }
      _pfPrev[ni] = cur;
      if (nx === tx && ny === ty) { found = true; qh = qt; break; }
      _pfQueue[qt++] = ni;
    }
  }
  if (!found) return { path: null, blocked };

  const path = [];
  let cur = widx(tx, ty);
  while (cur !== -1) {
    path.push({ x: wx0 + (cur % PF_W), y: wy0 + ((cur / PF_W) | 0) });
    cur = _pfPrev[cur];
  }
  path.pop(); // 起点不要
  path.reverse();
  return { path, blocked };
}

function neighborsOf(x, y) {
  return [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
}
