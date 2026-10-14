import { createStage as islandStage, buildStageScene as buildIsland } from './stage.js';
import { RUSHTON } from './stages/rushton.js';

// Every stage: { id, name, create() -> layout (see stage.js), build(layout,
// scene) -> { update(dt) } }, plus a thumbnail for the stage picker (`thumb`:
// an image in public/, or a CSS background).
export const STAGES = [
  {
    id: 'island', name: 'Sky Island', create: islandStage, build: buildIsland,
    thumb: 'linear-gradient(#5fb2f2 0 55%, #6ccf52 55% 70%, #c4834a 70%)',
  },
  RUSHTON,
];

export const stageById = (id) => STAGES.find((s) => s.id === id) ?? STAGES[0];
