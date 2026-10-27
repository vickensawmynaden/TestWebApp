// Turns simulation state into a pose every rendered frame: keyframed attacks synced to
// frame data, procedural locomotion, hit reactions and crossfades between states.
import { POSE_LAYOUT as L, POSE_SIZE, STANCES, STATE_POSES, ATTACKS, SHOWCASE, compilePose, lerpPose, ease } from './poses.js';

const BLEND = { attack: 2.5, hit: 1.5, block: 2, air: 3, down: 6, default: 6 };

// Locomotion / idle personality per fighter. Purely visual: hurtboxes come from the sim posture,
// so idle sways (e.g. Caio's ginga) never grant evasion.
//   bounce: idle bob amount, rate: bob speed, walk: walk-cycle period (frames), run: run period,
//   sway: side-to-side ginga amplitude (m), stomp: heavy-step pelvis drop.
const STYLE = {
  ren: { bounce: 0.5, rate: 0.08, walk: 28, run: 16 },
  maya: { bounce: 2.2, rate: 0.2, walk: 20, run: 14 },
  viktor: { bounce: 0.5, rate: 0.06, walk: 36, run: 20, stomp: 0.03 },
  leila: { bounce: 1.4, rate: 0.17, walk: 22, run: 15 },
  caio: { bounce: 0.6, rate: 0.07, walk: 26, run: 16, sway: 0.16 },
  sora: { bounce: 0.35, rate: 0.09, walk: 26, run: 16 },
  kai: { bounce: 1.0, rate: 0.16, walk: 24, run: 15 },
};

export class Animator {
  constructor(charId) {
    this.charId = charId;
    this.style = STYLE[charId] || STYLE.ren;
    this.stance = compilePose(STANCES[charId] || STANCES.kai);
    this.states = {};
    for (const [k, v] of Object.entries(STATE_POSES)) this.states[k] = compilePose(v, this.stance);
    this.attacks = {};
    for (const [k, v] of Object.entries(ATTACKS)) {
      this.attacks[k] = { wind: compilePose(v.wind, this.stance), hit: compilePose(v.hit, this.stance), spin: v.spin || 0 };
    }
    // Air kick poses are layered on the jump pose.
    const jump = compilePose(STATE_POSES.jump, this.stance);
    this.attacks.airKick = { wind: compilePose(ATTACKS.airKick.wind, jump), hit: compilePose(ATTACKS.airKick.hit, jump), spin: 0 };
    const sc = SHOWCASE[charId] || SHOWCASE.kai;
    this.win = sc.win.map((p) => compilePose(p, this.stance));
    this.intro = sc.intro.map((p) => compilePose(p, this.stance));
    this.pose = Float32Array.from(this.stance);
    this.from = Float32Array.from(this.stance);
    this.target = new Float32Array(POSE_SIZE);
    this.tmpA = new Float32Array(POSE_SIZE);
    this.key = '';
    this.blendT = 1; this.blendDur = 1;
    this.faceDown = false;
    this.lastT = 0;
  }

  update(f, world, alpha) {
    const key = f.state + ':' + (f.move ? f.move.id : '') + ':' + (f.throwData?.phase || '');
    if (key !== this.key) {
      this.from.set(this.pose);
      this.blendT = 0;
      this.blendDur = BLEND[f.state] || BLEND.default;
      if (f.state === 'attack' && this.key.startsWith('attack')) this.blendDur = 2;
      if (f.state === 'crumple') this.faceDown = true;
      if (f.state === 'air' || f.state === 'wall') this.faceDown = false;
      this.key = key;
    }
    const t = f.t + alpha;
    this.computeTarget(f, world, t);
    // Crossfade from the previous pose; time advances with the simulation (freezes in hit-stop).
    const simFrame = f.frameCount + alpha;
    const dt = Math.max(0, simFrame - this.lastT);
    this.lastT = simFrame;
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    lerpPose(this.pose, this.from, this.target, ease.out(this.blendT));
    // Hit-stop shake on the victim.
    if (world.hitstop > 0 && (f.state === 'hit' || f.state === 'block' || f.state === 'air' || f.state === 'wall')) {
      const s = 0.012 * Math.sin(performance.now() * 0.09);
      this.pose[L.rootOff] += s; this.pose[L.rootOff + 2] += s * 0.5;
    }
    return this.pose;
  }

  computeTarget(f, world, t) {
    const T = this.target, st = this.states;
    const sty = this.style;
    switch (f.state) {
      case 'idle': case 'intro':
        if (f.state === 'intro') { this.showcase(this.intro, t, 70); break; }
        T.set(this.stance);
        this.breathe(T, t, sty.bounce);
        if (sty.sway) this.ginga(T, t);
        break;
      case 'walkF': case 'walkB': {
        T.set(this.stance);
        this.walkCycle(T, t, f.state === 'walkF' ? 1 : -1, sty.walk);
        break;
      }
      case 'run': {
        T.set(st.run);
        const ph = t / sty.run * Math.PI * 2;
        const s = Math.sin(ph), c = Math.cos(ph);
        T[L.lFoot + 2] = 0.05 + s * 0.32; T[L.lFoot + 1] = 0.075 + Math.max(0, c) * 0.18;
        T[L.rFoot + 2] = 0.05 - s * 0.32; T[L.rFoot + 1] = 0.075 + Math.max(0, -c) * 0.18;
        T[L.lHand + 2] = 0.1 - s * 0.25; T[L.rHand + 2] = 0.1 + s * 0.25;
        T[L.pelvis + 1] += Math.abs(c) * 0.03;
        T[L.chest + 1] = s * 12;
        break;
      }
      case 'crouch': T.set(st.crouch); this.breathe(T, t, 0.4); break;
      case 'dash': {
        T.set(st.dash);
        const k = Math.min(1, t / 16);
        T[L.lFoot + 2] += Math.sin(k * Math.PI) * 0.15; T[L.lFoot + 1] += Math.sin(k * Math.PI) * 0.06;
        break;
      }
      case 'backdash': {
        T.set(st.backdash);
        const k = Math.min(1, t / 20);
        T[L.rFoot + 2] -= Math.sin(k * Math.PI) * 0.1;
        break;
      }
      case 'sidestep': case 'sidewalk': {
        const lat = f.ssDir * world.intoScreenSign(f); // +1 moving to the fighter's left
        T.set(lat > 0 ? st.sidestepIn : st.sidestepOut);
        if (f.state === 'sidewalk') {
          const ph = Math.sin(t / 12 * Math.PI * 2);
          T[L.lFoot + 1] = 0.075 + Math.max(0, ph) * 0.06; T[L.rFoot + 1] = 0.075 + Math.max(0, -ph) * 0.06;
        }
        break;
      }
      case 'jump':
        if (f.t < 7) lerpPose(T, this.stance, st.prejump, ease.out(Math.min(1, t / 6)));
        else T.set(st.jump);
        break;
      case 'land': lerpPose(T, st.land, this.stance, ease.inOut(Math.min(1, t / 6))); break;
      case 'attack': this.attackPose(f, t); break;
      case 'block': {
        const g = f.guard === 'crouch' ? st.blockLow : st.blockHigh;
        T.set(g);
        const rec = Math.max(0, 1 - t / 5);
        T[L.chest] -= 8 * rec; T[L.pelvis + 2] -= 0.04 * rec;
        break;
      }
      case 'hit': {
        const p = f.hitLevel === 'high' ? st.hitHigh : f.hitLevel === 'mid' ? st.hitMid : f.hitLevel === 'low-crouch' ? st.blockLow : st.hitLow;
        const stun = Math.max(6, f.stun);
        const back = Math.max(0, (t - stun * 0.55) / (stun * 0.45));
        lerpPose(T, p, this.stance, ease.inOut(Math.min(1, back)));
        if (f.hitHeavy && t < 6) T[L.chest] += (f.hitLevel === 'mid' ? 8 : -10) * (1 - t / 6);
        break;
      }
      case 'parried': T.set(st.parried); break;
      case 'air': {
        T.set(st.air);
        const vy = f.vel.y;
        // tilt from upright-ish (rising) to flat (falling)
        const k = Math.max(0, Math.min(1, (0.08 - vy) / 0.16));
        T[L.root] = -45 - 50 * k;
        if (f.ko) T[L.root + 1] = t * 2.5;
        T[L.lHand + 1] += Math.sin(t * 0.3) * 0.08; T[L.rHand + 1] += Math.cos(t * 0.27) * 0.08;
        T[L.lFoot + 2] += Math.sin(t * 0.2) * 0.1;
        break;
      }
      case 'down': T.set(this.faceDown ? st.faceDown : st.down); if (!f.ko) this.breathe(T, t, 0.3); break;
      case 'getup': {
        const from = this.faceDown ? st.faceDown : st.down;
        if (t < 10) lerpPose(T, from, st.getup, ease.inOut(t / 10));
        else lerpPose(T, st.getup, this.stance, ease.inOut(Math.min(1, (t - 10) / 12)));
        if (t > 21) this.faceDown = false;
        break;
      }
      case 'wall': T.set(st.wall); T[L.head] += Math.sin(t * 0.1) * 4; break;
      case 'crumple':
        if (t < 26) lerpPose(T, st.hitMid, st.crumple, ease.inOut(t / 26));
        else lerpPose(T, st.crumple, st.faceDown, ease.in(Math.min(1, (t - 26) / 26)));
        break;
      case 'throwing': this.throwerPose(f, t); break;
      case 'thrown': this.thrownPose(f, t); break;
      case 'throwBreak': lerpPose(T, st.breakPush, this.stance, ease.inOut(Math.min(1, t / 22))); break;
      case 'win': this.showcase(this.win, t, 60); break;
      default: T.set(this.stance);
    }
  }

  showcase(list, t, period) {
    const n = list.length;
    const seg = t / period;
    const i = Math.min(n - 1, Math.floor(seg));
    const j = Math.min(n - 1, i + 1);
    lerpPose(this.target, list[i], list[j], ease.inOut(Math.min(1, Math.max(0, (seg - i) * 1.4 - 0.2))));
    this.breathe(this.target, t, 0.5);
  }

  // Capoeira ginga: rocking weight shift between the feet (visual only).
  ginga(T, t) {
    const s = Math.sin(t * 0.07), sw = this.style.sway;
    T[L.pelvis] += s * sw * 0.5;
    T[L.lFoot + 2] += s * sw; T[L.rFoot + 2] -= s * sw;
    T[L.chest + 1] += s * 14; T[L.hipRot + 1] += s * 10;
    T[L.rHand] += s * 0.12; T[L.lHand + 1] += -s * 0.05;
  }

  breathe(T, t, amt) {
    const s = Math.sin(t * this.style.rate);
    T[L.pelvis + 1] += s * 0.012 * amt;
    T[L.chest] += s * 1.5 * Math.min(1, amt);
    T[L.lHand + 1] += s * 0.008 * amt; T[L.rHand + 1] += Math.sin(t * this.style.rate + 1) * 0.008 * amt;
  }

  walkCycle(T, t, dir, period) {
    // Fighting-stance shuffle: lead foot steps, rear foot follows.
    const ph = (t / period) * Math.PI * 2;
    const s = Math.sin(ph);
    const lead = dir > 0 ? Math.max(0, s) : Math.max(0, -s);
    const rear = dir > 0 ? Math.max(0, -s) : Math.max(0, s);
    T[L.lFoot + 2] += s * 0.08 * dir; T[L.lFoot + 1] += lead * 0.045;
    T[L.rFoot + 2] += -s * 0.08 * dir; T[L.rFoot + 1] += rear * 0.045;
    T[L.pelvis + 1] += Math.abs(Math.cos(ph)) * 0.015 - 0.01 - (this.style.stomp ? Math.max(0, -Math.cos(ph * 2)) * this.style.stomp : 0);
    if (this.style.stomp) T[L.chest + 2] += s * 4;   // heavy weight shift side to side
    T[L.pelvis + 2] += s * 0.02 * dir;
    T[L.chest] += dir * 2;
  }

  attackPose(f, t) {
    const T = this.target, m = f.move;
    const anim = this.attacks[m.anim] || this.attacks.jabL;
    const mf = Math.max(0, f.mf - 1 + (t - f.t));   // fractional move frame
    const s = m.startup, a = m.active || 1;
    const windEnd = Math.max(2, s * 0.6);
    const hold = s + a + 1;
    const base = m.crouching ? this.states.crouch : this.stance;
    if (mf < windEnd) lerpPose(T, base, anim.wind, ease.inOut(mf / windEnd));
    else if (mf < s) lerpPose(T, anim.wind, anim.hit, ease.snap((mf - windEnd) / (s - windEnd)));
    else if (mf < hold) T.set(anim.hit);
    else lerpPose(T, anim.hit, base, ease.inOut(Math.min(1, (mf - hold) / Math.max(1, m.total - hold))));
    if (anim.spin) T[L.root + 1] += anim.spin * Math.min(1, mf / s);
    if (m.level === 'parry' && f.mf >= m.parry[0] && f.mf <= m.parry[1]) T[L.chest] += Math.sin(mf) * 0.5;
  }

  throwerPose(f, t) {
    const T = this.target, st = this.states, td = f.throwData;
    if (!td || td.phase === 'break') { T.set(st.throwHold); return; }
    const anim = td.anim;
    if (anim === 'suplex' || anim === 'slamThrow') {
      if (t < 20) lerpPose(T, st.throwHold, st.throwLift, ease.inOut(t / 20));
      else if (t < 34) lerpPose(T, st.throwLift, st.throwSlam, ease.in((t - 20) / 14));
      else lerpPose(T, st.throwSlam, this.stance, ease.inOut(Math.min(1, (t - 34) / 24)));
      if (anim === 'suplex' && t >= 20 && t < 40) { T[L.root] = -40 * Math.sin(Math.min(1, (t - 20) / 14) * Math.PI); }
    } else {
      // shoulder / spin throws: turn and heave over the shoulder
      if (t < 18) lerpPose(T, st.throwHold, st.throwLift, ease.inOut(t / 18));
      else if (t < 34) lerpPose(T, st.throwLift, st.throwSlam, ease.in((t - 18) / 16));
      else lerpPose(T, st.throwSlam, this.stance, ease.inOut(Math.min(1, (t - 34) / 24)));
      if (anim === 'spinThrow') T[L.root + 1] = -360 * Math.min(1, t / 34);
    }
  }

  thrownPose(f, t) {
    const T = this.target, st = this.states, td = f.throwData;
    if (!td || td.phase === 'break') { T.set(st.thrown); T[L.pelvis + 1] -= Math.min(0.06, t * 0.01); return; }
    // Carried over the thrower: rise, flip and slam on the back.
    if (t < 32) {
      const k = t / 32;
      lerpPose(T, st.thrown, st.air, ease.inOut(Math.min(1, k * 1.5)));
      const arc = Math.sin(k * Math.PI);
      T[L.rootOff + 1] = arc * 0.9 - (k > 0.7 ? 0.5 * (k - 0.7) / 0.3 : 0);
      T[L.rootOff + 2] = -k * 1.0;
      T[L.root] = -200 * ease.inOut(k);
      if (td.anim === 'spinThrow') T[L.root + 1] = -360 * ease.inOut(k);
    } else {
      lerpPose(T, st.air, st.down, ease.out(Math.min(1, (t - 32) / 6)));
      T[L.rootOff + 2] += -1.0 * Math.max(0, 1 - (t - 32) / 12);
    }
  }
}
