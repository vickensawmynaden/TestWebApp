import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, inp, run, press, collectEvents, measureAdvantage } from './helpers.js';
import { parseCommand, commandPriority } from '../js/sim/commands.js';
import { Match } from '../js/sim/match.js';
import { ARENA_HALF } from '../js/sim/constants.js';

const settle = (w, n = 4) => run(w, n);

// Fire a move for fighter idx and keep the other fighter's input fixed.
function doMove(w, idx, dir, btn, other = null, frames = 1) {
  for (let k = 0; k < frames; k++) press(w, idx, dir, btn, other);
}

test('command parsing and priority', () => {
  const a = parseCommand('df+1+2'), b = parseCommand('qcf+1'), c = parseCommand('1'), d = parseCommand('f+2');
  assert.equal(a.dir, 'df'); assert.equal(a.buttons, 3);
  assert.equal(b.motion, 'qcf');
  assert.ok(commandPriority(b) > commandPriority(a));
  assert.ok(commandPriority(a) > commandPriority(c));
  assert.ok(commandPriority(d) > commandPriority(parseCommand('2')), 'directional beats plain');
  assert.throws(() => parseCommand('x+9'));
});

test('jab hits in range, deals its damage once and gives the data-defined advantage', () => {
  const w = makeWorld('ren', 'maya', 1.0);
  settle(w);
  const jab = w.fighters[0].moveMap.get('ren_1');
  const hp = w.fighters[1].hp;
  doMove(w, 0, 5, '1', inp(1, 6));  // P2 walks forward so it cannot block
  let hits = 0;
  for (let k = 0; k < 14; k++) { run(w, 1, inp(0), inp(1, 6)); hits += collectEvents(w).filter((e) => e.type === 'hit').length; }
  assert.equal(hits, 1, 'one strike = one hit');
  assert.equal(hp - w.fighters[1].hp, jab.dmg);
  assert.equal(measureAdvantage(w, 0), jab.hit);
});

test('jab whiffs out of range and completes its recovery', () => {
  const w = makeWorld('ren', 'maya', 2.4);
  settle(w);
  const jab = w.fighters[0].moveMap.get('ren_1');
  doMove(w, 0, 5, '1');
  for (let k = 1; k < jab.total - 1; k++) {
    // mashing during recovery must not restart the attack early
    run(w, 1, inp(0, 5, k % 2 ? '1' : ''));
    assert.equal(w.fighters[0].state, 'attack');
    assert.equal(w.fighters[0].move.id, 'ren_1');
  }
  run(w, 30);
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
  assert.equal(w.fighters[0].lastMoveInfo.result, 'whiff');
});

test('standing guard blocks a mid; block stun gives the data-defined disadvantage', () => {
  const w = makeWorld('ren', 'maya', 0.9);
  settle(w);
  const palm = w.fighters[0].moveMap.get('ren_f2');
  doMove(w, 0, 6, '2');
  run(w, 20);
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp, 'no chip damage');
  assert.equal(w.fighters[0].moveResult, 'block');
  assert.equal(measureAdvantage(w, 0), palm.block);
});

test('crouching ducks highs; mids hit crouching guard', () => {
  const w = makeWorld('ren', 'maya', 1.0);
  run(w, 6, inp(0), inp(1, 1));             // P2 crouch guard (down-back)
  assert.equal(w.fighters[1].state, 'crouch');
  doMove(w, 0, 5, '1', inp(1, 1));
  run(w, 30, inp(0), inp(1, 1));
  assert.equal(w.fighters[0].lastMoveInfo.result, 'whiff');
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
  run(w, 10, inp(0), inp(1, 1));
  doMove(w, 0, 6, '2', inp(1, 1));          // f+2 Harbor Palm: mid
  run(w, 20, inp(0), inp(1, 1));
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'mid should hit crouching guard');
});

test('lows hit standing guard and are blocked by crouch guard', () => {
  const w = makeWorld('ren', 'maya', 1.0);
  settle(w);
  const guard = inp(1); guard.guard = true;
  doMove(w, 0, 2, '3', guard);
  run(w, 24, (k) => inp(0, k < 3 ? 2 : 5), guard);
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'low should hit standing guard');

  const w2 = makeWorld('ren', 'maya', 1.0);
  run(w2, 6, inp(0), inp(1, 1));
  doMove(w2, 0, 2, '3', inp(1, 1));
  run(w2, 24, (k) => inp(0, k < 3 ? 2 : 5), inp(1, 1));
  assert.equal(w2.fighters[1].hp, w2.fighters[1].def.hp, 'crouch guard should block low');
  assert.equal(w2.fighters[0].moveResult, 'block');
});

test('sidestep evades linear attacks but not homing attacks (Kai)', () => {
  for (const [btn, shouldHit] of [['2', false], ['34', true]]) {
    const w = makeWorld('kai', 'ren', 1.05);
    settle(w);
    doMove(w, 0, 5, btn, inp(1, 8));
    run(w, 30, inp(0), (k) => inp(1, k < 12 ? 5 : 6));
    const hit = w.fighters[1].hp < w.fighters[1].def.hp;
    assert.equal(hit, shouldHit, `${btn} vs sidestep`);
  }
});

// Kai (bonus fighter) keeps launchers / juggles with explicit string and scaling rules.
function launch(w) {
  doMove(w, 0, 3, '2', inp(1, 6));
  for (let k = 0; k < 80; k++) {
    w.step([inp(0), inp(1, w.fighters[1].state === 'air' ? 5 : 6)]);
    if (w.fighters[1].state === 'air' && w.fighters[0].isNeutral()) return;
  }
  throw new Error('launch failed');
}

test('Kai: launcher juggles with scaled damage', () => {
  const w = makeWorld('kai', 'ren', 0.9);
  settle(w);
  launch(w);
  const d = w.fighters[1];
  const script = { 0: '1', 10: '2', 22: '4' };
  for (let k = 0; k < 60; k++) w.step([inp(0, 5, script[k] || ''), inp(1)]);
  assert.ok(d.combo.hits >= 3, `combo hits ${d.combo.hits}`);
  const raw = ['kai_df2', 'kai_1', 'kai_12', 'kai_124'].reduce((s, id) => s + w.fighters[0].moveMap.get(id).dmg, 0);
  assert.ok(d.combo.dmg < raw, `scaled ${d.combo.dmg} < raw ${raw}`);
  run(w, 120);
  assert.ok(['down', 'getup', 'idle'].includes(d.state), d.state);
});

test('Kai: juggles always end', () => {
  const w = makeWorld('kai', 'ren', 0.9);
  settle(w);
  launch(w);
  let maxHits = 0, landed = false;
  for (let k = 0; k < 400; k++) {
    w.step([inp(0, 6, k % 6 === 0 ? '1' : ''), inp(1)]);
    maxHits = Math.max(maxHits, w.fighters[1].combo.hits);
    if (w.fighters[1].state === 'down') { landed = true; break; }
  }
  assert.ok(landed);
  assert.ok(maxHits >= 3 && maxHits < 20, `hits ${maxHits}`);
});

test('standard throw deals 12, breaks with the throw/1 input, misses crouchers', () => {
  const w = makeWorld('ren', 'maya', 0.8);
  settle(w);
  doMove(w, 0, 5, '13');
  run(w, 13);
  assert.equal(w.fighters[1].state, 'thrown');
  const brk = inp(1); brk.throw = true;    // the Throw button (O) also breaks
  w.step([inp(0), brk]);
  run(w, 1);
  assert.equal(w.fighters[1].state, 'throwBreak');
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);

  const w2 = makeWorld('ren', 'maya', 0.8);
  settle(w2);
  doMove(w2, 0, 5, '13');
  run(w2, 13);
  doMove(w2, 1, 5, '2');   // wrong break button
  run(w2, 80);
  assert.equal(w2.fighters[1].def.hp - w2.fighters[1].hp, 12);

  const w3 = makeWorld('ren', 'maya', 0.8);
  run(w3, 6, inp(0), inp(1, 1));
  doMove(w3, 0, 5, '13', inp(1, 1));
  run(w3, 30, inp(0), inp(1, 1));
  assert.notEqual(w3.fighters[1].state, 'thrown');
  assert.equal(w3.fighters[1].hp, w3.fighters[1].def.hp);
});

test('Viktor Foundry Drop deals 18', () => {
  const w = makeWorld('viktor', 'ren', 0.8);
  settle(w);
  const t = inp(0); t.throw = true;
  w.step([t, inp(1)]);
  run(w, 100);
  assert.equal(w.fighters[1].def.hp - w.fighters[1].hp, 18);
});

test('no guaranteed re-throw on get-up', () => {
  const w = makeWorld('ren', 'maya', 0.8);
  settle(w);
  doMove(w, 0, 5, '13');
  run(w, 100);
  const d = w.fighters[1];
  assert.equal(d.state, 'down');
  // Defender gets up as soon as possible; attacker spams throw throughout.
  let thrownAgain = false;
  for (let k = 0; k < 120; k++) {
    const a = w.fighters[0];
    a.pos.x = d.pos.x - 0.75; a.pos.z = d.pos.z;
    w.step([inp(0, 5, k % 2 ? '13' : ''), inp(1, 5, k % 3 === 0 ? '1' : '')]);
    if (d.state === 'thrown') { thrownAgain = true; break; }
    if (d.state !== 'down' && d.state !== 'getup' && d.throwProtect === 0 && d.isNeutral()) break;
  }
  assert.equal(thrownAgain, false);
});

test('Kai parry counters a mid attack', () => {
  const w = makeWorld('kai', 'ren', 1.0);
  settle(w);
  doMove(w, 1, 5, '3');                // Ren left kick (mid)
  run(w, 5);
  doMove(w, 0, 4, '12');               // b+1+2 parry
  run(w, 30);
  assert.equal(w.fighters[0].hp, w.fighters[0].def.hp, 'Kai takes no damage');
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp, 'counter strike lands');
});

test('Kai Rage Art armour absorbs a jab and still hits', () => {
  const w = makeWorld('kai', 'ren', 1.0);
  settle(w);
  w.fighters[0].rage = true;
  doMove(w, 0, 3, '12');
  run(w, 6);
  doMove(w, 1, 5, '1');
  run(w, 40);
  assert.ok(w.fighters[0].hp < w.fighters[0].def.hp, 'Kai took the jab');
  assert.ok(w.fighters[1].hp < w.fighters[1].def.hp - 20, 'Rage Art landed');
});

test('counter hit is detected when hitting an attack in startup', () => {
  const w = makeWorld('ren', 'viktor', 1.0);
  settle(w);
  doMove(w, 1, 4, '2');                // Viktor Collar Hammer i22
  run(w, 2);
  doMove(w, 0, 5, '1');
  let ch = false;
  for (let k = 0; k < 15; k++) { run(w, 1); if (collectEvents(w).some((e) => e.type === 'counter')) ch = true; }
  assert.ok(ch);
});

test('wallsplat near a wall (Kai Tiger Palm)', () => {
  const w = makeWorld('kai', 'ren');
  const [a, b] = w.fighters;
  a.pos.x = ARENA_HALF - 1.6; b.pos.x = ARENA_HALF - 0.6;
  settle(w);
  doMove(w, 0, 6, ''); doMove(w, 0, 5, ''); doMove(w, 0, 6, '2', inp(1, 6));
  let splat = false;
  for (let k = 0; k < 40; k++) { run(w, 1, inp(0), inp(1, 6)); if (collectEvents(w).some((e) => e.type === 'wallsplat')) splat = true; }
  assert.ok(splat);
});

test('fighters never leave the arena, never pass through each other, keep facing', () => {
  const w = makeWorld('viktor', 'maya');
  run(w, 600, inp(0, 4), inp(1, 4));
  for (const f of w.fighters) {
    assert.ok(Math.abs(f.pos.x) <= ARENA_HALF && Math.abs(f.pos.z) <= ARENA_HALF);
    assert.ok(f.pos.y >= 0);
  }
  let minD = 9;
  for (let k = 0; k < 400; k++) {
    w.step([inp(0, 6), inp(1, 6)]);
    const [a, b] = w.fighters;
    minD = Math.min(minD, Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z));
  }
  assert.ok(minD >= 0.6, `bodies do not overlap (min ${minD.toFixed(2)})`);
  run(w, 300, inp(0, 6), inp(1, 8));
  const [a, b] = w.fighters;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
  assert.ok((a.face.x * dx + a.face.z * dz) / d > 0.9);
});

test('each player input only moves their own fighter', () => {
  const w = makeWorld('ren', 'maya');
  const b0 = { ...w.fighters[1].pos };
  run(w, 30, inp(0, 6), inp(1, 5));
  assert.ok(w.fighters[0].pos.x > -1.3 + 0.5);
  assert.ok(Math.abs(w.fighters[1].pos.x - b0.x) < 0.01);
  const a0 = { ...w.fighters[0].pos };
  run(w, 30, inp(0, 5), inp(1, 4));
  assert.ok(Math.abs(w.fighters[0].pos.x - a0.x) < 0.01);
});

test('Kai strings: 1,2,4 chains into 3 hits', () => {
  const w = makeWorld('kai', 'ren', 1.0);
  settle(w);
  const script = { 0: '1', 10: '2', 22: '4' };
  let maxHits = 0;
  for (let k = 0; k < 90; k++) {
    w.step([inp(0, 5, script[k] || ''), inp(1, 6)]);
    maxHits = Math.max(maxHits, w.fighters[1].combo.hits);
  }
  assert.equal(maxHits, 3);
});

test('match rules: 100 HP, 60 s rounds, first to two wins', () => {
  const m = new Match({ p1: 'ren', p2: 'maya', skipIntro: true });
  assert.equal(m.roundsToWin, 2);
  assert.equal(m.roundTime, 60);
  for (const f of m.world.fighters) assert.equal(f.hp, 100);
});

test('match: best of three, KO awards rounds, defeated fighter stops acting', () => {
  const m = new Match({ p1: 'ren', p2: 'maya', skipIntro: true });
  const blank = [inp(0), inp(1)];
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 100 && m.phase !== 'fight'; k++) m.tick(blank);
    assert.equal(m.phase, 'fight');
    m.world.fighters[1].hp = 1;
    for (let k = 0; k < 400 && m.phase === 'fight'; k++) {
      const [a, b] = m.world.fighters;
      const near = Math.abs(a.pos.x - b.pos.x) < 1.0;
      m.tick([inp(0, near ? 5 : 6, near && k % 4 === 0 ? '1' : ''), inp(1, 6)]);
    }
    assert.equal(m.phase, 'ko');
    // The defeated fighter ignores input (mashing attacks while KO'd).
    const loser = m.world.fighters[1];
    for (let k = 0; k < 120 && m.phase === 'ko'; k++) {
      m.tick([inp(0), inp(1, 6, k % 2 ? '1' : '4')]);
      assert.notEqual(loser.state, 'attack');
      assert.ok(loser.ko);
    }
    for (let k = 0; k < 400 && m.phase !== 'fight' && m.phase !== 'matchOver'; k++) m.tick(blank);
  }
  assert.equal(m.phase, 'matchOver');
  assert.deepEqual(m.wins, [2, 0]);
  assert.equal(m.winner, 0);
});

test('match: time out gives the round to the healthier fighter and resets state', () => {
  const m = new Match({ p1: 'leila', p2: 'caio', roundTime: 2, skipIntro: true });
  const blank = [inp(0), inp(1)];
  for (let k = 0; k < 100 && m.phase !== 'fight'; k++) m.tick(blank);
  m.world.fighters[0].hp = 60;
  for (let k = 0; k < 200 && m.phase === 'fight'; k++) m.tick(blank);
  assert.equal(m.phase, 'roundOver');
  assert.deepEqual(m.wins, [0, 1]);
  for (let k = 0; k < 300 && m.phase !== 'fight'; k++) m.tick(blank);
  assert.equal(m.round, 2);
  assert.equal(m.world.fighters[0].hp, m.world.fighters[0].def.hp);
  assert.equal(m.world.fighters[0].state, 'idle');
});

test('training mode: dummy never dies and refills, reset button repositions', () => {
  const m = new Match({ mode: 'training', p1: 'ren', p2: 'maya' });
  const d = m.world.fighters[1];
  d.hp = 5;
  for (let k = 0; k < 120; k++) m.tick([inp(0), null]);
  assert.equal(d.hp, d.def.hp);
  m.world.fighters[0].pos.x = 3;
  const r = inp(0); r.reset = true;
  m.tick([r, null]);
  assert.ok(Math.abs(m.world.fighters[0].pos.x + 1.3) < 0.2);
});

test('training dummy "guard all" blocks highs, mids and lows without drifting', () => {
  const m = new Match({ mode: 'training', p1: 'ren', p2: 'maya' });
  m.dummy.mode = 'guard all';
  const w = m.world;
  w.fighters[0].pos.x = -0.5; w.fighters[1].pos.x = 0.5;
  let drift = 0;
  const seq = [['1', 5], ['2', 6], ['3', 2]];   // Anchor Jab (high), Harbor Palm (mid), Stone Sweep (low)
  for (const [btn, dir] of seq) {
    w.fighters[0].pos.x = w.fighters[1].pos.x - 1.0;
    m.tick([inp(0, dir, btn), null]);
    const before = w.fighters[1].pos.x;
    for (let k = 0; k < 70; k++) m.tick([inp(0, k < 3 ? dir : 5), null]);
    drift = Math.max(drift, Math.abs(w.fighters[1].pos.x - before));
    assert.equal(w.fighters[0].lastMoveInfo.result, 'block', `${dir}+${btn} should be blocked`);
  }
  assert.equal(w.fighters[1].hp, w.fighters[1].def.hp);
  assert.ok(drift < 0.6, `dummy only moves by block pushback (${drift.toFixed(2)} m)`);
});
