# Hollow Manor

A first-person zombie survival game that runs in the browser (Three.js, no build step).
You start on the drive of a fogbound estate: explore the grounds, the graveyard, the tool shed
and the manor's lamp-lit halls while waves of undead close in.

- First-person by default; press V / tap CAM to see the **Lawman** over the shoulder.
- Every enemy uses the werewolf or ogre model: smaller ones shamble, **werewolves** sprint at you,
  full-size **ogres** soak up bullets.
  The character meshes in `models/` have no skeleton, so `js/models.js` swings their legs and
  arms in the vertex shader around hip/shoulder pivots measured from each mesh. Invisible boxes
  act as body/head hitboxes.
- Brutal melee: shamblers **grab** you and bite until you mash fire / Space to break free,
  werewolves **pounce** from range, ogres **slam** the ground and knock you back. Claw marks and
  blood land on the screen.
- Headshots pop the head off (with a neck fountain and flying gibs), kills trigger a short
  hit-stop, and bullets stagger zombies back.
- Ammo and medkits are hidden around the manor and dropped by the dead.
- Zombies path-find around walls and through doorways (flow field over a nav grid).
- All textures and audio are generated in code; no asset files.

## Run

```
npm start        # http://localhost:8080
```

ES modules need a server; opening `index.html` from disk will not work.

## Controls

| Desktop | Touch |
| --- | --- |
| WASD move, mouse aim (click to lock) | Left stick move, drag right side to aim |
| Click fire, R reload | Red button fire (hold to keep firing, drag it to aim) |
| Shift sprint, F flashlight, Esc pause | RUN / R / light buttons |

## Deploy

Static site: deploy this folder as-is (e.g. Vercel with `vercel.json`, output directory `.`).

## Last Mile (`run.html`)

A second game in the same folder: a first-person endless runner. You sprint forward without
stopping through procedurally generated night fields (hay bales, fences, wrecks, barns, corn),
steer around obstacles and the dead, and grab glowing supply crates for a revolver, shotgun or
rifle with limited ammo. Shots auto-aim at the zombie in front of you. The horde thickens and
speeds up the further you get; any zombie that reaches you ends the run. Best distance is kept
in the browser.

Controls: A/D or mouse to steer, click/Space to fire. Touch: drag left/right to steer, red button to fire.
Open `http://localhost:8080/run.html` after `npm start`.
