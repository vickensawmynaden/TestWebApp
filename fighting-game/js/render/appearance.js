// Visual appearance per fighter, kept separate from combat data (js/sim/characters.js).
// FighterModel builds a procedural PROTOTYPE body from this description on the shared IK rig.
// To swap in a detailed rigged glTF later, replace FighterModel for that fighter; the
// animator only needs the same joint targets (see poses.js).
//
// build:   body proportions (metres at scale 1). bust > 0 adds a female chest shape.
// top:     torso covering. base: tank | crop | singlet | bodysuit | gi ; midriff = bare abdomen.
// jacket:  optional open garment over the top (sleeves: none | long).
// bottom:  trousers | shorts | singlet | trackpants | baggy | suit
// hands:   wraps | boxing | fingerless | bare ;  feet: sneaker | bare | wrestling | hightop | ankleBoot | shoe
// hair:    swept | braids | bald | ponytail | curlsTied | bob | spiky

export const APPEARANCES = {
  ren: {
    build: { shoulderW: 0.2, hipW: 0.097, upperArm: 0.29, foreArm: 0.26, thigh: 0.44, shin: 0.44, armR: 0.053, foreR: 0.045, thighR: 0.09, shinR: 0.063, torsoW: 1.03, torsoD: 0.63, neckR: 0.055 },
    skin: 0xd9aa86, eyes: 0x2a1e18,
    hair: { style: 'swept', color: 0x121014 },
    top: { base: 'tank', color: 0x2b2c31 },
    jacket: { color: 0xa3202a, trim: 0x5e1016, sleeves: 'none', collar: true },
    bottom: { style: 'trousers', color: 0x2d2e33, stripe: 0x7a1c22 },
    waist: { type: 'belt', color: 0x18181b, tails: true },
    hands: { type: 'wraps', color: 0xe9e6de },
    feet: { type: 'sneaker', color: 0x26272c, sole: 0xe8e8e8 },
    trail: 0xff5a4a, aura: [1.0, 0.35, 0.3],
  },
  maya: {
    build: { shoulderW: 0.172, hipW: 0.1, upperArm: 0.28, foreArm: 0.25, thigh: 0.44, shin: 0.43, armR: 0.044, foreR: 0.037, thighR: 0.092, shinR: 0.06, torsoW: 0.9, torsoD: 0.58, neckR: 0.047, bust: 0.55, waist: 0.84 },
    skin: 0x5e3b29, eyes: 0x1a120d,
    hair: { style: 'braids', color: 0x0d0a09 },
    top: { base: 'crop', color: 0x0f7a76, trim: 0xc9a14a, midriff: true },
    bottom: { style: 'shorts', color: 0x0f7a76, trim: 0xc9a14a },
    waist: { type: 'waistband', color: 0x141414, trim: 0xc9a14a },
    hands: { type: 'wraps', color: 0x138a82 },
    shins: { color: 0x141414, trim: 0xc9a14a },
    feet: { type: 'bare' },
    trail: 0x2fe0cf, aura: [0.2, 0.9, 0.85],
  },
  viktor: {
    build: { shoulderW: 0.265, hipW: 0.115, upperArm: 0.3, foreArm: 0.28, thigh: 0.43, shin: 0.45, armR: 0.078, foreR: 0.064, thighR: 0.125, shinR: 0.086, torsoW: 1.42, torsoD: 0.84, neckR: 0.088, belly: 1.12 },
    skin: 0xe0ae94, eyes: 0x3a4a52,
    hair: { style: 'bald', color: 0x4a3326 },
    beard: { color: 0x3a2618, full: true },
    top: { base: 'singlet', color: 0x1c2b5a, trim: 0xb3402e },
    bottom: { style: 'singlet', color: 0x1c2b5a, trim: 0xb3402e },
    waist: { type: 'waistband', color: 0xa8392a, wide: true },
    hands: { type: 'bare' },
    knees: { color: 0x1c2b5a, trim: 0xb3402e },
    feet: { type: 'wrestling', color: 0x1f2e5e, sole: 0xa8392a, laces: 0xe8e8e8 },
    trail: 0xff7a3a, aura: [1.0, 0.45, 0.2],
  },
  leila: {
    build: { shoulderW: 0.176, hipW: 0.1, upperArm: 0.28, foreArm: 0.25, thigh: 0.44, shin: 0.44, armR: 0.045, foreR: 0.038, thighR: 0.09, shinR: 0.06, torsoW: 0.9, torsoD: 0.58, neckR: 0.047, bust: 0.55, waist: 0.84 },
    skin: 0xc8956c, eyes: 0x2e2216,
    hair: { style: 'ponytail', color: 0x120d0b, tie: 0x2a52c9 },
    top: { base: 'crop', color: 0x1f47c4, midriff: true },
    jacket: { color: 0xeee9df, trim: 0x2a2a2e, sleeves: 'long', stripes: 0x202024 },
    bottom: { style: 'trackpants', color: 0x1f47c4, stripe: 0xf2f2f2 },
    waist: { type: 'drawstring', color: 0xf2f2f2 },
    hands: { type: 'boxing', color: 0x2350d8 },
    feet: { type: 'hightop', color: 0xf3f3f3, sole: 0xffffff, laces: 0x2a52c9 },
    trail: 0x5f8dff, aura: [0.35, 0.55, 1.0],
  },
  caio: {
    build: { shoulderW: 0.19, hipW: 0.095, upperArm: 0.3, foreArm: 0.27, thigh: 0.46, shin: 0.45, armR: 0.048, foreR: 0.041, thighR: 0.085, shinR: 0.058, torsoW: 0.96, torsoD: 0.6, neckR: 0.05 },
    skin: 0x8c5a3b, eyes: 0x1e140d,
    hair: { style: 'curlsTied', color: 0x140e0b },
    beard: { color: 0x140e0b, full: false },
    top: { base: 'tank', color: 0x18181a },
    jacket: { color: 0x2f6b3c, trim: 0xc9a14a, sleeves: 'none', vest: true },
    bottom: { style: 'baggy', color: 0xd9a12c, stripe: 0x2f6b3c },
    waist: { type: 'rope', color: 0xd9b35a },
    hands: { type: 'bare', bracelets: 0x2f6b3c },
    feet: { type: 'bare' },
    necklace: 0x2b1d14,
    trail: 0xffc040, aura: [1.0, 0.8, 0.25],
  },
  sora: {
    build: { shoulderW: 0.17, hipW: 0.098, upperArm: 0.29, foreArm: 0.26, thigh: 0.45, shin: 0.45, armR: 0.042, foreR: 0.036, thighR: 0.084, shinR: 0.057, torsoW: 0.87, torsoD: 0.56, neckR: 0.045, bust: 0.45, waist: 0.86 },
    skin: 0xf0cdb8, eyes: 0x5b6a7a,
    hair: { style: 'bob', color: 0xc9ccd2 },
    top: { base: 'bodysuit', color: 0x4a1f3d, trim: 0x9aa0aa, highNeck: true },
    bottom: { style: 'suit', color: 0x4a1f3d, stripe: 0x9aa0aa },
    waist: { type: 'belt', color: 0x2a2a2e, buckle: 0x9aa0aa },
    hands: { type: 'fingerless', color: 0x1c1c20 },
    forearm: { color: 0xb8bcc4 },
    knees: { color: 0x3a1832, trim: 0x9aa0aa, metal: true },
    feet: { type: 'ankleBoot', color: 0x1e1e22, sole: 0x111113, strap: 0x9aa0aa },
    trail: 0xd0a0ff, aura: [0.8, 0.6, 1.0],
  },
  kai: {
    build: { shoulderW: 0.19, hipW: 0.095, upperArm: 0.29, foreArm: 0.26, thigh: 0.44, shin: 0.44, armR: 0.05, foreR: 0.043, thighR: 0.088, shinR: 0.062, torsoW: 1.0, torsoD: 0.62, neckR: 0.052 },
    skin: 0xc58f68, eyes: 0x1a2c55,
    hair: { style: 'spiky', color: 0x0b0d14, band: 0x3d8bff },
    top: { base: 'gi', color: 0x1c4fbf, trim: 0x0d0f14 },
    bottom: { style: 'trousers', color: 0x14161b, stripe: 0x3d8bff },
    waist: { type: 'belt', color: 0x2f74ff, tails: true },
    hands: { type: 'fingerless', color: 0x15171c },
    feet: { type: 'shoe', color: 0x0c0d11, sole: 0x0d0f14 },
    trail: 0x5aa8ff, aura: [0.3, 0.6, 1.0],
  },
};
