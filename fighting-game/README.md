# Iron Fist Arena

A browser-based 3D fighting game inspired by the camera, combat system and presentation of
modern 3D fighters such as Tekken 7. All characters, stage, animation, audio and branding are
original. There are no ripped or third-party game assets.

- **Local versus for two players** on two physical gamepads (BeTop, XInput or DirectInput pads),
  with keyboard fallback.
- **True 3D combat**: sidesteps and sidewalks around the opponent, a locked attack facing with
  per-move tracking (homing moves catch sidesteps, linear ones don't), and high/mid/low hit levels.
  Throws and throw breaks, a parry, power-crush armour, launchers, air juggles, wall splats,
  crumples, counter hits, combo scaling and Rage Arts are all in.
- **Two original fighters**: **Kai**, a fast Azure Flow Kenpo stylist in blue and black, and
  **Viktor**, a heavy Iron Sambo bruiser in red and dark metal.
- **Modes**: Versus (2P), Versus CPU, Training (with frame data, dummy behaviours and reset).
  There are also controller assignment and test screens, button remapping and settings.

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
npm test                                   # 23 headless combat / match / AI tests (Node)
npm start &                                # then, if Playwright + Chromium are installed:
node tests/e2e/browser-e2e.cjs             # 20 browser checks with two emulated gamepads
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
│   │   ├── characters.js   Kai & Viktor stats and move lists with full frame data
│   │   ├── fighter.js      Per-fighter state, input buffer, posture
│   │   ├── world.js        State machine, movement, hit/hurt boxes, blocking, juggles,
│   │   │                   throws, parry, armour, walls, camera side, events
│   │   ├── match.js        Rounds, timer, KO / time-out, best-of-N, training upkeep
│   │   └── ai.js           CPU opponent and training dummy (feed raw inputs like a pad)
│   ├── input/InputManager.js  Keyboard + Gamepad API, slots, hat-switch decode, remap, rumble
│   ├── render/
│   │   ├── GameView.js     Renderer, bloom post-processing, PMREM reflections, wiring
│   │   ├── FighterModel.js Procedural sculpted fighters on a two-bone IK rig
│   │   ├── Animator.js     State → pose: keyframed attacks synced to frame data, locomotion,
│   │   │                   hit reactions, juggles, throws, crossfades
│   │   ├── poses.js        Pose library (stances, reactions, 23 attack animations, win/intro)
│   │   ├── Stage.js        "Sunset Temple Courtyard" arena, lights, embers
│   │   ├── CameraRig.js    Side-on fighting camera, zoom, cinematic intro/KO/win, shake
│   │   ├── Effects.js      Pooled sparks, flashes, rings, dust and limb trails
│   │   └── textures.js     Procedurally generated textures
│   ├── audio/Audio.js      Web Audio synthesised SFX, grunts, music; speech announcer
│   └── ui/UI.js            Title, menus, character select, controllers, remap, move list,
│                           results, HUD
├── tests/                  Node tests (combat.test.js) and Playwright e2e (e2e/)
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

Directions are relative to your fighter: **f** = toward the opponent, **b** = away from them.

| Technique | Input |
|---|---|
| Walk / dash / backdash | f / f,f / b,b (hold f after a dash to run) |
| Sidestep into / out of the screen | tap up / tap down (double-tap and hold to sidewalk) |
| Jump / crouch | hold up (or up-forward / up-back) / hold down |
| Stand guard (blocks highs and mids) | stand still, hold back, or hold Guard |
| Crouch guard (blocks lows; highs whiff over you) | hold down-back or down |
| Throw / break | 1+3 or 2+4 (Throw button = 1+3). Break with **1** (vs 1+3) or **2** (vs 2+4); 1+2 breaks both. Crouching avoids throws |
| Get up | any button or direction when knocked down (hold back to roll away) |
| Rage | below 25% health you gain Rage (+10% damage) and one **Rage Art** (df+1+2) |

**Combo starters.** Kai: `df+2` launcher, then `1,2,4` in the air. You can also go `uf+4`, then
`1,2` and `3,4`. Viktor: `df+2`, then `1,1,2`. `f,f+2` (Kai) and `b+2` / `f,f+1+2` (Viktor)
**wall splat** near walls. Kai's `b+1+2` **parries** highs and mids into a counter palm. Viktor's
`f+2` **power crushes** through highs and mids.

The full move lists with startup, damage and block/hit advantage are in-game: **Move List**, the
pause menu, or the training HUD.

| Kai (Azure Flow Kenpo) | Viktor (Iron Sambo) |
|---|---|
| 23 moves: jabs and 1,2,4 / 1,1,2 / 2,1 / 3,4 strings, df+1 elbow, df+2 launcher, d+1, d+4 sweep, 4 roundhouse, uf+4 flying knee (evades lows), 3+4 homing whirlwind, f,f+2 Tiger Palm, qcf+1 Azure Dragon Fist, b+1+2 parry + counter, air kick, two throws, Rage Art | 20 moves: 1,1,2 / 1,2 strings, 2 haymaker (crumple on counter hit), df+1, df+2 launcher, d+1, d+4, 3 push kick, 4 homing roundhouse, f+2 power crush, b+2 shoulder (+5 on block), f,f+1+2 Bulldozer, 3+4 Earthquake Stomp (hits grounded), air knee, three throws incl. f+1+2 command throw, Rage Art |
| Faster walk, dash and sidestep, quicker recovery | Slower and heavier (less pushback), more damage and reach |

## 7. Implemented features vs. still needing work

**Implemented (and exercised by tests or screenshots):**
- Fixed 60 Hz deterministic simulation with render interpolation and hit-stop.
- Separate hitboxes (swept capsule along the locked facing, vertical band per hit level) and
  hurtboxes (stand, crouch, airborne, jumping and grounded profiles).
- Startup, active and recovery frames. Block stun and hit stun come from frame advantage, which
  the tests verify, e.g. jab +8 on hit and df+2 −13 on block.
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
- Procedural characters: sculpted lathe meshes, PBR skin, cloth and metal, faces, hair,
  costumes. A two-bone IK rig keeps feet planted.
- 23 attack animations synced to frame data, plus stances, walk and run cycles, guard, hit
  reactions, juggle tumbling, knockdown and get-up, wall, crumple, throws, intros and victory
  poses.
- Stage with shadows, PMREM reflections, bloom, fog, embers, lanterns and neon wall strips.
- Particle hit and block sparks, flashes, rings, dust and limb trails.
- Synthesised SFX for hits, blocks, whooshes, footsteps, grunts, bells and KO, plus procedural
  music with separate master, SFX, music and voice volumes.
- Full UI: title, main menu, character select (simultaneous for 2P), controllers and test
  screen, remap, settings, pause, move list, training panel, HUD (health with recoverable lag,
  timer, round pips, combo and damage counter, callouts, announcements) and results with rematch.
- Best-of-N rounds (1, 2 or 3 to win), round timer (30/60/99/∞), time-out and draw handling,
  rematch without reloading.
- Gamepad rumble on hits, where the browser supports `vibrationActuator`.

**Still needing work / not implemented:**
- **Online multiplayer is not implemented.** There is no server or netcode. The deterministic sim
  is designed so rollback netcode could be added later, but nothing online exists today.
- Characters are procedural primitives on an IK rig, not artist-made skinned meshes with
  motion-captured animation. They read clearly as 3D martial artists but are not AAA-realistic.
  Replacing them with rigged glTF models is the main visual upgrade path.
- Audio is synthesised placeholder audio. The announcer uses the browser's speech synthesis,
  which varies by OS. Recorded SFX, voice and music should replace it.
- Only two characters and one stage. There is no breakable floor or wall, story, ranked mode,
  replays or input-recording dummy.
- The CPU AI is a simple reactive behaviour script with three difficulty levels.
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

Automated, Node (`npm test`), **23/23 passing**:
- [x] Command parser and priority (`qcf+1` > `df+1+2` > `1`)
- [x] Jab connects in range and deals 7 damage; **+8 on hit measured**
- [x] Jab whiffs out of range
- [x] Idle stand-guard blocks a mid launcher; **−13 on block measured**
- [x] Highs whiff on crouchers; mids hit crouch-guard
- [x] Lows hit standing guard; crouch guard blocks lows
- [x] Sidestep evades a linear attack; a homing attack still hits
- [x] Launcher → airborne; 1,2,4 juggle continues the combo; scaled damage < raw damage
- [x] Juggles always end (victim lands) with a bounded hit count
- [x] Throw connects; correct button breaks; wrong button gets thrown (35 damage)
- [x] Throws whiff on crouching opponents
- [x] Kai's parry negates a mid and the counter strike lands
- [x] Viktor's power crush absorbs a jab and still hits
- [x] Counter hit detected when interrupting startup
- [x] Wall splat near a wall
- [x] Fighters stay inside the arena, keep facing each other and never overlap
- [x] Each player's input moves only their own fighter
- [x] 1,2,4 string chains into 3 hits
- [x] Best-of-three: KOs award rounds, match ends 2–0
- [x] Time-out gives the round to the healthier fighter; next round resets HP and state
- [x] 2-minute CPU-vs-CPU soak test: no NaNs, no arena escapes, no negative HP
- [x] Training: dummy never dies, health refills, reset button repositions
- [x] Training dummy "guard all" blocks a high, a mid and a low in place

Automated, browser (`tests/e2e/browser-e2e.cjs`, headless Chromium, **two emulated gamepads**,
one `standard` and one DirectInput with a hat switch), **20/20 passing**:
- [x] Both pads detected and assigned to P1 and P2; hat switch auto-detected
- [x] Menu navigation with a pad
- [x] P1's pad moves only fighter 1; P2's hat switch moves only fighter 2; both move at once
- [x] Face buttons perform attacks on both mapping types; hits damage and update the HUD bar
- [x] Start pauses; the sim is frozen while paused; the pause menu takes pad input
- [x] Disconnect mid-fight pauses with a warning; reconnect restores the same player slot
- [x] One pad can't be assigned to both players (swaps instead)
- [x] Remap captures a new button and saves it
- [x] KO ends the round; round 2 starts with full health; rematch restarts without reload
- [x] No page errors

Manual and visual (screenshots in headless Chromium):
- [x] Title, main menu, character select, controllers screen, move list, training HUD, pause,
  results and in-fight HUD render correctly
- [x] Attack, reaction, throw, knockdown, wall, crumple, win and intro poses reviewed frame by
  frame for both characters

**Not verified (no hardware available in this environment):**
- [ ] Two **physical BeTop controllers**, over USB or Bluetooth, in XInput or DirectInput mode.
  The emulated test covers the same code paths, but real device button numbering must be
  confirmed on the Controllers screen.
- [ ] Frame rate on a real GPU
- [ ] Audio by ear (sounds are generated, but nobody listened to them here)
- [ ] Firefox and Safari behaviour
