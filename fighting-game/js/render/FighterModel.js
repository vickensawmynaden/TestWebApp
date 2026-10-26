// Procedural fighter: sculpted lathe/sphere meshes driven by an IK rig.
// Arms and legs are positioned every frame from IK targets supplied by the animator,
// so feet stay planted and fists land exactly where the hitboxes are.
import * as THREE from 'three';
import { POSE_LAYOUT as L } from './poses.js';
import { clothTexture, noiseTexture } from './textures.js';

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);

const BUILDS = {
  kai: {
    shoulderW: 0.19, hipW: 0.095, upperArm: 0.29, foreArm: 0.26, thigh: 0.44, shin: 0.44,
    armR: 0.046, foreR: 0.04, thighR: 0.088, shinR: 0.062, torsoW: 1.0, torsoD: 0.62, neckR: 0.052,
    colors: { skin: 0xc58f68, top: 0x1c4fbf, trim: 0x0d0f14, pants: 0x14161b, sash: 0x2f74ff, glove: 0x15171c, shoe: 0x0c0d11, hair: 0x0b0d14, accent: 0x3d8bff },
  },
  viktor: {
    shoulderW: 0.225, hipW: 0.105, upperArm: 0.30, foreArm: 0.27, thigh: 0.44, shin: 0.45,
    armR: 0.06, foreR: 0.052, thighR: 0.1, shinR: 0.072, torsoW: 1.18, torsoD: 0.7, neckR: 0.066,
    colors: { skin: 0xd6ad92, top: 0xa3141c, trim: 0x2a0b0d, pants: 0x26272c, sash: 0x3a3d45, glove: 0x3d4149, shoe: 0x17171a, hair: 0x7a736d, accent: 0xff3b2e },
  },
};

// Lathe along -Y from 0 to -len with a muscle bulge.
function limbGeometry(len, r0, r1, bulgeAt = 0.35, bulge = 0.12, seg = 16) {
  const pts = [];
  const N = 14;
  pts.push(new THREE.Vector2(0.001, r0 * 0.55));
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0 * 0.55)); }
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.exp(-Math.pow((t - bulgeAt) / 0.22, 2)));
    pts.push(new THREE.Vector2(r, -t * len));
  }
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1 + 0.0005, -len - Math.sin(a) * r1 * 0.55)); }
  pts.push(new THREE.Vector2(0.001, -len - r1 * 0.56));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

// Lathe torso section from a radius profile [[y, r], ...].
function torsoGeometry(profile, seg = 24) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(Math.max(0.001, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

export class FighterModel {
  constructor(charId, def) {
    this.charId = charId;
    this.b = BUILDS[charId] || BUILDS.kai;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.pivot); this.pivot.add(this.inner);
    this.root.scale.setScalar(def.scale || 1);
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), eu: new THREE.Euler() };
    this.materials();
    this.build();
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  materials() {
    const c = this.b.colors;
    const cloth = clothTexture(this.charId === 'kai' ? 3 : 5);
    const skinBump = noiseTexture(128, 9, 30);
    skinBump.repeat.set(4, 4);
    this.mat = {
      skin: new THREE.MeshPhysicalMaterial({ color: c.skin, roughness: 0.52, sheen: 0.35, sheenColor: new THREE.Color(0xff7755), sheenRoughness: 0.55, clearcoat: 0.08, clearcoatRoughness: 0.6, bumpMap: skinBump, bumpScale: 0.25 }),
      top: new THREE.MeshPhysicalMaterial({ color: c.top, roughness: 0.82, sheen: 0.6, sheenColor: new THREE.Color(c.top).multiplyScalar(1.6), sheenRoughness: 0.8, bumpMap: cloth, bumpScale: 0.6 }),
      trim: new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.7, bumpMap: cloth, bumpScale: 0.4 }),
      pants: new THREE.MeshPhysicalMaterial({ color: c.pants, roughness: 0.88, sheen: 0.5, sheenColor: new THREE.Color(0x444a55), bumpMap: cloth, bumpScale: 0.7 }),
      sash: new THREE.MeshPhysicalMaterial({ color: c.sash, roughness: 0.5, metalness: this.charId === 'viktor' ? 0.8 : 0.0, sheen: 0.4, sheenColor: new THREE.Color(c.sash) }),
      glove: new THREE.MeshStandardMaterial({ color: c.glove, roughness: this.charId === 'viktor' ? 0.32 : 0.45, metalness: this.charId === 'viktor' ? 0.85 : 0.1 }),
      shoe: new THREE.MeshStandardMaterial({ color: c.shoe, roughness: 0.55 }),
      hair: new THREE.MeshPhysicalMaterial({ color: c.hair, roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color(this.charId === 'kai' ? 0x2f4cff : 0xaaaaaa), sheenRoughness: 0.4 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x4a4e57, metalness: 0.9, roughness: 0.3 }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.3 }),
      iris: new THREE.MeshStandardMaterial({ color: this.charId === 'kai' ? 0x1a2c55 : 0x3b4a3a, roughness: 0.2 }),
      accent: new THREE.MeshStandardMaterial({ color: c.accent, emissive: c.accent, emissiveIntensity: 0.9, roughness: 0.4 }),
      lip: new THREE.MeshStandardMaterial({ color: new THREE.Color(c.skin).multiplyScalar(0.8), roughness: 0.5 }),
    };
  }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  build() {
    const b = this.b, M = this.mat, viktor = this.charId === 'viktor';
    // ---------------- torso
    this.pelvisG = new THREE.Group(); this.inner.add(this.pelvisG);
    this.chestG = new THREE.Group(); this.chestG.position.set(0, 0.2, 0); this.pelvisG.add(this.chestG);
    this.neckG = new THREE.Group(); this.neckG.position.set(0, 0.31, 0); this.chestG.add(this.neckG);
    this.headG = new THREE.Group(); this.headG.position.set(0, 0.07, 0); this.neckG.add(this.headG);

    const abd = this.mesh(torsoGeometry([[-0.13, 0.001], [-0.12, 0.12], [-0.08, 0.165], [0.0, 0.158], [0.1, 0.14], [0.2, 0.15], [0.26, 0.16]]), M.top, this.pelvisG);
    abd.scale.set(b.torsoW, 1, b.torsoD);
    const hips = this.mesh(torsoGeometry([[-0.16, 0.001], [-0.15, 0.1], [-0.1, 0.165], [-0.02, 0.17], [0.04, 0.16], [0.06, 0.001]]), M.pants, this.pelvisG);
    hips.scale.set(b.torsoW * 1.02, 1, b.torsoD * 1.15);
    const belt = this.mesh(new THREE.TorusGeometry(0.163, 0.022, 8, 28), M.sash, this.pelvisG, 0, 0.02, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.set(b.torsoW * 1.0, b.torsoD * 1.12, 1);
    if (!viktor) {
      // sash tails
      const tail = new THREE.BoxGeometry(0.05, 0.22, 0.012);
      for (const s of [-1, 1]) { const t = this.mesh(tail, M.sash, this.pelvisG, 0.06 * s, -0.08, -0.105); t.rotation.z = 0.15 * s; t.rotation.x = -0.2; }
    } else {
      this.mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), M.metal, this.pelvisG, 0, 0.02, b.torsoD * 0.17);
    }

    const chest = this.mesh(torsoGeometry([[-0.06, 0.15], [0.04, 0.165], [0.13, 0.19], [0.2, 0.2], [0.26, 0.185], [0.3, 0.14], [0.33, 0.08], [0.345, 0.001]]), M.top, this.chestG);
    chest.scale.set(b.torsoW * 1.12, 1, b.torsoD * 1.05);
    // pecs & lats give the chest volume
    const pec = new THREE.SphereGeometry(0.085, 16, 12);
    for (const s of [-1, 1]) {
      const p = this.mesh(pec, M.top, this.chestG, 0.075 * s * b.torsoW, 0.2, 0.06 * b.torsoD / 0.62);
      p.scale.set(1.15, 0.8, 0.55);
      const lat = this.mesh(pec, M.top, this.chestG, 0.13 * s * b.torsoW, 0.12, -0.01);
      lat.scale.set(0.7, 1.2, 0.8);
    }
    // collar / neckline
    const vneck = this.mesh(new THREE.SphereGeometry(0.06, 12, 8), M.skin, this.chestG, 0, 0.29, 0.07 * b.torsoD / 0.62);
    vneck.scale.set(1, 0.8, 0.4);
    if (!viktor) {
      const collar = this.mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 20, Math.PI * 1.2), M.trim, this.chestG, 0, 0.3, 0.0);
      collar.rotation.x = Math.PI / 2 + 0.25; collar.rotation.z = -Math.PI * 0.1 - Math.PI;
      // emblem
      this.mesh(new THREE.CircleGeometry(0.03, 16), M.accent, this.chestG, -0.09, 0.2, 0.125 * b.torsoD / 0.62 + 0.012).rotation.y = -0.25;
    } else {
      // tank straps & armour pauldron on the lead shoulder
      const pauld = this.mesh(new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, this.chestG, b.shoulderW * 1.02, 0.28, 0);
      pauld.scale.set(1.0, 0.75, 1.05); pauld.rotation.z = -0.35;
      for (let i = 0; i < 3; i++) {
        const ring = this.mesh(new THREE.TorusGeometry(0.1 - i * 0.012, 0.008, 6, 20), M.metal, this.chestG, b.shoulderW * 1.06 + i * 0.012, 0.25 - i * 0.04, 0);
        ring.rotation.y = Math.PI / 2; ring.rotation.x = 0.3;
      }
      this.mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), M.accent, this.chestG, b.shoulderW * 1.02, 0.36, 0.03);
    }
    // deltoids
    this.delts = [];
    for (const s of [-1, 1]) {
      const d = this.mesh(new THREE.SphereGeometry(b.armR * 1.6, 16, 12), M.skin, this.chestG, b.shoulderW * s, 0.265, 0);
      d.scale.set(1, 1.05, 1.1);
      this.delts.push(d);
    }
    // neck & head
    this.mesh(limbGeometry(0.1, b.neckR, b.neckR * 1.15, 0.5, 0), M.skin, this.neckG, 0, 0.08, 0);
    this.buildHead();

    // ---------------- limbs (positioned by IK each frame)
    const arm = (side) => {
      const upper = this.mesh(limbGeometry(b.upperArm, b.armR * 1.1, b.armR * 0.85, 0.42, 0.22), M.skin, this.inner);
      const fore = this.mesh(limbGeometry(b.foreArm, b.foreR * 1.12, b.foreR * 0.78, 0.2, 0.14), M.skin, this.inner);
      const elbow = this.mesh(new THREE.SphereGeometry(b.foreR * 1.05, 12, 8), M.skin, this.inner);
      // glove / gauntlet on the forearm end, fist and open hand at the wrist
      const cuff = this.mesh(limbGeometry(viktor ? 0.16 : 0.07, b.foreR * (viktor ? 1.25 : 1.05), b.foreR * (viktor ? 1.0 : 0.95), 0.5, 0), viktor ? M.metal : M.glove, fore, 0, -b.foreArm + (viktor ? 0.15 : 0.065), 0);
      const fist = new THREE.Group(); fist.position.set(0, -b.foreArm - 0.035, 0); fore.add(fist);
      const fm = this.mesh(new THREE.SphereGeometry(0.05, 14, 10), viktor ? M.metal : M.glove, fist, 0, -0.02, 0.005);
      fm.scale.set(viktor ? 1.0 : 0.88, 1.0, 1.05);
      const knuckles = this.mesh(new THREE.CapsuleGeometry(0.022, 0.05, 4, 8), viktor ? M.metal : M.glove, fist, 0, -0.06, 0.015);
      knuckles.rotation.z = Math.PI / 2;
      const thumb = this.mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 6), M.skin, fist, 0.03 * side * -1, -0.04, 0.035);
      thumb.rotation.x = 0.6;
      const open = new THREE.Group(); open.position.copy(fist.position); fore.add(open);
      const palm = this.mesh(new THREE.BoxGeometry(0.075, 0.09, 0.03), M.skin, open, 0, -0.04, 0);
      palm.scale.set(1, 1, 1);
      for (let i = 0; i < 4; i++) { const f = this.mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), M.skin, open, -0.027 + i * 0.018, -0.115, 0); }
      this.mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), M.skin, open, 0.045 * -side, -0.05, 0.01).rotation.z = 0.7 * side;
      if (!viktor) { const wrap = this.mesh(limbGeometry(0.05, 0.05, 0.05, 0.5, 0), M.glove, open, 0, 0.0, 0); }
      cuff.castShadow = true;
      return { upper, fore, elbow, fist, open };
    };
    this.lArm = arm(1); this.rArm = arm(-1);

    const leg = (side) => {
      const pantsR = viktor ? 1.15 : 1.3;
      const thigh = this.mesh(limbGeometry(b.thigh, b.thighR * pantsR, b.shinR * 1.25 * pantsR, 0.3, 0.1), M.pants, this.inner);
      const shin = this.mesh(limbGeometry(b.shin, b.shinR * 1.25 * pantsR, b.shinR * (viktor ? 1.15 : 1.45), 0.25, viktor ? 0.08 : -0.05), M.pants, this.inner);
      const knee = this.mesh(new THREE.SphereGeometry(b.shinR * 1.3 * pantsR, 12, 8), M.pants, this.inner);
      if (viktor) {
        const pad = this.mesh(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, shin, 0, -0.04, 0.05);
        pad.rotation.x = Math.PI / 2 - 0.2; pad.scale.set(1, 1.2, 0.7);
        const boot = this.mesh(limbGeometry(0.16, b.shinR * 1.25, b.shinR * 1.3, 0.5, 0), M.shoe, shin, 0, -b.shin + 0.14, 0);
      } else {
        // stripe down the side of the gi pants
        const stripe = this.mesh(new THREE.BoxGeometry(0.012, b.thigh * 0.95, 0.02), M.accent, thigh, side * b.thighR * pantsR * 0.98, -b.thigh / 2, 0);
      }
      const foot = new THREE.Group(); this.inner.add(foot);
      const fm = this.mesh(new THREE.SphereGeometry(0.06, 14, 10), M.shoe, foot, 0, -0.03, 0.06);
      fm.scale.set(viktor ? 0.95 : 0.85, 0.62, 2.0);
      const heel = this.mesh(new THREE.SphereGeometry(0.05, 10, 8), M.shoe, foot, 0, -0.035, -0.02);
      heel.scale.set(0.95, 0.8, 1.0);
      const sole = this.mesh(new THREE.BoxGeometry(viktor ? 0.11 : 0.1, 0.018, 0.27), M.trim, foot, 0, -0.066, 0.05);
      return { thigh, shin, knee, foot };
    };
    this.lLeg = leg(1); this.rLeg = leg(-1);
  }

  buildHead() {
    const M = this.mat, viktor = this.charId === 'viktor';
    const h = this.headG;
    const skull = this.mesh(new THREE.SphereGeometry(0.1, 28, 20), M.skin, h, 0, 0.1, 0);
    skull.scale.set(0.9, 1.1, 1.0);
    const jaw = this.mesh(new THREE.SphereGeometry(0.075, 20, 14), M.skin, h, 0, 0.04, 0.03);
    jaw.scale.set(viktor ? 1.12 : 1.0, 0.9, 1.0);
    const cheek = new THREE.SphereGeometry(0.03, 10, 8);
    for (const s of [-1, 1]) {
      this.mesh(cheek, M.skin, h, 0.045 * s, 0.085, 0.07).scale.set(1, 0.7, 0.8);
      const ew = this.mesh(new THREE.SphereGeometry(0.014, 12, 8), M.eyeWhite, h, 0.034 * s, 0.112, 0.083);
      ew.scale.set(1.2, 0.7, 0.5);
      this.mesh(new THREE.SphereGeometry(0.0075, 10, 8), M.iris, h, 0.034 * s, 0.112, 0.09);
      const brow = this.mesh(new THREE.BoxGeometry(0.036, 0.008, 0.012), M.hair, h, 0.035 * s, 0.132, 0.088);
      brow.rotation.z = (viktor ? 0.18 : 0.12) * s;
      const ear = this.mesh(new THREE.SphereGeometry(0.022, 10, 8), M.skin, h, 0.088 * s, 0.1, 0.0);
      ear.scale.set(0.4, 1.1, 0.8);
    }
    const nose = this.mesh(new THREE.ConeGeometry(0.014, 0.045, 8), M.skin, h, 0, 0.095, 0.1);
    nose.rotation.x = Math.PI / 2 + 0.35;
    const lips = this.mesh(new THREE.CapsuleGeometry(0.008, 0.026, 3, 8), M.lip, h, 0, 0.055, 0.092);
    lips.rotation.z = Math.PI / 2;
    if (!viktor) {
      // spiky swept-back hair
      const cap = this.mesh(new THREE.SphereGeometry(0.104, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, h, 0, 0.115, -0.006);
      cap.scale.set(0.95, 1.12, 1.06);
      const spike = new THREE.ConeGeometry(0.032, 0.13, 6);
      const rnd = [0.2, -0.3, 0.5, -0.1, 0.35, -0.45, 0.05, 0.25, -0.2];
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI - Math.PI / 2;
        const s = this.mesh(spike, M.hair, h, Math.sin(a) * 0.07, 0.19 + Math.cos(a) * 0.01, -0.03 - Math.cos(a) * 0.03);
        s.rotation.x = -1.1 + rnd[i] * 0.2; s.rotation.z = -Math.sin(a) * 0.9;
      }
      for (let i = 0; i < 3; i++) {
        const f = this.mesh(spike, M.hair, h, -0.03 + i * 0.03, 0.17, 0.07);
        f.rotation.x = 0.9; f.scale.set(0.7, 0.6, 0.7);
      }
      // headband
      const band = this.mesh(new THREE.TorusGeometry(0.098, 0.011, 6, 28), M.accent, h, 0, 0.145, 0);
      band.rotation.x = Math.PI / 2 - 0.12; band.scale.set(0.92, 1.04, 1);
      const tailG = new THREE.BoxGeometry(0.02, 0.16, 0.006);
      for (const s of [-1, 1]) { const t = this.mesh(tailG, M.accent, h, 0.02 * s, 0.08, -0.1); t.rotation.x = 0.5; t.rotation.z = 0.2 * s; this.bandTails = (this.bandTails || []).concat(t); }
    } else {
      const cap = this.mesh(new THREE.SphereGeometry(0.103, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), M.hair, h, 0, 0.112, -0.004);
      cap.scale.set(0.93, 1.1, 1.04);
      const beard = this.mesh(new THREE.SphereGeometry(0.078, 20, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M.hair, h, 0, 0.05, 0.03);
      beard.scale.set(1.13, 1.05, 1.05);
      const mous = this.mesh(new THREE.CapsuleGeometry(0.009, 0.04, 3, 8), M.hair, h, 0, 0.068, 0.092);
      mous.rotation.z = Math.PI / 2;
      // scar
      this.mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), M.lip, h, -0.038, 0.11, 0.094).rotation.z = 0.3;
    }
  }

  // ------------------------------------------------------------------ pose application
  applyPose(p) {
    const b = this.b, t = this.tmp;
    // Root rotation pivots around the pelvis so falls / spins look natural.
    const px = -p[L.pelvis], py = p[L.pelvis + 1], pz = p[L.pelvis + 2];
    this.pivot.position.set(px - p[L.rootOff], py + p[L.rootOff + 1], pz + p[L.rootOff + 2]);
    this.pivot.rotation.set(p[L.root] * DEG, p[L.root + 1] * DEG, p[L.root + 2] * DEG, 'YXZ');
    this.inner.position.set(-px, -py, -pz);

    this.pelvisG.position.set(px, py, pz);
    this.pelvisG.rotation.set(p[L.hipRot] * DEG, p[L.hipRot + 1] * DEG, p[L.hipRot + 2] * DEG, 'YXZ');
    this.chestG.rotation.set(p[L.chest] * DEG, p[L.chest + 1] * DEG, p[L.chest + 2] * DEG, 'YXZ');
    const hp = p[L.head] * DEG, hy = p[L.head + 1] * DEG, hr = p[L.head + 2] * DEG;
    this.neckG.rotation.set(hp * 0.35, hy * 0.4, hr * 0.4, 'YXZ');
    this.headG.rotation.set(hp * 0.65, hy * 0.6, hr * 0.6, 'YXZ');
    this.pelvisG.updateMatrix(); this.chestG.updateMatrix();

    const chestM = t.m.multiplyMatrices(this.pelvisG.matrix, this.chestG.matrix);
    // Arms
    for (const side of [1, -1]) {
      const arm = side > 0 ? this.lArm : this.rArm;
      const hk = side > 0 ? L.lHand : L.rHand, ek = side > 0 ? L.lElbow : L.rElbow;
      const shoulder = t.a.set(b.shoulderW * side, 0.255, 0).applyMatrix4(chestM);
      const target = t.b.set(-p[hk], p[hk + 1], p[hk + 2]);
      const pole = t.c.set(-p[ek], p[ek + 1], p[ek + 2]);
      const elbow = this.solveIK(shoulder, target, b.upperArm, b.foreArm, pole, t.d);
      this.bone(arm.upper, shoulder, elbow);
      this.bone(arm.fore, elbow, target);
      arm.elbow.position.copy(elbow);
      const open = p[L.open + (side > 0 ? 0 : 1)] > 0.5;
      arm.fist.visible = !open; arm.open.visible = open;
    }
    // Legs
    const pelvisM = this.pelvisG.matrix;
    for (const side of [1, -1]) {
      const leg = side > 0 ? this.lLeg : this.rLeg;
      const fk = side > 0 ? L.lFoot : L.rFoot, kk = side > 0 ? L.lKnee : L.rKnee;
      const hip = t.a.set(b.hipW * side, -0.06, 0).applyMatrix4(pelvisM);
      const ankle = t.b.set(-p[fk], p[fk + 1], p[fk + 2]);
      const pole = t.c.set(-p[kk], p[kk + 1], p[kk + 2]);
      const knee = this.solveIK(hip, ankle, b.thigh, b.shin, pole, t.d);
      this.bone(leg.thigh, hip, knee);
      this.bone(leg.shin, knee, ankle);
      leg.knee.position.copy(knee);
      leg.foot.position.copy(ankle);
      const yaw = (p[L.footYaw + (side > 0 ? 0 : 1)] + p[L.hipRot + 1] * 0.3) * DEG;
      const pitch = p[L.footPitch + (side > 0 ? 0 : 1)] * DEG;
      leg.foot.rotation.set(pitch, yaw, 0, 'YXZ');
    }
  }

  // Two-bone IK. Writes the clamped target back into `target` and returns the middle joint.
  solveIK(a, target, l1, l2, pole, out) {
    const t = this.tmp;
    const d = t.e.subVectors(target, a);
    let dist = d.length();
    const maxD = l1 + l2 - 0.002, minD = Math.abs(l1 - l2) + 0.01;
    if (dist < 1e-5) { d.set(0, -1, 0); dist = minD; }
    d.divideScalar(dist);
    dist = Math.min(maxD, Math.max(minD, dist));
    target.copy(a).addScaledVector(d, dist);
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // pole direction orthogonal to the limb axis
    const pn = pole.addScaledVector(d, -pole.dot(d));
    if (pn.lengthSq() < 1e-6) pn.set(0, 0, 1).addScaledVector(d, -d.z);
    pn.normalize();
    return out.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(pn, l1 * sinA);
  }

  bone(mesh, from, to) {
    mesh.position.copy(from);
    const dir = this.tmp.c.subVectors(to, from).normalize();
    mesh.quaternion.setFromUnitVectors(DOWN, dir);
  }

  // World position of a limb end (for hit sparks / trails).
  limbWorld(limb, out) {
    const map = { lHand: this.lArm.fist, rHand: this.rArm.fist, lFoot: this.lLeg.foot, rFoot: this.rLeg.foot, lKnee: this.lLeg.knee, rKnee: this.rLeg.knee, body: this.chestG };
    const o = map[limb] || this.chestG;
    return o.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(this.mat)) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); }
  }
}
