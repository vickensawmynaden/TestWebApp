// Validates every advertised combo route (characters.js COMBOS) in the real simulation:
//  true combos land fully against a defender that guards at the earliest legal frame,
//  strings have their gap (blocked on hit, beaten on block by the documented defence),
//  counter-hit routes only work from a counter hit, juggles cannot be guarded once launched,
//  and recorded damage matches the measured damage. Robustness: several spacings and every
//  defender character.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS, ROSTER } from '../js/sim/characters.js';
import { runRoute } from './comboHarness.js';

for (const [id, routes] of Object.entries(COMBOS)) {
  for (const r of routes) {
    test(`${id} ${r.name} (${r.notation}) [${r.kind}]`, () => {
      const full = runRoute(id, r, { defender: r.kind === 'ch' ? 'ch' : 'open' });
      assert.equal(full.hits, r.hits, `all ${r.hits} hits land: ${full.sequence.join(' > ')}`);
      assert.equal(full.damage, r.damage, 'recorded damage matches measured');
      if ((r.kind === 'juggle' || r.kind === 'ch') && id !== 'kai') assert.ok(r.damage >= 25 && r.damage <= 35, `route damage ${r.damage} in the 25-35 target`);
      if (r.kind === 'true' || r.kind === 'juggle') {
        const g = runRoute(id, r, { defender: 'guardAfter' });
        assert.equal(g.hits, r.hits, `earliest guard cannot block it: ${g.sequence.join(' > ')} / ${g.blocks} blocked`);
        // Robust to spacing and to every defender character.
        for (const dist of [0.85, 1.0, 1.15]) assert.equal(runRoute(id, r, { defender: 'guardAfter', dist }).hits, r.hits, `at ${dist} m`);
        for (const defId of ROSTER) assert.equal(runRoute(id, r, { defender: 'guardAfter', defId }).hits, r.hits, `vs ${defId}`);
      }
      if (r.kind === 'juggle') {
        const blk = runRoute(id, r, { defender: 'guardAll' });
        assert.equal(blk.hits, 0, 'the launcher itself can be blocked');
      }
      if (r.kind === 'string') {
        const g = runRoute(id, r, { defender: 'guardAfter' });
        if (r.gapOn === 'block') assert.equal(g.hits, r.hits, 'natural on hit; the gap is on block only');
        else {
          assert.equal(g.hits, r.gapAfter, `gap: only the first ${r.gapAfter} hit(s) land vs earliest guard`);
          assert.ok(g.blocks >= 1, 'the gapped hit is blocked');
        }
        const route = { ...r, jabAfter: r.gapAfter };
        if (r.defense === 'jab') {
          const j = runRoute(id, route, { defender: 'blockJab' });
          assert.ok(j.defenderHits >= 1 && j.hits === 0, `on block the defender's jab wins the gap (def ${j.defenderHits}, att ${j.hits})`);
        }
        if (r.defense === 'duck') {
          const d = runRoute(id, route, { defender: 'blockDuck' });
          assert.equal(d.hits, 0, 'ducking beats the high extension');
        }
        if (r.defense === 'block') {
          const b = runRoute(id, r, { defender: 'guardAll' });
          assert.equal(b.hits, 0, 'correct guard blocks every hit');
        }
      }
      if (r.kind === 'ch') {
        const n = runRoute(id, r, { defender: 'guardAfter' });
        assert.ok(n.hits < r.hits, `without a counter hit the route does not continue (${n.sequence.join(' > ')})`);
        assert.equal(full.counterHits, 1);
      }
    });
  }
}
