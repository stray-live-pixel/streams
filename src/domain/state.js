import { BUILDINGS } from './catalog.js';
import { isLand, MAP_SIZE, shoreDirection } from './world.js';
import { STEP } from './tutorial.js';
export const SAVE_VERSION = 3;
export function initialState() {
  return {
    version: SAVE_VERSION,
    pop: 0,
    money: 600,
    food: 30,
    day: 1,
    step: STEP.WELCOME,
    won: false,
    buildings: [{ x: 5, z: 5, t: 'hall' }],
  };
}
/**
 * Сохранение — внешний ввод. Проверяем его до создания игрового мира.
 * Возвращаем новый объект: последующие команды не изменят исходный JSON.
 */
export function restoreState(raw) {
  if (!raw || ![2, 3].includes(raw.version)) throw new Error('Неизвестная версия сохранения');
  const s = structuredClone(raw);
  if (
    !['money', 'food', 'day', 'step'].every((k) => Number.isFinite(s[k]) && s[k] >= 0) ||
    !Number.isInteger(s.day) ||
    s.day < 1 ||
    !Number.isInteger(s.step) ||
    s.step > 7 ||
    !Array.isArray(s.buildings) ||
    s.buildings.length > MAP_SIZE ** 2 ||
    s.buildings.filter((b) => b?.t === 'hall').length !== 1 ||
    !s.buildings.every((b) => b && Object.hasOwn(BUILDINGS, b.t) && isLand(b.x, b.z)) ||
    new Set(s.buildings.map((b) => `${b.x},${b.z}`)).size !== s.buildings.length
  ) {
    throw new Error('Сохранение повреждено');
  }
  const capacity = s.buildings.filter((b) => b.t === 'house').length * BUILDINGS.house.capacity;
  if (s.version === 2) s.pop = capacity; // До порта дома заселялись мгновенно.
  if (!Number.isInteger(s.pop) || s.pop < 0 || s.pop > capacity)
    throw new Error('Некорректное население');
  const ports = s.buildings.filter((b) => b.t === 'port');
  if (ports.length > 1 || ports.some((b) => !shoreDirection(b.x, b.z)))
    throw new Error('Некорректный порт');
  if (s.resumeStep !== undefined && ![1, 2, 3, 4, 5, 6].includes(s.resumeStep))
    throw new Error('Некорректный шаг обучения');
  if (!ports.length && s.step !== STEP.WELCOME && s.step !== STEP.PORT) {
    s.resumeStep = s.step;
    s.step = STEP.PORT;
  }
  if (ports.length && s.step === STEP.PORT) s.step = s.resumeStep ?? STEP.HOUSE;
  // Не переносим произвольные поля из внешнего JSON внутрь приложения.
  return {
    version: SAVE_VERSION,
    pop: s.pop,
    money: s.money,
    food: s.food,
    day: s.day,
    step: s.step,
    won: s.won === true,
    buildings: s.buildings.map(({ x, z, t }) => ({ x, z, t })),
    ...(s.resumeStep === undefined ? {} : { resumeStep: s.resumeStep }),
    ...(typeof s.journal === 'string' ? { journal: s.journal.slice(0, 1000) } : {}),
  };
}
