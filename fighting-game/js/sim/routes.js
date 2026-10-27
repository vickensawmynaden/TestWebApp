// Route executor: performs an authored combo route (character data `combos`) through the normal
// input pipeline, like a competent player would. Used by the combo validation tests, the CPU's
// hit-confirmed combo plans and practice-mode combo demonstrations.
//
// Route step forms:
//   { cmd: '1' }                 first step: pressed immediately
//   { cmd: '2' }                 string follow-up of the running move: pressed at the start of its
//                                input window (+ delay)
//   { cmd: 'f+2', link: true }   a new move after the running one: entered in its late-recovery
//                                buffer, or `after` frames once the fighter is free
//   { dash: n }                  f, n, f then hold forward n frames (closes distance in juggles)
//   { wait: n }                  do nothing for n frames
// Every step may give `delay` (frames added to its default timing).
import { emptyInput } from './world.js';
import { ATTACK_BUFFER_FRAMES } from './world.js';
import { parseCommand } from './commands.js';

const DIR_NUM = { f: 6, b: 4, d: 2, df: 3, db: 1, u: 8, uf: 9, ub: 7 };
const BTN = [[1, '1'], [2, '2'], [4, '3'], [8, '4']];

export function setDir(inp, self, d) {
  const fwdRight = self.screenSide > 0;
  const h = (d % 3 === 0) ? 1 : (d % 3 === 1) ? -1 : 0;
  const v = d >= 7 ? 1 : d <= 3 ? -1 : 0;
  if (h > 0) { if (fwdRight) inp.right = true; else inp.left = true; }
  if (h < 0) { if (fwdRight) inp.left = true; else inp.right = true; }
  if (v > 0) inp.up = true;
  if (v < 0) inp.down = true;
  return inp;
}

// Frame-by-frame inputs ({ d, b }) that enter a command.
export function commandFrames(cmd) {
  const spec = parseCommand(cmd);
  let b = '';
  for (const [bit, c] of BTN) if (spec.buttons & bit) b += c;
  const d = spec.dir ? DIR_NUM[spec.dir] : 5;
  if (spec.motion === 'ff') return [{ d: 6 }, { d: 5 }, { d: 6, b }];
  if (spec.motion === 'qcf') return [{ d: 2 }, { d: 3 }, { d: 6, b }];
  if (spec.motion === 'qcb') return [{ d: 2 }, { d: 1 }, { d: 4, b }];
  return [{ d, b }];
}

export class RouteBot {
  // gate(stepIndex, self): optional hit-confirm hook; returns 'go' | 'wait' | 'stop'.
  constructor(route, gate = null) {
    this.route = route;
    this.gate = gate;
    this.i = 0;
    this.seq = null;          // inputs still to emit for the current step
    this.freeT = 0;           // frames the fighter has been free (for link steps with `after`)
    this.waitT = 0;
    this.done = false;
    this.aborted = false;
    this.log = [];            // [{ step, frame }] when each step's final input was entered
  }

  input(world, self) {
    const inp = emptyInput();
    if (this.done) return inp;
    if (this.seq) return this.emit(world, inp, self);
    if (['hit', 'air', 'down', 'thrown', 'wall', 'crumple', 'parried'].includes(self.state)) { this.done = this.aborted = true; return inp; }
    const st = this.route.steps[this.i];
    if (!st) { this.done = true; return inp; }
    this.freeT = self.state === 'attack' ? 0 : this.freeT + 1;
    if (st.wait !== undefined) {
      if (++this.waitT >= st.wait) { this.waitT = 0; this.i++; }
      return inp;
    }
    if (st.dash !== undefined) {
      this.seq = [{ d: 6 }, { d: 5 }, { d: 6 }, ...Array(st.dash).fill({ d: 6 })];
      if (self.state === 'attack' && !this.dashReady(self, st)) { this.seq = null; return inp; }
      this.i++;
      return this.emit(world, inp, self);
    }
    if (!this.ready(self, st)) return st.hold ? setDir(inp, self, st.hold) : inp;
    if (this.gate && this.i > 0) {
      const g = this.gate(this.i, self);
      if (g === 'stop') { this.done = true; return inp; }
      if (g === 'wait') return inp;
    }
    this.seq = commandFrames(st.cmd).slice();
    this.i++;
    return this.emit(world, inp, self);
  }

  dashReady(self, st) { return self.mf >= self.move.total - 1 + (st.delay || 0); }

  ready(self, st) {
    if (this.i === 0) return this.freeT > (st.delay || 0) || self.state !== 'attack';
    if (st.link) {
      // the previous step's move must have started before this one is entered
      if (this.pressSeq !== undefined && self.attackSeq <= this.pressSeq) return false;
      if (st.after !== undefined) return self.state !== 'attack' && this.freeT > st.after;
      if (self.state !== 'attack') return true;
      return self.mf >= self.move.total - ATTACK_BUFFER_FRAMES + 2 + (st.delay || 0);
    }
    // String follow-up: the running move must list it; press at the start of its window.
    if (this.pressSeq !== undefined && self.attackSeq <= this.pressSeq) return false;
    if (self.state !== 'attack' || !self.move) return false;
    const s = self.move.stringSpecs.find((x) => x.cmd === st.cmd);
    if (!s) {
      if (self.queued) return false;   // previous follow-up queued, not started yet
      this.done = this.aborted = true; return false;
    }
    return self.mf >= s.window[0] + (st.delay || 0);
  }

  emit(world, inp, self) {
    const fr = this.seq.shift();
    setDir(inp, self, fr.d);
    if (fr.b) for (const c of fr.b) inp['b' + c] = true;
    if (!this.seq.length) { this.seq = null; this.pressSeq = self.attackSeq; this.log.push({ step: this.i - 1, frame: world.frame }); }
    return inp;
  }
}
