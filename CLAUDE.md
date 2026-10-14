# Friend Group Brawl: notes for Claude

Smash-style platform fighter in the browser (Three.js + Vite, plain JS, no framework). The owner is making it with 3D models of their real friend group, for personal use only, not publishing. Read README.md for controls, the cast and the model pipeline. This file covers what a new session needs in order to work on the code.

## Working with the owner

- They're new to coding and on **Windows**. Give step-by-step instructions in plain words (Command Prompt, GitHub website clicks) and avoid jargon.
- They run the game by downloading the branch ZIP (or a merged `main`), then `npm install`, then `npm run dev`, and open http://localhost:5173.
- They upload models through the GitHub website into `public/models/`, sometimes on `main` and sometimes on the work branch. **Check every branch** (`git fetch origin '+refs/heads/*:refs/remotes/origin/*'`) when they say they uploaded something.
- They merge pull requests on GitHub themselves. Don't open a PR unless they ask.
- Their usage limits are tight. They prefer big batched requests built and tested in one go, with a short summary and a screenshot at the end.
- The humor is adult stoner-comedy among friends (Draven fights with a dab pen and an empty bong). That's fine, since it's a private fictional game.

## Running and testing

- `npm run dev` starts the dev server; `npx vite build` is the quick compile check. Vite 8 needs Node 20.19+.
- There's no test suite. Verify in headless Chromium with Playwright installed in the scratchpad, **not** as a project dependency (it would make the owner's `npm install` download browsers):
  - `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, ignoreDefaultArgs: ['--headless=old'], args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`
  - `window.brawl.game` is the live `Game`. Set `game.ended = true` to freeze the loop (it keeps rendering), then call `game.step()` yourself for deterministic frame-by-frame tests. Swap `fighter.controller = { poll: () => input }` to script inputs.
  - Headless rendering of the skinned model runs the sim at about half speed. **Sync tests to `game.frame`, not wall-clock waits.**
  - Override `game.updateCamera` to get close-up screenshots. Fast 4-CPU stress matches (step a few thousand frames in one `evaluate`) catch crashes, NaNs and stuck states.
- Stop the dev server with `pkill -f "[v]ite --port"`. The brackets keep pkill from matching its own shell.

## Architecture (src/)

| File | Role |
|---|---|
| `main.js` | Menu / character select, match flow, fixed 60 fps loop (`STEP`), pause, results |
| `game.js` | One match: hit detection, stage collision, ledge grabs, projectiles, camera, KOs |
| `fighter.js` | Physics and state machine: jumps, moves, hitstun, shield, dodges, ledge hanging |
| `moves.js` | Default frame data (`MOVES`), shared dodges/ledge attack (`DODGES`), `pickAttack`/`pickSpecial` |
| `characters/*.js` | Per-friend overrides: stats, model, props, poses, moves (`draven.js` is the template) |
| `roster.js` | Character list (Draven, plus three placeholders "Friend 2–4") |
| `input.js` | Keyboard (two layouts), gamepad, and CPU AI, all producing the same input shape |
| `poses.js` | Procedural poses per state; moves can supply `pose(frame)` |
| `puppet.js` | Drives a Mixamo-named skeleton from poses (aims bones in world space) |
| `view.js` | Fighter visuals: placeholder figure or GLB, props in hands, flashes, roll/tumble |
| `props.js` | Bong and dab pen meshes (grip at origin, business end toward -y) |
| `effects.js` | Sparks, KO blasts, puffs, vapor clouds |
| `stage.js` | Stage data (main platform, ledges, pass-through platforms, blast zones) and scenery |

## Conventions

- Units are meters and seconds; frame data is in 60 fps frames. Fighters are positioned by their feet (`x`, `y`), with hurtbox `hw` × `h`.
- **Body space** for poses: +x = facing direction, +y = up, +z = the fighter's right side. Limb keys are `rArm`/`rFore`/`lArm`/`lFore`/`rThigh`/`rShin`/`lThigh`/`lShin`. A forearm value of `'mouth'` aims at the mouth. Extras: `lean`, `look`, `crouch`, `spin`, `rProp`/`lProp` (`'club'` or `'upright'`), `glow`.
- Move fields: `total`, `hitboxes[{start,end,x,y,r,dmg,base,growth,angle}]` (x is relative to facing), `limb`, `aerial`, `landingLag`, `scripted` (the move sets velocity itself; no drift and no fall cap), `intangible: [from, to]`, `helplessAfter`, `onStart/onFrame/onLand`, `projectileFrame` plus `projectile`, `pose(frame)`. The projectile options are documented at the top of `moves.js` (clouds use `pierce`/`hitEvery`/`noKnockback`/`slow`/`unique`).
- Knockback: `kb = (base + growth * percent * 0.19 * 100/weight) * powerFactor`, decaying at 25 m/s². With current tuning, KOs land around 80–200%.
- Characters merge as `{ ...MOVES, ...DODGES, ...character.moves }`. "Once per airtime" side/up special limits are applied by name in `handleActions`.
- Match the existing style: small focused modules, short comments explaining *why*, no build-time tooling beyond Vite.

## Adding a friend

1. Create `src/characters/<name>.js` (copy `draven.js`), then import it into `roster.js` in place of a placeholder.
2. Set `model: 'models/<name>.glb'`. Meshy auto-rigged GLBs use `mixamorig:*` bone names; GLTFLoader strips the `:`, which `puppet.js` handles. Only a run/walk clip gets used; everything else is procedural.
3. Untextured files get a tinted clay material automatically. Models are scaled to 1.8 m and centered on the Hips bone.
4. Verify with close-up pose screenshots (idle, run, air, attacks, every special, ledge hang) on both the real model and the placeholder (`ROSTER[i].model = null`).

## Current state

- Done: core fighting, 4-player local play plus CPU AI, Draven's full moveset and props, procedural animation for rigged models, ledge grabbing (climb/jump/attack/roll/drop), rolls, spot dodge, air dodge.
- `public/models/draven.glb` is still untextured. The owner is re-downloading a textured, rigged version to upload under the same name.
- Friends 2–4 are placeholders. They'll arrive with models and personalities to design movesets from.
- Roadmap ideas: grabs/throws, more stages, items, sound and music, character portraits, online play.
