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
| Shield / dodge | H | / | Bumpers / triggers |
| Pause | Esc | Esc | Start |

Hold a direction while pressing attack or special to pick the move:

- **Attacks**: neutral jab, side kick, up swipe, down sweep on the ground; neutral spin, forward punch, back kick, up kick, and a down spike in the air.
- **Specials**: neutral = projectile; side = lunge; **up = recovery jump** (once per airtime, then you're helpless until you land); down = ground pound with a shockwave.
- Tap jump for a short hop, hold it for a full jump. Tap down on a floating platform to drop through. Hold down in the air to fast-fall.

**Dodging** (you can't be hit while you glow blue):
- **Roll**: hold shield and tap left/right (or hold a direction and press shield). You end up facing back the way you came.
- **Spot dodge**: hold shield and tap down. Sidestep in place.
- **Air dodge**: press shield in the air. Hold a direction to zip that way. Once per jump; landing or grabbing a ledge resets it.

**Ledges**: fall next to the edge of the main stage to grab it automatically. You're invincible for a moment when you grab (once per trip off the stage), and your double jump and up special come back. From the ledge:
- **Up or toward the stage**: climb up
- **Jump**: jump up from the ledge
- **Attack or special**: climb up with a sweeping kick
- **Shield**: roll onto the stage
- **Down or away**: let go

Only one fighter can hang on a ledge at a time, and after 5 seconds you let go.

## The cast

### Draven
Dab pen in his left hand, a big empty bong in his right. All his arm attacks swing the bong. Floaty and a bit heavy.

| Special | Move | What it does |
|---|---|---|
| Neutral | **Dab Rip** | Hits the pen (the LED lights up), then blows a cloud that drifts forward and chips anyone inside it. |
| Side | **Bong Bonk** | Big overhead bong swing. Slow to come out, but it sends people. |
| Up | **Rip Rocket** | One huge rip, then he blasts the cloud downward and rides it up. Spikes anyone underneath. His recovery. |
| Down | **Hotbox** | Exhales a huge cloud that hangs around for 5 seconds. Opponents inside take chip damage and slow down. |

Friends 2–4 are still placeholders with the default moveset.

## Putting your friends in the game

Characters are defined in [`src/roster.js`](src/roster.js): name, color, stats (weight, speed, jump, gravity, power, size) and model. A friend with their own moves and props gets a file in [`src/characters/`](src/characters/); [`draven.js`](src/characters/draven.js) is the example to copy.

To use a real 3D model of a friend:

1. **Make the model.** Easiest: [Meshy](https://www.meshy.ai) image-to-3D from one full-body photo (facing the camera, arms slightly out, plain background). Phone scanning apps (Polycam, KIRI Engine, Scaniverse) also work.
2. **Rig it.** In Meshy, use **Animate** to auto-rig it as a humanoid. Adding a run animation is nice but optional. Download as **GLB**, with textures if you can.
3. **Drop it in.** Upload the file to `public/models/` and point that friend's roster entry at it, e.g. `model: 'models/draven.glb'`.

The game scales any model to fighter height automatically. If the model has a Mixamo-style skeleton (Meshy's auto-rig does), the game **animates it in code**: idle, jumps, attacks, getting hit and every special. It uses the file's own `run`/`walk` clip for running if there is one. Models exported without textures get a clay look tinted with the character's color. A model with no skeleton at all still works; it just leans and squashes.

## Project layout

```
src/
  main.js      menu, match flow, game loop (fixed 60 fps simulation)
  game.js      a single match: hit detection, stage collision, camera, KOs
  fighter.js   fighter physics + state machine (jumping, attacks, hitstun, shield)
  moves.js     default frame data for every move: tweak damage/knockback here
  characters/  per-friend movesets, poses and props (draven.js)
  input.js     keyboard, gamepad and CPU controllers
  roster.js    the characters
  stage.js     stage layout and scenery
  view.js      fighter visuals (placeholder figure or loaded GLB model)
  poses.js     procedural poses for idle, jumping, attacks, getting hit
  puppet.js    drives a rigged model's skeleton from those poses
  props.js     held props (bong, dab pen)
  effects.js   hit sparks, KO blasts, vapor clouds
  hud.js       damage % / stock display
```

## Roadmap ideas

- Unique movesets for the rest of the friend group
- Grabs and throws
- More stages
- Items
- Sound effects and music
- Character select portraits taken from the scans
- Online play (WebRTC peer-to-peer with rollback netcode)
