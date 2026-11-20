// LAST MILE: a first-person endless zombie runner. You sprint forward non-stop through
// procedurally generated night fields, steer around obstacles and the dead, and pick up
// supply crates for limited ammo. Any zombie that reaches you ends the run.
import * as THREE from 'three';
import { rng, ground, bark, dirt, radial, make } from './textures.js';
import { loadModels } from './models.js';
import { loadHumans } from './humans.js';
import { Zombie } from './zombie.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const FOG = 0x1c2230;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.FogExp2(FOG, 0.046);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);
const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(50, 1, 0.01, 10);

scene.add(new THREE.HemisphereLight(0x7586a6, 0x1d1710, 0.75));
const moon = new THREE.DirectionalLight(0xb3c6ea, 1.1);
moon.castShadow = true;
moon.shadow.mapSize.setScalar(isTouch ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);
const lamp = new THREE.SpotLight(0xffe2b8, 35, 38, 0.65, 0.6, 1.5);
lamp.position.set(0, 0.1, 0); lamp.target.position.set(0, -0.25, -1);
camera.add(lamp, lamp.target);
const muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2);
scene.add(muzzleLight);

const sfx = new Sfx();

// ---------------------------------------------------------------- materials & shared geometry
const tex = { ground: ground(), bark: bark(), dirt: dirt() };
function grassTex() {
  const r = rng(31);
  return make(128, 128, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = 10 + r() * (w - 20), lean = (r() - .5) * 40, top = h * (0.05 + r() * 0.45);
      g.strokeStyle = `hsl(${55 + r() * 30}, ${25 + r() * 20}%, ${14 + r() * 16}%)`; g.lineWidth = 2 + r() * 3;
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, h * 0.6, x + lean, top); g.stroke();
    }
  });
}
function cornTex() {
  const r = rng(37);
  return make(64, 256, (g, w, h) => {
    g.strokeStyle = '#6b6236'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2 + 3, 6); g.stroke();
    for (let i = 0; i < 9; i++) {
      const y = h * (0.15 + i * 0.09), dir = i % 2 ? 1 : -1;
      g.strokeStyle = `hsl(${45 + r() * 15}, 30%, ${22 + r() * 14}%)`; g.lineWidth = 4;
      g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + dir * 22, y - 18, w / 2 + dir * 30, y + 26); g.stroke();
    }
  });
}
function crossGeo(w, h) {
  const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const out = new THREE.BufferGeometry(), n = a.attributes.position.count;
  for (const k of ['position', 'normal', 'uv']) out.setAttribute(k, new THREE.Float32BufferAttribute([...a.attributes[k].array, ...b.attributes[k].array], a.attributes[k].itemSize));
  const ia = [...a.index.array]; out.setIndex([...ia, ...ia.map(i => i + n)]);
  return out;
}
const M = {
  bark: new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }),
  oldWood: new THREE.MeshStandardMaterial({ color: 0x5b5144, roughness: 1 }),
  hay: new THREE.MeshStandardMaterial({ color: 0x8a7440, roughness: 1 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.8, metalness: 0.3 }),
  car: new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.55, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0b0f12, roughness: 0.1, metalness: 0.8 }),
  barn: new THREE.MeshStandardMaterial({ color: 0x5e2620, roughness: 0.95 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x55534d, roughness: 1, flatShading: true }),
  grass: new THREE.MeshStandardMaterial({ map: grassTex(), alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide }),
  corn: new THREE.MeshStandardMaterial({ map: cornTex(), alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide }),
  crate: new THREE.MeshStandardMaterial({ color: 0x4f5a2c, roughness: 0.7, emissive: 0x1f2a08 }),
  beam: new THREE.MeshBasicMaterial({ color: 0x9cff7a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
  scare: new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 1 }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  trunk: (() => { const g = new THREE.CylinderGeometry(0.1, 0.3, 1, 7); g.translate(0, 0.5, 0); return g; })(),
  branch: (() => { const g = new THREE.CylinderGeometry(0.02, 0.08, 1, 5); g.translate(0, 0.5, 0); return g; })(),
  hay: new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14),
  tuft: crossGeo(0.9, 0.55),
  stalk: crossGeo(0.6, 2.2),
  rock: new THREE.DodecahedronGeometry(0.8, 0),
  beam: new THREE.CylinderGeometry(0.25, 0.25, 30, 8, 1, true),
  wheel: new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12),
};

// ground follows the player; the texture offset keeps it fixed in world space
const GROUND = 320;
tex.ground.repeat.set(GROUND / 4, GROUND / 4);
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 }));
groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ---------------------------------------------------------------- particles, decals, gibs, screen gore
class Particles {
  constructor(max, size) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-999); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(p, dir, n, color, speed, spread, life = 0.9) {
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.max;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = (dir.x + (Math.random() - .5) * spread) * sp;
      this.vel[i * 3 + 1] = (dir.y + (Math.random() - .3) * spread) * sp;
      this.vel[i * 3 + 2] = (dir.z + (Math.random() - .5) * spread) * sp;
      const v = 0.7 + Math.random() * 0.5;
      this.col.set([color.r * v, color.g * v, color.b * v], i * 3);
      this.life[i] = life * (0.5 + Math.random() * 0.7);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3] *= 0.3; this.vel[i * 3 + 2] *= 0.3; this.vel[i * 3 + 1] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
const blood = new Particles(800, 0.06);
const dust = new Particles(300, 0.05);
const BLOOD = new THREE.Color(0x6a0805), DUST = new THREE.Color(0x8a8070);

const decalMat = new THREE.MeshBasicMaterial({ map: radial('rgba(70,4,2,.95)', 'rgba(50,2,1,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const decals = [];
for (let i = 0; i < 50; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); decals.push(m); }
let decalI = 0;
function splat(x, z, s) { const m = decals[decalI]; decalI = (decalI + 1) % decals.length; m.position.set(x, 0.015 + decalI * 0.0002, z); m.rotation.z = Math.random() * 6; m.scale.setScalar(s); m.visible = true; }

const gibs = (() => {
  const MAX = 90;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: 0x6b0d09, roughness: 0.35, flatShading: true }), MAX);
  mesh.frustumCulled = false; scene.add(mesh);
  const P = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) { P.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), life: 0, s: 1, landed: false }); mesh.setMatrixAt(i, hide); }
  let next = 0;
  return {
    emit(at, n, up = 3, out = 3, push) {
      for (let k = 0; k < n; k++) {
        const g = P[next]; next = (next + 1) % MAX;
        g.p.copy(at); g.v.set((Math.random() - .5) * out, up * (0.5 + Math.random()), (Math.random() - .5) * out);
        if (push) g.v.addScaledVector(push, 1 + Math.random());
        g.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); g.life = 5 + Math.random() * 3; g.s = 0.5 + Math.random() * 1.1; g.landed = false;
      }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const g = P[i]; if (g.life <= 0) continue;
        g.life -= dt; g.v.y -= 9.8 * dt; g.p.addScaledVector(g.v, dt);
        if (g.p.y < 0.04) { g.p.y = 0.04; g.v.y *= -0.25; g.v.x *= 0.6; g.v.z *= 0.6; if (!g.landed) { g.landed = true; splat(g.p.x, g.p.z, 0.25 + Math.random() * 0.2); } } else g.r.x += dt * 8;
        const s = g.s * Math.min(1, g.life);
        e.set(g.r.x, g.r.y, g.r.z); q.setFromEuler(e); sc.set(s, s * 0.7, s);
        mesh.setMatrixAt(i, g.life > 0 ? m4.compose(g.p, q, sc) : hide);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
})();

const gore = (() => {
  const cv = $('gore'), g = cv.getContext('2d');
  const size = () => { cv.width = Math.round(innerWidth * 0.6); cv.height = Math.round(innerHeight * 0.6); };
  size(); addEventListener('resize', size);
  function drop(x, y, r, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(95,0,0,${a})`); gr.addColorStop(0.7, `rgba(120,4,2,${a * 0.85})`); gr.addColorStop(1, 'rgba(120,4,2,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return {
    splat(n = 3, big = 1) {
      const W = cv.width, H = cv.height;
      for (let i = 0; i < n; i++) {
        const x = Math.random() < .7 ? (Math.random() < .5 ? Math.random() * W * 0.3 : W - Math.random() * W * 0.3) : W * (0.25 + Math.random() * 0.5);
        const y = Math.random() * H, r = (20 + Math.random() * 45) * big * (W / 600);
        drop(x, y, r, 0.85);
        for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, d = r * (0.8 + Math.random() * 1.6); drop(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.08 + Math.random() * 0.2), 0.9); }
        if (Math.random() < 0.6) { g.fillStyle = 'rgba(100,0,0,.8)'; g.fillRect(x - 2, y, 3 + Math.random() * 3, r * (1 + Math.random() * 2)); }
      }
    },
    slash() {
      const W = cv.width, H = cv.height, m = Math.min(W, H);
      const cx = W * (0.3 + Math.random() * 0.4), cy = H * (0.3 + Math.random() * 0.4);
      const ang = (Math.random() < .5 ? -1 : 1) * (0.5 + Math.random() * 0.5) + Math.PI / 2;
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, len = m * (0.55 + Math.random() * 0.25);
      for (let k = -1.5; k <= 1.5; k += 1) {
        const ox = cx + nx * k * m * 0.06, oy = cy + ny * k * m * 0.06;
        for (const [w, col] of [[m * 0.028, 'rgba(110,0,0,.9)'], [m * 0.012, 'rgba(40,0,0,.95)']]) {
          g.strokeStyle = col; g.lineCap = 'round';
          for (let t = 0; t < 1; t += 0.05) {
            g.lineWidth = Math.max(1, w * Math.sin(t * Math.PI));
            g.beginPath(); g.moveTo(ox + dx * len * (t - 0.5), oy + dy * len * (t - 0.5)); g.lineTo(ox + dx * len * (t - 0.45), oy + dy * len * (t - 0.45)); g.stroke();
          }
        }
      }
    },
    update(dt) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.5)})`; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over'; },
    clear() { g.clearRect(0, 0, cv.width, cv.height); },
  };
})();

// ---------------------------------------------------------------- weapons (first-person view)
const WEAPONS = {
  pistol: { name: 'REVOLVER', cd: 0.33, range: 30, cone: 0.32, body: 45, head: 200, pellets: 1, add: 12, shake: 0.08 },
  shotgun: { name: 'SHOTGUN', cd: 0.75, range: 15, cone: 0.55, body: 130, head: 300, pellets: 3, add: 8, shake: 0.25 },
  rifle: { name: 'RIFLE', cd: 0.11, range: 40, cone: 0.26, body: 38, head: 150, pellets: 1, add: 30, shake: 0.05, auto: true },
};
const vm = (() => {
  gunScene.add(new THREE.HemisphereLight(0xb8c4dc, 0x2a2018, 1.3));
  const key = new THREE.DirectionalLight(0xffe2c0, 1.8); key.position.set(-1, 2, 1.5); gunScene.add(key);
  const flash = new THREE.PointLight(0xffb060, 0, 2, 2); gunScene.add(flash);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.38, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.6 });
  const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc28f72, roughness: 0.65 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.9 });
  const B = (p, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const C = (p, r, l, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); p.add(o); return o; };
  const root = new THREE.Group(); gunScene.add(root);
  const models = {};
  // revolver
  { const g = new THREE.Group(); C(g, 0.009, 0.16, steel, 0, 0.03, -0.1); C(g, 0.022, 0.045, steel, 0, 0.022, -0.01); B(g, 0.03, 0.03, 0.08, steel, 0, 0.03, 0.03);
    const gr = B(g, 0.03, 0.09, 0.04, woodM, 0, -0.03, 0.07); gr.rotation.x = -0.35; models.pistol = g; }
  // shotgun
  { const g = new THREE.Group(); C(g, 0.013, 0.5, steel, -0.012, 0.03, -0.2); C(g, 0.013, 0.5, steel, 0.012, 0.03, -0.2); B(g, 0.06, 0.05, 0.12, steel, 0, 0.02, 0.06);
    B(g, 0.05, 0.06, 0.3, woodM, 0, 0.0, 0.25); B(g, 0.05, 0.04, 0.16, woodM, 0, 0.0, -0.12); g.scale.setScalar(0.72); models.shotgun = g; }
  // rifle
  { const g = new THREE.Group(); C(g, 0.01, 0.42, steel, 0, 0.03, -0.25); B(g, 0.045, 0.06, 0.32, dark, 0, 0.02, 0.0); B(g, 0.03, 0.12, 0.05, dark, 0, -0.07, -0.02);
    B(g, 0.04, 0.06, 0.22, woodM, 0, 0.0, 0.25); B(g, 0.02, 0.03, 0.12, dark, 0, 0.075, 0.0); g.scale.setScalar(0.75); models.rifle = g; }
  const hand = new THREE.Group();
  B(hand, 0.055, 0.09, 0.075, skin, 0.01, -0.05, 0.06);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.45, 10), sleeve);
  const dir = new THREE.Vector3(0.2, -0.38, 0.9).normalize();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); arm.position.set(0.02, -0.1, 0.1).addScaledVector(dir, 0.22); hand.add(arm);
  root.add(hand);
  // empty-handed: a second fist that pumps while running
  const fist = new THREE.Group(); B(fist, 0.06, 0.07, 0.08, skin, 0, 0, 0);
  const farm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.45, 10), sleeve);
  farm.quaternion.copy(arm.quaternion); farm.position.copy(dir).multiplyScalar(0.22).add(new THREE.Vector3(0, -0.03, 0.03)); fist.add(farm);
  gunScene.add(fist);
  for (const k in models) { models[k].visible = false; root.add(models[k]); }
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,230,160,1)', 'rgba(255,120,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  fl.visible = false; root.add(fl);
  return { root, models, hand, fist, flash, fl };
})();

// ---------------------------------------------------------------- world chunks
const CELL = 24, RADIUS = 4;
const cells = new Map();
let solids = [];
let crates = [];
function hash(a, b) { return (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0; }
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();

function buildCell(cx, cz) {
  const r = rng(hash(cx, cz) + 7);
  const g = new THREE.Group();
  const rects = [], disposables = [];
  const x0 = cx * CELL, z0 = cz * CELL;
  const nearStart = Math.abs(cx) <= 1 && cz >= -1 && cz <= 0;
  const mesh = (geo, mat, x, y, z, sx, sy, sz, ry = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; m.castShadow = cast; m.receiveShadow = true; g.add(m); return m;
  };
  const rect = (x, z, hw, hd) => rects.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
  // grass tufts
  const tufts = new THREE.InstancedMesh(G.tuft, M.grass, 45);
  for (let i = 0; i < 45; i++) {
    s4.set(0.7 + r() * 0.8, 0.6 + r() * 0.9, 0.7 + r() * 0.8); e4.set(0, r() * 6, 0); q4.setFromEuler(e4);
    tufts.setMatrixAt(i, m4.compose(p4.set(x0 + r() * CELL, 0, z0 + r() * CELL), q4, s4));
  }
  g.add(tufts); disposables.push(tufts);
  // corn patch
  if (r() < 0.3) {
    const corn = new THREE.InstancedMesh(G.stalk, M.corn, 120);
    const px = x0 + r() * CELL * 0.5, pz = z0 + r() * CELL * 0.5;
    for (let i = 0; i < 120; i++) {
      const row = i % 8, col = Math.floor(i / 8);
      e4.set((r() - .5) * 0.2, r() * 6, (r() - .5) * 0.2); q4.setFromEuler(e4); s4.set(1, 0.7 + r() * 0.5, 1);
      corn.setMatrixAt(i, m4.compose(p4.set(px + row * 1.1 + r() * 0.3, 0, pz + col * 0.8 + r() * 0.3), q4, s4));
    }
    g.add(corn); disposables.push(corn);
  }
  const n = nearStart ? 0 : 1 + Math.floor(r() * 3.2);
  for (let k = 0; k < n; k++) {
    const x = x0 + 2 + r() * (CELL - 4), z = z0 + 2 + r() * (CELL - 4), t = r();
    if (t < 0.3) { // dead tree
      const h = 5 + r() * 5;
      mesh(G.trunk, M.bark, x, 0, z, 1, h, 1, r() * 6);
      for (let b = 0; b < 6; b++) {
        const br = new THREE.Mesh(G.branch, M.bark); br.position.set(x, h * (0.4 + r() * 0.5), z);
        br.rotation.set((0.5 + r() * 0.7) * (r() < .5 ? -1 : 1), r() * 6, (r() - .5) * 0.8, 'YXZ'); br.scale.set(1, 1 + r() * 2, 1); br.castShadow = true; g.add(br);
      }
      rect(x, z, 0.35, 0.35);
    } else if (t < 0.5) { // hay bales
      const c = 1 + Math.floor(r() * 3);
      for (let i = 0; i < c; i++) { const hb = mesh(G.hay, M.hay, x + i * 1.6, 0.75, z, 1, 1, 1); hb.rotation.z = Math.PI / 2; }
      rect(x + (c - 1) * 0.8, z, 0.8 * c + 0.1, 0.75);
    } else if (t < 0.68) { // broken fence, axis aligned
      const len = 5 + r() * 7, alongX = r() < 0.5;
      for (let i = 0; i <= len; i += 2.2) {
        const px = alongX ? x + i : x, pz = alongX ? z : z + i;
        mesh(G.box, M.oldWood, px, 0.6, pz, 0.14, 1.2, 0.14, (r() - .5) * 0.3);
      }
      for (const y of [0.45, 0.95]) mesh(G.box, M.oldWood, alongX ? x + len / 2 : x, y, alongX ? z : z + len / 2, alongX ? len : 0.08, 0.12, alongX ? 0.08 : len, 0, false);
      if (alongX) rect(x + len / 2, z, len / 2 + 0.1, 0.15); else rect(x, z + len / 2, 0.15, len / 2 + 0.1);
    } else if (t < 0.8) { // wrecked car
      const ry = r() < 0.5 ? 0 : Math.PI / 2, w = ry ? 1.8 : 4.2, d = ry ? 4.2 : 1.8;
      mesh(G.box, M.car, x, 0.65, z, w, 0.8, d, 0);
      mesh(G.box, M.glass, x, 1.3, z, ry ? 1.6 : 2.2, 0.55, ry ? 2.2 : 1.6, 0);
      for (const [a, b] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) {
        const wx = ry ? b : a, wz = ry ? a : b;
        const wh = new THREE.Mesh(G.wheel, M.rust); wh.rotation.set(ry ? 0 : Math.PI / 2, 0, ry ? Math.PI / 2 : 0); wh.position.set(x + wx, 0.35, z + wz); g.add(wh);
      }
      rect(x, z, w / 2, d / 2);
    } else if (t < 0.9) { // rocks
      mesh(G.rock, M.rock, x, 0.35, z, 1 + r(), 0.7 + r() * 0.6, 1 + r(), r() * 6);
      rect(x, z, 0.9, 0.9);
    } else if (t < 0.96) { // scarecrow
      mesh(G.box, M.scare, x, 1.1, z, 0.1, 2.2, 0.1);
      mesh(G.box, M.scare, x, 1.7, z, 1.4, 0.1, 0.1);
      mesh(G.box, M.hay, x, 1.65, z, 0.45, 0.6, 0.25);
      mesh(G.box, M.hay, x, 2.15, z, 0.28, 0.3, 0.28);
      rect(x, z, 0.3, 0.3);
    } else { // barn
      mesh(G.box, M.barn, x, 2.6, z, 7, 5.2, 9);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 9.4, 3, 1), M.roof);
      roof.rotation.x = -Math.PI / 2; roof.scale.set(1, 1, 0.6); roof.position.set(x, 6.4, z); roof.castShadow = true; g.add(roof);
      disposables.push(roof.geometry);
      rect(x, z, 3.5, 4.5);
    }
  }
  // supply crate
  const cr = [];
  if (!nearStart && r() < 0.16) {
    const x = x0 + 4 + r() * (CELL - 8), z = z0 + 4 + r() * (CELL - 8);
    if (!rects.some(s => x > s.x0 - 1.5 && x < s.x1 + 1.5 && z > s.z0 - 1.5 && z < s.z1 + 1.5)) {
      const c = mesh(G.box, M.crate, x, 0.35, z, 0.9, 0.7, 0.6, r() * 3);
      const beam = new THREE.Mesh(G.beam, M.beam); beam.position.set(x, 15, z); g.add(beam);
      const roll = r(), type = roll < 0.45 ? 'pistol' : roll < 0.75 ? 'shotgun' : 'rifle';
      cr.push({ x, z, type, mesh: c, beam, taken: false });
    }
  }
  scene.add(g);
  return { g, rects, crates: cr, disposables };
}
function updateCells() {
  const pcx = Math.floor(player.pos.x / CELL), pcz = Math.floor(player.pos.z / CELL);
  let changed = false;
  for (let dz = -RADIUS; dz <= RADIUS; dz++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const k = `${pcx + dx},${pcz + dz}`;
    if (!cells.has(k)) { cells.set(k, buildCell(pcx + dx, pcz + dz)); changed = true; }
  }
  for (const [k, c] of cells) {
    const [cx, cz] = k.split(',').map(Number);
    if (Math.abs(cx - pcx) > RADIUS + 1 || Math.abs(cz - pcz) > RADIUS + 1) {
      scene.remove(c.g);
      for (const d of c.disposables) d.dispose?.();
      cells.delete(k); changed = true;
    }
  }
  if (changed) {
    solids = []; crates = [];
    for (const c of cells.values()) { solids.push(...c.rects); crates.push(...c.crates.filter(x => !x.taken)); }
  }
}
function clearCells() { for (const c of cells.values()) { scene.remove(c.g); for (const d of c.disposables) d.dispose?.(); } cells.clear(); solids = []; crates = []; }

function collide(pos, r) {
  let hit = false;
  for (const s of solids) {
    if (pos.x < s.x0 - r || pos.x > s.x1 + r || pos.z < s.z0 - r || pos.z > s.z1 + r) continue;
    const cx = Math.max(s.x0, Math.min(pos.x, s.x1)), cz = Math.max(s.z0, Math.min(pos.z, s.z1));
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
    else { const pl = pos.x - s.x0 + r, pr = s.x1 + r - pos.x, pt = pos.z - s.z0 + r, pb = s.z1 + r - pos.z, m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x -= pl; else if (m === pr) pos.x += pr; else if (m === pt) pos.z -= pt; else pos.z += pb; }
  }
  return hit;
}
const blockedAt = (x, z, pad) => solids.some(s => x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad);

// ---------------------------------------------------------------- state
const player = { pos: new THREE.Vector3(), yaw: 0, steer: 0 };
let state = 'menu', zombies = [], spawnT = 0;
const fx = { bob: 0, recoil: 0, shake: 0, tilt: 0, hurt: 0, flashT: 0, slowT: 0, hitT: 0, stumble: 0, stumbleCd: 0 };
let best = Number(store.get('lastmile-best') || 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3();

function reset() {
  for (const z of zombies) scene.remove(z.root);
  zombies = [];
  clearCells();
  for (const d of decals) d.visible = false;
  gore.clear();
  Object.assign(player, { yaw: 0, steer: 0, dist: 0, kills: 0, heads: 0, speed: 5.5, weapon: 'pistol', ammo: 8, cd: 0, caughtBy: null, caughtT: 0, time: 0 });
  player.pos.set(0, 0, 0);
  Object.assign(fx, { recoil: 0, shake: 0, tilt: 0, hurt: 0, flashT: 0, slowT: 0, stumble: 0, ambushT: 12, beatT: 0 });
  spawnT = 1.0;
  updateCells();
}

// ---------------------------------------------------------------- zombies
function spawnZombie(ahead = 32 + Math.random() * 26, lateral = (Math.random() - .5) * 60) {
  const fx_ = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const x = player.pos.x + fx_ * ahead + rx * lateral, z = player.pos.z + fz * ahead + rz * lateral;
  if (blockedAt(x, z, 0.8)) return null;
  const d = player.dist, roll = Math.random();
  const type = d > 300 && roll < Math.min(0.08, 0.02 + d / 25000) ? 'brute' : d > 120 && roll > 1 - Math.min(0.3, (d - 120) / 2500 + 0.06) ? 'runner' : 'walker';
  const zb = new Zombie(type, x, z);
  zb.yaw = Math.random() * 6.28;
  zb.wander = Math.random() * 6.28;
  zb.pounceCd = 99;
  zb.speedMul *= 1 + Math.min(0.5, d / 3000);
  scene.add(zb.root);
  zombies.push(zb);
  return zb;
}
function spawnHorde() {
  // a wall of the dead across your path, with a gap or two to aim for
  const n = 6 + Math.floor(Math.random() * 6 + Math.min(6, player.dist / 300)), base = 38 + Math.random() * 12, off = (Math.random() - .5) * 8;
  const gap = Math.floor(Math.random() * n);
  for (let i = 0; i < n; i++) { if (i === gap) continue; spawnZombie(base + (Math.random() - .5) * 7, off + (i - n / 2) * (1.6 + Math.random() * 0.9)); }
}
// one of them claws its way up out of the dirt right in front of you
function spawnAmbush() {
  const z = spawnZombie(11 + Math.random() * 7, (Math.random() - .5) * 5);
  if (!z) return;
  z.rise = 1; z.alerted = true; z.pos.y = -1.7;
  sfx.roar(z.pos.x, 0.5, z.pos.z, 'walker');
  tmp.set(z.pos.x, 0.1, z.pos.z); dust.emit(tmp, tmp2.set(0, 1, 0), 30, DUST, 2.5, 2, 1);
}

let nearest = 99;
function updateZombies(dt) {
  nearest = 99;
  const px = player.pos.x, pz = player.pos.z;
  const fx_ = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z.alive) {
      if (z.fountainT > 0) { z.fountainT -= dt; z.neckWorld(tmp); blood.emit(tmp, tmp2.set(Math.sin(z.yaw) * 0.3, 1, Math.cos(z.yaw) * 0.3), 4, BLOOD, 3 * Math.min(1, z.fountainT + 0.3), 0.6); }
      if (z.animateDeath(dt)) { scene.remove(z.root); zombies.splice(i, 1); }
      continue;
    }
    const dx = px - z.pos.x, dz = pz - z.pos.z, d = Math.hypot(dx, dz);
    const behind = -(dx * fx_ + dz * fz); // >0 when zombie is ahead
    if (behind < -25 || d > 120) { scene.remove(z.root); zombies.splice(i, 1); continue; }
    if (z.mode === 'grab') { z.animate(dt, false, 0); continue; }
    if (z.rise) {
      z.pos.y = Math.min(0, z.pos.y + dt * 2.2);
      z.yaw = Math.atan2(dx, dz);
      z.lunge = true; z.animate(dt, false, 0);
      if (z.pos.y >= 0) z.rise = 0;
      if (state === 'play' && d < z.radius + 0.55) caught(z);
      continue;
    }
    nearest = Math.min(nearest, d);
    if (state === 'play' && !z.closeCall && d < 1.7 && d > z.radius + 0.55 && behind < 0.6) {
      z.closeCall = true; fx.slowT = 0.18; fx.hurt = Math.max(fx.hurt, 0.45); fx.shake = 0.3;
      sfx.roar(z.pos.x, 1.6, z.pos.z, z.type); sfx.heartbeat(); buzz(40);
      showMessage('<small>CLOSE CALL</small>', 0.6);
    }
    z.flinch = Math.max(0, z.flinch - dt * 4); z.stun -= dt; z.attackCd -= dt; if (z.attackT > 0) z.attackT -= dt;
    let speed, dirx, dirz;
    const sense = z.type === 'runner' ? 30 : 17;
    if (d < sense) {
      // lunge at where the runner is heading
      const lead = Math.min(1.2, d / 6);
      const tx = px + fx_ * player.speed * lead - z.pos.x, tz = pz + fz * player.speed * lead - z.pos.z, tl = Math.hypot(tx, tz) || 1;
      dirx = tx / tl; dirz = tz / tl;
      speed = z.def.speed * z.speedMul * (d < 5 ? 1.5 : 1);
      z.lunge = d < 6;
      if (d < 2.4 && z.attackT <= 0 && z.attackCd <= 0) { z.attackT = 0.55; z.attackCd = 1; if (Math.random() < .5) sfx.slash(); }
      if (!z.alerted) { z.alerted = true; if (Math.random() < 0.6) sfx.groan(z.pos.x, 1.6, z.pos.z, z.type); }
    } else {
      z.lunge = false;
      z.wander += (Math.random() - .5) * dt;
      dirx = Math.sin(z.wander); dirz = Math.cos(z.wander); speed = 0.35;
    }
    if (z.stun > 0) speed *= 0.15;
    if (z.kb) { z.pos.x += z.kb.x * dt; z.pos.z += z.kb.z * dt; z.kb.multiplyScalar(Math.exp(-dt * 6)); if (z.kb.lengthSq() < 0.01) z.kb = null; }
    z.pos.x += dirx * speed * dt; z.pos.z += dirz * speed * dt;
    collide(z.pos, z.radius);
    let da = Math.atan2(dirx, dirz) - z.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    z.yaw += da * Math.min(1, dt * 6);
    z.animate(dt, true, speed);
    z.groanT -= dt;
    if (z.groanT <= 0) { if (d < 30) sfx.groan(z.pos.x, 1.6, z.pos.z, z.type); z.groanT = (d < 12 ? 1.2 : 2.5) + Math.random() * 4; }
    if (state === 'play' && d < z.radius + 0.55) caught(z);
  }
}

// ---------------------------------------------------------------- shooting
function aimTargets(w) {
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const list = [];
  for (const z of zombies) {
    if (!z.alive) continue;
    const dx = z.pos.x - player.pos.x, dz = z.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / (d || 1))));
    if (ang < w.cone) list.push({ z, d, score: d + ang * 20 });
  }
  return list.sort((a, b) => a.score - b.score);
}
function fire() {
  if (state !== 'play' || player.cd > 0) return;
  const w = WEAPONS[player.weapon];
  if (!w || player.ammo <= 0) { sfx.empty(); player.cd = 0.3; return; }
  player.ammo--; player.cd = w.cd;
  fx.recoil = 1; fx.flashT = 0.06; fx.shake = Math.max(fx.shake, w.shake); buzz(player.weapon === 'shotgun' ? 35 : 15);
  sfx.shot(); if (player.weapon === 'shotgun') { sfx.shot(); sfx.impact(true); }
  const targets = aimTargets(w).slice(0, w.pellets);
  if (!targets.length) {
    camera.getWorldDirection(fwd);
    tmp.copy(camera.position).addScaledVector(fwd, 18); tmp.y = 0.05;
    dust.emit(tmp, tmp2.set(0, 1, 0), 10, DUST, 2, 1.4, 0.6);
    return;
  }
  for (const { z, d } of targets) {
    const head = Math.random() < (d < 7 ? 0.75 : d < 15 ? 0.5 : 0.3);
    z.hp -= head ? w.head : w.body;
    z.flinch = 1; z.stun = z.type === 'brute' ? 0.15 : 0.45;
    tmp2.set(z.pos.x - player.pos.x, 0, z.pos.z - player.pos.z).normalize();
    z.kb = new THREE.Vector3(tmp2.x, 0, tmp2.z).multiplyScalar(z.type === 'brute' ? 0.6 : player.weapon === 'shotgun' ? 5 : 2);
    (head ? z.head : z.parts[0]).getWorldPosition(tmp);
    blood.emit(tmp, tmp2, head ? 30 : 18, BLOOD, 3.5, 1.3);
    if (Math.random() < 0.6) splat(z.pos.x + tmp2.x * 0.6, z.pos.z + tmp2.z * 0.6, 0.5 + Math.random() * 0.5);
    sfx.impact(true);
    hitmark(head);
    if (z.hp <= 0) kill(z, head, d);
  }
}
function kill(z, head, d) {
  z.alive = false; z.mode = null; z.pos.y = 0;
  player.kills++;
  z.head.getWorldPosition(tmp);
  tmp2.set(z.pos.x - player.pos.x, 0, z.pos.z - player.pos.z).normalize();
  if (head) {
    player.heads++;
    for (const p of z.headParts) p.visible = false;
    if (z.popHead()) z.fountainT = 1.5;
    blood.emit(tmp, tmp2.set(tmp2.x * 0.5, 1, tmp2.z * 0.5), 70, BLOOD, 4.5, 2.4);
    gibs.emit(tmp, 9, 3.5, 4, tmp2);
    fx.slowT = 0.2; sfx.gore();
  } else {
    tmp.y -= 0.4;
    blood.emit(tmp, tmp2, 35, BLOOD, 3, 2);
    gibs.emit(tmp, z.type === 'brute' ? 10 : 4, 2.5, 3, tmp2);
    if (z.type === 'brute') { fx.slowT = 0.3; sfx.gore(); }
  }
  splat(z.pos.x, z.pos.z, 1.2 + Math.random() * 0.6);
  if (d < 3.5) gore.splat(head ? 3 : 2, 1.2);
}

// ---------------------------------------------------------------- getting caught
function caught(z) {
  state = 'caught';
  player.caughtBy = z; player.caughtT = 0; player.bites = 0;
  z.mode = 'grab'; z.kb = null; z.rise = 0; z.pos.y = 0;
  sfx.roar(z.pos.x, 1.6, z.pos.z, z.type); buzz([80, 40, 160]);
  fx.shake = 0.8; fx.tilt = 0.25;
  gore.slash(); gore.splat(3, 1.4);
  input.firing = false;
}
function updateCaught(dt) {
  const z = player.caughtBy;
  player.caughtT += dt;
  const t = player.caughtT;
  // drag the zombie onto you and lock the view on it
  const dx = player.pos.x - z.pos.x, dz = player.pos.z - z.pos.z, d = Math.hypot(dx, dz) || 1;
  const hold = z.radius + 0.55;
  z.pos.x = player.pos.x - dx / d * hold; z.pos.z = player.pos.z - dz / d * hold;
  z.yaw = Math.atan2(dx, dz);
  let dy = Math.atan2(-(z.pos.x - player.pos.x), -(z.pos.z - player.pos.z)) - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * Math.min(1, dt * 10);
  if (t > 0.35 + player.bites * 0.45 && player.bites < 4) {
    player.bites++;
    sfx.bite(); buzz(120); fx.shake = 0.6; fx.tilt = (Math.random() - .5) * 0.5; fx.hurt = 1;
    gore.splat(2, 1.2); if (player.bites % 2) gore.slash();
    z.head.getWorldPosition(tmp); blood.emit(tmp, tmp2.set(dx / d, 0.5, dz / d), 25, BLOOD, 3, 1.4);
  }
  if (t > 2.4 && state === 'caught') gameOver();
}
function gameOver() {
  state = 'dead';
  sfx.breath()?.stop();
  if (document.pointerLockElement) document.exitPointerLock();
  const dist = Math.floor(player.dist);
  const isBest = dist > best;
  if (isBest) { best = dist; store.set('lastmile-best', String(best)); }
  $('stats').innerHTML = `You ran <b>${dist} m</b>${isBest ? ' &middot; <b>new best!</b>' : ''}<br>Kills <b>${player.kills}</b> &middot; Headshots <b>${player.heads}</b><br>Best <b>${best} m</b>`;
  $('dead').classList.remove('hidden'); $('touch').classList.add('hidden');
}

// ---------------------------------------------------------------- input
const keys = {};
const input = { firing: false, steerTouch: null, mouseSteer: 0 };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'Space' || e.code === 'KeyJ') { input.firing = true; fire(); }
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyJ') input.firing = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) input.mouseSteer += e.movementX * 0.0025; });
canvas.addEventListener('mousedown', e => {
  if (isTouch || state !== 'play') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0) { input.firing = true; fire(); }
});
addEventListener('mouseup', e => { if (e.button === 0) input.firing = false; });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'play' && !isTouch) pause(); });

// touch: hold the left or right side of the screen to steer; or tilt the phone
const steerTouches = new Map();
function touchSteerValue() {
  let v = 0;
  for (const x of steerTouches.values()) v += x < innerWidth / 2 ? -1 : 1;
  return Math.max(-1, Math.min(1, v));
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state !== 'play') return;
  for (const t of e.changedTouches) steerTouches.set(t.identifier, t.clientX);
  input.touchSteer = touchSteerValue();
}, { passive: false });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (steerTouches.has(t.identifier)) steerTouches.set(t.identifier, t.clientX);
  input.touchSteer = touchSteerValue();
}, { passive: false });
const endTouch = e => {
  for (const t of e.changedTouches) steerTouches.delete(t.identifier);
  input.touchSteer = touchSteerValue();
  if (![...e.touches].some(t => document.elementFromPoint(t.clientX, t.clientY) === $('btn-fire'))) { input.firing = false; $('btn-fire').classList.remove('active'); }
};
// Tilt steering: turn the phone like a steering wheel. Gravity is projected onto the screen
// (using the screen's rotation) so it works in landscape either way round and in portrait.
const hasTilt = typeof DeviceOrientationEvent !== 'undefined';
const needsTiltPermission = hasTilt && typeof DeviceOrientationEvent.requestPermission === 'function';
let steerMode = store.get('lastmile-steer') || (isTouch && hasTilt ? 'tilt' : 'touch');
let tiltSteer = 0, tiltSeen = 0, tiltGranted = !needsTiltPermission;
const TILT_DEAD = 0.05, TILT_FULL = 0.38; // radians: ~3 deg dead zone, full lock at ~22 deg
function onTilt(e) {
  if (e.beta == null || e.gamma == null) return;
  tiltSeen = performance.now();
  const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
  const gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b);          // gravity in the device's screen plane
  const ang = (((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI) / 180;
  const sx = gx * Math.cos(ang) - gy * Math.sin(ang), sy = gx * Math.sin(ang) + gy * Math.cos(ang);
  if (Math.hypot(sx, sy) < 0.25) return;                            // phone lying flat: no reliable wheel angle
  const wheel = Math.atan2(sx, -sy);                                // 0 = level, + = turned right
  const mag = Math.max(0, Math.abs(wheel) - TILT_DEAD) / (TILT_FULL - TILT_DEAD);
  const target = Math.sign(wheel) * Math.min(1, mag);
  tiltSteer += (target - tiltSteer) * 0.5;                          // light smoothing against sensor jitter
}
function askTilt() {
  // iOS only grants motion access from a tap, so this runs inside the RUN / toggle click handlers
  if (!needsTiltPermission || tiltGranted) return Promise.resolve(tiltGranted);
  return DeviceOrientationEvent.requestPermission().then(r => (tiltGranted = r === 'granted')).catch(() => false);
}
function setSteerMode(mode, save = true) {
  if (mode === 'tilt' && !hasTilt) mode = 'touch';
  steerMode = mode; if (save) store.set('lastmile-steer', mode);
  removeEventListener('deviceorientation', onTilt);
  if (mode === 'tilt') addEventListener('deviceorientation', onTilt);
  tiltSteer = 0;
  $('steer-mode').textContent = mode === 'tilt' ? 'STEERING: TILT PHONE' : 'STEERING: HOLD LEFT / RIGHT';
  $('steer-hint').textContent = mode === 'tilt' ? 'TILT YOUR PHONE TO STEER' : 'HOLD LEFT / RIGHT TO STEER';
}
$('steer-mode').addEventListener('click', () => {
  const next = steerMode === 'tilt' ? 'touch' : 'tilt';
  if (next === 'tilt') { setSteerMode('tilt'); askTilt(); } else setSteerMode('touch');
});
setSteerMode(steerMode, false);
// if tilt was chosen but no sensor readings arrive (blocked by the browser or the page host), fall back
function checkTiltWorks() {
  if (steerMode !== 'tilt') return;
  const started = performance.now();
  setTimeout(() => {
    if (steerMode === 'tilt' && tiltSeen < started) { setSteerMode('touch', false); feed('TILT UNAVAILABLE HERE: HOLD LEFT / RIGHT'); }
  }, 1500);
}
const buzz = ms => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
$('btn-fire').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); input.firing = true; fire(); $('btn-fire').classList.add('active'); }, { passive: false });
$('btn-pause').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); pause(); }, { passive: false });

function enterPlay() {
  sfx.init();
  ['menu', 'pause', 'dead'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  if (isTouch) { $('touch').classList.remove('hidden'); document.documentElement.requestFullscreen?.().catch(() => {}); }
  else canvas.requestPointerLock?.();
  state = 'play'; last = performance.now();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function pause() { if (state !== 'play') return; state = 'paused'; sfx.breath()?.stop(); input.firing = false; $('pause').classList.remove('hidden'); $('touch').classList.add('hidden'); }
$('play').addEventListener('click', () => { if (steerMode === 'tilt') askTilt().then(checkTiltWorks); reset(); enterPlay(); showMessage('RUN', 1.4); sfx.sting(); });
$('resume').addEventListener('click', enterPlay);
$('retry').addEventListener('click', () => { reset(); enterPlay(); showMessage('RUN', 1.4); checkTiltWorks(); });

// ---------------------------------------------------------------- HUD
const hudCache = {};
const setText = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
let msgT = 0;
function showMessage(html, d) { const m = $('message'); m.innerHTML = html; m.classList.add('show'); msgT = d; }
function feed(text) { const d = document.createElement('div'); d.textContent = text; $('pickup-feed').appendChild(d); setTimeout(() => d.remove(), 2300); }
function hitmark(head) { const h = $('hitmarker'); h.classList.toggle('head', head); h.classList.add('show'); fx.hitT = 0.12; }
function updateHUD(dt) {
  $('dist').firstChild.nodeValue = String(Math.floor(player.dist));
  setText('kills', String(player.kills)); setText('best', String(best));
  const w = WEAPONS[player.weapon];
  setText('wname', w ? w.name : 'UNARMED');
  setText('wammo', w ? String(player.ammo) : '');
  $('wammo').classList.toggle('empty', !!w && player.ammo === 0);
  $('hurt').style.opacity = fx.hurt.toFixed(2);
  if (fx.hitT > 0) { fx.hitT -= dt; if (fx.hitT <= 0) $('hitmarker').classList.remove('show'); }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('message').classList.remove('show'); }
}

// ---------------------------------------------------------------- per frame
function updatePlayer(dt) {
  player.time += dt;
  let steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (input.touchSteer || 0) + (steerMode === 'tilt' ? tiltSteer : 0);
  steer = Math.max(-1, Math.min(1, steer));
  player.steer += (steer - player.steer) * Math.min(1, dt * 8);
  player.yaw -= player.steer * 1.7 * dt + input.mouseSteer;
  input.mouseSteer = 0;
  player.yaw = Math.max(-1.2, Math.min(1.2, player.yaw)); // keep heading "forward"

  const target = 5.5 + Math.min(5, player.dist / 260);
  player.speed += (target - player.speed) * Math.min(1, dt * 2);
  let spd = player.speed * (fx.stumble > 0 ? 0.35 : 1);
  fx.stumble -= dt; fx.stumbleCd -= dt;
  const fx_ = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const ox = player.pos.x, oz = player.pos.z;
  player.pos.x += fx_ * spd * dt; player.pos.z += fz * spd * dt;
  if (collide(player.pos, 0.4) && fx.stumbleCd <= 0) {
    fx.stumble = 0.7; fx.stumbleCd = 1; fx.shake = 0.5; fx.tilt = (Math.random() < .5 ? -1 : 1) * 0.15;
    sfx.impact(false); sfx.hurt(); buzz(60);
    feed('STUMBLED');
  }
  player.dist += Math.hypot(player.pos.x - ox, player.pos.z - oz);
  const prev = Math.sin(fx.bob);
  fx.bob += dt * spd * 1.9;
  if ((prev < 0) !== (Math.sin(fx.bob) < 0)) sfx.click(150 + Math.random() * 50, 0.28);

  player.cd -= dt;
  const w = WEAPONS[player.weapon];
  if (input.firing && w && w.auto && player.cd <= 0) fire();
  if (input.firing && isTouch && w && !w.auto && player.cd <= -0.05) fire();

  // supply crates
  for (const c of crates) {
    if (c.taken) continue;
    if ((c.x - player.pos.x) ** 2 + (c.z - player.pos.z) ** 2 < 2.4) {
      c.taken = true; c.mesh.visible = false; c.beam.visible = false;
      const W = WEAPONS[c.type];
      if (player.weapon === c.type) player.ammo += W.add; else { player.weapon = c.type; player.ammo = W.add + (c.type === 'pistol' ? player.ammo : 0); }
      feed(`${W.name} +${W.add}`); sfx.pickup(); buzz(25);
    }
  }
  // the horde grows the further you get
  spawnT -= dt;
  const want = Math.min(46, 7 + Math.floor(player.dist / 20));
  const alive = zombies.filter(z => z.alive).length;
  if (spawnT <= 0 && alive < want) {
    if (Math.random() < 0.1 + Math.min(0.2, player.dist / 4000)) spawnHorde(); else spawnZombie();
    spawnT = Math.max(0.12, 0.6 - player.dist / 2500);
  }
  fx.ambushT = (fx.ambushT ?? 12) - dt;
  if (fx.ambushT <= 0 && player.dist > 60) { spawnAmbush(); fx.ambushT = 7 + Math.random() * 9; }
  // breathing and heartbeat rise with speed and with how close the dead are
  const br = sfx.breath();
  if (br) { br.rate = 1.2 + player.speed * 0.12 + (nearest < 8 ? 0.6 : 0); br.level = 0.1 + (nearest < 10 ? 0.12 : 0) + Math.min(0.08, player.dist / 6000); br.tick(dt); }
  fx.beatT = (fx.beatT ?? 0) - dt;
  if (nearest < 7 && fx.beatT <= 0) { sfx.heartbeat(); fx.beatT = 0.35 + nearest * 0.06; }
  if (Math.floor(player.dist / 500) > Math.floor((player.dist - spd * dt) / 500)) showMessage(`${Math.floor(player.dist / 500) * 500} m`, 1.5);
  updateCells();
}

function placeCamera(dt) {
  fx.recoil = Math.max(0, fx.recoil - dt * 8); fx.shake = Math.max(0, fx.shake - dt); fx.tilt *= Math.exp(-dt * 4); fx.hurt = Math.max(0, fx.hurt - dt * 1.5);
  const running = state === 'play' || state === 'menu';
  const caughtK = state === 'caught' || state === 'dead' ? Math.min(1, Math.max(0, (player.caughtT - 1.3) / 0.8)) : 0;
  const sh = fx.shake * 0.12;
  const bobY = running ? Math.abs(Math.sin(fx.bob)) * (0.07 + player.speed * 0.004) : 0;
  camera.position.set(player.pos.x, 1.62 + bobY - caughtK * 1.1, player.pos.z);
  camera.rotation.set(-0.03 - fx.recoil * 0.03 + (Math.random() - .5) * sh - caughtK * 0.3,
    player.yaw + (Math.random() - .5) * sh,
    -player.steer * 0.06 + Math.sin(fx.bob) * 0.012 + fx.tilt + caughtK * 0.7);
  camera.fov = (camera.aspect < 1 ? 80 : 72) + (player.speed - 5.5) * 1.6;
  camera.updateProjectionMatrix();

  // viewmodel
  const portrait = camera.aspect < 1;
  const w = player.weapon;
  for (const k in vm.models) vm.models[k].visible = k === w;
  vm.hand.visible = true;
  const swing = Math.sin(fx.bob) * (running ? 1 : 0);
  vm.root.position.set((portrait ? 0.08 : 0.16) + swing * 0.015, (portrait ? -0.19 : -0.16) + Math.abs(swing) * 0.02 + fx.recoil * 0.01, -0.5 + fx.recoil * 0.06);
  vm.root.rotation.set(fx.recoil * 0.35 + swing * 0.04, 0.12 + player.steer * 0.1, -0.05 + swing * 0.05);
  vm.fist.visible = running && !portrait;
  vm.fist.position.set(-0.2, -0.32 + Math.max(0, -swing) * 0.12, -0.42 - Math.max(0, -swing) * 0.05);
  vm.fist.rotation.set(0.3, -0.2, 0.2);
  const fl = fx.flashT > 0;
  vm.fl.visible = fl; vm.fl.position.set(0, 0.03, w === 'shotgun' ? -0.36 : w === 'rifle' ? -0.4 : -0.2); vm.fl.scale.setScalar(fl ? 0.12 + Math.random() * 0.1 : 0.1);
  vm.flash.intensity = fl ? 3 : 0; vm.flash.position.copy(vm.root.position);
  camera.getWorldDirection(fwd);
  muzzleLight.position.copy(camera.position).addScaledVector(fwd, 0.8); muzzleLight.intensity = fl ? 30 : 0;
  fx.flashT -= dt;

  moon.position.set(player.pos.x - 20, 40, player.pos.z + 10); moon.target.position.set(player.pos.x, 0, player.pos.z - 15);
  groundMesh.position.set(player.pos.x, 0, player.pos.z);
  const rep = GROUND / 4;
  tex.ground.offset.set(((player.pos.x / GROUND) * rep) % 1, ((-player.pos.z / GROUND) * rep) % 1);
  sfx.setListener(camera.position, fwd);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = gunCam.aspect = w / h;
  gunCam.fov = w / h < 1 ? 62 : 50;
  camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000); last = now;
  let dt = realDt;
  if (fx.slowT > 0) { fx.slowT -= realDt; dt *= 0.2; }
  if (state === 'play') { updatePlayer(dt); updateZombies(dt); updateHUD(dt); }
  else if (state === 'caught') { updateCaught(dt); updateZombies(dt); updateHUD(dt); }
  else if (state === 'dead') { player.caughtT += dt; updateZombies(dt); }
  else if (state === 'menu') { player.pos.z -= dt * 1.5; fx.bob += dt * 3; player.dist = 0; updateCells(); }
  if (state !== 'paused') { blood.update(dt); dust.update(dt); gibs.update(dt); gore.update(realDt); }
  for (const c of crates) if (!c.taken) { c.mesh.rotation.y += dt; c.beam.material.opacity = 0.14 + Math.sin(now / 300) * 0.05; }
  placeCamera(state === 'paused' ? 0 : dt);
  renderer.clear();
  renderer.render(scene, camera);
  if (state === 'play' || state === 'paused') { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
}

reset();
$('menu-best').textContent = best ? `Best run: ${best} m` : '';
const playBtn = $('play');
playBtn.disabled = true; playBtn.textContent = 'LOADING…';
Promise.all([
  loadModels(window.MODEL_BASE || 'models/').catch(err => console.warn('Monster models failed to load.', err)),
  loadHumans(window.MODEL_BASE || 'models/').catch(err => console.warn('Zombie models failed to load; using fallback zombies.', err)),
])
  .finally(() => { playBtn.disabled = false; playBtn.textContent = 'RUN'; window.__ready = true; });
requestAnimationFrame(frame);

// installable web app: offline cache (skipped inside the native app shell and in previews)
if ('serviceWorker' in navigator && !window.Capacitor && !window.MODEL_EXT && /run\.html$/.test(location.pathname) && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('run-sw.js').catch(() => {});
}

window.__run = { get tilt() { return { steerMode, tiltSteer, tiltSeen }; }, get state() { return state; }, player, setSteer: v => { input.touchSteer = v; }, get zombies() { return zombies; }, fire, spawnZombie, spawnHorde, camera,
  step(dt, n) { for (let i = 0; i < n; i++) { if (state === 'play') { updatePlayer(dt); updateZombies(dt); } else if (state === 'caught') { updateCaught(dt); updateZombies(dt); } } } };
