// The player's Lawman, seen in third person. The mesh is unrigged, so the same vertex-shader rig
// as the monsters swings his legs and raises his right arm to point the pistol where you aim.
import * as THREE from 'three';
import { hasModel, makeModelMesh } from './models.js';
import { radial } from './textures.js';

export function buildPistol() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.38, metalness: 0.35 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.7 });
  const B = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  B(0.034, 0.036, 0.19, steel, 0, 0.03, 0.02);
  B(0.03, 0.025, 0.17, poly, 0, 0.0, 0.01);
  B(0.031, 0.105, 0.048, poly, 0, -0.05, -0.04, 0.25);
  return g;
}

export class Avatar {
  constructor(scene) { this.scene = scene; this.ok = false; }

  init() {
    if (!hasModel('player') || this.ok) return;
    const { mesh, u, rig } = makeModelMesh('player');
    this.u = u; this.rig = rig;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.root.scale.setScalar(rig.scale);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(mesh);
    this.mesh = mesh;
    this.pistol = buildPistol();
    this.body.add(this.pistol);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,230,160,1)', 'rgba(255,120,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.position.set(0, 0.03, 0.17); this.flash.visible = false;
    this.pistol.add(this.flash);
    this.phase = 0;
    this.dir = new THREE.Vector3();
    this.scene.add(this.root);
    this.ok = true;
  }

  // the Lawman's right side is model -X; shader uniform uArmL drives arms at x < 0
  update(dt, s) {
    if (!this.ok) return;
    const { u, rig } = this;
    this.root.visible = s.visible;
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.yaw + Math.PI;
    this.phase += dt * (4 + s.sprint * 3) * s.move;
    const sw = Math.sin(this.phase);
    u.uLeg.value = sw * (0.4 + s.sprint * 0.25) * s.move;
    // aim arm: -PI/2 points straight ahead; looking up/down raises/lowers it
    let a = -Math.PI / 2 - s.pitch - s.recoil * 0.25 + s.reload * 1.1 + s.sprint * 1.0;
    if (s.dead) a = -0.3;
    u.uArmL.value = a;
    u.uArmR.value = -0.25 + sw * 0.25 * s.move - (s.dead ? 0 : 0.15);
    this.body.rotation.x = s.dead ? 0 : s.hurt * -0.15;
    this.root.rotation.x = s.dead ? -1.45 * Math.min(1, (s.deadT / 0.8) ** 2) : 0;
    // hand position follows the shader's shoulder rotation
    const armLen = 0.68;
    this.dir.set(0, -Math.cos(a), -Math.sin(a));
    this.pistol.position.set(-0.4, rig.shoulderY + this.dir.y * armLen, 0.02 + this.dir.z * armLen);
    this.pistol.quaternion.setFromUnitVectors(Z, this.dir);
    this.pistol.rotateZ(s.reload * 0.8);
    this.flash.visible = s.flash;
    if (s.flash) { this.flash.scale.setScalar(0.25 + Math.random() * 0.15); this.flash.material.rotation = Math.random() * 6; }
  }

  muzzle(out) { return this.pistol.localToWorld(out.set(0, 0.03, 0.2)); }
}
const Z = new THREE.Vector3(0, 0, 1);
