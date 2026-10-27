// World: steps both fighters at a fixed 60 Hz, resolving movement, hits, throws and walls.
// Emits events (hit sparks, sounds, announcements) for the presentation layer.
import {
  ARENA_HALF, BODY_RADIUS, HURT_RADIUS, GRAVITY, AIR_GRAVITY, START_DISTANCE, MAX_JUGGLE_HITS,
  THROW_BREAK_WINDOW, HURT_STAND, HURT_CROUCH, HURT_DOWN, HB_HIGH, HB_MID, HB_LOW, B1, B2, B3, B4,
} from './constants.js';
import { commandMatches, motionMatched, motionEnd, recentPresses } from './commands.js';
import { Fighter } from './fighter.js';

const HITSTOP = { light: 5, medium: 7, heavy: 10 };
// Input buffering. A buffered attack remembers the frame it was entered and expires after
// BUFFER_TTL frames; it is also discarded by any interruption (see INTERRUPT_STATES).
export const ATTACK_BUFFER_FRAMES = 8;   // late-recovery frames in which the next attack may be entered
export const PUNISH_BUFFER_FRAMES = 6;   // last blockstun frames in which a punish may be entered
export const BUFFER_TTL = 10;            // a buffered attack fires within this many frames or is dropped
export const WALL_STUN_MAX = 60;
export const HIT_PUSH = 0.03;
export const BLOCK_PUSH = 0.035;         // base block pushback speed (~0.25 m)            // base standing-hit pushback speed (decays by 0.86 per frame, ~0.21 m)         // wall-splat stun can be extended by hits, never beyond this
// States that interrupt the fighter: queued / buffered attacks are dropped and every input entered
// before the interruption is invalidated (cannot complete a command afterwards).
const INTERRUPT_STATES = new Set(['hit', 'air', 'wall', 'crumple', 'down', 'thrown', 'throwing', 'parried', 'throwBreak', 'ko']);

export function emptyInput() {
  return { up: false, down: false, left: false, right: false, b1: false, b2: false, b3: false, b4: false,
    guard: false, throw: false, m12: false, m34: false };
}

export class World {
  constructor(defA, defB) {
    this.fighters = [new Fighter(defA, 0), new Fighter(defB, 1)];
    this.camDir = { x: 0, z: 1 };   // unit vector from the fighters' midpoint toward the camera (ground plane)
    this.events = [];
    this.frame = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.koFighter = null;
    this.frozen = false;            // true during intros / round transitions: no control
    this.trainingInfinite = false;
    this.resetPositions();
  }

  resetPositions() {
    const [a, b] = this.fighters;
    a.reset(-START_DISTANCE / 2, 0, 1);
    b.reset(START_DISTANCE / 2, 0, -1);
    this.camDir.x = 0; this.camDir.z = 1;
    this.hitstop = 0; this.slowmo = 0; this.koFighter = null;
    for (const f of this.fighters) f.screenSide = f === a ? 1 : -1;
  }

  opponent(f) { return this.fighters[1 - f.index]; }

  emit(type, data = {}) { this.events.push({ type, frame: this.frame, ...data }); }

  // ------------------------------------------------------------------ main step
  step(rawInputs) {
    this.frame++;
    for (const f of this.fighters) { f.prevPos.x = f.pos.x; f.prevPos.y = f.pos.y; f.prevPos.z = f.pos.z; f.prevFace.x = f.face.x; f.prevFace.z = f.face.z; }
    if (this.hitstop > 0) {
      this.hitstop--;
      this.fighters.forEach((f, i) => f.holdInput(this.heldMask(rawInputs[i]), !!rawInputs[i]?.guard));
      return;
    }
    this.fighters.forEach((f, i) => this.readInput(f, this.frozen ? null : rawInputs[i]));
    for (const f of this.fighters) this.updateFighter(f);
    for (const f of this.fighters) this.physics(f);
    this.resolveBodies();
    for (const f of this.fighters) this.clampArena(f);
    this.resolveStrikes();
    this.resolveThrows();
    for (const f of this.fighters) this.updateFacing(f);
    this.updateCamera();
    for (const f of this.fighters) {
      if (f.displayHp > f.hp) f.displayHp = Math.max(f.hp, f.displayHp - 0.6);
      else f.displayHp = f.hp;
      if (!f.rage && !f.rageUsed && f.hp > 0 && f.hp <= f.def.hp * 0.25) { f.rage = true; this.emit('rage', { fighter: f.index }); }
    }
  }

  heldMask(raw) {
    if (!raw) return 0;
    let m = 0;
    if (raw.b1) m |= B1; if (raw.b2) m |= B2; if (raw.b3) m |= B3; if (raw.b4) m |= B4;
    if (raw.throw) m |= B1 | B3;
    if (raw.m12) m |= B1 | B2;
    if (raw.m34) m |= B3 | B4;
    return m;
  }

  // Screen-relative raw input -> fighter-relative numpad direction (6 = toward opponent).
  readInput(f, raw) {
    const o = this.opponent(f);
    const rx = this.camDir.z, rz = -this.camDir.x;           // screen-right on the ground plane
    const side = (o.pos.x - f.pos.x) * rx + (o.pos.z - f.pos.z) * rz;
    if (Math.abs(side) > 0.05) f.screenSide = side > 0 ? 1 : -1;
    if (!raw) { f.pushInput(5, 0, false); return; }
    const fwd = f.screenSide > 0 ? raw.right : raw.left;
    const back = f.screenSide > 0 ? raw.left : raw.right;
    const h = (fwd ? 1 : 0) - (back ? 1 : 0);
    const v = (raw.up ? 1 : 0) - (raw.down ? 1 : 0);
    f.pushInput(5 + h + 3 * v, this.heldMask(raw), !!raw.guard);
  }

  // ------------------------------------------------------------------ state machine
  updateFighter(f) {
    f.t++;
    f.frameCount++;
    if (f.invuln > 0) f.invuln--;
    if (f.throwProtect > 0) f.throwProtect--;
    switch (f.state) {
      case 'idle': case 'walkF': case 'walkB': case 'crouch': case 'run':
        this.neutral(f); break;
      case 'dash':
        if (this.tryAttack(f)) break;
        if (motionMatched(f.buf, 'bb', f.minInputN) && f.press === 0 && f.dir === 4 && f.prevDir() !== 4) { this.startBackdash(f); break; }
        if (f.t >= 16) { if (f.dir === 6) this.setState(f, 'run'); else this.toNeutral(f); }
        break;
      case 'backdash':
        if (f.t > 10 && this.tryAttack(f)) break;
        if (f.t >= 22) this.toNeutral(f);
        break;
      case 'sidestep':
        if (this.tryAttack(f)) break;
        if (f.t === 7) {
          const d = f.dir;
          if (f.ssDir > 0 && (d === 8 || d === 7 || d === 9)) { this.startJump(f, 0); break; }
          if (f.ssDir < 0 && (d === 2 || d === 1 || d === 3)) { this.setState(f, 'crouch'); break; }
        }
        if (f.t >= f.def.ssFrames) { f.lastSsEnd = f.frameCount; this.toNeutral(f); }
        break;
      case 'sidewalk':
        if (this.tryAttack(f)) break;
        if (!((f.ssDir > 0 && f.dir === 8) || (f.ssDir < 0 && f.dir === 2)) ) { f.lastSsEnd = f.frameCount; this.toNeutral(f); }
        break;
      case 'jump':
        if (f.t > 6 && f.pos.y > 0.15 && !f.airMoveUsed && f.airMove && f.press) {
          f.airMoveUsed = true; this.startMove(f, f.airMove); break;
        }
        break;
      case 'land':
        if (f.t >= 6) this.toNeutral(f);
        break;
      case 'attack': this.attackStep(f); break;
      case 'block': case 'hit': case 'parried':
        // Punish inputs entered during the last blockstun frames come out on the first free frame.
        if (f.state === 'block' && f.press && f.t >= f.stun - PUNISH_BUFFER_FRAMES) this.bufferAttack(f);
        if (f.t >= f.stun) { this.endCombo(f); this.toNeutral(f); }
        break;
      case 'crumple':
        if (f.t >= 52) { this.setState(f, 'down'); this.emit('land', { fighter: f.index, pos: this.p3(f), heavy: true }); }
        break;
      case 'wall':
        if (f.t >= f.stun) { this.setState(f, 'down'); }
        break;
      case 'down': this.downStep(f); break;
      case 'getup':
        // A short throw-proof window after rising prevents guaranteed repeat throws.
        if (f.t >= 22) { this.endCombo(f); f.throwProtect = 16; this.toNeutral(f); }
        break;
      case 'throwing': case 'thrown': this.throwStep(f); break;
      case 'throwBreak':
        if (f.t >= 22) this.toNeutral(f);
        break;
      case 'air': case 'ko': case 'win': case 'intro':
        break;
    }
    this.computeGuard(f);
  }

  setState(f, s) {
    f.state = s; f.t = 0;
    if (s !== 'attack') { f.move = null; f.mf = 0; }
    if (INTERRUPT_STATES.has(s)) { f.queued = null; f.buffered = null; f.invalidateInputs(); }
  }

  toNeutral(f) {
    f.move = null; f.mf = 0; f.queued = null;
    const d = f.dir;
    if (d === 1 || d === 2 || d === 3) this.setState(f, 'crouch');
    else this.setState(f, 'idle');
    const b = f.buffered;
    f.buffered = null;
    // Revalidate: not expired, not entered before an interruption, still usable (Rage).
    if (b && this.frame <= b.expires && b.n > f.minInputN && (!b.move.rage || f.rage)) this.startMove(f, b.move);
  }

  // Remember the attack matching the newest input so it comes out when the fighter is free.
  bufferAttack(f) {
    const m = this.findMove(f, f.commandMoves);
    if (m && m.level !== 'throw') f.buffered = { move: m, n: f.inputN, frame: this.frame, expires: this.frame + BUFFER_TTL };
  }

  endCombo(f) {
    if (f.combo.active) {
      if (f.combo.hits > 1) this.emit('comboEnd', { fighter: f.index, hits: f.combo.hits, dmg: f.combo.dmg });
      f.combo.active = false;
    }
  }

  neutral(f) {
    if (this.tryAttack(f)) return;
    const d = f.dir, pd = f.prevDir();
    const upNow = d === 8, upPrev = pd === 8 || pd === 7 || pd === 9;
    const downNow = d === 2, downPrev = pd === 2 || pd === 1 || pd === 3;
    // Dash / backdash (f,f and b,b)
    const mn = Math.max(f.minInputN, f.motionN);
    if (d === 6 && pd !== 6 && motionMatched(f.buf, 'ff', mn) && f.state !== 'crouch') { this.startDash(f); return; }
    if (d === 4 && pd !== 4 && motionMatched(f.buf, 'bb', mn)) { this.startBackdash(f); return; }
    // Jumps
    if ((d === 9 || d === 7) && !(pd === 9 || pd === 7 || pd === 8)) { this.startJump(f, d === 9 ? 1 : -1); return; }
    // Sidestep: tap up = into the screen, tap down = out of the screen. Double tap = sidewalk.
    if ((upNow && !upPrev) || (downNow && !downPrev && f.state !== 'crouch')) {
      const sd = upNow ? 1 : -1;
      if (f.frameCount - f.lastSsEnd < 10 && f.ssDir === sd) { f.ssDir = sd; this.setState(f, 'sidewalk'); return; }
      f.ssDir = sd; this.setState(f, 'sidestep'); this.emit('step', { fighter: f.index, pos: this.p3(f) }); return;
    }
    if (f.guardBtn) {
      const g = d <= 3 ? 'crouch' : 'idle';
      if (f.state !== g) this.setState(f, g);
      return;
    }
    let next;
    if (d === 1 || d === 2 || d === 3) next = 'crouch';
    else if (d === 6) next = f.state === 'run' ? 'run' : 'walkF';
    else if (d === 4) next = 'walkB';
    else next = 'idle';
    if (next !== f.state) this.setState(f, next);
  }

  startDash(f) { this.setState(f, 'dash'); this.emit('step', { fighter: f.index, pos: this.p3(f) }); }
  startBackdash(f) { this.setState(f, 'backdash'); this.emit('step', { fighter: f.index, pos: this.p3(f) }); }
  startJump(f, h) {
    this.setState(f, 'jump');
    f.jumpH = h; f.airMoveUsed = false;
  }

  // Select a move from the command list given the latest inputs.
  findMove(f, list) {
    for (const m of list) {
      if (m.spec.special) continue;
      if (m.rage && !f.rage) continue;
      if (commandMatches(m.spec, f.buf, { minN: f.minInputN, motionMinN: f.motionN })) return m;
    }
    return null;
  }

  tryAttack(f) {
    if (!f.press) return false;
    const m = this.findMove(f, f.commandMoves);
    if (!m) return false;
    this.startMove(f, m);
    return true;
  }

  startMove(f, m) {
    f.state = 'attack'; f.t = 0;
    f.move = m; f.mf = 0; f.moveHit = false; f.moveResult = null; f.queued = null; f.buffered = null;
    f.throwData = null;
    f.attackSeq++;
    // A motion command consumes its motion: the same quarter-circle / dash cannot fire twice.
    if (m.spec.motion) f.motionN = Math.max(f.motionN, motionEnd(f.buf, m.spec.motion, f.minInputN) ?? f.inputN);
    if (m.rage) { f.rage = false; f.rageUsed = true; this.emit('rageArt', { fighter: f.index }); }
    this.emit('swing', { fighter: f.index, move: m.id, sfx: m.sfx || 'light' });
  }

  attackStep(f) {
    const m = f.move;
    f.mf++;
    // Input upgrade: e.g. 1 pressed one frame before 2 should still give 1+2.
    if (f.mf <= 2 && f.press && !m.inString) {
      const better = this.findMove(f, f.commandMoves);
      if (better && better !== m && better.spec.buttons !== m.spec.buttons &&
          (better.spec.buttons & m.spec.buttons) === m.spec.buttons) {
        this.startMove(f, better); f.mf = 1; return;
      }
    }
    // String follow-ups: accepted inside the follow-up's input window, executed no earlier than its
    // execution frame, and only if the parent's result and the opponent's state allow it.
    if (m.stringSpecs.length && !f.queued && f.press) {
      for (const s of m.stringSpecs) {
        if (f.mf < s.window[0] || f.mf > s.window[1]) continue;
        if (commandMatches(s.spec, f.buf, { minN: f.minInputN }) && !this.directionalOverride(f, s)) {
          // The ordinary command move for the same input is kept as a fallback when the follow-up's
          // condition (parent result, opponent airborne / grounded) fails at execution.
          const fb = this.findMove(f, f.commandMoves);
          f.queued = { move: f.moveMap.get(s.to), s, n: f.inputN, fallback: fb, frame: this.frame };
          break;
        }
      }
    }
    if (f.queued && f.mf >= f.queued.s.exec) {
      const q = f.queued;
      if (this.stringAllowed(f, q.s)) { this.recordMoveInfo(f); this.startMove(f, q.move); f.chainFrom = m.id; f.mf = 0; return; }
      // Condition failed: the follow-up does not come out; its input may still buffer the ordinary move.
      if (q.fallback && q.fallback.level !== 'throw') f.buffered = { move: q.fallback, n: q.n, frame: q.frame, expires: Math.max(this.frame, q.frame) + BUFFER_TTL + (m.total - f.mf) };
      f.queued = null;
    }
    // Buffer the next attack during late recovery.
    if (!f.queued && f.press && f.mf > m.total - ATTACK_BUFFER_FRAMES && m.level !== 'throw') this.bufferAttack(f);
    // Sideways step during startup (Sora's Axis Heel); ordinary collision still applies.
    if (m.sideStep && f.mf >= m.sideStep.from && f.mf <= m.sideStep.to) {
      const per = m.sideStep.dist / (m.sideStep.to - m.sideStep.from + 1);
      f.pos.x += -f.face.z * per; f.pos.z += f.face.x * per;
    }
    // Advance (lunging moves).
    if (m.advance && f.mf < m.startup + m.active) {
      const per = m.advance / (m.startup + m.active - 1);
      f.pos.x += f.face.x * per; f.pos.z += f.face.z * per;
    }
    if (m.spec.special === 'air') {
      if (f.pos.y <= 0 && f.mf > 2) { this.recordMoveInfo(f); this.setState(f, 'land'); f.pos.y = 0; f.vel.y = 0; this.emit('land', { fighter: f.index, pos: this.p3(f) }); }
      return;
    }
    if (f.mf >= m.total) {
      this.recordMoveInfo(f);
      if (m.level === 'parry' && f.parried) { f.parried = false; }
      this.toNeutral(f);
    }
  }

  // A follow-up written without a direction yields when a directional command move matches the
  // input exactly (1 then f+2 is the f+2 move, not the 1,2 string); otherwise any direction works.
  directionalOverride(f, s) {
    if (s.spec.dir || f.dir === 5) return false;
    return f.commandMoves.some((m) => m.spec.dir && !m.spec.motion && m.spec.buttons === s.spec.buttons && commandMatches(m.spec, f.buf, { minN: f.minInputN }));
  }

  stringAllowed(f, s) {
    const res = f.moveResult === 'ch' ? 'ch' : f.moveResult === 'hit' ? 'hit' : f.moveResult === 'block' ? 'block' : 'whiff';
    if (!s.on.includes(res)) return false;
    const o = this.opponent(f);
    const airborne = o.state === 'air';
    if (s.target === 'airborne' && !airborne) return false;
    if (s.target === 'grounded' && airborne) return false;
    return true;
  }

  recordMoveInfo(f) {
    const m = f.move;
    if (!m) return;
    f.lastMoveInfo = { id: m.id, name: m.name, cmd: m.cmd, startup: m.startup, result: f.moveResult || 'whiff',
      block: m.block, hit: m.hit, onHit: m.onHit || null, onCH: m.onCH || null, level: m.level, dmg: m.dmg, display: m.display, seq: f.attackSeq };
  }

  computeGuard(f) {
    const d = f.dir;
    const crouchDir = d === 1 || d === 2 || d === 3;
    switch (f.state) {
      case 'idle': case 'walkB': f.guard = crouchDir ? 'crouch' : 'stand'; break;
      case 'crouch': f.guard = 'crouch'; break;
      case 'block': f.guard = crouchDir ? 'crouch' : 'stand'; break;
      case 'backdash': f.guard = f.t > 12 ? 'stand' : null; break;
      case 'getup': f.guard = f.t > 14 ? 'stand' : null; break;
      default: f.guard = null;
    }
  }

  downStep(f) {
    if (f.ko) return;
    const wantUp = f.t > 18 && (f.press || (f.dir !== 5 && f.prevDir() === 5));
    if (wantUp || f.t >= 70) {
      const d = f.dir;
      this.setState(f, 'getup');
      f.invuln = 14;
      f.rollDir = d === 4 ? -1 : 0;
      f.rollSide = d === 8 ? 1 : d === 2 ? -1 : 0;
    }
  }

  // ------------------------------------------------------------------ throws
  throwStep(f) {
    const td = f.throwData;
    if (!td) { this.toNeutral(f); return; }
    if (f.state === 'thrown') {
      const o = this.opponent(f);
      if (td.phase === 'break') {
        td.pressAcc |= f.press;
        if ((td.pressAcc & td.breakMask) === td.breakMask) {
          this.setState(f, 'throwBreak'); this.setState(o, 'throwBreak');
          f.pushV = 0.07; o.pushV = 0.07; f.throwData = o.throwData = null;
          this.emit('throwBreak', { pos: this.mid3(), attacker: o.index, defender: f.index });
          return;
        }
        if (f.t >= THROW_BREAK_WINDOW) { td.phase = 'exec'; o.throwData.phase = 'exec'; f.t = 0; o.t = 0; }
      } else if (td.phase === 'exec') {
        if (f.t === 32) {
          const dmg = this.applyDamage(o, f, td.move.dmg, 1);
          this.emit('hit', { attacker: o.index, defender: f.index, pos: this.p3(f, 0.9), heavy: true, dmg, sfx: 'heavy', throw: true });
          this.hitstop = 6;
          this.emit('shake', { amount: 0.5 });
        }
        if (f.t >= 44) {
          this.setState(f, 'down'); f.pos.y = 0;
          this.emit('land', { fighter: f.index, pos: this.p3(f), heavy: true });
          if (f.hp <= 0) this.doKO(f, o);
        }
      }
    } else { // throwing
      if (td.phase === 'exec' && f.t >= 58) { this.recordMoveInfo(f); this.toNeutral(f); f.throwData = null; }
    }
  }

  resolveThrows() {
    const [a, b] = this.fighters;
    const ta = this.throwActive(a), tb = this.throwActive(b);
    if (ta && tb && this.throwReaches(a, b) && this.throwReaches(b, a)) {
      // Simultaneous throws clash and break.
      this.setState(a, 'throwBreak'); this.setState(b, 'throwBreak'); a.pushV = b.pushV = 0.07;
      this.emit('throwBreak', { pos: this.mid3() });
      return;
    }
    for (const [f, o, act] of [[a, b, ta], [b, a, tb]]) {
      if (!act || f.moveHit) continue;
      if (!this.throwReaches(f, o)) continue;
      const p = o.posture();
      if (p !== 'stand' || o.invuln > 0 || o.throwProtect > 0 || o.ko || ['thrown', 'throwing', 'down', 'getup', 'air', 'wall', 'crumple', 'ko'].includes(o.state)) continue;
      f.moveHit = true; f.moveResult = 'hit';
      const m = f.move;
      f.state = 'throwing'; f.t = 0;
      o.state = 'thrown'; o.t = 0; o.move = null; o.mf = 0;
      // A throw interrupts both fighters: nothing entered before it may fire afterwards
      // (the victim's break input is read from the presses accumulated below, not from commands).
      for (const x of [f, o]) { x.queued = null; x.buffered = null; x.invalidateInputs(); }
      f.throwData = { phase: 'break', move: m, anim: m.throwAnim };
      // Presses from the last few frames count, so a slightly early break still works.
      o.throwData = { phase: 'break', move: m, anim: m.throwAnim, breakMask: m.breakMask, pressAcc: recentPresses(o.buf, 4) };
      // Snap the victim in front of the thrower, facing them.
      o.pos.x = f.pos.x + f.face.x * 0.72; o.pos.z = f.pos.z + f.face.z * 0.72; o.pos.y = 0;
      o.face.x = -f.face.x; o.face.z = -f.face.z;
      o.vel.x = o.vel.y = o.vel.z = 0; o.pushV = 0; f.pushV = 0;
      this.startCombo(o);
      this.emit('throw', { attacker: f.index, defender: o.index, move: m.id, pos: this.mid3() });
    }
  }

  throwActive(f) {
    return f.state === 'attack' && f.move.level === 'throw' && f.mf >= f.move.startup && f.mf < f.move.startup + f.move.active;
  }

  throwReaches(f, o) {
    const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > f.move.reach + 0.05) return false;
    return (dx * f.face.x + dz * f.face.z) / (d || 1) > 0.5;
  }

  // ------------------------------------------------------------------ strikes
  hurtRange(f) {
    const p = f.posture();
    if (p === 'down') return HURT_DOWN;
    if (p === 'crouch') return HURT_CROUCH;
    if (p === 'air') return [f.pos.y + 0.05, f.pos.y + 0.95];
    if (p === 'jump') return [f.pos.y + 0.35, f.pos.y + 1.8];
    return HURT_STAND;
  }

  hitboxRange(f, m = f.move) {
    const base = m.level === 'high' ? HB_HIGH : m.level === 'low' ? HB_LOW : HB_MID;
    const y = f.pos.y;
    return y > 0 ? [base[0] + y * 0.5, base[1] + y] : base;
  }

  strikeConnects(a, d) {
    const m = a.move;
    if (a.state !== 'attack' || a.moveHit || !m || m.level === 'throw' || m.level === 'parry') return false;
    if (a.mf < m.startup || a.mf >= m.startup + m.active) return false;
    if (d.invuln > 0 || d.state === 'thrown' || d.state === 'throwing') return false;
    if (d.state === 'down' && !m.groundHit) return false;
    if (d.ko && d.state === 'down') return false;
    const [hl, hh] = this.hitboxRange(a);
    const [dl, dh] = this.hurtRange(d);
    if (hh < dl || hl > dh) return false;
    // Crouching ducks high attacks.
    if (m.level === 'high' && d.posture() === 'crouch') return false;
    // Hitbox: swept from the attacker's body to the striking limb's extended position
    // (limb IK target of the contact pose), along the facing locked when the attack began.
    const [hr, , hf] = m.hitPointLocal;
    const rx = -a.face.z, rz = a.face.x;   // fighter's right on the ground plane
    const sx = a.pos.x + a.face.x * 0.2, sz = a.pos.z + a.face.z * 0.2;
    const ex = a.pos.x + a.face.x * hf + rx * hr, ez = a.pos.z + a.face.z * hf + rz * hr;
    const dist = pointSegDist(d.pos.x, d.pos.z, sx, sz, ex, ez);
    const r = (m.radius || 0.2) + (d.state === 'down' ? 0.45 : HURT_RADIUS);
    return dist <= r;
  }

  resolveStrikes() {
    const [a, b] = this.fighters;
    const ab = this.strikeConnects(a, b), ba = this.strikeConnects(b, a);
    // Evaluate counter-hit state before either hit modifies the other fighter (allows trades).
    const chB = ab && this.isCounterState(b), chA = ba && this.isCounterState(a);
    // Snapshot both attacks first: on a trade the first hit resets the other fighter's state.
    const snapA = { move: a.move, mf: a.mf }, snapB = { move: b.move, mf: b.mf };
    if (ab) this.applyStrike(a, b, chB, snapA);
    if (ba) this.applyStrike(b, a, chA, snapB);
  }

  isCounterState(d) {
    return d.state === 'attack' && d.move.level !== 'parry' && d.mf < d.move.startup + d.move.active;
  }

  inCombo(d) { return ['hit', 'air', 'wall', 'crumple', 'down', 'parried'].includes(d.state) && d.combo.active; }

  startCombo(d) {
    if (!d.combo.active) { d.combo.active = true; d.combo.hits = 0; d.combo.dmg = 0; d.combo.juggle = 0; d.combo.wallUsed = false; d.combo.crumpleUsed = false; d.combo.terminal = false; d.combo.log = []; d.juggleGravity = 1; }
  }

  applyDamage(a, d, base, scale) {
    let dmg = base * scale * (a.rage ? 1.1 : 1);
    dmg = Math.max(1, Math.round(dmg));
    if (this.trainingInfinite && d.index === 1) {
      d.hp = Math.max(1, d.hp - dmg);
    } else d.hp = Math.max(0, d.hp - dmg);
    d.combo.hits++; d.combo.dmg += dmg;
    return dmg;
  }

  applyStrike(a, d, counter, snap = { move: a.move, mf: a.mf }) {
    const m = snap.move;
    a.moveHit = true;
    const remaining = m.total - snap.mf;
    const hitPos = this.contactPoint(a, d, m);
    // ---- Parry (Kai's Flow Parry)
    if (d.state === 'attack' && d.move.parry && d.mf >= d.move.parry[0] && d.mf <= d.move.parry[1] && (m.level === 'high' || m.level === 'mid') && !m.rage) {
      a.moveResult = 'parried';
      this.setState(a, 'parried'); a.stun = 34; a.hitLevel = 'mid';
      d.parried = true;
      const counterMove = d.moveMap.get(d.move.counter);
      this.startMove(d, counterMove);
      d.face.x = (a.pos.x - d.pos.x); d.face.z = (a.pos.z - d.pos.z); normalize(d.face);
      this.hitstop = 8;
      this.emit('parry', { attacker: a.index, defender: d.index, pos: hitPos });
      return;
    }
    // ---- Armor (power crush)
    if (d.state === 'attack' && d.move.armor && d.mf >= d.move.armor[0] && d.mf <= d.move.armor[1] && m.level !== 'low') {
      a.moveResult = 'armored';
      const dmg = this.applyDamage(a, d, m.dmg, 1);
      d.combo.active = false;
      this.hitstop = HITSTOP[m.sfx || 'medium'];
      this.emit('armor', { attacker: a.index, defender: d.index, pos: hitPos, dmg });
      if (d.hp <= 0) this.doKO(d, a);
      return;
    }
    // ---- Block
    const lvl = m.level;
    const canBlock = d.guard && (d.state === 'idle' || d.state === 'walkB' || d.state === 'crouch' || d.state === 'block' || d.state === 'backdash' || d.state === 'getup');
    const blocked = canBlock && ((lvl === 'low' && d.guard === 'crouch') || ((lvl === 'mid' || lvl === 'high') && d.guard === 'stand'));
    if (blocked) {
      a.moveResult = 'block';
      this.setState(d, 'block');
      d.stun = Math.max(1, remaining + m.block);
      d.pushV = BLOCK_PUSH * (m.sfx === 'heavy' ? 1.3 : 1) / d.def.weight;
      this.hitstop = m.sfx === 'heavy' ? 7 : 5;
      this.emit('block', { attacker: a.index, defender: d.index, pos: hitPos, heavy: m.sfx === 'heavy' });
      return;
    }
    // ---- Hit
    const wasInCombo = this.inCombo(d);
    if (wasInCombo) counter = false;
    else { d.combo.active = false; this.startCombo(d); }
    a.moveResult = counter ? 'ch' : 'hit';
    const airborneVictim = d.state === 'air';
    let scale = 1;
    const n = d.combo.hits; // hits before this one
    if (n > 0) scale = Math.max(0.3, 1 - 0.1 * n);
    if (airborneVictim || d.combo.juggle > 0) scale *= 0.85;
    if (d.state === 'wall') scale *= 0.8;
    // Startup bonus (Leila's Check Hook): extra damage when it interrupts an attack's startup.
    const startupCatch = !!m.startupBonus && d.state === 'attack' && d.move && d.mf < d.move.startup;
    if (startupCatch) scale *= 1 + m.startupBonus;
    const dmg = this.applyDamage(a, d, m.dmg, scale);
    d.combo.log.push({ move: m.id, dmg, counter, frame: this.frame, state: d.state });
    const reaction = (counter && m.onCH) || m.onHit || null;
    const heavy = m.sfx === 'heavy' || counter || !!reaction;
    this.hitstop = HITSTOP[m.sfx || 'medium'] + (counter ? 3 : 0);
    a.pushV = 0;
    const away = { x: d.pos.x - a.pos.x, z: d.pos.z - a.pos.z }; normalize(away);
    if (Math.abs(away.x) + Math.abs(away.z) < 0.1) { away.x = a.face.x; away.z = a.face.z; }
    d.hitLevel = lvl === 'low' ? (d.posture() === 'crouch' ? 'low-crouch' : 'low') : lvl;
    d.hitHeavy = heavy;
    d.face.x = -away.x; d.face.z = -away.z;

    if (d.state === 'down' && m.groundHit) {
      // Hits on a grounded opponent deal damage but never pick them back up.
      d.combo.juggle++;
    } else if (airborneVictim) {
      // Juggle: re-lift the victim with increasing gravity so combos always end. Launchers lift
      // most, fillers keep the victim up, finishers end the juggle; after a finisher (terminal)
      // nothing lifts the victim again.
      d.combo.juggle++;
      const role = m.role;
      let lift = d.combo.juggle >= MAX_JUGGLE_HITS ? 0 : role === 'launcher' ? 0.075 : role === 'finisher' ? 0.03 : 0.05;
      if (d.combo.terminal) lift = 0;
      d.vel.y = d.combo.terminal ? Math.min(d.vel.y, 0) : Math.max(d.vel.y * 0.3, lift * Math.pow(0.93, d.combo.juggle));
      d.juggleGravity = 1 + 0.1 * d.combo.juggle + (d.combo.terminal ? 0.4 : 0);
      const carry = (m.push || 0.4) * (role === 'finisher' ? 0.09 : 0.05);
      d.knockV.x = away.x * carry; d.knockV.z = away.z * carry;
      if (reaction === 'wallsplat' && !d.combo.wallUsed) { d.knockV.x = away.x * 0.12; d.knockV.z = away.z * 0.12; d.wallsplatPending = true; }
      if (role === 'finisher') d.combo.terminal = true;
    } else if (reaction === 'launch' || (d.state === 'crumple') || (d.state === 'wall' && (reaction === 'launch' || reaction === 'knockdown'))) {
      this.setState(d, 'air');
      d.vel.y = reaction === 'launch' ? (m.launch || 0.1) : 0.07;
      if (d.combo.juggle === 0) d.combo.juggle = 1;
      d.juggleGravity = 1;
      d.knockV.x = away.x * 0.007; d.knockV.z = away.z * 0.007;
      if (reaction === 'launch') this.emit('launch', { fighter: d.index });
    } else if (reaction === 'knockdown') {
      this.setState(d, 'air');
      d.vel.y = 0.06; d.juggleGravity = 1.3;
      d.combo.terminal = true;           // a knockdown is a finisher: it cannot be juggled further up
      d.combo.juggle = Math.max(d.combo.juggle, 3);
      const sp = 0.03 + (m.push || 0.6) * 0.03;
      d.knockV.x = away.x * sp; d.knockV.z = away.z * sp;
    } else if (reaction === 'wallsplat') {
      if (!d.combo.wallUsed && this.distToWallBehind(d, away) < 1.4) { this.wallSplat(d, away); }
      else {
        this.setState(d, 'air');
        d.vel.y = 0.05; d.juggleGravity = 1.2;
        d.combo.juggle = Math.max(d.combo.juggle, 2);
        const sp = 0.05 + (m.push || 1) * 0.04;
        d.knockV.x = away.x * sp; d.knockV.z = away.z * sp;
        d.wallsplatPending = true;
      }
    } else if (reaction === 'crumple' && !d.combo.crumpleUsed) {
      this.setState(d, 'crumple'); d.combo.crumpleUsed = true;
      this.emit('crumple', { fighter: d.index });
    } else if (d.state === 'wall') {
      d.stun = Math.min(d.stun + 6, WALL_STUN_MAX);   // absolute cap: wall loops always end
    } else {
      // Standing hit-stun. Long ground combos lose hit-stun so they cannot loop forever.
      const decay = Math.max(0, d.combo.hits - 4) * 3;
      const stun = Math.max(1, remaining + m.hit + (counter ? 4 : 0) - decay);
      this.setState(d, 'hit');
      d.stun = stun;
      d.pushV = (HIT_PUSH + (m.push || 0) * 0.04) / d.def.weight;
    }
    this.emit(counter ? 'counter' : 'hit', { attacker: a.index, defender: d.index, pos: hitPos, heavy, dmg, sfx: m.sfx, level: lvl, combo: d.combo.hits, reaction, move: m.id, startupCatch });
    if (heavy) this.emit('shake', { amount: m.rage ? 1.2 : counter ? 0.6 : 0.4 });
    if (d.hp <= 0) this.doKO(d, a);
  }

  doKO(d, a) {
    if (this.koFighter) return;
    d.ko = true;
    this.koFighter = d;
    if (d.state !== 'air' && d.state !== 'down') {
      const away = { x: d.pos.x - a.pos.x, z: d.pos.z - a.pos.z }; normalize(away);
      this.setState(d, 'air'); d.vel.y = 0.07; d.juggleGravity = 1;
      d.knockV.x = away.x * 0.06; d.knockV.z = away.z * 0.06;
    }
    this.slowmo = 90;
    this.emit('ko', { fighter: d.index, winner: a.index, pos: this.p3(d, 1) });
  }

  wallSplat(d, away) {
    d.combo.wallUsed = true;
    d.wallsplatPending = false;
    this.setState(d, 'wall');
    d.stun = 42;
    d.vel.y = 0; d.pos.y = 0; d.knockV.x = d.knockV.z = 0;
    d.face.x = -away.x; d.face.z = -away.z;
    this.emit('wallsplat', { fighter: d.index, pos: this.p3(d, 1.1) });
    this.emit('shake', { amount: 0.6 });
  }

  distToWallBehind(d, away) {
    let best = 99;
    const lim = ARENA_HALF - BODY_RADIUS;
    if (away.x > 0.2) best = Math.min(best, (lim - d.pos.x) / away.x);
    if (away.x < -0.2) best = Math.min(best, (-lim - d.pos.x) / away.x);
    if (away.z > 0.2) best = Math.min(best, (lim - d.pos.z) / away.z);
    if (away.z < -0.2) best = Math.min(best, (-lim - d.pos.z) / away.z);
    return best;
  }

  contactPoint(a, d, m = a.move) {
    const [hl, hh] = this.hitboxRange(a, m);
    const [dl, dh] = this.hurtRange(d);
    const y = (Math.max(hl, dl) + Math.min(hh, dh)) / 2;
    const reach = Math.min(m.hitPointLocal ? m.hitPointLocal[2] : m.reach, Math.hypot(d.pos.x - a.pos.x, d.pos.z - a.pos.z) - 0.18);
    return [a.pos.x + a.face.x * reach, y, a.pos.z + a.face.z * reach];
  }

  // ------------------------------------------------------------------ physics
  physics(f) {
    const o = this.opponent(f);
    const fx = f.face.x, fz = f.face.z;
    const lx = -fz, lz = fx;     // lateral (left of facing)
    const into = this.intoScreenSign(f); // sign so that +ssDir*lat goes into the screen
    let vx = 0, vz = 0;
    switch (f.state) {
      case 'walkF': vx = fx * f.def.walkF; vz = fz * f.def.walkF; if (f.t % 22 === 1) this.emit('step', { fighter: f.index, pos: this.p3(f), soft: true }); break;
      case 'run': { const s = f.def.walkF * 2.3; vx = fx * s; vz = fz * s; if (f.t % 16 === 1) this.emit('step', { fighter: f.index, pos: this.p3(f) }); break; }
      case 'walkB': vx = -fx * f.def.walkB; vz = -fz * f.def.walkB; if (f.t % 24 === 1) this.emit('step', { fighter: f.index, pos: this.p3(f), soft: true }); break;
      case 'dash': { const s = f.def.dash * Math.max(0.15, 1 - f.t / 18); vx = fx * s; vz = fz * s; break; }
      case 'backdash': { const s = f.def.backdash * Math.max(0, 1 - f.t / 20); vx = -fx * s; vz = -fz * s; break; }
      case 'sidestep': {
        const k = f.t < 3 ? 0.7 : Math.max(0.1, 1 - (f.t - 3) / f.def.ssFrames);
        const s = f.def.ssSpeed * k * f.ssDir * into;
        vx = lx * s; vz = lz * s; break;
      }
      case 'sidewalk': { const s = f.def.ssSpeed * 0.55 * f.ssDir * into; vx = lx * s; vz = lz * s; break; }
      case 'getup': {
        if (f.rollDir) { const s = 0.05 * Math.max(0, 1 - f.t / 18); vx = -fx * s; vz = -fz * s; }
        if (f.rollSide) { const s = 0.05 * Math.max(0, 1 - f.t / 18) * f.rollSide * into; vx += lx * s; vz += lz * s; }
        break;
      }
    }
    // Pushback (from hits / blocks) slides along -facing and decays.
    if (f.pushV > 0.0005) {
      vx -= fx * f.pushV; vz -= fz * f.pushV;
      f.pushV *= 0.86;
      // If pinned against a wall the attacker is pushed back instead.
      if (this.atWall(f) && (o.state === 'attack' || o.state === 'idle')) { o.pos.x += fx * f.pushV * 0.7; o.pos.z += fz * f.pushV * 0.7; }
    } else f.pushV = 0;

    // Jump arc
    if (f.state === 'jump') {
      if (f.t === 7) { f.vel.y = f.def.jumpVy; f.vel.x = fx * 0.035 * f.jumpH; f.vel.z = fz * 0.035 * f.jumpH; }
      if (f.t >= 7) {
        f.vel.y -= GRAVITY; f.pos.y += f.vel.y; vx += f.vel.x; vz += f.vel.z;
        if (f.pos.y <= 0 && f.t > 8) { f.pos.y = 0; f.vel.y = 0; this.setState(f, 'land'); this.emit('land', { fighter: f.index, pos: this.p3(f) }); }
      }
    } else if (f.state === 'attack' && f.move.spec.special === 'air') {
      f.vel.y -= GRAVITY * 1.3; f.pos.y += f.vel.y; vx += f.vel.x; vz += f.vel.z;
      if (f.pos.y < 0) f.pos.y = 0;
    } else if (f.state === 'attack' && f.move.airborne) {
      const m = f.move, [a0, a1] = m.airborne;
      const k = f.mf >= a0 && f.mf <= a1 ? Math.sin(Math.PI * (f.mf - a0) / (a1 - a0)) : 0;
      f.pos.y = k * 0.35;
    } else if (f.state === 'air') {
      f.vel.y -= AIR_GRAVITY * f.juggleGravity;
      f.pos.y += f.vel.y;
      vx += f.knockV.x; vz += f.knockV.z;
      f.knockV.x *= 0.985; f.knockV.z *= 0.985;
      if (f.pos.y <= 0 && f.vel.y < 0) {
        f.pos.y = 0; f.vel.y = 0; f.knockV.x *= 0.3; f.knockV.z *= 0.3;
        this.setState(f, 'down');
        f.wallsplatPending = false;
        this.emit('land', { fighter: f.index, pos: this.p3(f), heavy: true });
      }
    } else if (f.state === 'down' && (Math.abs(f.knockV.x) + Math.abs(f.knockV.z)) > 0.001) {
      vx += f.knockV.x; vz += f.knockV.z; f.knockV.x *= 0.8; f.knockV.z *= 0.8;
    } else if (f.pos.y > 0 && f.state !== 'jump') {
      f.pos.y = Math.max(0, f.pos.y - 0.05);
    }
    f.pos.x += vx; f.pos.z += vz;
  }

  intoScreenSign(f) {
    // lateral vector (left of facing) dotted with the into-screen direction (= -camDir)
    const lx = -f.face.z, lz = f.face.x;
    return (lx * -this.camDir.x + lz * -this.camDir.z) >= 0 ? 1 : -1;
  }

  atWall(f) {
    const lim = ARENA_HALF - BODY_RADIUS - 0.02;
    return Math.abs(f.pos.x) >= lim || Math.abs(f.pos.z) >= lim;
  }

  resolveBodies() {
    const [a, b] = this.fighters;
    if (a.state === 'thrown' || b.state === 'thrown') return;
    if (Math.abs(a.pos.y - b.pos.y) > 0.9) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const ra = a.state === 'down' ? BODY_RADIUS * 0.6 : BODY_RADIUS;
    const rb = b.state === 'down' ? BODY_RADIUS * 0.6 : BODY_RADIUS;
    const min = ra + rb;
    if (d < min) {
      const nx = d > 1e-4 ? dx / d : a.face.x, nz = d > 1e-4 ? dz / d : a.face.z;
      const over = min - d;
      const wa = b.def.weight / (a.def.weight + b.def.weight);
      a.pos.x -= nx * over * wa; a.pos.z -= nz * over * wa;
      b.pos.x += nx * over * (1 - wa); b.pos.z += nz * over * (1 - wa);
    }
  }

  clampArena(f) {
    const lim = ARENA_HALF - BODY_RADIUS;
    let hitWall = null;
    if (f.pos.x > lim) { f.pos.x = lim; hitWall = { x: -1, z: 0 }; }
    if (f.pos.x < -lim) { f.pos.x = -lim; hitWall = { x: 1, z: 0 }; }
    if (f.pos.z > lim) { f.pos.z = lim; hitWall = { x: 0, z: -1 }; }
    if (f.pos.z < -lim) { f.pos.z = -lim; hitWall = { x: 0, z: 1 }; }
    if (f.pos.y < 0) f.pos.y = 0;
    if (hitWall && f.state === 'air' && f.wallsplatPending && !f.combo.wallUsed && !f.ko) {
      this.wallSplat(f, { x: -hitWall.x, z: -hitWall.z });
    } else if (hitWall && f.state === 'air' && Math.hypot(f.knockV.x, f.knockV.z) > 0.03) {
      f.knockV.x *= -0.2; f.knockV.z *= -0.2;
      this.emit('wallHit', { fighter: f.index, pos: this.p3(f, 1) });
    }
  }

  updateFacing(f) {
    const o = this.opponent(f);
    const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const tx = dx / d, tz = dz / d;
    let maxTurn;
    switch (f.state) {
      case 'attack': {
        const m = f.move;
        maxTurn = f.mf < m.startup ? (m.tracking === 99 ? Math.PI : ((m.tracking || 0.6) * Math.PI / 180)) : 0;
        if (f.mf <= 1) maxTurn = Math.PI;   // moves start aimed at the opponent
        break;
      }
      case 'air': case 'down': case 'wall': case 'thrown': case 'throwing': case 'ko': case 'crumple': case 'win':
        maxTurn = 0; break;
      case 'hit': case 'block': case 'parried': maxTurn = 0.2; break;
      case 'sidestep': case 'sidewalk': maxTurn = Math.PI; break;
      default: maxTurn = 0.35;
    }
    if (maxTurn <= 0) return;
    const cur = Math.atan2(f.face.z, f.face.x);
    let want = Math.atan2(tz, tx);
    let diff = want - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    f.face.x = Math.cos(cur + turn); f.face.z = Math.sin(cur + turn);
  }

  // Camera stays perpendicular to the fighters' axis, on whichever side it already is (no flips).
  updateCamera() {
    const [a, b] = this.fighters;
    let ax = b.pos.x - a.pos.x, az = b.pos.z - a.pos.z;
    const d = Math.hypot(ax, az);
    if (d < 0.2) return;
    ax /= d; az /= d;
    let px = -az, pz = ax;
    if (px * this.camDir.x + pz * this.camDir.z < 0) { px = -px; pz = -pz; }
    this.camDir.x += (px - this.camDir.x) * 0.08;
    this.camDir.z += (pz - this.camDir.z) * 0.08;
    normalize(this.camDir);
  }

  p3(f, y = 0) { return [f.pos.x, f.pos.y + y, f.pos.z]; }
  mid3() { const [a, b] = this.fighters; return [(a.pos.x + b.pos.x) / 2, 1.1, (a.pos.z + b.pos.z) / 2]; }
}

function normalize(v) { const l = Math.hypot(v.x, v.z) || 1; v.x /= l; v.z /= l; return v; }

function pointSegDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t, cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}
