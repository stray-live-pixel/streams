import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingSurface } from '../src/scene/building-surface.ts';
import { buildingGeometry, islandGeometry } from '../src/scene/geometry.ts';
import { createWorld } from '../src/domain/index.ts';

test('paint families preserve blue roofs and exclude neutral metal from wood', () => {
  const face = (rgb) => [rgb, rgb, rgb];
  assert.equal(buildingSurface('roof-blue', face([60, 90, 140])), 11);
  assert.equal(buildingSurface('roof-red', face([160, 80, 50])), 11);
  assert.equal(buildingSurface('dock', face([160, 110, 60])), 10);
  assert.equal(buildingSurface('wall', face([130, 155, 180])), 12);
  assert.equal(buildingSurface('barrel', face([100, 105, 110])), 0);
  assert.equal(buildingSurface('window', face([80, 90, 130])), 0);
});

test('building paint stays on whole triangles while the editor retains source art', () => {
  const building = { t: 'hall', x: 5, z: 5 };
  const geometry = islandGeometry([building], createWorld(123456789));
  const tags = new Set();
  for (let i = 0; i < geometry.uvs.length; i += 6) {
    const tag = geometry.uvs[i];
    tags.add(tag);
    assert.equal(geometry.uvs[i + 2], tag);
    assert.equal(geometry.uvs[i + 4], tag);
  }
  assert(tags.has(10));
  assert(tags.has(11));
  assert(buildingGeometry(building).uvs.every((value) => value === 0));
});
