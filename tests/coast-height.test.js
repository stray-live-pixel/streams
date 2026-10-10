import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { coastalElevation, beachInfluence } from '../src/scene/coast-height.ts';
import { coastSection } from '../src/scene/cliff-layout.ts';
import { terrainHeight } from '../src/scene/terrain.ts';

test('мыс приподнят, оба пляжа остаются низкими, берег и суша используют одну высоту', () => {
  for (const seed of [0, 1, 123456789, 3210380753]) {
    const world = createWorld(seed);
    for (let i = 0; i < 192; i++) {
      const angle = (i / 192) * Math.PI * 2;
      const radius = world.coastRadius(angle);
      const x = 6 + Math.cos(angle) * radius,
        z = 6 + Math.sin(angle) * radius;
      const height = coastalElevation(x, z, seed);
      assert(Number.isFinite(height));
      if (beachInfluence(angle, seed) > 0.99) assert(height < 1e-8);
      if (beachInfluence(angle, seed) === 0) assert(height > 0.27 && height < 0.65);
      const [r, y] = coastSection(angle, 0, seed);
      assert(
        Math.abs(y - terrainHeight(6 + Math.cos(angle) * r, 6 + Math.sin(angle) * r, seed)) < 1e-8,
      );
      assert.equal(coastSection(angle, 3, seed)[1], -0.68);
    }
  }
});

test('низкий подход к причалу не меняет высоты на другом конце острова', () => {
  const seed = 123456789;
  const port = { t: 'port', x: 11, z: 6 };
  assert.equal(coastalElevation(11.5, 6.5, seed, [port]), 0);
  assert.equal(terrainHeight(11.5, 6.5, seed, [port]), 0);
  assert.equal(coastalElevation(1, 6, seed, [port]), coastalElevation(1, 6, seed));
});
