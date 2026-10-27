// Procedural PROTOTYPE fighter: sculpted lathe/sphere meshes on a shared two-bone IK rig.
// The look comes entirely from appearance data (appearance.js); arms and legs are placed every
// frame from the animator's IK targets, so feet stay planted and fists reach the hitboxes.
// A detailed rigged glTF can replace this class later as long as it follows the same pose data.
import * as THREE from 'three';
import { POSE_LAYOUT as L } from './poses.js';
import { APPEARANCES } from './appearance.js';
import { clothTexture, noiseTexture } from './textures.js';

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);

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

// Open-ended tube (sleeves, cuffs, wraps, boot shafts) along -Y.
function tubeGeometry(len, r0, r1, seg = 16) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1, true);
  g.translate(0, -len / 2, 0);
  return g;
}

// Lathe torso section from a radius profile [[y, r], ...]; phi range allows open-front jackets.
function torsoGeometry(profile, seg = 24, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(Math.max(0.001, r), y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  g.computeVertexNormals();
  return g;
}

export class FighterModel {
  constructor(charId, def) {
    this.charId = charId;
    this.ap = APPEARANCES[charId] || APPEARANCES.ren;
    this.b = this.ap.build;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.pivot); this.pivot.add(this.inner);
    this.root.scale.setScalar(def.scale || 1);
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), eu: new THREE.Euler() };
    this.mats = [];
    this.clothTex = clothTexture(3 + charId.length);
    this.skinBump = noiseTexture(128, 9, 30); this.skinBump.repeat.set(4, 4);
    this.build();
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // ------------------------------------------------------------------ materials
  track(m) { this.mats.push(m); return m; }
  skinMat() {
    return this._skin || (this._skin = this.track(new THREE.MeshPhysicalMaterial({ color: this.ap.skin, roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color(0xff7755), sheenRoughness: 0.55, clearcoat: 0.08, clearcoatRoughness: 0.6, bumpMap: this.skinBump, bumpScale: 0.25 })));
  }
  cloth(color, rough = 0.85) {
    return this.track(new THREE.MeshPhysicalMaterial({ color, roughness: rough, sheen: 0.55, sheenColor: new THREE.Color(color).multiplyScalar(1.5), sheenRoughness: 0.8, bumpMap: this.clothTex, bumpScale: 0.6 }));
  }
  plain(color, rough = 0.6, metal = 0) { return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })); }
  metalMat(color) { return this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.9 })); }
  hairMat(color) { return this.track(new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4), sheenRoughness: 0.4 })); }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------------ build
  build() {
    const b = this.b, ap = this.ap;
    this.pelvisG = new THREE.Group(); this.inner.add(this.pelvisG);
    this.chestG = new THREE.Group(); this.chestG.position.set(0, 0.2, 0); this.pelvisG.add(this.chestG);
    this.neckG = new THREE.Group(); this.neckG.position.set(0, 0.31, 0); this.chestG.add(this.neckG);
    this.headG = new THREE.Group(); this.headG.position.set(0, 0.07, 0); this.neckG.add(this.headG);
    const skin = this.skinMat();
    const topMat = ap.top.base === 'bare' ? skin : this.cloth(ap.top.color, ap.top.base === 'bodysuit' ? 0.55 : 0.85);
    const bottomMat = this.cloth(ap.bottom.color, ap.bottom.style === 'suit' || ap.bottom.style === 'singlet' ? 0.55 : 0.9);
    this.topMat = topMat; this.bottomMat = bottomMat;
    this.buildTorso(topMat, bottomMat);
    this.buildHead();
    this.lArm = this.buildArm(1); this.rArm = this.buildArm(-1);
    this.lLeg = this.buildLeg(1); this.rLeg = this.buildLeg(-1);
  }

  buildTorso(topMat, bottomMat) {
    const b = this.b, ap = this.ap, skin = this.skinMat();
    const W = b.torsoW, D = b.torsoD, waist = b.waist || 1, belly = b.belly || 1, bust = b.bust || 0;
    const absMat = ap.top.midriff ? skin : topMat;
    // Abdomen (pelvis space)
    const abd = this.mesh(torsoGeometry([[-0.13, 0.001], [-0.12, 0.12], [-0.08, 0.165], [0.0, 0.158 * belly], [0.1, 0.14 * waist * belly], [0.2, 0.15 * (bust ? 0.95 : 1)], [0.26, 0.16]]), absMat, this.pelvisG);
    abd.scale.set(W, 1, D);
    if (ap.top.midriff) {
      // six-pack definition on bare midriffs
      const ab = new THREE.SphereGeometry(0.03, 10, 8);
      for (let r = 0; r < 3; r++) for (const s of [-1, 1]) this.mesh(ab, skin, this.pelvisG, 0.028 * s, 0.03 + r * 0.055, 0.14 * D / 0.62).scale.set(1.0, 0.75, 0.22);
    }
    // Hips / shorts / trousers top
    const hips = this.mesh(torsoGeometry([[-0.16, 0.001], [-0.15, 0.1], [-0.1, 0.165], [-0.02, 0.17], [0.04, 0.16], [0.06, 0.001]]), bottomMat, this.pelvisG);
    hips.scale.set(W * (b.bust ? 1.06 : 1.02), 1, D * 1.15);
    // Chest (chest space)
    const chestProfile = [[-0.06, 0.15], [0.04, 0.165], [0.13, 0.19], [0.2, 0.2], [0.26, 0.185], [0.3, 0.14], [0.33, 0.08], [0.345, 0.001]];
    const chest = this.mesh(torsoGeometry(chestProfile), topMat, this.chestG);
    chest.scale.set(W * 1.12, 1, D * 1.05);
    const front = 0.125 * D / 0.62;
    if (bust) {
      const g = new THREE.SphereGeometry(0.075, 16, 12);
      for (const s of [-1, 1]) this.mesh(g, topMat, this.chestG, 0.07 * s * W, 0.17, front * 0.72).scale.set(1, 0.9, 0.55 + bust * 0.5);
    } else {
      const pec = new THREE.SphereGeometry(0.085, 16, 12);
      for (const s of [-1, 1]) {
        this.mesh(pec, topMat, this.chestG, 0.075 * s * W, 0.2, 0.06 * D / 0.62).scale.set(1.15, 0.8, 0.55);
        this.mesh(pec, topMat, this.chestG, 0.13 * s * W, 0.12, -0.01).scale.set(0.7, 1.2, 0.8);
      }
    }
    // Neckline: skin showing above tanks / crops / singlets
    if (!ap.top.highNeck) {
      const v = this.mesh(new THREE.SphereGeometry(ap.top.base === 'singlet' ? 0.11 : 0.065, 14, 10), skin, this.chestG, 0, 0.27, front * 0.45);
      v.scale.set(ap.top.base === 'singlet' ? 1.25 : 1, 0.75, 0.42);
    } else {
      this.mesh(tubeGeometry(0.07, b.neckR * 1.25, b.neckR * 1.35), topMat, this.chestG, 0, 0.39, 0);
    }
    // Shoulder caps: skin (sleeveless) or garment
    const sleeved = ap.top.base === 'bodysuit' || ap.jacket?.sleeves === 'long';
    const capMat = ap.jacket?.sleeves === 'long' ? this.cloth(ap.jacket.color) : sleeved ? topMat : skin;
    for (const s of [-1, 1]) {
      const d = this.mesh(new THREE.SphereGeometry(b.armR * 1.4, 16, 12), capMat, this.chestG, b.shoulderW * s * 0.95, 0.262, 0);
      d.scale.set(0.95, 1.0, 1.08);
      if (ap.top.base === 'singlet') {
        // singlet straps over the traps
        const strap = this.mesh(new THREE.BoxGeometry(0.045, 0.012, 0.2), topMat, this.chestG, 0.1 * s * W, 0.325, 0);
        strap.rotation.z = -0.25 * s;
      }
    }
    if (ap.top.base === 'gi') {
      const collar = this.mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 20, Math.PI * 1.2), this.plain(ap.top.trim, 0.7), this.chestG, 0, 0.3, 0.0);
      collar.rotation.x = Math.PI / 2 + 0.25; collar.rotation.z = -Math.PI * 1.1;
      this.mesh(new THREE.CircleGeometry(0.03, 16), this.track(new THREE.MeshStandardMaterial({ color: ap.waist.color, emissive: ap.waist.color, emissiveIntensity: 0.8 })), this.chestG, -0.09, 0.2, front + 0.012).rotation.y = -0.25;
    }
    if (ap.top.base === 'crop' && ap.top.trim) {
      const hem = this.mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 28), this.metalMat(ap.top.trim), this.chestG, 0, 0.0, 0);
      hem.rotation.x = Math.PI / 2; hem.scale.set(W * 1.1, D * 1.05, 1);
    }
    if (ap.top.base === 'bodysuit' && ap.top.trim) {
      // silver piping lines on the suit
      const line = this.metalMat(ap.top.trim);
      for (const s of [-1, 1]) {
        const l = this.mesh(new THREE.BoxGeometry(0.008, 0.3, 0.008), line, this.chestG, 0.1 * s * W, 0.14, front * 0.9);
        l.rotation.z = 0.25 * s;
      }
    }
    // Open jacket / vest over the top (gap at the front, phi = 0 is +z)
    if (ap.jacket) {
      const jm = this.cloth(ap.jacket.color, 0.75);
      const gap = ap.jacket.vest ? 0.75 : 0.55;
      const shell = this.mesh(torsoGeometry(chestProfile.slice(0, 6), 24, gap, Math.PI * 2 - gap * 2), jm, this.chestG);
      shell.scale.set(W * 1.2, 1.0, D * 1.16);
      const lower = this.mesh(torsoGeometry([[-0.03, 0.15], [0.05, 0.155], [0.12, 0.165], [0.2, 0.17], [0.26, 0.17]], 24, gap, Math.PI * 2 - gap * 2), jm, this.pelvisG);
      lower.scale.set(W * 1.12, 1, D * 1.14);
      if (ap.jacket.collar) {
        const c = this.mesh(torsoGeometry([[0.28, 0.15], [0.33, 0.13], [0.37, 0.12]], 18, gap, Math.PI * 2 - gap * 2), this.plain(ap.jacket.trim, 0.8), this.chestG);
        c.scale.set(W * 1.18, 1, D * 1.2);
      }
      if (ap.jacket.trim && ap.jacket.vest) {
        const t = this.metalMat(ap.jacket.trim);
        for (const s of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.008, 0.42, 0.008), t, this.chestG, Math.sin(gap) * 0.17 * W * s, 0.05, Math.cos(gap) * 0.17 * D * 1.1);
      }
    }
    // Waist: belts, waistbands, ropes
    const wt = ap.waist;
    if (wt) {
      const wm = wt.type === 'waistband' ? this.cloth(wt.color, 0.6) : this.plain(wt.color, 0.6);
      const tor = this.mesh(new THREE.TorusGeometry(0.16, wt.wide ? 0.026 : wt.type === 'rope' ? 0.012 : 0.022, 8, 28), wm, this.pelvisG, 0, 0.02, 0);
      tor.rotation.x = Math.PI / 2; tor.scale.set(W * (b.bust ? 1.04 : 1.0), D * 1.12, wt.wide ? 1.5 : 1);
      if (wt.trim) { const r = this.mesh(new THREE.TorusGeometry(0.165, 0.005, 6, 28), this.metalMat(wt.trim), this.pelvisG, 0, 0.045, 0); r.rotation.x = Math.PI / 2; r.scale.set(W, D * 1.12, 1); }
      if (wt.tails) {
        const tail = new THREE.BoxGeometry(0.05, 0.22, 0.012);
        for (const s of [-1, 1]) { const t = this.mesh(tail, wm, this.pelvisG, 0.05 * s, -0.08, front * 0.95); t.rotation.z = 0.12 * s; t.rotation.x = 0.15; }
        this.mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), wm, this.pelvisG, 0, 0.02, front * 0.95);
      }
      if (wt.type === 'rope') {
        const knot = this.mesh(new THREE.CapsuleGeometry(0.012, 0.18, 3, 6), wm, this.pelvisG, 0.06, -0.08, front * 0.95);
        knot.rotation.z = 0.2;
      }
      if (wt.type === 'drawstring') {
        for (const s of [-1, 1]) this.mesh(new THREE.CapsuleGeometry(0.004, 0.09, 3, 6), wm, this.pelvisG, 0.015 * s, -0.04, front * 0.97);
      }
      if (wt.buckle) this.mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), this.metalMat(wt.buckle), this.pelvisG, 0, 0.02, front * 0.98);
    }
    if (ap.necklace) {
      const n = this.mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 24), this.plain(ap.necklace, 0.5), this.chestG, 0, 0.29, 0.02);
      n.rotation.x = Math.PI / 2 - 0.5;
      this.mesh(new THREE.SphereGeometry(0.012, 8, 6), this.plain(0xd8c08a, 0.4, 0.5), this.chestG, 0, 0.23, front * 0.75);
    }
    // Neck
    this.mesh(limbGeometry(0.1, b.neckR, b.neckR * 1.15, 0.5, 0), skin, this.neckG, 0, 0.08, 0);
  }

  buildHead() {
    const ap = this.ap, b = this.b, h = this.headG, skin = this.skinMat();
    const fem = !!b.bust;
    const heavy = (b.torsoW || 1) > 1.2;
    const eyeWhite = this.plain(0xe8e4dc, 0.3), iris = this.plain(ap.eyes || 0x2a1e18, 0.2);
    const hairM = this.hairMat(ap.hair.color);
    const lip = this.plain(new THREE.Color(ap.skin).multiplyScalar(fem ? 0.72 : 0.82).getHex(), 0.45);
    const skull = this.mesh(new THREE.SphereGeometry(0.1, 28, 20), skin, h, 0, 0.1, 0);
    skull.scale.set(fem ? 0.86 : 0.9, 1.1, 1.0);
    const jaw = this.mesh(new THREE.SphereGeometry(0.075, 20, 14), skin, h, 0, 0.04, 0.03);
    jaw.scale.set(heavy ? 1.15 : fem ? 0.88 : 1.0, fem ? 0.85 : 0.9, 1.0);
    const cheek = new THREE.SphereGeometry(0.03, 10, 8);
    for (const s of [-1, 1]) {
      this.mesh(cheek, skin, h, 0.045 * s, 0.085, 0.07).scale.set(1, 0.7, 0.8);
      this.mesh(new THREE.SphereGeometry(0.014, 12, 8), eyeWhite, h, 0.034 * s, 0.112, 0.083).scale.set(1.2, 0.7, 0.5);
      this.mesh(new THREE.SphereGeometry(0.0075, 10, 8), iris, h, 0.034 * s, 0.112, 0.09);
      const brow = this.mesh(new THREE.BoxGeometry(0.036, fem ? 0.006 : 0.008, 0.012), this.plain(ap.hair.style === 'bald' ? (ap.beard?.color || 0x3a2a20) : ap.hair.color, 0.7), h, 0.035 * s, 0.132, 0.088);
      brow.rotation.z = (heavy ? 0.2 : 0.12) * s;
      this.mesh(new THREE.SphereGeometry(0.022, 10, 8), skin, h, 0.088 * s, 0.1, 0.0).scale.set(0.4, 1.1, 0.8);
    }
    const nose = this.mesh(new THREE.ConeGeometry(heavy ? 0.017 : 0.013, 0.045, 8), skin, h, 0, 0.095, 0.1);
    nose.rotation.x = Math.PI / 2 + 0.35;
    const lips = this.mesh(new THREE.CapsuleGeometry(fem ? 0.009 : 0.008, 0.026, 3, 8), lip, h, 0, 0.055, 0.092);
    lips.rotation.z = Math.PI / 2;

    const cap = (cov, sx = 0.95, sy = 1.12, sz = 1.06, r = 0.104) => {
      const c = this.mesh(new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI * cov), hairM, h, 0, 0.112, -0.006);
      c.scale.set(sx, sy, sz);
      c.rotation.x = -0.42;   // tilt back: hairline high at the forehead, low at the nape
      return c;
    };
    switch (ap.hair.style) {
      case 'swept': { // Ren: dark hair swept back with a loose fringe
        cap(0.55);
        const lock = new THREE.ConeGeometry(0.03, 0.14, 6);
        for (let i = 0; i < 8; i++) {
          const a = (i / 7) * Math.PI - Math.PI / 2;
          const l = this.mesh(lock, hairM, h, Math.sin(a) * 0.075, 0.2, -0.02 - Math.cos(a) * 0.03);
          l.rotation.x = -1.25; l.rotation.z = -Math.sin(a) * 0.7;
        }
        for (let i = 0; i < 4; i++) { const f = this.mesh(lock, hairM, h, -0.045 + i * 0.03, 0.17, 0.075); f.rotation.x = 2.3; f.rotation.z = (i - 1.5) * 0.25; f.scale.set(0.7, 0.75, 0.7); }
        break;
      }
      case 'braids': { // Maya: close braided rows into a small bun
        cap(0.5, 0.93, 1.08, 1.04);
        const row = new THREE.CapsuleGeometry(0.009, 0.15, 3, 6);
        for (let i = 0; i < 7; i++) {
          const x = (i - 3) * 0.022;
          const br = this.mesh(row, hairM, h, x, 0.19 - Math.abs(i - 3) * 0.006, 0.0);
          br.rotation.x = Math.PI / 2 + 0.25;
        }
        this.mesh(new THREE.SphereGeometry(0.035, 12, 10), hairM, h, 0, 0.17, -0.1);
        break;
      }
      case 'bald': { // Viktor: shaved head (stubble shade only)
        const st = this.mesh(new THREE.SphereGeometry(0.1015, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), this.plain(new THREE.Color(ap.skin).multiplyScalar(0.9).getHex(), 0.6), h, 0, 0.112, -0.004);
        st.scale.set(0.91, 1.1, 1.01); st.rotation.x = -0.3;
        break;
      }
      case 'ponytail': { // Leila: pulled back with a long ponytail
        cap(0.55, 0.9, 1.1, 1.06);
        this.mesh(new THREE.TorusGeometry(0.018, 0.007, 6, 12), this.plain(ap.hair.tie || 0x2244aa, 0.5), h, 0, 0.19, -0.095).rotation.x = 0.6;
        let y = 0.18, z = -0.11;
        for (let i = 0; i < 5; i++) {
          const seg = this.mesh(new THREE.SphereGeometry(0.028 - i * 0.003, 10, 8), hairM, h, 0, y, z);
          seg.scale.set(1, 1.5, 1);
          y -= 0.045; z -= 0.012;
        }
        break;
      }
      case 'curlsTied': { // Caio: dark curls tied back
        cap(0.55, 0.96, 1.1, 1.06, 0.106);
        const curl = new THREE.SphereGeometry(0.022, 8, 6);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          this.mesh(curl, hairM, h, Math.cos(a) * 0.06, 0.2 + Math.sin(i * 1.7) * 0.01, Math.sin(a) * 0.06 - 0.01);
        }
        for (let i = 0; i < 6; i++) this.mesh(curl, hairM, h, (i % 3 - 1) * 0.025, 0.18 + Math.floor(i / 3) * 0.03, -0.12);
        break;
      }
      case 'bob': { // Sora: short silver bob with a side-swept fringe
        const c = cap(0.62, 1.0, 1.12, 1.08, 0.108);
        c.position.y = 0.105;
        const side = new THREE.SphereGeometry(0.06, 14, 10);
        for (const s of [-1, 1]) this.mesh(side, hairM, h, 0.07 * s, 0.08, -0.02).scale.set(0.55, 1.15, 1.1);
        this.mesh(new THREE.SphereGeometry(0.075, 14, 10), hairM, h, 0, 0.08, -0.05).scale.set(1.25, 1.1, 0.8);
        const fr = this.mesh(new THREE.BoxGeometry(0.11, 0.035, 0.03), hairM, h, -0.015, 0.165, 0.085);
        fr.rotation.z = 0.25; fr.rotation.x = 0.3;
        break;
      }
      case 'spiky': { // Kai (bonus)
        cap(0.55);
        const spike = new THREE.ConeGeometry(0.032, 0.13, 6);
        const rnd = [0.2, -0.3, 0.5, -0.1, 0.35, -0.45, 0.05, 0.25, -0.2];
        for (let i = 0; i < 9; i++) {
          const a = (i / 8) * Math.PI - Math.PI / 2;
          const sp = this.mesh(spike, hairM, h, Math.sin(a) * 0.07, 0.19 + Math.cos(a) * 0.01, -0.03 - Math.cos(a) * 0.03);
          sp.rotation.x = -1.1 + rnd[i] * 0.2; sp.rotation.z = -Math.sin(a) * 0.9;
        }
        if (ap.hair.band) {
          const band = this.mesh(new THREE.TorusGeometry(0.098, 0.011, 6, 28), this.track(new THREE.MeshStandardMaterial({ color: ap.hair.band, emissive: ap.hair.band, emissiveIntensity: 0.9 })), h, 0, 0.145, 0);
          band.rotation.x = Math.PI / 2 - 0.12; band.scale.set(0.92, 1.04, 1);
        }
        break;
      }
    }
    if (ap.beard) {
      const bm = this.hairMat(ap.beard.color);
      if (ap.beard.full) {
        const beard = this.mesh(new THREE.SphereGeometry(0.078, 20, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), bm, h, 0, 0.05, 0.03);
        beard.scale.set(1.15, 1.05, 1.06);
      } else {
        const g = this.mesh(new THREE.SphereGeometry(0.03, 10, 8), bm, h, 0, 0.025, 0.085); g.scale.set(1, 0.8, 0.5);
      }
      const mous = this.mesh(new THREE.CapsuleGeometry(0.008, 0.04, 3, 8), bm, h, 0, 0.068, 0.093);
      mous.rotation.z = Math.PI / 2;
    }
  }

  buildArm(side) {
    const b = this.b, ap = this.ap, skin = this.skinMat();
    const longJacket = ap.jacket?.sleeves === 'long';
    const suit = ap.top.base === 'bodysuit';
    const upperMat = longJacket ? this.cloth(ap.jacket.color) : suit ? this.topMat : skin;
    const foreMat = longJacket ? upperMat : suit ? this.topMat : skin;
    const sleeveScale = longJacket ? 1.35 : suit ? 1.06 : 1;
    const upper = this.mesh(limbGeometry(b.upperArm, b.armR * 1.1 * sleeveScale, b.armR * 0.85 * sleeveScale, 0.42, longJacket ? 0.05 : 0.22), upperMat, this.inner);
    const fore = this.mesh(limbGeometry(b.foreArm, b.foreR * 1.12 * sleeveScale, b.foreR * 0.78 * sleeveScale, 0.2, longJacket ? 0.02 : 0.14), foreMat, this.inner);
    const elbow = this.mesh(new THREE.SphereGeometry(b.foreR * 1.05 * sleeveScale, 12, 8), upperMat, this.inner);
    if (longJacket && ap.jacket.stripes) this.mesh(new THREE.BoxGeometry(0.008, b.upperArm * 0.9, 0.008), this.plain(ap.jacket.stripes, 0.6), upper, side * b.armR * 1.3, -b.upperArm / 2, 0);
    if (ap.forearm) this.mesh(tubeGeometry(b.foreArm * 0.62, b.foreR * 1.35, b.foreR * 1.12), this.metalMat(ap.forearm.color), fore, 0, -b.foreArm * 0.3, 0);
    if (ap.hands.bracelets) {
      for (let i = 0; i < 2; i++) this.mesh(new THREE.TorusGeometry(b.foreR * 0.85, 0.006, 6, 16), this.plain(ap.hands.bracelets, 0.5), fore, 0, -b.foreArm + 0.035 + i * 0.018, 0).rotation.x = Math.PI / 2;
    }
    // Hands: fist and open variants share the wrist joint at the forearm end.
    const fist = new THREE.Group(); fist.position.set(0, -b.foreArm - 0.035, 0); fore.add(fist);
    const open = new THREE.Group(); open.position.copy(fist.position); fore.add(open);
    const ht = ap.hands.type;
    if (ht === 'boxing') {
      const gm = this.plain(ap.hands.color, 0.35, 0.05);
      const glove = this.mesh(new THREE.SphereGeometry(0.068, 18, 14), gm, fist, 0, -0.035, 0.01);
      glove.scale.set(0.95, 1.1, 1.05);
      this.mesh(new THREE.SphereGeometry(0.03, 10, 8), gm, fist, 0.04 * -side, -0.02, 0.04);
      this.mesh(tubeGeometry(0.07, b.foreR * 1.25, 0.05), this.plain(0xf2f2f2, 0.5), fore, 0, -b.foreArm + 0.06, 0);
      open.add(glove.clone());
    } else {
      const handMat = ht === 'fingerless' ? this.plain(ap.hands.color, 0.5) : skin;
      const fm = this.mesh(new THREE.SphereGeometry(0.05, 14, 10), handMat, fist, 0, -0.02, 0.005);
      fm.scale.set(0.88 * (b.foreR / 0.043), 1.0, 1.05);
      const kn = this.mesh(new THREE.CapsuleGeometry(0.022, 0.05, 4, 8), ht === 'fingerless' ? skin : handMat, fist, 0, -0.06, 0.015);
      kn.rotation.z = Math.PI / 2;
      this.mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 6), skin, fist, 0.03 * -side, -0.04, 0.035).rotation.x = 0.6;
      this.mesh(new THREE.BoxGeometry(0.075 * (b.foreR / 0.043), 0.09, 0.03), handMat, open, 0, -0.04, 0);
      for (let i = 0; i < 4; i++) this.mesh(new THREE.CapsuleGeometry(0.009, 0.05, 3, 6), skin, open, -0.027 + i * 0.018, -0.115, 0);
      this.mesh(new THREE.CapsuleGeometry(0.011, 0.04, 3, 6), skin, open, 0.045 * -side, -0.05, 0.01).rotation.z = 0.7 * side;
      if (ht === 'wraps') {
        const wm = this.cloth(ap.hands.color, 0.9);
        this.mesh(tubeGeometry(0.09, b.foreR * 0.95, b.foreR * 1.05), wm, fore, 0, -b.foreArm + 0.07, 0);
        const wr = this.mesh(new THREE.SphereGeometry(0.052, 12, 8), wm, fist, 0, -0.025, 0.0);
        wr.scale.set(0.92 * (b.foreR / 0.043), 0.75, 1.0);
        this.mesh(new THREE.BoxGeometry(0.08, 0.05, 0.034), wm, open, 0, -0.03, 0);
      }
    }
    return { upper, fore, elbow, fist, open };
  }

  buildLeg(side) {
    const b = this.b, ap = this.ap, skin = this.skinMat(), bm = this.bottomMat;
    const st = ap.bottom.style;
    const loose = { trousers: 1.32, baggy: 1.42, trackpants: 1.22, suit: 1.04, shorts: 1.0, singlet: 1.0 }[st] || 1.1;
    const fullLeg = st === 'trousers' || st === 'baggy' || st === 'trackpants' || st === 'suit';
    const legMat = fullLeg ? bm : skin;
    const thigh = this.mesh(limbGeometry(b.thigh, b.thighR * loose, b.shinR * 1.25 * loose, 0.3, fullLeg ? 0.06 : 0.14), legMat, this.inner);
    const shinTop = b.shinR * 1.25 * loose, shinBot = st === 'baggy' ? b.shinR * 1.6 : st === 'trousers' ? b.shinR * 1.45 : b.shinR * (fullLeg ? loose * 0.95 : 0.85);
    const shin = this.mesh(limbGeometry(b.shin, shinTop, shinBot, 0.25, fullLeg ? 0.0 : 0.16), legMat, this.inner);
    const knee = this.mesh(new THREE.SphereGeometry(b.shinR * 1.2 * Math.min(loose, 1.15), 12, 8), legMat, this.inner);
    if (!fullLeg) {
      // shorts / singlet legs
      const len = st === 'shorts' ? b.thigh * 0.42 : b.thigh * 0.38;
      const shortsMat = st === 'singlet' ? this.topMat : bm;
      this.mesh(tubeGeometry(len, b.thighR * 1.18, b.thighR * (st === 'shorts' ? 1.15 : 1.02)), shortsMat, thigh, 0, 0.02, 0);
      if (ap.bottom.trim && st === 'shorts') {
        const r = this.mesh(new THREE.TorusGeometry(b.thighR * (st === 'shorts' ? 1.15 : 1.02), 0.005, 6, 18), this.metalMat(ap.bottom.trim), thigh, 0, 0.02 - len, 0);
        r.rotation.x = Math.PI / 2;
      }
    }
    if (ap.bottom.stripe) {
      const sm = st === 'suit' ? this.metalMat(ap.bottom.stripe) : this.plain(ap.bottom.stripe, 0.6);
      this.mesh(new THREE.BoxGeometry(0.012, b.thigh * 0.95, 0.02), sm, thigh, side * b.thighR * loose * 0.98, -b.thigh / 2, 0);
      if (st === 'trackpants' || st === 'suit') this.mesh(new THREE.BoxGeometry(0.012, b.shin * 0.9, 0.02), sm, shin, side * shinTop * 0.95, -b.shin / 2, 0);
    }
    if (st === 'trousers' || st === 'baggy') {
      // gathered cuff at the ankle
      this.mesh(tubeGeometry(0.05, shinBot * 0.85, b.shinR * 0.95), bm, shin, 0, -b.shin + 0.02, 0);
    }
    if (ap.shins) {
      const wm = this.cloth(ap.shins.color, 0.85);
      this.mesh(tubeGeometry(b.shin * 0.62, b.shinR * 1.12, b.shinR * 0.92), wm, shin, 0, -b.shin * 0.36, 0);
      if (ap.shins.trim) { const r = this.mesh(new THREE.TorusGeometry(b.shinR * 1.12, 0.005, 6, 16), this.metalMat(ap.shins.trim), shin, 0, -b.shin * 0.36, 0); r.rotation.x = Math.PI / 2; }
    }
    if (ap.knees) {
      const km = ap.knees.metal ? this.metalMat(0x5a4a58) : this.cloth(ap.knees.color, 0.7);
      const pad = this.mesh(new THREE.SphereGeometry(b.shinR * 1.45, 14, 10), km, shin, 0, -0.02, b.shinR * 0.35);
      pad.scale.set(1.0, 1.15, 0.8);
      if (ap.knees.trim) { const r = this.mesh(new THREE.TorusGeometry(b.shinR * 1.42, 0.007, 6, 18), this.plain(ap.knees.trim, 0.5), shin, 0, -0.02, 0); r.rotation.x = Math.PI / 2; }
    }
    // Feet / footwear (foot group is placed and oriented each frame)
    const foot = new THREE.Group(); this.inner.add(foot);
    const ft = ap.feet;
    if (ft.type === 'bare') {
      const sole = this.mesh(new THREE.SphereGeometry(0.055, 14, 10), skin, foot, 0, -0.035, 0.06);
      sole.scale.set(0.8, 0.5, 2.0);
      for (let i = 0; i < 4; i++) this.mesh(new THREE.SphereGeometry(0.012, 6, 5), skin, foot, -0.025 + i * 0.016, -0.05, 0.155 - Math.abs(i - 1.5) * 0.008);
      this.mesh(new THREE.SphereGeometry(0.045, 10, 8), skin, foot, 0, -0.035, -0.02);
    } else {
      const shoeMat = this.plain(ft.color, ft.type === 'wrestling' || ft.type === 'ankleBoot' ? 0.45 : 0.55);
      const fm = this.mesh(new THREE.SphereGeometry(0.06, 14, 10), shoeMat, foot, 0, -0.03, 0.06);
      fm.scale.set(0.9, 0.65, 2.0);
      this.mesh(new THREE.SphereGeometry(0.05, 10, 8), shoeMat, foot, 0, -0.035, -0.02).scale.set(0.95, 0.85, 1.0);
      this.mesh(new THREE.BoxGeometry(0.105, 0.022, 0.27), this.plain(ft.sole ?? 0x111111, 0.7), foot, 0, -0.066, 0.05);
      if (ft.laces) this.mesh(new THREE.BoxGeometry(0.03, 0.01, 0.1), this.plain(ft.laces, 0.6), foot, 0, 0.004, 0.06).rotation.x = -0.35;
      const shaftLen = ft.type === 'wrestling' ? 0.2 : ft.type === 'hightop' ? 0.09 : ft.type === 'ankleBoot' ? 0.12 : 0;
      if (shaftLen) {
        this.mesh(tubeGeometry(shaftLen, b.shinR * 1.18, b.shinR * 1.25), shoeMat, shin, 0, -b.shin + shaftLen - 0.02, 0);
        if (ft.type === 'wrestling' && ft.laces) this.mesh(new THREE.BoxGeometry(0.02, shaftLen * 0.9, 0.01), this.plain(ft.laces, 0.6), shin, 0, -b.shin + shaftLen / 2, b.shinR * 1.2);
        if (ft.strap) { const r = this.mesh(new THREE.TorusGeometry(b.shinR * 1.25, 0.008, 6, 16), this.metalMat(ft.strap), shin, 0, -b.shin + 0.06, 0); r.rotation.x = Math.PI / 2; }
      }
    }
    return { thigh, shin, knee, foot };
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
    for (const m of this.mats) m.dispose();
    this.clothTex.dispose(); this.skinBump.dispose();
  }
}
