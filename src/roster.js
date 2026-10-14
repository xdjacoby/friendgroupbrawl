import { DRAVEN } from './characters/draven.js';
import { JACOBY } from './characters/jacoby.js';
import { ELI } from './characters/eli.js';
import { ANDREW } from './characters/andrew.js';
import { BYRON } from './characters/byron.js';

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
// (extra CPU habits, see jacoby.js), update(f, world) (runs every frame, e.g.
// Andrew's blood sugar), preload (GLB files its props need, e.g. Byron's car), victory ({ pose(frame), onFrame(frame, ctx), quote,
// prop }: the victory screen animation, see victory.js).

export const ROSTER = [DRAVEN, JACOBY, ELI, ANDREW, BYRON];

export const SLOT_COLORS = ['#ff5a4f', '#4fa8ff', '#5be37a', '#ffc94f'];
