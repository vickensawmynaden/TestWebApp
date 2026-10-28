// Fighter: per-fighter state, input history and move lookup. Pure data + small helpers,
// the frame-by-frame rules live in world.js so both fighters can be resolved together.
import { INPUT_BUFFER, B1, B2, B3, B4 } from './constants.js';
import { normalizeMoves } from './movedata.js';

export { limbHitPoint } from './hitpoints.js';

const NEUTRAL_STATES = new Set(['idle', 'walkF', 'walkB', 'crouch', 'run']);

export class Fighter {
  constructor(def, index) {
    this.def = def;
    this.index = index;
    // Per-instance copies of the normalised move data (see movedata.js).
    const { map, commandMoves } = normalizeMoves(def);
    this.moveMap = map;
    this.commandMoves = commandMoves;
    this.airMove = this.commandMoves.find(m => m.spec.special === 'air') || null;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prevPos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.face = { x: 0, z: 1 };
    this.prevFace = { x: 0, z: 1 };
    this.reset(0, 0, 1);
  }

  reset(x, z, faceSign) {
    this.pos.x = x; this.pos.y = 0; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.face.x = faceSign; this.face.z = 0;
    this.prevPos.x = x; this.prevPos.y = 0; this.prevPos.z = z;
    this.prevFace.x = faceSign; this.prevFace.z = 0;
    this.hp = this.def.hp;
    this.displayHp = this.def.hp;   // trailing "recoverable" bar for the HUD
    this.state = 'idle';
    this.t = 0;
    this.move = null;
    this.mf = 0;                     // current frame of move (1-based)
    this.moveHit = false;            // the current move already connected (hit / block / parry)
    this.moveResult = null;          // 'hit' | 'block' | 'whiff' | 'ch'
    this.queued = null;              // queued string follow-up
    this.buffered = null;            // attack buffered during recovery
    this.stun = 0;
    this.buf = [];
    this.inputN = 0;                 // stamp of the newest input-history entry
    this.minInputN = 0;              // inputs stamped at or before this are ignored (interruptions)
    this.motionN = 0;                // last frame of the most recently consumed motion command
    this.attackSeq = 0;              // increments on every attack execution (AI / training tracking)
    this.prevHeld = 0;
    this.carryPress = 0;
    this.guardBtn = false;
    this.guard = null;               // 'stand' | 'crouch' | null
    this.screenSide = 1;             // +1 when the opponent is to the screen-right
    this.combo = { hits: 0, dmg: 0, juggle: 0, wallUsed: false, crumpleUsed: false, active: false };
    this.juggleGravity = 1;
    this.ko = false;
    this.rage = false;
    this.rageUsed = false;
    this.invuln = 0;
    this.ssDir = 0;                  // +1 sidestep into screen, -1 out of screen
    this.lastSsEnd = -99;
    this.airMoveUsed = false;
    this.throwData = null;
    this.hitLevel = 'mid';           // last hit reaction level (for animation)
    this.hitHeavy = false;
    this.pushV = 0;                  // pushback speed along -face
    this.knockV = { x: 0, z: 0 };
    this.wallNormal = null;
    this.frameCount = 0;
    this.lastMoveInfo = null;        // for training mode frame data
    this.winPose = 0;
    this.throwProtect = 0;           // frames after get-up during which throws cannot connect
  }

  get dir() { return this.buf.length ? this.buf[this.buf.length - 1].dir : 5; }
  get press() { return this.buf.length ? this.buf[this.buf.length - 1].press : 0; }
  get held() { return this.buf.length ? this.buf[this.buf.length - 1].held : 0; }

  isNeutral() { return NEUTRAL_STATES.has(this.state); }

  pushInput(dir, held, guardBtn) {
    const press = (held & ~this.prevHeld) | this.carryPress;
    this.carryPress = 0;
    this.prevHeld = held;
    this.guardBtn = guardBtn;
    this.buf.push({ dir, press, held, n: ++this.inputN });
    if (this.buf.length > INPUT_BUFFER) this.buf.shift();
  }

  // During hit-stop the simulation is frozen; remember presses so strings are not dropped.
  holdInput(held, guardBtn) {
    this.carryPress |= held & ~this.prevHeld;
    this.prevHeld = held;
    this.guardBtn = guardBtn;
  }

  // Forget every input up to now: after an interruption no earlier press or motion may fire.
  invalidateInputs() { this.minInputN = this.inputN; }

  // Previous frame's direction (for tap detection).
  prevDir(n = 1) { const i = this.buf.length - 1 - n; return i >= 0 ? this.buf[i].dir : 5; }

  posture() {
    switch (this.state) {
      case 'down': case 'getupLie': return 'down';
      case 'air': return 'air';
      case 'jump': return this.pos.y > 0.05 ? 'jump' : 'stand';
      case 'crouch': return 'crouch';
      case 'block': return this.guard === 'crouch' ? 'crouch' : 'stand';
      case 'hit': return this.hitLevel === 'low-crouch' ? 'crouch' : 'stand';
      case 'crumple': return this.t > 44 ? 'down' : 'crouch';   // hittable (follow-ups launch) for 44 of its 52 frames
      case 'getup': return this.t < 8 ? 'crouch' : 'stand';
      case 'attack': {
        const m = this.move;
        if (m.airborne && this.mf >= m.airborne[0] && this.mf <= m.airborne[1]) return 'jump';
        if (m.spec.special === 'air') return 'jump';
        return m.crouching ? 'crouch' : 'stand';
      }
      default: return 'stand';
    }
  }
}

export const BUTTON_MASKS = { B1, B2, B3, B4 };
