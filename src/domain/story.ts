import type { CityState } from './types.js';
import { calculate } from './economy.js';
import { POPULATION_GOAL } from './catalog.js';

export const BEACON_COST = 300;
/** История следует за городом. Условия финала используются и кнопкой, и командой. */
export function storyProgress(state: CityState) {
  const stats = calculate(state);
  const settled = state.pop >= POPULATION_GOAL;
  const supplied = stats.foodNet >= 0;
  const funded = state.money >= BEACON_COST;
  return {
    settled,
    supplied,
    funded,
    populationGoal: POPULATION_GOAL,
    beaconCost: BEACON_COST,
    canFinish:
      !state.won &&
      state.step === 6 &&
      settled &&
      supplied &&
      funded &&
      state.buildings.some((b) => b.t === 'port'),
    chapter: state.won ? 4 : state.pop >= 30 ? 3 : state.pop >= 10 ? 2 : 1,
  };
}
