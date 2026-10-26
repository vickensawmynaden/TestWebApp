// CPU opponent and training dummy. Both produce the same screen-relative raw input a
// controller would, so they go through the exact same command / state pipeline as players.
import { emptyInput } from './world.js';

function dirInput(inp, self, d) {
  // d: numpad direction relative to self (6 = toward opponent)
  const fwdRight = self.screenSide > 0;
  const h = (d % 3 === 0) ? 1 : (d % 3 === 1) ? -1 : 0;
  const v = d >= 7 ? 1 : d <= 3 ? -1 : 0;
  if (h > 0) { if (fwdRight) inp.right = true; else inp.left = true; }
  if (h < 0) { if (fwdRight) inp.left = true; else inp.right = true; }
  if (v > 0) inp.up = true;
  if (v < 0) inp.down = true;
  return inp;
}

function buttons(inp, s) {
  for (const c of s) inp['b' + c] = true;
  return inp;
}

// A plan is a list of steps: { n: frames, d: numpad dir, b: '12' buttons }
const PLANS = {
  jab: [{ n: 2, d: 5, b: '1' }, { n: 8, d: 5 }],
  oneTwo: [{ n: 2, d: 5, b: '1' }, { n: 6, d: 5 }, { n: 2, d: 5, b: '2' }, { n: 10, d: 5 }],
  rp: [{ n: 2, d: 5, b: '2' }, { n: 10, d: 5 }],
  lk: [{ n: 2, d: 5, b: '3' }, { n: 12, d: 5 }],
  rk: [{ n: 2, d: 5, b: '4' }, { n: 14, d: 5 }],
  launcher: [{ n: 2, d: 3, b: '2' }, { n: 20, d: 5 }],
  check: [{ n: 2, d: 3, b: '1' }, { n: 12, d: 5 }],
  low: [{ n: 3, d: 1 }, { n: 2, d: 2, b: '4' }, { n: 16, d: 5 }],
  lowJab: [{ n: 3, d: 1 }, { n: 2, d: 2, b: '1' }, { n: 10, d: 2 }, { n: 2, d: 5 }],
  throw: [{ n: 2, d: 5, b: '13' }, { n: 14, d: 5 }],
  throw2: [{ n: 2, d: 5, b: '24' }, { n: 14, d: 5 }],
  ssUp: [{ n: 2, d: 8 }, { n: 14, d: 5 }],
  ssDown: [{ n: 2, d: 2 }, { n: 14, d: 5 }],
  backdash: [{ n: 2, d: 4 }, { n: 2, d: 5 }, { n: 2, d: 4 }, { n: 20, d: 5 }],
  dash: [{ n: 2, d: 6 }, { n: 2, d: 5 }, { n: 10, d: 6 }],
  homing: [{ n: 2, d: 5, b: '34' }, { n: 20, d: 5 }],
  special: [{ n: 2, d: 6 }, { n: 2, d: 5 }, { n: 2, d: 6, b: '2' }, { n: 20, d: 5 }],
  juggle: [{ n: 2, d: 5, b: '1' }, { n: 7, d: 5 }, { n: 2, d: 5, b: '2' }, { n: 12, d: 5 }, { n: 2, d: 5, b: '4' }, { n: 20, d: 5 }],
  rage: [{ n: 2, d: 3, b: '12' }, { n: 30, d: 5 }],
  getup: [{ n: 2, d: 5, b: '3' }, { n: 4, d: 5 }],
};

export class CpuAI {
  constructor(level = 2, seed = 1234) {
    this.level = level;           // 1 easy .. 3 hard
    this.plan = null; this.step = 0; this.stepT = 0;
    this.wait = 0;
    this.seed = seed;
    this.holdDir = 5;
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  start(name) { this.plan = PLANS[name]; this.step = 0; this.stepT = 0; }

  input(world, self) {
    const opp = world.opponent(self);
    const inp = emptyInput();
    if (this.plan) {
      const st = this.plan[this.step];
      dirInput(inp, self, st.d);
      if (st.b && this.stepT < 1) buttons(inp, st.b);
      if (++this.stepT >= st.n) { this.step++; this.stepT = 0; if (this.step >= this.plan.length) this.plan = null; }
      return inp;
    }
    const dist = Math.hypot(opp.pos.x - self.pos.x, opp.pos.z - self.pos.z);
    const L = this.level;
    // Reactive defence: block what is coming, with a level-based success rate.
    const oppAttacking = opp.state === 'attack' && opp.move && opp.mf < opp.move.startup && dist < 2.0;
    if (oppAttacking && self.isNeutral()) {
      if (this.blockDecision === undefined || this.blockFor !== opp.move) {
        this.blockFor = opp.move;
        this.blockDecision = this.rand() < 0.25 + 0.2 * L;
        this.ssDecision = this.rand() < 0.08 * L;
      }
      if (this.blockDecision) {
        if (this.ssDecision && !opp.move.tracking) { this.start(this.rand() < 0.5 ? 'ssUp' : 'ssDown'); return this.input(world, self); }
        return dirInput(inp, self, opp.move.level === 'low' ? 1 : 4);
      }
    }
    if (self.state === 'down') {
      if (this.rand() < 0.08) this.start('getup');
      return this.plan ? this.input(world, self) : inp;
    }
    if (this.wait > 0) { this.wait--; return dirInput(inp, self, this.holdDir); }
    if (!self.isNeutral() && self.state !== 'block') return inp;
    // Punish / juggle opportunities
    if (opp.state === 'air' && opp.combo.juggle > 0 && dist < 1.6 && this.rand() < 0.4 * L) { this.start('juggle'); return this.input(world, self); }
    if (opp.state === 'attack' && opp.move && opp.mf > opp.move.startup + opp.move.active && opp.moveResult === 'block' && opp.move.block <= -10 && dist < 1.3 && this.rand() < 0.3 * L) {
      this.start(opp.move.block <= -13 ? 'launcher' : 'oneTwo'); return this.input(world, self);
    }
    if (opp.state === 'crumple' || opp.state === 'wall') { this.start(this.rand() < 0.5 ? 'launcher' : 'oneTwo'); return this.input(world, self); }
    if (self.rage && dist < 1.3 && this.rand() < 0.05) { this.start('rage'); return this.input(world, self); }
    const r = this.rand();
    if (dist > 2.2) {
      if (r < 0.06) { this.start('dash'); return this.input(world, self); }
      this.holdDir = 6; this.wait = 6 + Math.floor(this.rand() * 10);
      return dirInput(inp, self, 6);
    }
    if (dist > 1.25) {
      if (r < 0.25) { this.holdDir = 6; this.wait = 8; return dirInput(inp, self, 6); }
      if (r < 0.32) { this.start('special'); return this.input(world, self); }
      if (r < 0.40) { this.start('rk'); return this.input(world, self); }
      this.holdDir = this.rand() < 0.5 ? 5 : 4; this.wait = 10 + Math.floor((4 - L) * 6 * this.rand());
      return dirInput(inp, self, this.holdDir);
    }
    const options = ['jab', 'oneTwo', 'rp', 'lk', 'rk', 'check', 'low', 'lowJab', 'launcher', 'throw', 'throw2', 'homing', 'ssUp', 'ssDown', 'backdash'];
    const pick = options[Math.floor(this.rand() * options.length)];
    if (this.rand() < 0.35 - 0.08 * L) { this.holdDir = 5; this.wait = 12; return inp; }
    this.start(pick);
    return this.input(world, self);
  }
}

export const DUMMY_MODES = ['stand', 'crouch', 'guard all', 'jump', 'cpu'];

export class TrainingDummy {
  constructor() { this.mode = 'stand'; this.cpu = new CpuAI(2, 99); this.t = 0; }
  input(world, self) {
    const opp = world.opponent(self);
    const inp = emptyInput();
    this.t++;
    switch (this.mode) {
      case 'crouch': return dirInput(inp, self, 1);
      case 'guard all': {
        // Reads the incoming attack level: crouch for lows, stand for everything else.
        if (opp.state === 'attack' && opp.move && opp.move.level === 'low') return dirInput(inp, self, 1);
        if (self.state === 'down') return (this.t % 30 === 0) ? buttons(inp, '1') : inp;
        return dirInput(inp, self, 4);
      }
      case 'jump': return (this.t % 50 < 2) ? dirInput(inp, self, 8) : (this.t % 50 < 12 ? dirInput(inp, self, 8) : inp);
      case 'cpu': return this.cpu.input(world, self);
      default:
        if (self.state === 'down' && this.t % 40 === 0) return buttons(inp, '1');
        return inp;
    }
  }
}
