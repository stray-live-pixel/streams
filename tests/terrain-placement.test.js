import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { buildingGeometry, islandGeometry } from '../src/scene/geometry.ts';
import { readFileSync } from 'node:fs';
import { environmentGeometry, environmentLayout } from '../src/scene/environment.ts';
import { buildingElevation, terrainHeight } from '../src/scene/terrain.ts';
import { boardCoordinate, sceneCoordinate, ISLAND_SPREAD } from '../src/scene/space.ts';
import { pineGeometry, bushGeometry } from '../src/scene/foliage.ts';

test('суша занимает вдвое большую площадь, координаты сохранений обратимы', () => {
  assert(Math.abs(ISLAND_SPREAD ** 2 - 2) < 1e-12);
  for (const coordinate of [-18, 0, 3.5, 6, 11.5, 30])
    assert(Math.abs(boardCoordinate(sceneCoordinate(coordinate)) - coordinate) < 1e-12);
});

test('дом сохраняет габариты и встаёт на высоту своей площадки после расширения острова', () => {
  const world = createWorld(3210380753);
  const house = { t: 'house', x: 3, z: 4 };
  const environment = environmentGeometry(world, [house]);
  const island = islandGeometry([house], world);
  const actual = island.positions.slice(environment.positions.length);
  const preview = buildingGeometry(house).positions;
  const original = [];
  // Мастерская дополнительно рисует плоскую запечённую тень, игра — реальную.
  for (let i = 0; i < preview.length; i += 9) {
    if ([1, 4, 7].every((offset) => Math.abs(preview[i + offset] - 0.012) < 1e-9)) continue;
    original.push(...preview.slice(i, i + 9));
  }
  const elevation = buildingElevation(house, world.seed);
  assert.equal(actual.length, original.length);
  for (let i = 0; i < actual.length; i += 3) {
    assert(Math.abs(actual[i] - (sceneCoordinate(3.5) + original[i] - 3.5)) < 1e-9);
    assert(Math.abs(actual[i + 1] - original[i + 1] - elevation) < 1e-9);
    assert(Math.abs(actual[i + 2] - (sceneCoordinate(4.5) + original[i + 2] - 4.5)) < 1e-9);
  }
});

test('увеличение острова раздвигает деревья, сохраняя их пропорции', () => {
  const world = createWorld(3210380753);
  const models = JSON.parse(
    readFileSync(new URL('../.generated/nature-models.json', import.meta.url)),
  );
  const layout = environmentLayout(world, []);
  const modelFor = (item) =>
    item.asset.startsWith('pine')
      ? pineGeometry(item.asset, item.x, item.z, world.seed)
      : item.asset === 'bush'
        ? bushGeometry(item.x, item.z, world.seed)
        : models[item.asset];
  const original = environmentGeometry(world, []);
  const expanded = environmentGeometry(world, [], ISLAND_SPREAD);
  let offset =
    original.positions.length -
    layout.reduce((size, item) => size + modelFor(item).f.length * 9, 0);
  let checked = 0;
  for (const item of layout) {
    const length = modelFor(item).f.length * 9;
    if (item.asset.startsWith('pine')) {
      for (let i = offset; i < offset + length; i += 3) {
        assert(
          Math.abs(
            expanded.positions[i] - sceneCoordinate(item.x) - (original.positions[i] - item.x),
          ) < 1e-9,
        );
        assert(Math.abs(expanded.positions[i + 1] - original.positions[i + 1]) < 1e-9);
        assert(
          Math.abs(
            expanded.positions[i + 2] -
              sceneCoordinate(item.z) -
              (original.positions[i + 2] - item.z),
          ) < 1e-9,
        );
      }
      checked++;
    }
    offset += length;
  }
  assert(checked > 10);
});

test('соседние дороги следуют общему склону и не создают отдельные ступени земли', () => {
  const world = createWorld(3210380753);
  const roads = [
    { t: 'road', x: 2, z: 3.1 },
    { t: 'road', x: 3, z: 3.1 },
  ];
  assert(
    Math.abs(buildingElevation(roads[0], world.seed) - buildingElevation(roads[1], world.seed)) > 1,
  );
  for (let x = 2; x <= 4; x += 0.025)
    assert.equal(terrainHeight(x, 3.6, world.seed, roads), terrainHeight(x, 3.6, world.seed));

  const environment = environmentGeometry(world, roads);
  const points = islandGeometry(roads, world).positions.slice(environment.positions.length);
  const originals = roads.flatMap((road) => buildingGeometry(road).positions);
  assert.equal(points.length, originals.length);
  for (let i = 0; i < points.length; i += 3) {
    assert(Math.abs(points[i] - sceneCoordinate(originals[i])) < 1e-9);
    assert(Math.abs(points[i + 2] - sceneCoordinate(originals[i + 2])) < 1e-9);
    assert(
      Math.abs(
        points[i + 1] -
          originals[i + 1] -
          terrainHeight(originals[i], originals[i + 2], world.seed, roads),
      ) < 1e-9,
      'Все вершины соседних сегментов используют одну функцию поверхности',
    );
  }
});

test('площадки соседних домов соединяются непрерывно и не зависят от порядка построек', () => {
  const seed = 3210380753;
  const houses = [
    { t: 'house', x: 4, z: 3 },
    { t: 'house', x: 5, z: 3 },
  ];
  for (const house of houses)
    assert.equal(
      terrainHeight(house.x + 0.5, house.z + 0.5, seed, houses),
      buildingElevation(house, seed),
      'Ядро площадки сохраняет высоту основания дома',
    );
  let previous = terrainHeight(4.8, 3.5, seed, houses);
  for (let x = 4.8005; x <= 5.2; x += 0.0005) {
    const height = terrainHeight(x, 3.5, seed, houses);
    assert(Math.abs(height - previous) < 0.01, 'Между площадками нет скачка высоты');
    assert(Math.abs(height - terrainHeight(x, 3.5, seed, [...houses].reverse())) < 1e-12);
    previous = height;
  }
});
