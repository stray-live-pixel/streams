import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  initialState,
  restoreState,
  STEP,
  buildingCells,
  validFootprint,
} from '../src/domain/index.ts';

const corner = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
];
function gameWithFootprint(footprint = corner) {
  const state = initialState();
  state.step = STEP.FREE;
  state.money = 10000;
  state.buildings.push({ t: 'port', x: 6, z: 11 });
  const catalog = Object.fromEntries([0, 1, 2, 3].map((i) => [`game/house/${i}`, footprint]));
  return createGame(state, catalog);
}
function build(game, t, x, z) {
  game.dispatch({ type: 'select', building: t });
  return game.dispatch({ type: 'build', x, z });
}
test('Г-образное здание занимает три клетки, оставляет угол свободным и оплачивается один раз', () => {
  const game = gameWithFootprint();
  assert(build(game, 'house', 2, 3).changed);
  const house = game.serialize().buildings.find((b) => b.t === 'house');
  assert.deepEqual(buildingCells(house), [
    { x: 2, z: 3 },
    { x: 3, z: 3 },
    { x: 2, z: 4 },
  ]);
  assert.equal(game.serialize().money, 9900);
  assert.equal(game.snapshot().stats.capacity, 10);
  const before = game.serialize();
  assert.equal(build(game, 'shop', 3, 3).changed, false);
  assert.deepEqual(game.serialize(), before);
  assert(build(game, 'shop', 3, 4).changed);
});
test('проверяется весь участок: вода, край острова и чужое здание в дальнем углу', () => {
  const game = gameWithFootprint([
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ]);
  build(game, 'shop', 3, 4);
  const before = game.serialize();
  assert.equal(build(game, 'house', 2, 3).changed, false);
  assert.equal(build(game, 'house', 11, 5).changed, false);
  assert.equal(build(game, 'house', 9, 9).changed, false);
  assert.deepEqual(game.serialize(), before);
});
test('строительство заменяет дороги на всём участке; новые маски переживают сохранение', () => {
  const game = gameWithFootprint();
  build(game, 'road', 2, 3);
  build(game, 'road', 3, 3);
  build(game, 'road', 2, 4);
  assert(build(game, 'house', 2, 3).changed);
  assert.equal(game.serialize().buildings.filter((b) => b.t === 'road').length, 0);
  const saved = game.serialize();
  assert.deepEqual(createGame(saved, {}).serialize(), saved);
  const bad = structuredClone(saved);
  bad.buildings.push({ t: 'road', x: 3, z: 3 });
  assert.throws(() => restoreState(bad), /пересекаются/);
});
test('старые города сохраняют одну клетку, новые настройки не расширяют их задним числом', () => {
  const state = initialState();
  state.version = 4;
  state.buildings.push({ t: 'house', x: 3, z: 3 });
  const game = createGame(state, { 'game/house/0': corner });
  assert.deepEqual(buildingCells(game.serialize().buildings[1]), [{ x: 3, z: 3 }]);
});
test('маска связная, уникальная, не больше 4×4 и содержит точку размещения', () => {
  assert(validFootprint(corner));
  for (const bad of [
    [],
    [{ x: 1, z: 0 }],
    [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ],
    [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
    ],
    [
      { x: 0, z: 0 },
      { x: -1, z: 0 },
    ],
    [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
    ],
  ])
    assert.equal(validFootprint(bad), false);
});
