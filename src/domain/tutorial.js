/**
 * Числа сохранены ради совместимости с ранними версиями игры.
 * Новый код использует имена, поэтому порядок шагов читается явно.
 */
export const STEP = Object.freeze({
  WELCOME: 0,
  HOUSE: 1,
  FARM: 2,
  SHOP: 3,
  DAY: 4,
  DONE: 5,
  FREE: 6,
  PORT: 7,
});
const sequence = [STEP.PORT, STEP.HOUSE, STEP.FARM, STEP.SHOP, STEP.DAY];
const expected = {
  [STEP.PORT]: 'port',
  [STEP.HOUSE]: 'house',
  [STEP.FARM]: 'farm',
  [STEP.SHOP]: 'shop',
};
export function requiredBuilding(step) {
  return expected[step] ?? null;
}
export function tutorialProgress(step) {
  return sequence.indexOf(step) + 1;
}
export function canAdvanceDay(step) {
  return step === STEP.DAY || step === STEP.FREE;
}
export function isChoiceVisible(type, step) {
  if (type === 'port') return step === STEP.PORT;
  if (step === STEP.WELCOME || step === STEP.PORT) return false;
  if (type === 'road' || step === STEP.FREE) return true;
  return ['house', 'farm', 'shop'].indexOf(type) < step;
}
export function isChoiceAllowed(type, state, busy) {
  if (busy || type === 'hall') return false;
  if (type === 'port')
    return state.step === STEP.PORT && !state.buildings.some((b) => b.t === 'port');
  if (state.step === STEP.PORT || state.step === STEP.WELCOME) return false;
  return type === 'road' || state.step === STEP.FREE || type === requiredBuilding(state.step);
}
export function afterConstruction(state, type) {
  if (type === 'port') {
    state.step = state.resumeStep ?? STEP.HOUSE;
    delete state.resumeStep;
  } else if (type === requiredBuilding(state.step)) state.step += 1;
}
