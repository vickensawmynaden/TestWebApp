// Single normalisation path for move data. The simulation (Fighter), the move list UI, the
// training HUD and the CPU all read moves through normalizeMoves(), so displayed frame data is
// exactly what the simulation uses.
//
// Raw moves may give either hit / block advantage (Kai's original data) or hitstun / blockstun
// counted from the first active frame (the roster). Both are derived here:
//   advantage = stun - (active - 1 + recovery)    (attacker hitting on its first active frame)
//
// Strings (follow-ups) are normalised to:
//   { cmd, to, spec, window: [first, last] parent move frames in which the input is accepted,
//     exec: parent frame on which the follow-up starts (it cannot start before),
//     on: results of the parent that allow the follow-up ('hit' | 'ch' | 'block' | 'whiff'),
//     target: 'any' | 'grounded' | 'airborne' (opponent state the follow-up requires) }
//
// Juggle roles: 'launcher' (lifts a standing opponent), 'filler' (keeps an airborne opponent up),
// 'finisher' (ends the juggle: no further lift), 'starter' (ground hit). A finisher hit marks the
// combo terminal so nothing can re-float the victim afterwards.
import { parseCommand, commandPriority } from './commands.js';
import { limbHitPoint } from './hitpoints.js';

const RESULTS = ['hit', 'ch', 'block', 'whiff'];

export function normalizeMove(raw, def = {}) {
  const m = { ...raw, spec: parseCommand(raw.cmd) };
  m.active = m.active || 1;
  m.total = m.startup + m.active + m.recovery - 1;
  const afterFirstActive = m.active - 1 + m.recovery;
  if (m.level !== 'throw' && m.level !== 'parry') {
    if (raw.hitstun !== undefined) m.hit = raw.onHit ? 0 : raw.hitstun - afterFirstActive;
    else if (raw.hit !== undefined) m.hitstun = raw.hit + afterFirstActive;
    if (raw.blockstun !== undefined) m.block = raw.blockstun - afterFirstActive;
    else if (raw.block !== undefined) m.blockstun = raw.block + afterFirstActive;
    m.hitPointLocal = limbHitPoint(m, def.scale || 1, def.id);
  }
  m.role = raw.role || (raw.onHit === 'launch' ? 'launcher' : (raw.onHit === 'knockdown' || raw.onHit === 'wallsplat') ? 'finisher' : 'starter');
  m.stringSpecs = (raw.strings || []).map((s) => normalizeString(s, m));
  // Display strings shared by the move list and the training HUD.
  m.display = {
    startup: m.level === 'parry' ? '' : `i${m.startup}`,
    block: m.level === 'throw' || m.level === 'parry' ? '' : fmtAdv(m.block),
    hit: m.level === 'throw' || m.level === 'parry' ? '' : (m.onHit ? m.onHit : fmtAdv(m.hit)),
    ch: m.onCH ? m.onCH : '',
  };
  return m;
}

function normalizeString(s, parent) {
  const last = parent.startup + parent.active + Math.floor(parent.recovery * 0.6);
  return {
    ...s,
    spec: parseCommand(s.cmd),
    window: s.window || [Math.max(3, parent.startup - 4), last],
    exec: s.exec ?? parent.startup + parent.active,
    on: s.on || RESULTS,
    target: s.target || 'any',
  };
}

export const fmtAdv = (n) => (n === undefined || n === null ? '' : n > 0 ? '+' + n : String(n));

// Normalised move list for a character definition: { list, map, commandMoves }.
export function normalizeMoves(def) {
  const list = def.moves.map((m) => normalizeMove(m, def));
  const map = new Map(list.map((m) => [m.id, m]));
  const commandMoves = list.filter((m) => !m.inString).sort((a, b) => commandPriority(b.spec) - commandPriority(a.spec));
  return { list, map, commandMoves };
}

// Cached per character id (definitions are static data).
const cache = new Map();
export function movesFor(def) {
  if (!cache.has(def.id)) cache.set(def.id, normalizeMoves(def));
  return cache.get(def.id);
}
