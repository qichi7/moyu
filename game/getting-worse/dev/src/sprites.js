"use strict";
// ============ 像素点阵图集：16×16 点阵惰性烘焙（缓存键=全部视觉输入），渲染帧只做 drawImage ============
const SPRITE_SIZE = 16;

const ATOM_COLORS = {
  a: ["#e86a4a", "#b03a20"],  // 阿原子
  b: ["#4a9de8", "#2060b0"],  // 巴原子
  e: ["#8ad04a", "#4a9020"],  // 嗯原子
  w: ["#e84a9d", "#a02060"],  // 哇原子
  y: ["#e8d04a", "#a09020"],  // 呀原子
};

const _spriteCache = new Map();

function getSprite(key) {
  let cv = _spriteCache.get(key);
  if (cv) return cv;
  const parts = key.split(":");
  cv = document.createElement("canvas");
  cv.width = SPRITE_SIZE;
  cv.height = SPRITE_SIZE;
  const c = cv.getContext("2d");
  _paintSprite(c, parts[0], parseInt(parts[1], 10) || 0);
  _spriteCache.set(key, cv);
  return cv;
}

// 按 face 水平翻转贴图（-1=左），scale 为放大倍数
function drawSprite(ctx, key, cx, cy, face, scale) {
  const cv = getSprite(key);
  const s = SPRITE_SIZE * scale, half = s / 2;
  if (face === -1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(-1, 1);
    ctx.drawImage(cv, -half, -half, s, s);
    ctx.restore();
  } else {
    ctx.drawImage(cv, cx - half, cy - half, s, s);
  }
}

// ---- 点阵绘制助手（全部 fillRect，保证软件光栅化可测） ----
function _px(c, x, y, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
function _rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function _disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 0.4) c.fillRect(x, y, 1, 1);
}

// ---- 各 sprite 画家（frame 为动画帧 0/1） ----
const _painters = {

  // 牛马：白衬衫红领带打工人，两帧交替迈腿
  worker(c, f) {
    _rect(c, 4, 1, 8, 2, "#2a2a33");                       // 头发
    _rect(c, 5, 3, 6, 3, "#e8b88a");                       // 脸
    _px(c, 6, 4, "#2a2a33"); _px(c, 9, 4, "#2a2a33");      // 眼
    _rect(c, 4, 6, 8, 5, "#e8e8f0");                       // 衬衫
    _rect(c, 4, 6, 8, 1, "#c8c8d8");
    _rect(c, 7, 7, 2, 4, "#c0392b");                       // 领带
    _rect(c, 3, 7, 1, 3, "#e8e8f0"); _rect(c, 12, 7, 1, 3, "#e8e8f0"); // 手臂
    if (f === 0) { _rect(c, 5, 11, 2, 4, "#3a3a4a"); _rect(c, 9, 11, 2, 3, "#3a3a4a"); }
    else { _rect(c, 5, 11, 2, 3, "#3a3a4a"); _rect(c, 9, 11, 2, 4, "#3a3a4a"); }
    _rect(c, 5, 14, 2, 1, "#1a1a22"); _rect(c, 9, 14, 2, 1, "#1a1a22"); // 鞋
    _rect(c, 12, 9, 3, 3, "#7a4a2a");                      // 工牌包
  },

  // 猴子：圆头招耳长尾，两帧四肢交替
  monkey(c, f) {
    _disc(c, 3, 5, 2, "#8a5a2e"); _disc(c, 13, 5, 2, "#8a5a2e");   // 耳
    _disc(c, 8, 5, 4, "#8a5a2e");                          // 头
    _rect(c, 6, 5, 5, 3, "#d9a86c");                       // 脸
    _px(c, 6, 5, "#33281e"); _px(c, 9, 5, "#33281e");
    _px(c, 8, 7, "#33281e");
    _rect(c, 5, 9, 6, 4, "#8a5a2e");                       // 身
    _rect(c, 6, 10, 4, 2, "#c9986a");                      // 肚皮
    _px(c, 12, 11, "#8a5a2e"); _px(c, 13, 10, "#8a5a2e"); _px(c, 13, 9, "#8a5a2e"); // 尾
    if (f === 0) { _rect(c, 4, 12, 2, 3, "#6a421e"); _rect(c, 10, 12, 2, 2, "#6a421e"); }
    else { _rect(c, 4, 12, 2, 2, "#6a421e"); _rect(c, 10, 12, 2, 3, "#6a421e"); }
    _px(c, 5, 9, "#6a421e"); _px(c, 11, 9, "#6a421e");     // 手
  },

  // 草履虫：靴形纤毛虫，纤毛两帧摆动
  paramecium(c, f) {
    for (let y = 4; y <= 12; y++)
      for (let x = 2; x <= 13; x++) {
        const dx = (x - 7.5) / 5.4, dy = (y - 8) / 3.2;
        const d = dx * dx + dy * dy;
        if (d <= 1) _px(c, x, y, d > 0.55 ? "#6a4fa0" : "#9b7fd4");
      }
    _px(c, 5, 7, "#c0aef0"); _px(c, 10, 9, "#c0aef0"); _px(c, 8, 6, "#c0aef0"); // 空泡
    _px(c, 11, 7, "#c0aef0");
    for (let a = 0; a < 12; a++) {                          // 纤毛
      const ang = a / 12 * Math.PI * 2;
      const bx = 7.5 + Math.cos(ang) * 5.8, by = 8 + Math.sin(ang) * 3.6;
      const wob = (a + f) % 2 === 0 ? 1 : 0;
      _px(c, bx, by + (wob ? -1 : 1) * 0.8, "#c0aef0");
    }
  },

  // 西装老板：黑西装红领带，眉毛倒竖
  boss(c, f) {
    _rect(c, 5, 1, 6, 1, "#181820");                       // 发
    _rect(c, 5, 2, 6, 4, "#e0b088");                       // 脸
    _rect(c, 5, 3, 2, 1, "#181820"); _rect(c, 9, 3, 2, 1, "#181820"); // 倒眉
    _px(c, 6, 4, "#c0392b"); _px(c, 9, 4, "#c0392b");      // 怒目
    _rect(c, 4, 6, 8, 5, "#2a2a3a");                       // 西装
    _rect(c, 7, 6, 2, 2, "#e8e8f0");                       // 衬领
    _rect(c, 7, 7, 1, 3, "#c0392b");                       // 领带
    _rect(c, 3, 7, 1, 3, "#2a2a3a"); _rect(c, 12, 7, 1, 3, "#2a2a3a");
    if (f === 0) { _rect(c, 5, 11, 2, 4, "#1a1a26"); _rect(c, 9, 11, 2, 3, "#1a1a26"); }
    else { _rect(c, 5, 11, 2, 3, "#1a1a26"); _rect(c, 9, 11, 2, 4, "#1a1a26"); }
  },

  // 猩猩老板：西装配红领带的退化老板，两帧挥臂
  gorilla(c, f) {
    _disc(c, 8, 4, 3, "#4a3a2e");                          // 头
    _rect(c, 6, 3, 4, 1, "#33281e");                       // 眉
    _rect(c, 6, 4, 4, 2, "#8a6a4a");                       // 脸
    _px(c, 7, 4, "#1a120a"); _px(c, 9, 4, "#1a120a");
    _disc(c, 8, 9, 4, "#4a3a2e");                          // 身
    _px(c, 8, 8, "#c0392b"); _px(c, 8, 9, "#8a2020");      // 小领带
    if (f === 0) { _rect(c, 2, 6, 2, 7, "#4a3a2e"); _rect(c, 12, 7, 2, 6, "#4a3a2e"); }
    else { _rect(c, 2, 7, 2, 6, "#4a3a2e"); _rect(c, 12, 6, 2, 7, "#4a3a2e"); }
    _rect(c, 5, 13, 2, 2, "#33281e"); _rect(c, 9, 13, 2, 2, "#33281e"); // 指节
  },

  // 水蚤：半透明猝发游者，两帧蹬腿
  flea(c, f) {
    for (let y = 5; y <= 11; y++)
      for (let x = 5; x <= 11; x++) {
        const dx = (x - 8) / 3.2, dy = (y - 8) / 2.8;
        const d = dx * dx + dy * dy;
        if (d <= 1) _px(c, x, y, d > 0.45 ? "#3a9a8e" : "#7fd4c9");
      }
    _rect(c, 7, 8, 2, 1, "#2a5a52");                       // 核
    _px(c, 6, 5, "#3a9a8e"); _px(c, 5, 4, "#3a9a8e");      // 触角
    _px(c, 10, 5, "#3a9a8e"); _px(c, 11, 4, "#3a9a8e");
    if (f === 0) { _px(c, 5, 11, "#3a9a8e"); _px(c, 11, 10, "#3a9a8e"); }
    else { _px(c, 5, 10, "#3a9a8e"); _px(c, 11, 11, "#3a9a8e"); }
  },

  // 分子：四原子按分子式节拍排列（正弦链），两帧震动；key= mol_<variant>
  mol(c, f, variant) {
    const mol = MOLECULES[variant];
    if (!mol) return;
    for (let i = 0; i < 3; i++) {                          // 原子间键线
      const x0 = 3 + i * 3.3, y0 = 8 + Math.sin(i * 1.7 + f * Math.PI) * 2.4;
      const x1 = 3 + (i + 1) * 3.3, y1 = 8 + Math.sin((i + 1) * 1.7 + f * Math.PI) * 2.4;
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let s = 0; s <= steps; s++)
        _px(c, x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, "#3a3f4c");
    }
    for (let i = 0; i < 4; i++) {
      const col = ATOM_COLORS[mol.atoms[i]];
      if (!col) continue;
      const cx = 3 + i * 3.3, cy = 8 + Math.sin(i * 1.7 + f * Math.PI) * 2.4;
      _disc(c, cx, cy, 2, col[1]);
      _disc(c, cx, cy, 1.3, col[0]);
      _px(c, cx - 1, cy - 1, "#ffffff");                   // 高光
    }
  },

  // 触媒：四芒星闪烁
  catalyst(c, f) {
    if (f === 0) {
      _rect(c, 7, 4, 2, 9, "#f0e0a0"); _rect(c, 4, 7, 9, 2, "#f0e0a0");
      _px(c, 5, 5, "#c0a040"); _px(c, 11, 5, "#c0a040");
      _px(c, 5, 11, "#c0a040"); _px(c, 11, 11, "#c0a040");
    } else {
      for (let i = 0; i < 5; i++) { _px(c, 5 + i, 5 + i, "#f0e0a0"); _px(c, 11 - i, 5 + i, "#f0e0a0"); }
      _disc(c, 8, 8, 1.4, "#f0e0a0");
      _px(c, 8, 2, "#c0a040"); _px(c, 8, 14, "#c0a040");
    }
  },

  // 背景装饰：草丛/小花/碎石（深色低调）
  decor(c, v) {
    if (v === 0) {
      _rect(c, 7, 6, 1, 4, "#243528"); _rect(c, 9, 7, 1, 3, "#2c4030"); _rect(c, 5, 8, 1, 2, "#2c4030");
    } else if (v === 1) {
      _px(c, 7, 7, "#4a3f63"); _px(c, 9, 7, "#4a3f63"); _px(c, 8, 6, "#4a3f63");
      _px(c, 8, 8, "#4a3f63"); _px(c, 8, 7, "#6a5a8a");
    } else {
      _rect(c, 7, 8, 3, 2, "#33333c"); _px(c, 8, 7, "#3a3a42");
    }
  },
};

function _paintSprite(c, name, frame) {
  if (name.startsWith("mol_")) {
    const variant = MOLECULES.findIndex(m => "mol_" + m.key === name);
    _painters.mol(c, frame, variant);
    return;
  }
  const p = _painters[name];
  if (p) p(c, frame);
}
