// Combo lab: node tools/combo-lab.mjs <fighter> '<route json or combo id>' [defender] [dist]
// Prints hits, damage and the hit sequence against the chosen defender.
import { runRoute } from '../tests/comboHarness.js';
import { CHARACTERS } from '../js/sim/characters.js';
const [id, r, def = 'all', dist] = process.argv.slice(2);
const route = r.startsWith('{') ? JSON.parse(r) : (CHARACTERS[id].combos || []).find((c) => c.id === r);
for (const d of def === 'all' ? ['open', 'guardAfter', 'ch', 'jab', 'guardAll', 'blockJab', 'blockDuck'] : [def]) {
  const o = runRoute(id, route, { defender: d, dist: dist ? +dist : null });
  console.log(d.padEnd(10), `hits ${o.hits} blocks ${o.blocks} dmg ${o.damage} ch ${o.counterHits} defHits ${o.defenderHits} ${o.aborted ? 'ABORTED ' : ''}`, o.sequence.join(' > '), JSON.stringify(o.log.map((l) => l.frame)));
}
