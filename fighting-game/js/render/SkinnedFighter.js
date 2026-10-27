// Skinned glTF fighter driven by the same sim-synced pose data as the procedural FighterModel.
//
// Models come from assets/characters/<id>.glb (auto-rigged by tools/charbuild/rig.py): one skinned
// mesh, a humanoid skeleton with identity rest rotations, and the rest joint table in
// scene.userData.rig. Every instance is a SkeletonUtils clone, so two copies of one fighter have
// independent skeletons.
//
// Retargeting: Animator poses are authored for the procedural body (appearance.js build). Body
// rotations are used as-is; arm targets are taken relative to the procedural shoulder and scaled by
// the arm-length ratio; leg targets relative to the procedural hip, scaled by the leg-length ratio,
// with the ground preserved. Limbs are then solved with two-bone IK using the model's own bone
// lengths (no stretching), and planted feet are locked in world space so they do not slide.
// This is presentation only: hurtboxes / hitboxes stay in the simulation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { POSE_LAYOUT as L } from './poses.js';
import { APPEARANCES } from './appearance.js';
import { HB_HIGH, HB_MID, HB_LOW } from '../sim/constants.js';

const DEG = Math.PI / 180;
export const SKINNED_IDS = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora'];
const loaded = new Map(); // id -> gltf
const failed = new Set();

export function preloadCharacters(ids = SKINNED_IDS, onProgress = null, base = 'assets/characters/') {
  const loader = new GLTFLoader();
  let done = 0;
  return Promise.all(ids.map((id) => loader.loadAsync(base + id + '.glb')
    .then((g) => {
      if (!g.scene.userData.rig) throw new Error('missing rig data');
      loaded.set(id, g);
    })
    .catch((err) => { failed.add(id); console.warn(`[characters] ${id}.glb failed, using procedural model:`, err.message || err); })
    .finally(() => { done++; if (onProgress) onProgress(done, ids.length, id); })));
}

export const hasSkinned = (id) => loaded.has(id);
export const characterStatus = () => ({ loaded: [...loaded.keys()], failed: [...failed] });

const _v = () => new THREE.Vector3();
const _q = () => new THREE.Quaternion();

// Rotation that maps rest frame (dir0, bend0) onto posed frame (dir1, bend1).
function frameRotation(dir0, bend0, dir1, bend1, out, m0, m1) {
  const n0 = _t.n0.crossVectors(dir0, bend0).normalize(), c0 = _t.c0.crossVectors(n0, dir0);
  const n1 = _t.n1.crossVectors(dir1, bend1).normalize(), c1 = _t.c1.crossVectors(n1, dir1);
  m0.makeBasis(dir0, c0, n0);
  m1.makeBasis(dir1, c1, n1);
  m0.transpose();
  m1.multiply(m0);
  return out.setFromRotationMatrix(m1);
}
const _t = { n0: _v(), c0: _v(), n1: _v(), c1: _v() };

export class SkinnedFighter {
  constructor(charId, def) {
    const g = loaded.get(charId);
    this.charId = charId;
    this.rig = g.scene.userData.rig;
    this.b = (APPEARANCES[charId] || APPEARANCES.ren).build;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.pivot); this.pivot.add(this.inner);
    this.root.scale.setScalar(def.scale || 1);
    this.scene = cloneSkinned(g.scene);
    this.inner.add(this.scene);
    this.bones = {};
    this.scene.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false; // posed bounds differ from the bind pose
        o.material = o.material.clone();
        o.material.envMapIntensity = 0.9;
        if (o.material.map) o.material.map.anisotropy = 4;
        this.mesh = o;
      }
    });
    this.setupRest();
    this.feet = [{ locked: false, pos: _v() }, { locked: false, pos: _v() }];
    this.world = {}; // bone -> { p: Vector3, q: Quaternion } in inner space
    for (const name of Object.keys(this.bones)) this.world[name] = { p: _v(), q: _q() };
    this.tailState = null;
    this.lunge = _v();
    this.tmpL = _v(); this.tmpW = _v();
    this.handHalf = { L: this.J['handTip.L'].distanceTo(this.J['wrist.L']) * 0.5, R: this.J['handTip.R'].distanceTo(this.J['wrist.R']) * 0.5 };
  }

  setupRest() {
    const J = Object.fromEntries(Object.entries(this.rig.joints).map(([k, v]) => [k, new THREE.Vector3(...v)]));
    this.J = J;
    const len = (a, b) => J[a].distanceTo(J[b]);
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len['ua' + s] = len('shoulder.' + s, 'elbow.' + s);
      this.len['fa' + s] = len('elbow.' + s, 'wrist.' + s);
      this.len['th' + s] = len('hip.' + s, 'knee.' + s);
      this.len['sh' + s] = len('knee.' + s, 'ankle.' + s);
    }
    const b = this.b;
    // Proportion ratios against the procedural body the poses were authored on.
    const armM = (this.len.uaL + this.len.faL + this.len.uaR + this.len.faR) / 2;
    const legM = (this.len.thL + this.len.shL + this.len.thR + this.len.shR) / 2;
    this.kArm = armM / (b.upperArm + b.foreArm);
    this.kLeg = legM / (b.thigh + b.shin);
    this.ankleY = (J['ankle.L'].y + J['ankle.R'].y) / 2;
    this.hipCenter = J['hip.L'].clone().add(J['hip.R']).multiplyScalar(0.5);
    this.pelvisAboveHip = J.pelvis.y - this.hipCenter.y;
    // Rest frames of the limb chains: bone direction + the direction the middle joint bends toward.
    this.restLimb = {};
    for (const s of ['L', 'R']) {
      this.restLimb['arm' + s] = this.restChain(J['shoulder.' + s], J['elbow.' + s], J['wrist.' + s], new THREE.Vector3(0, 0, -1));
      this.restLimb['leg' + s] = this.restChain(J['hip.' + s], J['knee.' + s], J['ankle.' + s], new THREE.Vector3(0, 0, 1));
      // Foot rest yaw (models stand with toes turned out); pose foot yaw is absolute.
      const fd = J['ball.' + s].clone().sub(J['ankle.' + s]);
      this.restLimb['footYaw' + s] = Math.atan2(fd.x, fd.z);
      this.restLimb['upperArmDir' + s] = J['elbow.' + s].clone().sub(J['shoulder.' + s]).normalize();
    }
    // Rest local offsets (bones have identity rest rotation, so offsets are rest translations).
    this.restOffset = {};
    for (const [name, bone] of Object.entries(this.bones)) this.restOffset[name] = bone.position.clone();
    this.parentName = {};
    for (const [name, bone] of Object.entries(this.bones)) this.parentName[name] = bone.parent && bone.parent.isBone ? bone.parent.name : null;
    const wp = this.rig.weapon;
    this.weapon = wp ? { hand: wp.hand, dir: new THREE.Vector3(...wp.dir).normalize(), aim: new THREE.Vector3(...wp.aim).normalize() } : null;
    this.tailBones = this.rig.bones.filter((x) => x[0].startsWith('tail')).map((x) => x[0]);
  }

  restChain(a, m, c, defaultBend) {
    const ac = c.clone().sub(a);
    const acn = ac.clone().normalize();
    const am = m.clone().sub(a);
    let bend = am.clone().addScaledVector(acn, -am.dot(acn));
    if (bend.length() < 0.012) bend = defaultBend.clone().addScaledVector(acn, -defaultBend.dot(acn));
    bend.normalize();
    return {
      d1: am.normalize(), d2: c.clone().sub(m).normalize(), bend,
    };
  }

  // Set a bone's world (inner-space) rotation; its position follows from the parent chain.
  place(name, q) {
    const w = this.world[name], pn = this.parentName[name];
    if (pn) {
      const pw = this.world[pn];
      w.p.copy(this.restOffset[name]).applyQuaternion(pw.q).add(pw.p);
      this.bones[name].quaternion.copy(pw.q).invert().multiply(q);
    } else {
      w.p.copy(this.bones[name].position);
      this.bones[name].quaternion.copy(q);
    }
    w.q.copy(q);
  }

  // f (optional): the fighter's simulation state. During a strike the striking fist / foot is steered
  // onto the simulation's hit point (limbHitPoint) so the visible limb and the authoritative hit
  // volume agree; when the model's limb is too short to reach it, the body lunges forward by the
  // shortfall (capped) with the planted feet held. Collision itself never reads the model.
  applyPose(p, f = null) {
    const strike = f ? this.strikeTarget(f) : null;
    this.lunge.set(0, 0, 0);
    this.applyCore(p, strike);
    if (strike && strike.w > 0) {
      const root = this.world[strike.hand ? 'upperarm_' + strike.side : 'thigh_' + strike.side].p;
      const reach = strike.hand ? (this.len['ua' + strike.side] + this.len['fa' + strike.side]) * 0.99 : (this.len['th' + strike.side] + this.len['sh' + strike.side]) * 0.99;
      const vec = this.tmpL.subVectors(strike.target, root);
      vec.y = Math.min(strike.hi, Math.max(strike.lo, root.y)) - root.y;   // height inside the band
      const short = vec.length() - reach;
      if (short > 0.005) {
        const vy = vec.y;
        vec.y = 0;
        const hd = vec.length();
        const len = Math.min(MAX_LUNGE[this.charId] ?? MAX_LUNGE.default, short);
        if (hd > 1e-3) this.lunge.copy(vec).multiplyScalar(len * strike.w / hd);
        // Strikes the limb cannot raise high enough: hop (lift the body) so it reaches the band.
        if (vy > 0) {
          const h = Math.max(0, hd - len);
          const lift = h < reach ? vy - Math.sqrt(reach * reach - h * h) : vy;
          if (lift > 0) this.lunge.y = Math.min(MAX_HOP[this.charId] ?? MAX_HOP.default, lift) * strike.w;
        }
        this.applyCore(p, strike);
      }
    }
    this.lastStrike = strike;
  }

  // Inner-space point the striking limb must reach this frame, and the blend weight (ramps in
  // during acceleration, holds through the active frames, releases over the follow-through).
  strikeTarget(f) {
    const m = f.move;
    if (f.state !== 'attack' || !m || !m.hitPointLocal || !['lHand', 'rHand', 'lFoot', 'rFoot'].includes(m.limb)) return null;
    const s = m.startup, a = m.active || 1, mf = f.mf;
    let w;
    if (mf < s * 0.5) w = 0;
    else if (mf < s) { const k = (mf - s * 0.5) / (s * 0.5); w = k * k * (3 - 2 * k); }
    else if (mf < s + a) w = 1;
    else w = Math.max(0, 1 - (mf - s - a) / 6);
    if (w <= 0) return null;
    const sc = f.def.scale || 1;
    const hp = m.hitPointLocal;
    const st = this.strikeV || (this.strikeV = { target: _v() });
    st.target.set(-hp[0] / sc, hp[1] / sc, hp[2] / sc);
    // Collision uses ground-plane reach plus the attack level's height band, so the limb is steered
    // to the hit point horizontally and kept at its animated height, clamped into the band.
    const band = m.level === 'high' ? HB_HIGH : m.level === 'low' ? HB_LOW : HB_MID;
    st.lo = band[0] / sc + 0.05; st.hi = band[1] / sc - 0.05;
    st.hand = m.limb.endsWith('Hand');
    st.side = m.limb[0] === 'l' ? 'L' : 'R';
    st.w = w;
    return st;
  }

  applyCore(p, strike) {
    const v = this.v || (this.v = {
      P: _v(), pelvisM: _v(), chestP: _v(), shoulderP: _v(), rel: _v(), target: _v(), pole: _v(), hipP: _v(),
      qHip: _q(), qChestL: _q(), qChestP: _q(), half: _q(), qs: _q(), qc: _q(), qn: _q(), qh: _q(), qf: _q(), qt: _q(), eu: new THREE.Euler(),
    });
    const b = this.b, kL = this.kLeg, kA = this.kArm;
    // ---- procedural reference frame (what the pose was authored against)
    const P = v.P.set(-p[L.pelvis], p[L.pelvis + 1], p[L.pelvis + 2]);
    const qHip = v.qHip.setFromEuler(v.eu.set(p[L.hipRot] * DEG, p[L.hipRot + 1] * DEG, p[L.hipRot + 2] * DEG, 'YXZ'));
    const qChestL = v.qChestL.setFromEuler(v.eu.set(p[L.chest] * DEG, p[L.chest + 1] * DEG, p[L.chest + 2] * DEG, 'YXZ'));
    // ---- model pelvis: height scaled about the ground by the leg ratio
    const pelvisM = v.pelvisM.set(P.x + this.lunge.x, this.ankleY + (P.y - 0.06 - 0.075) * kL + this.pelvisAboveHip + this.lunge.y, P.z + this.lunge.z);
    this.pivot.position.set(pelvisM.x - p[L.rootOff], pelvisM.y + p[L.rootOff + 1], pelvisM.z + p[L.rootOff + 2]);
    this.pivot.rotation.set(p[L.root] * DEG, p[L.root + 1] * DEG, p[L.root + 2] * DEG, 'YXZ');
    this.inner.position.set(-pelvisM.x, -pelvisM.y, -pelvisM.z);
    this.inner.updateWorldMatrix(true, false);

    this.bones.hips.position.copy(pelvisM);
    this.place('hips', qHip);
    // Spine takes half of the chest rotation, chest the rest.
    const half = v.half.identity().slerp(qChestL, 0.5);
    const qs = v.qs.multiplyQuaternions(qHip, half);
    this.place('spine', qs);
    const qc = v.qc.multiplyQuaternions(qs, half);
    this.place('chest', qc);
    const hp = p[L.head] * DEG, hy = p[L.head + 1] * DEG, hr = p[L.head + 2] * DEG;
    const qn = v.qn.setFromEuler(v.eu.set(hp * 0.35, hy * 0.4, hr * 0.4, 'YXZ')).premultiply(qc);
    this.place('neck', qn);
    const qh = v.qh.setFromEuler(v.eu.set(hp * 0.65, hy * 0.6, hr * 0.6, 'YXZ')).premultiply(qn);
    this.place('head', qh);

    // Arms: hand targets relative to the procedural shoulder (pelvis -> chest (0, 0.2, 0) -> shoulder).
    const chestP = v.chestP.set(0, 0.2, 0).applyQuaternion(qHip).add(P);
    const qChestP = v.qChestP.multiplyQuaternions(qHip, qChestL);
    for (const side of [1, -1]) {
      const s = side > 0 ? 'L' : 'R';
      const hk = side > 0 ? L.lHand : L.rHand, ek = side > 0 ? L.lElbow : L.rElbow;
      const shoulderP = v.shoulderP.set(b.shoulderW * side, 0.255, 0).applyQuaternion(qChestP).add(chestP);
      const rel = v.rel.set(-p[hk], p[hk + 1], p[hk + 2]).sub(shoulderP).multiplyScalar(kA);
      this.place('clavicle_' + s, this.clavicleRot(s, rel, qc));
      const cw = this.world['clavicle_' + s];
      const shoulderM = this.world['upperarm_' + s].p.copy(this.restOffset['upperarm_' + s]).applyQuaternion(cw.q).add(cw.p);
      const target = v.target.copy(shoulderM).add(rel);
      if (strike && strike.hand && strike.side === s) {
        // the fist (half a hand beyond the wrist) meets the hit point
        const want = this.tmpW.set(strike.target.x, Math.min(strike.hi, Math.max(strike.lo, target.y)), strike.target.z);
        const toHit = this.tmpL.subVectors(want, shoulderM).normalize().multiplyScalar(this.handHalf[s]);
        target.lerp(this.tmpL.subVectors(want, toHit), strike.w);
      }
      const pole = v.pole.set(-p[ek], p[ek + 1], p[ek + 2]);
      this.limb('upperarm_' + s, 'forearm_' + s, shoulderM, target, pole, this.len['ua' + s], this.len['fa' + s], this.restLimb['arm' + s]);
      this.place('hand_' + s, this.weapon && this.weapon.hand === 'hand_' + s ? this.aimWeapon(this.world['forearm_' + s].q, qc) : this.world['forearm_' + s].q);
    }

    // Legs: ankle targets relative to the procedural hip, scaled by the leg ratio.
    const hw = this.world.hips;
    for (const side of [1, -1]) {
      const s = side > 0 ? 'L' : 'R';
      const fk = side > 0 ? L.lFoot : L.rFoot, kk = side > 0 ? L.lKnee : L.rKnee;
      const hipP = v.hipP.set(b.hipW * side, -0.06, 0).applyQuaternion(qHip).add(P);
      const rel = v.rel.set(-p[fk], p[fk + 1], p[fk + 2]).sub(hipP).multiplyScalar(kL);
      const hipM = this.world['thigh_' + s].p.copy(this.restOffset['thigh_' + s]).applyQuaternion(hw.q).add(hw.p);
      const target = v.target.copy(hipM).add(rel);
      const striking = strike && !strike.hand && strike.side === s;
      this.lockFoot(side > 0 ? 0 : 1, target, striking ? 0 : (p[L.plant + (side > 0 ? 0 : 1)] ?? 0));
      if (striking) target.lerp(this.tmpW.set(strike.target.x, Math.min(strike.hi, Math.max(strike.lo, target.y)), strike.target.z), strike.w);
      const pole = v.pole.set(-p[kk], p[kk + 1], p[kk + 2]);
      this.limb('thigh_' + s, 'shin_' + s, hipM, target, pole, this.len['th' + s], this.len['sh' + s], this.restLimb['leg' + s]);
      // Pose foot yaw is absolute; the model's rest foot may be turned out, so remove that first.
      const restYaw = this.restLimb['footYaw' + s];
      const yaw = (p[L.footYaw + (side > 0 ? 0 : 1)] + p[L.hipRot + 1] * 0.3) * DEG;
      const pitch = p[L.footPitch + (side > 0 ? 0 : 1)] * DEG;
      const qf = v.qf.setFromEuler(v.eu.set(pitch, yaw, 0, 'YXZ')).multiply(v.qt.setFromAxisAngle(Y_AXIS, -restYaw));
      this.place('foot_' + s, qf);
      // toes stay flat on the floor when the heel lifts
      this.place('toe_' + s, pitch > 0 ? v.qt.setFromAxisAngle(Y_AXIS, yaw - restYaw) : qf);
    }
    if (this.tailBones.length) this.updateTail();
  }

  // A held blade follows the forearm, which would point it straight up whenever the fist is raised;
  // the wrist turns it toward the authored chest-space aim instead (at most 100 degrees).
  aimWeapon(qForearm, qChest) {
    const w = this.weapon, k = this.wv || (this.wv = { now: _v(), want: _v(), full: _q(), corr: _q(), out: _q() });
    k.now.copy(w.dir).applyQuaternion(qForearm);
    k.want.copy(w.aim).applyQuaternion(qChest);
    k.full.setFromUnitVectors(k.now, k.want);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(k.full.w)));
    k.corr.identity().slerp(k.full, ang > 100 * DEG ? (100 * DEG) / ang : 1);
    return k.out.multiplyQuaternions(k.corr, qForearm);
  }

  clavicleRot(s, rel, qChest) {
    const c = this.cv || (this.cv = { rest: _v(), want: _v(), full: _q(), out: _q() });
    c.rest.copy(this.restLimb['upperArmDir' + s]).applyQuaternion(qChest);
    c.want.copy(rel).normalize();
    c.full.setFromUnitVectors(c.rest, c.want);
    return c.out.identity().slerp(c.full, 0.18).multiply(qChest);
  }

  // Two-bone IK on the model's bone lengths; then orient both bones by frame matching.
  limb(upper, lower, a, target, pole, l1, l2, rest) {
    const k = this.lv || (this.lv = { d: _v(), mid: _v(), end: _v(), dir: _v(), q: _q(), m0: new THREE.Matrix4(), m1: new THREE.Matrix4() });
    const d = k.d.subVectors(target, a);
    let dist = d.length();
    const maxD = (l1 + l2) * 0.999, minD = Math.abs(l1 - l2) + 0.02;
    if (dist < 1e-5) { d.set(0, -1, 0); dist = minD; }
    d.divideScalar(dist);
    dist = Math.min(maxD, Math.max(minD, dist));
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const bend = pole.addScaledVector(d, -pole.dot(d));
    if (bend.lengthSq() < 1e-8) bend.copy(rest.bend);
    bend.normalize();
    const mid = k.mid.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(bend, l1 * sinA);
    const end = k.end.copy(a).addScaledVector(d, dist);
    this.place(upper, frameRotation(rest.d1, rest.bend, k.dir.subVectors(mid, a).normalize(), bend, k.q, k.m0, k.m1));
    this.place(lower, frameRotation(rest.d2, rest.bend, k.dir.subVectors(end, mid).normalize(), bend, k.q, k.m0, k.m1));
  }

  // Foot locking driven by the animation timeline: the Animator's per-foot plant weight (0..1, on
  // the simulation's frame clock) says when a foot is on the floor. A foot locks where it touched
  // down and holds that world position for as long as it is planted; the lock weight is the plant
  // weight, so feet release and re-plant over the authored frames, independent of render rate.
  // If the body travels so far that the locked foot would overstretch, it re-anchors smoothly.
  lockFoot(i, target, plant) {
    const f = this.feet[i];
    const k = this.fv || (this.fv = { w: _v(), l: _v(), inv: new THREE.Matrix4() });
    const toWorld = this.inner.matrixWorld;
    const tw = k.w.copy(target).applyMatrix4(toWorld);
    if (plant < 0.05) { f.locked = false; return; }
    if (!f.locked) { f.locked = true; f.pos.copy(tw); }
    else if (f.pos.distanceTo(tw) > 0.16 * this.kLeg + 0.04) f.pos.lerp(tw, 0.35);
    const lw = k.l.copy(f.pos).applyMatrix4(k.inv.copy(toWorld).invert());
    lw.y = target.y;
    target.lerp(lw, Math.min(1, plant));
  }

  // Tail: each segment aims at its rest position (keeps a ground coil on the ground), with lag.
  updateTail() {
    if (!this.tailState) {
      this.tailState = this.tailBones.map((n) => {
        const bone = this.bones[n];
        const child = bone.children.find((c) => c.isBone);
        const head = this.J[this.rig.bones.find((x) => x[0] === n)[2]];
        const tail = this.J[this.rig.bones.find((x) => x[0] === n)[3]];
        return { n, child, rest: tail.clone().sub(head).normalize(), len: head.distanceTo(tail), restTail: tail.clone(), dir: tail.clone().sub(head).normalize() };
      });
    }
    const t = this.tv || (this.tv = { c: _v(), d: _v(), e: _v(), q: _q() });
    let prev = 'hips';
    this.tailState.forEach((s, i) => {
      const pw = this.world[prev];
      const head = t.c.copy(this.restOffset[s.n]).applyQuaternion(pw.q).add(pw.p);
      // blend between "attached to the hips" and "resting where it lies"
      const attached = t.d.copy(s.restTail).sub(this.J.pelvis).applyQuaternion(this.world.hips.q).add(this.world.hips.p);
      const w = Math.max(0, 0.85 - i * 0.3);
      const aim = t.e.copy(s.restTail).lerp(attached, w).sub(head).normalize();
      s.dir.lerp(aim, 0.3).normalize();
      const q = t.q.setFromUnitVectors(s.rest, s.dir);
      this.world[s.n].p.copy(head);
      this.bones[s.n].quaternion.copy(pw.q).invert().multiply(q);
      this.world[s.n].q.copy(q);
      prev = s.n;
    });
  }

  // World position of a limb end (hit trails, sparks).
  limbWorld(limb, out) {
    const map = { lHand: 'hand_L', rHand: 'hand_R', lFoot: 'foot_L', rFoot: 'foot_R', lKnee: 'shin_L', rKnee: 'shin_R', lElbow: 'forearm_L', rElbow: 'forearm_R', body: 'chest' };
    const bone = this.bones[map[limb] || 'chest'];
    bone.updateWorldMatrix(true, false);
    if (limb === 'lHand' || limb === 'rHand') {
      const s = limb === 'lHand' ? 'L' : 'R';
      return out.copy(this.J['handTip.' + s]).sub(this.J['wrist.' + s]).multiplyScalar(0.5).applyMatrix4(bone.matrixWorld);
    }
    return bone.getWorldPosition(out);
  }

  dispose() {
    this.mesh.material.dispose();
    this.mesh.skeleton.dispose();
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Metres the body may lunge to bring a short limb onto its hit point. Ren's chibi model has limbs
// at 40-65 % of the length his move data assumes, so he dashes into his strikes.
const MAX_LUNGE = { default: 0.3, ren: 0.6, caio: 0.4 };
// Metres the body may lift (hop) for a strike the limb cannot raise high enough (Ren: chibi legs).
const MAX_HOP = { default: 0.35, ren: 0.6 };
