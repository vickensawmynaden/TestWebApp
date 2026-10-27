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

// Every input-history entry carries `n`, a per-fighter monotonically increasing input frame stamp.
// Matching functions accept `minN`: entries stamped at or before it are ignored. The simulation
// raises it after interruptions (hits, throws, knockdowns) and when a motion command is used, so
// stale or already-consumed inputs can never fire a command later.

// Finds `steps` (array of direction sets) in order inside the last `window` frames of the buffer.
// The final step must be satisfied within the last `tail` frames. The search runs backward from
// the newest frame, so the most recent motion is always found: an older completed motion earlier
// in the history can no longer hide a newer valid one.
export function findMotion(buf, steps, window = MOTION_WINDOW, tail = 8, minN = -Infinity) {
  const start = Math.max(0, buf.length - window);
  const valid = (i) => i >= start && buf[i].n > minN;
  let i = buf.length - 1;
  // newest frame within the tail that satisfies the final step
  const last = steps[steps.length - 1];
  while (i >= buf.length - tail && valid(i) && !last.includes(buf[i].dir)) i--;
  if (i < buf.length - tail || !valid(i)) return false;
  // earlier steps, nearest first
  for (let s = steps.length - 2; s >= 0; s--) {
    i--;
    while (valid(i) && !steps[s].includes(buf[i].dir)) i--;
    if (!valid(i)) return false;
  }
  return true;
}

// Stamp of the frame that completed the newest matching motion (for consumption), or null.
export function motionEnd(buf, motion, minN = -Infinity) {
  const steps = MOTIONS[motion];
  if (!findMotion(buf, steps, MOTION_WINDOW, 8, minN)) return null;
  for (let i = buf.length - 1; i >= 0; i--) if (steps[steps.length - 1].includes(buf[i].dir)) return buf[i].n;
  return null;
}

export function motionMatched(buf, motion, minN = -Infinity) { return findMotion(buf, MOTIONS[motion], MOTION_WINDOW, 8, minN); }

// Buttons pressed within the leniency window (newest frame included).
export function recentPresses(buf, frames = MULTI_PRESS_LENIENCY + 1, minN = -Infinity) {
  let m = 0;
  for (let i = Math.max(0, buf.length - frames); i < buf.length; i++) if (buf[i].n > minN) m |= buf[i].press;
  return m;
}

export function dirMatches(specDir, dir) { return !specDir || DIR_SETS[specDir].includes(dir); }

// True when `spec` is satisfied by the input buffer on its newest frame.
// exactDir: a command written without a direction only matches with the stick in neutral
// (string follow-ups use this so 1 then f+2 is not read as the 1,2 string).
export function commandMatches(spec, buf, { requireFreshPress = true, minN = -Infinity, motionMinN = minN, exactDir = false } = {}) {
  if (spec.special || !buf.length) return false;
  const cur = buf[buf.length - 1];
  if (cur.n <= minN) return false;
  const pressed = recentPresses(buf, MULTI_PRESS_LENIENCY + 1, minN);
  if ((pressed & spec.buttons) !== spec.buttons) return false;
  if (requireFreshPress && !(cur.press & spec.buttons)) return false;
  if (spec.motion) {
    if (!motionMatched(buf, spec.motion, Math.max(minN, motionMinN))) return false;
    if (spec.motion === 'ff' && cur.dir !== 6 && cur.dir !== 5) return false;
    return true;
  }
  if (exactDir && !spec.dir && cur.dir !== 5) return false;
  return dirMatches(spec.dir, cur.dir);
}

// Command notation for a parsed spec (used for display and by input bots).
export function specButtons(spec) {
  let s = '';
  for (const [c, bit] of Object.entries(BUTTON_BITS)) if (spec.buttons & bit) s += (s ? '+' : '') + c;
  return s;
}
