import test from 'node:test';
import assert from 'node:assert/strict';
import { packCottage } from '../scripts/pack-cottage.mjs';
import { buildingGeometry, defaultObjectParts, islandGeometry } from '../src/scene/geometry.ts';
import { createWorld } from '../src/domain/index.ts';
import { objectSettings, objectTemplate } from '../src/objects/index.ts';
import { COTTAGE_SCALE } from '../src/scene/cottage.ts';

test('Blender cottage export has complete authored normals and a compact residential footprint', async () => {
  const model = await packCottage(process.cwd());
  assert(model.f.length > 100 && model.f.length < 15000);
  assert.deepEqual(new Set(model.s), new Set([0, 10, 11, 12]));
  for (const [i, face] of model.f.entries()) {
    assert(face.slice(0, 3).every((index) => model.p[index]?.every(Number.isFinite)));
    assert(face.slice(3).every((index) => model.c[index]?.every(Number.isFinite)));
    for (const index of model.fn[i]) assert(Math.abs(Math.hypot(...model.n[index]) - 1) < 0.00001);
  }
  for (const axis of [0, 2]) {
    const values = model.p.map((p) => p[axis]);
    const extent = (Math.max(...values) - Math.min(...values)) * COTTAGE_SCALE * 0.7;
    assert(extent > 0.5 && extent < 1, 'House stays inside its single-cell site');
  }
});

test('all four house variants, including the saved template, use the cottage and preserve normals', async () => {
  const model = await packCottage(process.cwd());
  const sourceNormals = model.fn.flatMap((face) => face.flatMap((index) => model.n[index]));
  for (let variant = 0; variant < 4; variant++) {
    const id = `game/house/${variant}`;
    const recipe = defaultObjectParts(id);
    assert.equal(recipe.length, 1);
    assert.equal(recipe[0].asset, 'custom/cottage-house');
    assert.deepEqual(recipe[0].scale, [COTTAGE_SCALE, COTTAGE_SCALE, COTTAGE_SCALE]);
    assert.deepEqual(objectSettings(id), { scale: 0.7, footprint: [{ x: 0, z: 0 }] });
    const geometry = buildingGeometry({ t: 'house', x: 0, z: variant });
    // The preview prepends its flat contact shadow; the cottage occupies the tail.
    const normals = geometry.normals.slice(-sourceNormals.length);
    assert.equal(normals.length, sourceNormals.length);
    assert(normals.every((value, i) => Math.abs(value - sourceNormals[i]) < 0.00001));
  }
  assert.equal(objectTemplate('game/house/0').length, 1);
  assert.equal(objectTemplate('game/house/0')[0].asset, 'custom/cottage-house');
});

test('the house template preserves per-material paint tags in the actual island geometry', async () => {
  const model = await packCottage(process.cwd());
  const geometry = islandGeometry([{ t: 'house', x: 3, z: 4 }], createWorld(3210380753));
  const paint = geometry.uvs.slice(-model.f.length * 6);
  for (const [i, tag] of model.s.entries())
    assert.deepEqual(paint.slice(i * 6, i * 6 + 6), [tag, 0, tag, 0, tag, 0]);
});
