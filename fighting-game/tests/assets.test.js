// Character asset checks: every roster fighter (except the procedural bonus Kai) has a rigged GLB
// with the rest joint table, a complete humanoid skeleton and valid skin data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora'];
const BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  ...['L', 'R'].flatMap((s) => ['clavicle', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'].map((b) => `${b}_${s}`))];

function readGlb(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  const bin = buf.subarray(20 + jsonLen + 8);
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const T = { 5126: Float32Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
    return new T(bin.buffer, bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
  };
  return { json, acc };
}

for (const id of IDS) {
  test(`${id}.glb is a valid rigged character`, () => {
    const file = path.join(root, 'assets', 'characters', `${id}.glb`);
    assert.ok(fs.existsSync(file), `${file} exists`);
    assert.ok(fs.statSync(file).size < 4e6, 'under 4 MB');
    const { json, acc } = readGlb(file);
    const rig = json.scenes[0].extras.rig;
    assert.ok(rig && rig.joints && rig.lengths, 'rig extras present');
    const skin = json.skins[0];
    const names = skin.joints.map((j) => json.nodes[j].name);
    for (const b of BONES) assert.ok(names.includes(b), `bone ${b}`);
    for (const n of names) assert.ok(!n.includes('.'), `bone name ${n} survives glTF name sanitising`);
    for (const k of ['upperArm', 'foreArm', 'thigh', 'shin']) assert.ok(rig.lengths[k] > 0.08 && rig.lengths[k] < 0.7, `${k} length plausible`);
    const prim = json.meshes[0].primitives[0];
    const joints = acc(prim.attributes.JOINTS_0), weights = acc(prim.attributes.WEIGHTS_0);
    for (let v = 0; v < weights.length; v += 4) {
      const sum = weights[v] + weights[v + 1] + weights[v + 2] + weights[v + 3];
      assert.equal(sum, 255, `weights of vertex ${v / 4} sum to 1`);
      for (let k = 0; k < 4; k++) if (weights[v + k]) assert.ok(joints[v + k] < names.length, 'joint index in range');
    }
    // feet on the ground, standing upright
    const pos = json.accessors[prim.attributes.POSITION];
    assert.ok(Math.abs(pos.min[1]) < 0.01, 'soles at y = 0');
    assert.ok(pos.max[1] > 1.4 && pos.max[1] < 2.0, 'in-game height');
    assert.ok(json.images.length === 1 && json.images[0].mimeType === 'image/jpeg', 'embedded JPEG texture');
  });
}

test('asset manifest lists every character file', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));
  for (const id of IDS) {
    const e = manifest.characters.find((c) => c.fighter === id);
    assert.ok(e, `manifest entry for ${id}`);
    assert.ok(fs.existsSync(path.join(root, e.file)), `${e.file} exists`);
    assert.ok(fs.existsSync(path.join(root, e.source.file)), `${e.source.file} exists`);
  }
});
