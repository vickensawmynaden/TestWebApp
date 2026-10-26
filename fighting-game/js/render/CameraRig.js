// Fighting-game camera: frames both fighters from the side, zooms with distance, adds
// cinematic orbits for intros / KOs / victories and short shakes on heavy impacts.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 1.6, 6);
    this.look = new THREE.Vector3(0, 1, 0);
    this.desired = new THREE.Vector3();
    this.desiredLook = new THREE.Vector3();
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.time = 0;
    this.snap = true;
  }

  shake(amount) { this.shakeAmt = Math.min(1.5, Math.max(this.shakeAmt, amount)); }

  // ctx: { a, b: THREE.Vector3 fighter positions; faceA, faceB: {x,z}; camDir: {x,z}; mode; t; focus }
  update(dt, ctx) {
    this.time += dt;
    const { a, b, camDir } = ctx;
    const mid = this.desiredLook.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    const sep = Math.hypot(a.x - b.x, a.z - b.z);
    const aspect = this.camera.aspect;
    let follow = 5.5;
    if (ctx.mode === 'intro' || ctx.mode === 'win' || ctx.mode === 'ko') {
      const f = ctx.mode === 'ko' ? (ctx.focus === 0 ? a : b) : (ctx.focus === 0 ? a : b);
      const face = ctx.focus === 0 ? ctx.faceA : ctx.faceB;
      const t = ctx.t;
      const base = Math.atan2(face.x, face.z);
      let ang, dist, h, lookY;
      if (ctx.mode === 'intro') { ang = base + 0.9 - t * 0.006; dist = 2.4; h = 1.35 + t * 0.002; lookY = 1.25; }
      else if (ctx.mode === 'win') { ang = base + 0.45 - t * 0.003; dist = 2.9; h = 1.45; lookY = 1.2; }
      else { ang = base + 1.4 + t * 0.006; dist = 3.6; h = 1.2; lookY = 0.6; }
      this.desired.set(f.x + Math.sin(ang) * dist, h, f.z + Math.cos(ang) * dist);
      mid.set(f.x, lookY, f.z);
      follow = ctx.mode === 'ko' ? 3 : 4;
      if (ctx.cut) this.snap = true;
    } else {
      // Gameplay framing
      let dist = 2.2 + sep * 0.95;
      if (aspect < 1.5) dist *= 1.5 / Math.max(0.6, aspect);
      dist = Math.min(11, Math.max(3.2, dist));
      const air = Math.max(a.y, b.y);
      const h = 1.25 + dist * 0.08 + air * 0.25;
      mid.y = 0.95 + air * 0.35;
      this.desired.set(mid.x + camDir.x * dist, h, mid.z + camDir.z * dist);
    }
    const k = this.snap ? 1 : 1 - Math.exp(-dt * follow);
    this.pos.lerp(this.desired, k);
    this.look.lerp(mid, this.snap ? 1 : 1 - Math.exp(-dt * follow * 1.6));
    this.snap = false;
    this.camera.position.copy(this.pos);
    if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
    // Shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 60;
      const s = this.shakeAmt * 0.06;
      this.camera.position.x += Math.sin(this.shakeT * 1.7) * s;
      this.camera.position.y += Math.cos(this.shakeT * 2.3) * s;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(this.look);
  }
}
