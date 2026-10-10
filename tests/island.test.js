import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createGame,
  createWorld,
  initialState,
  restoreState,
  isLand,
} from '../src/domain/index.ts';
import { environmentLayout, environmentGeometry } from '../src/scene/environment.ts';
import { harborLayout } from '../src/scene/harbor.ts';

test('новые острова связны, отличаются по seed и имеют доступный берег для порта', () => {
  const silhouettes = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const world = createWorld(seed * 39234811);
    const cells = [];
    for (let x = 0; x < 12; x++)
      for (let z = 0; z < 12; z++) if (world.isLand(x, z)) cells.push(`${x},${z}`);
    const remaining = new Set(cells),
      queue = ['5,5'];
    remaining.delete(queue[0]);
    for (const key of queue) {
      const [x, z] = key.split(',').map(Number);
      for (const [dx, dz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const next = `${x + dx},${z + dz}`;
        if (remaining.delete(next)) queue.push(next);
      }
    }
    assert.equal(remaining.size, 0, `Disconnected island ${seed}`);
    assert.deepEqual(world.shoreDirection(6, 11), [0, 1]);
    assert(cells.length >= 110, 'Достаточно свободной земли для прохождения игры');
    for (const key of cells) {
      const [x, z] = key.split(',').map(Number);
      if (!world.shoreDirection(x, z)) continue;
      const layout = harborLayout({ x, z }, world);
      for (const side of [-1.5, 0, 1.5])
        for (const depth of [-0.9, 0, 0.9]) {
          const p = layout.point(side, layout.distance + depth);
          assert(!world.isLand(Math.floor(p.x), Math.floor(p.z)));
        }
    }
    silhouettes.add(cells.join(';'));
  }
  assert(silhouettes.size > 10, 'Меняется не только случайная расстановка декора');
});

test('seed сохраняется при продолжении, новый город получает новый seed, старые города сохраняют географию', () => {
  let seed = 12345;
  const game = createGame(null, {}, () => seed++);
  assert.equal(game.serialize().islandSeed, 12345);
  assert.deepEqual(createGame(game.serialize()).serialize(), game.serialize());
  game.dispatch({ type: 'reset' });
  assert.equal(game.serialize().islandSeed, 12346);
  const old = initialState();
  old.version = 5;
  delete old.islandSeed;
  assert.equal(restoreState(old).islandSeed, 0);
  const legacy = createWorld(0);
  for (let x = 0; x < 12; x++)
    for (let z = 0; z < 12; z++) assert.equal(legacy.isLand(x, z), isLand(x, z));
  for (const bad of [-1, 1.5, 2 ** 32, NaN, '123', undefined])
    assert.throws(() => restoreState({ ...initialState(), islandSeed: bad }));
});

test('декор свободно расставлен, повторяется по seed и освобождает место для зданий и причала', () => {
  const board = createWorld(123456789);
  const first = environmentLayout(board, []);
  assert.deepEqual(environmentLayout(board, []), first);
  assert.notDeepEqual(environmentLayout(createWorld(987654321), []), first);
  assert(first.filter((p) => p.asset.startsWith('pine')).length >= 20);
  assert(first.every((p) => p.x % 0.5 !== 0 || p.z % 0.5 !== 0));
  const buildings = [
    { t: 'hall', x: 5, z: 5 },
    { t: 'port', x: 6, z: 11 },
    { t: 'house', x: 8, z: 6 },
  ];
  const cleared = environmentLayout(board, buildings);
  assert(cleared.length < first.length);
  for (const item of cleared) {
    const { y: _height, ...horizontalPlacement } = item;
    assert(
      first.some(
        ({ y: _originalHeight, ...original }) =>
          JSON.stringify(original) === JSON.stringify(horizontalPlacement),
      ),
      'Строительство не сдвигает деревья по горизонтали; их высота следует рельефу',
    );
    for (const b of buildings)
      assert(
        !(item.x > b.x - 0.12 && item.x < b.x + 1.12 && item.z > b.z - 0.12 && item.z < b.z + 1.12),
      );
    assert(!(item.z > 10.8 && item.z < 17.5 && Math.abs(item.x - 6.5) < 2.05));
  }
  const geometry = environmentGeometry(board, buildings);
  assert(geometry.positions.every(Number.isFinite));
  assert(geometry.colors.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
  assert(geometry.indices.length / 3 < 60000, 'Лёгкое окружение для браузера');
});

test('готовые GLB совпадают с числом треугольников исходников и имеют полные буферы', async () => {
  const models = JSON.parse(await readFile('assets/models/island-nature/models.json', 'utf8'));
  for (const [id, model] of Object.entries(models)) {
    const file = await readFile(`assets/models/island-nature/${id}.glb`);
    assert.equal(file.readUInt32LE(0), 0x46546c67);
    assert.equal(file.readUInt32LE(4), 2);
    assert.equal(file.readUInt32LE(8), file.length);
    const length = file.readUInt32LE(12);
    const json = JSON.parse(file.subarray(20, 20 + length).toString());
    assert.equal(json.accessors[0].count, model.f.length * 3);
    assert.equal(file.length - length - 28, json.buffers[0].byteLength);
    assert.deepEqual(json.meshes[0].primitives[0].attributes, {
      POSITION: 0,
      NORMAL: 1,
      COLOR_0: 2,
    });
  }
});
