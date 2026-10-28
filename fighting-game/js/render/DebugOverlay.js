// Development overlay (F2 or ?debug=hitboxes): draws what the simulation collides with next to
// what the models show, so strikes can be calibrated by eye.
//   cyan     hurt volume (cylinder: HURT_RADIUS, posture height range)
//   red      attack volume while active: swept from the attacker's body to the hit point, with the
//            move's radius, between the attack level's height band (dim orange during startup)
//   yellow   the visible striking limb (fist / foot position from the model)
//   white    contact events (hit / block positions reported by the simulation), fading
// It only reads simulation state; nothing here feeds back into the game.
import * as THREE from 'three';
import { HURT_RADIUS } from '../sim/constants.js';

const SEG = 16;

export class DebugOverlay {
  constructor(scene) {
    this.enabled = false;
    this.max = 6000;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.lines.renderOrder = 999;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.contacts = [];   // { p: [x,y,z], t, block }
    this.limb = new THREE.Vector3();
  }

  toggle(on = !this.enabled) { this.enabled = on; this.lines.visible = on; }

  onEvent(e) {
    if (!this.enabled) return;
    if ((e.type === 'hit' || e.type === 'counter' || e.type === 'block') && e.pos) this.contacts.push({ p: e.pos.slice(), t: 0, block: e.type === 'block' });
  }

  update(world, models) {
    if (!this.enabled) return;
    this.n = 0;
    world.fighters.forEach((f, i) => {
      // hurt volume
      const [lo, hi] = world.hurtRange(f);
      const r = f.state === 'down' ? 0.45 : HURT_RADIUS;
      this.cylinder(f.pos.x, f.pos.z, lo, hi, r, [0.2, 0.9, 1]);
      // attack volume
      const m = f.state === 'attack' ? f.move : null;
      if (m && m.hitPointLocal && m.level !== 'throw' && m.level !== 'parry') {
        const active = f.mf >= m.startup && f.mf < m.startup + m.active;
        if (f.mf >= m.startup * 0.5 && f.mf < m.startup + m.active) {
          const [hr, , hf] = m.hitPointLocal;
          const rx = -f.face.z, rz = f.face.x;
          const sx = f.pos.x + f.face.x * 0.2, sz = f.pos.z + f.face.z * 0.2;
          const ex = f.pos.x + f.face.x * hf + rx * hr, ez = f.pos.z + f.face.z * hf + rz * hr;
          const [hl, hh] = world.hitboxRange(f);
          const c = active ? (f.moveHit ? [1, 0.5, 0.5] : [1, 0.1, 0.1]) : [0.8, 0.45, 0.1];
          this.capsuleBand(sx, sz, ex, ez, m.radius || 0.2, hl, hh, c);
        }
        // visible striking limb
        if (models[i] && ['lHand', 'rHand', 'lFoot', 'rFoot', 'lKnee', 'rKnee'].includes(m.limb)) {
          models[i].limbWorld(m.limb, this.limb);
          this.cross(this.limb.x, this.limb.y, this.limb.z, 0.07, [1, 0.95, 0.1]);
        }
      }
    });
    this.contacts = this.contacts.filter((c) => ++c.t < 40);
    for (const c of this.contacts) {
      const k = 1 - c.t / 40;
      this.cross(c.p[0], c.p[1], c.p[2], 0.12, c.block ? [0.5 * k, 0.7 * k, k] : [k, k, k]);
    }
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * 2);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  seg(a, b, c) {
    if (this.n >= this.max / 2 - 1) return;
    const i = this.n * 6;
    this.pos.set(a, i); this.pos.set(b, i + 3);
    this.col.set(c, i); this.col.set(c, i + 3);
    this.n++;
  }

  cylinder(x, z, lo, hi, r, c) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, 0, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, 0, z + Math.sin(a1) * r];
      this.seg([p0[0], lo, p0[2]], [p1[0], lo, p1[2]], c);
      this.seg([p0[0], hi, p0[2]], [p1[0], hi, p1[2]], c);
      if (k % 4 === 0) this.seg([p0[0], lo, p0[2]], [p0[0], hi, p0[2]], c);
    }
  }

  // Segment swept by a radius (stadium outline) at the bottom and top of the height band.
  capsuleBand(sx, sz, ex, ez, r, lo, hi, c) {
    const dx = ex - sx, dz = ez - sz, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * r, nz = dx / l * r;
    for (const y of [lo, hi]) {
      this.seg([sx + nx, y, sz + nz], [ex + nx, y, ez + nz], c);
      this.seg([sx - nx, y, sz - nz], [ex - nx, y, ez - nz], c);
      const ang = Math.atan2(dz, dx);
      for (let k = 0; k < 8; k++) {
        const a0 = ang - Math.PI / 2 + (k / 8) * Math.PI, a1 = ang - Math.PI / 2 + ((k + 1) / 8) * Math.PI;
        this.seg([ex + Math.cos(a0) * r, y, ez + Math.sin(a0) * r], [ex + Math.cos(a1) * r, y, ez + Math.sin(a1) * r], c);
      }
    }
    this.seg([ex, lo, ez], [ex, hi, ez], c);
    this.seg([sx, lo, sz], [sx, hi, sz], c);
  }

  cross(x, y, z, s, c) {
    this.seg([x - s, y, z], [x + s, y, z], c);
    this.seg([x, y - s, z], [x, y + s, z], c);
    this.seg([x, y, z - s], [x, y, z + s], c);
  }
}
