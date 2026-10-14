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
| Grab | J (or H + F) | M (or / + ,) | Left bumper (or trigger + X) |
| Parry | K | N | Right bumper |
| Pause | Esc | Esc | Start |

Hold a direction while pressing attack or special to pick the move:

- **Attacks**: neutral jab (tap attack again for a combo; each punch steps in, so it reaches a good way out), side kick, up swipe, down sweep on the ground; neutral spin, forward hammer-fist, back kick, backflip up kick, and a down stomp that spikes in the air. Characters can replace any of these with their own (see the cast below).
- **Specials**: neutral = projectile; side = lunge; **up = recovery jump** (once per airtime, then you're helpless until you land); down = ground pound with a shockwave.
- Tap jump for a short hop, hold it for a full jump. Tap down on a floating platform to drop through. Hold down in the air to fast-fall.

**Crouching**: hold down on the ground. You're shorter (attacks aimed high go over you), you can't walk, and you get knocked back 15% less. Attack while crouching is the down attack.

**Grabs and throws** (like Smash):
- Press **grab**, or attack while holding shield. Grabs go straight through shields, but whiff if they're dodging. Running into a grab slides you in a bit farther (dash grab). Whiffing a grab leaves you open.
- While you hold someone: **attack** (or grab) headbutts them for a little damage, and **a direction throws**: forward shoves them away, back hoists them over your head and flings them behind you (the strongest, a KO throw near the edge), up heaves them straight up for juggles, down slams them into the floor. Throws get a lot stronger the more damage the person has: a back throw at the edge KOs around 100%.
- Grabbed? **Mash buttons** (and tap left/right) to break free sooner. The more damage you have, the longer a grab holds you. Getting hit by anyone breaks a grab.

**Dodging** (you can't be hit while you glow blue):
- **Roll**: hold shield and tap left/right (or hold a direction and press shield). You end up facing back the way you came.
- **Spot dodge**: hold shield and tap down. Sidestep in place.
- **Air dodge**: press shield in the air. Hold a direction to dash about 3 m that way. You get one per jump (your double jump gives you another); landing or grabbing a ledge resets it.
- **Wavedash**: air dodge down-and-sideways into the floor and you keep the speed: you slide a few meters along the ground.

**Parry** (its own button, like in A Few Quick Matches): press it right before a hit lands (there's a short window, about 8 frames) and the hit bounces off you. You flash, both of you freeze for a beat, and then **they're stuck seeing stars** while you're free to hit them. Projectiles fly back and count as yours. Press it too early or too late and you're open for a moment. Grabs go right through a parry, so don't parry everything.

**Bodies are solid**: you can't walk through someone; you shove them along instead (nobody gets pushed off an edge). Rolls, dodges and people flying from a hit still pass through.

**Ledges**: fall next to the edge of the main stage to grab it automatically. You're invincible for a moment when you grab (once per trip off the stage), and your double jump and up special come back. From the ledge:
- **Up or toward the stage**: climb up
- **Jump**: jump up from the ledge
- **Attack or special**: climb up with a sweeping kick
- **Shield**: roll onto the stage
- **Down or away**: let go

Only one fighter can hang on a ledge at a time, and after 5 seconds you let go.

**Winning**: the last one standing gets a victory screen: they do their own victory animation on a podium while everyone else claps.

**Cosmetics**: each player card has two pickers under the character. **👕 Outfit** switches between that friend's models (Byron has a second fit; more show up as they're added, see below). **🧢 Extra** adds a beanie, a backwards cap, shades, a gold chain, a crown or a halo, sized to fit whoever wears it. Picks are remembered.

**Stages**: pick one under the player cards (click the picture or the arrows):
- **Sky Island**: the original floating island.
- **Rushton Hall**: a snow day in front of the dorm. The real building is the backdrop (from a photo, made cartoony when the stage loads), with the entrance canopy's roof as the top platform, two snowy chunks of the RUSHTON sign as the side platforms, a snowman, the lamp post, icicles and falling snow.

**Menu options**: **Graphics** (Auto lowers the resolution a little whenever the frame rate dips, then raises it back; Fast is for older laptops: lower resolution, no shadows), **Voices** (voicelines on/off) and **Show FPS** (a frame-rate counter in the corner).

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

### Eli
Chronically online, fluent in brainrot. Built like Velma from MultiVersus: speech bubbles, a charged sprint, a sticky spill, and a meter he fills up until he can call in a van. He holds his phone in his right hand the whole time. Light and quick. The HUD shows 💬 the next phrase he'll shout and 📈 his clout.

| Attack | Move | What it does |
|---|---|---|
| Jab | **Phone Smack** | Phone backhand, a slap, then a selfie with the flash on in their face. Keep tapping attack. |
| Side | **Hit the Woah** | Winds up and snaps into the Woah. |
| Up | **Dab** | Dabs. The stretched-out arm hits above him. |
| Down | **Fanum Tax** | Crouching swipe that takes a cut. (Against Jacoby it actually steals his snack.) |
| Air neutral | **Floss** | Flosses in midair: two hits that hold them in, a third that launches. |
| Air forward | **Swipe Up** | Swipes up like he's skipping a TikTok. |
| Air back | **Mule Kick** | Both feet straight back. His strongest aerial. |
| Air up | **Selfie Stick** | Shoots a selfie stick straight up; the flash goes off at the top. |
| Air down | **Sigma Stomp** | Arms folded, stomps down. Spikes. |
| Up throw | **Yeet** | Exactly what it sounds like. |

| Special | Move | What it does |
|---|---|---|
| Neutral | **Brainrot** | Shouts a speech bubble (hold up or down to aim it). They come in order: **NEEGY** (fast and straight), **GUCCI MORTY** (big, slow, hangs around and hits a few times, and **eats other people's projectiles**), **KIRK** (short range, bonks hard, then **bursts into three little kirks**), **FUNKY EHH** (wobbles out and **comes back like a boomerang**, hitting again on the way). Every hit builds clout and gives them a stack of **brainrot**: three stacks and they're **BRAINROTTED**, their left and right swap for 3 seconds. |
| Side | **Hit the Griddy** | Hold the button to hype it up (he griddies in place), let go to griddy across the stage into them. Charged past halfway it's the strong version. Builds clout. |
| Up | **Subway Surfers** | Pulls out a hoverboard and surfs off in whatever direction you hold (straight up if you don't), **steering as he goes**, leaving a trail of coins. Hits on takeoff and along the ride. His recovery. |
| Down | **Doomscroll** / **FBI OPEN UP** | Stares at his phone for as long as you hold the button, building clout (wide open while he does). When clout hits 100% (📈VIRAL), down special on the ground **calls the FBI**: a black van tears across the stage from behind him and runs over everyone in its way. Uses up all his clout. |

### Andrew
Type 1 diabetic, and his whole kit is built around it. Carries an insulin pen and wears his **CGM** (the glucose sensor) on the back of his left arm; its light shows his sugar: green normal, yellow rush, red spike, blue low. He has to manage his **blood sugar** while he fights (the HUD shows 🩸 and his mg/dL):

- **LOW** (under 70): slower and hits weaker until he gets sugar in him.
- **Normal** (70–180).
- **SUGAR RUSH** (180–300, ⚡): faster and hits harder.
- **SPIKE** (over 300, ⚠️): hits hardest, but sluggish.

It slowly burns off during the match (about 1.5 a second), so every so often he needs a juice box.

| Attack | Move | What it does |
|---|---|---|
| Jab | **Pen Pokes** | Insulin pen poke, a left hook, then he clicks the dose dial and stabs it forward. |
| Side | **Carb Load** | Swings a big French loaf. |
| Up | **Spike Chart** | An uppercut that shoots straight up like his sugar after cake. |
| Down | **Low Blow** | Quick kick at the ankles. |
| Air neutral | **Sugar High** | Spins with his arms out in a cloud of sparkles. |
| Air forward | **Bread Slam** | Brings the loaf down overhead. |
| Air back | **Correction Kick** | High heel kick behind him. |
| Air up | **Finger Prick** | Quick jab straight up with the pen. |
| Air down | **Sugar Crash** | Hammers down with both fists. Spikes. |
| Down throw | **Insulin Shot** | Pins them and gives them a dose: their sugar crashes (slowed for a couple of seconds). |

| Special | Move | What it does |
|---|---|---|
| Neutral | **Insulin Dart** / **Correction** | Throws an insulin pen like a dart. Whoever it hits **crashes**: slowed for 2.5 seconds. While he's SPIKING, the same button doses himself instead and brings his sugar back to 120. |
| Side | **Glucose Check** | Lunges in with his meter and pricks them. The meter reads their damage like a blood sugar; at 150%+ it reads **HI** and they fly a lot farther. |
| Up | **Sugar Rush** | Downs a glucose tab and rockets up in a jittery zigzag, hitting a few times. Higher in a sugar rush, lower when he's low. His recovery. |
| Down | **Juice Box** | Drinks a juice box: +80 mg/dL and heals 2%. Fixes a low, or tips him into a sugar rush. Drink too many and he spikes. |

### Byron
A professional larper: confidently "knows" karate, parkour, Krav Maga and cars, and doesn't. Fights with his **wired earbuds** like Wonder Woman's Lasso of Truth from MultiVersus, and his side special is his **Lamborghini**, which works like Wario's bike in Smash. The HUD shows 🏎️ READY when the Lambo's ready, 💨 while he's driving, 💥 when it's about to blow, and 🔧 with a countdown while it's "in the shop".

| Attack | Move | What it does |
|---|---|---|
| Jab | **Karate (he watched a video)** | Chop, chop, **HADOUKEN**. |
| Side | **Crane Kick** | Strikes the Karate Kid crane pose, then kicks. |
| Up | **Lasso Twirl** | Whirls the earbuds over his head, front to back. |
| Down | **Capoeira Sweep** | Drops low and sweeps a leg along the floor. |
| Air neutral | **Lasso Spin** | Spins with the earbuds out, all the way around. |
| Air forward | **Earbud Whip** | Cracks the earbuds forward like a whip. Long reach; the tip hits hardest. |
| Air back | **Muay Thai (trust me)** | Spinning back kick. |
| Air up | **Whip Up** | Cracks the earbuds straight up. |
| Air down | **Earbud Plunge** | Whips them straight down. The tip spikes. |
| Back throw | **YouTube Suplex** | He watched one video. Arches back and slams them behind him. |

| Special | Move | What it does |
|---|---|---|
| Neutral | **Lasso of Truth** | Throws his earbuds out like a lasso. On the ground it grabs whoever it touches from far away (even through shields), reels them in, and he's holding them: throw away. In the air it flies up at an angle and yanks people toward him, and if it reaches a ledge while he's off the stage he **zips to it** (a tether recovery). |
| Side | **Lambo** | Hops in his Lamborghini (an Aventador SVJ with the roof cut off; he'll tell you it's a Huracán) and it drives itself. **Hold forward** to go faster, **hold back** to brake and spin it around, **jump** to hop it, **up** for a wheelie. Running someone over at speed sends them. **Special or shield** bails out (so does jump in the air), and the empty car keeps rolling, starts smoking and **explodes**: a big KABOOM that launches anyone near it (not him). One Lambo at a time: after it wrecks it's in the shop for a few seconds, and trying again just gets you "IT'S IN THE SHOP" (wide open). Drive it off the stage and don't bail, and you go down with it. |
| Up | **Parkour!** | A huge backflip straight up with the earbuds whirling around him. Hits twice. His recovery. |
| Down | **Krav Maga (trust me bro)** | A counter: drops into a stance, and if anything hits him during it he slips it and answers with a spinning kick. Nothing hits him? He just stands there. |

## Putting your friends in the game

Characters are defined in [`src/roster.js`](src/roster.js): name, color, stats (weight, speed, jump, gravity, power, size) and model. A friend with their own moves and props gets a file in [`src/characters/`](src/characters/); [`draven.js`](src/characters/draven.js) is the example to copy.

To use a real 3D model of a friend:

1. **Make the model.** Easiest: [Meshy](https://www.meshy.ai) image-to-3D from one full-body photo (facing the camera, arms out to the sides, legs a bit apart, plain background). Phone scanning apps (Polycam, KIRI Engine, Scaniverse) also work.
2. **Rig it.** In Meshy, use **Animate** to auto-rig it as a humanoid. Adding a run animation is nice but optional. Download as **GLB**, with textures if you can. (Skipping this is fine too: upload the un-rigged model and ask Claude to rig it. It has a script for that, [`tools/autorig.py`](tools/autorig.py), that works on a model standing straight with its arms out or hanging a little away from the body. Eli, Andrew and Byron were rigged that way.)
3. **Shrink it.** GitHub's website won't take files over 25 MB, and Meshy models are usually bigger (mostly because of their texture pictures). With the game running (`npm run dev`), open http://localhost:5173/shrink.html (there's a link on the menu), drop the file in, type the friend's name and click **Shrink**. It downloads a copy that's usually under 10 MB and looks the same in game.
4. **Drop it in.** Upload the file to `public/models/` and point that friend's roster entry at it, e.g. `model: 'models/draven.glb'`.

The game scales any model to fighter height automatically. If the model has a Mixamo-style skeleton (Meshy's auto-rig does), the game **animates it in code**: idle, jumps, attacks, getting hit and every special. It uses the file's own `run`/`walk` clip for running if there is one. Models exported without textures get a clay look tinted with the character's color. A model with no skeleton at all still works; it just leans and squashes.

Upload the file under the name the character file uses (e.g. `draven.glb`, `jacoby.glb`), or rename it in the character file to match what you uploaded.

### New outfits (cosmetics)

Any model in `public/models/` whose name starts with a friend's id is one of their outfits, and it shows up in the 👕 Outfit picker by itself: `byroncos1.glb` is Byron's second fit, so the next one can be `byroncos2.glb` (or `byron-hoodie.glb`, which shows as "Hoodie"). The ids are `draven`, `jacoby`, `eli`, `andrew` and `byron`. Steps 1–3 above still apply: the model needs a skeleton (rig it in Meshy, or upload it as is and ask Claude to rig it) and has to be under 25 MB. Hands, hats and Andrew's CGM fit themselves to every new model.

**Voicelines:** drop audio clips into [`voicelines/<friend>/`](voicelines/README.md) named after when they should play (`victory.mp3`, `ko.mp3`, `nspecial.mp3`, ...). See [voicelines/README.md](voicelines/README.md) for the full list.

## Project layout

```
shrink.html    model shrinker page (makes .glb files small enough for GitHub)
public/models/ the friends' models (and outfits: <id>cos1.glb, ...) and Byron's Lambo
public/stages/ photos used by stages (the Rushton Hall backdrop)
voicelines/    voice clips per friend (see voicelines/README.md)
tools/
  autorig.py   gives an un-rigged model a skeleton (run by Claude with Blender's Python module)
  slim.py      makes an already rigged model lighter (fewer triangles, smaller textures)
  prep_lambo.py  turns the Sketchfab Aventador into Byron's game-ready Lambo
src/
  main.js      menu, match flow, game loop (fixed 60 fps simulation)
  game.js      a single match: hit detection, stage collision, camera, KOs
  fighter.js   fighter physics + state machine (jumping, attacks, hitstun, shield)
  moves.js     default frame data for every move: tweak damage/knockback here
  characters/  per-friend movesets, poses, props and victory animations
  input.js     keyboard, gamepad and CPU controllers
  roster.js    the characters
  stages.js    the stage list (for the stage picker)
  stage.js     Sky Island, plus the cartoon toolkit every stage uses (toon shading, ink outlines, painted textures)
  stages/      other stages (rushton.js: Rushton Hall)
  view.js      fighter visuals (placeholder figure or loaded GLB model)
  poses.js     procedural poses for idle, jumping, attacks, getting hit
  puppet.js    drives a rigged model's skeleton from those poses (and closes the hands around props)
  rig.js       measures each model's hands, body and head when it loads
  cosmetics.js outfits and extras (hats, shades, chain) and putting them on
  fonts.js     the game's fonts
  props.js     held props (bong, dab pen, magnifying glass, snacks, phone, insulin pen, earbuds, the Lambo...)
  shrink.js    the model shrinker (shrink.html)
  effects.js   hit sparks, KO blasts, vapor clouds, pop-up text, dirt and crumbs
  hud.js       damage % / stock display
  victory.js   the victory screen
  voice.js     plays the voicelines
```

## Credits

- Fonts (all [SIL Open Font License](https://openfontlicense.org), bundled through [Fontsource](https://fontsource.org)): [Bangers](https://fonts.google.com/specimen/Bangers) by Vernon Adams, [Luckiest Guy](https://fonts.google.com/specimen/Luckiest+Guy) by Astigmatic, [Fredoka](https://fonts.google.com/specimen/Fredoka) by Milena Brandão.
- Rushton Hall backdrop: a photo of the real building.
- Byron's Lamborghini: ["Lamborghini Aventador SVJ SDC (FREE)"](https://sketchfab.com/3d-models/lamborghini-aventador-svj-sdc-free-784e4656aca649cca55d6b18740a19b2) by [SDC PERFORMANCE](https://sketchfab.com/Lambo_SC04), licensed [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changed for the game: roof and side windows removed, simplified, recolored lights and trim, resized ([`tools/prep_lambo.py`](tools/prep_lambo.py)).

## Roadmap ideas

- More stages (different people's dorm rooms, other buildings on campus)
- Items
- Sound effects and music
- Character select portraits taken from the scans
- Online play (WebRTC peer-to-peer with rollback netcode)
