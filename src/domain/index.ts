/** Публичная граница правил. Остальные слои импортируют только этот файл. */
export { createGame } from './game.js';
export { initialState, restoreState } from './state.js';
export { MAP_SIZE, isLand, shoreDirection, createWorld } from './world.js';
export type { IslandWorld } from './world.js';
export { BUILDINGS, BUILD_ORDER } from './catalog.js';
export { STEP } from './tutorial.js';
export {
  singleCell,
  validFootprint,
  buildingObjectId,
  proposedBuilding,
  buildingCells,
  occupies,
} from './footprint.js';
export type { FootprintCatalog } from './footprint.js';

export type {
  BuildingType,
  Building,
  Tile,
  CityState,
  Command,
  Arrival,
  GameEvent,
  CommandHandler,
} from './types.js';
export type { GameModel } from './game.js';

export { storyProgress, BEACON_COST } from './story.js';

export {
  buildingsOverlap,
  footprintSamples,
  portLayout,
  continuousPlacementIssue,
} from './placement.js';
