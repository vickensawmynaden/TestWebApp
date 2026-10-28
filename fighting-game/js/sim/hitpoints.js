// Where a move's hitbox sits at full extension, as [right, up, forward] in the fighter's model
// space (metres at fighter scale 1, multiplied by the fighter's scale). It is taken from the
// striking limb's IK target in the attack's contact pose (shared rig pose data in poses.js), so
// the hitbox follows the fist / foot the animation actually extends.
import { ATTACKS } from '../render/poses.js';

const LEVEL_HEIGHT = { high: 1.45, mid: 1.15, low: 0.25 };

export function limbHitPoint(m, scale = 1) {
  let p = m.hitPoint;
  if (!p) {
    const pose = ATTACKS[m.anim]?.hit;
    const endEffector = ['lHand', 'rHand', 'lFoot', 'rFoot'].includes(m.limb);
    p = endEffector && pose && pose[m.limb] ? pose[m.limb] : [0, LEVEL_HEIGHT[m.level] || 1.15, m.reach || 0.6];
  }
  return [p[0] * scale, p[1] * scale, p[2] * scale];
}
