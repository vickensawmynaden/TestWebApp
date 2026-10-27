// CPU opponent and training dummy. Both produce the same screen-relative raw input a
// controller would, so they go through the exact same command / state pipeline as players.
import { emptyInput, PUNISH_BUFFER_FRAMES } from './world.js';
import { RouteBot } from './routes.js';

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
    this.route = null;            // running combo route (RouteBot) with hit-confirm gate
    this.wait = 0;
    this.seed = seed;
    this.holdDir = 5;
    this.profileName = profile;
    this.seen = [];               // delayed view of the opponent
    this.handledSeq = -1;         // last opponent attack execution already reacted to (defence)
    this.punishedSeq = -1;        // last opponent attack execution already punished / ignored
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  setup(self) {
    const moves = self.commandMoves.filter((m) => !m.spec.special && !m.rage);
    const strikes = moves.filter((m) => m.level !== 'throw' && m.level !== 'parry');
    const range = (m) => (m.hitPointLocal ? m.hitPointLocal[2] : m.reach) + 0.42 + (m.advance || 0);
    this.cat = {
      jab: strikes.filter((m) => m.cmd === '1'),
      mid: strikes.filter((m) => m.level === 'mid' && !m.onHit),
      low: strikes.filter((m) => m.level === 'low'),
      power: strikes.filter((m) => m.onHit || m.dmg >= 13),
      high: strikes.filter((m) => m.level === 'high'),
      throw: moves.filter((m) => m.level === 'throw'),
      all: strikes,
    };
    this.range = range;
    this.maxRange = Math.max(...strikes.map(range));
    // Combo routes this fighter can open with from neutral (counter-hit routes need a read).
    this.routes = (self.def.combos || []).filter((r) => r.kind !== 'ch');
    const fromDef = PROFILES[self.def.ai] ? self.def.ai : 'balanced';
    this.profile = PROFILES[this.profileName && PROFILES[this.profileName] ? this.profileName : fromDef];
    this.lv = LEVELS[this.level] || LEVELS[2];
    this.ready = true;
  }

  startPlan(steps) { this.plan = steps; this.step = 0; this.stepT = 0; }
  doMove(m) { if (m) this.startPlan(planForMove(m)); return !!m; }

  // Weighted pick among moves that reach the current distance.
  pickMove(list, dist) {
    const pool = list.filter((m) => this.range(m) >= dist);
    return pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
  }

  // Opponent as seen `react` frames ago (reaction delay). Every decision reads this snapshot,
  // never the live opponent, so the CPU cannot react faster than its level allows.
  observe(opp, self = null) {
    this.seen.push({ at: self ? self.frameCount : 0, state: opp.state, move: opp.move, mf: opp.mf, result: opp.moveResult, moveHit: opp.moveHit,
      seq: opp.attackSeq, x: opp.pos.x, z: opp.pos.z, y: opp.pos.y, ko: opp.ko });
    const delay = this.lv.react + Math.floor(this.rand() * 4);
    while (this.seen.length > delay) this.seen.shift();
    return this.seen[0];
  }

  // Hit-confirm for combo routes: the follow-up after `confirmAt` hits is only entered once the
  // CPU has seen its own hit land (with its reaction delay); a blocked or missed opener stops it.
  confirmGate(route, world) {
    const need = route.kind === 'string' ? route.gapAfter : route.kind === 'true' ? 99 : 1;
    return (i, self) => {
      if (i < need) return 'go';
      if (self.moveResult === 'block' || (self.moveResult === null && self.state === 'attack' && self.mf > self.move.startup + self.move.active)) return 'stop';
      if (self.moveResult === 'hit' || self.moveResult === 'ch' || world.opponent(self).combo.active) {
        if (this.contactFrame === undefined) this.contactFrame = world.frame;
        return world.frame - this.contactFrame >= this.lv.react ? 'go' : 'wait';
      }
      return 'wait';
    };
  }

  startRoute(route, world) {
    this.contactFrame = undefined;
    this.route = new RouteBot(route, this.confirmGate(route, world));
    this.routeDef = route;
  }

  // Guaranteed punisher: fastest-enough, highest-damage option that reaches.
  punisher(frames, dist, self) {
    const opts = [];
    for (const r of this.routes) {
      const opener = self.commandMoves.find((m) => m.cmd === r.steps[0].cmd);
      // routes need the opener well inside its range so the follow-ups still reach after pushback
      if (opener) opts.push({ startup: opener.startup, range: this.range(opener) - 0.15, value: r.damage, route: r });
    }
    for (const m of this.cat.all) opts.push({ startup: m.startup, range: this.range(m), value: m.dmg, move: m });
    // two frames of margin: the move starts the frame after the CPU becomes free
    const ok = opts.filter((o) => o.startup <= frames - 2 && o.range >= dist);
    ok.sort((a, b) => b.value - a.value);
    return ok[0] || null;
  }

  input(world, self) {
    if (!this.ready) this.setup(self);
    const opp = world.opponent(self);
    const seen = this.observe(opp, self);
    const inp = emptyInput();
    if (this.route) {
      const r = this.route.input(world, self);
      if (this.route.done) this.route = null;
      return r;
    }
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
    const dist = Math.hypot(seen.x - self.pos.x, seen.z - self.pos.z);
    const mistake = this.rand() < this.lv.mistake;

    if (self.state === 'down') {
      if (this.rand() < 0.08) this.startPlan(MOVE_PLANS.getup);
      return inp;
    }
    // ---- Punish: a blocked unsafe attack or a whiff, judged by frames and range. The CPU knows
    // the result once its delayed view shows it; frames still available = the opponent's recovery
    // left in that view, minus the observation delay, minus the CPU's own remaining blockstun.
    const recovering = seen.state === 'attack' && seen.move && seen.move.level !== 'throw' && (seen.result === 'block' || seen.mf >= seen.move.startup + seen.move.active);
    if (recovering && this.punishedSeq !== seen.seq && !mistake) {
      const m = seen.move;
      // simulation frames since the observation (frame counters pause during hit-stop, like move frames)
      const delay = self.frameCount - seen.at;
      const ownStun = self.state === 'block' ? Math.max(0, self.stun - self.t) : self.isNeutral() ? 0 : 99;
      const frames = (seen.result === 'block' || !seen.moveHit) ? m.total - seen.mf - delay - ownStun : -99;
      const tries = (P.punish && seen.result === 'block') || (P.whiff && !seen.moveHit) || this.rand() < 0.35 + 0.15 * this.level;
      // Still in blockstun beyond the punish-buffer window: keep guarding and decide when it opens.
      if (frames >= 8 && ownStun > PUNISH_BUFFER_FRAMES - 1) { inp.guard = true; return inp; }
      if (frames >= 8) {
        this.punishedSeq = seen.seq;
        if (tries) {
          const p = this.punisher(frames, dist, self);
          if (p) { if (p.route) this.startRoute(p.route, world); else this.doMove(p.move); return inp; }
          if (P.whiff && frames >= 20 && dist < this.maxRange + 0.8) { this.startPlan(MOVE_PLANS.dash); return inp; }
        }
      }
    }
    // ---- Defence: react (late) to each attack execution once.
    const threat = seen.state === 'attack' && seen.move && seen.move.level !== 'throw' && seen.mf < seen.move.startup + seen.move.active && dist < 2.2;
    if (threat && (self.isNeutral() || self.state === 'block')) {
      if (this.handledSeq !== seen.seq) {
        this.handledSeq = seen.seq;
        this.blockOk = !mistake && this.rand() < P.block + 0.1 * this.level;
        this.sideOk = P.wSide > 1 && !seen.move.tracking && this.rand() < 0.15 * P.wSide;
        // Leila: interrupt a slow startup with Check Hook (decided once per execution, from the delayed view).
        this.hookOk = P.punish && seen.mf < seen.move.startup - 8 && dist < 1.1 && this.rand() < 0.3 * this.level;
      }
      if (this.hookOk) {
        const hook = self.moveMap.get(`${self.def.id}_b2`);
        this.hookOk = false;
        if (hook && hook.startupBonus) { this.doMove(hook); return inp; }
      }
      if (this.blockOk) {
        if (this.sideOk) { this.startPlan(this.rand() < 0.5 ? MOVE_PLANS.ssUp : MOVE_PLANS.ssDown); return inp; }
        if (seen.move.level === 'low') return dirInput(inp, self, 1);
        inp.guard = true; return inp;
      }
    }
    if (!self.isNeutral() && self.state !== 'block') return inp;
    if (this.wait > 0) { this.wait--; if (this.holdGuard) inp.guard = true; return this.holdDir === 5 ? inp : dirInput(inp, self, this.holdDir); }
    this.holdGuard = false;

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
    // ---- Offence: weighted choice of category, then a move that reaches. Higher levels open
    // with authored combo routes (hit-confirmed) more often.
    const opts = [['jab', P.wJab], ['mid', P.wMid], ['low', P.wLow], ['power', P.wPower], ['throw', P.wThrow], ['side', P.wSide], ['combo', this.routes.length ? (1 + this.level) * (1 - P.idle) : 0]];
    const total = opts.reduce((a, [, w]) => a + w, 0);
    let pick = this.rand() * total, choice = 'jab';
    for (const [k, w] of opts) { if ((pick -= w) <= 0) { choice = k; break; } }
    if (mistake) choice = ['jab', 'mid', 'low', 'power', 'side'][Math.floor(this.rand() * 5)];
    if (choice === 'combo') {
      const usable = this.routes.filter((rt) => { const o = self.commandMoves.find((m) => m.cmd === rt.steps[0].cmd); return o && this.range(o) - 0.15 >= dist; });
      if (usable.length) { this.startRoute(usable[Math.floor(this.rand() * usable.length)], world); return inp; }
      choice = 'jab';
    }
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

export const DUMMY_MODES = ['stand guard', 'no guard', 'crouch guard', 'guard all', 'guard after first hit', 'random guard',
  'counter hit', 'jump', 'record', 'playback', 'punish drill', 'cpu'];

// Practice dummy. Guard modes may read the attacker's attack level directly: the dummy is a
// practice tool, not an opponent. Recording stores fighter-relative directions so playback works
// from either side.
export class TrainingDummy {
  constructor() {
    this.mode = 'stand guard'; this.cpu = new CpuAI(2, 99); this.t = 0;
    this.recording = []; this.playT = 0; this.seed = 7;
    this.guardSeq = -1; this.guardThis = false;
    this.drill = { phase: 'approach', t: 0, move: null, seq: -1 };
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  // Guard the attacker's current attack correctly (crouch for lows, stand guard otherwise).
  guardFor(inp, self, opp) {
    if (opp.state === 'attack' && opp.move && opp.move.level === 'low') return dirInput(inp, self, 1);
    inp.guard = true; return inp;
  }

  // p1raw: player 1's raw input, used while recording (the player controls the dummy).
  input(world, self, p1raw = null) {
    const opp = world.opponent(self);
    const inp = emptyInput();
    this.t++;
    if (this.mode !== this.lastMode) {   // entering record starts a fresh recording; playback restarts
      if (this.mode === 'record') this.recording = [];
      if (this.mode === 'playback') this.playT = 0;
      this.lastMode = this.mode;
    }
    self.noGuard = this.mode === 'no guard' || this.mode === 'guard after first hit' || this.mode === 'random guard' || this.mode === 'counter hit';
    world.trainingCounterAll = this.mode === 'counter hit';
    if (this.mode !== 'record' && this.mode !== 'playback' && this.mode !== 'cpu' && this.mode !== 'punish drill' && self.state === 'down') {
      return this.t % 30 === 0 ? buttons(inp, '1') : inp;
    }
    switch (this.mode) {
      case 'no guard': case 'counter hit': return inp;
      case 'crouch guard': return dirInput(inp, self, 1);
      case 'guard all': return this.guardFor(inp, self, opp);
      case 'guard after first hit':
        // Takes the first hit of a combo unguarded, then guards on every legal frame.
        if (self.combo.active || (this.t - (this.lastHitT ?? -99)) < 40) {
          if (self.combo.active) this.lastHitT = this.t;
          self.noGuard = false;
          return this.guardFor(inp, self, opp);
        }
        return inp;
      case 'random guard':
        if (opp.attackSeq !== this.guardSeq) { this.guardSeq = opp.attackSeq; this.guardThis = this.rand() < 0.5; }
        if (this.guardThis) { self.noGuard = false; return this.guardFor(inp, self, opp); }
        return inp;
      case 'jump': return (this.t % 50 < 12) ? dirInput(inp, self, 8) : inp;
      case 'cpu': return this.cpu.input(world, self);
      case 'record': {
        // The player drives the dummy; inputs are stored relative to the dummy's facing.
        if (!p1raw) return inp;
        const fwdRight = self.screenSide > 0;
        const f = fwdRight ? p1raw.right : p1raw.left, b = fwdRight ? p1raw.left : p1raw.right;
        const d = 5 + (f ? 1 : 0) - (b ? 1 : 0) + 3 * ((p1raw.up ? 1 : 0) - (p1raw.down ? 1 : 0));
        if (this.recording.length < 600) this.recording.push({ d, b: ['1', '2', '3', '4'].filter((c) => p1raw['b' + c]).join(''), g: !!p1raw.guard });
        dirInput(inp, self, d);
        for (const c of this.recording[this.recording.length - 1]?.b || '') inp['b' + c] = true;
        inp.guard = p1raw.guard;
        return inp;
      }
      case 'playback': {
        if (!this.recording.length) return inp;
        const r = this.recording[this.playT++ % this.recording.length];
        dirInput(inp, self, r.d);
        for (const c of r.b) inp['b' + c] = true;
        inp.guard = r.g;
        return inp;
      }
      case 'punish drill': return this.punishDrill(world, self, opp, inp);
      default: return inp;   // 'stand guard': standing still guards highs and mids
    }
  }

  // Walks in, throws out an attack that is unsafe on block, then stays passive so the player can
  // punish it; the match reports PUNISHED / MISSED.
  punishDrill(world, self, opp, inp) {
    const d = this.drill;
    d.t++;
    if (!this.unsafe) this.unsafe = self.commandMoves.filter((m) => m.level !== 'throw' && m.level !== 'parry' && !m.spec.motion && !m.rage && m.block !== undefined && m.block <= -10);
    const dist = Math.hypot(opp.pos.x - self.pos.x, opp.pos.z - self.pos.z);
    if (d.phase === 'approach') {
      if (!self.isNeutral()) return inp;
      if (dist > 1.1) return dirInput(inp, self, 6);
      if (d.t > 20) {
        d.move = this.unsafe[Math.floor(this.rand() * this.unsafe.length)];
        d.phase = 'attack'; d.t = 0;
        const fr = planForMove(d.move)[0];
        dirInput(inp, self, fr.d); buttons(inp, fr.b || '');
        d.seq = self.attackSeq + 1;
      }
      return inp;
    }
    if (d.phase === 'attack' && self.isNeutral() && d.t > 10) { d.phase = 'rest'; d.t = 0; }
    if (d.phase === 'rest' && d.t > 50) { d.phase = 'approach'; d.t = 0; }
    return inp;
  }
}
