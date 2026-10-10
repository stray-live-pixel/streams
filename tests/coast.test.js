import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { environmentGeometry, shorelineRadius } from '../src/scene/environment.ts';

test('береговой скат остаётся снаружи строительной поверхности для разных островов', () => {
  for (const seed of [0, 1, 1234, 3210380753, 4294967295]) {
    const world = createWorld(seed);
    for (let i = 0; i < 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      const land = world.coastRadius(angle);
      const waterline = shorelineRadius(angle, seed, land);
      assert(waterline > land + 0.3 && waterline < land + 0.8);
      assert.equal(waterline, shorelineRadius(angle, seed));
    }
  }
});

test('нижняя кромка геометрии согласована с контуром прибоя и не имеет разрывов', () => {
  const world = createWorld(3210380753);
  const data = environmentGeometry(world, []);
  const edge = new Set();
  for (let i = 0; i < data.positions.length; i += 3) {
    const [x, y, z] = data.positions.slice(i, i + 3);
    assert(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (y !== -0.74) continue;
    const angle = Math.atan2(z - 6, x - 6);
    assert(Math.abs(Math.hypot(x - 6, z - 6) - shorelineRadius(angle, world.seed)) < 1e-8);
    edge.add(`${x.toFixed(8)},${z.toFixed(8)}`);
  }
  assert.equal(
    edge.size,
    96,
    'Вся нижняя кромка замкнута, включая шов первого и последнего сегментов',
  );
  assert.deepEqual(data.positions, environmentGeometry(world, []).positions);
});
