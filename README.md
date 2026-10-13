# Friend Group Brawl

A Smash-style platform fighter starring the friend group. Runs in the browser (Three.js), up to 4 players on one screen with keyboards and/or gamepads, plus CPU opponents for practice.

Personal project, not for publishing.

## Running it

Requires [Node.js](https://nodejs.org) 20.19 or newer (just install the LTS version).

```sh
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). `npm run dev` also prints a network URL, so other devices on your Wi-Fi can open the game too.

`npm run build` produces a static `dist/` folder you can host anywhere or open with `npm run preview`.

## How to play

Knock opponents off the stage. Hits raise their damage %, and the higher it is, the farther they fly. Last one with stocks left wins.

| | Keyboard (WASD) | Keyboard (Arrows) | Gamepad |
|---|---|---|---|
| Move | A / D | ← / → | Stick or D-pad |
| Jump (double jump in air) | W or Space | ↑ | A or Y |
| Attack | F | , | X |
| Special | G | . | B |
| Shield | H | / | Bumpers / triggers |
| Pause | Esc | Esc | Start |

Hold a direction while pressing attack or special to pick the move:

- **Attacks**: neutral jab, side kick, up swipe, down sweep on the ground; neutral spin, forward punch, back kick, up kick, and a down spike in the air.
- **Specials**: neutral = projectile; side = lunge; **up = recovery jump** (once per airtime, then you're helpless until you land); down = ground pound with a shockwave.
- Tap jump for a short hop, hold it for a full jump. Tap down on a floating platform to drop through. Hold down in the air to fast-fall.

## Putting your friends in the game

Placeholder characters are defined in [`src/roster.js`](src/roster.js). Rename them and tweak their stats (weight, speed, jump, gravity, power, size) there.

To use a real 3D model of a friend:

1. **Scan.** Use a phone photogrammetry app like Polycam, KIRI Engine, or Scaniverse. The friend should stand in an **A-pose or T-pose** (arms out from the body) and hold still. Walk slowly all the way around them. Even lighting and no hats help. Export as **GLB** or **OBJ**.
2. **Clean up** (optional but recommended) in [Blender](https://www.blender.org) (free): delete the floor and background, cut down the polygon count with a *Decimate* modifier (aim for under ~50k triangles), then export.
3. **Rig + animate.** Upload the model (FBX or OBJ) to [Mixamo](https://www.mixamo.com) (free with an Adobe account). It auto-rigs the skeleton. Download animations named so the game can find them: `idle`, `run`, `jump`, `punch`, `kick`, `hit`. Combine them into one GLB in Blender (import the FBXs, then *File → Export → glTF 2.0*, format `.glb`).
4. **Drop it in.** Put the file in `public/models/` (e.g. `public/models/jake.glb`), then set `model: 'models/jake.glb'` on that friend's roster entry.

The game scales any model to fighter height automatically. A model with no animations still works: it just leans and squashes instead of animating. Animations are matched by name, so a clip called `Running` or `mixamo_run` is picked up as `run`, and you can add per-move clips named after moves (`fair`, `uspecial`, …).

## Project layout

```
src/
  main.js      menu, match flow, game loop (fixed 60 fps simulation)
  game.js      a single match: hit detection, stage collision, camera, KOs
  fighter.js   fighter physics + state machine (jumping, attacks, hitstun, shield)
  moves.js     frame data for every move: tweak damage/knockback here
  input.js     keyboard, gamepad and CPU controllers
  roster.js    the characters
  stage.js     stage layout and scenery
  view.js      fighter visuals (placeholder rig or loaded GLB model)
  effects.js   hit sparks, KO blasts
  hud.js       damage % / stock display
```

## Roadmap ideas

- Unique movesets and specials per friend (inside jokes welcome)
- Ledge grabbing, dodges/rolls, grabs and throws
- More stages
- Items
- Sound effects and music
- Character select portraits taken from the scans
- Online play (WebRTC peer-to-peer with rollback netcode)
