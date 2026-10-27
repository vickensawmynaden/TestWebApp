// Input reliability, juggle limits, walls, side changes, rematch and determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMotion } from '../js/sim/commands.js';
import { World, emptyInput, BUFFER_TTL, WALL_STUN_MAX } from '../js/sim/world.js';
import { CHARACTERS, COMBOS } from '../js/sim/characters.js';
import { Match } from '../js/sim/match.js';
import { CpuAI } from '../js/sim/ai.js';
import { RouteBot, setDir } from '../js/sim/routes.js';
import { makeWorld, inp, run } from './helpers.js';
import { runRoute } from './comboHarness.js';

const entries = (dirs) => dirs.map((dir, i) => ({ dir, press: 0, held: 0, n: i + 1 }));
const QCF = [[2], [3], [6]];

test('findMotion: a newer motion is found even when an older completed motion is in the history', () => {
  // old qcf at the start, neutral, then a new qcf ending on the newest frame
  const buf = entries([2, 3, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 3, 6]);
  assert.equal(findMotion(buf, QCF, 16, 8), true);
  // only the old motion: its final step is outside the tail
  assert.equal(findMotion(entries([2, 3, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), QCF, 16, 8), false);
  // inputs at or before minN are ignored
  assert.equal(findMotion(buf, QCF, 16, 8, 14), false);
  assert.equal(findMotion(buf, QCF, 16, 8, 13), true);
});

function pressSeq(w, idx, seq, other = null) {
  for (const [d, b] of seq) { const ins = [inp(0), inp(1)]; ins[idx] = inp(idx, d, b || ''); if (other) ins[1 - idx] = other; w.step(ins); }
}

test('repeated motion commands: qcf+1 works twice in a row, and a used motion cannot fire again', () => {
  const w = makeWorld('kai', 'ren', 3.0);
  const [A] = w.fighters;
  pressSeq(w, 0, [[2], [3], [6, '1']]);
  assert.equal(A.move?.id, 'kai_qcf1');
  // During late recovery press 1 while still holding forward: the consumed motion must not repeat.
  while (A.mf < A.move.total - 4) w.step([inp(0, 6), inp(1)]);
  w.step([inp(0, 6, '1'), inp(1)]);
  run(w, 6, inp(0, 6));
  assert.notEqual(A.move?.id, 'kai_qcf1', 'old quarter-circle reused');
  run(w, 60);
  // A fresh motion fires again.
  pressSeq(w, 0, [[2], [3], [6, '1']]);
  assert.equal(A.move?.id, 'kai_qcf1', 'second qcf+1');
});

test('buffered attack: comes out on the first free frame, and is dropped by an interruption', () => {
  const w = makeWorld('ren', 'maya', 3.0);
  const [A] = w.fighters;
  pressSeq(w, 0, [[5, '4']]);
  const total = A.move.total;
  while (A.mf < total - 5) w.step([inp(0), inp(1)]);
  pressSeq(w, 0, [[5, '1']]);
  assert.equal(A.buffered?.move.id, 'ren_1');
  assert.ok(A.buffered.expires - w.frame <= BUFFER_TTL);
  run(w, 6);
  assert.equal(A.move?.id, 'ren_1', 'buffered jab came out after recovery');
  // Interruption: buffer again, then get hit before recovery ends.
  run(w, 60);
  pressSeq(w, 0, [[5, '4']]);
  while (A.mf < A.move.total - 5) w.step([inp(0), inp(1)]);
  pressSeq(w, 0, [[5, '1']]);
  assert.ok(A.buffered);
  w.setState(A, 'hit'); A.stun = 12;
  assert.equal(A.buffered, null, 'interruption drops the buffer');
  let attacked = false;
  for (let k = 0; k < 40; k++) { w.step([inp(0), inp(1)]); if (A.state === 'attack') attacked = true; }
  assert.equal(attacked, false, 'no stale attack after the interruption');
});

test('punish input near the end of blockstun comes out on the first free frame and punishes', () => {
  // Maya's df+4 launcher is -14 on block; Ren presses jab 3 frames before his blockstun ends.
  const w = makeWorld('maya', 'ren', 0.9);
  const [A, D] = w.fighters;
  const guard = () => { const i = inp(1); i.guard = true; return i; };
  w.step([inp(0, 3, '4'), guard()]);
  assert.equal(A.move.id, 'maya_df4');
  while (D.state !== 'block') w.step([inp(0), guard()]);
  while (D.t < D.stun - 3) w.step([inp(0), guard()]);
  w.step([inp(0), inp(1, 5, '1')]);
  let punished = false, firstFree = null;
  for (let k = 0; k < 40; k++) {
    w.step([inp(0), inp(1)]);
    if (firstFree === null && D.state === 'attack') firstFree = D.t;
    for (const e of w.events) if (e.type === 'hit' && e.attacker === 1) punished = true;
    w.events.length = 0;
  }
  assert.equal(D.lastMoveInfo?.id ?? D.move?.id, 'ren_1');
  assert.ok(punished, 'the buffered jab punished the launcher');
  // Too early (outside the punish window): the press is not buffered.
  const w2 = makeWorld('maya', 'ren', 0.9);
  const [A2, D2] = w2.fighters;
  w2.step([inp(0, 3, '4'), guard()]);
  while (D2.state !== 'block') w2.step([inp(0), guard()]);
  w2.step([inp(0), Object.assign(inp(1, 5, '1'), { guard: true })]);
  assert.equal(D2.buffered, null, 'early press during blockstun is not buffered');
  void A2;
});

test('inputs cannot bypass recovery: mashing during recovery never starts a move early', () => {
  const w = makeWorld('ren', 'maya', 3.0);
  const [A] = w.fighters;
  pressSeq(w, 0, [[5, '4']]);
  const m = A.move;
  for (let k = 1; k < m.total; k++) {
    w.step([inp(0, 5, k % 2 ? '2' : ''), inp(1)]);
    if (A.state === 'attack' && A.move !== m) assert.ok(A.mf <= 1 && k >= m.total - 1, `new move started at frame ${k} of ${m.total}`);
  }
});

test('throws invalidate earlier inputs: nothing entered before the throw fires afterwards', () => {
  const w = makeWorld('ren', 'maya', 0.7);
  const [A, D] = w.fighters;
  // Maya presses 4 a frame before Ren's throw connects; after the throw she must not kick.
  w.step([inp(0, 5, '13'), inp(1)]);
  while (D.state !== 'thrown' && w.frame < 30) w.step([inp(0), w.frame === 10 ? inp(1, 5, '4') : inp(1)]);
  let kicked = false;
  for (let k = 0; k < 160; k++) { w.step([inp(0), inp(1)]); if (D.state === 'attack' && D.move.id === 'maya_4') kicked = true; }
  assert.equal(kicked, false);
  void A;
});

test('wake-up: inputs from before the knockdown do not fire on get-up', () => {
  const r = COMBOS.ren.find((c) => c.id === 'ren_l');
  const o = runRoute('ren', r, { defender: 'open', frames: 120 });
  const w = o.world, D = w.fighters[1];
  for (let k = 0; k < 60 && D.state !== 'down'; k++) w.step([inp(0), inp(1)]);
  assert.equal(D.state, 'down');
  // inputs pressed while airborne (before the knockdown landed) are stale now
  assert.ok(D.minInputN >= D.inputN - 1);
  let attacked = false;
  for (let k = 0; k < 100; k++) { w.step([inp(0), k === 30 ? inp(1, 5, '3') : inp(1)]); if (D.state === 'attack') attacked = true; }
  assert.ok(['getup', 'idle', 'crouch'].includes(D.state) || D.state === 'down', D.state);
  assert.equal(attacked, false, 'get-up press is a wake-up input, not an attack');
});

test('terminal finisher: nothing re-floats the opponent after the juggle finisher', () => {
  const r = COMBOS.ren.find((c) => c.id === 'ren_l');
  const w = makeWorld('ren', 'ren', 1.0);
  const [A, D] = w.fighters;
  const bot = new RouteBot(r);
  let terminalAt = null, rose = false, landed = false;
  for (let k = 0; k < 220; k++) {
    const ai = bot.done ? inp(0, 6, k % 3 === 0 ? '1' : '') : bot.input(w, A);   // keep mashing after the route
    const di = emptyInput(); if (!D.combo.active) setDir(di, D, 6);
    const vy = D.vel.y;
    w.step([ai, di]);
    if (D.combo.terminal && terminalAt === null) terminalAt = k;
    else if (terminalAt !== null && D.state === 'air' && D.vel.y > vy + 1e-9) rose = true;
    if (terminalAt !== null && D.state === 'down') { landed = true; break; }
  }
  assert.ok(terminalAt !== null, 'finisher marks the combo terminal');
  assert.equal(rose, false, 'no upward velocity after the finisher');
  assert.ok(landed);
});

test('wall loops end: repeated hits on a wall-splatted opponent cannot hold them past the cap', () => {
  const w = makeWorld('kai', 'ren', 1.0);
  const [A, D] = w.fighters;
  A.pos.x = 5.6; D.pos.x = 6.4;
  pressSeq(w, 0, [[6], [5], [6, '2']], inp(1, 6));   // defender walks in (standing still guards)
  let wallT = 0, maxWall = 0;
  for (let k = 0; k < 400; k++) {
    w.step([inp(0, 5, k % 4 === 0 ? '1' : ''), D.combo.active ? inp(1) : inp(1, 6)]);
    // the wall state's own clock (hit-stop freezes are not wall time)
    if (D.state === 'wall') { wallT = D.t; maxWall = Math.max(maxWall, wallT); }
  }
  assert.ok(maxWall > 0, 'wall splat happened');
  assert.ok(maxWall <= WALL_STUN_MAX, `wall stun ${maxWall} frames`);
  assert.notEqual(D.state, 'wall', 'the loop ended');
});

test('side changes: routes work with the fighters on swapped sides', () => {
  for (const id of ['ren', 'maya']) {
    for (const r of COMBOS[id].filter((c) => c.kind === 'true' || c.kind === 'juggle')) {
      const w = new World(CHARACTERS[id], CHARACTERS.ren);
      const [A, D] = w.fighters;
      A.pos.x = 0.5; D.pos.x = -0.5; A.face.x = -1; D.face.x = 1;
      run(w, 3);   // let screen sides update
      const bot = new RouteBot(r);
      let hits = 0;
      for (let k = 0; k < 300; k++) {
        const di = emptyInput(); if (!D.combo.active) setDir(di, D, 6);
        w.step([bot.input(w, A), di]);
        for (const e of w.events) if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 0) hits++;
        w.events.length = 0;
      }
      assert.equal(hits, r.hits, `${r.name} on the right side`);
    }
  }
});

test('rematch / new round: no buffered or queued input survives the reset', () => {
  const m = new Match({ p1: 'ren', p2: 'maya', mode: 'versus', skipIntro: true });
  while (m.phase !== 'fight') m.tick([inp(0), inp(1)]);
  const A = m.world.fighters[0];
  m.tick([inp(0, 5, '4'), inp(1)]);
  while (A.mf < A.move.total - 4) m.tick([inp(0), inp(1)]);
  m.tick([inp(0, 5, '1'), inp(1)]);
  assert.ok(A.buffered);
  m.startRound(true);
  assert.equal(A.buffered, null); assert.equal(A.queued, null); assert.equal(A.buf.length, 0);
});

test('outcomes do not depend on render rate: rendering never feeds back into the simulation', async () => {
  const { Animator } = await import('../js/render/Animator.js');
  const play = (renderEvery) => {
    const m = new Match({ p1: 'leila', p2: 'caio', mode: 'versus', skipIntro: true, roundTime: 0 });
    const cpu = [new CpuAI(3, 11), new CpuAI(3, 22)];
    const anim = [new Animator('leila'), new Animator('caio')];
    for (let k = 0; k < 1500; k++) {
      const w = m.world;
      m.tick([cpu[0].input(w, w.fighters[0]), cpu[1].input(w, w.fighters[1])]);
      if (renderEvery && k % renderEvery === 0) w.fighters.forEach((f, i) => anim[i].update(f, w, 0.5));
    }
    const w = m.world;
    return JSON.stringify(w.fighters.map((f) => [f.hp, f.state, f.pos.x.toFixed(5), f.pos.z.toFixed(5), f.attackSeq])) + w.frame;
  };
  const base = play(0);
  for (const every of [1, 2, 4, 7]) assert.equal(play(every), base, `render every ${every} sim frames`);
});

test('animation resyncs after a round reset (fighter frame counters restart)', async () => {
  const { Animator } = await import('../js/render/Animator.js');
  const m = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
  const a = new Animator('ren');
  const f = m.world.fighters[0];
  for (let k = 0; k < 300; k++) { m.tick([inp(0), inp(1)]); a.update(f, m.world, 0); }
  m.resetTraining();
  m.tick([inp(0, 5, '1'), inp(1)]);
  for (let k = 0; k < 12; k++) { m.tick([inp(0), inp(1)]); a.update(f, m.world, 0); }
  // after the reset the jab animates (the hand moves toward its contact pose) instead of freezing
  const p = a.update(f, m.world, 0);
  const stanceZ = a.stance[12 + 2];
  assert.ok(p[12 + 2] > stanceZ + 0.15, `lead hand extended: ${p[14].toFixed(2)} vs stance ${stanceZ.toFixed(2)}`);
});
