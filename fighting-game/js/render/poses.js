// Pose library. A pose drives the procedural rig through IK targets:
//   positions are [right, up, forward] metres in the fighter's model space (1.0 scale),
//   rotations are [pitch, yaw, roll] degrees (pitch + = lean forward, yaw + = turn left, roll + = lean right).
// Unspecified keys fall back to the character's stance, so attack poses only list what changes.

export const POSE_LAYOUT = {
  pelvis: 0, hipRot: 3, chest: 6, head: 9, lHand: 12, rHand: 15, lFoot: 18, rFoot: 21,
  lElbow: 24, rElbow: 27, lKnee: 30, rKnee: 33, footPitch: 36, root: 38, rootOff: 41, footYaw: 44, open: 46,
};
export const POSE_SIZE = 48;
const SIZES = { footPitch: 2, footYaw: 2, open: 2 };

export function compilePose(def, base = null) {
  const v = base ? Float32Array.from(base) : new Float32Array(POSE_SIZE);
  for (const [k, val] of Object.entries(def)) {
    const o = POSE_LAYOUT[k];
    if (o === undefined) continue;
    const n = SIZES[k] || 3;
    for (let i = 0; i < n; i++) v[o + i] = val[i];
  }
  return v;
}

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

export const ease = {
  inOut: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - (1 - t) * (1 - t),
  in: (t) => t * t,
  snap: (t) => 1 - Math.pow(1 - t, 3),
};

// ------------------------------------------------------------------ stances
const NEUTRAL = {
  pelvis: [0, 0.87, 0], hipRot: [0, -28, 0], chest: [10, -8, 0], head: [-8, 34, 0],
  lHand: [-0.04, 1.40, 0.34], rHand: [0.12, 1.36, 0.14],
  lFoot: [-0.10, 0.075, 0.24], rFoot: [0.18, 0.075, -0.20],
  lElbow: [-0.4, -1, -0.2], rElbow: [0.6, -1, -0.3], lKnee: [-0.2, 0, 1], rKnee: [0.35, 0, 1],
  footPitch: [0, 0], root: [0, 0, 0], rootOff: [0, 0, 0], footYaw: [-12, -55], open: [0, 0],
};

export const STANCES = {
  kai: { ...NEUTRAL },
  viktor: {
    ...NEUTRAL,
    pelvis: [0, 0.84, -0.02], hipRot: [0, -18, 0], chest: [14, -6, 0], head: [-12, 22, 0],
    lHand: [-0.10, 1.30, 0.36], rHand: [0.16, 1.24, 0.18],
    lFoot: [-0.16, 0.075, 0.22], rFoot: [0.24, 0.075, -0.20],
    lElbow: [-0.8, -1, -0.1], rElbow: [0.9, -1, -0.2],
  },
};

// ------------------------------------------------------------------ generic states
export const STATE_POSES = {
  crouch: { pelvis: [0, 0.55, -0.04], chest: [24, -10, 0], head: [-22, 30, 0], lHand: [-0.06, 1.05, 0.34], rHand: [0.12, 1.0, 0.18],
    lFoot: [-0.14, 0.075, 0.24], rFoot: [0.22, 0.075, -0.18], lKnee: [-0.3, 0.2, 1], rKnee: [0.4, 0.2, 1] },
  blockHigh: { chest: [6, -14, 0], head: [6, 30, 0], lHand: [-0.06, 1.55, 0.28], rHand: [0.1, 1.52, 0.22], lElbow: [-0.2, -1, 0.4], rElbow: [0.3, -1, 0.4], pelvis: [0, 0.85, -0.03] },
  blockLow: { pelvis: [0, 0.56, -0.06], chest: [26, -14, 0], head: [-14, 30, 0], lHand: [-0.06, 1.12, 0.3], rHand: [0.1, 1.08, 0.22],
    lFoot: [-0.14, 0.075, 0.22], rFoot: [0.22, 0.075, -0.2], lKnee: [-0.3, 0.2, 1], rKnee: [0.4, 0.2, 1] },
  hitHigh: { chest: [-22, 0, -6], head: [-30, 20, 10], pelvis: [0, 0.86, -0.06], lHand: [-0.25, 1.25, 0.15], rHand: [0.3, 1.2, -0.05], open: [1, 1] },
  hitMid: { chest: [38, -10, 0], head: [10, 20, 0], pelvis: [0, 0.8, -0.1], lHand: [-0.12, 1.0, 0.25], rHand: [0.12, 0.98, 0.2], lElbow: [-0.6, -1, 0], rElbow: [0.6, -1, 0] },
  hitLow: { pelvis: [0, 0.8, -0.04], chest: [18, -6, 6], lFoot: [-0.06, 0.25, 0.1], lKnee: [-0.2, 0.3, 1], lHand: [-0.25, 1.2, 0.2], rHand: [0.3, 1.15, 0.05], open: [1, 1] },
  dash: { pelvis: [0, 0.8, 0.06], chest: [26, -6, 0], head: [-18, 25, 0] },
  run: { pelvis: [0, 0.85, 0.05], hipRot: [0, -6, 0], chest: [22, 0, 0], head: [-16, 6, 0], lHand: [-0.2, 1.15, 0.2], rHand: [0.2, 1.15, -0.1], lElbow: [-0.3, -1, -0.6], rElbow: [0.3, -1, -0.6], footYaw: [0, 0] },
  backdash: { pelvis: [0, 0.82, -0.06], chest: [-6, -12, 0], head: [6, 34, 0], lFoot: [-0.1, 0.14, 0.1] },
  sidestepIn: { pelvis: [0, 0.8, 0], chest: [12, -8, -10], lFoot: [-0.02, 0.12, 0.16], rFoot: [0.26, 0.075, -0.14] },
  sidestepOut: { pelvis: [0, 0.8, 0], chest: [12, -8, 10], lFoot: [-0.22, 0.075, 0.2], rFoot: [0.08, 0.12, -0.16] },
  prejump: { pelvis: [0, 0.7, 0], chest: [20, -8, 0], lHand: [-0.1, 1.1, 0.3], rHand: [0.18, 1.05, 0.05] },
  jump: { pelvis: [0, 0.92, 0], chest: [14, -10, 0], lFoot: [-0.1, 0.55, 0.22], rFoot: [0.16, 0.45, -0.1], lKnee: [-0.2, 0.3, 1], rKnee: [0.3, 0.2, 1], lHand: [-0.1, 1.5, 0.3], rHand: [0.18, 1.45, 0.1] },
  land: { pelvis: [0, 0.66, 0], chest: [26, -8, 0] },
  // Juggled / falling: whole body tipped backwards, limbs loose.
  air: { root: [-70, 0, 0], pelvis: [0, 0.9, 0], hipRot: [0, 0, 0], chest: [-10, 0, 0], head: [-20, 0, 0],
    lHand: [-0.35, 1.6, -0.05], rHand: [0.35, 1.55, 0.1], lFoot: [-0.15, 0.25, 0.25], rFoot: [0.15, 0.35, 0.05], open: [1, 1],
    lElbow: [-1, 0, 0], rElbow: [1, 0, 0], lKnee: [0, 0, 1], rKnee: [0, 0, 1], footYaw: [0, 0] },
  down: { root: [-90, 0, 0], rootOff: [0, -0.72, -0.35], pelvis: [0, 0.9, 0], hipRot: [0, 0, 0], chest: [-4, 0, 0], head: [-10, 0, 10],
    lHand: [-0.42, 1.25, 0.0], rHand: [0.38, 1.4, -0.05], lFoot: [-0.18, 0.08, 0.05], rFoot: [0.2, 0.12, 0.12], open: [1, 1],
    lElbow: [-1, 0, -0.3], rElbow: [1, 0, -0.3], lKnee: [0, 0, 1], rKnee: [0.2, 0, 1], footYaw: [0, 0] },
  faceDown: { root: [90, 0, 0], rootOff: [0, -0.72, 0.35], pelvis: [0, 0.9, 0], hipRot: [0, 0, 0], chest: [0, 0, 0], head: [-30, 30, 0],
    lHand: [-0.35, 1.45, 0.2], rHand: [0.35, 1.3, 0.15], lFoot: [-0.18, 0.08, -0.05], rFoot: [0.2, 0.1, -0.05], open: [1, 1], footYaw: [0, 0] },
  wall: { pelvis: [0, 0.82, -0.12], chest: [-28, 0, 8], head: [20, 10, 20], hipRot: [0, 0, 0],
    lHand: [-0.38, 1.0, -0.15], rHand: [0.38, 0.95, -0.12], lElbow: [-1, -1, 0], rElbow: [1, -1, 0], open: [1, 1], lFoot: [-0.16, 0.075, 0.18], rFoot: [0.18, 0.075, 0.12], footYaw: [0, 0] },
  crumple: { pelvis: [0, 0.48, 0.05], hipRot: [0, 0, 0], chest: [45, 0, 10], head: [40, 0, 20], lHand: [-0.3, 0.6, 0.25], rHand: [0.25, 0.5, 0.3], open: [1, 1],
    lFoot: [-0.16, 0.075, 0.1], rFoot: [0.18, 0.075, -0.1], lKnee: [-0.2, 0, 1], rKnee: [0.2, 0, 1], footYaw: [0, 0] },
  parried: { chest: [-18, 25, 0], head: [-20, 10, 0], pelvis: [0, 0.84, -0.06], lHand: [-0.45, 1.45, -0.05], rHand: [0.4, 1.35, -0.1], open: [1, 1] },
  thrown: { chest: [-10, 0, 0], head: [-15, 0, 0], hipRot: [0, 0, 0], lHand: [-0.15, 1.35, 0.25], rHand: [0.15, 1.35, 0.25], open: [1, 1] },
  throwHold: { pelvis: [0, 0.82, 0.04], hipRot: [0, -6, 0], chest: [16, 0, 0], head: [-10, 6, 0], lHand: [-0.18, 1.38, 0.5], rHand: [0.18, 1.32, 0.5], lElbow: [-1, -0.6, 0], rElbow: [1, -0.6, 0] },
  throwLift: { pelvis: [0, 0.75, 0], hipRot: [0, 40, 0], chest: [-20, 30, 0], head: [-20, -20, 0], lHand: [-0.2, 1.9, 0.2], rHand: [0.2, 1.85, 0.15], lElbow: [-1, 0.2, 0], rElbow: [1, 0.2, 0] },
  throwSlam: { pelvis: [0, 0.62, 0.08], hipRot: [0, 10, 0], chest: [45, 10, 0], head: [-10, 0, 0], lHand: [-0.2, 0.6, 0.55], rHand: [0.2, 0.55, 0.55] },
  breakPush: { chest: [-10, -10, 0], lHand: [-0.2, 1.35, 0.5], rHand: [0.2, 1.3, 0.45], open: [1, 1] },
  getup: { pelvis: [0, 0.5, -0.05], chest: [30, -6, 0], lHand: [-0.25, 0.3, 0.3], rHand: [0.25, 0.6, 0.05], lFoot: [-0.14, 0.075, 0.25], rFoot: [0.2, 0.075, -0.25], open: [1, 1] },
};

// Victory and intro poses (looped with the animator's time).
export const SHOWCASE = {
  kai: {
    win: [
      { pelvis: [0, 0.94, 0], hipRot: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], lHand: [-0.06, 1.35, 0.22], rHand: [0.06, 1.35, 0.22], open: [1, 0], lFoot: [-0.1, 0.075, 0.02], rFoot: [0.1, 0.075, -0.02], footYaw: [0, 0], lElbow: [-1, -0.3, 0], rElbow: [1, -0.3, 0] },
      { pelvis: [0, 0.93, 0], hipRot: [0, 0, 0], chest: [35, 0, 0], head: [20, 0, 0], lHand: [-0.06, 1.15, 0.38], rHand: [0.06, 1.15, 0.38], open: [1, 0], lFoot: [-0.1, 0.075, 0.02], rFoot: [0.1, 0.075, -0.02], footYaw: [0, 0], lElbow: [-1, -0.3, 0], rElbow: [1, -0.3, 0] },
      { pelvis: [0, 0.9, 0], hipRot: [0, -30, 0], chest: [-6, -10, 0], head: [-10, 40, 0], lHand: [-0.05, 1.42, 0.4], rHand: [0.3, 1.95, 0.1], rElbow: [1, 0, 0], lFoot: [-0.12, 0.075, 0.24], rFoot: [0.18, 0.075, -0.2] },
    ],
    intro: [
      { pelvis: [0, 0.94, 0], hipRot: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], lHand: [-0.25, 0.95, 0.1], rHand: [0.25, 0.95, 0.1], open: [1, 1], lFoot: [-0.12, 0.075, 0], rFoot: [0.12, 0.075, 0], footYaw: [0, 0] },
      { pelvis: [0, 0.9, 0], hipRot: [0, 0, 0], chest: [4, 0, 0], head: [0, 0, 0], lHand: [-0.02, 1.3, 0.3], rHand: [0.06, 1.3, 0.3], open: [1, 0], lFoot: [-0.12, 0.075, 0], rFoot: [0.12, 0.075, 0], footYaw: [0, 0] },
    ],
  },
  viktor: {
    win: [
      { pelvis: [0, 0.92, 0], hipRot: [0, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0], lHand: [0.12, 1.25, 0.2], rHand: [-0.12, 1.2, 0.22], lElbow: [-1, -0.2, 0.2], rElbow: [1, -0.2, 0.2], lFoot: [-0.18, 0.075, 0], rFoot: [0.18, 0.075, 0], footYaw: [-15, 15] },
      { pelvis: [0, 0.86, 0], hipRot: [0, 0, 0], chest: [10, 0, 0], head: [-25, 0, 0], lHand: [-0.42, 1.75, 0.0], rHand: [0.42, 1.75, 0.0], lElbow: [-1, -0.6, 0], rElbow: [1, -0.6, 0], lFoot: [-0.22, 0.075, 0], rFoot: [0.22, 0.075, 0], footYaw: [-15, 15] },
    ],
    intro: [
      { pelvis: [0, 0.92, 0], hipRot: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], lHand: [-0.05, 1.2, 0.28], rHand: [0.05, 1.22, 0.3], open: [1, 0], lFoot: [-0.18, 0.075, 0], rFoot: [0.18, 0.075, 0], footYaw: [-15, 15] },
      { pelvis: [0, 0.9, 0], hipRot: [0, 0, 20], chest: [0, 0, -10], head: [0, 0, 30], lHand: [-0.05, 1.22, 0.28], rHand: [0.05, 1.2, 0.3], open: [1, 0], lFoot: [-0.18, 0.075, 0], rFoot: [0.18, 0.075, 0], footYaw: [-15, 15] },
    ],
  },
};

// ------------------------------------------------------------------ attacks
// Each attack: wind (anticipation), hit (contact at the active frames), optional spin (degrees of root yaw).
export const ATTACKS = {
  jabL: {
    wind: { lHand: [-0.04, 1.42, 0.26], chest: [10, -14, 0] },
    hit: { lHand: [-0.02, 1.47, 0.68], chest: [14, -26, 0], hipRot: [0, -32, 0], head: [-8, 50, 0], lElbow: [-1, -0.6, 0], pelvis: [0, 0.86, 0.04] },
  },
  crossR: {
    wind: { rHand: [0.16, 1.38, 0.1], chest: [10, -14, 0] },
    hit: { rHand: [0.0, 1.46, 0.72], lHand: [-0.1, 1.38, 0.2], chest: [14, 24, 0], hipRot: [0, 8, 0], head: [-8, -26, 0], rElbow: [1, -0.5, 0], pelvis: [0, 0.85, 0.06],
      lFoot: [-0.1, 0.075, 0.28], rFoot: [0.16, 0.12, -0.18] },
  },
  hookR: {
    wind: { rHand: [0.45, 1.36, -0.05], chest: [8, -30, 0], hipRot: [0, -30, 0] },
    hit: { rHand: [-0.05, 1.45, 0.62], lHand: [-0.12, 1.36, 0.18], chest: [10, 40, -4], hipRot: [0, 14, 0], head: [-6, -40, 0], rElbow: [1, 0.3, 0], pelvis: [0, 0.83, 0.05] },
  },
  bodyHookL: {
    wind: { lHand: [-0.35, 1.05, 0.1], chest: [16, 10, 8], pelvis: [0, 0.78, 0] },
    hit: { lHand: [0.04, 1.12, 0.55], chest: [20, -40, 6], hipRot: [0, -40, 0], head: [-14, 60, 0], lElbow: [-1, 0, 0], pelvis: [0, 0.76, 0.05] },
  },
  elbowL: {
    wind: { lHand: [-0.1, 1.3, 0.1], chest: [10, 15, 0] },
    hit: { lHand: [0.06, 1.34, 0.32], lElbow: [-0.3, 0.1, 1], chest: [16, -45, 0], hipRot: [0, -35, 0], head: [-10, 60, 0], pelvis: [0, 0.83, 0.12],
      lFoot: [-0.1, 0.075, 0.4] },
  },
  uppercutR: {
    wind: { pelvis: [0, 0.68, 0], chest: [30, -20, 0], rHand: [0.22, 0.95, 0.1] },
    hit: { pelvis: [0, 0.92, 0.06], chest: [-14, 20, 0], head: [-26, -20, 0], rHand: [0.02, 1.82, 0.36], lHand: [-0.2, 1.3, 0.1], rElbow: [1, -0.2, 0.3], hipRot: [0, 10, 0],
      rFoot: [0.16, 0.13, -0.15], footPitch: [0, 25] },
  },
  crouchJab: {
    wind: { ...STATE_POSES.crouch, lHand: [-0.06, 0.95, 0.3] },
    hit: { ...STATE_POSES.crouch, lHand: [-0.02, 0.85, 0.66], chest: [26, -26, 0], lElbow: [-1, -0.6, 0] },
  },
  sweepR: {
    wind: { pelvis: [0, 0.5, 0], chest: [30, -10, 0], hipRot: [0, -40, 0], lHand: [-0.25, 0.35, 0.35], rHand: [0.1, 0.9, 0.2], lFoot: [-0.15, 0.075, 0.2], rFoot: [0.3, 0.075, -0.1], lKnee: [-0.3, 0.3, 1], rKnee: [0.4, 0.2, 1] },
    hit: { pelvis: [0, 0.42, -0.05], chest: [34, 30, 0], hipRot: [0, 50, 0], head: [-20, -40, 0], lHand: [-0.3, 0.2, 0.25], rHand: [0.25, 0.25, 0.1], lFoot: [-0.18, 0.075, 0.05], rFoot: [0.15, 0.12, 0.88], lKnee: [-0.6, 0.6, 0.6], rKnee: [0, 1, 0.2], footPitch: [0, 30], footYaw: [-30, 60] },
  },
  lowKickR: {
    wind: { rFoot: [0.25, 0.25, -0.1], chest: [6, -10, 0], pelvis: [0, 0.85, 0] },
    hit: { rFoot: [0.05, 0.2, 0.78], rKnee: [0.3, 0.2, 1], chest: [-4, 20, 0], hipRot: [0, 20, 0], head: [-6, -10, 0], pelvis: [0, 0.82, 0.02], footPitch: [0, 50], footYaw: [-20, 70] },
  },
  frontKickL: {
    wind: { lFoot: [-0.08, 0.55, 0.2], lKnee: [0, 1, 0.3], chest: [0, -12, 0], pelvis: [0, 0.88, -0.04] },
    hit: { lFoot: [-0.06, 1.02, 0.82], lKnee: [0, 1, 0.3], chest: [-16, -20, 0], hipRot: [0, -20, 0], head: [6, 34, 0], pelvis: [0, 0.9, -0.06], footPitch: [60, 0], lHand: [-0.1, 1.42, 0.26], rHand: [0.2, 1.3, -0.05] },
  },
  roundR: {
    wind: { rFoot: [0.3, 0.6, -0.1], rKnee: [1, 0.6, 0.6], hipRot: [0, -60, 0], chest: [6, -10, 0], pelvis: [0, 0.88, 0] },
    hit: { rFoot: [0.05, 1.45, 0.78], rKnee: [1, 1, 0.3], hipRot: [0, -85, -30], chest: [-12, -5, 35], head: [0, 60, -25], pelvis: [0, 0.9, -0.04],
      lFoot: [-0.08, 0.075, 0.06], lHand: [-0.3, 1.28, 0.1], rHand: [0.3, 1.0, -0.25], footPitch: [0, 70], footYaw: [-80, 0] },
  },
  spinKick: {
    spin: -360,
    wind: { pelvis: [0, 0.8, 0], chest: [10, -20, 0], hipRot: [0, -40, 0] },
    hit: { rFoot: [0.0, 1.25, 0.82], rKnee: [1, 1, 0.3], hipRot: [0, -85, -28], chest: [-10, -5, 32], head: [0, 50, -20], pelvis: [0, 0.92, 0], lFoot: [-0.08, 0.075, 0.04], lHand: [-0.35, 1.3, 0.05], rHand: [0.35, 1.1, -0.2], footPitch: [0, 70] },
  },
  flyingKnee: {
    wind: { pelvis: [0, 0.72, 0], chest: [20, -10, 0], lHand: [-0.1, 1.1, 0.25], rHand: [0.2, 1.0, 0.0] },
    hit: { pelvis: [0, 0.98, 0.1], chest: [-10, 0, 0], rFoot: [0.08, 0.68, 0.15], rKnee: [0, 0.4, 1], lFoot: [-0.1, 0.35, -0.2], lHand: [-0.3, 1.7, 0.1], rHand: [0.3, 1.6, -0.1], head: [-10, 20, 0], hipRot: [0, -10, 0], footPitch: [40, 50] },
  },
  palmR: {
    wind: { rHand: [0.25, 1.05, -0.15], pelvis: [0, 0.8, -0.05], chest: [10, -35, 0], hipRot: [0, -40, 0] },
    hit: { rHand: [0.0, 1.28, 0.8], lHand: [-0.25, 1.15, -0.05], rElbow: [1, -0.2, 0], open: [0, 1], pelvis: [0, 0.76, 0.12], chest: [16, 30, 0], hipRot: [0, 10, 0], head: [-10, -30, 0],
      lFoot: [-0.12, 0.075, 0.5], rFoot: [0.2, 0.075, -0.42], lKnee: [-0.2, 0, 1] },
  },
  dragonFist: {
    wind: { lHand: [-0.25, 1.0, -0.2], rHand: [0.2, 1.2, 0.25], pelvis: [0, 0.76, -0.06], chest: [16, 30, 0], hipRot: [0, 20, 0], head: [-10, 0, 0] },
    hit: { lHand: [-0.02, 1.34, 0.85], rHand: [0.25, 1.0, -0.15], lElbow: [-1, -0.5, 0], pelvis: [0, 0.78, 0.14], chest: [16, -45, 0], hipRot: [0, -40, 0], head: [-12, 60, 0],
      lFoot: [-0.12, 0.075, 0.55], rFoot: [0.2, 0.075, -0.4] },
  },
  parry: {
    wind: { lHand: [-0.05, 1.42, 0.38], rHand: [0.08, 1.32, 0.34], open: [1, 1], chest: [0, -10, 0] },
    hit: { lHand: [-0.12, 1.48, 0.45], rHand: [0.1, 1.3, 0.42], open: [1, 1], chest: [-6, -20, 0], pelvis: [0, 0.83, -0.08], head: [0, 30, 0] },
  },
  airKick: {
    wind: { lFoot: [-0.1, 0.55, 0.15], rFoot: [0.15, 0.6, 0.0], chest: [10, 0, 0], lKnee: [0, 0.5, 1], rKnee: [0, 0.5, 1] },
    hit: { rFoot: [0.05, 0.75, 0.75], lFoot: [-0.1, 0.5, -0.1], chest: [-20, 0, 0], footPitch: [0, 50], lHand: [-0.3, 1.5, 0.1], rHand: [0.3, 1.5, 0.1] },
  },
  throwGrab: {
    wind: { lHand: [-0.2, 1.3, 0.3], rHand: [0.2, 1.3, 0.3], open: [1, 1] },
    hit: { lHand: [-0.2, 1.38, 0.62], rHand: [0.2, 1.36, 0.62], open: [1, 1], chest: [18, 0, 0], hipRot: [0, -6, 0], head: [-10, 6, 0], pelvis: [0, 0.84, 0.06], lElbow: [-1, -0.5, 0], rElbow: [1, -0.5, 0] },
  },
  rageArt: {
    spin: -360,
    wind: { pelvis: [0, 0.7, -0.05], chest: [20, 30, 0], lHand: [-0.3, 1.0, -0.2], rHand: [0.35, 0.95, -0.25], open: [1, 1] },
    hit: { rHand: [0.0, 1.42, 0.85], lHand: [-0.3, 1.2, -0.1], rElbow: [1, -0.4, 0], pelvis: [0, 0.8, 0.14], chest: [14, 35, 0], hipRot: [0, 10, 0], head: [-10, -30, 0],
      lFoot: [-0.12, 0.075, 0.5], rFoot: [0.2, 0.075, -0.4] },
  },
  hammerR: {
    wind: { rHand: [0.18, 2.05, -0.12], lHand: [-0.12, 1.35, 0.3], chest: [-18, 10, 0], pelvis: [0, 0.9, -0.05], rElbow: [1, 0.3, -0.2], head: [-14, 0, 0] },
    hit: { rHand: [0.0, 1.08, 0.66], lHand: [-0.2, 1.2, 0.1], chest: [40, 20, 0], pelvis: [0, 0.76, 0.1], head: [10, -10, 0], rElbow: [1, 0.2, 0] },
  },
  shoulderRam: {
    wind: { pelvis: [0, 0.78, -0.08], chest: [10, 60, 0], hipRot: [0, 40, 0], lHand: [-0.05, 1.2, 0.1], rHand: [0.15, 1.25, 0.2] },
    hit: { pelvis: [0, 0.8, 0.22], chest: [18, 80, 0], hipRot: [0, 60, 0], head: [-10, -70, 0], lHand: [0.05, 1.25, 0.22], rHand: [0.25, 1.1, 0.0],
      lFoot: [-0.1, 0.075, 0.55], rFoot: [0.2, 0.075, -0.35] },
  },
  bulldozer: {
    wind: { pelvis: [0, 0.78, 0], chest: [30, 50, 0], hipRot: [0, 20, 0], head: [-26, -40, 0] },
    hit: { pelvis: [0, 0.82, 0.28], chest: [28, 75, 0], hipRot: [0, 50, 0], head: [-20, -70, 0], lHand: [0.05, 1.25, 0.3], rHand: [0.25, 1.15, 0.0],
      lFoot: [-0.1, 0.075, 0.6], rFoot: [0.2, 0.15, -0.4] },
  },
  stomp: {
    wind: { rFoot: [0.15, 0.85, 0.25], rKnee: [0.2, 1, 0.5], pelvis: [0, 0.92, -0.04], chest: [-12, 0, 0], lHand: [-0.35, 1.6, 0.0], rHand: [0.35, 1.6, 0.0], head: [-15, 20, 0] },
    hit: { rFoot: [0.15, 0.075, 0.42], pelvis: [0, 0.66, 0.08], chest: [36, 0, 0], lHand: [-0.3, 0.9, 0.3], rHand: [0.3, 0.9, 0.3], head: [0, 10, 0], rKnee: [0.2, 0.5, 1] },
  },
};
