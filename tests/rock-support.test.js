import test from 'node:test';
import assert from 'node:assert/strict';
import { exposedRockHeight } from '../src/scene/rock-support.ts';
import { terrainHeight } from '../src/scene/terrain.ts';
import { environmentLayout } from '../src/scene/environment.ts';
import { createWorld } from '../src/domain/index.ts';

test('опора учитывает выступающие глыбы над прежним рельефом, а вне скал отсутствует', () => {
  for (const [seed, x, z] of [
    [3210380753, 9.115, 6.298],
    [42, 8.595, 6.971],
  ]) {
    const height = exposedRockHeight(x, z, seed);
    assert(Number.isFinite(height));
    assert(height > terrainHeight(x, z, seed) + 0.12, 'Старая поверхность скрывала часть ствола');
    assert.equal(exposedRockHeight(x, z, seed), height, 'Повторный запрос не меняет высоту');
    assert.equal(exposedRockHeight(-20, -20, seed), -Infinity);
  }
  assert.equal(exposedRockHeight(NaN, 0, 42), -Infinity);
});

test('добавление, перенос и изменение пятна здания обновляют опору скал', () => {
  const seed = 3210380753,
    x = 9.115,
    z = 6.298;
  const height = exposedRockHeight(x, z, seed);
  const building = { t: 'house', x: 0, z: 0 };
  const buildings = [building];
  assert.equal(exposedRockHeight(x, z, seed, buildings), height);
  building.x = x - 0.5;
  building.z = z - 0.5;
  assert.equal(
    exposedRockHeight(x, z, seed, buildings),
    -Infinity,
    'Площадка освобождается от скал',
  );
  assert.equal(exposedRockHeight(x, z, seed), height, 'Удаление здания возвращает прежний склон');

  building.x = 7.2;
  building.z = 5.8;
  assert(Number.isFinite(exposedRockHeight(x, z, seed, buildings)));
  building.footprint = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
  ];
  assert.equal(exposedRockHeight(x, z, seed, buildings), -Infinity, 'Учитывается изменённое пятно');
});

test('растительность не сохраняет основания внутри выступающих нагорных глыб', () => {
  const examples = [
    [0, 5.371, 3.474],
    [1, 8.536, 7.116],
    [42, 8.595, 6.971],
    [1234, 9.147, 7.019],
    [3210380753, 9.115, 6.298],
  ];
  for (const [seed, oldX, oldZ] of examples) {
    const plants = environmentLayout(createWorld(seed), []).filter(
      (item) => item.asset.startsWith('pine') || ['bush', 'grass', 'flowers'].includes(item.asset),
    );
    assert(plants.length > 40, 'Фильтрация сохраняет растительность вне скальных плеч');
    assert(
      !plants.some((item) => Math.hypot(item.x - oldX, item.z - oldZ) < 0.002),
      'Прежний провалившийся в скалу экземпляр убран',
    );
    for (const plant of plants) {
      assert(
        exposedRockHeight(plant.x, plant.z, seed) <= plant.y + 0.06,
        `${seed}: ${plant.asset} в (${plant.x}, ${plant.z}) не утоплен в глыбу`,
      );
    }
    assert.deepEqual(
      environmentLayout(createWorld(seed), []).filter(
        (item) =>
          item.asset.startsWith('pine') || ['bush', 'grass', 'flowers'].includes(item.asset),
      ),
      plants,
      'Повторная компоновка остаётся стабильной',
    );
  }
});
