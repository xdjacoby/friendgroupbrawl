import { createStage as islandStage, buildStageScene as buildIsland } from './stage.js';
import { RUSHTON } from './stages/rushton.js';
import { CANTON } from './stages/canton.js';

// Every stage: { id, name, create() -> layout (see stage.js), build(layout,
// scene) -> { update(dt) } }, plus a thumbnail for the stage picker (`thumb`:
// an image in public/, or a CSS background) and `rim`: the color of the air,
// which lights the fighters' edges (look.js) so they sit in the scene.
// build() can also return `camera: { near, far }` for faraway scenery,
// `timeOfDay` (a campus.js cycle position) for the victory screen to carry
// on with, and `rim` (overrides the stage's, e.g. as its day goes by).
export const STAGES = [
  {
    id: 'island', name: 'Sky Island', create: islandStage, build: buildIsland,
    thumb: 'linear-gradient(#5fb2f2 0 55%, #6ccf52 55% 70%, #c4834a 70%)',
    rim: 0xc6eaff,
  },
  RUSHTON,
  CANTON,
];

export const stageById = (id) => STAGES.find((s) => s.id === id) ?? STAGES[0];
