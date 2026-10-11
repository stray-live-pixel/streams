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
    assert(tag >= 1 && tag <= 6);
    assert.equal(nature.uvs[i + 2], tag);
    assert.equal(nature.uvs[i + 4], tag);
    for (const offset of [1, 3, 5])
      assert(nature.uvs[i + offset] >= 0 && nature.uvs[i + offset] <= 1);
  }
  assert.deepEqual([...tags].sort(), [1, 2, 3, 4, 5, 6]);
  assert(nature.uvs.some((value, index) => index % 2 && value > 0.1 && value < 0.9));
  const combined = islandGeometry([{ t: 'hall', x: 5, z: 5 }], world);
  assert(combined.uvs.some((value, index) => index % 2 === 0 && value === 0));
});
