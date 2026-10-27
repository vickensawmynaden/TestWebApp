# Iron Fist Arena

A browser-based 3D fighting game with close-range, Tekken-style combat: four attack buttons,
standing and crouching guard, sidesteps and distinct fighting styles. All characters, stage,
animation, audio and branding are original. There are no ripped or third-party game assets.

- **Six playable fighters from the roster concept sheet**
  (`public/references/fighter-roster.png`): Ren Arashi (Karate), Maya Baptiste (Kickboxing),
  Viktor Orlov (Grappling), Leila Haddad (Boxing), Caio Luz (Capoeira) and Sora Kestrel
  (Precision Combat). Kai, from the first version of the game, remains as a bonus fighter.
- **Local versus for two players** on two physical gamepads (BeTop, XInput or DirectInput pads),
  with keyboard fallback, plus **player-versus-CPU** with a personality per fighter.
- **True 3D combat**: sidesteps around the opponent, attack direction locked at startup (so
  sidesteps beat linear attacks), high/mid/low hit levels, limb-attached hitboxes, breakable
  throws, hit-stop and clear hit/block feedback.
- **Modes**: Versus (2P), Versus CPU, Training (with frame data, dummy behaviours and reset).
  There are also controller assignment and test screens, button remapping, a controls guide and
  settings.

## 1. Technology choice

The repository is an ASP.NET web project, and this environment has no Unreal Engine, Unity or
GPU editor tooling. So the game is built with **Three.js (WebGL 2)** and runs directly in the
browser. The **Gamepad API** handles two-controller support. Three.js r170 is vendored in
`vendor/three/` (MIT licence included), so there is **no build step and no `npm install`**.

The simulation (`js/sim/`) is plain JavaScript with no rendering dependencies. It runs at a fixed
60 Hz and is fully deterministic for a given input stream. That makes it unit-testable in Node,
and it could serve as the base for rollback netcode later.

## 2. Running the game

Requirements: a desktop browser with WebGL 2 (Chrome or Edge recommended, Firefox works) and
Node.js 18+ (only for the tiny static server).

```bash
cd fighting-game
npm start              # serves on http://localhost:8080  (PORT=9000 npm start to change)
```

Then open **http://localhost:8080** in the browser.

> Opening `index.html` directly from disk (`file://`) will **not** work, because ES modules and
> import maps require HTTP. Any static server is fine, for example `python3 -m http.server 8080`
> run inside `fighting-game/`.

Run the tests:

```bash
npm test                                   # 83 headless combat / roster / match / AI tests (Node)
npm start &                                # then, if Playwright + Chromium are installed:
node tests/e2e/browser-e2e.cjs             # 25 browser checks with two emulated gamepads
```

## 3. Project structure

```
fighting-game/
├── index.html              HUD markup, import map, entry point
├── css/style.css           Dark metallic UI theme, HUD, menus
├── js/
│   ├── main.js             App state machine, fixed-timestep loop, event → audio/HUD wiring
│   ├── sim/                Deterministic game logic (no DOM / WebGL)
│   │   ├── constants.js    Arena size, gravity, hurtbox / hitbox heights, buffers
│   │   ├── commands.js     Command notation parser (df+2, f,f+2, qcf+1, 1+2 ...) and matcher
│   │   ├── characters.js   Roster data: stats, movement, attacks, damage, frame data, hit/block stun
│   │   ├── fighter.js      Per-fighter state, input buffer, posture, limb hitbox points
│   │   ├── world.js        State machine, movement, hit/hurt boxes, blocking, juggles,
│   │   │                   throws, parry, armour, walls, camera side, events
│   │   ├── match.js        Rounds, timer, KO / time-out, best-of-N, training upkeep
│   │   └── ai.js           CPU (per-fighter personality, reaction delay, mistakes) and dummy
│   ├── input/InputManager.js  Keyboard + Gamepad API, slots, hat-switch decode, remap, rumble
│   ├── render/
│   │   ├── GameView.js     Renderer, bloom post-processing, PMREM reflections, wiring
│   │   ├── appearance.js   Per-fighter look: proportions, skin, hair, clothing, accessories
│   │   ├── FighterModel.js Builds the procedural prototype body from appearance.js on the IK rig
│   │   ├── Animator.js     State → pose: keyframed attacks synced to frame data, locomotion,
│   │   │                   hit reactions, juggles, throws, crossfades
│   │   ├── poses.js        Shared rig pose data: stances, reactions, 51 attack animations, win/intro
│   │   ├── Stage.js        "Sunset Temple Courtyard" arena, lights, embers
│   │   ├── CameraRig.js    Side-on fighting camera, zoom, cinematic intro/KO/win, shake
│   │   ├── Effects.js      Pooled sparks, flashes, rings, dust and limb trails
│   │   └── textures.js     Procedurally generated textures
│   ├── audio/Audio.js      Web Audio synthesised SFX, grunts, music; speech announcer
│   └── ui/UI.js            Title, menus, character select, controllers, remap, move list,
│                           results, HUD
├── public/references/      fighter-roster.png (concept sheet; also used for select portraits)
├── tests/                  Node tests (combat.test.js, roster.test.js) and Playwright e2e (e2e/)
├── tools/serve.js          Zero-dependency static server
└── vendor/three/           Three.js r170 + the post-processing add-ons used
```

## 4. Connecting two BeTop controllers

1. **Connect both pads** to the computer by USB or Bluetooth. Pair Bluetooth pads in the OS
   Bluetooth settings first.
2. Many BeTop models have an **XInput ("X") / DirectInput ("D") mode switch** or button combo.
   Either mode works: XInput pads report the browser's `standard` mapping, while DirectInput pads
   report a non-standard mapping and are handled with a separate default layout plus automatic
   **hat-switch D-pad detection**. If you can choose, XInput mode gives the most predictable
   layout. Check your model's manual for how to switch, because it differs between models.
3. Open the game and **press a button on each controller**. Browsers only expose gamepads to a
   page after a button press.
4. Pads are auto-assigned in connection order: the first pad is P1 and the second is P2. Keyboards
   are used for any free slot.
5. Open **Main Menu → Controllers** to check or change the assignment:
   - **Assign P1 / Assign P2**, then press any button on the pad you want for that player.
   - **Swap P1 ⇄ P2** and **P1/P2 → Keyboard**.
   - One device can never control both fighters. Assigning a pad that already belongs to the
     other player swaps the two.
   - Each slot shows the device name, connection status, the **live state of every mapped action**
     and the **raw buttons and axes**, including detected hat axes. This lets you see exactly what
     the browser reports for your BeTop pad.
6. **Disconnects**: if a pad drops mid-fight the match pauses with a warning. Reconnecting the
   same controller model gives the slot back automatically. You can also reassign another device
   from the pause menu → Controllers.

## 5. Controller test & button remapping procedure

1. Main Menu → **Controllers**. Press every button and move the stick and D-pad on each pad.
   Confirm that the right **action chips** light up, and that the raw button numbers and axes
   change for that player only.
2. If anything is wrong or unlabelled (common with DirectInput pads), choose **Remap P1** or
   **Remap P2**.
3. Select an action (Up, Down, Left, Right, 1–4, Guard, Throw, 1+2, 3+4, Pause, Training reset)
   and **press the button or direction you want on that player's device**. Buttons, analog axes
   and hat-switch directions can all be captured. Esc, or waiting 5 s, cancels.
4. Bindings are saved in `localStorage` per **controller model** (gamepad id string), so two
   identical BeTop pads share one mapping. **Reset to defaults** restores the built-in layout.
   The analog stick stays active for directions even if you remap the D-pad.
5. Keyboard layouts can be remapped the same way.

### Default mappings

| Action | Standard / XInput pad | DirectInput pad (non-standard) | Keyboard P1 | Keyboard P2 |
|---|---|---|---|---|
| Move | D-pad + left stick | Hat switch / D-pad + left stick | W A S D | Arrow keys |
| 1 Left Punch | X / □ (button 2) | button 0 | U | Num 4 |
| 2 Right Punch | Y / △ (button 3) | button 3 | I | Num 5 |
| 3 Left Kick | A / ✕ (button 0) | button 1 | J | Num 1 |
| 4 Right Kick | B / ○ (button 1) | button 2 | K | Num 2 |
| Guard | RB / R1 | button 5 | L | Num 3 |
| Throw (1+3) | LB / L1 | button 4 | O | Num 6 |
| 1+2 macro | RT / R2 | button 7 | Y | Num 7 |
| 3+4 macro | LT / L2 | button 6 | H | Num 8 |
| Pause | Start | button 9 | Esc | Num Enter |
| Training reset | Back / Select | button 8 | R | Num 0 |

Menus accept the D-pad or stick, **1 or 3 to confirm** (Start also confirms), **2 or 4 to go
back**, and Enter, Space or Esc on the keyboard. The mouse works too. During a fight, menu
navigation is disabled: only the assigned players' **Start/Pause** button (or Esc) is read.

## 6. How to play

The keyboard and gamepad layout from the first version is kept (it was already implemented).
The Controls Guide (main menu or pause menu) shows the live bindings, and a controls strip is
shown at the bottom of the screen during fights (toggle it in Settings).

Notation: **1** left punch · **2** right punch · **3** left kick · **4** right kick ·
**F** toward the opponent · **B** away · **D** down (crouch). On keyboard P1, 1/2/3/4 are
**U / I / J / K**; F/B/D are the **A / D / S** keys depending on which side you are on.

| Technique | Input |
|---|---|
| Walk / dash / backdash | F / F,F / B,B |
| Sidestep into / out of the screen | tap up / tap down (W / S, or ↑ / ↓ for P2) |
| Crouch / jump | hold down / hold up |
| Standing guard (blocks high and mid) | stand still, hold B, or hold Guard (L) |
| Crouching guard (blocks low; highs whiff over you) | hold down-back (or down) |
| Throw / throw break | 1+3 or Throw (O). Break by pressing **1** or Throw when grabbed. Throws miss crouching opponents |
| Get up | any button or direction when knocked down |
| Pause | Esc (P1 keyboard), Num Enter (P2 keyboard), Start on pads |

Directional attacks take priority over plain ones (F+2 beats 2). Attacks pressed in the last
8 frames of recovery are buffered, and two buttons pressed within 2 frames count as together.

### Roster and frame data

Each fighter has a signature jab on **1**, shared basic **2 / 3 / 4** moves (tuned per fighter),
three directional signature attacks (★) and a breakable throw. All attacks are standalone:
there are no strings or launchers for the six roster fighters (Kai keeps his original strings
and launchers, which have explicit cancel and combo-scaling rules). Damage is per hit with
**100 HP** per fighter and **no chip damage**. Hitstun and blockstun count from the first active
frame; advantage = stun − (remaining active + recovery).

> **All values below are conservative starting values that require playtesting.**

**Ren Arashi** — Karate

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Anchor Jab ★ | 1 | high | 5 | 10 | 2 | 14 | 21 | 16 | +1 | +6 |
| Right Straight | 2 | high | 7 | 12 | 2 | 18 | 22 | 16 | -3 | +3 |
| Left Kick | 3 | mid | 8 | 14 | 2 | 22 | 24 | 15 | -8 | +1 |
| Right Kick | 4 | high | 9 | 15 | 3 | 24 | 28 | 16 | -10 | +2 |
| Harbor Palm ★ | F+2 | mid | 11 | 14 | 3 | 20 | 26 | 14 | -8 | +4 |
| Stone Sweep ★ | D+3 | low | 9 | 16 | 3 | 26 | 26 | 12 | -16 | -2 |
| Crescent Heel ★ | B+4 | mid | 16 | 20 | 3 | 26 | knockdown | 16 | -12 | knockdown |
| Clinch Throw | 1+3 / Throw | throw | 12 | 12 | 2 | 28 | — | — | — | break with 1 / Throw |

**Maya Baptiste** — Kickboxing

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Reef Jab ★ | 1 | high | 4 | 9 | 2 | 13 | 20 | 15 | +1 | +6 |
| Right Straight | 2 | high | 6 | 11 | 2 | 18 | 22 | 16 | -3 | +3 |
| Left Kick | 3 | mid | 7 | 13 | 2 | 22 | 24 | 15 | -8 | +1 |
| Right Kick | 4 | high | 8 | 14 | 3 | 24 | 28 | 16 | -10 | +2 |
| Twin-Step Elbow ★ | F+1 | mid | 8 | 12 | 2 | 17 | 22 | 15 | -3 | +4 |
| Coral Low Kick ★ | D+4 | low | 6 | 13 | 2 | 18 | 20 | 11 | -8 | +1 |
| Breaker Knee ★ | F+4 | mid | 13 | 16 | 3 | 24 | knockdown | 14 | -12 | knockdown |
| Clinch Throw | 1+3 / Throw | throw | 12 | 12 | 2 | 28 | — | — | — | break with 1 / Throw |

**Viktor Orlov** — Grappling

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Hammer Knuckle ★ | 1 | high | 8 | 12 | 2 | 18 | 24 | 17 | -2 | +5 |
| Right Straight | 2 | high | 8 | 14 | 2 | 21 | 22 | 16 | -6 | 0 |
| Left Kick | 3 | mid | 10 | 16 | 2 | 25 | 24 | 15 | -11 | -2 |
| Right Kick | 4 | high | 11 | 17 | 3 | 27 | 28 | 16 | -13 | -1 |
| Dockyard Shoulder ★ | F+2 | mid | 14 | 18 | 3 | 22 | 28 | 18 | -6 | +4 |
| Anchor Stomp ★ | D+4 | low | 12 | 19 | 3 | 26 | 28 | 12 | -16 | 0 |
| Collar Hammer ★ | B+2 | mid | 18 | 22 | 3 | 28 | knockdown | 16 | -14 | knockdown |
| Foundry Drop | 1+3 / Throw | throw | 18 | 13 | 2 | 28 | — | — | — | break with 1 / Throw |

**Leila Haddad** — Boxing

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Measure Jab ★ | 1 | high | 5 | 9 | 2 | 13 | 21 | 16 | +2 | +7 |
| Right Straight | 2 | high | 6 | 12 | 2 | 18 | 22 | 16 | -3 | +3 |
| Left Kick | 3 | mid | 7 | 14 | 2 | 22 | 24 | 15 | -8 | +1 |
| Right Kick | 4 | high | 8 | 15 | 3 | 24 | 28 | 16 | -10 | +2 |
| Check Hook ★ | B+2 | high | 10 | 13 | 2 | 20 | 25 | 14 | -7 | +4 |
| Body Cross ★ | F+2 | mid | 11 | 14 | 2 | 19 | 25 | 14 | -6 | +5 |
| Toe Stamp ★ | D+4 | low | 6 | 12 | 2 | 16 | 19 | 10 | -7 | +2 |
| Clinch Throw | 1+3 / Throw | throw | 12 | 12 | 2 | 28 | — | — | — | break with 1 / Throw |

**Caio Luz** — Capoeira

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Ginga Palm ★ | 1 | high | 5 | 11 | 2 | 15 | 21 | 16 | 0 | +5 |
| Right Straight | 2 | high | 7 | 14 | 2 | 18 | 22 | 16 | -3 | +3 |
| Left Kick | 3 | mid | 8 | 16 | 2 | 22 | 24 | 15 | -8 | +1 |
| Right Kick | 4 | high | 9 | 17 | 3 | 24 | 28 | 16 | -10 | +2 |
| Orbit Heel ★ | F+3 | mid | 12 | 19 | 4 | 26 | 30 | 14 | -15 | +1 |
| Rasteira ★ | D+4 | low | 10 | 20 | 3 | 30 | knockdown | 12 | -20 | knockdown |
| Compass Kick ★ | B+4 | high | 17 | 24 | 3 | 32 | knockdown | 16 | -18 | knockdown |
| Clinch Throw | 1+3 / Throw | throw | 12 | 12 | 2 | 28 | — | — | — | break with 1 / Throw |

**Sora Kestrel** — Precision Combat

| Move | Input | Level | Dmg | Startup | Active | Recovery | Hitstun | Blockstun | On block | On hit |
|---|---|---|---|---|---|---|---|---|---|---|
| Needle Strike ★ | 1 | high | 5 | 10 | 2 | 13 | 21 | 15 | +1 | +7 |
| Right Straight | 2 | high | 7 | 12 | 2 | 18 | 22 | 16 | -3 | +3 |
| Left Kick | 3 | mid | 8 | 14 | 2 | 22 | 24 | 15 | -8 | +1 |
| Right Kick | 4 | high | 9 | 15 | 3 | 24 | 28 | 16 | -10 | +2 |
| Vector Palm ★ | F+2 | mid | 10 | 13 | 2 | 18 | 24 | 14 | -5 | +5 |
| Cutline Kick ★ | D+3 | low | 8 | 14 | 2 | 20 | 22 | 12 | -9 | +1 |
| Axis Heel ★ | F+4 | mid | 13 | 17 | 3 | 22 | 28 | 15 | -9 | +4 |
| Clinch Throw | 1+3 / Throw | throw | 12 | 12 | 2 | 28 | — | — | — | break with 1 / Throw |

Fighter-specific rules:
- **Leila's Check Hook** deals **+30 % damage** when it hits an opponent during the startup of
  their attack.
- **Sora's Axis Heel** steps 0.35 m sideways during frames 2–12 of its startup. The movement uses
  ordinary collision and hurtboxes.
- **Viktor's Foundry Drop** deals **18**; every other throw deals **12**.
- **Caio's ginga idle sway is visual only**: hurtboxes come from the simulation posture, so idling
  never grants evasion (covered by a test).
- After getting up, a fighter cannot be thrown for 16 frames, so there is no guaranteed re-throw.

### CPU personalities

The CPU uses each fighter's own move list, sees the opponent through a reaction delay
(24 / 16 / 11 frames for Easy / Normal / Hard) and makes occasional mistakes (25 / 12 / 5 %).
- **Ren** mixes basic attacks.
- **Maya** pressures at close range and dashes in.
- **Viktor** closes distance and throws most often.
- **Leila** waits in guard and punishes blocked attacks, or interrupts startup with Check Hook.
- **Caio** keeps kick range and sidesteps the most.
- **Sora** keeps spacing just outside range and punishes missed attacks.

A deterministic test checks these tendencies. Win rates between fighters are not balanced yet.

## 7. Implemented features vs. still needing work

**Implemented (and exercised by tests or screenshots):**
- Fixed 60 Hz deterministic simulation with render interpolation and hit-stop.
- Separate pushboxes, hurtboxes (stand, crouch, airborne, jumping and grounded profiles) and
  attack hitboxes. A hitbox is swept from the body to the striking limb's position in the
  attack's contact pose (the same IK target the animation uses). It is active only during the
  attack's active frames and damages once per execution.
- Every attack has startup, active, recovery, damage, hit level, hitstun and blockstun in
  editable data. The tests measure the resulting advantage in the sim.
- Counter hits, punishable recovery, input buffering, 1-to-2-frame leniency for multi-button
  presses, and string cancel windows.
- Sidestep and sidewalk, homing vs linear tracking, dash, run, backdash, jump, crouch and
  get-up rolls.
- Juggles with rising gravity and a hit cap, combo damage scaling, hit-stun decay on long ground
  combos, one wall splat and one crumple per combo, so there are no infinites.
- Throws with break windows, throw clash, a parry, power-crush armour and Rage Arts.
- Arena walls with wall splats and wall hits, body push-boxes, and arena clamping.
- Camera that stays perpendicular to the fighters' axis without flipping, zooms with distance,
  plays cinematic intro, KO and win orbits, and shakes on heavy hits. Arena walls fade out
  when the camera is behind them so they never hide the fight.
- Six roster fighters built from appearance data that follows the reference sheet: body
  proportions, skin, hairstyle, clothing, accessories and colours. They share one two-bone IK
  rig (shoulders, elbows, hips, knees, spine and head) with planted feet.
- Distinct stances and timing per fighter: Ren upright, Maya bouncing, Viktor broad and heavy,
  Leila compact, Caio's ginga, Sora angular. There are 51 attack animations synced to frame
  data, plus walk and run cycles, sidesteps, crouch, both guards, hit and block reactions,
  throws, knockdown and get-up, KO, intros and victory poses.
- Stage with shadows, PMREM reflections, bloom, fog, embers, lanterns and neon wall strips.
- Particle hit and block sparks, flashes, rings, dust and limb trails.
- Synthesised SFX for hits, blocks, whooshes, footsteps, grunts, bells and KO, plus procedural
  music with separate master, SFX, music and voice volumes.
- Character select with portraits cropped from the reference sheet, each fighter's style,
  stats and signature moves.
- Full UI: title, main menu, character select (simultaneous for 2P), controls guide, controllers and test
  screen, remap, settings, pause, move list, training panel, HUD (health with recoverable lag,
  timer, round pips, combo and damage counter, callouts, announcements) and results with rematch.
- Best-of-N rounds (1, 2 or 3 to win), round timer (30/60/99/∞), time-out and draw handling,
  rematch without reloading.
- Gamepad rumble on hits, where the browser supports `vibrationActuator`.

**Still needing work / not implemented:**
- **Online multiplayer is not implemented.** There is no server or netcode. The deterministic sim
  is designed so rollback netcode could be added later, but nothing online exists today.
- **The six fighters are procedural PROTOTYPE models.** The reference image is 2D concept art
  with no mesh, skeleton or animation clips, and the project has no rigged GLB/glTF assets. So
  each fighter is built from lathe and sphere primitives on a shared IK rig. They match the
  reference's silhouette, colours, hair and outfits closely enough to tell apart, but faces,
  hands, cloth folds and hair are simplified, and there is no skin deformation at the joints
  (joint spheres hide the seams). Appearance (`render/appearance.js`, `render/FighterModel.js`)
  is separate from combat data (`sim/characters.js`). A detailed rigged model can replace
  `FighterModel` for any fighter, loaded with `GLTFLoader` and an `AnimationMixer`, while the
  combat data stays unchanged.
- Animations are hand-keyed procedural poses, not motion capture.
- Audio is synthesised placeholder audio. The announcer uses the browser's speech synthesis,
  which varies by OS. Recorded SFX, voice and music should replace it.
- One stage. There is no breakable floor or wall, story, ranked mode, replays or
  input-recording dummy.
- Frame data, damage and CPU win rates are unbalanced starting values that need playtesting.
- Keyboard layout differs from the brief: the original layout is kept (P1: WASD move,
  U/I/J/K = 1/2/3/4, O throw, L guard, Esc pause) instead of arrows + J/K/U/I + C. Holding
  down crouches; there is no separate C crouch key. Every key can be remapped.
- Bound/tailspin, ground-bounce, back-turned states and chip damage are not modelled.

## 8. Known limitations & performance requirements

- **GPU**: aim for any discrete or recent integrated GPU (roughly 2018 or newer). With
  `Graphics: high`, the game renders 2048² soft shadows, bloom and up to 2× pixel ratio.
  `medium` and `low` (in Settings) reduce the pixel ratio and shadow quality and disable bloom.
  **A 60 FPS frame rate on real hardware was not measured here**: the test environment only had
  CPU software rendering (SwiftShader), which ran at about 10 FPS. CPU cost of simulation plus
  animation was measured at about **0.03 ms per frame**, so frame rate depends on the GPU.
- Browsers only reveal gamepads after a button press on that pad. Button numbering for
  non-standard (DirectInput) pads varies by browser and OS, which is why the remap screen exists.
- Firefox on Linux and Safari can report different axis and hat layouts. Use the Controllers
  screen to verify.
- Rumble depends on browser and pad support.
- Speech-synthesis voices may be missing on some systems. Announcements are always shown as text.

## 9. Test checklist (what was actually tested)

Automated, Node (`npm test`), **83/83 passing**:
- [x] **Every strike of all six fighters** (7 each, 42 in total): it hits exactly once for its
  listed damage, the correct guard blocks it with no chip damage, highs whiff over a crouch,
  mids beat crouch guard, lows beat standing guard, and out of range it whiffs and completes
  its full recovery.
- [x] Each fighter has a signature jab on 1, basics on 2/3/4 and three directional signatures,
  and every attack has startup, active, recovery, damage, level and stun data.
- [x] Throws: 12 damage standard, 18 for Foundry Drop; the Throw button breaks; the wrong button
  doesn't; throws miss crouchers; no re-throw during the get-up protection window.
- [x] Check Hook's startup bonus, Sora's Axis Heel side step, and Caio's idle granting no evasion.
- [x] Measured advantage matches the data (jab on hit, Harbor Palm on block). Mashing during
  recovery does not restart an attack.
- [x] Directional attacks beat plain ones; sidestep beats linear attacks but not tracking ones.
- [x] Bodies never overlap or leave the arena; fighters keep facing each other; each player's
  input moves only their own fighter.
- [x] Match rules: 100 HP, 60 s rounds, first to two; KO'd fighters ignore input; time-out
  goes to the healthier fighter; next round resets all state.
- [x] CPU-vs-CPU matches finish for all six fighters; CPU personality tendencies.
- [x] Kai (bonus): launcher juggles end with scaled damage, strings, parry, Rage Art armour,
  wall splat. Training dummy and reset.

Automated, browser (`tests/e2e/browser-e2e.cjs`, headless Chromium, **two emulated gamepads**,
one `standard` and one DirectInput with a hat switch), **25/25 passing**:
- [x] Both pads detected and assigned to P1 and P2; hat switch auto-detected; menu navigation
- [x] Each pad drives only its own fighter; both move at once; signature jabs on both mappings
- [x] Hits update the HUD; Start pauses; the sim is frozen while paused; pause menu input
- [x] Disconnect pauses with a warning and reconnecting restores the slot; one pad can't drive
  both players; remapping is saved
- [x] KO ends the round; round 2 resets health; rematch restarts without reload
- [x] All six fighters selected through the select screen and rendered in matches
- [x] The reference sheet loads, with no HTTP errors and no page errors

Manual and visual (screenshots in headless Chromium):
- [x] All six fighters' idle stances and close-ups compared against the reference sheet
- [x] Every signature attack at its contact frame
- [x] Select screen with portraits, controls guide, in-fight controls strip

**Not verified (no hardware available in this environment):**
- [ ] Two **physical BeTop controllers**, over USB or Bluetooth, in XInput or DirectInput mode.
  The emulated test covers the same code paths, but real device button numbering must be
  confirmed on the Controllers screen.
- [ ] Frame rate on a real GPU (headless software rendering only)
- [ ] Audio by ear
- [ ] Firefox and Safari behaviour
