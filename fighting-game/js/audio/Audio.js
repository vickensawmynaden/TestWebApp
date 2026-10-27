// All audio is synthesised at runtime with the Web Audio API (original, no sample files):
// impacts, blocks, whooshes, footsteps, grunts, bells and a procedural music loop.
// The announcer uses the browser's speech synthesis when available (text fallback otherwise).
// These are clearly placeholder-grade assets intended to be swapped for recorded audio later.

// Base pitch (Hz) of each fighter's synthesised effort grunt.
const VOICE_PITCH = { ren: 140, maya: 230, viktor: 90, leila: 220, caio: 135, sora: 240, kai: 150 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.45, voice: 0.9 };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem('ifa.audio') || '{}')); } catch { /* ignore */ }
    this.musicOn = false;
  }

  // Must be called from a user gesture (browsers block audio before interaction).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.comp);
    this.musicBus = c.createGain(); this.musicBus.connect(this.comp);
    // shared noise buffer
    const len = c.sampleRate * 1.0;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  setVolume(k, v) {
    this.vol[k] = v;
    try { localStorage.setItem('ifa.audio', JSON.stringify(this.vol)); } catch { /* ignore */ }
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfxBus.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music;
  }

  // ------------------------------------------------------------ primitives
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  noiseHit(t, { freq = 1200, q = 1, type = 'bandpass', peak = 0.6, dec = 0.12, rate = 1, dest = this.sfxBus } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    src.connect(f); f.connect(g); g.connect(dest);
    this.env(g, t, 0.002, peak, dec);
    src.start(t, Math.random() * 0.5); src.stop(t + dec + 0.05);
  }

  tone(t, { f0 = 120, f1 = 50, type = 'sine', peak = 0.7, dec = 0.18, a = 0.003, dest = this.sfxBus } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dec);
    const g = c.createGain();
    o.connect(g); g.connect(dest);
    this.env(g, t, a, peak, dec);
    o.start(t); o.stop(t + a + dec + 0.05);
  }

  // ------------------------------------------------------------ game sounds
  play(name, opts = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const p = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'hitLight': this.noiseHit(t, { freq: 1800 * p, q: 0.8, peak: 0.5, dec: 0.07 }); this.tone(t, { f0: 180 * p, f1: 70, peak: 0.5, dec: 0.08 }); break;
      case 'hitMedium': this.noiseHit(t, { freq: 1200 * p, q: 0.7, peak: 0.6, dec: 0.1 }); this.tone(t, { f0: 140 * p, f1: 50, peak: 0.7, dec: 0.12 }); break;
      case 'hitHeavy':
        this.noiseHit(t, { freq: 900 * p, q: 0.6, peak: 0.75, dec: 0.16 });
        this.noiseHit(t, { freq: 300, q: 0.5, type: 'lowpass', peak: 0.6, dec: 0.25 });
        this.tone(t, { f0: 110 * p, f1: 35, peak: 0.9, dec: 0.25 });
        break;
      case 'counter': this.play('hitHeavy'); this.tone(t, { f0: 1800, f1: 900, type: 'triangle', peak: 0.25, dec: 0.18 }); break;
      case 'block': this.noiseHit(t, { freq: 2800 * p, q: 3, peak: 0.35, dec: 0.05 }); this.tone(t, { f0: 420 * p, f1: 260, type: 'triangle', peak: 0.25, dec: 0.06 }); break;
      case 'parry': this.tone(t, { f0: 1400, f1: 1300, type: 'triangle', peak: 0.4, dec: 0.5 }); this.tone(t, { f0: 2100, f1: 2000, type: 'sine', peak: 0.2, dec: 0.6 }); break;
      case 'whoosh': this.noiseHit(t, { freq: (opts.heavy ? 600 : 1100) * p, q: 1.2, peak: opts.heavy ? 0.22 : 0.14, dec: opts.heavy ? 0.2 : 0.12, rate: 0.6 }); break;
      case 'step': this.noiseHit(t, { freq: 220 * p, q: 0.9, type: 'lowpass', peak: opts.soft ? 0.12 : 0.22, dec: 0.06 }); break;
      case 'land': this.noiseHit(t, { freq: 180, q: 0.7, type: 'lowpass', peak: 0.7, dec: 0.3 }); this.tone(t, { f0: 70, f1: 30, peak: 0.8, dec: 0.3 }); break;
      case 'throw': this.noiseHit(t, { freq: 500, q: 0.8, peak: 0.35, dec: 0.15 }); break;
      case 'tech': this.noiseHit(t, { freq: 3000, q: 4, peak: 0.4, dec: 0.08 }); this.tone(t, { f0: 900, f1: 700, type: 'square', peak: 0.12, dec: 0.1 }); break;
      case 'wall': this.tone(t, { f0: 60, f1: 30, peak: 0.9, dec: 0.4 }); this.noiseHit(t, { freq: 400, type: 'lowpass', peak: 0.7, dec: 0.35 }); break;
      case 'bell': for (const [f, a] of [[660, 0.35], [990, 0.2], [1320, 0.12]]) this.tone(t, { f0: f, f1: f * 0.995, type: 'sine', peak: a, dec: 1.4, a: 0.004 }); break;
      case 'ko': this.tone(t, { f0: 90, f1: 25, peak: 1, dec: 1.2 }); this.noiseHit(t, { freq: 200, type: 'lowpass', peak: 0.8, dec: 1.0 }); break;
      case 'rage': this.tone(t, { f0: 60, f1: 240, type: 'sawtooth', peak: 0.25, dec: 0.8, a: 0.2 }); this.noiseHit(t, { freq: 800, q: 0.5, peak: 0.4, dec: 0.8, rate: 0.5 }); break;
      case 'menuMove': this.tone(t, { f0: 880, f1: 860, type: 'triangle', peak: 0.12, dec: 0.05 }); break;
      case 'menuOk': this.tone(t, { f0: 660, f1: 1320, type: 'triangle', peak: 0.18, dec: 0.12 }); break;
      case 'menuBack': this.tone(t, { f0: 500, f1: 300, type: 'triangle', peak: 0.15, dec: 0.1 }); break;
      case 'grunt': this.grunt(t, opts.char, opts.big); break;
    }
  }

  // Formant-filtered buzz: a short vocal "hup" / "ugh" (synthetic placeholder for voice acting).
  grunt(t, char = 'ren', big = false) {
    const c = this.ctx;
    const base = (VOICE_PITCH[char] || 150) * (0.92 + Math.random() * 0.16);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15, t); o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.18);
    const g = c.createGain();
    const mix = c.createGain(); mix.gain.value = 0.5;
    const formants = VOICE_PITCH[char] < 120 ? [[600, 6], [1000, 8], [2400, 10]] : [[700, 6], [1200, 8], [2600, 10]];
    for (const [f, q] of formants) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; o.connect(bp); bp.connect(mix); }
    mix.connect(g); g.connect(this.sfxBus);
    this.env(g, t, 0.01, big ? 0.9 : 0.55, big ? 0.28 : 0.16);
    o.start(t); o.stop(t + 0.4);
    this.noiseHit(t, { freq: 1500, q: 0.6, peak: 0.08, dec: 0.12 });
  }

  // ------------------------------------------------------------ announcer
  say(text) {
    if (!('speechSynthesis' in window) || this.vol.voice <= 0.01) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85; u.pitch = 0.55; u.volume = this.vol.voice * this.vol.master;
      window.speechSynthesis.speak(u);
    } catch { /* speech not available */ }
  }

  // ------------------------------------------------------------ music
  startMusic(style = 'battle') {
    if (!this.ctx) return;
    this.musicStyle = style;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  schedule() {
    const c = this.ctx;
    const tempo = this.musicStyle === 'menu' ? 96 : 132;
    const s16 = 60 / tempo / 4;
    // A minor progression: Am F C G (battle) / Am Em F G (menu)
    const prog = this.musicStyle === 'menu' ? [[57, 60, 64], [52, 55, 59], [53, 57, 60], [55, 59, 62]] : [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bassLine = [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 10, 0, 7, 0];
    while (this.nextTime < c.currentTime + 0.12) {
      const t = this.nextTime, st = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const chord = prog[bar];
      const D = this.musicBus;
      if (this.musicStyle !== 'menu') {
        if (st % 4 === 0) this.tone(t, { f0: 140, f1: 40, peak: 0.55, dec: 0.18, dest: D });
        if (st === 4 || st === 12) this.noiseHit(t, { freq: 1800, q: 0.7, peak: 0.28, dec: 0.12, dest: D });
        if (st % 2 === 0) this.noiseHit(t, { freq: 8000, q: 1, type: 'highpass', peak: st % 4 === 2 ? 0.1 : 0.05, dec: 0.03, dest: D });
        const bn = chord[0] - 24 + bassLine[st];
        this.synth(t, midi(bn), s16 * 0.9, 'sawtooth', 0.16, 500, D);
        if (st % 8 === 6 && Math.random() < 0.6) this.synth(t, midi(chord[(st / 2) % 3 | 0] + 12), s16 * 2, 'square', 0.04, 2200, D);
      } else {
        if (st % 8 === 0) this.synth(t, midi(chord[0] - 12), s16 * 7, 'triangle', 0.12, 800, D);
        if (st % 4 === 2) this.synth(t, midi(chord[(st / 4) % 3 | 0] + 12), s16 * 3, 'sine', 0.05, 3000, D);
      }
      if (st === 0) for (const n of chord) this.pad(t, midi(n), s16 * 16, D);
      this.nextTime += s16;
      this.step++;
    }
  }

  synth(t, f, dur, type, peak, cutoff, dest) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 4;
    const g = c.createGain();
    o.connect(lp); lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pad(t, f, dur, dest) {
    const c = this.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    lp.connect(g); g.connect(dest);
    for (const d of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
}

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
