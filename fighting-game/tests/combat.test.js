import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, inp, run, press, collectEvents, measureAdvantage, setDistance } from './helpers.js';
import { parseCommand, commandPriority } from '../js/sim/commands.js';
import { Match } from '../js/sim/match.js';
import { ARENA_HALF } from '../js/sim/constants.js';

const settle = (w, n = 4) => run(w, n);

// Fire a move for fighter idx and keep the other fighter's input fixed.
function doMove(w, idx, dir, btn, other = null, frames = 1) {
  for (let k = 0; k < frames; k++) press(w, idx, dir, btn, other);
}

test('command parsing and priority', () => {
  const a = parseCommand('df+1+2'), b = parseCommand('qcf+1'), c = parseCommand('1');
  assert.equal(a.dir, 'df'); assert.equal(a.buttons, 3);
  assert.equal(b.motion, 'qcf');
  assert.ok(commandPriority(b) > commandPriority(a));
  assert.ok(commandPriority(a) > commandPriority(c));
  assert.throws(() => parseCommand('x+9'));
});

test('jab hits in range, deals damage and gives +8 on hit', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  settle(w);
  const hp = w.fighters[1].hp;
  doMove(w, 0, 5, '1', inp(1, 6));  // P2 walks forward so it cannot block
  let hitFrame = null;
  for (let k = 0; k < 15 && hitFrame === null; k++) {
    run(w, 1, inp(0), inp(1, 6));
    if (w.fighters[1].state === 'hit') hitFrame = k;
  }
  assert.notEqual(hitFrame, null, 'jab should connect');
  assert.equal(hp - w.fighters[1].hp, 7);
  assert.equal(measureAdvantage(w, 0), 8);
});

test('jab whiffs out of range', () => {
  const w = makeWorld('kai', 'viktor', 2.4);
  settle(w);
  doMove(w, 0, 5, '1');
  run(w, 30);
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
  assert.equal(w.fighters[0].lastMoveInfo.result, 'whiff');
});

test('standing guard blocks highs and mids; df+2 is -13 on block', () => {
  const w = makeWorld('kai', 'viktor', 0.9);
  settle(w);
  doMove(w, 0, 3, '2');
  run(w, 20);
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp, 'launcher should be blocked by idle guard');
  assert.equal(w.fighters[0].moveResult, 'block');
  const adv = measureAdvantage(w, 0);
  assert.equal(adv, -13);
});

test('high attacks whiff on a crouching opponent; mids hit crouchers', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  run(w, 6, inp(0), inp(1, 1));             // P2 crouch guard (down-back)
  assert.equal(w.fighters[1].state, 'crouch');
  doMove(w, 0, 5, '1', inp(1, 1));
  run(w, 20, inp(0), inp(1, 1));
  assert.equal(w.fighters[0].lastMoveInfo?.result ?? w.fighters[0].moveResult ?? 'whiff', 'whiff');
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
  run(w, 10, inp(0), inp(1, 1));
  doMove(w, 0, 3, '1', inp(1, 1));          // df+1 elbow: mid
  run(w, 20, inp(0), inp(1, 1));
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'mid should hit crouching guard');
});

test('lows hit standing guard and are blocked by crouch guard', () => {
  const w = makeWorld('kai', 'viktor', 1.1);
  settle(w);
  doMove(w, 0, 2, '4');
  const guard = inp(1); guard.guard = true;   // stand guard button (does not walk away)
  run(w, 24, (k) => inp(0, k < 3 ? 2 : 5), guard);
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'low should hit standing guard');

  const w2 = makeWorld('kai', 'viktor', 1.1);
  run(w2, 6, inp(0), inp(1, 1));
  doMove(w2, 0, 2, '4', inp(1, 1));
  run(w2, 24, (k) => inp(0, k < 3 ? 2 : 5), inp(1, 1));
  assert.equal(w2.fighters[1].hp, w2.fighters[1].def.hp, 'crouch guard should block low');
  assert.equal(w2.fighters[0].moveResult, 'block');
});

test('sidestep evades linear attacks but not homing attacks', () => {
  for (const [btn, shouldHit] of [['2', false], ['34', true]]) {
    const w = makeWorld('kai', 'viktor', 1.05);
    settle(w);
    // P2 taps up (sidestep into the screen) on the same frame P1 attacks, then walks in (no guard).
    doMove(w, 0, 5, btn, inp(1, 8));
    run(w, 30, inp(0), (k) => inp(1, k < 12 ? 5 : 6));
    const hit = w.fighters[1].hp < w.fighters[1].def.hp;
    assert.equal(hit, shouldHit, `${btn} vs sidestep`);
  }
});

// Launch with df+2 against a walking (non-guarding) opponent; returns once P1 can act again.
function launch(w) {
  doMove(w, 0, 3, '2', inp(1, 6));
  for (let k = 0; k < 80; k++) {
    w.step([inp(0), inp(1, w.fighters[1].state === 'air' ? 5 : 6)]);
    if (w.fighters[1].state === 'air' && w.fighters[0].isNeutral()) return;
  }
  throw new Error('launch failed');
}

test('launcher juggles: airborne, combo counts, scaling reduces later hits', () => {
  const w = makeWorld('kai', 'viktor', 0.9);
  settle(w);
  launch(w);
  const d = w.fighters[1];
  assert.equal(d.state, 'air', 'df+2 launches');
  assert.equal(d.combo.hits, 1);
  // 1,2,4 juggle
  const script = { 0: '1', 10: '2', 22: '4' };
  for (let k = 0; k < 60; k++) w.step([inp(0, 5, script[k] || ''), inp(1)]);
  assert.ok(d.combo.hits >= 3, `combo hits ${d.combo.hits}`);
  const raw = 13 + 7 + 10 + 17;
  assert.ok(d.combo.dmg < raw, `scaled ${d.combo.dmg} < raw ${raw}`);
  run(w, 120);
  assert.ok(['down', 'getup', 'idle'].includes(d.state), d.state);
});

test('juggles cannot loop forever (gravity scaling ends combos)', () => {
  const w = makeWorld('kai', 'viktor', 0.9);
  settle(w);
  launch(w);
  let maxHits = 0, landed = false;
  for (let k = 0; k < 400; k++) {
    w.step([inp(0, 6, k % 6 === 0 ? '1' : ''), inp(1)]);
    maxHits = Math.max(maxHits, w.fighters[1].combo.hits);
    if (w.fighters[1].state === 'down') { landed = true; break; }
  }
  assert.ok(landed, 'victim must land');
  assert.ok(maxHits >= 3 && maxHits < 20, `hits ${maxHits}`);
});

test('throw connects and can be broken with the matching button', () => {
  const w = makeWorld('kai', 'viktor', 0.8);
  settle(w);
  doMove(w, 0, 5, '13');
  run(w, 13);
  assert.equal(w.fighters[1].state, 'thrown');
  doMove(w, 1, 5, '1');
  run(w, 1);
  assert.equal(w.fighters[1].state, 'throwBreak');
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);

  const w2 = makeWorld('kai', 'viktor', 0.8);
  settle(w2);
  doMove(w2, 0, 5, '13');
  run(w2, 13);
  doMove(w2, 1, 5, '2');   // wrong break button
  run(w2, 80);
  assert.equal(w2.fighters[1].hp, w2.fighters[1].def.hp - 35);
});

test('throws whiff against crouching opponents', () => {
  const w = makeWorld('kai', 'viktor', 0.8);
  run(w, 6, inp(0), inp(1, 1));
  doMove(w, 0, 5, '13', inp(1, 1));
  run(w, 30, inp(0), inp(1, 1));
  assert.notEqual(w.fighters[1].state, 'thrown');
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
});

test('Kai parry counters a mid attack', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  settle(w);
  doMove(w, 1, 5, '3');                // Viktor front kick i15
  run(w, 5);
  doMove(w, 0, 4, '12');               // b+1+2 parry
  run(w, 30);
  assert.equal(w.fighters[0].hp, w.fighters[0].def.hp, 'Kai takes no damage');
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'counter strike lands');
});

test('Viktor power crush absorbs a high and still hits', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  settle(w);
  doMove(w, 1, 6, '2');                // f+2 armored
  run(w, 6);
  doMove(w, 0, 5, '1');                // Kai jab hits during armor
  run(w, 30);
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'Viktor took jab damage');
  assert.ok(w.fighters[0].hp < w.fighters[0].def.hp, 'Kai was hit by Steel Hammer');
});

test('counter hit is detected when hitting an attack in startup', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  settle(w);
  doMove(w, 1, 5, '4');                // slow i16 kick
  run(w, 2);
  doMove(w, 0, 5, '1');
  let ch = false;
  for (let k = 0; k < 15; k++) { run(w, 1); if (collectEvents(w).some(e => e.type === 'counter')) ch = true; }
  assert.ok(ch);
});

test('wallsplat near a wall', () => {
  const w = makeWorld('kai', 'viktor');
  const [a, b] = w.fighters;
  a.pos.x = ARENA_HALF - 1.6; b.pos.x = ARENA_HALF - 0.6;
  settle(w);
  // f,f+2 Tiger Palm
  doMove(w, 0, 6, ''); doMove(w, 0, 5, ''); doMove(w, 0, 6, '2', inp(1, 6));
  let splat = false;
  for (let k = 0; k < 40; k++) { run(w, 1, inp(0), inp(1, 6)); if (collectEvents(w).some(e => e.type === 'wallsplat')) splat = true; }
  assert.ok(splat);
});

test('fighters never leave the arena and keep facing each other', () => {
  const w = makeWorld('kai', 'viktor');
  run(w, 600, inp(0, 4), inp(1, 4));
  for (const f of w.fighters) {
    assert.ok(Math.abs(f.pos.x) <= ARENA_HALF && Math.abs(f.pos.z) <= ARENA_HALF);
    assert.ok(f.pos.y >= 0);
  }
  run(w, 300, inp(0, 6), inp(1, 8));
  const [a, b] = w.fighters;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
  assert.ok((a.face.x * dx + a.face.z * dz) / d > 0.9);
  assert.ok(d >= 0.6, 'bodies do not overlap');
});

test('each player input only moves their own fighter', () => {
  const w = makeWorld('kai', 'viktor');
  const b0 = { ...w.fighters[1].pos };
  run(w, 30, inp(0, 6), inp(1, 5));
  assert.ok(w.fighters[0].pos.x > -1.3 + 0.5);
  assert.ok(Math.abs(w.fighters[1].pos.x - b0.x) < 0.01);
  const a0 = { ...w.fighters[0].pos };
  run(w, 30, inp(0, 5), inp(1, 4));
  assert.ok(Math.abs(w.fighters[0].pos.x - a0.x) < 0.01);
});

test('strings: 1,2,4 chains into a knockdown', () => {
  const w = makeWorld('kai', 'viktor', 1.0);
  settle(w);
  const script = { 0: '1', 10: '2', 22: '4' };
  let maxHits = 0;
  for (let k = 0; k < 90; k++) {
    w.step([inp(0, 5, script[k] || ''), inp(1, 6)]);
    maxHits = Math.max(maxHits, w.fighters[1].combo.hits);
  }
  assert.equal(maxHits, 3);
});

test('match: best of three, KO awards rounds, rematch-ready match end', () => {
  const m = new Match({ p1: 'kai', p2: 'viktor', skipIntro: true });
  const blank = [inp(0), inp(1)];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 100 && m.phase !== 'fight'; k++) m.tick(blank);
    assert.equal(m.phase, 'fight');
    m.world.fighters[1].hp = 1;
    // Jab until KO
    for (let k = 0; k < 400 && m.phase === 'fight'; k++) {
      const [a, b] = m.world.fighters;
      const near = Math.abs(a.pos.x - b.pos.x) < 1.0;
      m.tick([inp(0, near ? 5 : 6, near && k % 4 === 0 ? '1' : ''), inp(1, 6)]);
    }
    assert.equal(m.phase, 'ko');
    for (let k = 0; k < 400 && m.phase !== 'fight' && m.phase !== 'matchOver'; k++) m.tick(blank);
  }
  assert.equal(m.phase, 'matchOver');
  assert.deepEqual(m.wins, [2, 0]);
  assert.equal(m.winner, 0);
});

test('match: time out gives the round to the healthier fighter and resets state', () => {
  const m = new Match({ roundTime: 2, skipIntro: true });
  const blank = [inp(0), inp(1)];
  for (let k = 0; k < 100 && m.phase !== 'fight'; k++) m.tick(blank);
  m.world.fighters[0].hp = 100;
  for (let k = 0; k < 200 && m.phase === 'fight'; k++) m.tick(blank);
  assert.equal(m.phase, 'roundOver');
  assert.deepEqual(m.wins, [0, 1]);
  for (let k = 0; k < 300 && m.phase !== 'fight'; k++) m.tick(blank);
  assert.equal(m.round, 2);
  assert.equal(m.world.fighters[0].hp, m.world.fighters[0].def.hp);
  assert.equal(m.world.fighters[0].state, 'idle');
});

test('CPU match runs without errors and keeps state sane', () => {
  const m = new Match({ mode: 'cpu', skipIntro: true, roundTime: 30 });
  for (let k = 0; k < 60 * 120 && m.phase !== 'matchOver'; k++) {
    // P1 is a second CPU for this soak test
    const ai = m._p1ai || (m._p1ai = new (m.cpu.constructor)(3, 777));
    m.tick([ai.input(m.world, m.world.fighters[0]), null]);
    for (const f of m.world.fighters) {
      assert.ok(Number.isFinite(f.pos.x) && Number.isFinite(f.pos.z) && f.pos.y >= 0);
      assert.ok(Math.abs(f.pos.x) <= ARENA_HALF && Math.abs(f.pos.z) <= ARENA_HALF);
      assert.ok(f.hp >= 0);
    }
  }
  assert.ok(m.round >= 2 || m.phase === 'matchOver');
});

test('training mode: dummy never dies and refills, reset button repositions', () => {
  const m = new Match({ mode: 'training' });
  const d = m.world.fighters[1];
  d.hp = 5;
  for (let k = 0; k < 120; k++) m.tick([inp(0), null]);
  assert.equal(d.hp, d.def.hp);
  m.world.fighters[0].pos.x = 3;
  const r = inp(0); r.reset = true;
  m.tick([r, null]);
  assert.ok(Math.abs(m.world.fighters[0].pos.x + 1.3) < 0.2);
});
