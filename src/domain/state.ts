import { BUILDINGS } from './catalog.js';
import { isLand, MAP_SIZE, shoreDirection } from './world.js';
import { STEP } from './tutorial.js';
import type { CityState, Building, BuildingType } from './types.js';
import { validFootprint, buildingCells } from './footprint.js';
export const SAVE_VERSION = 5;
export function initialState(): CityState {
  return {
    version: SAVE_VERSION,
    pop: 0,
    money: 600,
    food: 30,
    day: 1,
    step: STEP.WELCOME,
    won: false,
    endingSeen: false,
    buildings: [{ x: 5, z: 5, t: 'hall' }],
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isBuilding(value: unknown): value is Building {
  return (
    isRecord(value) &&
    typeof value.t === 'string' &&
    Object.hasOwn(BUILDINGS, value.t) &&
    typeof value.x === 'number' &&
    typeof value.z === 'number' &&
    isLand(value.x, value.z) &&
    (value.footprint === undefined || validFootprint(value.footprint))
  );
}
/** JSON не становится безопасным от наличия TypeScript: проверяем каждое внешнее поле. */
export function restoreState(raw: unknown): CityState {
  if (!isRecord(raw) || typeof raw.version !== 'number' || ![2, 3, 4, 5].includes(raw.version))
    throw new Error('Неизвестная версия сохранения');
  const { money, food, day, step, buildings } = raw;
  if (
    typeof money !== 'number' ||
    !Number.isFinite(money) ||
    money < 0 ||
    typeof food !== 'number' ||
    !Number.isFinite(food) ||
    food < 0 ||
    typeof day !== 'number' ||
    !Number.isInteger(day) ||
    day < 1 ||
    typeof step !== 'number' ||
    !Number.isInteger(step) ||
    step < 0 ||
    step > 7 ||
    !Array.isArray(buildings) ||
    buildings.length > MAP_SIZE ** 2 ||
    !buildings.every(isBuilding) ||
    buildings.filter((b) => b.t === 'hall').length !== 1 ||
    new Set(buildings.map((b) => `${b.x},${b.z}`)).size !== buildings.length
  )
    throw new Error('Сохранение повреждено');
  const cells = buildings.flatMap(buildingCells);
  if (
    cells.some((cell) => !isLand(cell.x, cell.z)) ||
    new Set(cells.map((cell) => `${cell.x},${cell.z}`)).size !== cells.length
  )
    throw new Error('Участки зданий пересекаются или выходят за остров');
  const capacity = buildings.filter((b) => b.t === 'house').length * BUILDINGS.house.capacity;
  // Версия 2 заселяла дома сразу. Не теряем этих жителей при обновлении игры.
  const pop = raw.version === 2 ? capacity : raw.pop;
  if (typeof pop !== 'number' || !Number.isInteger(pop) || pop < 0 || pop > capacity)
    throw new Error('Некорректное население');
  const ports = buildings.filter((b) => b.t === 'port');
  if (ports.length > 1 || ports.some((b) => !shoreDirection(b.x, b.z)))
    throw new Error('Некорректный порт');
  if (
    raw.resumeStep !== undefined &&
    (typeof raw.resumeStep !== 'number' || ![1, 2, 3, 4, 5, 6].includes(raw.resumeStep))
  )
    throw new Error('Некорректный шаг обучения');
  const state: CityState = {
    version: SAVE_VERSION,
    pop,
    money,
    food,
    day,
    step,
    won: raw.won === true,
    endingSeen: raw.won === true && raw.endingSeen === true,
    buildings: buildings.map(({ x, z, t, footprint }) => ({
      x,
      z,
      t: t as BuildingType,
      ...(footprint ? { footprint: structuredClone(footprint) } : {}),
    })),
  };
  // Победа старой версии остаётся победой: маяк достраивается без повторной оплаты.
  if (state.won) {
    state.completedDay =
      typeof raw.completedDay === 'number' &&
      Number.isInteger(raw.completedDay) &&
      raw.completedDay >= 1 &&
      raw.completedDay <= day
        ? raw.completedDay
        : day;
  }
  if (typeof raw.resumeStep === 'number') state.resumeStep = raw.resumeStep;
  if (typeof raw.journal === 'string') state.journal = raw.journal.slice(0, 1000);
  if (!ports.length && step !== STEP.WELCOME && step !== STEP.PORT) {
    state.resumeStep = step;
    state.step = STEP.PORT;
  }
  if (ports.length && step === STEP.PORT) state.step = state.resumeStep ?? STEP.HOUSE;
  return state;
}
