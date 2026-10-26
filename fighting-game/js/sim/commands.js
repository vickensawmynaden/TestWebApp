// Command notation parser and matcher.
// Notation follows the classic 3D-fighter convention, relative to the fighter's facing:
//   f / b / u / d / df / db / uf / ub  directions, 1 2 3 4 buttons, "+" = together, "," = sequence
//   f,f+2  dash input then 2;  qcf+1  quarter circle forward (d, df, f) then 1
import { BUTTON_BITS, MOTION_WINDOW, MULTI_PRESS_LENIENCY } from './constants.js';

// Numpad directions: 7 8 9 / 4 5 6 / 1 2 3 with 6 = forward (toward opponent).
const DIR_SETS = {
  f: [6], b: [4], u: [8, 7, 9], d: [2, 1, 3], df: [3], db: [1], uf: [9], ub: [7], n: [5],
};
const DIR_SPECIFICITY = { f: 3, b: 3, df: 3, db: 3, uf: 3, ub: 3, n: 3, u: 2, d: 2 };

const NOT_FWD = [1, 2, 4, 5, 7, 8];
const NOT_BACK = [1, 2, 3, 5, 6, 8, 9];
const MOTIONS = {
  ff: [[6], NOT_FWD, [6]],
  bb: [[4], NOT_BACK, [4]],
  qcf: [[2], [3], [6]],
  qcb: [[2], [1], [4]],
};

export function parseCommand(cmd) {
  const spec = { motion: null, dir: null, buttons: 0, special: null, raw: cmd };
  if (cmd === 'air' || cmd === 'auto') { spec.special = cmd; return spec; }
  let rest = cmd;
  if (rest.startsWith('f,f+')) { spec.motion = 'ff'; rest = rest.slice(4); }
  else if (rest.startsWith('qcf+')) { spec.motion = 'qcf'; rest = rest.slice(4); }
  else if (rest.startsWith('qcb+')) { spec.motion = 'qcb'; rest = rest.slice(4); }
  for (const part of rest.split('+')) {
    if (BUTTON_BITS[part]) spec.buttons |= BUTTON_BITS[part];
    else if (DIR_SETS[part]) spec.dir = part;
    else throw new Error(`Bad command "${cmd}"`);
  }
  return spec;
}

export function bitCount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

export function commandPriority(spec) {
  return (spec.motion ? 100 : 0) + bitCount(spec.buttons) * 10 + (spec.dir ? DIR_SPECIFICITY[spec.dir] : 0);
}

// Finds `steps` (array of direction sets) in order inside the last `window` frames of the buffer.
// The final step must be satisfied within the last `tail` frames.
export function findMotion(buf, steps, window = MOTION_WINDOW, tail = 8) {
  const start = Math.max(0, buf.length - window);
  let step = 0, lastIdx = -1;
  for (let i = start; i < buf.length && step < steps.length; i++) {
    if (steps[step].includes(buf[i].dir)) { step++; lastIdx = i; }
  }
  return step === steps.length && lastIdx >= buf.length - tail;
}

export function motionMatched(buf, motion) { return findMotion(buf, MOTIONS[motion]); }

// Buttons pressed within the leniency window (newest frame included).
export function recentPresses(buf, frames = MULTI_PRESS_LENIENCY + 1) {
  let m = 0;
  for (let i = Math.max(0, buf.length - frames); i < buf.length; i++) m |= buf[i].press;
  return m;
}

export function dirMatches(specDir, dir) { return !specDir || DIR_SETS[specDir].includes(dir); }

// True when `spec` is satisfied by the input buffer on its newest frame.
export function commandMatches(spec, buf, { requireFreshPress = true } = {}) {
  if (spec.special || !buf.length) return false;
  const cur = buf[buf.length - 1];
  const pressed = recentPresses(buf);
  if ((pressed & spec.buttons) !== spec.buttons) return false;
  if (requireFreshPress && !(cur.press & spec.buttons)) return false;
  if (spec.motion) {
    if (!motionMatched(buf, spec.motion)) return false;
    if (spec.motion === 'ff' && cur.dir !== 6 && cur.dir !== 5) return false;
    return true;
  }
  return dirMatches(spec.dir, cur.dir);
}
