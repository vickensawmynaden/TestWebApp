// Human zombies: rigged, animated characters (three.js example assets) turned into the walking
// dead. Each zombie gets its own skeleton clone and animation mixer, a "rot" shader (desaturated
// grey-green skin, blood stains, grime) and a head-pop cut driven by the head bones' skin weights.
// After the walk/run clip is applied each frame, bones are bent into a zombie gait: arms reaching
// forward, a hunched spine and a lolling head.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from './models.js';

const SRC = {};
let ready = false;

export async function loadHumans(base = 'models/') {
  const [sol, wom] = await Promise.all([loadGltf(base, 'zombie_soldier'), loadGltf(base, 'zombie_woman')]);
  const byName = n => sol.animations.find(a => a.name === n);
  SRC.soldier = prep(sol.scene, { walk: byName('Walk'), run: byName('Run'), idle: byName('Idle') }, ['vanguard_visor']);
  // the second body's bones don't match the clips, so its gait is posed procedurally (see zombie.js)
  SRC.woman = prep(wom.scene, null, []);
  ready = true;
}
function prep(scene, clips, hide) {
  scene.traverse(o => { if (hide.includes(o.name)) o.visible = false; });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  return { scene, clips, height: box.max.y - box.min.y, minY: box.min.y };
}
export const hasHumans = () => ready;

const ROT = /* glsl */`
float zh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float zn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zh(i), zh(i + vec3(1, 0, 0)), f.x), mix(zh(i + vec3(0, 1, 0)), zh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(zh(i + vec3(0, 0, 1)), zh(i + vec3(1, 0, 1)), f.x), mix(zh(i + vec3(0, 1, 1)), zh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

function zombify(src, mesh, u) {
  const mat = src.clone();
  if (mat.map) { mat.map.colorSpace = THREE.SRGBColorSpace; }
  mat.roughness = 0.85; mat.metalness = 0;
  const bones = mesh.skeleton ? mesh.skeleton.bones : [];
  const idx = n => bones.findIndex(b => b.name.replace(/[^A-Za-z0-9]/g, '').endsWith(n));
  const headBones = new THREE.Vector4(idx('HeadTopEnd'), idx('Head'), idx('LeftEye'), idx('RightEye'));
  mesh.geometry.computeBoundingBox();
  const gb = mesh.geometry.boundingBox;
  const local = {
    uHeadBones: { value: headBones },
    uNoiseScale: { value: 1 / Math.max(1e-3, gb.max.y - gb.min.y) },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u, local);
    sh.vertexShader = 'uniform vec4 uHeadBones;\nvarying vec3 vZPos;\nvarying float vHeadW;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vZPos = position;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
  vHeadW = 0.0;
  #ifdef USE_SKINNING
  for (int i = 0; i < 4; i++) {
    float b = skinIndex[i];
    if (abs(b - uHeadBones.x) < 0.5 || abs(b - uHeadBones.y) < 0.5 || abs(b - uHeadBones.z) < 0.5 || abs(b - uHeadBones.w) < 0.5) vHeadW += skinWeight[i];
  }
  #endif`);
    sh.fragmentShader = 'uniform float uHeadless, uBlood, uNoiseScale;\nuniform vec3 uTint;\nvarying vec3 vZPos;\nvarying float vHeadW;\n' + ROT + '\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n  if (uHeadless > 0.5 && vHeadW > 0.45) discard;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 zp = vZPos * uNoiseScale;
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 c = mix(vec3(pow(lum, 0.85)) * uTint, diffuseColor.rgb * uTint, 0.06) * 0.78;
    float bruise = smoothstep(0.55, 0.75, zn(zp * 13.0 + 1.3));
    c = mix(c, c * vec3(0.55, 0.45, 0.6), bruise * 0.6);
    vec3 sp = zp * vec3(9.0, 2.2, 9.0);
    float n = zn(sp) * 0.55 + zn(sp * 2.7) * 0.3 + zn(zp * 47.0) * 0.15;
    float stain = smoothstep(0.69 - uBlood, 0.75 - uBlood, n);
    c = mix(c, vec3(0.15, 0.006, 0.002), stain * 0.92);
    float wet = smoothstep(0.84 - uBlood * 0.5, 0.88 - uBlood * 0.5, zn(zp * 11.0 + 3.1));
    c = mix(c, vec3(0.12, 0.0, 0.0), wet * 0.8);
    c *= 0.6 + 0.45 * zn(zp * 70.0);
    c = mix(c, c * vec3(0.55, 0.5, 0.42), smoothstep(0.45, 0.7, zn(zp * 5.0 + 7.7)));
    diffuseColor.rgb = c;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.25, smoothstep(0.75, 0.8, zn(vZPos * uNoiseScale * 11.0 + 3.1)));');
  };
  mat.customProgramCacheKey = () => 'zhuman';
  return mat;
}

const TINTS = [[0.78, 0.86, 0.7], [0.82, 0.82, 0.74], [0.72, 0.8, 0.72], [0.86, 0.8, 0.72]];
const zHitMat = new THREE.MeshBasicMaterial({ visible: false });
const zGoreMat = new THREE.MeshStandardMaterial({ color: 0x4a0706, roughness: 0.35 });

export function makeHuman(kind = SRC.woman && Math.random() < 0.5 ? 'woman' : 'soldier') {
  const S = SRC[kind];
  const model = SkeletonUtils.clone(S.scene);
  const holder = new THREE.Group();
  const scale = 1.72 * (0.93 + Math.random() * 0.12) / S.height;
  holder.scale.setScalar(scale);
  model.position.y = -S.minY;
  holder.add(model);
  const t = TINTS[Math.floor(Math.random() * TINTS.length)];
  const u = { uHeadless: { value: 0 }, uBlood: { value: Math.random() * 0.07 }, uTint: { value: new THREE.Color(...t) } };
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = zombify(o.material, o, u);
    o.castShadow = true; o.frustumCulled = false;
  });
  const bone = n => { let b = null; model.traverse(o => { if (!b && o.isBone && o.name.replace(/[^A-Za-z0-9]/g, '').endsWith(n)) b = o; }); return b; };
  const bones = {
    hips: bone('Hips'), spine: bone('Spine'), spine2: bone('Spine2'), neck: bone('Neck'), head: bone('Head'),
    lArm: bone('LeftArm'), rArm: bone('RightArm'), lFore: bone('LeftForeArm'), rFore: bone('RightForeArm'),
    lUp: bone('LeftUpLeg'), rUp: bone('RightUpLeg'), lLeg: bone('LeftLeg'), rLeg: bone('RightLeg'), lFoot: bone('LeftFoot'), rFoot: bone('RightFoot'),
  };
  const rest = new Map();
  model.traverse(o => { if (o.isBone) rest.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
  let mixer = null; const actions = {};
  if (S.clips) {
    mixer = new THREE.AnimationMixer(model);
    for (const k of ['walk', 'run', 'idle']) { actions[k] = mixer.clipAction(S.clips[k]); actions[k].time = Math.random() * S.clips[k].duration; }
  }
  return { holder, model, mixer, actions, bones, rest, u, kind, procedural: !S.clips };
}

// ---- bone helpers (work in world space, so they don't depend on each rig's local axes) ----
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _ax = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
export function aimBone(bone, dirWorld, w) {
  if (!bone || w <= 0) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(false, false);
  bone.getWorldQuaternion(_q1);
  const child = bone.children.find(c => c.isBone);
  _v.copy(child && child.position.lengthSq() > 1e-8 ? child.position : Y).normalize().applyQuaternion(_q1);
  _q2.setFromUnitVectors(_v, dirWorld).multiply(_q1);
  bone.parent.getWorldQuaternion(_q3).invert().multiply(_q2);
  bone.quaternion.slerp(_q3, w);
  bone.updateMatrixWorld(true);
}
export function turnBone(bone, axisWorld, angle) {
  if (!bone || !angle) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_q1);
  _ax.copy(axisWorld).applyQuaternion(_q1.invert()).normalize();
  _q2.setFromAxisAngle(_ax, angle);
  bone.quaternion.premultiply(_q2);
  bone.updateMatrixWorld(true);
}
export function attachBox(bone, size, offset) {
  // size/offset are in metres; bones are often in centimetre-scaled armatures
  bone.updateWorldMatrix(true, false);
  const s = bone.getWorldScale(_v).x;
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0] / s, size[1] / s, size[2] / s), zHitMat);
  m.position.set(offset[0] / s, offset[1] / s, offset[2] / s);
  bone.add(m);
  return m;
}
export function addStump(bone) {
  bone.updateWorldMatrix(true, false);
  const s = bone.getWorldScale(_v).x;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075 / s, 0.09 / s, 0.04 / s, 10), zGoreMat);
  m.position.y = 0.06 / s;
  bone.add(m);
}
