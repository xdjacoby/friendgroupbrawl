import { DRAVEN } from './characters/draven.js';
import { JACOBY } from './characters/jacoby.js';

// The playable cast. Each friend gets one entry here. Friends with their own
// moveset live in src/characters/ (see draven.js for the full format).
//
// To swap a placeholder for a real scanned model, drop a .glb file in
// public/models/ and set `model: 'models/<file>.glb'`. See README.md for the
// full scan -> rig -> export pipeline.
//
// Stats:
//   weight      heavier characters fly less far when hit (100 = average)
//   runSpeed    ground speed (m/s)
//   airSpeed    max horizontal speed in the air (m/s)
//   jump        first jump velocity (m/s); double jump is ~90% of this
//   gravity     fall acceleration (m/s^2)
//   maxFall     terminal fall speed (m/s)
//   power       multiplier on all damage dealt
//   scale       visual + hurtbox size multiplier
//
// Optional: moves (replace any move from moves.js), poses (override idle etc.;
// `base` applies everywhere), props ({ right: 'bong', left: 'dabPen' }, see
// props.js), hud(f) (a status line under the name on the HUD), cpu(f, info)
// (extra CPU habits, see jacoby.js).

export const ROSTER = [
  DRAVEN,
  JACOBY,
  {
    id: 'tank',
    name: 'Friend 3',
    tagline: 'Slow, heavy, hits hard',
    color: 0x3fb950,
    model: null,
    stats: { weight: 125, runSpeed: 6.5, airSpeed: 5, jump: 13.5, gravity: 45, maxFall: 16, power: 1.25, scale: 1.12 },
  },
  {
    id: 'floaty',
    name: 'Friend 4',
    tagline: 'Floats forever',
    color: 0xd29922,
    model: null,
    stats: { weight: 90, runSpeed: 7, airSpeed: 6.5, jump: 14, gravity: 30, maxFall: 11, power: 0.95, scale: 1.0 },
  },
];

export const SLOT_COLORS = ['#ff5a4f', '#4fa8ff', '#5be37a', '#ffc94f'];
