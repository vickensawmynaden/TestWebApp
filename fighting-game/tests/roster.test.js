// Per-fighter checks for the six roster fighters: every strike hits once for its listed damage,
// is blocked by the correct guard, beats the wrong guard, whiffs out of range and recovers fully.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, inp, run, setDistance } from './helpers.js';
import { CHARACTERS } from '../js/sim/characters.js';
import { Match } from '../js/sim/match.js';
import { CpuAI } from '../js/sim/ai.js';
import { B1, B2, B3, B4 } from '../js/sim/constants.js';

const SIX = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora'];
const DIRS = { f: 6, b: 4, d: 2, df: 3, db: 1, u: 8, uf: 9, ub: 7 };

function cmdInput(spec) {
  let btn = '';
  if (spec.buttons & B1) btn += '1'; if (spec.buttons & B2) btn += '2';
  if (spec.buttons & B3) btn += '3'; if (spec.buttons & B4) btn += '4';
  return { dir: spec.dir ? DIRS[spec.dir] : 5, btn };
}

const STAND_GUARD = () => { const i = inp(1); i.guard = true; return i; };
const CROUCH_GUARD = () => inp(1, 1);

// Performs move `m` with fighter 0 (character `id`) against `defInput` and returns the outcome.
function perform(id, m, dist, defInput) {
  const w = makeWorld(id, 'ren', dist);
  run(w, 8, inp(0), defInput(0));
  const { dir, btn } = cmdInput(m.spec);
  w.step([inp(0, dir, btn), defInput(1)]);
  const a = w.fighters[0], d = w.fighters[1];
  assert.equal(a.move?.id, m.id, `${m.id} should start from "${m.cmd}"`);
  let hits = 0, blocks = 0, framesInAttack = 1;
  for (let k = 0; k < m.total + 60; k++) {
    w.step([inp(0, dir === 2 && k < 2 ? 2 : 5), defInput(k + 2)]);
    if (a.state === 'attack' && a.move?.id === m.id) framesInAttack++;
    for (const e of w.events) {
      if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 0) hits++;
      if (e.type === 'block' && e.attacker === 0) blocks++;
    }
    w.events.length = 0;
  }
  return { w, hits, blocks, dmg: d.def.hp - d.hp, framesInAttack };
}

for (const id of SIX) {
  const def = CHARACTERS[id];
  const strikes = makeWorld(id, 'ren').fighters[0].commandMoves.filter((m) => m.level !== 'throw');

  test(`${def.fullName}: has a signature jab on 1, basics on 2/3/4 and three directional signatures`, () => {
    const cmds = strikes.map((m) => m.cmd);
    for (const c of ['1', '2', '3', '4']) assert.ok(cmds.includes(c), `${id} missing ${c}`);
    const jab = strikes.find((m) => m.cmd === '1');
    assert.ok(jab.signature && jab.level === 'high');
    assert.equal(strikes.filter((m) => m.signature && m.cmd !== '1').length, 3);
    for (const m of strikes) {
      for (const k of ['startup', 'active', 'recovery', 'dmg', 'level', 'blockstun']) assert.notEqual(m[k], undefined, `${m.id}.${k}`);
      assert.ok(m.hitstun !== undefined || m.onHit, `${m.id} needs hitstun or a knockdown reaction`);
    }
  });

  for (const m of strikes) {
    test(`${def.fullName}: ${m.name} (${m.cmd}, ${m.level}) hits once, blocks correctly, whiffs and recovers`, () => {
      // Hit an approaching, non-guarding opponent.
      const hit = perform(id, m, Math.max(0.8, m.hitPointLocal[2] + 0.2), () => inp(1, 6));   // walking in = not guarding
      assert.equal(hit.hits, 1, `${m.id} should hit exactly once`);
      assert.equal(hit.dmg, m.dmg, `${m.id} damage`);
      // Correct guard blocks it with no chip damage.
      const correct = m.level === 'low' ? CROUCH_GUARD : STAND_GUARD;
      const blk = perform(id, m, 0.85, correct);
      assert.equal(blk.blocks, 1, `${m.id} should be blocked by ${m.level === 'low' ? 'crouch' : 'stand'} guard`);
      assert.equal(blk.dmg, 0);
      // Wrong guard: highs whiff over crouchers, mids hit crouchers, lows hit standing guard.
      const wrong = m.level === 'low' ? STAND_GUARD : CROUCH_GUARD;
      const w2 = perform(id, m, 0.85, wrong);
      if (m.level === 'high') assert.equal(w2.hits + w2.blocks, 0, `${m.id} should whiff over a crouch`);
      else assert.equal(w2.hits, 1, `${m.id} should beat the wrong guard`);
      // Out of range: whiff and complete the full recovery.
      const miss = perform(id, m, 3.2, () => inp(1));
      assert.equal(miss.hits + miss.blocks, 0);
      assert.equal(miss.framesInAttack, m.total, `${m.id} recovery must complete`);
    });
  }

  test(`${def.fullName}: throw damage and break`, () => {
    const t = strikes.length && makeWorld(id, 'ren').fighters[0].commandMoves.find((m) => m.level === 'throw');
    assert.equal(t.dmg, id === 'viktor' ? 18 : 12);
    const w = makeWorld(id, 'ren', 0.8);
    run(w, 4);
    const th = inp(0); th.throw = true;
    w.step([th, inp(1)]);
    run(w, 100);
    assert.equal(w.fighters[1].def.hp - w.fighters[1].hp, t.dmg);
  });
}

test('Leila Check Hook: bonus damage when it hits during the opponent\'s startup', () => {
  const hook = makeWorld('leila', 'viktor').fighters[0].moveMap.get('leila_b2');
  const w = makeWorld('leila', 'viktor', 0.9);
  run(w, 4);
  w.step([inp(0), inp(1, 4, '2')]);   // Viktor Collar Hammer, i22
  run(w, 3);
  w.step([inp(0, 4, '2'), inp(1)]);   // Check Hook i13 lands inside Viktor's startup
  for (let k = 0; k < 30; k++) w.step([inp(0), inp(1)]);
  const dmgCatch = w.fighters[1].def.hp - w.fighters[1].hp;
  assert.equal(dmgCatch, Math.round(hook.dmg * (1 + hook.startupBonus)));
  assert.ok(dmgCatch > hook.dmg);
});

test('Sora Axis Heel steps sideways during startup (ordinary movement, collision intact)', () => {
  const w = makeWorld('sora', 'ren', 1.6);
  run(w, 4);
  const z0 = w.fighters[0].pos.z;
  w.step([inp(0, 6, '4'), inp(1)]);
  assert.equal(w.fighters[0].move.id, 'sora_f4');
  run(w, 14);
  assert.ok(Math.abs(w.fighters[0].pos.z - z0) > 0.3, `lateral ${(w.fighters[0].pos.z - z0).toFixed(2)}`);
});

test('Caio idle gives no evasion: his hurtbox stays standing while idle', () => {
  const w = makeWorld('ren', 'caio', 1.0);
  for (let k = 0; k < 200; k++) {
    w.step([inp(0), inp(1)]);
    assert.equal(w.fighters[1].posture(), 'stand');
  }
  w.step([inp(0, 5, '1'), inp(1, 6)]);
  run(w, 20, inp(0), inp(1, 6));
  assert.ok(w.fighters[1].hp < 100, 'idle Caio is hittable');
});

test('all six fighters can be selected and fight full CPU-vs-CPU matches', () => {
  for (const p1 of SIX) {
    const p2 = SIX[(SIX.indexOf(p1) + 1) % SIX.length];
    const m = new Match({ p1, p2, mode: 'cpu', skipIntro: true, roundTime: 30 });
    const ai = new CpuAI(3, 7);
    const used = new Set();
    for (let k = 0; k < 60 * 200 && m.phase !== 'matchOver'; k++) {
      m.tick([ai.input(m.world, m.world.fighters[0]), null]);
      for (const f of m.world.fighters) {
        if (f.state === 'attack') used.add(f.move.id);
        assert.ok(Number.isFinite(f.pos.x) && f.hp >= 0 && f.hp <= 100);
      }
    }
    assert.equal(m.phase, 'matchOver', `${p1} vs ${p2} should finish`);
    assert.ok([...used].some((id) => id.startsWith(p1 === 'viktor' ? 'vik' : p1)), `${p1} attacked`);
  }
});

test('CPU personalities: Viktor throws most, Caio sidesteps most and keeps range, Leila guards most, Maya and Viktor fight closest', () => {
  const stats = {};
  for (const id of SIX) {
    const st = { throws: 0, strikes: 0, side: 0, guard: 0, frames: 0, dist: 0 };
    for (const opp of ['ren', 'sora', 'viktor']) {
      const m = new Match({ p1: opp, p2: id, mode: 'cpu', skipIntro: true, roundTime: 60 });
      const ai = new CpuAI(2, 11);
      for (let k = 0; k < 60 * 120 && m.phase !== 'matchOver'; k++) {
        m.tick([ai.input(m.world, m.world.fighters[0]), null]);
        if (m.phase !== 'fight') continue;
        const f = m.world.fighters[1], o = m.world.fighters[0];
        st.frames++; st.dist += Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z);
        if (f.guardBtn) st.guard++;
        if (f.state === 'attack' && f.t === 0 && f.mf === 0) { if (f.move.level === 'throw') st.throws++; else st.strikes++; }
        if (f.state === 'sidestep' && f.t === 1) st.side++;
      }
    }
    stats[id] = { throwRate: st.throws / (st.throws + st.strikes), side: st.side / st.frames, guard: st.guard / st.frames, dist: st.dist / st.frames };
  }
  const top = (k, dir = 1) => SIX.reduce((a, b) => (stats[b][k] * dir > stats[a][k] * dir ? b : a));
  assert.equal(top('throwRate'), 'viktor', JSON.stringify(stats));
  assert.equal(top('side'), 'caio');
  assert.equal(top('dist'), 'caio');
  assert.equal(top('guard'), 'leila');
  const closest = [...SIX].sort((a, b) => stats[a].dist - stats[b].dist).slice(0, 2);
  assert.deepEqual(closest.sort(), ['maya', 'viktor'], 'pressure and grappler fight closest');
});
