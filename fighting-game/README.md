# Iron Fist Arena

A browser-based 3D fighting game with close-range, Tekken-style combat: four attack buttons,
standing and crouching guard, sidesteps and distinct fighting styles. All characters, stage,
animation, audio and branding are original. There are no ripped or third-party game assets.

- **Six playable fighters with rigged, skinned 3D character models** (supplied GLB models,
  auto-rigged by `tools/charbuild/rig.py`). Each model fills one existing roster slot, and that
  fighter's moves, frame data and personality are unchanged:

  | Fighter (style) | Model |
  |---|---|
  | Ren Arashi (Karate) | Mushroom Ninja |
  | Maya Baptiste (Kickboxing) | Mushroom Warrior (blade) |
  | Viktor Orlov (Grappling) | Fantasy Bear |
  | Leila Haddad (Boxing) | Leather Warrior |
  | Caio Luz (Capoeira) | Armored Cobra |
  | Sora Kestrel (Precision Combat) | Tactical Soldier |

  Kai, from the first version of the game, remains as a bonus fighter on the procedural body.
  See `assets/manifest.json` for files, provenance and status.
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

The game loads the six character GLBs (~11 MB in total) behind a "Loading fighters" screen.
`http://localhost:8080/?models=procedural` skips them and uses the prototype bodies.

### Rebuilding the character rigs

```bash
pip install numpy scipy pillow
python3 tools/charbuild/rig.py            # all six; or e.g. rig.py maya
```

Input is `assets/source/*.glb` (the supplied static models). Joint positions per model live in
`tools/charbuild/rigdefs.py`. To check joints, weights and poses, open
`http://localhost:8080/tools/gallery.html?pose=crossR.hit&yaw=70` (add `&weights=1` for a
skin-weight view, or `?portraits=1` to re-render `assets/portraits/roster.jpg`).

### Deploying to Vercel

The game is a static site, so no build is needed. In Vercel, import the GitHub repository and set
**Root Directory** to `fighting-game`. `vercel.json` already sets no install/build step and
serves the folder as-is (`outputDirectory: "."`). This matters: without it Vercel would serve
only the `public/` folder. From a terminal: `cd fighting-game && npx vercel --prod`.

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
│   │   ├── SkinnedFighter.js  Rigged glTF fighter: loads assets/characters/<id>.glb, per-instance
│   │   │                   skeleton clone, retargets the poses (IK on the model's bone lengths),
│   │   │                   planted-foot locking, weapon wrist aim, tail follow-through
│   │   ├── FighterModel.js Procedural prototype body (Kai, and fallback if a GLB fails to load)
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
├── assets/
│   ├── characters/         Rigged fighter GLBs (game files) + rig-report.json
│   ├── source/             The supplied unrigged GLBs (pipeline input; not deployed)
│   ├── portraits/roster.jpg  Select-screen portraits rendered from the rigged models
│   └── manifest.json       Files, mesh/skeleton/texture data, provenance, rights, status
├── public/references/      fighter-roster.png (original concept sheet)
├── tests/                  Node tests (combat, roster, assets) and Playwright e2e (e2e/)
├── tools/
│   ├── serve.js            Zero-dependency static server
│   ├── gallery.html        Pose gallery / weight view / portrait renderer (dev tool)
│   └── charbuild/          rig.py (auto-rigger), rigdefs.py (joint tables), glb.py (writer)
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

Directional attacks take priority over plain ones (F+2 beats 2). Two buttons pressed within 2
frames count as together.

### Input buffering and reliability

- Every input frame carries a stamp. An attack entered in the **last 8 frames of recovery**, or in
  the **last 6 frames of blockstun** (for punishing), is buffered and comes out on the first free
  frame. A buffered attack **expires after 10 frames**.
- Being hit, launched, knocked down, wall-splatted, thrown or parried **drops any queued or
  buffered attack and invalidates every input entered before it**, so nothing fires unexpectedly
  after an interruption or on wake-up. A new round or rematch clears all input history.
- Motion commands (`f,f`, `qcf`) are matched backward from the newest input, so an older
  completed motion can never hide a newer one, and a motion **is consumed** when its move comes
  out (the same quarter-circle cannot fire a second time).
- Mashing during recovery never starts a move early (tested).

### Strings, combos and juggles

Full command lists with frame data, string windows and measured combo damage are in
**[docs/COMMANDS.md](docs/COMMANDS.md)** (generated from the game data with
`node tools/movelist.mjs`). The in-game move list (pause menu) shows the same data and the
combo routes.

- **Strings** (`1,2`): a follow-up is accepted inside an **input window** of the parent move,
  starts no earlier than its **execution frame**, and can require the parent's result (hit,
  counter hit, block or whiff) and the opponent's state (grounded or airborne). A follow-up
  written without a direction yields to a directional move that matches exactly (`1` then `f+2`
  is the f+2 move, not the 1,2 string). If a follow-up's condition fails, its input falls back to
  the ordinary move.
- **Juggle roles**: launchers lift, fillers keep the opponent up, finishers end the juggle.
  After a finisher (or any knockdown), nothing can lift the opponent again. Hits on a grounded
  opponent never pick them back up. Damage scaling (−10 % per hit, ×0.85 airborne, ×0.8 on the
  wall), rising juggle gravity, the 12-hit juggle cap, one wall splat and one crumple per combo
  are unchanged. Wall-splat stun has an absolute cap of 60 frames, so wall loops always end.

Authored routes per fighter (all validated in the simulation; damage measured on a no-guard
dummy, counter-hit routes with the counter hit):

| Fighter | Beginner (true combo) | Pressure string (gap) | Launcher / counter-hit route |
|---|---|---|---|
| Ren | `1,2` — 12 | `1,2,b+4` — 25 (heel is high: block or duck) | `df+2 ▸ 1,f+2,b+4` — 28 |
| Maya | `1,2` — 9 | `1,2,d+4` — 17 (low after a gap: crouch-guard it) | `df+4 ▸ f+1 ▸ 1,2,d+4` — 28; `CH f+4 ▸ f+1 ▸ 1,2` — 26 |
| Viktor | `1,2` — 18 | `f+2,1` — 26 (jab the gap on block) | `df+2 ▸ 1,2` — 26 |
| Leila | `1,1,2` — 16 | `f+2,2` — 23 (jab the gap on block) | `CH b+2 ▸ f+2,2` — 31 |
| Caio | `3,4` — 19 | `f+3,4` — 24 (combos on hit; duck it on block) | `df+3 ▸ 3,4` — 25 |
| Sora | `1,2` — 11 | `1,2,4` — 23 (kick is high: block or duck) | `df+2 ▸ 1,2,4` — 27 |
| Kai | `1,2` — 9 | — | `df+2 ▸ 1,2` — 15 (Kai keeps his scaled original damage) |

`▸` = the next move after recovery (link). The launch and counter-hit routes are inside the
25–35 damage target. The suggested designs were implemented, then adjusted after simulation
tests (see *Balance changes* below).

### Balance changes (separate from animation work)

Existing move values were kept as the baseline. Deliberate changes:
- **New moves**: launchers `df+2` (Ren, Viktor, Sora), `df+4` (Maya), `df+3` (Caio); string
  follow-ups for every main fighter (see the command lists).
- **Counter-hit properties added**: Maya's f+4 launches on counter hit; Leila's b+2 and Viktor's
  b+2 crumple on counter hit.
- **Pushback reduced**: standing hit pushback ~0.36 m → ~0.21 m, block pushback ~0.39 m →
  ~0.25 m, so natural strings still reach after the first hit.
- **Juggle spacing**: launchers and filler hits drift the airborne opponent toward 0.8 m from the
  attacker (instead of pushing them away), so routes work at any launch distance. Finishers still
  carry the opponent away.
- **Crumple** stays hittable (crouching posture) for 44 of its 52 frames (was 30), so a
  follow-up can reach a crumpling opponent.
- **Wall-splat** stun extension capped at 60 frames total (previously re-extendable).
- **Kai's df+1** is labelled as an elbow strike (it always hit with the elbow).

### Practice mode

Pause menu → **Dummy behaviour**:
- **stand guard**: standing still guards highs and mids
- **no guard**, **crouch guard**, **guard all**
- **guard after first hit**: takes the first hit, then guards on every legal frame, for testing
  whether your combo is real
- **random guard**: guards half of your attacks
- **counter hit**: every first hit is a counter hit
- **jump**, **cpu**
- **record**: you control the dummy and it records up to 10 s; **playback** loops the recording
  (fighter-relative, so it works from either side)
- **punish drill**: the dummy throws out an attack that is unsafe on block. Block it and punish
  it; the HUD reports PUNISHED or MISSED with the move's frame disadvantage

Pause menu → **Demo combo** / **Play combo demo**: your fighter performs any of their authored
routes on the dummy.

### Development overlay

Press **F2** (or open with `?debug=hitboxes`) to draw what the simulation collides with:
- **hurt volumes**: cyan cylinders
- **attack volume**: dim during startup, bright red while active; it is swept from the body to
  the hit point, uses the move's radius and spans the attack level's height band
- **visible striking limb**: yellow cross, from the model
- **contact events**: markers where hits and blocks were reported

### CPU

- **Delayed observation**: the CPU sees the opponent through a reaction delay (24 / 16 / 11
  frames for Easy / Normal / Hard), position included, and never reads inputs.
- **One reaction per attack**: it reacts once to each individual attack execution, so repeating
  the same move is noticed every time.
- **Punishing by frames and range**: it counts the frames still available (the opponent's
  remaining recovery minus its own delay and remaining blockstun) and picks the most damaging
  punisher, or punish route, that is fast enough with 2 frames of margin and reaches.
- **Hit-confirmed combos**: it opens with its fighter's authored routes and only continues past a
  confirm point once it has *seen* the hit land (after its reaction delay); a blocked opener stops
  the route. It makes occasional mistakes (25 / 12 / 5 %).

Personalities:
- **Ren** mixes basic attacks.
- **Maya** pressures at close range and dashes in.
- **Viktor** closes distance and throws most often.
- **Leila** waits in guard and punishes blocked attacks, or interrupts startup with Check Hook.
- **Caio** keeps kick range and sidesteps the most.
- **Sora** keeps spacing just outside range and punishes missed attacks.

Tests check the delay, per-execution reactions, timed punishes, hit-confirm and these
tendencies. Win rates between fighters are not balanced yet.

Fighter-specific rules:
- **Leila's Check Hook** deals **+30 % damage** when it hits an opponent during the startup of
  their attack.
- **Sora's Axis Heel** steps 0.35 m sideways during frames 2–12 of its startup. The movement uses
  ordinary collision and hurtboxes.
- **Viktor's Foundry Drop** deals **18**; every other throw deals **12**.
- **Caio's ginga idle sway is visual only**: hurtboxes come from the simulation posture, so idling
  never grants evasion (covered by a test).
- After getting up, a fighter cannot be thrown for 16 frames, so there is no guaranteed re-throw.

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
- **The character models are stylised (mushrooms, bear, cobra, chibi), not the realistic
  humans of the concept sheet.** They are the models supplied for the roster, so fighter names
  and moves were kept while the bodies changed. Renaming the fighters is a data-only change in
  `js/sim/characters.js`.
- **Strike / visual alignment**: collision is authoritative and unchanged. The animation steers
  the striking fist or foot onto the hit point: horizontally, and inside the attack level's height
  band. Short-limbed models lunge (up to 0.3 m; Ren up to 0.6 m, Caio 0.4 m) and hop (Ren up to
  0.6 m) to get there. Measured in the browser (`tests/e2e/strike-alignment.cjs`), at contact
  **54/54** hand and foot strikes have the visible limb within the hit radius and inside the
  height band (before this work: 38/55 and 41/55). Ren's chibi body lunges visibly on every
  strike: his move data assumes limbs 1.5–2.5× longer than his model's.
- No finger bones (the source meshes are single sculpts); hands keep their modelled grip.
  Weapons in the source meshes (Maya's blade, Ren's sword) are kept and ride the hand.
- **Animation is still procedural**: hand-keyed key poses with timed trajectories,
  retargeted to each skeleton. There is no motion capture and no authored clips, and the models
  came without any animation. Each attack has preparation, acceleration, contact,
  follow-through and recovery phases on the move's frame clock. String follow-ups wind up from
  where the previous strike ended. Walk cycles follow the distance actually travelled. Feet are
  planted and released by a timeline signal, and the skinned models lock planted feet in place.
  See *Remaining animation-asset needs* below.
- Audio is synthesised placeholder audio. The announcer uses the browser's speech synthesis,
  which varies by OS. Recorded SFX, voice and music should replace it.
- One stage. There is no breakable floor or wall, story, ranked mode or replays.
- Frame data, damage and CPU win rates are unbalanced starting values that need playtesting.
- Keyboard layout differs from the brief: the original layout is kept (P1: WASD move,
  U/I/J/K = 1/2/3/4, O throw, L guard, Esc pause) instead of arrows + J/K/U/I + C. Holding
  down crouches; there is no separate C crouch key. Every key can be remapped.
- Bound/tailspin, ground-bounce, back-turned states and chip damage are not modelled.

### Remaining animation-asset needs

The combat, timing and alignment systems are in place; what would raise animation quality further
is real motion data, which this project does not have:
- **Authored or motion-captured clips** for each fighter's stance, walk, run, sidestep, guard and
  hit reactions, and for every attack (prep / strike / recovery): about 20–30 clips per fighter
  on the shared skeleton (`hips, spine, chest, neck, head, clavicle/upperarm/forearm/hand,
  thigh/shin/foot/toe` with `_L` / `_R`, plus `tail1..n` for the cobra and bear), as glTF
  animations. The animation system would sample them on the move's frame clock and keep the
  current strike steering and foot locking on top.
- **Ren's model** (chibi proportions) would need a variant with longer limbs, or attack data
  tuned to its reach, to remove the visible lunges.
- **Finger bones / hand poses** (fist, open palm, knife hand) for all six models.
- **Paired throw clips**: thrower and victim animations that match each other.

## 8. Known limitations & performance requirements

- **GPU**: aim for any discrete or recent integrated GPU (roughly 2018 or newer). With
  `Graphics: high`, the game renders 2048² soft shadows, bloom and up to 2× pixel ratio.
  `medium` and `low` (in Settings) reduce the pixel ratio and shadow quality and disable bloom.
  **A 60 FPS frame rate on real hardware was not measured here**: the test environment only had
  CPU software rendering (SwiftShader), which ran at about 10 FPS. CPU cost of simulation plus
  animation was measured at about **0.03 ms per frame**, so frame rate depends on the GPU.
- **Measured in this environment** (`tests/e2e/visual-metrics.cjs`): CPU-vs-CPU, 900 simulation
  frames, 1280×720, headless Chromium with **software rendering (SwiftShader)**, so absolute fps
  says nothing about real GPUs:

  | Matchup | fps (prototype bodies / skinned models) | Planted-foot glide, mean mm per frame (prototype / skinned) | p95 |
  |---|---|---|---|
  | Ren vs Maya | 18.4 / 17.8 | 6.1 / 5.1 | 25.8 / 19.6 |
  | Sora vs Leila | 18.5 / 18.2 | 10.2 / 5.4 | 47.4 / 31.1 |
  | Viktor vs Caio | 19.4 / 18.3 | 15.5 / 8.5 | 57.5 / 37.0 |

  "Planted" means the animation timeline's plant weight is above 0.5. The remaining glide comes
  from block and hit pushback, which slides the whole body, and from re-anchoring when a lunge
  overstretches a locked leg. Character loading takes about 3 s locally (11 MB of GLBs).
- Browsers only reveal gamepads after a button press on that pad. Button numbering for
  non-standard (DirectInput) pads varies by browser and OS, which is why the remap screen exists.
- Firefox on Linux and Safari can report different axis and hat layouts. Use the Controllers
  screen to verify.
- Rumble depends on browser and pad support.
- Speech-synthesis voices may be missing on some systems. Announcements are always shown as text.

## 9. Test checklist (what was actually tested)

Automated, Node (`npm test`), **135/135 passing**:
- [x] **Every strike of all seven fighters**: it hits exactly once for its listed damage, the
  correct guard blocks it with no chip damage, highs whiff over a crouch, mids beat crouch guard,
  lows beat standing guard, and out of range it whiffs and completes its full recovery.
- [x] **Every advertised combo route** (`tests/combos.test.js`, 21 routes):
  - recorded damage equals measured damage;
  - launch and counter-hit routes land in the 25–35 target (main roster);
  - **true combos and juggles** land fully against a defender that guards at the earliest legal
    frame, at 0.7 / 0.85 / 1.0 m, and against every defender character;
  - launchers can be blocked;
  - **strings**: the gapped hit is blocked by the earliest guard (except Caio's gap-on-block
    string), and on block the documented defence (jab interrupt / duck / correct guard) beats it;
  - **counter-hit routes** do not continue from a normal hit.
- [x] **Input** (`tests/input.test.js`):
  - findMotion finds a newer motion behind an older one;
  - repeated qcf+1 works, and a used motion cannot fire twice;
  - a buffered attack comes out on the first free frame, and an interruption drops it with no
    stale attack afterwards;
  - a punish entered in the last blockstun frames comes out on the first free frame and lands,
    while an early press does not buffer;
  - mashing never bypasses recovery;
  - throws and knockdowns invalidate earlier inputs, and wake-up inputs don't fire attacks;
  - nothing re-floats an opponent after a finisher;
  - wall loops end within the 60-frame cap;
  - routes work with the fighters on swapped sides;
  - new rounds clear buffers;
  - outcomes are identical whether rendering happens every 1, 2, 4 or 7 simulation frames (no
    feedback from presentation);
  - animation resyncs after a reset.
- [x] **CPU and practice** (`tests/practice.test.js`):
  - delayed observation, and reactions per attack execution;
  - punishers fast enough (with margin) that actually land;
  - a blocked launcher is not followed up, and a confirmed route lands fully;
  - dummy modes (no guard, guard after first hit, random guard, counter hit);
  - record and playback;
  - a punish-drill PUNISHED verdict;
  - combo demonstrations land fully.
- [x] Throws (12 standard, 18 Foundry Drop, break, miss crouchers, no re-throw on get-up), Check
  Hook bonus, Axis Heel side step, Caio's sway grants no evasion, measured advantage matches
  data, sidestep vs tracking, arena and bodies, match rules, CPU-vs-CPU matches finish,
  personality tendencies, Kai's launcher, parry, Rage Art and wall splat.
- [x] **Assets**: every character GLB is valid, with a skeleton, weights and a manifest entry.

Automated, browser:
- `tests/e2e/strike-alignment.cjs`: **54/54** hand and foot strikes have the visible limb within
  the hit radius and inside the attack level's height band at contact (38/55 and 41/55 before).
- `tests/e2e/visual-metrics.cjs`: frame rate and foot glide (results in section 8).
Automated, browser (`tests/e2e/browser-e2e.cjs`, headless Chromium, **two emulated gamepads**,
one `standard` and one DirectInput with a hat switch), **28/28 passing**:
- [x] Both pads detected and assigned to P1 and P2; hat switch auto-detected; menu navigation
- [x] Each pad drives only its own fighter; both move at once; signature jabs on both mappings
- [x] Hits update the HUD; Start pauses; the sim is frozen while paused; pause menu input
- [x] Disconnect pauses with a warning and reconnecting restores the slot; one pad can't drive
  both players; remapping is saved
- [x] KO ends the round; round 2 resets health; rematch restarts without reload
- [x] All six fighters selected through the select screen and rendered in matches
- [x] All six character GLBs load; a mirror match uses two independent skeletons that animate
  independently
- [x] The portrait sheet loads, with no HTTP errors and no page errors

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
