import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, initialState, restoreState, STEP } from '../src/domain/index.ts';
import { createStorage, SAVE_KEY } from '../src/persistence/index.ts';
import { voyageFrame } from '../src/scene/voyage.ts';

function chooseAndBuild(game, type, x, z) {
  game.dispatch({ type: 'select', building: type });
  return game.dispatch({ type: 'build', x, z });
}
function readyCity() {
  const game = createGame();
  game.dispatch({ type: 'continue' });
  chooseAndBuild(game, 'port', 6, 11);
  chooseAndBuild(game, 'house', 7, 6);
  chooseAndBuild(game, 'farm', 4, 7);
  chooseAndBuild(game, 'shop', 6, 7);
  return game;
}
test('порт первый; внутренний участок и ранняя смена дня не принимаются', () => {
  const g = createGame();
  g.dispatch({ type: 'continue' });
  assert.equal(g.snapshot().required, 'port');
  chooseAndBuild(g, 'port', 7, 6);
  assert.equal(g.snapshot().buildings.length, 1);
  assert.equal(g.dispatch({ type: 'next-day' }).changed, false);
  chooseAndBuild(g, 'port', 6, 11);
  assert.equal(g.snapshot().required, 'house');
});
test('свободная планировка и дома без мгновенного заселения', () => {
  const g = readyCity();
  assert.equal(g.snapshot().step, STEP.DAY);
  assert.equal(g.snapshot().pop, 0);
  assert.equal(g.snapshot().stats.capacity, 10);
  assert.equal(g.snapshot().money, 230);
});
test('дороги бесплатны, обратимы и не продвигают обучение', () => {
  const g = createGame();
  g.dispatch({ type: 'continue' });
  chooseAndBuild(g, 'port', 6, 11);
  chooseAndBuild(g, 'road', 7, 6);
  assert.equal(g.snapshot().money, 600);
  assert.equal(g.snapshot().step, STEP.HOUSE);
  g.dispatch({ type: 'build', x: 7, z: 6 });
  assert.equal(g.snapshot().buildings.length, 2);
  g.dispatch({ type: 'build', x: 7, z: 6 });
  chooseAndBuild(g, 'house', 7, 6);
  assert.equal(g.snapshot().buildings.filter((b) => b.x === 7 && b.z === 6).length, 1);
  assert.equal(g.snapshot().stats.capacity, 10);
});
test('первый рейс начисляется один раз; экономика учитывает новых жителей', () => {
  const g = readyCity();
  const result = g.dispatch({ type: 'next-day' });
  assert.equal(result.events.find((e) => e.type === 'arrival').count, 10);
  assert.equal(g.snapshot().pop, 10);
  assert.equal(g.snapshot().money, 300);
  assert.equal(g.snapshot().food, 40);
  assert.equal(g.snapshot().busy, true);
  assert.equal(g.dispatch({ type: 'next-day' }).changed, false);
  const restored = createGame(g.serialize());
  assert.equal(restored.snapshot().pop, 10);
  assert.equal(restored.snapshot().busy, false);
});
test('пустой рейс не создаётся, после постройки дома приходит следующий', () => {
  const g = readyCity();
  g.dispatch({ type: 'next-day' });
  g.dispatch({ type: 'arrival-finished' });
  g.dispatch({ type: 'continue' });
  assert.equal(
    g.dispatch({ type: 'next-day' }).events.some((e) => e.type === 'arrival'),
    false,
  );
  chooseAndBuild(g, 'house', 3, 7);
  assert.equal(g.dispatch({ type: 'next-day' }).events.find((e) => e.type === 'arrival').count, 10);
  assert.equal(g.snapshot().pop, 20);
});
test('занятый участок и вода не расходуют ресурсы', () => {
  const g = readyCity();
  g.dispatch({ type: 'next-day' });
  g.dispatch({ type: 'arrival-finished' });
  g.dispatch({ type: 'continue' });
  g.dispatch({ type: 'select', building: 'house' });
  const before = g.serialize();
  g.dispatch({ type: 'build', x: 5, z: 5 });
  g.dispatch({ type: 'build', x: -1, z: 0 });
  assert.deepEqual(g.serialize(), before);
});
test('снимок не позволяет изменить внутреннее состояние', () => {
  const g = readyCity(),
    view = g.snapshot();
  view.money = 99999;
  view.buildings.length = 0;
  assert.equal(g.snapshot().money, 230);
  assert.equal(g.snapshot().buildings.length, 5);
});
test('миграция старого города сохраняет жителей и возвращает к недостающему порту', () => {
  const old = { ...initialState(), version: 2, step: 6, day: 8, pop: undefined };
  old.buildings.push({ x: 7, z: 6, t: 'house' });
  const g = createGame(old);
  assert.equal(g.snapshot().pop, 10);
  assert.equal(g.snapshot().step, STEP.PORT);
  chooseAndBuild(g, 'port', 6, 11);
  assert.equal(g.snapshot().step, STEP.FREE);
  assert.equal(g.snapshot().day, 8);
});
test('повреждённые сохранения отклоняются', () => {
  for (const broken of [
    null,
    {},
    { ...initialState(), pop: 100 },
    { ...initialState(), money: -1 },
    { ...initialState(), step: 10 },
    { ...initialState(), buildings: [{ x: 5, z: 5, t: 'constructor' }] },
  ]) {
    assert.throws(() => restoreState(broken));
  }
});
test('ошибка localStorage не прерывает игру и не удаляет исходную запись', () => {
  let removed = false;
  const storage = createStorage(() => ({
    getItem: () => '{broken',
    removeItem: () => {
      removed = true;
    },
    setItem: () => {
      throw Error('quota');
    },
  }));
  assert.match(storage.load().error, /загрузить/);
  assert.equal(removed, false);
  assert.match(storage.save(initialState()), /не разрешил/);
});
test('совместимый ключ сохранений и полный цикл записи', () => {
  const data = new Map();
  const storage = createStorage(() => ({
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
  }));
  const state = readyCity().serialize();
  assert.equal(storage.save(state), null);
  assert(data.has(SAVE_KEY));
  assert.deepEqual(storage.load().state, state);
});
test('фазы корабля отделены от экономики и заканчиваются через 7 секунд', () => {
  const e = { count: 10, port: { x: 6, z: 11 } };
  assert.equal(voyageFrame(e, 0, [0, 1]).passengers.length, 0);
  assert(voyageFrame(e, 3, [0, 1]).passengers.length > 0);
  assert.equal(voyageFrame(e, 7, [0, 1]).done, true);
});
test('сброс отменяет рейс и возвращает начальное состояние', () => {
  const g = readyCity();
  g.dispatch({ type: 'next-day' });
  g.dispatch({ type: 'reset' });
  assert.deepEqual(g.serialize(), initialState());
  assert.equal(g.snapshot().busy, false);
});
test('цель достижима с 50 жителями и достаточным производством еды', () => {
  const s = initialState();
  s.step = STEP.FREE;
  s.money = 10000;
  s.food = 1000;
  s.buildings.push({ x: 6, z: 11, t: 'port' });
  const g = createGame(s);
  for (let x = 2; x < 7; x++) chooseAndBuild(g, 'house', x, 6);
  for (let x = 2; x < 5; x++) chooseAndBuild(g, 'farm', x, 7);
  for (let i = 0; i < 5; i++) {
    g.dispatch({ type: 'next-day' });
    g.dispatch({ type: 'arrival-finished' });
  }
  assert.equal(g.snapshot().pop, 50);
  assert.equal(g.snapshot().won, true);
});
