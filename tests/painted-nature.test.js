import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { environmentGeometry } from '../src/scene/environment.ts';
import { islandGeometry } from '../src/scene/geometry.ts';

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
