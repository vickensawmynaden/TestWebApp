// CPU and practice-mode behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../js/sim/match.js';
import { CpuAI, TrainingDummy } from '../js/sim/ai.js';
import { COMBOS } from '../js/sim/characters.js';
import { makeWorld, inp } from './helpers.js';
import { emptyInput } from '../js/sim/world.js';
import { RouteBot } from '../js/sim/routes.js';

test('CPU observations are delayed: decisions read the opponent as it was `react` frames ago', () => {
  const ai = new CpuAI(3, 5);
  const w = makeWorld('ren', 'maya', 2.0);
  ai.setup(w.fighters[1]);
  const opp = w.fighters[0];
  let first = null;
  for (let k = 0; k < 40; k++) {
    opp.state = k >= 10 ? 'attack' : 'idle';
    const seen = ai.observe(opp);
    if (first === null && seen.state === 'attack') first = k;
  }
  assert.ok(first >= 10 + ai.lv.react - 1, `saw the attack after ${first - 10} frames (react ${ai.lv.react})`);
});

test('CPU reacts once per attack execution, including repeats of the same move', () => {
  const ai = new CpuAI(3, 9);
  const w = makeWorld('ren', 'leila', 1.0);
  const [A, B] = w.fighters;
  const seqs = new Set();
  for (let k = 0; k < 400; k++) {
    w.step([k % 60 === 0 ? inp(0, 5, '4') : inp(0), ai.input(w, B)]);
    if (ai.handledSeq >= 0) seqs.add(ai.handledSeq);
  }
  assert.ok(seqs.size >= 3, `handled ${seqs.size} separate executions of the repeated kick`);
  void A;
});

test('CPU punishes a blocked unsafe attack with a punisher that is fast enough and reaches', () => {
  let punished = 0, chosen = [];
  for (let seed = 1; seed <= 6; seed++) {
    const ai = new CpuAI(3, seed, 'balanced');   // no startup-interrupt habit: tests blocking then punishing
    const orig = ai.punisher.bind(ai);
    ai.punisher = (frames, dist, self) => { const p = orig(frames, dist, self); if (p) chosen.push({ frames, startup: p.startup }); return p; };
    const w = makeWorld('maya', 'leila', 0.9);
    const [A, B] = w.fighters;
    ai.setup(B); ai.wait = 200; ai.holdGuard = true;   // waiting in guard, not attacking
    for (let k = 0; k < 160; k++) {
      const wasRecovering = A.state === 'attack';
      w.step([k === 2 ? inp(0, 3, '4') : inp(0), ai.input(w, B)]);
      for (const e of w.events) if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 1 && wasRecovering) punished++;
      w.events.length = 0;
    }
  }
  assert.ok(chosen.length > 0, 'a punisher was chosen');
  for (const c of chosen) assert.ok(c.startup <= c.frames - 2, `punisher i${c.startup} within ${c.frames} frames`);
  assert.ok(punished > 0, 'at least one punish landed');
});

test('CPU combo plans are hit-confirmed: a blocked launcher is not followed up', () => {
  const r = COMBOS.ren.find((c) => c.id === 'ren_l');
  // blocked
  const w = makeWorld('ren', 'maya', 1.0);
  const ai = new CpuAI(3, 3);
  ai.setup(w.fighters[0]);
  ai.startRoute(r, w);
  const guard = () => { const i = inp(1); i.guard = true; return i; };
  for (let k = 0; k < 120 && ai.route; k++) w.step([ai.input(w, w.fighters[0]), guard()]);
  assert.ok(ai.route === null || ai.route.done, 'route stopped');
  // on hit it continues to the end
  const w2 = makeWorld('ren', 'maya', 1.0);
  const ai2 = new CpuAI(3, 3);
  ai2.setup(w2.fighters[0]);
  ai2.startRoute(r, w2);
  let hits = 0;
  for (let k = 0; k < 200; k++) {
    const d = w2.fighters[1];
    w2.step([ai2.input(w2, w2.fighters[0]), d.combo.active ? inp(1) : inp(1, 6)]);
    for (const e of w2.events) if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 0) hits++;
    w2.events.length = 0;
  }
  assert.equal(hits, r.hits, 'confirmed route lands fully');
});

test('practice dummy modes: no guard, guard after first hit, random guard, counter hit', () => {
  const play = (mode, attackerBtn = '4', frames = 120) => {
    const m = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
    m.dummy.mode = mode;
    const w = m.world; w.fighters[0].pos.x = -0.45; w.fighters[1].pos.x = 0.45;
    const ev = [];
    for (let k = 0; k < frames; k++) { m.tick([k === 1 ? inp(0, 5, attackerBtn) : inp(0), inp(1)]); ev.push(...m.events); m.events.length = 0; }
    return ev;
  };
  assert.ok(play('stand guard').some((e) => e.type === 'block'), 'stand guard blocks');
  assert.ok(play('no guard').some((e) => e.type === 'hit'), 'no guard is hit');
  assert.ok(play('counter hit').some((e) => e.type === 'counter'), 'counter-hit mode gives counter hits');
  // guard after first hit: on 1,2,b+4 the natural 1,2 lands and the delayed heel is blocked
  const m = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
  m.dummy.mode = 'guard after first hit';
  m.world.fighters[0].pos.x = -0.5; m.world.fighters[1].pos.x = 0.5;
  const bot = new RouteBot(COMBOS.ren.find((c) => c.id === 'ren_p'));
  let hits = 0, blocks = 0;
  for (let k = 0; k < 150; k++) {
    m.tick([bot.input(m.world, m.world.fighters[0]), null]);
    for (const e of m.events) { if (e.type === 'hit' && e.attacker === 0) hits++; if (e.type === 'block' && e.attacker === 0) blocks++; }
    m.events.length = 0;
  }
  assert.equal(hits, 2); assert.equal(blocks, 1);
  // random guard guards some executions and not others
  const r = play('random guard', '4', 60);
  assert.ok(r.some((e) => e.type === 'hit' || e.type === 'block'));
});

test('practice: recording and playback, punish drill verdicts, combo demonstrations', () => {
  const m = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
  const d = m.dummy, w = m.world;
  d.mode = 'record';
  const p1 = (k) => { const i = emptyInput(); if (k < 20) i.left = true; if (k === 25) i.b1 = true; return i; };
  const startX = w.fighters[1].pos.x, p1x = w.fighters[0].pos.x;
  for (let k = 0; k < 60; k++) m.tick([p1(k), null]);
  assert.ok(w.fighters[1].pos.x !== startX, 'player input moved the dummy');
  assert.equal(w.fighters[0].pos.x, p1x, 'player fighter stayed still while recording');
  assert.equal(d.recording.length, 60);
  d.mode = 'playback';
  let dummyAttacked = false;
  for (let k = 0; k < 60; k++) { m.tick([inp(0), null]); if (w.fighters[1].state === 'attack') dummyAttacked = true; }
  assert.ok(dummyAttacked, 'playback reproduces the recorded jab');

  // Punish drill: block the unsafe attack and punish it with a jab.
  const m2 = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
  m2.dummy.mode = 'punish drill';
  const ann = [];
  for (let k = 0; k < 900; k++) {
    const P = m2.world.fighters[0], D = m2.world.fighters[1];
    let i = inp(0); i.guard = true;
    if (D.state === 'attack' && D.moveResult === 'block' && P.state === 'block' && P.t >= P.stun - 2) i = inp(0, 5, '1');
    m2.tick([i, null]);
    for (const e of m2.events) if (e.type === 'announce') ann.push(e.text);
    m2.events.length = 0;
  }
  assert.ok(ann.some((t) => t.startsWith('PUNISHED')), ann.join(' | '));

  // Combo demonstration lands the full route on the dummy.
  for (const r of COMBOS.ren) {
    const m3 = new Match({ p1: 'ren', p2: 'maya', mode: 'training' });
    m3.playComboDemo(r.id);
    let hits = 0;
    for (let k = 0; k < 300; k++) { m3.tick([inp(0), inp(1)]); for (const e of m3.events) if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 0) hits++; m3.events.length = 0; }
    assert.equal(hits, r.hits, `demo ${r.name}`);
  }
});
