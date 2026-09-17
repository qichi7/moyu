"use strict";
// ============ 音效：Web Audio 程序化合成（零资源文件，file:// 可用） ============
// AudioContext 必须在用户手势后初始化（浏览器自动播放策略）
// 订阅逻辑层事件播放；节流防止刷屏音（如连续竣工）

const sfx = (() => {
  let ctx = null, master = null;
  let muted = false;
  const _lastPlay = {};

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { /* 无音频环境则静默 */ }
  }

  // 单音：振荡器 + 音量包络（可选滑音）
  function tone({ freq = 440, dur = 0.15, type = "sine", vol = 0.4, delay = 0, slide = 0 }) {
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // 噪声：白噪声 + 带通 + 衰减包络（风声/水声/隆隆声）
  function noise({ dur = 0.4, vol = 0.25, freq = 700, q = 1, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // 音色库
  const bank = {
    // UI
    click: () => tone({ freq: 880, dur: 0.05, type: "square", vol: 0.12 }),
    // 世界事件
    "build-done": () => {   // 竣工：大三和弦上行
      tone({ freq: 523, dur: 0.12, type: "triangle", vol: 0.35 });
      tone({ freq: 659, dur: 0.12, type: "triangle", vol: 0.35, delay: 0.09 });
      tone({ freq: 784, dur: 0.28, type: "triangle", vol: 0.4, delay: 0.18 });
    },
    "farm-done": () => {    // 开荒：轻快双音
      tone({ freq: 587, dur: 0.1, type: "triangle", vol: 0.3 });
      tone({ freq: 880, dur: 0.18, type: "triangle", vol: 0.3, delay: 0.08 });
    },
    birth: () => {          // 新生命：清脆上扬
      tone({ freq: 880, dur: 0.1, type: "sine", vol: 0.3 });
      tone({ freq: 1175, dur: 0.22, type: "sine", vol: 0.3, delay: 0.1 });
    },
    expand: () => {         // 开疆：低音号角
      tone({ freq: 196, dur: 0.4, type: "sawtooth", vol: 0.18 });
      tone({ freq: 262, dur: 0.5, type: "sawtooth", vol: 0.18, delay: 0.16 });
      tone({ freq: 392, dur: 0.6, type: "triangle", vol: 0.25, delay: 0.32 });
      noise({ dur: 0.8, vol: 0.08, freq: 400, q: 0.6, delay: 0.1 });
    },
    feast: () => {          // 宴席：琶音欢庆
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ freq: f, dur: 0.3, type: "triangle", vol: 0.3, delay: i * 0.09 }));
    },
    famine: () => {         // 饥荒：下沉警示
      tone({ freq: 220, dur: 0.55, type: "sawtooth", vol: 0.15, slide: -90 });
    },
    dusk: () => tone({ freq: 392, dur: 0.5, type: "sine", vol: 0.14, slide: -110 }),
    dawn: () => {
      tone({ freq: 523, dur: 0.3, type: "sine", vol: 0.12 });
      tone({ freq: 784, dur: 0.4, type: "sine", vol: 0.1, delay: 0.16 });
    },
    "settlement-up": () => {  // 聚落升级：庄严和弦
      [262, 330, 392, 523].forEach((f, i) =>
        tone({ freq: f, dur: 0.55, type: "triangle", vol: 0.28, delay: i * 0.12 }));
    },
    discovery: () => {        // 发现新大陆：神秘上扬琶音
      [392, 494, 587, 784].forEach((f, i) =>
        tone({ freq: f, dur: 0.35, type: "sine", vol: 0.22, delay: i * 0.1 }));
    },
    "era-up": () => {         // 时代演进：恢弘五音上行
      [262, 330, 392, 523, 659].forEach((f, i) =>
        tone({ freq: f, dur: 0.6, type: "triangle", vol: 0.26, delay: i * 0.13 }));
    },
  };

  // 同名音效最小间隔（秒）
  const THROTTLE = {
    click: 0.05, "build-done": 0.5, "farm-done": 0.5, birth: 1,
    expand: 2, feast: 2, famine: 30, dusk: 5, dawn: 5, "settlement-up": 1, discovery: 2, "era-up": 2,
  };

  function play(name) {
    if (!ctx || muted || !bank[name]) return;
    const now = ctx.currentTime;
    const gap = THROTTLE[name] || 0.5;
    if (_lastPlay[name] && now - _lastPlay[name] < gap) return;
    _lastPlay[name] = now;
    bank[name]();
  }

  return {
    init,
    resume() { if (ctx && ctx.state === "suspended") ctx.resume(); },
    play,
    toggle() { muted = !muted; return muted; },
    isMuted: () => muted,
  };
})();

// 订阅逻辑层世界事件
onEvent("build-done", () => sfx.play("build-done"));
onEvent("farm-done", () => sfx.play("farm-done"));
onEvent("birth", () => sfx.play("birth"));
onEvent("expand", () => sfx.play("expand"));
onEvent("feast", () => sfx.play("feast"));
onEvent("famine", () => sfx.play("famine"));
onEvent("settlement-up", () => sfx.play("settlement-up"));
onEvent("discovery", () => sfx.play("discovery"));
onEvent("era-up", () => sfx.play("era-up"));
