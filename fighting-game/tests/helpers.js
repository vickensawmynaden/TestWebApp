import { World, emptyInput } from '../js/sim/world.js';
import { CHARACTERS } from '../js/sim/characters.js';

export function makeWorld(a = 'kai', b = 'viktor', dist = null) {
  const w = new World(CHARACTERS[a], CHARACTERS[b]);
  if (dist !== null) setDistance(w, dist);
  return w;
}

export function setDistance(w, d) {
  const [a, b] = w.fighters;
  a.pos.x = -d / 2; b.pos.x = d / 2; a.pos.z = b.pos.z = 0;
}

// Build a raw input. dir is numpad relative to the fighter (6 = forward), assuming the
// default layout where P1 stands screen-left and P2 screen-right.
export function inp(fighterIndex, dir = 5, btn = '') {
  const i = emptyInput();
  const fwdRight = fighterIndex === 0;
  const h = (dir % 3 === 0) ? 1 : (dir % 3 === 1) ? -1 : 0;
  const v = dir >= 7 ? 1 : dir <= 3 ? -1 : 0;
  if (h > 0) fwdRight ? (i.right = true) : (i.left = true);
  if (h < 0) fwdRight ? (i.left = true) : (i.right = true);
  if (v > 0) i.up = true;
  if (v < 0) i.down = true;
  for (const c of btn) i['b' + c] = true;
  return i;
}

export function run(w, frames, p1 = null, p2 = null) {
  for (let k = 0; k < frames; k++) {
    w.step([typeof p1 === 'function' ? p1(k) : (p1 || inp(0)), typeof p2 === 'function' ? p2(k) : (p2 || inp(1))]);
  }
}

// Press a command for one frame for fighter idx, the other fighter uses `other` input.
export function press(w, idx, dir, btn, other = null) {
  const ins = [inp(0), inp(1)];
  ins[idx] = inp(idx, dir, btn);
  if (other) ins[1 - idx] = other;
  w.step(ins);
}

export function collectEvents(w) { const e = w.events.slice(); w.events.length = 0; return e; }

// Runs until both fighters are actionable; returns frame advantage of fighter `aIdx`.
export function measureAdvantage(w, aIdx, limit = 200) {
  let fa = null, fb = null;
  for (let k = 0; k < limit && (fa === null || fb === null); k++) {
    w.step([inp(0), inp(1)]);
    const A = w.fighters[aIdx], B = w.fighters[1 - aIdx];
    if (fa === null && A.isNeutral()) fa = w.frame;
    if (fb === null && B.isNeutral()) fb = w.frame;
  }
  return fb - fa;
}
