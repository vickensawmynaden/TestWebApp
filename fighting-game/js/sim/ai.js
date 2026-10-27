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

// ------------------------------------------------------------------ CPU opponent
// Options are built from the fighter's own move list, so every fighter (and any future one)
// is playable by the CPU. The CPU sees the opponent through a reaction delay, makes occasional
// mistakes, and follows a personality from the fighter's data (def.ai).

const B_CHARS = [[1, '1'], [2, '2'], [4, '3'], [8, '4']];
const DIR_NUM = { f: 6, b: 4, d: 2, df: 3, db: 1, u: 8, uf: 9, ub: 7 };

// Personalities. dist = preferred spacing (m); w* = selection weights; block = base guard rate.
const PROFILES = {
  balanced:      { dist: 1.15, wJab: 3, wMid: 3, wLow: 2, wPower: 2, wThrow: 1, wSide: 1, block: 0.55, idle: 0.3 },        // Ren
  pressure:      { dist: 0.85, wJab: 4, wMid: 3, wLow: 3, wPower: 2, wThrow: 1, wSide: 0.5, block: 0.45, idle: 0.1, dash: 0.25 }, // Maya
  grappler:      { dist: 0.8, wJab: 1, wMid: 2, wLow: 1, wPower: 3, wThrow: 6, wSide: 0.3, block: 0.5, idle: 0.2, dash: 0.15 },    // Viktor
  counter:       { dist: 1.25, wJab: 2, wMid: 1, wLow: 1, wPower: 1, wThrow: 0.5, wSide: 1, block: 0.75, idle: 0.55, punish: 1 }, // Leila
  kicker:        { dist: 1.45, wJab: 1, wMid: 3, wLow: 2, wPower: 3, wThrow: 0.5, wSide: 3, block: 0.45, idle: 0.3, kicks: true }, // Caio
  whiffPunisher: { dist: 1.55, wJab: 2, wMid: 2, wLow: 1, wPower: 1, wThrow: 0.5, wSide: 1, block: 0.6, idle: 0.45, whiff: 1 },  // Sora
};
const LEVELS = { 1: { react: 24, mistake: 0.25 }, 2: { react: 16, mistake: 0.12 }, 3: { react: 11, mistake: 0.05 } };

function planForMove(m) {
  let btn = '';
  for (const [bit, c] of B_CHARS) if (m.spec.buttons & bit) btn += c;
  const d = m.spec.dir ? DIR_NUM[m.spec.dir] : 5;
  const steps = [];
  if (m.spec.motion === 'ff') steps.push({ n: 2, d: 6 }, { n: 2, d: 5 }, { n: 1, d: 6, b: btn });
  else if (m.spec.motion === 'qcf') steps.push({ n: 2, d: 2 }, { n: 2, d: 3 }, { n: 1, d: 6, b: btn });
  else steps.push({ n: 1, d, b: btn });
  steps.push({ n: Math.max(4, m.total - 1), d: d === 2 || d === 1 || d === 3 ? 2 : 5 });
  return steps;
}

const MOVE_PLANS = {
  ssUp: [{ n: 2, d: 8 }, { n: 14, d: 5 }],
  ssDown: [{ n: 2, d: 2 }, { n: 14, d: 5 }],
  backdash: [{ n: 2, d: 4 }, { n: 2, d: 5 }, { n: 2, d: 4 }, { n: 20, d: 5 }],
  dash: [{ n: 2, d: 6 }, { n: 2, d: 5 }, { n: 10, d: 6 }],
  getup: [{ n: 2, d: 5, b: '3' }, { n: 4, d: 5 }],
};

export class CpuAI {
  constructor(level = 2, seed = 1234, profile = null) {
    this.level = level;           // 1 easy .. 3 hard
    this.plan = null; this.step = 0; this.stepT = 0;
    this.wait = 0;
    this.seed = seed;
    this.holdDir = 5;
    this.profileName = profile;
    this.seen = [];               // delayed view of the opponent
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  setup(self) {
    const moves = self.commandMoves.filter((m) => !m.spec.special && !m.rage);
    const strikes = moves.filter((m) => m.level !== 'throw' && m.level !== 'parry');
    const range = (m) => (m.hitPointLocal ? m.hitPointLocal[2] : m.reach) + 0.42;
    this.cat = {
      jab: strikes.filter((m) => m.cmd === '1'),
      mid: strikes.filter((m) => m.level === 'mid' && !m.onHit),
      low: strikes.filter((m) => m.level === 'low'),
      power: strikes.filter((m) => m.onHit || m.dmg >= 13),
      high: strikes.filter((m) => m.level === 'high'),
      throw: moves.filter((m) => m.level === 'throw'),
      fast: strikes.filter((m) => m.startup <= 13).sort((a, b) => b.dmg - a.dmg),
      all: strikes,
    };
    this.range = range;
    this.maxRange = Math.max(...strikes.map(range));
    const fromDef = PROFILES[self.def.ai] ? self.def.ai : 'balanced';
    this.profile = PROFILES[this.profileName && PROFILES[this.profileName] ? this.profileName : fromDef];
    this.lv = LEVELS[this.level] || LEVELS[2];
    this.ready = true;
  }

  startPlan(steps) { this.plan = steps; this.step = 0; this.stepT = 0; }
  doMove(m) { if (m) this.startPlan(planForMove(m)); return !!m; }

  // Weighted pick among moves that reach the current distance.
  pickMove(list, dist) {
    const inRange = list.filter((m) => this.range(m) >= dist);
    const pool = inRange.length ? inRange : [];
    return pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
  }

  // Opponent as seen `react` frames ago (reaction delay).
  observe(opp) {
    this.seen.push({ state: opp.state, move: opp.move, mf: opp.mf, result: opp.moveResult, moveHit: opp.moveHit });
    const delay = this.lv.react + Math.floor(this.rand() * 4);
    while (this.seen.length > delay) this.seen.shift();
    return this.seen[0];
  }

  input(world, self) {
    if (!this.ready) this.setup(self);
    const opp = world.opponent(self);
    const seen = this.observe(opp);
    const inp = emptyInput();
    if (this.plan) {
      const st = this.plan[this.step];
      dirInput(inp, self, st.d);
      if (st.b && this.stepT < 1) buttons(inp, st.b);
      if (st.guard) inp.guard = true;
      if (++this.stepT >= st.n) { this.step++; this.stepT = 0; if (this.step >= this.plan.length) this.plan = null; }
      return inp;
    }
    if (self.ko) return inp;
    const P = this.profile, cat = this.cat;
    const dist = Math.hypot(opp.pos.x - self.pos.x, opp.pos.z - self.pos.z);
    const mistake = this.rand() < this.lv.mistake;

    if (self.state === 'down') {
      if (this.rand() < 0.08) this.startPlan(MOVE_PLANS.getup);
      return inp;
    }
    // ---- Defence: react (late) to an attack starting up.
    const threat = seen.state === 'attack' && seen.move && seen.move.level !== 'throw' && seen.mf < seen.move.startup + seen.move.active && dist < 2.2;
    if (threat && (self.isNeutral() || self.state === 'block')) {
      if (this.blockFor !== seen.move) {
        this.blockFor = seen.move;
        this.blockOk = !mistake && this.rand() < P.block + 0.1 * this.level;
        this.sideOk = P.wSide > 1 && !seen.move.tracking && this.rand() < 0.15 * P.wSide;
      }
      if (this.blockOk) {
        if (this.sideOk) { this.startPlan(this.rand() < 0.5 ? MOVE_PLANS.ssUp : MOVE_PLANS.ssDown); return inp; }
        if (seen.move.level === 'low') return dirInput(inp, self, 1);
        inp.guard = true; return inp;
      }
      // Leila: interrupt the startup with Check Hook.
      if (P.punish && opp.state === 'attack' && opp.mf < opp.move.startup - 8 && dist < 1.1) {
        const hook = self.moveMap.get(`${self.def.id}_b2`);
        if (hook && hook.startupBonus && this.rand() < 0.3 * this.level) { this.doMove(hook); return inp; }
      }
    }
    if (!self.isNeutral() && self.state !== 'block') return inp;
    if (this.wait > 0) { this.wait--; if (this.holdGuard) inp.guard = true; return this.holdDir === 5 ? inp : dirInput(inp, self, this.holdDir); }
    this.holdGuard = false;

    // ---- Punish: opponent recovering from a blocked or missed attack.
    if (seen.state === 'attack' && seen.move && seen.mf >= seen.move.startup + seen.move.active && !mistake) {
      const whiffed = !seen.moveHit;
      const minus = seen.result === 'block' ? -(seen.move.block ?? 0) : 0;
      const want = (P.punish && seen.result === 'block' && minus >= 8) || (P.whiff && whiffed) || (whiffed && this.rand() < 0.25) || (minus >= 12 && this.rand() < 0.4);
      if (want) {
        const m = (P.whiff ? cat.mid.concat(cat.power) : cat.fast).filter((x) => this.range(x) >= dist).sort((a, b) => b.dmg - a.dmg)[0];
        if (m) { this.doMove(m); return inp; }
        if (P.whiff && dist < this.maxRange + 0.8) { this.startPlan(MOVE_PLANS.dash); return inp; }
      }
    }
    // ---- Spacing
    const r = this.rand();
    if (dist > P.dist + 0.45) {
      if (P.dash && r < P.dash) { this.startPlan(MOVE_PLANS.dash); return inp; }
      this.holdDir = 6; this.wait = 6 + Math.floor(this.rand() * 8);
      return dirInput(inp, self, 6);
    }
    if (dist < P.dist - 0.35 && (P.kicks || P.whiff) && r < 0.4) {
      if (r < 0.15) { this.startPlan(MOVE_PLANS.backdash); return inp; }
      this.holdDir = 4; this.wait = 10; return dirInput(inp, self, 4);
    }
    // Patient fighters wait in guard.
    if (this.rand() < P.idle * (mistake ? 0.3 : 1) / this.level * 2 - 0.15) {
      this.holdDir = 5; this.holdGuard = true; this.wait = 8 + Math.floor(this.rand() * 14);
      inp.guard = true; return inp;
    }
    // ---- Offence: weighted choice of category, then a move that reaches.
    const opts = [['jab', P.wJab], ['mid', P.wMid], ['low', P.wLow], ['power', P.wPower], ['throw', P.wThrow], ['side', P.wSide]];
    let total = opts.reduce((a, [, w]) => a + w, 0), pick = this.rand() * total, choice = 'jab';
    for (const [k, w] of opts) { if ((pick -= w) <= 0) { choice = k; break; } }
    if (mistake) choice = ['jab', 'mid', 'low', 'power', 'side'][Math.floor(this.rand() * 5)];
    if (choice === 'side') { this.startPlan(this.rand() < 0.5 ? MOVE_PLANS.ssUp : MOVE_PLANS.ssDown); return inp; }
    if (choice === 'throw') {
      if (dist <= 1.0) { this.doMove(cat.throw[0]); return inp; }
      this.holdDir = 6; this.wait = 8; return dirInput(inp, self, 6);
    }
    const m = this.pickMove(cat[choice].length ? cat[choice] : cat.all, mistake ? 0 : dist);
    if (m) { this.doMove(m); return inp; }
    this.holdDir = 6; this.wait = 6;
    return dirInput(inp, self, 6);
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
        inp.guard = true;            // stand guard in place (holding back would walk away)
        return inp;
      }
      case 'jump': return (this.t % 50 < 2) ? dirInput(inp, self, 8) : (this.t % 50 < 12 ? dirInput(inp, self, 8) : inp);
      case 'cpu': return this.cpu.input(world, self);
      default:
        if (self.state === 'down' && this.t % 40 === 0) return buttons(inp, '1');
        return inp;
    }
  }
}
