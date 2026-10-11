import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { environmentGeometry } from '../src/scene/environment.ts';
import { islandGeometry } from '../src/scene/geometry.ts';
import { pineGeometry } from '../src/scene/foliage.ts';
import { environmentLayout, beachInfluence } from '../src/scene/environment.ts';
import { beachInset } from '../src/scene/coast-height.ts';

test('все природные поверхности размечены под рисованные материалы без смешения на гранях', () => {
  const world = createWorld(3210380753);
  const nature = environmentGeometry(world, []);
  const tags = new Set();
  for (let i = 0; i < nature.uvs.length; i += 6) {
    const tag = nature.uvs[i];
    tags.add(tag);
    assert(tag >= 1 && tag <= 9);
    assert.equal(nature.uvs[i + 2], tag);
    assert.equal(nature.uvs[i + 4], tag);
    for (const offset of [1, 3, 5])
      assert(nature.uvs[i + offset] >= 0 && nature.uvs[i + offset] <= 1);
  }
  assert.deepEqual([...tags].sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert(nature.uvs.some((value, index) => index % 2 && value > 0.1 && value < 0.9));
  const combined = islandGeometry([{ t: 'hall', x: 5, z: 5 }], world);
  assert(combined.uvs.some((value, index) => index % 2 === 0 && value === 0));
});

test('хвоя использует текстуру без чередующейся палитры и хранит местную высоту', () => {
  const nature = environmentGeometry(createWorld(3210380753), []);
  const heights = [];
  const shared = new Map();
  for (let vertex = 0; vertex < nature.positions.length / 3; vertex++) {
    if (nature.uvs[vertex * 2] !== 7) continue;
    assert.deepEqual(nature.colors.slice(vertex * 4, vertex * 4 + 4), [1, 1, 1, 1]);
    const height = nature.uvs[vertex * 2 + 1];
    heights.push(height);
    const key = nature.positions.slice(vertex * 3, vertex * 3 + 3).join(',');
    if (shared.has(key)) assert.equal(height, shared.get(key), 'На стыке граней нет скачка цвета');
    shared.set(key, height);
  }
  assert(heights.length > 0);
  assert(Math.min(...heights) < 0.2);
  assert.equal(Math.max(...heights), 1);
  assert(new Set(heights).size > 8, 'Высота интерполируется внутри всех ярусов кроны');
});

test('объёмные кроны воспроизводимы, различаются по месту и остаются в бюджете', () => {
  const tree = pineGeometry('pine-tall', 2.3, 4.7, 1234);
  assert.deepEqual(tree, pineGeometry('pine-tall', 2.3, 4.7, 1234));
  assert.notDeepEqual(tree.p, pineGeometry('pine-tall', 2.4, 4.7, 1234).p);
  assert(tree.f.length < 300);
  assert(tree.p.every((point) => point.every(Number.isFinite)));
  const foliage = tree.f.filter((face) => face[3] === 0);
  const heights = new Set(
    foliage.flatMap((face) => face.slice(0, 3).map((index) => tree.p[index][1])),
  );
  assert(heights.size > 40, 'Края ярусов не лежат в одинаковых плоских кольцах');
  assert(
    Math.min(...foliage.flatMap((face) => face.slice(0, 3).map((index) => tree.p[index][1]))) >
      0.25,
    'Под нижними ветвями остаётся видимый ствол',
  );
});

test('сухой песок остаётся свободным от россыпи кустов, травы и цветов', () => {
  const world = createWorld(3210380753);
  for (const item of environmentLayout(world, [])) {
    if (!['bush', 'grass', 'flowers'].includes(item.asset)) continue;
    const angle = Math.atan2(item.z - 6, item.x - 6);
    const inland =
      world.coastRadius(angle) - beachInset(angle, world.seed) - Math.hypot(item.x - 6, item.z - 6);
    const cover =
      beachInfluence(angle, world.seed) * Math.max(0, Math.min(1, 1 - (inland - 1.35) / 1.7));
    assert(cover <= 0.46);
  }
});
