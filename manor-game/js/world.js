// The estate: fogbound grounds, a fenced perimeter, a graveyard, a shed and the manor itself.
// Every solid thing registers an axis-aligned rectangle (for collision) and, if it should stop
// bullets, its mesh in `occluders`. A coarse grid built from the rectangles drives zombie pathing.
import * as THREE from 'three';
import * as T from './textures.js';

export const WALL_H = 3.4;
export const WORLD_HALF = 48;

export function buildWorld(scene) {
  const solids = [];
  const occluders = [];
  const flickers = [];
  const r = T.rng(42);

  const tex = {
    floor: T.woodFloor(), paper: T.wallpaper(), stone: T.stone(), ground: T.ground(),
    dirt: T.dirt(), plaster: T.plaster(), rug: T.rug(), bark: T.bark(),
  };
  const M = {
    paper: new THREE.MeshStandardMaterial({ map: tex.paper, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3b2516, roughness: 0.65 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x1e120a, roughness: 0.6 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x3d1512, roughness: 1 }),
    linen: new THREE.MeshStandardMaterial({ color: 0x8c8473, roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.8 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.9, metalness: 0.3 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.9 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x5a4127, roughness: 0.9 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb860, emissiveIntensity: 3 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff7a26 }),
    grave: new THREE.MeshStandardMaterial({ map: tex.stone, color: 0x9a9890, roughness: 1 }),
  };

  // ---------- helpers ----------
  function tileUV(geo, w, d, unit) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / 4);
      if (f === 0 || f === 1) uv.setX(i, uv.getX(i) * d / unit);
      else if (f === 4 || f === 5) uv.setX(i, uv.getX(i) * w / unit);
    }
    uv.needsUpdate = true;
  }

  function addSolid(x0, z0, x1, z1) { solids.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }

  function box(w, h, d, mat, x, y, z, { solid = true, occlude = true, cast = true, rotY = 0 } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = true;
    scene.add(m);
    if (solid) addSolid(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    if (occlude) occluders.push(m);
    return m;
  }

  const T_W = 0.3;
  function wallBox(cx, cz, w, d, h, y0, outFace, inMat = M.paper, outMat = M.stone, solid = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    tileUV(geo, w, d, 2.2);
    const mats = [inMat, inMat, M.trim, M.trim, inMat, inMat];
    if (outFace != null) mats[outFace] = outMat;
    const m = new THREE.Mesh(geo, mats);
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); occluders.push(m);
    if (solid) addSolid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
    return m;
  }
  function segments(a, b, gaps) {
    const out = []; let s = a;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > s) out.push([s, g0]); s = g1; }
    if (s < b) out.push([s, b]);
    return out;
  }
  // wall running along X at fixed z
  function wallX(z, x0, x1, gaps = [], o = {}) {
    const h = o.h ?? WALL_H;
    for (const [a, b] of segments(x0 - T_W / 2, x1 + T_W / 2, gaps)) wallBox((a + b) / 2, z, b - a, T_W, h, 0, o.out, o.inMat, o.outMat);
    for (const [g0, g1] of gaps) wallBox((g0 + g1) / 2, z, g1 - g0, T_W, h - 2.3, 2.3, o.out, o.inMat, o.outMat, false);
  }
  // wall running along Z at fixed x
  function wallZ(x, z0, z1, gaps = [], o = {}) {
    const h = o.h ?? WALL_H;
    for (const [a, b] of segments(z0 - T_W / 2, z1 + T_W / 2, gaps)) wallBox(x, (a + b) / 2, T_W, b - a, h, 0, o.out, o.inMat, o.outMat);
    for (const [g0, g1] of gaps) wallBox(x, (g0 + g1) / 2, T_W, g1 - g0, h - 2.3, 2.3, o.out, o.inMat, o.outMat, false);
  }
  function plane(w, d, mat, x, y, z, faceDown = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = faceDown ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function pointLight(x, y, z, color, intensity, dist, flicker = 0) {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    if (flicker) flickers.push({ light: l, base: intensity, amt: flicker, seed: r() * 100 });
    return l;
  }
  function ceilingLamp(x, z, intensity = 9, flicker = 0.08) {
    box(0.04, 0.5, 0.04, M.metal, x, WALL_H - 0.25, z, { solid: false, occlude: false, cast: false });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 0.22, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, side: THREE.DoubleSide, emissive: 0x402a10 }));
    shade.position.set(x, WALL_H - 0.55, z); scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.lampGlow);
    bulb.position.set(x, WALL_H - 0.62, z); scene.add(bulb);
    return pointLight(x, WALL_H - 0.75, z, 0xffc387, intensity, 13, flicker);
  }
  function paintingOn(x, y, z, rotY, seed) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: T.painting(seed), roughness: 0.6 }));
    m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  }

  // ---------- ground ----------
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 });
  const groundMesh = plane(120, 120, groundMat, 0, 0, 0);
  occluders.push(groundMesh);
  tex.dirt.repeat.set(1, 20);
  plane(3, 60, new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1 }), 0, 0.01, 18);

  // ---------- manor ----------
  const X0 = -14, X1 = 14, Z0 = -40, Z1 = -12;
  tex.floor.repeat.set(7, 7);
  const floor = plane(X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.75 }), 0, 0.005, (Z0 + Z1) / 2);
  occluders.push(floor);
  const ceiling = plane(X1 - X0, Z1 - Z0, new THREE.MeshStandardMaterial({ map: tex.plaster, roughness: 1 }), 0, WALL_H, (Z0 + Z1) / 2, true);
  occluders.push(ceiling);
  // roof: slab + gable prism (outside only)
  box(X1 - X0 + 1.2, 0.35, Z1 - Z0 + 1.2, M.slate, 0, WALL_H + 0.17, (Z0 + Z1) / 2, { solid: false, occlude: false });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, X1 - X0 + 1.2, 3, 1), M.slate);
  roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 6;
  roof.scale.set(1, 1, 0.55);
  roof.position.set(0, WALL_H + 2.6, (Z0 + Z1) / 2); roof.castShadow = true; scene.add(roof);
  // chimneys
  box(1.2, 4, 1.2, M.stone, 13.2, WALL_H + 2, -15, { solid: false, occlude: false });
  box(1.2, 5, 1.2, M.stone, -9, WALL_H + 2.5, -36, { solid: false, occlude: false });

  const out = { inMat: M.paper, outMat: M.stone };
  wallX(Z1, X0, X1, [[-1.2, 1.2]], { ...out, out: 4 });
  wallX(Z0, X0, X1, [[8, 9.6]], { ...out, out: 5 });
  wallZ(X0, Z0, Z1, [[-26, -24.4]], { ...out, out: 1 });
  wallZ(X1, Z0, Z1, [[-20, -18.4]], { ...out, out: 0 });
  // central hallway
  wallZ(-2, Z0, Z1, [[-16.2, -14.6], [-25.6, -24], [-35.6, -34]]);
  wallZ(2, Z0, Z1, [[-19.6, -18], [-29.6, -28], [-37.6, -36]]);
  // room dividers
  wallX(-20, X0, -2, [[-9, -7.4]]);
  wallX(-30, X0, -2, [[-6, -4.4]]);
  wallX(-24, 2, X1, [[9, 10.6]]);
  wallX(-33, 2, X1, [[5, 6.6]]);

  // porch
  box(0.35, WALL_H, 0.35, M.stone, -2.4, WALL_H / 2, -9.6);
  box(0.35, WALL_H, 0.35, M.stone, 2.4, WALL_H / 2, -9.6);
  box(5.6, 0.25, 2.8, M.slate, 0, WALL_H, -10.6, { solid: false, occlude: false });
  pointLight(0, 2.9, -10.4, 0xffb46a, 10, 12, 0.15);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), M.lampGlow);
  lantern.position.set(0, 2.95, -11.75); scene.add(lantern);

  // hallway dressing
  tex.rug.repeat.set(1, 4);
  plane(2.0, 26, new THREE.MeshStandardMaterial({ map: tex.rug, roughness: 1 }), 0, 0.012, -26);
  ceilingLamp(0, -15.5, 7);
  ceilingLamp(0, -26, 8, 0.6); // the bad bulb
  ceilingLamp(0, -36, 7);
  paintingOn(-1.84, 1.9, -21, Math.PI / 2, 101);
  paintingOn(-1.84, 1.9, -30, Math.PI / 2, 102);
  paintingOn(1.84, 1.9, -15, -Math.PI / 2, 103);
  paintingOn(1.84, 1.9, -24, -Math.PI / 2, 104);
  paintingOn(1.84, 1.9, -33, -Math.PI / 2, 105);
  box(0.45, 0.85, 1.0, M.darkWood, -1.6, 0.43, -18.5);
  box(0.45, 0.85, 1.0, M.darkWood, 1.6, 0.43, -26);
  box(0.5, 2.2, 0.45, M.darkWood, -1.6, 1.1, -38.6); // grandfather clock
  box(0.36, 0.36, 0.05, new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.4 }), -1.6, 1.75, -38.35, { solid: false });

  // L1 dining room
  box(4, 0.08, 1.4, M.wood, -8, 0.78, -16, { solid: false });
  for (const [dx, dz] of [[-1.85, -0.6], [1.85, -0.6], [-1.85, 0.6], [1.85, 0.6]]) box(0.08, 0.74, 0.08, M.darkWood, -8 + dx, 0.37, -16 + dz, { solid: false, occlude: false });
  addSolid(-10, -16.7, -6, -15.3);
  for (let i = 0; i < 4; i++) {
    box(0.45, 0.45, 0.45, M.wood, -9.5 + i, 0.45, -17.2, { solid: false });
    box(0.45, 0.5, 0.06, M.wood, -9.5 + i, 0.95, -17.42, { solid: false, occlude: false });
    if (i !== 2) box(0.45, 0.45, 0.45, M.wood, -9.5 + i, 0.45, -14.8, { solid: false });
  }
  box(0.45, 0.45, 0.45, M.wood, -6.4, 0.23, -14.2, { solid: false, rotY: 0.9 }); // knocked over
  box(0.6, 2.3, 2.4, M.darkWood, -13.5, 1.15, -16); // cabinet
  ceilingLamp(-8, -16, 5, 0.1);

  // L2 bedroom
  box(2, 0.5, 2.3, M.darkWood, -11.6, 0.25, -26.5);
  box(1.9, 0.2, 2.1, M.linen, -11.6, 0.6, -26.4, { solid: false });
  box(2, 1.4, 0.12, M.darkWood, -11.6, 0.7, -27.7, { solid: false });
  box(1.4, 2.2, 0.6, M.darkWood, -6, 1.1, -29.4);
  box(0.6, 0.6, 0.5, M.wood, -13.3, 0.3, -21);

  // L3 library: shelves textured with book spines
  const books = T.make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1b100a'; ctx.fillRect(0, 0, w, h);
    const rr = T.rng(77);
    for (let s = 0; s < 4; s++) {
      let x = 4; const y0 = s * 64 + 6;
      while (x < w - 6) {
        const bw = 5 + rr() * 9, bh = 40 + rr() * 16;
        ctx.fillStyle = `hsl(${rr() * 360}, ${20 + rr() * 30}%, ${12 + rr() * 18}%)`;
        ctx.fillRect(x, y0 + 54 - bh, bw, bh);
        ctx.fillStyle = 'rgba(200,170,90,.35)'; ctx.fillRect(x + 1, y0 + 54 - bh + 6, bw - 2, 2);
        x += bw + 1;
      }
      ctx.fillStyle = '#2d1b0f'; ctx.fillRect(0, y0 + 54, w, 8);
    }
  });
  const shelfMats = [M.darkWood, M.darkWood, M.darkWood, M.darkWood, new THREE.MeshStandardMaterial({ map: books, roughness: 0.9 }), M.darkWood];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.5), shelfMats);
    m.position.set(-12.6 + i * 2.0, 1.3, -39.6); m.castShadow = true; scene.add(m); occluders.push(m);
    addSolid(-13.5 + i * 2.0, -39.85, -11.7 + i * 2.0, -39.35);
  }
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.5), shelfMats);
    m.position.set(-9 + i * 3.5, 1.3, -33.5); m.rotation.y = Math.PI; m.castShadow = true; scene.add(m); occluders.push(m);
    addSolid(-9.9 + i * 3.5, -33.75, -8.1 + i * 3.5, -33.25);
  }
  box(1.2, 0.75, 0.8, M.wood, -10, 0.38, -36.5);
  pointLight(-10, 1.3, -36.5, 0xffa860, 4, 7, 0.3); // reading candle
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15), M.lampGlow);
  candle.position.set(-10, 0.83, -36.5); scene.add(candle);

  // R1 parlour with fireplace
  box(0.7, 1.6, 2.4, M.stone, 13.5, 0.8, -15);
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), M.fire);
  fire.position.set(13.14, 0.4, -15); fire.rotation.y = -Math.PI / 2; scene.add(fire);
  pointLight(12.4, 0.8, -15, 0xff7a30, 14, 11, 0.45);
  box(0.9, 0.85, 2.6, M.fabric, 8.6, 0.42, -15);
  box(0.25, 0.6, 2.6, M.fabric, 8.2, 1.1, -15, { solid: false });
  box(0.9, 0.85, 0.9, M.fabric, 9.5, 0.42, -19.5, { rotY: 0.6 });
  box(1.2, 0.45, 0.7, M.wood, 11, 0.23, -15.1);
  paintingOn(13.84, 2.2, -15, -Math.PI / 2, 106);

  // R2 storage
  for (let i = 0; i < 9; i++) {
    const s = 0.6 + r() * 0.5;
    const x = 3 + r() * 10, z = -32.4 + r() * 7.6;
    if (Math.abs(z + 28.8) < 1.2 && x < 4.5) continue; // keep the door clear
    box(s, s, s, M.crate, x, s / 2, z, { rotY: r() * 0.5 });
  }

  // R3 kitchen
  box(4.5, 0.92, 0.65, M.wood, 4.8, 0.46, -39.5);
  box(0.65, 0.92, 2.8, M.wood, 13.5, 0.46, -37);
  box(1.4, 0.8, 0.9, M.darkWood, 10.5, 0.4, -35.4);
  ceilingLamp(7, -36.5, 4, 0.5);

  // ---------- grounds ----------
  // perimeter fence: stone posts + iron bars
  const L = WORLD_HALF;
  const barGeo = new THREE.BoxGeometry(0.035, 2.1, 0.035);
  const barCount = Math.floor((L * 2) / 0.22) * 4;
  const bars = new THREE.InstancedMesh(barGeo, M.metal, barCount);
  const mtx = new THREE.Matrix4();
  let bi = 0;
  for (let s = 0; s < 4; s++) {
    for (let t = -L; t < L && bi < barCount; t += 0.22) {
      const x = s === 0 ? t : s === 1 ? t : s === 2 ? -L : L;
      const z = s === 0 ? -L : s === 1 ? L : t;
      mtx.makeTranslation(x, 1.05, z);
      bars.setMatrixAt(bi++, mtx);
    }
  }
  bars.count = bi; scene.add(bars);
  for (const [x, z, w, d] of [[0, -L, 2 * L, 0.08], [0, L, 2 * L, 0.08], [-L, 0, 0.08, 2 * L], [L, 0, 0.08, 2 * L]]) {
    box(w, 0.06, d, M.metal, x, 2.0, z, { solid: false, occlude: false, cast: false });
    box(w, 0.06, d, M.metal, x, 0.3, z, { solid: false, occlude: false, cast: false });
    addSolid(x - w / 2 - 0.2, z - d / 2 - 0.2, x + w / 2 + 0.2, z + d / 2 + 0.2);
  }
  const postGeo = new THREE.BoxGeometry(0.5, 2.5, 0.5);
  const posts = new THREE.InstancedMesh(postGeo, M.stone, 64);
  let pi = 0;
  for (let t = -L; t <= L; t += 8) {
    for (const [x, z] of [[t, -L], [t, L], [-L, t], [L, t]]) { if (pi < 64) { mtx.makeTranslation(x, 1.25, z); posts.setMatrixAt(pi++, mtx); } }
  }
  posts.count = pi; posts.castShadow = true; scene.add(posts);

  // dead trees (instanced trunks + branches)
  const avoid = (x, z) =>
    (x > -19 && x < 19 && z > -45 && z < -6) || (Math.abs(x) < 4.5 && z > -8) ||
    (x > 16 && x < 40 && z > -9 && z < 26) || (x > -39 && x < -27 && z > -7 && z < 5) ||
    (Math.abs(x) < 6 && Math.abs(z) < 6) || (x > -14 && x < -6 && z > 16 && z < 24) || (x > -17 && x < -11 && z > 3 && z < 9);
  const trees = [];
  while (trees.length < 75) {
    const x = (r() * 2 - 1) * (L - 3), z = (r() * 2 - 1) * (L - 3);
    if (avoid(x, z) || trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 9)) continue;
    trees.push({ x, z, h: 5 + r() * 5 });
  }
  tex.bark.repeat.set(1, 3);
  const barkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.32, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const branchGeo = new THREE.CylinderGeometry(0.02, 0.08, 1, 5); branchGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const branches = new THREE.InstancedMesh(branchGeo, barkMat, trees.length * 9);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let bri = 0;
  trees.forEach((t, i) => {
    e.set((r() - .5) * 0.12, r() * 6, (r() - .5) * 0.12);
    q.setFromEuler(e); sc.set(1, t.h, 1); p.set(t.x, 0, t.z);
    trunks.setMatrixAt(i, mtx.compose(p, q, sc));
    const nb = 5 + Math.floor(r() * 5);
    for (let b = 0; b < nb; b++) {
      const hy = t.h * (0.35 + r() * 0.55);
      e.set((0.5 + r() * 0.7) * (r() < .5 ? -1 : 1), r() * 6.28, (r() - .5) * 0.8, 'YXZ');
      q.setFromEuler(e);
      const len = 1 + r() * 2.4 * (1 - hy / t.h + 0.3);
      sc.set(1, len, 1); p.set(t.x, hy, t.z);
      branches.setMatrixAt(bri++, mtx.compose(p, q, sc));
    }
    addSolid(t.x - 0.3, t.z - 0.3, t.x + 0.3, t.z + 0.3);
  });
  branches.count = bri;
  trunks.castShadow = branches.castShadow = true;
  scene.add(trunks, branches);
  occluders.push(trunks);

  // undergrowth
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x1d2416, roughness: 1, flatShading: true }), 90);
  for (let i = 0; i < 90; i++) {
    let x, z;
    do { x = (r() * 2 - 1) * (L - 2); z = (r() * 2 - 1) * (L - 2); } while (avoid(x, z));
    const s = 0.5 + r() * 0.9;
    sc.set(s * 1.3, s * 0.7, s); p.set(x, s * 0.25, z); q.identity();
    bushes.setMatrixAt(i, mtx.compose(p, q, sc));
  }
  scene.add(bushes);

  // graveyard
  const graveGeo = new THREE.BoxGeometry(0.65, 1, 0.16);
  const graves = new THREE.InstancedMesh(graveGeo, M.grave, 40);
  let gi = 0;
  for (let gx = 0; gx < 5; gx++) for (let gz = 0; gz < 7; gz++) {
    if (r() < 0.15) continue;
    const x = 20 + gx * 3.2 + (r() - .5) * 0.6, z = -4 + gz * 3.6 + (r() - .5) * 0.6;
    if (x > 27 && x < 34 && z < 3) continue; // mausoleum
    const h = 0.7 + r() * 0.6;
    e.set((r() - .5) * 0.25, (r() - .5) * 0.3, (r() - .5) * 0.2); q.setFromEuler(e);
    sc.set(1, h, 1); p.set(x, h / 2 - 0.05, z);
    graves.setMatrixAt(gi++, mtx.compose(p, q, sc));
    addSolid(x - 0.35, z - 0.1, x + 0.35, z + 0.1);
    // earth mound
    const mound = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.8), new THREE.MeshStandardMaterial({ map: tex.dirt, roughness: 1 }));
    mound.position.set(x, 0.05, z + 1.05); mound.receiveShadow = true; scene.add(mound);
  }
  graves.count = gi; graves.castShadow = true; scene.add(graves); occluders.push(graves);
  // mausoleum
  box(5, 3.2, 5.4, M.stone, 30.5, 1.6, -1.5);
  box(5.8, 0.4, 6.2, M.slate, 30.5, 3.4, -1.5, { solid: false });
  box(1.6, 2.2, 0.1, M.rust, 30.5, 1.1, 1.26, { solid: false });
  for (const dx of [-2.1, 2.1]) box(0.4, 3.2, 0.4, M.stone, 30.5 + dx, 1.6, 1.5);
  pointLight(30.5, 1.0, 2.6, 0x9fd0ff, 3, 6, 0.4); // eerie glow by the crypt door

  // tool shed (enterable)
  const shedO = { h: 2.6, inMat: M.crate, outMat: M.crate };
  wallX(-4, -36, -30, [], { ...shedO, out: 5 });
  wallX(2, -36, -30, [], { ...shedO, out: 4 });
  wallZ(-36, -4, 2, [], { ...shedO, out: 1 });
  wallZ(-30, -4, 2, [[-1.6, 0]], { ...shedO, out: 0 });
  box(6.6, 0.2, 6.6, M.slate, -33, 2.7, -1, { solid: false });
  box(0.6, 0.9, 2.2, M.wood, -35.3, 0.45, -1);

  // wrecked car
  const carMat = new THREE.MeshStandardMaterial({ color: 0x2a3230, roughness: 0.6, metalness: 0.5 });
  box(4.2, 0.8, 1.8, carMat, -10, 0.6, 20);
  box(2.2, 0.6, 1.6, carMat, -10.3, 1.3, 20, { solid: false });
  box(2.0, 0.5, 1.62, new THREE.MeshStandardMaterial({ color: 0x0a0d0f, roughness: 0.1, metalness: 0.9 }), -10.3, 1.3, 20, { solid: false, occlude: false });
  for (const [dx, dz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12), M.metal);
    w.rotation.x = Math.PI / 2; w.position.set(-10 + dx, 0.33, 20 + dz); scene.add(w);
  }

  // stone well
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 14), M.stone);
  well.position.set(-14, 0.45, 6); well.castShadow = true; scene.add(well); occluders.push(well);
  addSolid(-14.9, 5.1, -13.1, 6.9);

  // lamp posts along the drive
  for (const [x, z, k] of [[2.3, 10, 9], [-2.3, 28, 7]]) {
    box(0.12, 3.2, 0.12, M.metal, x, 1.6, z);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), M.lampGlow);
    g.position.set(x, 3.3, z); scene.add(g);
    pointLight(x, 3.1, z, 0xffbf7a, k, 16, 0.12);
  }

  // ---------- navigation grid ----------
  const G = 0.5, N = Math.ceil((L * 2 + 4) / G), OFF = L + 2;
  const blocked = new Uint8Array(N * N);
  const inflate = 0.3;
  for (const s of solids) {
    const i0 = Math.max(0, Math.floor((s.x0 - inflate + OFF) / G)), i1 = Math.min(N - 1, Math.floor((s.x1 + inflate + OFF) / G));
    const j0 = Math.max(0, Math.floor((s.z0 - inflate + OFF) / G)), j1 = Math.min(N - 1, Math.floor((s.z1 + inflate + OFF) / G));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) blocked[j * N + i] = 1;
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * G - OFF + G / 2, z = j * G - OFF + G / 2;
    if (Math.abs(x) > L - 0.4 || Math.abs(z) > L - 0.4) blocked[j * N + i] = 1;
  }
  const nav = { G, N, OFF, blocked };

  // spawn points: spread around the estate and inside the manor
  const spawnPoints = [
    [-40, -40], [-20, -44], [20, -44], [40, -40], [44, -20], [44, 0], [44, 30], [30, 44], [10, 44], [-10, 44],
    [-30, 44], [-44, 30], [-44, 10], [-44, -15], [24, 20], [36, 12], [-24, 30], [26, -30], [-26, -28],
    [-8, -38], [-11, -23], [11, -30], [10, -38], [-33, 0], [30, 4],
  ];
  const pickupSpots = [[-8, -18.3, 'ammo'], [-6.5, -24, 'med'], [-10, -35.2, 'ammo'], [10.8, -17.5, 'ammo'],
    [8, -27, 'med'], [12, -38, 'ammo'], [-33, -2.5, 'ammo'], [-33, 0.5, 'med'], [30.5, 3, 'ammo'], [-8, 21.6, 'ammo']];

  return { solids, occluders, flickers, nav, spawnPoints, pickupSpots };
}
