"use strict";
// ============ 渲染编排：drawScene 贴 sprite 图集 + 背景装饰 + 氛围层（全部 hash 确定性，暂停冻结） ============
const BG_COLOR = "#14181f";
const DECOR_CELL = 44;

function drawScene(ctx, sim, t) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, sim.w, sim.h);
  _drawDecor(ctx, sim);

  const f2 = ((t * 4) | 0) % 2;
  for (const c of sim.cats) drawSprite(ctx, "catalyst:" + f2, c.x, c.y, 1, 2);

  const def = PREDATORS[sim.formIdx];
  if (def) {
    const f6 = ((t * 6) | 0) % 2;
    for (const pr of sim.preds) {
      const face = pr.vx < -2 ? -1 : 1;
      drawSprite(ctx, def.key + ":" + f6, pr.x, pr.y, face, 2);
    }
  }

  // 玩家（退化后短暂无敌闪烁）
  const p = sim.player;
  const blink = p.invulnT > 0 && ((t * 10) | 0) % 2 === 0;
  if (!blink) {
    let key;
    if (sim.formIdx === 3) key = "mol_" + MOLECULES[sim.molIdx].key + ":" + ((t * 8) | 0) % 2;
    else key = FORMS[sim.formIdx].key + ":" + ((t * 6) | 0) % 2;
    drawSprite(ctx, key, p.x, p.y, p.face, 2);
  }

  if (sim.formIdx === 3) _drawMolAmbient(ctx, sim, t);
}

// 背景装饰撒点：格子 hash 确定性（同格永远同一结果，无每帧随机）
function _drawDecor(ctx, sim) {
  const cols = Math.ceil(sim.w / DECOR_CELL), rows = Math.ceil(sim.h / DECOR_CELL);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const v = hash2(cx * 7 + 3, cy * 11 + 5);
      if (v >= 0.22) continue;
      const variant = v < 0.08 ? 0 : (v < 0.15 ? 1 : 2);
      const ox = (hash2(cx * 13 + 1, cy) * 24) | 0;
      const oy = (hash2(cx, cy * 17 + 2) * 24) | 0;
      drawSprite(ctx, "decor:" + variant, cx * DECOR_CELL + 10 + ox, cy * DECOR_CELL + 10 + oy, 1, 2);
    }
  }
}

// 分子形态氛围：漂浮原子微粒（颜色随当前变异体）
function _drawMolAmbient(ctx, sim, t) {
  const mol = MOLECULES[sim.molIdx];
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    const hx = hash2(i, 7), hy = hash2(i, 13);
    const x = ((hx * sim.w + t * (10 + hx * 20) * (hx > 0.5 ? 1 : -1)) % sim.w + sim.w) % sim.w;
    const y = ((hy * sim.h + t * 6 * (hy - 0.5)) % sim.h + sim.h) % sim.h;
    const col = ATOM_COLORS[mol.atoms[i % 4]];
    ctx.fillStyle = col ? col[0] : "#888";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}
