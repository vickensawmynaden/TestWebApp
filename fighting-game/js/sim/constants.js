// Global simulation constants. Units: metres and frames (60 frames per second).
export const FPS = 60;
export const ARENA_HALF = 7.0;          // square arena, walls at +/- ARENA_HALF on x and z
export const BODY_RADIUS = 0.32;        // push-box radius
export const HURT_RADIUS = 0.30;        // horizontal hurtbox radius
export const GRAVITY = 0.0085;          // m / frame^2 (jumps)
export const AIR_GRAVITY = 0.0036;      // m / frame^2 for juggled fighters (floatier, like 3D fighters)
export const START_DISTANCE = 2.6;
export const MAX_JUGGLE_HITS = 12;
export const THROW_BREAK_WINDOW = 20;
export const THROW_RANGE = 0.95;
export const INPUT_BUFFER = 40;         // frames of input history kept per fighter
export const MOTION_WINDOW = 16;        // frames allowed for f,f / qcf style motions
export const MULTI_PRESS_LENIENCY = 2;  // frames allowed between buttons of a 1+2 style press

// Vertical extents of hurtboxes by posture (relative to the fighter's ground position).
export const HURT_STAND = [0.0, 1.85];
export const HURT_CROUCH = [0.0, 1.12];
export const HURT_DOWN = [0.0, 0.35];

// Vertical extents of attack hitboxes by attack level.
export const HB_HIGH = [1.22, 2.1];
export const HB_MID = [0.55, 1.6];
export const HB_LOW = [0.0, 0.6];

// Buttons as bit flags (Tekken numbering: 1 = left punch, 2 = right punch, 3 = left kick, 4 = right kick).
export const B1 = 1, B2 = 2, B3 = 4, B4 = 8;
export const BUTTON_BITS = { '1': B1, '2': B2, '3': B3, '4': B4 };

export const DEFAULT_RULES = { roundsToWin: 2, roundTime: 60 };
