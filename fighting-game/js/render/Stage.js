// "Sunset Temple Courtyard": stone arena with low walls, gate architecture, lanterns, embers.
import * as THREE from 'three';
import { ARENA_HALF } from '../sim/constants.js';
import { floorTextures, emblemTexture, skyTexture, radialSprite, noiseTexture } from './textures.js';

export class Stage {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.time = 0;
    this.buildSky();
    this.buildFloor();
    this.buildWalls();
    this.buildArchitecture();
    this.buildLights(quality);
    this.buildEmbers();
    scene.fog = new THREE.FogExp2(0x1b1420, 0.018);
  }

  buildSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.y = -10;
    this.group.add(sky);
    // Sun disc low on the horizon
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(255,200,140,1)', 'rgba(255,120,60,0)', 128), color: 0xffffff, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    sun.scale.set(40, 40, 1); sun.position.set(-60, 8, -100);
    this.group.add(sun);
    // Distant mountains (layered silhouettes)
    const mtn = (radius, height, color, count, seed) => {
      const geo = new THREE.CylinderGeometry(radius, radius, height, count, 1, true);
      const pos = geo.attributes.position;
      let s = seed;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) { s = (s * 9301 + 49297) % 233280; pos.setY(i, height / 2 * (0.3 + (s / 233280) * 0.9)); }
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false }));
      m.position.y = height / 2 - 4;
      this.group.add(m);
    };
    mtn(110, 34, 0x140f1a, 48, 11);
    mtn(90, 22, 0x0d0a12, 64, 23);
  }

  buildFloor() {
    const { map, rough } = floorTextures();
    const size = ARENA_HALF * 2;
    const floorMat = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.85, metalness: 0.15, envMapIntensity: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    // Outer courtyard
    const outerTex = noiseTexture(256, 4, 50, 70); outerTex.repeat.set(20, 20); outerTex.colorSpace = THREE.SRGBColorSpace;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x3a3236, map: outerTex, roughness: 0.95 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.6; outer.receiveShadow = true;
    this.group.add(outer);
    // Raised platform sides
    const side = new THREE.Mesh(new THREE.BoxGeometry(size + 1.2, 0.6, size + 1.2), new THREE.MeshStandardMaterial({ color: 0x2b2528, roughness: 0.9 }));
    side.position.y = -0.31; side.receiveShadow = true;
    this.group.add(side);
    // Emblem
    const emb = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, roughness: 0.4, metalness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    emb.rotation.x = -Math.PI / 2; emb.position.y = 0.003; emb.receiveShadow = true;
    this.group.add(emb);
  }

  buildWalls() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4246, roughness: 0.82, metalness: 0.05, bumpMap: noiseTexture(128, 31, 80), bumpScale: 2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2e3036, metalness: 0.9, roughness: 0.28 });
    const neonA = new THREE.MeshStandardMaterial({ color: 0x3a7bff, emissive: 0x3a7bff, emissiveIntensity: 2.2 });
    const neonB = new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0xff3a3a, emissiveIntensity: 2.2 });
    const L = ARENA_HALF * 2 + 0.6, h = 0.95, th = 0.3, off = ARENA_HALF + th / 2;
    const defs = [[0, off, 0, neonA], [0, -off, 0, neonB], [off, 0, Math.PI / 2, neonA], [-off, 0, Math.PI / 2, neonB]];
    for (const [x, z, ry, neon] of defs) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(L, h, th), stone); wall.position.y = h / 2; wall.castShadow = wall.receiveShadow = true; g.add(wall);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, th + 0.08), metal); rail.position.y = h + 0.03; rail.castShadow = true; g.add(rail);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, 0.025, 0.02), neon); strip.position.set(0, 0.12, th / 2 + 0.01); g.add(strip);
      const strip2 = strip.clone(); strip2.position.z = -th / 2 - 0.01; g.add(strip2);
      this.group.add(g);
    }
    // Corner pillars with lanterns
    this.lanterns = [];
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 2.6, 12);
    const capGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 12);
    const lantGeo = new THREE.SphereGeometry(0.22, 16, 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, stone); p.position.set(sx * (ARENA_HALF + 0.35), 1.3, sz * (ARENA_HALF + 0.35)); p.castShadow = true; this.group.add(p);
      const c = new THREE.Mesh(capGeo, metal); c.position.set(p.position.x, 2.65, p.position.z); this.group.add(c);
      const lm = new THREE.MeshStandardMaterial({ color: 0xffb36b, emissive: 0xff8a3a, emissiveIntensity: 2.5, roughness: 0.6 });
      const l = new THREE.Mesh(lantGeo, lm); l.position.set(p.position.x, 2.98, p.position.z); l.scale.y = 1.3; this.group.add(l);
      this.lanterns.push(lm);
    }
  }

  buildArchitecture() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a1414, roughness: 0.65 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1a1f, roughness: 0.7 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x3b3438, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.5, metalness: 0.4 });
    // Great gate behind the arena
    const gate = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9, 14), wood); post.position.set(s * 5, 4.5, 0); post.castShadow = true; gate.add(post);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.8, 14), stone); base.position.set(s * 5, 0.4, 0); gate.add(base);
    }
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.7, 0.9), wood); beam1.position.y = 8.6; gate.add(beam1);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 0.7), dark); beam2.position.y = 7.1; gate.add(beam2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 2.2), roofMat); roof.position.y = 9.15; gate.add(roof);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xcc9a3a, emissiveIntensity: 0.25 })); plaque.position.y = 7.85; gate.add(plaque);
    gate.position.set(0, 0, -18);
    this.group.add(gate);
    // Pagodas left and right
    const pagoda = (x, z, s) => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const w = (5 - i * 0.9) * s;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2.1 * s, w * 0.7), i % 2 ? wood : dark); body.position.y = (i * 2.6 + 1.05) * s; g.add(body);
        const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 0.9 * s, 4), roofMat); r.position.y = (i * 2.6 + 2.4) * s; r.rotation.y = Math.PI / 4; g.add(r);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.6 * s, 0.05), new THREE.MeshStandardMaterial({ color: 0xffa860, emissive: 0xff8a3a, emissiveIntensity: 1.6 }));
        glow.position.set(0, (i * 2.6 + 1.1) * s, w * 0.35 + 0.03); g.add(glow);
      }
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 3 * s, 6), roofMat); spire.position.y = 11.8 * s; g.add(spire);
      g.position.set(x, 0, z);
      g.lookAt(0, 0, 0);
      this.group.add(g);
    };
    pagoda(-24, -26, 1.3); pagoda(26, -22, 1.1); pagoda(-34, 14, 1.0); pagoda(30, 24, 1.2);
    // Stone stairs and lantern posts around the courtyard
    const postGeo = new THREE.BoxGeometry(0.4, 1.4, 0.4);
    const lampGeo = new THREE.BoxGeometry(0.55, 0.5, 0.55);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc080, emissive: 0xff9040, emissiveIntensity: 2.0 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 13 + (i % 2) * 2;
      const post = new THREE.Mesh(postGeo, stone); post.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r); this.group.add(post);
      const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(post.position.x, 1.05, post.position.z); this.group.add(lamp);
    }
    // Cherry trees (stylised): trunk + canopy blobs
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xc8506e, roughness: 0.8, emissive: 0x3a0a18, emissiveIntensity: 0.4 });
    const blob = new THREE.IcosahedronGeometry(1.4, 1);
    for (const [x, z] of [[-14, -14], [15, -15], [-17, 9], [18, 11], [-9, -20], [10, -21]]) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 4, 8), trunkMat); tr.position.set(x, 1.4, z); tr.rotation.z = 0.15; this.group.add(tr);
      for (let k = 0; k < 4; k++) {
        const l = new THREE.Mesh(blob, leafMat);
        l.position.set(x + Math.sin(k * 2.1) * 1.2, 4 + Math.cos(k * 1.3) * 0.6, z + Math.cos(k * 2.1) * 1.2);
        l.scale.setScalar(0.9 + (k % 2) * 0.4);
        this.group.add(l);
      }
    }
  }

  buildLights(quality) {
    const hemi = new THREE.HemisphereLight(0x7d8cc4, 0x2a1a1c, 0.55);
    this.group.add(hemi);
    const key = new THREE.DirectionalLight(0xffd0a0, 2.4);
    key.position.set(-8, 12, 6);
    key.castShadow = true;
    const sm = quality === 'high' ? 2048 : 1024;
    key.shadow.mapSize.set(sm, sm);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    this.key = key;
    this.group.add(key); this.group.add(key.target);
    const rimBlue = new THREE.DirectionalLight(0x5b86ff, 1.3); rimBlue.position.set(8, 5, -9); this.group.add(rimBlue);
    const rimRed = new THREE.DirectionalLight(0xff5a4a, 0.9); rimRed.position.set(-9, 4, -8); this.group.add(rimRed);
    this.fill = new THREE.PointLight(0xff9a50, 6, 18, 1.6); this.fill.position.set(0, 4, 4); this.group.add(this.fill);
  }

  buildEmbers() {
    const n = 220;
    const pos = new Float32Array(n * 3);
    this.emberSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.emberSeeds[i * 3] = (Math.random() - 0.5) * 30;
      this.emberSeeds[i * 3 + 1] = Math.random() * 10;
      this.emberSeeds[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.07, map: radialSprite('rgba(255,190,120,1)', 'rgba(255,90,30,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffaa66 });
    this.embers = new THREE.Points(g, m);
    this.group.add(this.embers);
    this.updateEmbers(0);
  }

  updateEmbers(t) {
    const p = this.embers.geometry.attributes.position.array, s = this.emberSeeds;
    for (let i = 0; i < s.length / 3; i++) {
      const y = (s[i * 3 + 1] + t * (0.25 + (i % 7) * 0.05)) % 10;
      p[i * 3] = s[i * 3] + Math.sin(t * 0.5 + i) * 0.6;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = s[i * 3 + 2] + Math.cos(t * 0.4 + i * 1.3) * 0.6;
    }
    this.embers.geometry.attributes.position.needsUpdate = true;
  }

  // Follow the fighters with the shadow camera for crisp shadows.
  update(dt, center) {
    this.time += dt;
    this.updateEmbers(this.time);
    const flick = 2.3 + Math.sin(this.time * 13) * 0.2 + Math.sin(this.time * 7.3) * 0.2;
    for (const l of this.lanterns) l.emissiveIntensity = flick;
    if (center) {
      this.key.target.position.set(center.x, 0, center.z);
      this.key.position.set(center.x - 8, 12, center.z + 6);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
  }
}

// Scene used to bake reflections (PMREM) so metal and polished stone reflect a sunset sky.
export function buildEnvScene() {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide }));
  s.add(sky);
  const panel = (color, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(0xffc890, -6, 3, -5, 4, 3);
  panel(0x6080ff, 6, 2, -5, 3, 2);
  panel(0xff6050, -5, 2, 6, 2, 2);
  return s;
}
