// Combo validation harness: runs an authored route with fighter 0 against a scripted defender.
//
// Defenders:
//   open        never guards: stands still with guarding disabled (like the practice 'no guard' dummy)
//   guardAfter  unguarded until the route's first hit lands, then guards correctly (crouch for lows,
//               stand guard for highs / mids) on every frame it legally can: the earliest-guard
//               test for true combos
//   guardAll    guards correctly from the start (blocked-string tests)
//   ch          starts a slow attack (route.chBait, default b+4 = Ren's i20 heel) on frame 0 so the opener lands as a counter hit, then guards
//               like guardAfter
//   jab         after the first hit, presses jab on every frame it is free (finds gaps on hit)
//   blockDuck   guards, and after blocking `route.jabAfter` hits holds down (ducks highs)
//   blockJab    guards, and after blocking `route.jabAfter` hits presses jab (finds gaps on block)
import { World, emptyInput } from '../js/sim/world.js';
import { CHARACTERS } from '../js/sim/characters.js';
import { RouteBot, setDir, commandFrames } from '../js/sim/routes.js';

export function runRoute(attId, route, { defender = 'open', defId = 'ren', dist = null, frames = 400, near = null } = {}) {
  const w = new World(CHARACTERS[attId], CHARACTERS[defId]);
  const d0 = dist ?? route.dist ?? 1.0;
  const [A, D] = w.fighters;
  A.pos.x = -d0 / 2; D.pos.x = d0 / 2;
  if (near === 'wall') { A.pos.x = 5.2; D.pos.x = 5.2 + d0; }
  const bot = new RouteBot(route);
  const hits = [], blocks = [];
  let firstHit = false, guardOn = false;
  for (let k = 0; k < frames; k++) {
    const ai = bot.input(w, A);
    const di = emptyInput();
    // counter-hit bait: the defender starts a slow attack (default Ren's b+4, i20) on frame 0
    if (defender === 'ch' && k === (route.chAt || 0)) { const fr = commandFrames(route.chBait || 'b+4')[0]; setDir(di, D, fr.d); for (const c of fr.b) di['b' + c] = true; }
    // Unguarded defenders stand still with guarding disabled (practice-dummy "no guard"),
    // so spacing is exactly the route's start distance.
    D.noGuard = defender === 'open' || ((defender === 'guardAfter' || defender === 'jab') && !firstHit);
    const guarding = defender === 'guardAll' || ((defender === 'guardAfter' || defender === 'ch') && firstHit);
    if (guarding) {
      const lvl = A.state === 'attack' && A.move ? A.move.level : 'mid';
      if (lvl === 'low') setDir(di, D, 1); else di.guard = true;
    }
    if (defender === 'jab' && firstHit && (k % 2 === 0)) di.b1 = true;
    // blockJab: guards the opener, then presses jab on every free frame after blocking `jabAfter` hits
    if (defender === 'blockDuck') {
      if (blocks.length >= (route.jabAfter ?? 1)) setDir(di, D, 2); else di.guard = true;
    }
    if (defender === 'blockJab') {
      if (blocks.length >= (route.jabAfter ?? 1) && k % 2 === 0) { di.b1 = true; di.guard = false; }
      else { const lvl = A.state === 'attack' && A.move ? A.move.level : 'mid'; if (lvl === 'low') setDir(di, D, 1); else di.guard = true; }
    }
    w.step([ai, di]);
    for (const e of w.events) {
      if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 0) { hits.push({ move: e.move, dmg: e.dmg, frame: e.frame, counter: e.type === 'counter', combo: e.combo }); firstHit = true; }
      if (e.type === 'block' && e.attacker === 0) blocks.push({ frame: e.frame, move: A.move?.id });
      if ((e.type === 'hit' || e.type === 'counter') && e.attacker === 1) hits.push({ by: 'defender', frame: e.frame, move: e.move });
    }
    w.events.length = 0;
    if (bot.done && A.isNeutral() && (D.isNeutral() || D.state === 'down') && k > 30) { if (++guardOn > 20) break; }
  }
  const mine = hits.filter((h) => !h.by);
  return {
    hits: mine.length, blocks: blocks.length, damage: CHARACTERS[defId].hp - D.hp,
    counterHits: mine.filter((h) => h.counter).length,
    defenderHits: hits.filter((h) => h.by).length,
    sequence: mine.map((h) => h.move), aborted: bot.aborted, log: bot.log, world: w,
  };
}
