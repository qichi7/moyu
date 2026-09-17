"use strict";
// ============ 随机与噪声 ============

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 全局模拟用 rng（有种子，可复现）
const rng = mulberry32(20260916);
const rand = () => rng();
const randRange = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(a + rng() * (b - a + 1));

function makeNoise(seed) {
  const next = mulberry32(seed);
  const P = 256;
  const perm = new Uint8Array(P * 2);
  const val = new Float32Array(P);
  for (let i = 0; i < P; i++) { perm[i] = i; val[i] = next(); }
  for (let i = P - 1; i > 0; i--) { const j = (next() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < P; i++) perm[i + P] = perm[i];

  // 值噪声：网格随机值 + 平滑双线性插值
  function n2(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xi = fx & 255, yi = fy & 255;
    const xf = x - fx, yf = y - fy;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (X, Y) => val[perm[perm[X & 255] + (Y & 255)]];
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 分形叠加，输出约 0..1
  function fbm(x, y, oct) {
    let f = 0, amp = 0.5, s = 1, norm = 0;
    for (let i = 0; i < oct; i++) { f += amp * n2(x * s, y * s); norm += amp; s *= 2; amp *= 0.5; }
    return f / norm;
  }
  return { n2, fbm };
}

// tile 坐标 hash，用于渲染微扰（稳定不闪烁）
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
