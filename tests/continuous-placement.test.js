import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,
  createGame,
  initialState,
  restoreState,
  STEP,
  continuousPlacementIssue,
  buildingsOverlap,
  portLayout,
} from '../src/domain/index.ts';

const world = createWorld(123456789);
const house = (x, z) => ({ t: 'house', x, z });

test('здания имеют дробные координаты и проверяются по площади, а не равенству клеток', () => {
  const a = house(6.137, 4.283);
  assert.equal(continuousPlacementIssue(a, [], world), null);
  assert.equal(continuousPlacementIssue(house(6.5, 4.7), [a], world), 'occupied');
  assert.equal(continuousPlacementIssue(house(7.137, 4.283), [a], world), null);
  assert(!buildingsOverlap(a, house(7.137, 4.283)));
  const state = initialState(world.seed);
  state.step = STEP.FREE;
  state.buildings.push({ t: 'port', x: 6.17, z: 10.98 });
  const game = createGame(state);
  game.dispatch({ type: 'select', building: 'house' });
  assert(game.dispatch({ type: 'build', x: a.x, z: a.z }).changed);
  assert.deepEqual(game.serialize().buildings.at(-1), a);
  assert.deepEqual(restoreState(game.serialize()), game.serialize());
});

test('сохранение отвергает частичное пересечение дробных участков и нечисловые координаты', () => {
  const state = initialState(world.seed);
  state.buildings.push(house(6.25, 3.3), house(6.9, 3.7));
  assert.throws(() => restoreState(state), /пересекаются/);
  for (const value of [NaN, Infinity, -Infinity]) {
    const invalid = initialState(world.seed);
    invalid.buildings.push(house(value, 3));
    assert.throws(() => restoreState(invalid));
  }
});

test('причал требует сушу под береговой частью и воду под морским настилом', () => {
  for (const seed of [0, 1, 123456789, 3210380753]) {
    const world = createWorld(seed);
    assert.equal(continuousPlacementIssue({ t: 'port', x: 5.2, z: 6.1 }, [], world), 'shore');
    assert.equal(continuousPlacementIssue({ t: 'port', x: 6.2, z: 13.1 }, [], world), 'shore');
    const port = { t: 'port', x: 6.17, z: 10.98 };
    assert.equal(continuousPlacementIssue(port, [], world), null);
    const layout = portLayout(port, world);
    assert(world.contains(port.x + 0.5, port.z + 0.5));
    for (const side of [-1.5, 0, 1.5]) {
      const p = layout.point(side, layout.distance);
      assert(!world.contains(p.x, p.z));
    }
  }
});

test('старый город сохраняет координаты и площади после миграции и повторной загрузки', () => {
  const old = initialState(123456789);
  old.version = 6;
  old.buildings.push({ t: 'port', x: 6, z: 11 }, house(8, 4));
  const saved = restoreState(old);
  assert.equal(saved.version, 7);
  assert.deepEqual(
    saved.buildings.map(({ legacy, ...b }) => b),
    old.buildings,
  );
  assert.deepEqual(restoreState(saved), saved);
});

test('погрешность проекции на общем ребре не запрещает соседние здания', () => {
  const a = house(6.999998, 6.000001);
  assert(!buildingsOverlap(a, house(6, 7)));
  assert(buildingsOverlap(a, house(6.01, 6.99)));
});
