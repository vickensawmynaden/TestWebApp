import * as THREE from 'three';
import { buildWorld, WORLD_HALF } from './world.js';
import { Zombie } from './zombie.js';
import { Sfx } from './audio.js';
import { radial } from './textures.js';
import { loadModels } from './models.js';
import { Avatar } from './avatar.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
if (isTouch) document.body.classList.add('touch');

// ---------------------------------------------------------------- renderer & scenes
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const FOG = 0x15181d;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.FogExp2(FOG, 0.05);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 150);
camera.rotation.order = 'YXZ';
scene.add(camera);

const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(50, 1, 0.01, 10);

const world = buildWorld(scene);
const sfx = new Sfx();

scene.add(new THREE.HemisphereLight(0x56657a, 0x1c1812, 0.55));
const moon = new THREE.DirectionalLight(0x9fb3d6, 0.9);
moon.castShadow = true;
moon.shadow.mapSize.setScalar(isTouch ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 120 });
moon.shadow.bias = -0.0008;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);

const flashlight = new THREE.SpotLight(0xfff0d2, 70, 34, 0.44, 0.55, 1.6);
flashlight.position.set(0.18, -0.12, 0.05);
flashlight.target.position.set(0.02, -0.04, -1);
if (!isTouch) { flashlight.castShadow = true; flashlight.shadow.mapSize.setScalar(1024); flashlight.shadow.bias = -0.0005; flashlight.shadow.camera.near = 0.3; }
camera.add(flashlight, flashlight.target);

const muzzleLight = new THREE.PointLight(0xffb060, 0, 14, 2);
scene.add(muzzleLight);

// ---------------------------------------------------------------- particles & decals
class Particles {
  constructor(max, size) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-999);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, dir, n, color, speed, spread, life = 0.9) {
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = (dir.x + (Math.random() - .5) * spread) * sp;
      this.vel[i * 3 + 1] = (dir.y + (Math.random() - .3) * spread) * sp;
      this.vel[i * 3 + 2] = (dir.z + (Math.random() - .5) * spread) * sp;
      const v = 0.7 + Math.random() * 0.5;
      this.col[i * 3] = color.r * v; this.col[i * 3 + 1] = color.g * v; this.col[i * 3 + 2] = color.b * v;
      this.life[i] = life * (0.5 + Math.random() * 0.7);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3] *= 0.3; this.vel[i * 3 + 2] *= 0.3; this.vel[i * 3 + 1] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
const blood = new Particles(600, 0.055);
const dust = new Particles(300, 0.04);
const BLOOD = new THREE.Color(0x6a0805), DUST = new THREE.Color(0x8a8070), SPARK = new THREE.Color(0xffc070);

const decalMat = new THREE.MeshBasicMaterial({ map: radial('rgba(70,4,2,.95)', 'rgba(50,2,1,0)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const decals = [];
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat);
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); decals.push(m);
}
let decalI = 0;
function splat(x, z, s) {
  const m = decals[decalI]; decalI = (decalI + 1) % decals.length;
  m.position.set(x, 0.015 + decalI * 0.0002, z); m.rotation.z = Math.random() * 6; m.scale.setScalar(s); m.visible = true;
}

// ---------------------------------------------------------------- first-person pistol
const vm = (() => {
  gunScene.add(new THREE.HemisphereLight(0xc8bca8, 0x2a2018, 1.4));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.2); key.position.set(-1, 2, 1.5); gunScene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa6d0, 1.2); rim.position.set(2, 0.5, -1); gunScene.add(rim);
  const flash = new THREE.PointLight(0xffb060, 0, 2, 2); gunScene.add(flash);

  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.38, metalness: 0.35 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.7, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc28f72, roughness: 0.65 });
  const B = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };

  const root = new THREE.Group(); gunScene.add(root);
  const gun = new THREE.Group(); root.add(gun);
  const slide = new THREE.Group(); gun.add(slide);
  B(0.034, 0.036, 0.19, steel, 0, 0.03, -0.02, slide);
  for (let i = 0; i < 5; i++) B(0.036, 0.026, 0.003, polymer, 0, 0.03, 0.04 + i * 0.008, slide); // serrations
  B(0.006, 0.008, 0.008, steel, 0, 0.052, -0.105, slide);
  B(0.02, 0.008, 0.008, steel, 0, 0.052, 0.068, slide);
  B(0.012, 0.014, 0.03, polymer, 0.018, 0.034, -0.005, slide); // ejection port
  B(0.03, 0.025, 0.17, polymer, 0, 0.0, -0.01, gun);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), steel);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.12); gun.add(barrel);
  const grip = B(0.031, 0.105, 0.048, polymer, 0, -0.055, 0.05, gun); grip.rotation.x = -0.25;
  B(0.005, 0.03, 0.045, polymer, 0, -0.022, -0.008, gun);
  B(0.004, 0.018, 0.006, steel, 0, -0.012, 0.0, gun);

  const hand = new THREE.Group(); gun.add(hand);
  const palm = B(0.05, 0.09, 0.07, skin, 0.012, -0.055, 0.058, hand); palm.rotation.x = -0.25;
  for (let i = 0; i < 3; i++) { const f = B(0.044, 0.02, 0.024, skin, -0.004, -0.04 - i * 0.024, 0.02 + i * 0.006, hand); f.rotation.x = -0.25; }
  B(0.022, 0.017, 0.055, skin, -0.004, -0.014, 0.0, hand); // trigger finger
  const thumb = B(0.012, 0.016, 0.05, skin, -0.02, -0.014, 0.03, hand); thumb.rotation.y = 0.1;
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f4f78, roughness: 0.8 });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.42, 10), sleeve);
  const dir = new THREE.Vector3(0.18, -0.38, 0.9).normalize();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  arm.position.set(0.02, -0.1, 0.09).addScaledVector(dir, 0.21); hand.add(arm);

  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,230,160,1)', 'rgba(255,120,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flashSprite.scale.setScalar(0.13); flashSprite.position.set(0, 0.03, -0.17); flashSprite.visible = false; gun.add(flashSprite);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.03, -0.2); flame.visible = false; gun.add(flame);

  gun.rotation.set(0.04, 0.2, -0.08);
  return { root, gun, slide, flash, flashSprite, flame, base: new THREE.Vector3(0.18, -0.17, -0.5) };
})();

// ---------------------------------------------------------------- state
const RELOAD_TIME = 1.35, MAG = 12, MAX_RESERVE = 120;
const player = { pos: new THREE.Vector3(0, 0, 2), yaw: 0, pitch: 0 };
let state = 'menu';
let view = 'first';
const avatar = new Avatar(scene);
let camT = 1;
let zombies = [];
let pickups = [];
let hitTargets = [];
const wave = { n: 0, toSpawn: 0, spawnT: 0, between: true, interT: 4 };
const fx = { recoil: 0, recoilPitch: 0, bloom: 0, shake: 0, hurt: 0, bobT: 0, swayX: 0, swayY: 0, sprint: 0, flashT: 0, hitT: 0, stepT: 0 };

function resetGame() {
  for (const z of zombies) scene.remove(z.root);
  zombies = [];
  for (const p of pickups) scene.remove(p.mesh);
  pickups = [];
  world.pickupSpots.forEach(([x, z, t]) => spawnPickup(t, x, z));
  for (const d of decals) d.visible = false;
  Object.assign(player, { yaw: 0, pitch: 0, hp: 100, stamina: 1, mag: MAG, reserve: 48, reloading: 0, cd: 0, kills: 0, heads: 0, score: 0, shots: 0, hits: 0, light: true, sprintToggle: false, time: 0, deadT: 0 });
  player.pos.set(0, 0, 2);
  Object.assign(wave, { n: 0, toSpawn: 0, spawnT: 0, between: true, interT: 4 });
  flashlight.visible = true;
  rebuildTargets();
  showMessage('THE FOG ROLLS IN<small>Get ready</small>', 3.2);
}

// ---------------------------------------------------------------- collision & navigation
function collide(pos, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const s of world.solids) {
      if (pos.x < s.x0 - r || pos.x > s.x1 + r || pos.z < s.z0 - r || pos.z > s.z1 + r) continue;
      const cx = Math.max(s.x0, Math.min(pos.x, s.x1)), cz = Math.max(s.z0, Math.min(pos.z, s.z1));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else {
        const pl = pos.x - s.x0 + r, pr = s.x1 + r - pos.x, pt = pos.z - s.z0 + r, pb = s.z1 + r - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x -= pl; else if (m === pr) pos.x += pr; else if (m === pt) pos.z -= pt; else pos.z += pb;
      }
    }
  }
  const L = WORLD_HALF - 0.5;
  pos.x = Math.max(-L, Math.min(L, pos.x)); pos.z = Math.max(-L, Math.min(L, pos.z));
}

const { G, N, OFF, blocked } = world.nav;
const INF = 65535;
const field = new Uint16Array(N * N).fill(INF);
const queue = new Int32Array(N * N);
const cellOf = (x, z) => {
  const i = Math.floor((x + OFF) / G), j = Math.floor((z + OFF) / G);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
};
function computeField() {
  field.fill(INF);
  let s = cellOf(player.pos.x, player.pos.z);
  if (s < 0) return;
  let head = 0, tail = 0;
  const seed = c => { if (c >= 0 && !blocked[c] && field[c] === INF) { field[c] = 0; queue[tail++] = c; } };
  seed(s);
  if (!tail) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) seed(s + dj * N + di);
  while (head < tail) {
    const c = queue[head++], ci = c % N, d = field[c] + 1;
    if (ci > 0 && !blocked[c - 1] && field[c - 1] === INF) { field[c - 1] = d; queue[tail++] = c - 1; }
    if (ci < N - 1 && !blocked[c + 1] && field[c + 1] === INF) { field[c + 1] = d; queue[tail++] = c + 1; }
    if (c >= N && !blocked[c - N] && field[c - N] === INF) { field[c - N] = d; queue[tail++] = c - N; }
    if (c < N * (N - 1) && !blocked[c + N] && field[c + N] === INF) { field[c + N] = d; queue[tail++] = c + N; }
  }
}
function gridLOS(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), steps = Math.ceil(len / 0.3);
  for (let k = 1; k < steps; k++) {
    const c = cellOf(ax + dx * k / steps, az + dz * k / steps);
    if (c < 0 || blocked[c]) return false;
  }
  return true;
}
const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function steer(z, out) {
  const px = player.pos.x, pz = player.pos.z;
  if (z.los) return out.set(px - z.pos.x, 0, pz - z.pos.z).normalize();
  const c = cellOf(z.pos.x, z.pos.z);
  if (c < 0) return out.set(px - z.pos.x, 0, pz - z.pos.z).normalize();
  const ci = c % N, cj = (c / N) | 0;
  let best = blocked[c] ? INF + 1 : field[c], bi = -1;
  for (let k = 0; k < 8; k++) {
    const [di, dj] = NB[k], ni = ci + di, nj = cj + dj;
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
    const nc = nj * N + ni;
    if (blocked[nc]) continue;
    if (k >= 4 && (blocked[cj * N + ni] || blocked[nj * N + ci])) continue;
    const v = field[nc] + (k >= 4 ? 0.4 : 0);
    if (v < best) { best = v; bi = nc; }
  }
  if (bi < 0) return out.set(px - z.pos.x, 0, pz - z.pos.z).normalize();
  return out.set((bi % N) * G - OFF + G / 2 - z.pos.x, 0, ((bi / N) | 0) * G - OFF + G / 2 - z.pos.z).normalize();
}

// ---------------------------------------------------------------- pickups
const pickupGeo = {
  ammo: new THREE.BoxGeometry(0.34, 0.18, 0.22), med: new THREE.BoxGeometry(0.34, 0.24, 0.2),
  cross1: new THREE.BoxGeometry(0.16, 0.05, 0.01), cross2: new THREE.BoxGeometry(0.05, 0.16, 0.01),
  bullet: new THREE.CylinderGeometry(0.014, 0.014, 0.06, 6),
};
const pickupMat = {
  ammo: new THREE.MeshStandardMaterial({ color: 0x4d5434, roughness: 0.6, emissive: 0x1a1d10 }),
  med: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, emissive: 0x2a2a28 }),
  red: new THREE.MeshBasicMaterial({ color: 0xc81e1e }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.3, emissive: 0x302008 }),
};
function spawnPickup(type, x, z) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(pickupGeo[type], pickupMat[type]));
  if (type === 'med') {
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(pickupGeo.cross1, pickupMat.red), b = new THREE.Mesh(pickupGeo.cross2, pickupMat.red);
      a.position.z = b.position.z = s * 0.101; g.add(a, b);
    }
  } else {
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(pickupGeo.bullet, pickupMat.brass); b.position.set(-0.09 + i * 0.06, 0.12, 0); g.add(b); }
  }
  g.position.set(x, 0.3, z);
  g.children.forEach(c => (c.castShadow = true));
  scene.add(g);
  pickups.push({ type, mesh: g, x, z, t: Math.random() * 6 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.mesh.rotation.y = p.t * 1.5;
    p.mesh.position.y = 0.3 + Math.sin(p.t * 2.5) * 0.06;
    if ((p.x - player.pos.x) ** 2 + (p.z - player.pos.z) ** 2 < 1.3) {
      if (p.type === 'ammo') {
        if (player.reserve >= MAX_RESERVE) continue;
        const n = 12 + Math.floor(Math.random() * 3) * 6;
        player.reserve = Math.min(MAX_RESERVE, player.reserve + n); feed(`+${n} ROUNDS`);
      } else {
        if (player.hp >= 100) continue;
        player.hp = Math.min(100, player.hp + 40); feed('+40 HEALTH');
      }
      sfx.pickup();
      scene.remove(p.mesh); pickups.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- zombies & waves
function rebuildTargets() {
  hitTargets = world.occluders.slice();
  for (const z of zombies) if (z.alive) hitTargets.push(...z.parts);
}
function spawnZombie() {
  const far = world.spawnPoints.filter(([x, z]) => {
    const d = Math.hypot(x - player.pos.x, z - player.pos.z), c = cellOf(x, z);
    return d > 18 && c >= 0 && field[c] !== INF;
  });
  const list = far.length ? far : world.spawnPoints;
  const [sx, sz] = list[Math.floor(Math.random() * list.length)];
  const roll = Math.random(), n = wave.n;
  const type = n >= 3 && roll < Math.min(0.15, 0.03 * n) ? 'brute' : n >= 2 && roll > 1 - Math.min(0.35, 0.07 * n) ? 'runner' : 'walker';
  const z = new Zombie(type, sx + (Math.random() - .5) * 2, sz + (Math.random() - .5) * 2);
  z.speedMul *= 1 + Math.min(0.35, n * 0.03);
  collide(z.pos, z.radius);
  scene.add(z.root);
  zombies.push(z);
  hitTargets.push(...z.parts);
}
function updateWaves(dt) {
  const alive = zombies.filter(z => z.alive).length;
  if (wave.between) {
    wave.interT -= dt;
    setSub(`Next wave in ${Math.ceil(Math.max(0, wave.interT))}s`);
    if (wave.interT <= 0) {
      wave.between = false; wave.n++; wave.toSpawn = 4 + wave.n * 3; wave.spawnT = 0.5;
      showMessage(`WAVE ${wave.n}`, 2.2); sfx.sting();
    }
    return;
  }
  setSub(`${alive + wave.toSpawn} undead remaining`);
  wave.spawnT -= dt;
  if (wave.toSpawn > 0 && wave.spawnT <= 0 && alive < Math.min(18, 7 + wave.n * 2)) {
    spawnZombie(); wave.toSpawn--; wave.spawnT = Math.max(0.6, 2.2 - wave.n * 0.15);
  }
  if (wave.toSpawn === 0 && alive === 0) {
    wave.between = true; wave.interT = 9;
    const bonus = wave.n * 250; player.score += bonus;
    showMessage(`WAVE ${wave.n} SURVIVED<small>+${bonus} bonus</small>`, 3);
  }
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let fieldT = 0;
function updateZombies(dt) {
  fieldT -= dt;
  if (fieldT <= 0) { computeField(); fieldT = 0.35; }
  const px = player.pos.x, pz = player.pos.z;
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (!z.alive) {
      if (z.animateDeath(dt)) { scene.remove(z.root); zombies.splice(i, 1); }
      continue;
    }
    const dx = px - z.pos.x, dz = pz - z.pos.z, d = Math.hypot(dx, dz);
    z.losT = (z.losT ?? 0) - dt;
    if (z.losT <= 0) { z.los = d < 16 && gridLOS(z.pos.x, z.pos.z, px, pz); z.losT = 0.2 + Math.random() * 0.1; }
    z.attackCd -= dt; z.stun -= dt; z.flinch = Math.max(0, z.flinch - dt * 4);
    const reach = z.radius + 0.8;
    if (z.attackT > 0) {
      z.attackT -= dt;
      if (!z.hitDone && z.attackT < 0.22) { z.hitDone = true; if (d < reach + 0.5 && state === 'play') hurtPlayer(z.def.dmg); }
    } else if (d < reach && z.attackCd <= 0) {
      z.attackT = 0.55; z.attackCd = z.type === 'runner' ? 0.9 : 1.3; z.hitDone = false;
    }
    let speed = z.def.speed * z.speedMul;
    if (z.stun > 0) speed *= 0.2;
    if (z.attackT > 0) speed *= 0.15;
    const moving = d > z.radius + 0.45;
    if (moving) {
      steer(z, tmp);
      // separation from other zombies
      for (const o of zombies) {
        if (o === z || !o.alive) continue;
        const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, od2 = ox * ox + oz * oz, rr = z.radius + o.radius + 0.15;
        if (od2 < rr * rr && od2 > 1e-6) { const od = Math.sqrt(od2); tmp.x += ox / od * (rr - od) * 2; tmp.z += oz / od * (rr - od) * 2; }
      }
      tmp.normalize();
      z.pos.x += tmp.x * speed * dt; z.pos.z += tmp.z * speed * dt;
      collide(z.pos, z.radius);
    }
    // keep a sliver of space from the player
    const minD = z.radius + 0.35;
    if (d < minD) { z.pos.x -= dx / d * (minD - d); z.pos.z -= dz / d * (minD - d); }
    const face = d < 4 || z.los ? Math.atan2(dx, dz) : Math.atan2(tmp.x, tmp.z);
    let da = face - z.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    z.yaw += da * Math.min(1, dt * (z.type === 'runner' ? 10 : 5));
    z.animate(dt, moving && z.attackT <= 0, speed);
    z.groanT -= dt;
    if (z.groanT <= 0) {
      if (d < 30) sfx.groan(z.pos.x, 1.6, z.pos.z, z.type);
      z.groanT = (z.type === 'runner' ? 2 : 4) + Math.random() * 6;
    }
  }
}

// ---------------------------------------------------------------- shooting
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function fire() {
  if (state !== 'play' || player.reloading > 0 || player.cd > 0) return;
  if (player.mag === 0) { sfx.empty(); player.cd = 0.25; if (player.reserve > 0) startReload(); return; }
  player.mag--; player.cd = 0.17; player.shots++;
  fx.recoil = 1; fx.recoilPitch += 0.022 + Math.random() * 0.01; fx.flashT = 0.055;
  fx.swayX += (Math.random() - .5) * 0.01;
  sfx.shot();

  const moving = input.moveLen > 0.1;
  const spread = 0.004 + fx.bloom + (moving ? 0.012 : 0) + fx.sprint * 0.04;
  fx.bloom = Math.min(0.03, fx.bloom + 0.009);
  camera.getWorldDirection(fwd);
  fwd.x += (Math.random() - .5) * spread * 2; fwd.y += (Math.random() - .5) * spread * 2; fwd.z += (Math.random() - .5) * spread * 2;
  fwd.normalize();
  raycaster.set(camera.position, fwd);
  const hit = raycaster.intersectObjects(hitTargets, false)[0];
  if (!hit) return;
  const zb = hit.object.userData.zombie;
  if (zb && zb.alive) {
    player.hits++;
    const head = hit.object.userData.part === 'head';
    const dmg = head ? 110 : 34;
    zb.hp -= dmg; zb.flinch = 1; zb.stun = zb.type === 'brute' ? 0.12 : 0.3;
    tmp2.copy(fwd).multiplyScalar(0.6);
    blood.emit(hit.point, tmp2, head ? 30 : 16, BLOOD, head ? 4 : 3, 1.2);
    if (Math.random() < 0.6) splat(hit.point.x + fwd.x * 0.5, hit.point.z + fwd.z * 0.5, 0.4 + Math.random() * 0.5);
    sfx.impact(true);
    hitmark(head);
    if (zb.hp <= 0) killZombie(zb, head);
  } else {
    const n = hit.face ? tmp2.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : tmp2.set(0, 1, 0);
    dust.emit(hit.point, n, 10, DUST, 2, 1.4, 0.6);
    dust.emit(hit.point, n, 3, SPARK, 3, 1.0, 0.2);
    sfx.impact(false);
  }
}
function killZombie(z, head) {
  z.alive = false;
  hitTargets = hitTargets.filter(o => o.userData.zombie !== z);
  player.kills++;
  player.score += z.def.score + (head ? 50 : 0);
  if (head) {
    player.heads++;
    for (const p of z.headParts) p.visible = false;
    z.head.getWorldPosition(tmp);
    blood.emit(tmp, tmp2.set(0, 1, 0), 45, BLOOD, 3.5, 2);
    feed('HEADSHOT +50');
  }
  splat(z.pos.x, z.pos.z, 1.2 + Math.random() * 0.6);
  const roll = Math.random();
  if (roll < 0.32) spawnPickup('ammo', z.pos.x, z.pos.z);
  else if (roll < 0.42 || (z.type === 'brute' && roll < 0.8)) spawnPickup('med', z.pos.x, z.pos.z);
}
function startReload() {
  if (player.reloading > 0 || player.mag === MAG || player.reserve === 0 || state !== 'play') return;
  player.reloading = RELOAD_TIME; sfx.reload();
}
function hurtPlayer(dmg) {
  player.hp -= dmg; fx.hurt = 1; fx.shake = 0.35; sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; die(); }
}
function die() {
  state = 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  const acc = player.shots ? Math.round(player.hits / player.shots * 100) : 0;
  $('stats').innerHTML = `Survived to wave <b>${wave.n}</b><br>Kills <b>${player.kills}</b> &middot; Headshots <b>${player.heads}</b><br>Accuracy <b>${acc}%</b> &middot; Score <b>${player.score}</b>`;
  setTimeout(() => { $('dead').classList.remove('hidden'); $('touch').classList.add('hidden'); }, 1200);
}

// ---------------------------------------------------------------- input
const keys = {};
const input = { mx: 0, mz: 0, moveLen: 0, firing: false, lookDX: 0, lookDY: 0, stick: null, look: null };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') toggleLight();
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  input.lookDX += e.movementX * 0.0022; input.lookDY += e.movementY * 0.0022;
});
canvas.addEventListener('mousedown', e => {
  if (isTouch || state !== 'play') return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
  if (e.button === 0) { input.firing = true; fire(); }
});
addEventListener('mouseup', e => { if (e.button === 0) input.firing = false; });
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'play' && !isTouch) pause();
});
function toggleView() { view = view === 'third' ? 'first' : 'third'; sfx.click(900, 0.15); }
function toggleLight() { player.light = !player.light; flashlight.visible = player.light; sfx.click(1200, 0.2); $('btn-light').classList.toggle('active', !player.light); }

// touch: left stick, drag anywhere else to look, fire button also drags to aim
const stick = $('stick'), knob = $('knob');
const STICK_R = 50;
function stickCenter() { const r = stick.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
stick.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0]; input.stick = { id: t.identifier, c: stickCenter() }; moveStick(t);
}, { passive: false });
function moveStick(t) {
  let dx = t.clientX - input.stick.c[0], dy = t.clientY - input.stick.c[1];
  const l = Math.hypot(dx, dy);
  if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.tx = dx / STICK_R; input.tz = dy / STICK_R;
}
function startLook(t) { input.look = { id: t.identifier, x: t.clientX, y: t.clientY }; }
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state !== 'play') return;
  for (const t of e.changedTouches) if (!input.look) startLook(t);
}, { passive: false });
const fireBtn = $('btn-fire');
fireBtn.addEventListener('touchstart', e => {
  e.preventDefault();
  input.firing = true; fire(); fireBtn.classList.add('active');
  if (!input.look) { startLook(e.changedTouches[0]); input.look.fire = true; }
}, { passive: false });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (input.stick && t.identifier === input.stick.id) moveStick(t);
    else if (input.look && t.identifier === input.look.id) {
      input.lookDX += (t.clientX - input.look.x) * 0.0048;
      input.lookDY += (t.clientY - input.look.y) * 0.0048;
      input.look.x = t.clientX; input.look.y = t.clientY;
    }
  }
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (input.stick && t.identifier === input.stick.id) { input.stick = null; input.tx = input.tz = 0; knob.style.transform = ''; }
    if (input.look && t.identifier === input.look.id) input.look = null;
  }
  if (![...e.touches].some(t => { const el = document.elementFromPoint(t.clientX, t.clientY); return el === fireBtn; })) { input.firing = false; fireBtn.classList.remove('active'); }
}
addEventListener('touchend', endTouch);
addEventListener('touchcancel', endTouch);
const tap = (id, fn) => $(id).addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
tap('btn-reload', startReload);
tap('btn-light', toggleLight);
tap('btn-view', toggleView);
tap('btn-sprint', () => { player.sprintToggle = !player.sprintToggle; $('btn-sprint').classList.toggle('active', player.sprintToggle); });
tap('btn-pause', () => pause());

// ---------------------------------------------------------------- menus
function enterPlay() {
  sfx.init();
  ['menu', 'pause', 'dead'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  if (isTouch) {
    $('touch').classList.remove('hidden');
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else canvas.requestPointerLock();
  state = 'play';
  last = performance.now();
}
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  input.firing = false;
  $('pause').classList.remove('hidden');
  $('touch').classList.add('hidden');
}
$('play').addEventListener('click', () => { resetGame(); enterPlay(); });
$('resume').addEventListener('click', enterPlay);
$('retry').addEventListener('click', () => { resetGame(); enterPlay(); });

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setSub(v) { setText('left-alive', v); }
let msgTimer = 0;
function showMessage(html, dur) { const m = $('message'); m.innerHTML = html; m.classList.add('show'); msgTimer = dur; }
function feed(text) {
  const d = document.createElement('div'); d.textContent = text; $('pickup-feed').appendChild(d);
  setTimeout(() => d.remove(), 2300);
}
function hitmark(head) {
  const h = $('hitmarker'); h.classList.toggle('head', head); h.classList.add('show'); fx.hitT = 0.12;
}
function updateHUD(dt) {
  setText('wave', String(wave.n)); setText('kills', String(player.kills)); setText('score', String(player.score));
  setText('mag', String(player.mag)); setText('reserve', String(player.reserve)); setText('hptext', String(Math.ceil(player.hp)));
  $('hpfill').style.width = player.hp + '%';
  $('stamfill').style.width = (player.stamina * 100).toFixed(0) + '%';
  $('ammo').classList.toggle('low', player.mag <= 3);
  $('reload-hint').classList.toggle('hidden', !(player.mag === 0 && player.reloading <= 0 && player.reserve > 0));
  const low = player.hp < 35 ? 0.35 + Math.sin(performance.now() / 250) * 0.12 : 0;
  $('hurt').style.opacity = Math.max(low, fx.hurt).toFixed(2);
  const gap = 6 + (fx.bloom + (input.moveLen > 0.1 ? 0.012 : 0) + fx.sprint * 0.04) * 600;
  $('crosshair').style.setProperty('--gap', gap.toFixed(1) + 'px');
  if (fx.hitT > 0) { fx.hitT -= dt; if (fx.hitT <= 0) $('hitmarker').classList.remove('show'); }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('message').classList.remove('show'); }
}

// ---------------------------------------------------------------- per-frame player update
function updatePlayer(dt) {
  player.time += dt;
  player.yaw -= input.lookDX; player.pitch -= input.lookDY;
  fx.swayX += input.lookDX * 0.5; fx.swayY += input.lookDY * 0.5;
  input.lookDX = input.lookDY = 0;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));

  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (input.tx || input.tz) { mx += input.tx; mz += input.tz; }
  let len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; len = 1; }
  input.moveLen = len;
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || player.sprintToggle) && mz < -0.3 && player.reloading <= 0;
  const sprinting = wantSprint && player.stamina > 0.05;
  player.stamina = Math.max(0, Math.min(1, player.stamina + (sprinting ? -0.22 : 0.15) * dt));
  if (player.stamina <= 0.05 && player.sprintToggle) { player.sprintToggle = false; $('btn-sprint').classList.remove('active'); }
  fx.sprint += ((sprinting ? 1 : 0) - fx.sprint) * Math.min(1, dt * 8);
  const speed = sprinting ? 5.6 : 3.3;
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  player.pos.x += (mx * c + mz * s) * speed * dt;
  player.pos.z += (-mx * s + mz * c) * speed * dt;
  collide(player.pos, 0.35);

  if (len > 0.1) {
    const prev = Math.sin(fx.bobT);
    fx.bobT += dt * speed * 2.1;
    if (prev < 0 && Math.sin(fx.bobT) >= 0 || prev > 0 && Math.sin(fx.bobT) <= 0) sfx.click(140 + Math.random() * 60, sprinting ? 0.3 : 0.18);
  } else fx.bobT += (Math.round(fx.bobT / Math.PI) * Math.PI - fx.bobT) * Math.min(1, dt * 6);

  player.cd -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) {
      const n = Math.min(MAG - player.mag, player.reserve);
      player.mag += n; player.reserve -= n; player.reloading = 0;
    }
  }
  if (input.firing && (isTouch ? player.cd <= -0.12 : false)) fire();
  if (player.mag === 0 && player.reserve > 0 && player.reloading <= 0 && player.cd <= -0.15) startReload();

  fx.recoil = Math.max(0, fx.recoil - dt * 9);
  fx.recoilPitch *= Math.exp(-dt * 9);
  fx.bloom = Math.max(0, fx.bloom - dt * 0.05);
  fx.shake = Math.max(0, fx.shake - dt);
  fx.hurt = Math.max(0, fx.hurt - dt * 1.6);
}

function placeCamera(dt) {
  const bob = Math.sin(fx.bobT * 2) * 0.035 * Math.min(1, input.moveLen + 0.0001);
  const side = Math.cos(fx.bobT) * 0.025 * Math.min(1, input.moveLen);
  const sh = fx.shake * 0.12;
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const third = view === 'third' && avatar.ok;
  camera.rotation.set(player.pitch + fx.recoilPitch + (Math.random() - .5) * sh, player.yaw + (Math.random() - .5) * sh, (Math.random() - .5) * sh * 0.5 + (third ? 0 : Math.cos(fx.bobT) * 0.004));
  if (third) {
    // over the right shoulder, pulled in when a wall or ceiling is in the way
    camera.getWorldDirection(fwd);
    const px = player.pos.x, py = 1.55 - (state === 'dead' ? Math.min(1.1, (player.deadT || 0) * 1.5) : 0), pz = player.pos.z;
    const portrait = camera.aspect < 1;
    const back = (portrait ? 3.1 : 2.4) - fx.sprint * 0.3, side = portrait ? 0.5 : 0.85, up = portrait ? 0.22 : 0.2;
    const dx = right.x * side - fwd.x * back, dy = up - fwd.y * back, dz = right.z * side - fwd.z * back;
    let t = 1;
    for (let k = 1; k <= 24; k++) {
      const f = k / 24;
      if (cameraBlocked(px + dx * f, py + dy * f, pz + dz * f)) { t = Math.max(0.12, f - 1 / 24 - 0.04); break; }
    }
    camT = t < camT ? t : camT + (t - camT) * Math.min(1, dt * 5);
    camera.position.set(px + dx * camT, py + dy * camT + bob * 0.3, pz + dz * camT);
  } else {
    const eye = state === 'dead' ? Math.max(0.4, 1.62 - (player.deadT || 0) * 2.5) : 1.62;
    camera.position.set(player.pos.x + right.x * side, eye + bob, player.pos.z + right.z * side);
  }
  const relK = player.reloading > 0 ? Math.sin((1 - player.reloading / RELOAD_TIME) * Math.PI) : 0;
  avatar.update(dt, {
    visible: third && camT > 0.3, x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch,
    move: Math.min(1, input.moveLen), sprint: fx.sprint, recoil: fx.recoil, reload: relK, hurt: fx.hurt,
    flash: fx.flashT > 0, dead: state === 'dead', deadT: player.deadT || 0,
  });

  // viewmodel
  fx.swayX *= Math.exp(-dt * 10); fx.swayY *= Math.exp(-dt * 10);
  const rel = player.reloading > 0 ? Math.sin((1 - player.reloading / RELOAD_TIME) * Math.PI) : 0;
  const b = vm.base;
  const portrait = camera.aspect < 1;
  vm.root.position.set(
    (portrait ? 0.075 : b.x) + fx.swayX * 0.4 + Math.cos(fx.bobT) * 0.012 * input.moveLen + fx.sprint * 0.04,
    (portrait ? -0.2 : b.y) + Math.abs(Math.sin(fx.bobT)) * 0.012 * input.moveLen + fx.swayY * 0.3 - rel * 0.12 - fx.sprint * 0.05 + fx.recoil * 0.008,
    b.z + fx.recoil * 0.05);
  vm.root.rotation.set(fx.recoil * 0.28 - rel * 0.5 + fx.swayY * 0.6 - fx.sprint * 0.2, fx.swayX * 0.8 + fx.sprint * 0.5, rel * 0.7 + fx.swayX * 0.5);
  vm.slide.position.z = Math.min(1, fx.recoil * 1.6) * 0.03 + (player.mag === 0 && player.reloading <= 0 ? 0.03 : 0);
  const fl = fx.flashT > 0;
  vm.flashSprite.visible = vm.flame.visible = fl;
  if (fl) { vm.flashSprite.material.rotation = Math.random() * 6; vm.flashSprite.scale.setScalar(0.1 + Math.random() * 0.08); vm.flame.scale.set(1, 0.7 + Math.random() * 0.6, 1); }
  vm.flash.position.set(vm.root.position.x, vm.root.position.y + 0.05, vm.root.position.z - 0.15);
  vm.flash.intensity = fl ? 3 : 0;
  camera.getWorldDirection(fwd);
  if (third) avatar.muzzle(muzzleLight.position);
  else muzzleLight.position.copy(camera.position).addScaledVector(fwd, 0.7);
  muzzleLight.intensity = fl ? 28 : 0;
  fx.flashT -= dt;

  moon.position.set(player.pos.x - 18, 40, player.pos.z + 14);
  moon.target.position.set(player.pos.x, 0, player.pos.z);
  sfx.setListener(camera.position, fwd);
}

const MANOR = { x0: -14, x1: 14, z0: -40, z1: -12 };
function cameraBlocked(x, y, z) {
  if (y < 0.15) return true;
  if (y > 3.15 && x > MANOR.x0 && x < MANOR.x1 && z > MANOR.z0 && z < MANOR.z1) return true;
  const r = 0.18;
  for (const s of world.solids) {
    if (x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r && y < (s.h ?? 3.4)) return true;
  }
  return false;
}

function updateLights(t) {
  for (const f of world.flickers) {
    let n = Math.sin(t * 13 + f.seed) * 0.5 + Math.sin(t * 31.7 + f.seed * 2) * 0.3 + Math.sin(t * 5.3 + f.seed) * 0.2;
    let k = 1 - f.amt * (0.5 + 0.5 * n) * 0.5;
    if (f.amt >= 0.5 && Math.sin(t * 2.1 + f.seed) > 0.85 && Math.random() < 0.5) k = 0.05; // dying bulb
    f.light.intensity = f.base * k;
  }
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = gunCam.aspect = w / h;
  camera.fov = w / h < 1 ? 82 : 70;
  gunCam.fov = w / h < 1 ? 62 : 50;
  camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (state === 'play') {
    updatePlayer(dt);
    updateWaves(dt);
    updateZombies(dt);
    updatePickups(dt);
    updateHUD(dt);
  } else if (state === 'dead') {
    updateZombies(dt);
    fx.recoilPitch = 0;
    player.pitch += (0.4 - player.pitch) * dt * 2;
    fx.shake = 0;
    player.deadT = (player.deadT || 0) + dt;
  } else if (state === 'menu') {
    player.yaw = Math.sin(t * 0.1) * 0.25; player.pitch = 0.05 + Math.sin(t * 0.13) * 0.03;
  }
  if (state !== 'paused') { blood.update(dt); dust.update(dt); }
  updateLights(t);
  placeCamera(state === 'paused' ? 0 : dt);
  renderer.clear();
  renderer.render(scene, camera);
  if (state !== 'dead' && !(view === 'third' && avatar.ok)) { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
}
resetGame();
const playBtn = $('play');
playBtn.disabled = true; playBtn.textContent = 'LOADING…';
loadModels(window.MODEL_BASE || 'models/')
  .catch(err => console.warn('Character models failed to load; using fallback zombies.', err))
  .finally(() => { avatar.init(); playBtn.disabled = false; playBtn.textContent = 'ENTER THE ESTATE'; window.__modelsReady = true; });
$('hud').classList.add('hidden');
$('message').classList.remove('show');
requestAnimationFrame(frame);

// debug/test hook
window.__game = { get state() { return state; }, player, vm, camera, get zombies() { return zombies; }, wave, fire, spawnZombie, computeField, rebuild: () => rebuildTargets(),
  step(dt, n) { for (let i = 0; i < n; i++) { updatePlayer(dt); updateWaves(dt); updateZombies(dt); updatePickups(dt); } } };
