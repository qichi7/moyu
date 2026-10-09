"use strict";
// ============ 程序化音效（振荡器+噪声合成，零资源文件；AudioContext 首次用户手势后初始化） ============
const sfx = {
  ac: null, master: null, enabled: true,

  init() {
    if (this.ac || !this.enabled) return;
    const AC = typeof AudioContext !== "undefined" ? AudioContext
             : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
    if (!AC) { this.enabled = false; return; }
    try {
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ac.destination);
    } catch (e) { this.enabled = false; }
  },

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ac || !this.enabled) return;
    const t0 = this.ac.currentTime + (delay || 0);
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  noise(dur, vol, delay) {
    if (!this.ac || !this.enabled) return;
    const t0 = this.ac.currentTime + (delay || 0);
    const n = Math.floor(this.ac.sampleRate * dur);
    const buf = this.ac.createBuffer(1, n, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const g = this.ac.createGain();
    g.gain.value = vol || 0.15;
    src.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // 分子说话：按 sound 数组（原子音节序列）依次发声——每种分子念自己的连读名
  speak(syllables) {
    if (!this.ac || !this.enabled) return;
    const FREQ = { a: [330, "sine"], b: [196, "square"], e: [262, "triangle"], w: [392, "sine"], y: [294, "sawtooth"] };
    (syllables || []).forEach((s, i) => {
      const f = FREQ[s] || FREQ.a;
      this.tone(f[0], 0.14, f[1], 0.22, null, i * 0.19);
      if (s === "b") this.noise(0.05, 0.1, i * 0.19);      // 巴=爆破感
    });
  },

  play(name) {
    if (!this.ac || !this.enabled) return;
    switch (name) {
      case "tick": this.tone(660, 0.05, "square", 0.12); break;
      case "start": this.tone(330, 0.1, "triangle", 0.2); this.tone(494, 0.14, "triangle", 0.2, null, 0.1); break;
      case "dash": this.tone(220, 0.12, "sawtooth", 0.15, 520); break;
      case "devolve": this.tone(500, 0.45, "triangle", 0.3, 110); this.noise(0.25, 0.12); break;
      case "catch": this.tone(140, 0.18, "square", 0.3, 90); this.noise(0.12, 0.2); break;
      case "molecule": this.tone(110, 0.6, "sine", 0.25, 90); this.tone(220, 0.5, "sine", 0.1, 180, 0.1); break;
      case "pickup": [660, 880, 1320].forEach((f, i) => this.tone(f, 0.07, "sine", 0.15, null, i * 0.06)); break;
      case "end": this.tone(300, 0.8, "sine", 0.25, 80); break;
    }
  },
};
