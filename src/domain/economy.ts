import type { CityState, BuildingType } from './types.js';
import { BUILDINGS } from './catalog.js';
/** Один и тот же расчёт используют экран и смена дня, чтобы цифры не расходились. */
export function calculate(state: CityState) {
  const count = (type: BuildingType) => state.buildings.filter((b) => b.t === type).length;
  const production = count('farm') * BUILDINGS.farm.food;
  const fed = state.food + production >= state.pop;
  return {
    pop: state.pop,
    capacity: count('house') * BUILDINGS.house.capacity,
    production,
    fed,
    foodNet: production - state.pop,
    income: BUILDINGS.hall.income + state.pop + (fed ? count('shop') * BUILDINGS.shop.income : 0),
  };
}
