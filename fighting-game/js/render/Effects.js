// Pooled particle effects: hit sparks, block sparks, dust, shockwave rings and limb trails.
import * as THREE from 'three';
import { radialSprite } from './textures.js';

const MAX = 900;

const VERT = `
attribute float size; attribute float alpha; attribute vec3 color;
varying float vAlpha; varying vec3 vColor;
void main() {
  vAlpha = alpha; vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D tex; varying float vAlpha; varying vec3 vColor;
void main() {
  vec4 t = texture2D(tex, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
}`;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.n = 0;
    this.p = new Float32Array(MAX * 3); this.v = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX); this.drag = new Float32Array(MAX); this.grav = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('size', this.sizeAttr); g.setAttribute('alpha', this.alphaAttr); g.setAttribute('color', this.colAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    const mat = new THREE.ShaderMaterial({ uniforms: { tex: { value: radialSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)') } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // flashes and rings (small pools of meshes)
    this.flashTex = radialSprite('rgba(255,255,255,1)', 'rgba(255,200,120,0)', 128);
    this.flashes = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s); this.flashes.push({ s, t: 0, life: 0, size: 1 });
    }
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.rings.push({ m, t: 0, life: 0, size: 1 });
    }
    this.trails = [this.makeTrail(), this.makeTrail()];
    this.tmpV = new THREE.Vector3();
    this.tmpW = new THREE.Vector3();
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, drag = 0.9, grav = 0) {
    let i = this.n < MAX ? this.n++ : Math.floor(Math.random() * MAX);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size0[i] = size; this.drag[i] = drag; this.grav[i] = grav;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
  }

  burst(pos, count, speed, life, size, color, opts = {}) {
    const [r, g, b] = color;
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn(pos[0], pos[1], pos[2], s * Math.cos(th) * sp, u * sp * (opts.up || 1) + (opts.lift || 0), s * Math.sin(th) * sp,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), r, g, b, opts.drag ?? 0.88, opts.grav ?? 0);
    }
  }

  flash(pos, size, life, color = 0xffffff) {
    const f = this.flashes.find((x) => x.t >= x.life) || this.flashes[0];
    f.s.position.set(pos[0], pos[1], pos[2]); f.s.material.color.set(color);
    f.t = 0; f.life = life; f.size = size; f.s.visible = true;
  }

  ring(pos, size, life, color = 0xffffff, ground = true) {
    const r = this.rings.find((x) => x.t >= x.life) || this.rings[0];
    r.m.position.set(pos[0], ground ? 0.02 : pos[1], pos[2]);
    r.m.rotation.set(ground ? -Math.PI / 2 : 0, 0, 0);
    r.m.material.color.set(color);
    r.t = 0; r.life = life; r.size = size; r.m.visible = true; r.ground = ground;
  }

  // High level effects ---------------------------------------------------------------
  hit(pos, heavy, counter) {
    const c = counter ? [1.0, 0.35, 0.15] : [1.0, 0.75, 0.35];
    this.burst(pos, heavy ? 46 : 22, heavy ? 6 : 4, 0.32, heavy ? 0.16 : 0.11, c, { drag: 0.86 });
    this.burst(pos, 10, 1.5, 0.25, 0.3, [1, 0.95, 0.8], { drag: 0.8 });
    this.flash(pos, heavy ? 1.4 : 0.8, heavy ? 0.16 : 0.1, counter ? 0xff5a2a : 0xffd090);
    if (heavy) this.ring([pos[0], pos[1], pos[2]], 1.0, 0.25, counter ? 0xff6a3a : 0xffc070, false);
  }

  block(pos, heavy) {
    this.burst(pos, heavy ? 22 : 12, 3, 0.22, 0.09, [0.45, 0.7, 1.0], { drag: 0.84 });
    this.flash(pos, heavy ? 0.8 : 0.5, 0.09, 0x80b0ff);
  }

  parry(pos) {
    this.burst(pos, 40, 5, 0.4, 0.12, [0.4, 1.0, 1.0]);
    this.ring(pos, 1.2, 0.35, 0x66ffff, false);
    this.flash(pos, 1.5, 0.2, 0x66ffff);
  }

  dust(pos, amount = 1) {
    const n = Math.round(14 * amount);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random()) * amount;
      this.spawn(pos[0] + Math.cos(a) * 0.2, 0.05 + Math.random() * 0.1, pos[2] + Math.sin(a) * 0.2, Math.cos(a) * sp, 0.3 + Math.random() * 0.6, Math.sin(a) * sp,
        0.6 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, 0.18, 0.15, 0.14, 0.92, -0.6);
    }
  }

  shockwave(pos, color = 0xffa060) {
    this.ring(pos, 3.2, 0.45, color, true);
    this.dust(pos, 2);
  }

  rage(pos, color) {
    this.burst(pos, 60, 4, 0.6, 0.18, color, { lift: 1.5, drag: 0.93 });
    this.flash(pos, 3, 0.4, 0xffffff);
  }

  aura(pos, color) {
    if (Math.random() < 0.5) this.spawn(pos[0] + (Math.random() - 0.5) * 0.5, pos[1] + Math.random() * 1.6, pos[2] + (Math.random() - 0.5) * 0.5, 0, 0.6, 0, 0.6, 0.12, color[0], color[1], color[2], 0.97, 0);
  }

  // Ribbon trail following a striking limb.
  makeTrail() {
    const N = 10;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), alpha = new Float32Array(N * 2);
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xffffff) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA * 0.55); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.visible = false;
    this.scene.add(mesh);
    const free = Array.from({ length: N }, () => new THREE.Vector3());
    return { mesh, hist: [], free, N, active: false };
  }

  updateTrail(i, active, worldPos, camera, color) {
    const tr = this.trails[i];
    if (active) {
      // recycle vectors: take the oldest (or a free pool vector) and move it to the front
      const v = tr.hist.length >= tr.N ? tr.hist.pop() : tr.free.pop();
      tr.hist.unshift(v.copy(worldPos));
      tr.mesh.material.uniforms.color.value.set(color);
    } else if (tr.hist.length) tr.free.push(tr.hist.pop());
    tr.mesh.visible = tr.hist.length > 2;
    if (!tr.mesh.visible) return;
    const pos = tr.mesh.geometry.attributes.position.array, al = tr.mesh.geometry.attributes.alpha.array;
    const camPos = camera.position;
    const tmp = this.tmpV;
    for (let k = 0; k < tr.N; k++) {
      const p = tr.hist[Math.min(k, tr.hist.length - 1)];
      const q = tr.hist[Math.min(k + 1, tr.hist.length - 1)];
      tmp.subVectors(p, q);
      const view = this.tmpW.subVectors(camPos, p);
      tmp.cross(view).normalize().multiplyScalar(0.07 * (1 - k / tr.N));
      if (!Number.isFinite(tmp.x)) tmp.set(0, 0.05, 0);
      pos[k * 6] = p.x + tmp.x; pos[k * 6 + 1] = p.y + tmp.y; pos[k * 6 + 2] = p.z + tmp.z;
      pos[k * 6 + 3] = p.x - tmp.x; pos[k * 6 + 4] = p.y - tmp.y; pos[k * 6 + 5] = p.z - tmp.z;
      const a = k < tr.hist.length ? (1 - k / tr.N) : 0;
      al[k * 2] = al[k * 2 + 1] = a;
    }
    tr.mesh.geometry.attributes.position.needsUpdate = true;
    tr.mesh.geometry.attributes.alpha.needsUpdate = true;
  }

  update(dt) {
    let w = 0;
    const P = this.posAttr.array, S = this.sizeAttr.array, A = this.alphaAttr.array, C = this.colAttr.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const d = Math.pow(this.drag[i], dt * 60);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.p[i * 3 + 1] < 0.01) { this.p[i * 3 + 1] = 0.01; this.v[i * 3 + 1] *= -0.3; }
      // compact live particles to the front
      if (w !== i) {
        for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; this.col[w * 3 + k] = this.col[i * 3 + k]; }
        this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i]; this.size0[w] = this.size0[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i];
      }
      const k = this.life[w] / this.maxLife[w];
      P[w * 3] = this.p[w * 3]; P[w * 3 + 1] = this.p[w * 3 + 1]; P[w * 3 + 2] = this.p[w * 3 + 2];
      S[w] = this.size0[w] * (0.5 + k * 0.5); A[w] = k;
      C[w * 3] = this.col[w * 3]; C[w * 3 + 1] = this.col[w * 3 + 1]; C[w * 3 + 2] = this.col[w * 3 + 2];
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.posAttr.needsUpdate = this.sizeAttr.needsUpdate = this.alphaAttr.needsUpdate = this.colAttr.needsUpdate = true;
    for (const f of this.flashes) {
      if (f.t >= f.life) { f.s.visible = false; continue; }
      f.t += dt; const k = Math.min(1, f.t / f.life);
      f.s.scale.setScalar(f.size * (0.6 + k * 0.8)); f.s.material.opacity = 1 - k;
    }
    for (const r of this.rings) {
      if (r.t >= r.life) { r.m.visible = false; continue; }
      r.t += dt; const k = Math.min(1, r.t / r.life);
      r.m.scale.setScalar(0.1 + r.size * k); r.m.material.opacity = (1 - k) * 0.8;
    }
  }

  clear() {
    this.n = 0;
    for (const t of this.trails) while (t.hist.length) t.free.push(t.hist.pop());
  }
}
