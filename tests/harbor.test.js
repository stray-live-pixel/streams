import test from 'node:test';
import assert from 'node:assert/strict';
import { harborLayout } from '../src/scene/harbor.ts';
import { MAP_SIZE, isLand, shoreDirection } from '../src/domain/index.ts';

test('широкий причал не накрывает соседнюю сушу даже у вырезанных углов', () => {
  const board = { size: MAP_SIZE, isLand, shoreDirection };
  for (let x = 0; x < MAP_SIZE; x++)
    for (let z = 0; z < MAP_SIZE; z++) {
      if (!shoreDirection(x, z)) continue;
      const h = harborLayout({ x, z }, board);
      for (let side = -1.5; side <= 1.5; side += 0.2)
        for (let depth = -0.9; depth <= 0.9; depth += 0.2) {
          const p = h.point(side, h.distance + depth);
          assert.equal(isLand(Math.floor(p.x), Math.floor(p.z)), false, `port ${x},${z}`);
        }
    }
});
