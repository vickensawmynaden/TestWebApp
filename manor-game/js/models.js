// Loads the three character meshes and gives them a procedural "rig": the models ship without
// skeletons, so legs and arms are swung in the vertex shader around hip/shoulder pivots chosen
// from each mesh's proportions. Each zombie gets its own material clone with its own uniforms.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Model-space measurements (metres, model faces +Z, feet at y=0).
export const RIGS = {
  walker: {
    file: 'lawman', scale: 0.95, radius: 0.3, tint: 0xb4bea6,
    hipY: 0.72, shoulderY: 1.45, armX: 0.31, armMinY: 0.62,
    body: { c: [0, 0.82, 0], s: [0.62, 1.5, 0.42] }, head: { c: [0, 1.72, 0.03], s: [0.32, 0.36, 0.34] },
  },
  runner: {
    file: 'werewolf', scale: 0.98, radius: 0.4, tint: 0xffffff,
    hipY: 0.74, shoulderY: 1.38, armX: 0.5, armMinY: 0.24,
    body: { c: [0, 0.85, 0.05], s: [1.1, 1.4, 0.8] }, head: { c: [0, 1.7, 0.3], s: [0.5, 0.45, 0.66] },
  },
  brute: {
    file: 'ogre', scale: 0.9, radius: 0.62, tint: 0xffffff,
    hipY: 0.72, shoulderY: 1.75, armX: 0.74, armMinY: 0.42,
    body: { c: [0, 1.0, 0], s: [1.8, 1.95, 1.1] }, head: { c: [0, 2.24, 0.14], s: [0.66, 0.52, 0.62] },
  },
};

const loaded = {};

export async function loadModels(base = 'models/') {
  const loader = new GLTFLoader();
  const entries = Object.entries(RIGS);
  await Promise.all(entries.map(async ([type, rig]) => {
    const gltf = await loader.loadAsync(`${base}${rig.file}.glb`);
    let mesh = null;
    gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) throw new Error(`no mesh in ${rig.file}`);
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingSphere();
    const src = mesh.material;
    if (src.map) { src.map.colorSpace = THREE.SRGBColorSpace; src.map.anisotropy = 4; }
    loaded[type] = { geo, map: src.map };
  }));
  return true;
}

export function hasModel(type) { return !!loaded[type]; }

const CHUNK = /* glsl */`
  vec3 rigP = position;
  // arms: pivot at shoulder height, swung about X
  float armMask = smoothstep(uArmX - 0.07, uArmX + 0.05, abs(rigP.x))
                * smoothstep(uArmMinY - 0.05, uArmMinY + 0.08, rigP.y)
                * (1.0 - smoothstep(uShoulderY - 0.12, uShoulderY + 0.06, rigP.y));
  float aA = (rigP.x > 0.0 ? uArmR : uArmL) * armMask;
  float aC = cos(aA), aS = sin(aA);
  vec2 ayz = vec2(rigP.y - uShoulderY, rigP.z);
  rigP.y = uShoulderY + ayz.x * aC - ayz.y * aS;
  rigP.z = ayz.x * aS + ayz.y * aC;
  // legs: pivot at hip, left/right swing in opposite directions
  float legMask = (1.0 - smoothstep(uHipY - 0.18, uHipY + 0.04, position.y)) * (1.0 - armMask);
  float side = clamp(position.x / 0.07, -1.0, 1.0);
  float lA = uLeg * side * legMask;
  float lC = cos(lA), lS = sin(lA);
  vec2 lyz = vec2(rigP.y - uHipY, rigP.z);
  rigP.y = uHipY + lyz.x * lC - lyz.y * lS;
  rigP.z = lyz.x * lS + lyz.y * lC;
  vec3 transformed = rigP;
`;

export function makeModelMesh(type) {
  const rig = RIGS[type], src = loaded[type];
  const u = {
    uLeg: { value: 0 }, uArmL: { value: 0 }, uArmR: { value: 0 },
    uHipY: { value: rig.hipY }, uShoulderY: { value: rig.shoulderY }, uArmX: { value: rig.armX }, uArmMinY: { value: rig.armMinY },
  };
  const mat = new THREE.MeshStandardMaterial({ map: src.map, color: rig.tint, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uLeg, uArmL, uArmR, uHipY, uShoulderY, uArmX, uArmMinY;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', CHUNK);
  };
  mat.customProgramCacheKey = () => 'zrig';
  const mesh = new THREE.Mesh(src.geo, mat);
  mesh.castShadow = true;
  return { mesh, u, rig };
}
