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
| Crouch | S | ↓ | Stick down |
| Jump (double jump in air) | W or Space | ↑ | A or Y |
| Attack | F | , | X |
| Special | G | . | B |
| Shield / dodge | H | / | Triggers |
| Grab | J (or H + F) | M (or / + ,) | Bumpers (or trigger + X) |
| Pause | Esc | Esc | Start |

Hold a direction while pressing attack or special to pick the move:

- **Attacks**: neutral jab (tap attack again for a combo; each punch steps in, so it reaches a good way out), side kick, up swipe, down sweep on the ground; neutral spin, forward hammer-fist, back kick, backflip up kick, and a down stomp that spikes in the air. Characters can replace any of these with their own (see the cast below).
- **Specials**: neutral = projectile; side = lunge; **up = recovery jump** (once per airtime, then you're helpless until you land); down = ground pound with a shockwave.
- Tap jump for a short hop, hold it for a full jump. Tap down on a floating platform to drop through. Hold down in the air to fast-fall.

**Crouching**: hold down on the ground. You're shorter (attacks aimed high go over you), you can't walk, and you get knocked back 15% less. Attack while crouching is the down attack.

**Grabs and throws** (like Smash):
- Press **grab**, or attack while holding shield. Grabs go straight through shields, but whiff if they're dodging. Running into a grab slides you in a bit farther (dash grab). Whiffing a grab leaves you open.
- While you hold someone: **attack** (or grab) headbutts them for a little damage, and **a direction throws**: forward shoves them away, back hoists them over your head and flings them behind you (the strongest, a KO throw near the edge), up heaves them straight up for juggles, down slams them into the floor.
- Grabbed? **Mash buttons** (and tap left/right) to break free sooner. The more damage you have, the longer a grab holds you. Getting hit by anyone breaks a grab.

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

**Seeing hitboxes**: tick **Show hitboxes** in the menu (or press the <kbd>`</kbd> key, left of 1, during a match). Red circles are attacks, orange ones only count while a prop is still in hand, and the yellow boxes are the bodies they have to touch (blue while invincible).

## The cast

### Draven
Dab pen in his left hand, a big empty bong in his right. The bong gives his attacks long reach. Floaty and a bit heavy.

| Attack | Move | What it does |
|---|---|---|
| Jab | **Puff, Puff, Pass** | Pen poke, bong backhand, then a bong thrust that sends them off. Keep tapping attack. |
| Side | **Fore!** | Golf swing with the bong, low to high. Launches up and away. |
| Up | **Halo** | Swings the bong in a big arc over his head, front to back. |
| Down | **Floor Sweep** | Crouches and sweeps the bong along the floor. Low launch, nasty near the ledge. |
| Air neutral | **The Rotation** | Holds the bong out and spins, passing it all the way around. |
| Air forward | **Bong Hammer** | Overhead slam. The bottom of the swing spikes (meteors) people below. |
| Air back | **Backhand** | Whips the bong around behind him. His strongest aerial. |
| Air up | **Smoke Signal** | Quick hit of the pen, then a column of vapor straight up. |
| Air down | **Bong Plunge** | Drives the bong straight down. Spikes. |

| Special | Move | What it does |
|---|---|---|
| Neutral | **Dab Rip** | Hits the pen (the LED lights up), then blows a cloud that drifts forward and chips anyone inside it. |
| Side | **Bong Bonk** | Big overhead bong swing. Slow to come out, but it sends people. |
| Up | **Rip Rocket** | One huge rip, then he blasts the cloud downward and rides it up. Spikes anyone underneath. His recovery. |
| Down | **Hotbox** | Takes a rip from the bong for **as long as you hold the button** (like Piranha Plant's Poison Breath), then exhales a cloud that hangs around. The longer the rip, the bigger the cloud and the longer it lasts, up to a cap at 2 seconds (he lets it out on his own at max). Opponents inside take chip damage and slow down. |

### Jacoby
Carries a magnifying glass and digs snacks out of the ground. Middleweight, all-rounder. The HUD shows 🔎 while he has the magnifying glass, the snack he's carrying, and 😋 with his munchies stacks.

| Special | Move | What it does |
|---|---|---|
| Neutral | **Snack Dig** / **Snack Toss** | Digs a snack out of the ground: chips, cookie, donut or (rarely) pizza. He can carry **one at a time**, so with a snack in hand the same button **throws it**. Each flies its own way: chips lob, a cookie flies flat and fast like a frisbee, a donut bounces and rolls along the floor, and pizza is a heavy lob that hits hardest. Digging is slow, so do it when nobody's close. In the air he dives feet-first (spiking anyone below) and digs in where he lands. |
| Side | **Magnifying Glass Toss** | Lobs the magnifying glass. It bonks whoever it hits, then lies on the floor until he walks over it to pick it up. If it falls off the stage it pops back into his hand after 3 seconds (or 10 seconds if it's just left lying around). Try it without the glass and he throws nothing, stares at his empty hand and pats his pockets: wide open. |
| Up | **Mostly Air** | Rips open a family-size bag of chips (it's 90% air) and it puffs up like a balloon. The bag bonks anyone above him on the way up, then he floats down slowly for a couple of seconds, drifting left and right. Less height than Draven's rocket, but a long float. Down or shield lets go early; when the bag pops he falls helpless. His recovery. |
| Down | **Snack Time** / **Munch** | Eats the snack in his hand: heals 3–7% and adds a **munchies** stack (+4% power each, up to 5, until he's KO'd). With no snack, he lunges mouth-first and takes a bite out of whoever's in front instead (heals 1% when it connects). |

His own attacks: **Lens Bash** (side, swings the magnifying glass), **Dirt Flick** (down, flings dirt in their face), **Glass Hammer** (forward air) and **Close Inspection** (down throw: holds the glass over them and burns them with focused sunlight before letting go). The magnifying glass swings hit harder and reach farther than his bare fist, so they're weaker while it's on the floor. The rest are the shared moves.

Friends 3 and 4 are still placeholders with the default moveset.

## Putting your friends in the game

Characters are defined in [`src/roster.js`](src/roster.js): name, color, stats (weight, speed, jump, gravity, power, size) and model. A friend with their own moves and props gets a file in [`src/characters/`](src/characters/); [`draven.js`](src/characters/draven.js) is the example to copy.

To use a real 3D model of a friend:

1. **Make the model.** Easiest: [Meshy](https://www.meshy.ai) image-to-3D from one full-body photo (facing the camera, arms out to the sides, legs a bit apart, plain background). Phone scanning apps (Polycam, KIRI Engine, Scaniverse) also work.
2. **Rig it.** In Meshy, use **Animate** to auto-rig it as a humanoid. Adding a run animation is nice but optional. Download as **GLB**, with textures if you can. (Skipping this is fine too: upload the un-rigged model and ask Claude to rig it. It has a script for that, [`tools/autorig.py`](tools/autorig.py), that works on a model standing straight with its arms out.)
3. **Shrink it.** GitHub's website won't take files over 25 MB, and Meshy models are usually bigger (mostly because of their texture pictures). With the game running (`npm run dev`), open http://localhost:5173/shrink.html (there's a link on the menu), drop the file in, type the friend's name and click **Shrink**. It downloads a copy that's usually under 10 MB and looks the same in game.
4. **Drop it in.** Upload the file to `public/models/` and point that friend's roster entry at it, e.g. `model: 'models/draven.glb'`.

The game scales any model to fighter height automatically. If the model has a Mixamo-style skeleton (Meshy's auto-rig does), the game **animates it in code**: idle, jumps, attacks, getting hit and every special. It uses the file's own `run`/`walk` clip for running if there is one. Models exported without textures get a clay look tinted with the character's color. A model with no skeleton at all still works; it just leans and squashes.

Upload the file under the name the character file uses (e.g. `draven.glb`, `jacoby.glb`), or rename it in the character file to match what you uploaded.

## Project layout

```
shrink.html    model shrinker page (makes .glb files small enough for GitHub)
tools/
  autorig.py   gives an un-rigged model a skeleton (run by Claude with Blender's Python module)
src/
  main.js      menu, match flow, game loop (fixed 60 fps simulation)
  game.js      a single match: hit detection, stage collision, camera, KOs
  fighter.js   fighter physics + state machine (jumping, attacks, hitstun, shield)
  moves.js     default frame data for every move: tweak damage/knockback here
  characters/  per-friend movesets, poses and props (draven.js, jacoby.js)
  input.js     keyboard, gamepad and CPU controllers
  roster.js    the characters
  stage.js     stage layout and cartoon scenery (toon shading, ink outlines, painted textures)
  view.js      fighter visuals (placeholder figure or loaded GLB model)
  poses.js     procedural poses for idle, jumping, attacks, getting hit
  puppet.js    drives a rigged model's skeleton from those poses
  props.js     held props (bong, dab pen, magnifying glass, snacks, chip bag)
  shrink.js    the model shrinker (shrink.html)
  effects.js   hit sparks, KO blasts, vapor clouds, pop-up text, dirt and crumbs
  hud.js       damage % / stock display
```

## Roadmap ideas

- Unique movesets for the rest of the friend group
- More stages
- Items
- Sound effects and music
- Character select portraits taken from the scans
- Online play (WebRTC peer-to-peer with rollback netcode)
