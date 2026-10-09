"use strict";
// ============ 种子随机与哈希（mulberry32） ============
let _rngState = 1;

function rngInit(seed) {
  _rngState = (seed >>> 0) || 1;
}

function rand() {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randRange(a, b) {
  return a + rand() * (b - a);
}

// 标准正态（Box-Muller），布朗运动用
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 坐标确定性哈希 0~1（背景装饰撒点用，无每帧随机）
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
