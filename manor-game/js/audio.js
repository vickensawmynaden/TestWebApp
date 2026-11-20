// All sound is synthesised with WebAudio: gunshots, reloads, positional zombie groans, wind.
export class Sfx {
  constructor() { this.ctx = null; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.wind();
  }

  src(noise = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = noise === 'loop';
    return s;
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  wind() {
    const c = this.ctx, s = this.src('loop');
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
    const lg = c.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.13;
    const lg2 = c.createGain(); lg2.gain.value = 160;
    lfo2.connect(lg2); lg2.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(); lfo.start(); lfo2.start();
  }

  shot() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.22);
    this.env(g, t, 0.002, 1.1, 0.3);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.4);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    this.env(og, t, 0.002, 0.9, 0.18);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.25);
    // room tail
    const s2 = this.src(), f2 = c.createBiquadFilter(), g2 = c.createGain();
    f2.type = 'bandpass'; f2.frequency.value = 600; f2.Q.value = 0.7;
    this.env(g2, t + 0.02, 0.03, 0.18, 0.9);
    s2.connect(f2); f2.connect(g2); g2.connect(this.master); s2.start(t, Math.random()); s2.stop(t + 1.1);
  }

  click(freq = 2400, vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const s = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 6;
    this.env(g, t, 0.001, vol, 0.05);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.1);
  }

  reload() { this.click(1500, 0.35, 0.15); this.click(900, 0.3, 0.55); this.click(2600, 0.4, 1.05); this.click(1900, 0.35, 1.15); }
  empty() { this.click(3200, 0.2); }

  impact(flesh) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = flesh ? 500 : 1800;
    this.env(g, t, 0.002, flesh ? 0.5 : 0.18, flesh ? 0.12 : 0.06);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + 0.2);
  }

  hurt() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    f.type = 'lowpass'; f.frequency.value = 700;
    this.env(g, t, 0.01, 0.35, 0.3);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
    this.impact(true);
  }

  pickup() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [660, 990].forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = fr;
      this.env(g, t + i * 0.07, 0.005, 0.18, 0.15);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
    });
  }

  sting() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    [55, 58.3, 82.4].forEach(fr => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = fr;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      this.env(g, t, 0.4, 0.14, 2.5);
      o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3);
    });
  }


  noiseHit(t, type, freq, q, peak, dec, dest) {
    const c = this.ctx, s = this.src(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.003, peak, dec);
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t, Math.random()); s.stop(t + dec + 0.1);
    return f;
  }
  thump(t, f0, f1, peak, dec) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec);
    this.env(g, t, 0.003, peak, dec);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dec + 0.05);
  }
  // wet crunching bite
  bite() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.035 + Math.random() * 0.02, 'bandpass', 900 + Math.random() * 1500, 3, 0.55, 0.06);
    this.noiseHit(t, 'lowpass', 400, 1, 0.8, 0.25);
    this.thump(t, 120, 50, 0.6, 0.15);
  }
  slash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.noiseHit(t, 'highpass', 600, 0.7, 0.7, 0.22);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.15);
    this.noiseHit(t + 0.05, 'lowpass', 700, 1, 0.6, 0.2);
  }
  slam() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(t, 90, 22, 1.4, 0.7);
    this.noiseHit(t, 'lowpass', 300, 0.8, 1.1, 0.9);
    this.noiseHit(t + 0.02, 'bandpass', 1800, 1, 0.3, 0.3);
  }
  gore() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, 'lowpass', 900, 1, 0.9, 0.3);
    for (let i = 0; i < 3; i++) this.noiseHit(t + 0.05 + i * 0.06, 'bandpass', 500 + Math.random() * 600, 2, 0.4, 0.12);
    this.thump(t, 160, 40, 0.7, 0.2);
  }
  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thump(t, 70, 40, 0.7, 0.15); this.thump(t + 0.22, 65, 38, 0.5, 0.15);
  }
  // loud, close-range roar for pounces / grabs / slams
  roar(x, y, z, kind) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = 1;
    setPos(pan, x, y, z);
    const out = c.createGain(); out.gain.value = 1.6; out.connect(pan); pan.connect(this.master);
    const dur = kind === 'brute' ? 1.3 : 0.8;
    const base = kind === 'brute' ? 48 : kind === 'runner' ? 120 : 85;
    for (const det of [1, 1.03, 0.5]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * det * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(base * det * 0.7, t + dur);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'runner' ? 1800 : 900;
      const g = c.createGain(); this.env(g, t, 0.05, 0.35, dur);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
    }
    this.noiseHit(t, 'bandpass', kind === 'runner' ? 1400 : 600, 1.2, 0.6, dur, out);
  }


  // the runner's ragged breathing; rate follows the pace, level follows the panic
  breath() {
    if (!this.ctx || this._breath) return this._breath;
    const c = this.ctx, s = this.src('loop');
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.9;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    let t = 0;
    const b = this._breath = {
      level: 0.12, rate: 1.6,
      tick: dt => {
        t += dt * b.rate;
        const ph = t % 1, inhale = ph < 0.45;
        const env = inhale ? Math.sin(ph / 0.45 * Math.PI) * 0.7 : Math.sin((ph - 0.45) / 0.55 * Math.PI);
        g.gain.setTargetAtTime(Math.max(0, env) * b.level, c.currentTime, 0.03);
        f.frequency.setTargetAtTime(inhale ? 1500 : 850, c.currentTime, 0.05);
      },
      stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.1); },
    };
    return b;
  }

  // positional groan; listener is updated each frame by setListener
  groan(x, y, z, kind) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 2; pan.rolloffFactor = 1.3;
    setPos(pan, x, y, z);
    const dur = kind === 'runner' ? 0.7 : 1.1 + Math.random() * 0.8;
    const base = kind === 'brute' ? 55 : kind === 'runner' ? 140 : 80 + Math.random() * 30;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.5), t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 6 + Math.random() * 8;
    const vg = c.createGain(); vg.gain.value = base * 0.08;
    vib.connect(vg); vg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'runner' ? 900 : 520; f.Q.value = 2.5;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1400;
    const n = this.src(), ng = c.createGain(); ng.gain.value = 0.25;
    const g = c.createGain();
    this.env(g, t, dur * 0.25, kind === 'runner' ? 0.5 : 0.4, dur * 0.75);
    o.connect(f); n.connect(ng); ng.connect(f); f.connect(f2); f2.connect(g); g.connect(pan); pan.connect(this.master);
    o.start(t); vib.start(t); n.start(t, Math.random()); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }
}

function setPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else p.setPosition(x, y, z);
}
