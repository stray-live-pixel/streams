/** Публичная граница правил. Остальные слои импортируют только этот файл. */
export { createGame } from './game.js';
export { initialState, restoreState } from './state.js';
export { MAP_SIZE, isLand, shoreDirection } from './world.js';
export { BUILDINGS, BUILD_ORDER } from './catalog.js';
export { STEP } from './tutorial.js';

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
