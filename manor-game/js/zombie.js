// Procedural low-poly zombies with a shambling walk, lunging runners and heavy brutes.
import * as THREE from 'three';

const SKINS = [0x6c725e, 0x626854, 0x77725f, 0x585e4e, 0x6e675a, 0x7b7564];
const SHIRTS = [0x3d3a33, 0x4a3b2b, 0x2f3238, 0x51463a, 0x3a2e2a, 0x6a6458];
const PANTS = [0x23211f, 0x2c2a24, 0x1d2228, 0x3a3127];

export const TYPES = {
  walker: { hp: 100, speed: 1.15, scale: 1.0, dmg: 14, score: 100 },
  runner: { hp: 65, speed: 3.1, scale: 0.95, dmg: 10, score: 150 },
  brute: { hp: 300, speed: 0.95, scale: 1.3, dmg: 30, score: 300 },
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
    this.flinch = 0;
    this.stun = 0;
    this.deadT = 0;
    this.fall = 0;
    this.groanT = 1 + Math.random() * 5;
    this.speedMul = 0.85 + Math.random() * 0.3;
    this.headTilt = (Math.random() - 0.5) * 0.6;
    this.limp = Math.random() < 0.4 ? 0.3 + Math.random() * 0.4 : 0;
    this.parts = [];
    this.build();
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

  get radius() { return 0.32 * this.def.scale; }

  animate(dt, moving, speed) {
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
