// Character definitions and move lists with frame data.
// startup = first active frame ("i10" = hits on frame 10), active = active frame count,
// recovery = frames after the last active frame. block / hit = frame advantage for the attacker.
// onHit / onCH = special hit reactions: 'launch' | 'knockdown' | 'wallsplat' | 'crumple'.
import { B1, B2, B3, B4 } from './constants.js';

const KAI_MOVES = [
  // ---- Punches -------------------------------------------------------------------------
  { id: 'kai_1', name: 'Jab', cmd: '1', level: 'high', dmg: 7, startup: 10, active: 2, recovery: 14, block: 1, hit: 8,
    reach: 0.62, radius: 0.17, limb: 'lHand', anim: 'jabL', sfx: 'light',
    strings: [{ cmd: '2', to: 'kai_12' }, { cmd: '1', to: 'kai_11' }] },
  { id: 'kai_11', name: 'Double Jab', cmd: '1', inString: true, level: 'high', dmg: 6, startup: 9, active: 2, recovery: 15, block: 0, hit: 7,
    reach: 0.62, radius: 0.17, limb: 'lHand', anim: 'jabL', sfx: 'light',
    strings: [{ cmd: '2', to: 'kai_12' }] },
  { id: 'kai_12', name: 'One-Two', cmd: '2', inString: true, level: 'high', dmg: 10, startup: 9, active: 2, recovery: 17, block: -3, hit: 6,
    reach: 0.68, radius: 0.18, limb: 'rHand', anim: 'crossR', sfx: 'medium',
    strings: [{ cmd: '4', to: 'kai_124' }] },
  { id: 'kai_124', name: 'One-Two Crescent', cmd: '4', inString: true, level: 'high', dmg: 17, startup: 14, active: 3, recovery: 26, block: -12, hit: 0,
    onHit: 'knockdown', reach: 0.82, radius: 0.24, limb: 'rFoot', anim: 'roundR', sfx: 'heavy', tracking: 2 },
  { id: 'kai_2', name: 'Right Straight', cmd: '2', level: 'high', dmg: 10, startup: 11, active: 2, recovery: 18, block: -2, hit: 8,
    reach: 0.7, radius: 0.18, limb: 'rHand', anim: 'crossR', sfx: 'medium',
    strings: [{ cmd: '1', to: 'kai_21' }] },
  { id: 'kai_21', name: 'Cross Body Hook', cmd: '1', inString: true, level: 'mid', dmg: 13, startup: 11, active: 2, recovery: 21, block: -9, hit: 3,
    onCH: 'crumple', reach: 0.55, radius: 0.22, limb: 'lHand', anim: 'bodyHookL', sfx: 'medium', tracking: 3 },
  { id: 'kai_df1', name: 'Elbow Check', cmd: 'df+1', level: 'mid', dmg: 11, startup: 13, active: 2, recovery: 19, block: 1, hit: 6,
    reach: 0.55, radius: 0.2, limb: 'lHand', hitPoint: [0.02, 1.3, 0.55], anim: 'elbowL', sfx: 'medium' },
  { id: 'kai_df2', name: 'Rising Uppercut', cmd: 'df+2', level: 'mid', dmg: 13, startup: 15, active: 2, recovery: 24, block: -13, hit: 0,
    onHit: 'launch', launch: 0.1, reach: 0.52, radius: 0.24, limb: 'rHand', hitPoint: [0.02, 1.4, 0.52], anim: 'uppercutR', sfx: 'heavy' },
  { id: 'kai_d1', name: 'Crouch Jab', cmd: 'd+1', level: 'low', dmg: 5, startup: 10, active: 2, recovery: 14, block: -5, hit: 6,
    crouching: true, reach: 0.58, radius: 0.18, limb: 'lHand', anim: 'crouchJab', sfx: 'light' },
  { id: 'kai_d4', name: 'Dragon Sweep', cmd: 'd+4', level: 'low', dmg: 12, startup: 16, active: 3, recovery: 30, block: -14, hit: 3,
    onCH: 'knockdown', crouching: true, reach: 0.86, radius: 0.24, limb: 'rFoot', anim: 'sweepR', sfx: 'medium', tracking: 2 },
  // ---- Kicks ---------------------------------------------------------------------------
  { id: 'kai_3', name: 'Snap Kick', cmd: '3', level: 'mid', dmg: 12, startup: 13, active: 2, recovery: 21, block: -6, hit: 4,
    reach: 0.78, radius: 0.2, limb: 'lFoot', anim: 'frontKickL', sfx: 'medium',
    strings: [{ cmd: '4', to: 'kai_34s' }] },
  { id: 'kai_34s', name: 'Twin Wind', cmd: '4', inString: true, level: 'high', dmg: 15, startup: 13, active: 3, recovery: 26, block: -11, hit: 0,
    onHit: 'knockdown', reach: 0.86, radius: 0.24, limb: 'rFoot', anim: 'roundR', sfx: 'heavy', tracking: 2 },
  { id: 'kai_4', name: 'Roundhouse', cmd: '4', level: 'high', dmg: 16, startup: 14, active: 3, recovery: 24, block: -9, hit: 6,
    onCH: 'knockdown', reach: 0.86, radius: 0.24, limb: 'rFoot', anim: 'roundR', sfx: 'heavy', tracking: 2.5 },
  { id: 'kai_uf4', name: 'Flying Knee', cmd: 'uf+4', level: 'mid', dmg: 15, startup: 15, active: 3, recovery: 25, block: -13, hit: 0,
    onHit: 'launch', launch: 0.095, airborne: [6, 20], advance: 0.55, reach: 0.45, radius: 0.26, limb: 'rKnee', hitPoint: [0.05, 1.0, 0.45], anim: 'flyingKnee', sfx: 'heavy' },
  { id: 'kai_34', name: 'Whirlwind Kick', cmd: '3+4', level: 'mid', dmg: 18, startup: 18, active: 4, recovery: 26, block: -12, hit: 0,
    onHit: 'knockdown', tracking: 99, reach: 0.82, radius: 0.3, limb: 'rFoot', anim: 'spinKick', sfx: 'heavy' },
  // ---- Specials -------------------------------------------------------------------------
  { id: 'kai_ff2', name: 'Tiger Palm', cmd: 'f,f+2', level: 'mid', dmg: 20, startup: 15, active: 3, recovery: 24, block: -8, hit: 0,
    onHit: 'wallsplat', push: 1.6, advance: 0.75, reach: 0.6, radius: 0.24, limb: 'rHand', anim: 'palmR', sfx: 'heavy', special: true },
  { id: 'kai_qcf1', name: 'Azure Dragon Fist', cmd: 'qcf+1', level: 'mid', dmg: 24, startup: 18, active: 3, recovery: 26, block: -15, hit: 0,
    onHit: 'knockdown', onCH: 'crumple', push: 1.2, advance: 0.45, reach: 0.65, radius: 0.26, limb: 'lHand', anim: 'dragonFist', sfx: 'heavy', special: true },
  { id: 'kai_b12', name: 'Flow Parry', cmd: 'b+1+2', level: 'parry', dmg: 0, startup: 3, active: 16, recovery: 16, block: 0, hit: 0,
    parry: [3, 18], counter: 'kai_parry_strike', anim: 'parry', special: true },
  { id: 'kai_parry_strike', name: 'Counter Palm', cmd: 'auto', inString: true, level: 'mid', dmg: 22, startup: 5, active: 3, recovery: 26, block: -10, hit: 0,
    onHit: 'wallsplat', push: 1.8, reach: 0.65, radius: 0.32, limb: 'rHand', anim: 'palmR', sfx: 'heavy', tracking: 99 },
  { id: 'kai_air', name: 'Falling Axe Kick', cmd: 'air', level: 'mid', dmg: 14, startup: 8, active: 6, recovery: 10, block: -4, hit: 4,
    reach: 0.7, radius: 0.28, limb: 'rFoot', anim: 'airKick', sfx: 'medium' },
  // ---- Throws ---------------------------------------------------------------------------
  { id: 'kai_t1', name: 'Shoulder Throw', cmd: '1+3', level: 'throw', dmg: 35, startup: 12, active: 2, recovery: 28, breakMask: B1,
    reach: 0.95, anim: 'throwGrab', throwAnim: 'shoulderThrow', sfx: 'heavy' },
  { id: 'kai_t2', name: 'Spinning Sweep Throw', cmd: '2+4', level: 'throw', dmg: 35, startup: 12, active: 2, recovery: 28, breakMask: B2,
    reach: 0.95, anim: 'throwGrab', throwAnim: 'spinThrow', sfx: 'heavy' },
  // ---- Rage Art -------------------------------------------------------------------------
  { id: 'kai_rage', name: 'Storm of Azure', cmd: 'df+1+2', rage: true, level: 'mid', dmg: 55, startup: 20, active: 4, recovery: 40, block: -25, hit: 0,
    onHit: 'knockdown', armor: [1, 23], tracking: 99, push: 2.2, advance: 0.5, reach: 0.7, radius: 0.34, limb: 'rHand', anim: 'rageArt', sfx: 'heavy', special: true },
];


// ======================================================================================
// Roster from the concept sheet (public/references/fighter-roster.png).
// Every fighter: a signature jab on 1, shared basic 2 / 3 / 4, three directional signature
// attacks and a breakable 1+3 throw. No strings or launchers: attacks are standalone.
// hitstun / blockstun are counted from the frame the attack connects (first active frame);
// frame advantage is derived from them. ALL VALUES ARE STARTING POINTS THAT NEED PLAYTESTING.
// ======================================================================================

const STANDARD_THROW_DMG = 12;

// Shared basics, tuned per fighter with { spd, rec, dmg, kickReach }.
function basics(id, o = {}) {
  const spd = o.spd || 0, rec = o.rec || 0, dmg = o.dmg || 1, kr = o.kickReach || 0;
  return [
    { id: `${id}_2`, name: 'Right Straight', cmd: '2', level: 'high', dmg: Math.round(7 * dmg), startup: 12 + spd, active: 2, recovery: 18 + rec,
      hitstun: 22, blockstun: 16, reach: 0.7, radius: 0.18, limb: 'rHand', anim: o.anim2 || 'crossR', sfx: 'medium' },
    { id: `${id}_3`, name: 'Left Kick', cmd: '3', level: 'mid', dmg: Math.round(8 * dmg), startup: 14 + spd, active: 2, recovery: 22 + rec,
      hitstun: 24, blockstun: 15, reach: 0.8 + kr, radius: 0.2, limb: 'lFoot', anim: o.anim3 || 'frontKickL', sfx: 'medium' },
    { id: `${id}_4`, name: 'Right Kick', cmd: '4', level: 'high', dmg: Math.round(9 * dmg), startup: 15 + spd, active: 3, recovery: 24 + rec,
      hitstun: 28, blockstun: 16, reach: 0.86 + kr, radius: 0.24, limb: 'rFoot', anim: o.anim4 || 'roundR', sfx: 'heavy', tracking: 1.5 },
  ];
}

function standardThrow(id, o = {}) {
  return { id: `${id}_t`, name: o.name || 'Clinch Throw', cmd: '1+3', level: 'throw', dmg: o.dmg || STANDARD_THROW_DMG,
    startup: o.startup || 12, active: 2, recovery: 28, breakMask: B1, reach: 0.95, anim: 'throwGrab', throwAnim: o.throwAnim || 'shoulderThrow', sfx: 'heavy', special: !!o.name };
}

const REN_MOVES = [
  { id: 'ren_1', name: 'Anchor Jab', cmd: '1', level: 'high', dmg: 5, startup: 10, active: 2, recovery: 14, hitstun: 21, blockstun: 16,
    reach: 0.66, radius: 0.17, limb: 'lHand', anim: 'renJab', sfx: 'light', signature: true },
  ...basics('ren'),
  { id: 'ren_f2', name: 'Harbor Palm', cmd: 'f+2', level: 'mid', dmg: 11, startup: 14, active: 3, recovery: 20, hitstun: 26, blockstun: 14,
    advance: 0.2, push: 0.5, reach: 0.7, radius: 0.22, limb: 'rHand', anim: 'renPalm', sfx: 'medium', signature: true },
  { id: 'ren_d3', name: 'Stone Sweep', cmd: 'd+3', level: 'low', dmg: 9, startup: 16, active: 3, recovery: 26, hitstun: 26, blockstun: 12,
    crouching: true, reach: 0.85, radius: 0.24, limb: 'lFoot', anim: 'renSweep', sfx: 'medium', signature: true },
  { id: 'ren_b4', name: 'Crescent Heel', cmd: 'b+4', level: 'mid', dmg: 16, startup: 20, active: 3, recovery: 26, hitstun: 0, blockstun: 16,
    onHit: 'knockdown', tracking: 1.5, reach: 0.85, radius: 0.26, limb: 'rFoot', anim: 'renCrescent', sfx: 'heavy', signature: true },
  standardThrow('ren'),
];

const MAYA_MOVES = [
  { id: 'maya_1', name: 'Reef Jab', cmd: '1', level: 'high', dmg: 4, startup: 9, active: 2, recovery: 13, hitstun: 20, blockstun: 15,
    reach: 0.62, radius: 0.16, limb: 'lHand', anim: 'mayaJab', sfx: 'light', signature: true },
  ...basics('maya', { spd: -1, dmg: 0.85, anim3: 'mayaTeep', anim4: 'mayaRound' }),
  { id: 'maya_f1', name: 'Twin-Step Elbow', cmd: 'f+1', level: 'mid', dmg: 8, startup: 12, active: 2, recovery: 17, hitstun: 22, blockstun: 15,
    advance: 0.35, reach: 0.5, radius: 0.2, limb: 'lElbow', hitPoint: [0.0, 1.25, 0.52], anim: 'mayaElbow', sfx: 'medium', signature: true },
  { id: 'maya_d4', name: 'Coral Low Kick', cmd: 'd+4', level: 'low', dmg: 6, startup: 13, active: 2, recovery: 18, hitstun: 20, blockstun: 11,
    reach: 0.8, radius: 0.22, limb: 'rFoot', anim: 'mayaLowKick', sfx: 'medium', signature: true },
  { id: 'maya_f4', name: 'Breaker Knee', cmd: 'f+4', level: 'mid', dmg: 13, startup: 16, active: 3, recovery: 24, hitstun: 0, blockstun: 14,
    onHit: 'knockdown', advance: 0.3, reach: 0.5, radius: 0.26, limb: 'rKnee', hitPoint: [0.05, 1.05, 0.5], anim: 'mayaKnee', sfx: 'heavy', signature: true },
  standardThrow('maya'),
];

const VIKTOR_MOVES = [
  { id: 'vik_1', name: 'Hammer Knuckle', cmd: '1', level: 'high', dmg: 8, startup: 12, active: 2, recovery: 18, hitstun: 24, blockstun: 17,
    reach: 0.68, radius: 0.2, limb: 'lHand', anim: 'vikKnuckle', sfx: 'medium', signature: true },
  ...basics('vik', { spd: 2, rec: 3, dmg: 1.2, anim2: 'hookR' }),
  { id: 'vik_f2', name: 'Dockyard Shoulder', cmd: 'f+2', level: 'mid', dmg: 14, startup: 18, active: 3, recovery: 22, hitstun: 28, blockstun: 18,
    advance: 0.55, push: 1.0, reach: 0.45, radius: 0.32, limb: 'body', hitPoint: [-0.15, 1.3, 0.45], anim: 'shoulderRam', sfx: 'heavy', signature: true },
  { id: 'vik_d4', name: 'Anchor Stomp', cmd: 'd+4', level: 'low', dmg: 12, startup: 19, active: 3, recovery: 26, hitstun: 28, blockstun: 12,
    reach: 0.65, radius: 0.3, limb: 'rFoot', anim: 'vikStomp', sfx: 'heavy', signature: true },
  { id: 'vik_b2', name: 'Collar Hammer', cmd: 'b+2', level: 'mid', dmg: 18, startup: 22, active: 3, recovery: 28, hitstun: 0, blockstun: 16,
    onHit: 'knockdown', reach: 0.66, radius: 0.28, limb: 'rHand', anim: 'hammerR', sfx: 'heavy', signature: true },
  standardThrow('vik', { name: 'Foundry Drop', dmg: 18, startup: 13, throwAnim: 'suplex' }),
];

const LEILA_MOVES = [
  { id: 'leila_1', name: 'Measure Jab', cmd: '1', level: 'high', dmg: 5, startup: 9, active: 2, recovery: 13, hitstun: 21, blockstun: 16,
    reach: 0.66, radius: 0.18, limb: 'lHand', anim: 'leilaJab', sfx: 'light', signature: true },
  ...basics('leila', { dmg: 0.9, anim3: 'leilaKick' }),
  { id: 'leila_b2', name: 'Check Hook', cmd: 'b+2', level: 'high', dmg: 10, startup: 13, active: 2, recovery: 20, hitstun: 25, blockstun: 14,
    startupBonus: 0.3, tracking: 2, reach: 0.6, radius: 0.22, limb: 'rHand', anim: 'leilaHook', sfx: 'medium', signature: true },
  { id: 'leila_f2', name: 'Body Cross', cmd: 'f+2', level: 'mid', dmg: 11, startup: 14, active: 2, recovery: 19, hitstun: 25, blockstun: 14,
    advance: 0.15, reach: 0.66, radius: 0.2, limb: 'rHand', anim: 'leilaBody', sfx: 'medium', signature: true },
  { id: 'leila_d4', name: 'Toe Stamp', cmd: 'd+4', level: 'low', dmg: 6, startup: 12, active: 2, recovery: 16, hitstun: 19, blockstun: 10,
    reach: 0.55, radius: 0.24, limb: 'rFoot', anim: 'leilaStamp', sfx: 'light', signature: true },
  standardThrow('leila'),
];

const CAIO_MOVES = [
  { id: 'caio_1', name: 'Ginga Palm', cmd: '1', level: 'high', dmg: 5, startup: 11, active: 2, recovery: 15, hitstun: 21, blockstun: 16,
    reach: 0.66, radius: 0.18, limb: 'lHand', anim: 'caioPalm', sfx: 'light', signature: true },
  ...basics('caio', { spd: 2, kickReach: 0.12, anim3: 'caioMeia', anim4: 'caioRound' }),
  { id: 'caio_f3', name: 'Orbit Heel', cmd: 'f+3', level: 'mid', dmg: 12, startup: 19, active: 4, recovery: 26, hitstun: 30, blockstun: 14,
    tracking: 3, reach: 0.95, radius: 0.26, limb: 'rFoot', anim: 'caioOrbit', sfx: 'heavy', signature: true },
  { id: 'caio_d4', name: 'Rasteira', cmd: 'd+4', level: 'low', dmg: 10, startup: 20, active: 3, recovery: 30, hitstun: 0, blockstun: 12,
    onHit: 'knockdown', crouching: true, reach: 0.95, radius: 0.26, limb: 'rFoot', anim: 'caioRasteira', sfx: 'medium', signature: true },
  { id: 'caio_b4', name: 'Compass Kick', cmd: 'b+4', level: 'high', dmg: 17, startup: 24, active: 3, recovery: 32, hitstun: 0, blockstun: 16,
    onHit: 'knockdown', reach: 1.05, radius: 0.26, limb: 'rFoot', anim: 'caioCompass', sfx: 'heavy', signature: true },
  standardThrow('caio'),
];

const SORA_MOVES = [
  { id: 'sora_1', name: 'Needle Strike', cmd: '1', level: 'high', dmg: 5, startup: 10, active: 2, recovery: 13, hitstun: 21, blockstun: 15,
    reach: 0.7, radius: 0.15, limb: 'lHand', anim: 'soraNeedle', sfx: 'light', signature: true },
  ...basics('sora', { anim3: 'soraKick' }),
  { id: 'sora_f2', name: 'Vector Palm', cmd: 'f+2', level: 'mid', dmg: 10, startup: 13, active: 2, recovery: 18, hitstun: 24, blockstun: 14,
    reach: 0.68, radius: 0.2, limb: 'rHand', anim: 'soraPalm', sfx: 'medium', signature: true },
  { id: 'sora_d3', name: 'Cutline Kick', cmd: 'd+3', level: 'low', dmg: 8, startup: 14, active: 2, recovery: 20, hitstun: 22, blockstun: 12,
    reach: 0.82, radius: 0.22, limb: 'lFoot', anim: 'soraCut', sfx: 'medium', signature: true },
  { id: 'sora_f4', name: 'Axis Heel', cmd: 'f+4', level: 'mid', dmg: 13, startup: 17, active: 3, recovery: 22, hitstun: 28, blockstun: 15,
    sideStep: { from: 2, to: 12, dist: 0.35 }, reach: 0.82, radius: 0.24, limb: 'rFoot', anim: 'soraAxis', sfx: 'heavy', signature: true },
  standardThrow('sora'),
];

// Kai is kept from the original game as a bonus fighter, rescaled to the 100-HP rules.
const KAI_DMG_SCALE = 100 / 170;
const KAI_SCALED = KAI_MOVES.map((m) => ({ ...m, dmg: m.level === 'throw' ? STANDARD_THROW_DMG : Math.max(1, Math.round(m.dmg * KAI_DMG_SCALE)) }));

const ROSTER_IMAGE = 'public/references/fighter-roster.png';

export const CHARACTERS = {
  ren: {
    id: 'ren', name: 'REN', fullName: 'Ren Arashi', style: 'Karate', portrait: { image: ROSTER_IMAGE, col: 0, row: 0 },
    blurb: 'Balanced karateka. Dependable attacks and straightforward controls.',
    hp: 100, walkF: 0.03, walkB: 0.025, dash: 0.1, backdash: 0.085, ssSpeed: 0.075, ssFrames: 15,
    jumpVy: 0.155, weight: 1.0, scale: 1.0, stats: { speed: 3, power: 3, range: 3, recovery: 3 },
    ai: 'balanced', moves: REN_MOVES,
  },
  maya: {
    id: 'maya', name: 'MAYA', fullName: 'Maya Baptiste', style: 'Kickboxing', portrait: { image: ROSTER_IMAGE, col: 1, row: 0 },
    blurb: 'Fast close-range pressure: quick elbows, knees and low kicks, lower damage per hit.',
    hp: 100, walkF: 0.036, walkB: 0.03, dash: 0.11, backdash: 0.09, ssSpeed: 0.082, ssFrames: 13,
    jumpVy: 0.16, weight: 0.9, scale: 0.96, stats: { speed: 5, power: 2, range: 2, recovery: 4 },
    ai: 'pressure', moves: MAYA_MOVES,
  },
  viktor: {
    id: 'viktor', name: 'VIKTOR', fullName: 'Viktor Orlov', style: 'Grappling', portrait: { image: ROSTER_IMAGE, col: 2, row: 0 },
    blurb: 'Heavyweight grappler. Powerful close-range hits and the 18-damage Foundry Drop; slow to move and recover.',
    hp: 100, walkF: 0.025, walkB: 0.02, dash: 0.08, backdash: 0.07, ssSpeed: 0.065, ssFrames: 17,
    jumpVy: 0.14, weight: 1.25, scale: 1.08, stats: { speed: 1, power: 5, range: 3, recovery: 1 },
    ai: 'grappler', moves: VIKTOR_MOVES,
  },
  leila: {
    id: 'leila', name: 'LEILA', fullName: 'Leila Haddad', style: 'Boxing', portrait: { image: ROSTER_IMAGE, col: 0, row: 1 },
    blurb: 'Defensive boxer. Accurate punches; Check Hook deals bonus damage when it interrupts an attack.',
    hp: 100, walkF: 0.032, walkB: 0.029, dash: 0.1, backdash: 0.09, ssSpeed: 0.078, ssFrames: 14,
    jumpVy: 0.155, weight: 0.95, scale: 0.97, stats: { speed: 4, power: 3, range: 2, recovery: 5 },
    ai: 'counter', moves: LEILA_MOVES,
  },
  caio: {
    id: 'caio', name: 'CAIO', fullName: 'Caio Luz', style: 'Capoeira', portrait: { image: ROSTER_IMAGE, col: 1, row: 1 },
    blurb: 'Long flowing kicks and fast lateral movement; slow windups and punishable misses.',
    hp: 100, walkF: 0.03, walkB: 0.026, dash: 0.1, backdash: 0.088, ssSpeed: 0.09, ssFrames: 15,
    jumpVy: 0.16, weight: 0.95, scale: 1.0, stats: { speed: 4, power: 4, range: 5, recovery: 1 },
    ai: 'kicker', moves: CAIO_MOVES,
  },
  sora: {
    id: 'sora', name: 'SORA', fullName: 'Sora Kestrel', style: 'Precision Combat', portrait: { image: ROSTER_IMAGE, col: 2, row: 1 },
    blurb: 'Careful spacing and precise strikes; Axis Heel steps off-line during startup.',
    hp: 100, walkF: 0.031, walkB: 0.028, dash: 0.1, backdash: 0.09, ssSpeed: 0.078, ssFrames: 14,
    jumpVy: 0.155, weight: 0.92, scale: 0.97, stats: { speed: 4, power: 3, range: 4, recovery: 4 },
    ai: 'whiffPunisher', moves: SORA_MOVES,
  },
  kai: {
    id: 'kai', name: 'KAI', fullName: 'Kai Arashi', style: 'Azure Flow Kenpo (bonus)', portrait: null,
    blurb: 'Bonus fighter from the original build: strings, launchers, parry and a Rage Art.',
    hp: 100, walkF: 0.034, walkB: 0.028, dash: 0.105, backdash: 0.09, ssSpeed: 0.08, ssFrames: 14,
    jumpVy: 0.16, weight: 0.95, scale: 1.0, stats: { speed: 5, power: 3, range: 3, recovery: 4 },
    ai: 'balanced', moves: KAI_SCALED,
  },
};

export const ROSTER = ['ren', 'maya', 'viktor', 'leila', 'caio', 'sora', 'kai'];
export const BUTTONS = { B1, B2, B3, B4 };
