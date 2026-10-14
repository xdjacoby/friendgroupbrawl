# Friend Group Brawl: notes for Claude

Smash-style platform fighter in the browser (Three.js + Vite, plain JS, no framework). The owner is making it with 3D models of their real friend group, for personal use only, not publishing. Read README.md for controls, the cast and the model pipeline. This file covers what a new session needs in order to work on the code.

## Working with the owner

- They're new to coding and on **Windows**. Give step-by-step instructions in plain words (Command Prompt, GitHub website clicks) and avoid jargon.
- They run the game by downloading the branch ZIP (or a merged `main`), then `npm install`, then `npm run dev`, and open http://localhost:5173.
- They upload models through the GitHub website into `public/models/`, sometimes on `main` and sometimes on the work branch. **Check every branch** (`git fetch origin '+refs/heads/*:refs/remotes/origin/*'`) when they say they uploaded something.
- The GitHub website rejects files over 25 MB, and Meshy exports are ~25 MB (about 18 MB of that is PNG textures). Point them at the model shrinker (`npm run dev`, then http://localhost:5173/shrink.html, also linked from the menu): it re-saves the textures as JPEG in the browser and keeps the mesh, skeleton and clips byte for byte (Jacoby: 24.2 MB → 9.4 MB, looks identical).
- They merge pull requests on GitHub themselves. Don't open a PR unless they ask.
- Their usage limits are tight. They prefer big batched requests built and tested in one go, with a short summary and a screenshot at the end.
- The humor is adult stoner-comedy among friends (Draven fights with a dab pen and an empty bong). That's fine, since it's a private fictional game.

## Running and testing

- `npm run dev` starts the dev server; `npx vite build` is the quick compile check. Vite 8 needs Node 20.19+.
- There's no test suite. Verify in headless Chromium with Playwright installed in the scratchpad, **not** as a project dependency (it would make the owner's `npm install` download browsers):
  - `chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, ignoreDefaultArgs: ['--headless=old'], args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`
  - `window.brawl.game` is the live `Game`. Set `game.ended = true` to freeze the loop (it keeps rendering), then call `game.step()` yourself for deterministic frame-by-frame tests. Swap `fighter.controller = { poll: () => input }` to script inputs. Return the **full** input shape (`shield: false`, `grab: false`, `specialHeld: false` etc.): `shielding = undefined` makes the shield bubble render.
  - Matches start with whatever state the CPUs left while models loaded. Clear `hitFlash`, `invuln`, `hitstun`, `hitlag` and `move` (and `dropGrab()`) before screenshots, or a model renders as a white flash silhouette, or the first scripted press gets eaten by leftover hitlag.
  - Set `ROSTER[i].model` from `window.brawl` before clicking Fight to try a different model file.
  - Pose contact sheets: set `game.showHitboxes = true`, put `f.move = { name, def: f.moves[name], frame, hit: new Set() }` and call `game.render(0.05)` a few times per frame you want. Every swing should reach its hitbox on the active frames.
  - Headless rendering of the skinned model runs the sim at about half speed. **Sync tests to `game.frame`, not wall-clock waits.**
  - Override `game.updateCamera` to get close-up screenshots (two scanned models filling a 1280px frame can time out; use 960×540 or pass a longer `timeout`). Fast 4-CPU stress matches (step a few thousand frames in one `evaluate`) catch crashes, NaNs and stuck states. Effects only age in `render`, so they pile up while stepping without rendering; that's not a leak.
- Stop the dev server with `pkill -f "[v]ite --port"`. The brackets keep pkill from matching its own shell.

## Architecture (src/)

| File | Role |
|---|---|
| `main.js` | Menu / character select, match flow, fixed 60 fps loop (`STEP`), pause, results |
| `game.js` | One match: hit detection (path + swept hitboxes), grab boxes, stage collision, ledge grabs, projectiles (thrown, rolling, pickups), camera, KOs, hitbox viewer |
| `fighter.js` | Physics and state machine: jumps, moves, hitstun, shield, dodges, crouching, grabs/pummels/throws, ledge hanging |
| `moves.js` | Field docs, default frame data (`MOVES`), `REST` guard pose, `hitboxPos`, dodges/ledge attack (`DODGES`), grabs and throws (`GRABS`), `pickAttack`/`pickSpecial` |
| `characters/*.js` | Per-friend overrides: stats, model, props, poses, moves, HUD line (`draven.js` and `jacoby.js`) |
| `roster.js` | Character list (Draven, Jacoby, plus placeholders "Friend 3" and "Friend 4") |
| `input.js` | Keyboard (two layouts), gamepad, and CPU AI (grabs, throws, mashing, character `cpu` habits), all producing the same input shape |
| `poses.js` | Procedural poses per state (incl. `duck`, `hold`, `held`; `HOLD` arms), `keyframes()` for attack animations; moves supply `pose(frame, f)` |
| `puppet.js` | Drives a Mixamo-named skeleton from poses (aims bones in world space) |
| `view.js` | Fighter visuals: placeholder figure or GLB (per-fighter material copies, metalness forced to 0), swappable hand props, flashes, roll/tumble/pitch |
| `props.js` | Bong, dab pen, magnifying glass, snacks, chip bag (grip at origin, business end toward -y, +x forward when upright; `setGlow` lights the pen / inflates the bag) |
| `effects.js` | Sparks, KO blasts, puffs, vapor clouds, pop-up text, dirt/crumb debris |
| `stage.js` | Stage data (main platform, ledges, pass-through platforms, blast zones) and the cartoon scenery: toon materials, `ink()` outlines, canvas-painted textures |
| `shrink.js` + `/shrink.html` | Model shrinker page: re-encodes a GLB's textures (JPEG, max size picked by the user), copies everything else as is |
| `/tools/autorig.py` | Auto-rigger for un-rigged models (Blender's Python module; see below) |

## Conventions

- Units are meters and seconds; frame data is in 60 fps frames. Fighters are positioned by their feet (`x`, `y`), with hurtbox `hw` × `h`.
- **Body space** for poses: +x = facing direction, +y = up, +z = the fighter's right side. Limb keys are `rArm`/`rFore`/`lArm`/`lFore`/`rThigh`/`rShin`/`lThigh`/`lShin`. A forearm value of `'mouth'` aims at the mouth. Extras: `lean`, `look`, `crouch`, `spin`, `rProp`/`lProp` (`'club'` or `'upright'`), `glow`.
- Move fields (full docs at the top of `moves.js`): `total`, `hitboxes[{start,end,x,y | path,r,dmg,base,growth,angle,group,prop}]` (x is relative to facing; `path: [[frame,x,y],...]` slides it along a swing; each `group` hits a victim once per move; `prop: 'right'` only counts while that hand holds its prop), `limb`, `aerial`, `landingLag`, `scripted` (the move sets velocity itself; no drift and no fall cap), `intangible: [from, to]`, `helplessAfter`, `onStart/onFrame/onLand/onHit`, `combo: {next, from}`, `available(f)` + `fallback`, `ledgeGrab`, `projectileFrame` plus `projectile` (or call `world.spawnProjectile(f, def)` from `onFrame`), `pose(frame, f)`. Grab moves: `grab: {start,end,x,y,r}` (grab box, ignores shields); while holding, `pummel: {frame, dmg}` or a throw: `throw: {frame, dmg, base, growth, angle}` plus `carry: [[frame,x,y],...]` (the victim's path until release). `f.pummelHeld(world, dmg)` hurts the held victim mid-move (Jacoby's burning down throw). Projectiles: clouds use `pierce`/`hitEvery`/`noKnockback`/`slow`/`unique`; thrown props use `look: 'prop'`, `vy`/`gravity` and either `pickup` (lands, owner walks over it to get it back, `returnFrames` if lost offstage, `restLift`/`restAngle` for how it lies) or nothing (bursts on landing into `burst`-colored crumbs; `roll: true` rolls along the floor instead).
- Attack poses are `keyframes([[frame, pose], ...])`; keys inherit from the previous key and limbs slerp between keys (keep keys < ~150° apart). Line the swing up with the hitbox frames. Reference geometry: shoulder ~1.45 m, hip ~0.92 m, arm reach ~0.62 m, leg ~0.95 m, Draven's bong tip ~1.3 m from the shoulder. `pitch` flips the whole body around the waist (default uair backflip); hitbox paths for it are computed by rotating the foot around (0, 0.9).
- Hitboxes are tested as a swept capsule from last frame's position, so fast swings/lunges don't skip. Put inner hitboxes near the body so point-blank hits don't whiff.
- Input shape: `{ x, y, jump, jumpHeld, attack, special, specialHeld, grab, shield, shieldPressed, downPressed, xPressed, pause }`. Keyboard grab is J / M (or shield + attack); gamepad triggers shield and bumpers grab (Smash layout). `specialHeld` is for charge moves (Draven's Hotbox holds on its frame while it's down). The CPU holds special for a random while after pressing it.
- Fighter extras: `power` (getter: stats × `powerBonus`), `heal(amount, world)`, `handEmpty[side]` (prop thrown), `propReturn`, `charState` (character scratch state, e.g. Jacoby's `snack` and `munchies`), `crouching` + `hurtH` (hurtbox height, 60% while crouching; crouching also takes 15% less knockback), `holding = {victim, timer, frame}` / `heldBy` (grabs; any hit on either breaks it with `releaseGrab()`). All reset on respawn. Character extras: `poses.*` can be objects or functions of the fighter (`base` applies in every state; `crouch` arms also apply to the `duck`), `hud(f)` (HUD status line), `cpu(f, {target, dist, dx, dy})` (CPU habits: return extra input like `{ special: true, y: -1 }`, plus `face: true` to turn toward the target, or null).
- Knockback: `kb = (base + growth * percent * 0.19 * 100/weight) * powerFactor * crouchCancel`, decaying at 25 m/s². With current tuning, KOs land around 80–200% (back throw ~130% at the ledge).
- Characters merge as `{ ...MOVES, ...DODGES, ...GRABS, ...character.moves }`. "Once per airtime" side/up special limits are applied by name in `handleActions`.
- Match the existing style: small focused modules, short comments explaining *why*, no build-time tooling beyond Vite.

## Adding a friend

1. Create `src/characters/<name>.js` (copy `draven.js` or `jacoby.js`), then import it into `roster.js` in place of a placeholder.
2. Set `model: 'models/<name>.glb'`. Meshy auto-rigged GLBs use `mixamorig:*` bone names; GLTFLoader strips the `:`, which `puppet.js` handles. Only a run/walk clip gets used; everything else is procedural.
   - **Un-rigged model?** Rig it yourself: `python3 -m venv /tmp/bpy && /tmp/bpy/bin/pip install bpy` (Blender 5.x as a Python module, ~400 MB, PyPI is reachable), then `/tmp/bpy/bin/python tools/autorig.py in.glb public/models/<name>.glb`. It welds the scan's seam-split vertices (heat weights fail on the ~5000 loose pieces otherwise), places Mixamo-named joints from the mesh's shape plus Mixamo proportions, skins with Blender's automatic weights and saves JPEG textures. Tested by stripping Jacoby's rig and re-rigging him: every pose matched Meshy's rig. Needs a standing T/A-pose facing glTF +Z. Don't name a scratch script `inspect.py` next to it: it shadows the stdlib module and bpy crashes on import.
3. Untextured files get a tinted clay material automatically. Models are scaled to 1.8 m and centered on the Hips bone.
4. Give them unique normals too (the owner asked for that for Draven), with keyframed poses lined up with the hitboxes.
5. Verify with close-up pose screenshots with hitboxes shown (idle, run, air, attacks, every special, ledge hang) on both the real model and the placeholder (`ROSTER[i].model = null`).

## Current state

- Done: core fighting, 4-player local play plus CPU AI, Smash-style grabs (standing/dash/shield grab, pummel, four throws, mash out, grab release), crouching (duck pose, shorter hurtbox, crouch cancel), Draven's full moveset (unique normals and specials; Hotbox charges like Piranha Plant's Poison Breath) and props, Jacoby (the owner: magnifying glass toss K. Rool-crown style as side special, Snack Dig/Snack Toss on neutral special holding one snack at a time, Snack Time eat (heal + munchies) or Munch on down special, Mostly Air chip-bag float recovery, Close Inspection down throw), procedural keyframed animation for rigged models, jab combos with longer reach, hitbox viewer (grab boxes purple), ledge grabbing (climb/jump/attack/roll/drop), rolls, spot dodge, air dodge, cartoon-style stage, model shrinker page, auto-rig script.
- `public/models/draven.glb` and `jacoby.glb` are textured, rigged Meshy exports (~25 MB each; the shrinker would take them to ~10 MB if the owner wants faster downloads). Meshy names downloads like `Meshy_AI_..._All_Animations.glb`; rename to the character's file name (`git mv`) when the owner uploads one.
- Friends 3 and 4 are placeholders. They'll arrive with models and personalities to design movesets from.
- Roadmap ideas: more stages (reuse `toon()`/`ink()`/`paint()` from `stage.js`), items, sound and music, character portraits, online play.
