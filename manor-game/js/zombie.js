// Procedural low-poly zombies with a shambling walk, lunging runners and heavy brutes.
import * as THREE from 'three';
import { hasModel, makeModelMesh, RIGS } from './models.js';
import { hasHumans, makeHuman, aimBone, turnBone, attachBox, addStump } from './humans.js';

const SKINS = [0x6c725e, 0x626854, 0x77725f, 0x585e4e, 0x6e675a, 0x7b7564];
const SHIRTS = [0x3d3a33, 0x4a3b2b, 0x2f3238, 0x51463a, 0x3a2e2a, 0x6a6458];
const PANTS = [0x23211f, 0x2c2a24, 0x1d2228, 0x3a3127];

export const TYPES = {
  walker: { hp: 100, speed: 1.4, scale: 1.0, dmg: 12, score: 100 },
  runner: { hp: 70, speed: 3.4, scale: 0.95, dmg: 14, score: 150 },
  brute: { hp: 320, speed: 1.15, scale: 1.3, dmg: 34, score: 300 },
};

const geoCache = {};
function bx(w, h, d) {
  const k = `${w},${h},${d}`;
  return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8ff6a });
const eyeMatRed = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
const goreMat = new THREE.MeshStandardMaterial({ color: 0x4a0706, roughness: 0.4 });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.7 });

export class Zombie {
  constructor(type, x, z) {
    this.type = type;
    this.def = TYPES[type];
    this.hp = this.def.hp;
    this.alive = true;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.phase = Math.random() * 10;
    this.attackT = 0;
    this.attackCd = 0;
    this.mode = null; this.modeT = 0; this.pounceCd = 1 + Math.random() * 2; this.fountainT = 0;
    this.flinch = 0;
    this.stun = 0;
    this.deadT = 0;
    this.fall = 0;
    this.groanT = 1 + Math.random() * 5;
    this.speedMul = 0.85 + Math.random() * 0.3;
    this.headTilt = (Math.random() - 0.5) * 0.6;
    this.limp = Math.random() < 0.4 ? 0.3 + Math.random() * 0.4 : 0;
    this.parts = [];
    // regular walkers reuse the werewolf or ogre mesh, a bit smaller, with a shambling gait
    this.modelKey = type === 'walker' ? (Math.random() < 0.55 ? 'runner' : 'brute') : type;
    this.sizeMul = type === 'walker' ? (this.modelKey === 'brute' ? 0.78 : 0.9) : 1;
    // most of the dead are people: walkers always, runners usually; ogres and werewolves are rarer
    this.human = hasHumans() && (type === 'walker' || (type === 'runner' && Math.random() < 0.65));
    this.useModel = !this.human && hasModel(this.modelKey);
    if (this.human) this.buildHuman(); else if (this.useModel) this.buildModel(); else this.build();
  }

  build() {
    const s = this.def.scale;
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKINS), roughness: 0.85 });
    if (this.type === 'brute') skin.color.offsetHSL(0, 0, -0.08);
    const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRTS), roughness: 1 });
    const pants = new THREE.MeshStandardMaterial({ color: pick(PANTS), roughness: 1 });
    this.mats = [skin, shirt, pants];
    const hit = (m, part) => { m.userData.zombie = this; m.userData.part = part; m.castShadow = true; this.parts.push(m); return m; };
    const mesh = (geo, mat, part, x = 0, y = 0, z = 0, parent) => { const m = hit(new THREE.Mesh(geo, mat), part); m.position.set(x, y, z); parent.add(m); return m; };

    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.scale.setScalar(s);
    this.root = root;

    const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips); this.hips = hips;
    const torso = new THREE.Group(); hips.add(torso); this.torso = torso;
    const wide = this.type === 'brute' ? 1.35 : 1;
    mesh(bx(0.36 * wide, 0.2, 0.22), pants, 'body', 0, 0.02, 0, torso);
    mesh(bx(0.44 * wide, 0.5, 0.25), shirt, 'body', 0, 0.36, 0, torso);
    // torn shirt reveals ribs / wounds
    mesh(bx(0.16, 0.18, 0.02), goreMat, 'body', 0.08, 0.36, 0.13, torso);
    if (Math.random() < 0.5) mesh(bx(0.1, 0.03, 0.02), boneMat, 'body', 0.08, 0.4, 0.145, torso);
    mesh(bx(0.12, 0.1, 0.02), skin, 'body', -0.1, 0.2, 0.13, torso);
    mesh(bx(0.1, 0.1, 0.1), skin, 'body', 0, 0.64, 0, torso); // neck

    const headPivot = new THREE.Group(); headPivot.position.y = 0.68; torso.add(headPivot); this.headPivot = headPivot;
    const head = mesh(bx(0.23, 0.27, 0.25), skin, 'head', 0, 0.15, 0.01, headPivot);
    this.head = head;
    mesh(bx(0.2, 0.06, 0.17), skin, 'head', 0, -0.02, 0.05, headPivot).rotation.x = 0.35; // slack jaw
    mesh(bx(0.14, 0.04, 0.02), goreMat, 'head', 0, 0.03, 0.135, headPivot);
    const em = this.type === 'runner' ? eyeMatRed : eyeMat;
    mesh(bx(0.045, 0.03, 0.02), em, 'head', -0.055, 0.17, 0.136, headPivot);
    mesh(bx(0.045, 0.03, 0.02), em, 'head', 0.055, 0.17, 0.136, headPivot);
    const hair = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
    mesh(bx(0.24, 0.06, 0.2), hair, 'head', 0.02, 0.3, -0.03, headPivot);
    this.headParts = this.parts.filter(p => p.userData.part === 'head');

    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.27 * wide, 0.56, 0); torso.add(sh);
      mesh(bx(0.12, 0.32, 0.12), Math.random() < 0.5 ? shirt : skin, 'body', 0, -0.15, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
      mesh(bx(0.095, 0.3, 0.095), skin, 'body', 0, -0.15, 0, el);
      mesh(bx(0.1, 0.12, 0.05), skin, 'body', 0, -0.34, 0.01, el);
      this.arms.push({ sh, el, side });
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(side * 0.11 * wide, 0, 0); hips.add(hp);
      mesh(bx(0.15, 0.45, 0.16), pants, 'body', 0, -0.22, 0, hp);
      const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
      mesh(bx(0.12, 0.44, 0.13), Math.random() < 0.3 ? skin : pants, 'body', 0, -0.22, 0, kn);
      mesh(bx(0.12, 0.07, 0.24), pants, 'body', 0, -0.47, 0.05, kn);
      this.legs.push({ hp, kn, side });
    }
    root.position.copy(this.pos);
  }

  buildHuman() {
    const H = this.h = makeHuman();
    H.cur = null;
    H.reach = this.type === 'runner' ? 0.3 : 0.55 + Math.random() * 0.4;
    H.hunch = 0.2 + Math.random() * 0.3;
    H.armUp = (Math.random() - 0.3) * 0.25;
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.add(H.holder);
    root.updateMatrixWorld(true);
    const body = attachBox(H.bones.spine2 || H.bones.spine, [0.5, 0.8, 0.34], [0, -0.12, 0]);
    const head = attachBox(H.bones.head, [0.26, 0.3, 0.28], [0, 0.11, 0.02]);
    for (const [m, part] of [[body, 'body'], [head, 'head']]) { m.userData.zombie = this; m.userData.part = part; this.parts.push(m); }
    this.head = head; this.headParts = [head];
    this.root = root;
    root.position.copy(this.pos);
  }

  animateHuman(dt, moving, speed) {
    const H = this.h, B = H.bones;
    const grab = this.mode === 'grab';
    const want = grab || !moving ? 'idle' : speed > 2.3 ? 'run' : 'walk';
    if (H.procedural) return this.poseHuman(dt, want, speed, grab);
    if (want !== H.cur) {
      const next = H.actions[want];
      next.enabled = true; next.reset().setEffectiveWeight(1).fadeIn(H.cur ? 0.25 : 0).play();
      if (H.cur) H.actions[H.cur].fadeOut(0.25);
      H.cur = want;
    }
    if (want === 'walk') H.actions.walk.timeScale = Math.max(0.45, Math.min(1.4, speed / 1.5)) * (this.limp ? 0.8 : 1);
    if (want === 'run') H.actions.run.timeScale = Math.max(0.7, Math.min(1.5, speed / 4));
    if (want === 'idle') H.actions.idle.timeScale = grab ? 2.5 : 1;
    H.mixer.update(dt);
    this.phase += dt * (grab ? 9 : 3);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    // bend the clip into a zombie: hunched, head lolling, arms reaching for you
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = _f.set(sy, 0, cy), side = _r.set(-cy, 0, sy); // side points to the zombie's right
    const p = this.phase;
    const attack = this.attackT > 0 ? 1 - this.attackT / 0.55 : -1;
    turnBone(B.spine, side, H.hunch + (want === 'run' ? 0.15 : 0) - this.flinch * 0.7 + (grab ? 0.25 + Math.sin(p) * 0.08 : 0) + (attack > 0.5 ? 0.3 : 0));
    turnBone(B.neck, fwd, this.headTilt * 0.6 + Math.sin(p * 0.37) * 0.12);
    turnBone(B.head, side, -0.25 + (grab ? Math.sin(p * 1.3) * 0.25 : Math.sin(p * 0.8) * 0.06));
    let reach = H.reach, up = H.armUp + Math.sin(p * 0.9) * 0.06;
    if (this.lunge) { reach = 1; up = 0.2 + Math.sin(p * 2) * 0.08; }
    if (grab) { reach = 1; up = 0.15; }
    else if (attack >= 0) { reach = 1; up = attack < 0.55 ? 0.5 * attack / 0.55 : 0.5 - (attack - 0.55) * 2.2; }
    for (const [arm, fore, s] of [[B.lArm, B.lFore, -1], [B.rArm, B.rFore, 1]]) {
      const sw = Math.sin(p * 0.9 + s) * 0.05;
      _d.copy(fwd).addScaledVector(side, s * (grab ? 0.05 : 0.2) + sw).setY(up - 0.12).normalize();
      aimBone(arm, _d, reach);
      _d.copy(fwd).addScaledVector(side, s * 0.05).setY(up + 0.05).normalize();
      aimBone(fore, _d, reach * 0.85);
    }
  }

  // a full procedural zombie gait for bodies without usable clips
  poseHuman(dt, want, speed, grab) {
    const H = this.h, B = H.bones;
    for (const [b, r] of H.rest) { b.quaternion.copy(r.q); }
    const run = want === 'run', idle = want === 'idle';
    const rate = run ? 9 : idle ? 1.5 : 4.2 * Math.max(0.5, Math.min(1.4, speed / 1.4));
    this.phase += dt * (grab ? 9 : rate);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = _f.set(sy, 0, cy), side = _r.set(-cy, 0, sy);
    const p = this.phase, stride = run ? 0.7 : idle ? 0 : 0.38;
    // straighten the bind pose's arms/legs first: legs straight down
    for (const [up, leg, foot, s] of [[B.lUp, B.lLeg, B.lFoot, -1], [B.rUp, B.rLeg, B.rFoot, 1]]) {
      const ph = p + (s > 0 ? Math.PI : 0);
      const limp = this.limp && s > 0 ? 1 - this.limp : 1;
      _d.set(0, -1, 0).addScaledVector(fwd, Math.sin(ph) * stride * limp).addScaledVector(side, s * 0.04).normalize();
      aimBone(up, _d, 1);
      const bend = Math.max(0, Math.cos(ph)) * (run ? 0.9 : 0.45) * (idle ? 0 : 1);
      _d.set(0, -1, 0).addScaledVector(fwd, Math.sin(ph) * stride * limp - bend).normalize();
      aimBone(leg, _d, 1);
      _d.copy(fwd).setY(-0.35).normalize();
      aimBone(foot, _d, 1);
    }
    const attack = this.attackT > 0 ? 1 - this.attackT / 0.55 : -1;
    turnBone(B.spine, side, H.hunch + (run ? 0.3 : 0) - this.flinch * 0.7 + (grab ? 0.3 + Math.sin(p) * 0.08 : 0) + (attack > 0.5 ? 0.3 : 0));
    turnBone(B.spine, fwd, Math.sin(p) * (run ? 0.06 : 0.1));
    turnBone(B.neck, fwd, this.headTilt * 0.6 + Math.sin(p * 0.37) * 0.12);
    turnBone(B.head, side, -0.3 + (grab ? Math.sin(p * 1.3) * 0.25 : 0));
    let reach = run ? 0.0 : H.reach, up = H.armUp + Math.sin(p * 0.9) * 0.06;
    if (this.lunge) { reach = 1; up = 0.2 + Math.sin(p * 2) * 0.08; }
    if (grab) { reach = 1; up = 0.15; } else if (attack >= 0) { reach = 1; up = attack < 0.55 ? 0.5 * attack / 0.55 : 0.5 - (attack - 0.55) * 2.2; }
    for (const [arm, fore, s] of [[B.lArm, B.lFore, -1], [B.rArm, B.rFore, 1]]) {
      // relaxed hang (or a pumping swing when running) ...
      const ph = p + (s > 0 ? 0 : Math.PI);
      _d.set(0, -1, 0).addScaledVector(side, s * 0.18).addScaledVector(fwd, run ? Math.sin(ph) * 0.8 : 0.1).normalize();
      aimBone(arm, _d, 1);
      _d.set(0, -1, 0).addScaledVector(fwd, run ? 0.9 : 0.25).normalize();
      aimBone(fore, _d, 1);
      // ... then blended toward the zombie reach
      _d.copy(fwd).addScaledVector(side, s * (grab ? 0.05 : 0.2) + Math.sin(p * 0.9 + s) * 0.05).setY(up - 0.12).normalize();
      aimBone(arm, _d, reach);
      _d.copy(fwd).addScaledVector(side, s * 0.05).setY(up + 0.05).normalize();
      aimBone(fore, _d, reach * 0.85);
    }
    const hs = B.hips && H.rest.get(B.hips);
    if (hs) B.hips.position.y = hs.p.y * (1 - (idle ? 0 : Math.abs(Math.sin(p)) * (run ? 0.05 : 0.025)) - (run ? 0.04 : 0.02));
  }

  buildModel() {
    const { mesh, u, rig } = makeModelMesh(this.modelKey);
    this.u = u; this.rig = rig;
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    root.scale.setScalar(rig.scale * this.sizeMul);
    const lean = new THREE.Group(); lean.position.y = rig.hipY; root.add(lean); this.lean = lean;
    mesh.position.y = -rig.hipY; lean.add(mesh); this.mesh = mesh;
    for (const part of ['body', 'head']) {
      const b = rig[part];
      const hb = new THREE.Mesh(bx(...b.s), hitMat);
      hb.position.set(b.c[0], b.c[1] - rig.hipY, b.c[2]);
      hb.userData.zombie = this; hb.userData.part = part;
      lean.add(hb); this.parts.push(hb);
      if (part === 'head') { this.head = hb; this.headParts = [hb]; }
    }
    this.root = root;
    root.position.copy(this.pos);
  }

  animateModel(dt, moving, speed) {
    const t = this.type, u = this.u;
    const rate = t === 'runner' ? 8 : t === 'brute' ? 3.4 : 4.4;
    this.phase += dt * rate * (moving ? Math.max(0.35, speed / this.def.speed) : 0.25);
    const p = this.phase, s = Math.sin(p);
    const m = moving ? 1 : 0.15;
    let leg, aL, aR, lean, sway, bob;
    if (t === 'runner') {
      leg = s * 0.6 * m; aL = s * 0.75 * m - 0.25; aR = -s * 0.75 * m - 0.25;
      lean = 0.28; sway = Math.sin(p * 0.5) * 0.05; bob = Math.abs(s) * 0.08 * m;
    } else if (t === 'brute') {
      leg = s * 0.3 * m; aL = s * 0.3 * m; aR = -s * 0.3 * m;
      lean = 0.1; sway = s * 0.08 * m; bob = Math.abs(s) * 0.06 * m;
    } else {
      leg = s * 0.38 * m * (1 - this.limp * 0.5);
      aL = -1.2 + Math.sin(p * 0.9) * 0.14; aR = -1.1 + Math.sin(p * 0.9 + 1.3) * 0.14;
      lean = 0.14; sway = Math.sin(p * 0.5) * 0.1 + this.limp * 0.1; bob = Math.abs(s) * 0.04 * m;
    }
    if (this.attackT > 0) {
      const a = 1 - this.attackT / 0.55;
      const wind = a < 0.55 ? a / 0.55 : 1 - (a - 0.55) / 0.45;
      if (t === 'brute') { aL = aR = -2.6 * wind + (a > 0.55 ? -0.3 : 0); lean = 0.1 - wind * 0.15 + (a > 0.55 ? 0.25 : 0); }
      else if (t === 'runner') { aR = -2.2 * wind; aL = -0.6 - (a > 0.55 ? 1.6 * (1 - wind) : 0); lean = 0.35; }
      else { aL = aR = -1.3 - wind * 0.8; lean = 0.14 + (a > 0.55 ? 0.2 : 0); }
    }
    if (this.mode === 'wind') { lean = 0.75; aL = aR = 0.5; bob = 0.28; leg = 0.45; sway = 0; }
    else if (this.mode === 'air') { lean = 0.35; aL = -2.3; aR = -2.1; leg = -0.7; bob = 0; }
    else if (this.mode === 'grab') {
      const k = Math.sin(this.phase * 7);
      lean = 0.05 + k * 0.08; aL = -1.55 + k * 0.08; aR = -1.45 - k * 0.08; leg = 0.08 * k; sway = k * 0.05; bob = 0.12;
    }
    u.uLeg.value = leg; u.uArmL.value = aL; u.uArmR.value = aR;
    this.lean.rotation.x = lean - this.flinch * 0.45;
    this.lean.rotation.z = sway;
    this.lean.position.y = this.rig.hipY - bob;
    if (this.mode === 'grab') this.phase += dt * 4;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  // fatal headshot: hide everything above the neck and cap it with a raw stump
  popHead() {
    if (this.human && !this.headless) {
      this.headless = true;
      this.h.u.uHeadless.value = 1;
      this.h.model.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.material.needsUpdate = true; } });
      addStump(this.h.bones.neck);
      return true;
    }
    if (!this.useModel || this.headless) return false;
    this.headless = true;
    this.u.uCut.value = this.rig.neckY;
    this.mesh.material.side = THREE.DoubleSide; this.mesh.material.needsUpdate = true;
    const h = this.rig.head;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 10), goreMat);
    stump.position.set(h.c[0], this.rig.neckY - this.rig.hipY - 0.01, h.c[2] * 0.55);
    this.lean.add(stump);
    return true;
  }

  neckWorld(out) {
    if (this.human) return this.h.bones.neck.getWorldPosition(out);
    return this.lean.localToWorld(out.set(this.rig.head.c[0], this.rig.neckY - this.rig.hipY, this.rig.head.c[2] * 0.55)); }

  get radius() { return this.human ? 0.3 : this.useModel ? this.rig.radius * this.sizeMul : 0.32 * this.def.scale; }

  animate(dt, moving, speed) {
    if (this.human) return this.animateHuman(dt, moving, speed);
    if (this.useModel) return this.animateModel(dt, moving, speed);
    const runner = this.type === 'runner';
    const rate = runner ? 7.5 : this.type === 'brute' ? 3.2 : 4.2;
    this.phase += dt * rate * (moving ? Math.max(0.35, speed / this.def.speed) : 0.25);
    const p = this.phase;
    for (const L of this.legs) {
      const ph = p + (L.side > 0 ? Math.PI : 0);
      const amp = (runner ? 0.75 : 0.45) * (L.side > 0 ? 1 - this.limp : 1);
      L.hp.rotation.x = moving ? -Math.sin(ph) * amp : 0;
      L.kn.rotation.x = moving ? Math.max(0, Math.sin(ph + 1.2)) * (runner ? 1.3 : 0.8) : 0.05;
    }
    this.hips.position.y = 0.95 - (moving ? Math.abs(Math.sin(p)) * 0.04 : 0) - this.limp * 0.03 * Math.max(0, Math.sin(p));
    const lean = runner ? 0.45 : this.type === 'brute' ? 0.12 : 0.22;
    this.torso.rotation.x = lean - this.flinch * 0.9;
    this.torso.rotation.z = Math.sin(p * 0.5) * (runner ? 0.06 : 0.14) + this.limp * 0.12;
    this.torso.rotation.y = Math.sin(p * 0.5) * 0.1;
    this.headPivot.rotation.z = this.headTilt + Math.sin(p * 0.37) * 0.15;
    this.headPivot.rotation.x = -0.25 + Math.sin(p * 0.8) * 0.06 - (runner ? 0.3 : 0);

    // arms: reaching (walker/brute), pumping (runner), swiping during an attack
    const a = this.attackT > 0 ? 1 - this.attackT / 0.55 : -1;
    for (const A of this.arms) {
      if (a >= 0) {
        const wind = a < 0.55 ? a / 0.55 : 1 - (a - 0.55) / 0.45;
        A.sh.rotation.x = -1.4 - wind * 1.1 + (a > 0.55 ? (a - 0.55) * 4 : 0);
        A.sh.rotation.z = -A.side * 0.15;
        A.el.rotation.x = -0.4;
      } else if (runner) {
        A.sh.rotation.x = Math.sin(p + (A.side > 0 ? 0 : Math.PI)) * 0.9 - 0.3;
        A.sh.rotation.z = 0;
        A.el.rotation.x = -1.2;
      } else {
        A.sh.rotation.x = -1.35 + Math.sin(p * 0.9 + A.side) * 0.15;
        A.sh.rotation.z = -A.side * (0.08 + Math.sin(p * 0.6) * 0.06);
        A.el.rotation.x = -0.25 + Math.sin(p * 0.7 + A.side) * 0.15;
      }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  animateDeath(dt) {
    this.deadT += dt;
    // topple backwards with an accelerating fall, then settle
    const t = Math.min(1, this.deadT / 0.75);
    this.fall = -1.5 * t * t;
    this.root.rotation.x = this.fall;
    this.root.position.set(this.pos.x, Math.min(0.12, this.deadT * 0.2) * this.def.scale, this.pos.z);
    if (this.human) {
      // play the last frames out briefly, then freeze the pose as the body hits the ground
      if (this.deadT < 0.35 && this.h.mixer) this.h.mixer.update(dt * 0.5);
      if (this.deadT > 7) { this.root.position.y -= (this.deadT - 7) * 0.4; return this.deadT > 9; }
      return false;
    }
    if (this.useModel) {
      const k = Math.min(1, dt * 4), u = this.u;
      u.uLeg.value *= 1 - k; u.uArmL.value += (-2.4 - u.uArmL.value) * k; u.uArmR.value += (-2.2 - u.uArmR.value) * k;
      this.lean.rotation.x *= 1 - k;
      if (this.deadT > 7) { this.root.position.y -= (this.deadT - 7) * 0.4; return this.deadT > 9; }
      return false;
    }
    for (const A of this.arms) { A.sh.rotation.x += (-2.6 - A.sh.rotation.x) * Math.min(1, dt * 4); A.sh.rotation.z += (-A.side * 0.6 - A.sh.rotation.z) * Math.min(1, dt * 4); }
    for (const L of this.legs) { L.hp.rotation.x *= 0.92; L.kn.rotation.x += (0.6 - L.kn.rotation.x) * dt * 3; }
    this.torso.rotation.x *= 0.9;
    if (this.deadT > 7) {
      this.root.position.y -= (this.deadT - 7) * 0.4;
      return this.deadT > 9;
    }
    return false;
  }
}
