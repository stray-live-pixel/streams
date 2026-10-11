import test from 'node:test';
import assert from 'node:assert/strict';
import { packPort } from '../scripts/pack-port.mjs';
import { harborLayout, PORT_SCALE, PORT_SOURCE_DECK, PORT_DECK } from '../src/scene/harbor.ts';
import { voyageFrame } from '../src/scene/voyage.ts';
import { ISLAND_SPREAD } from '../src/scene/space.ts';

test('экспорт порта сохраняет все 270 объектов без дублирования кривых, палитру и нормали', async () => {
  const model = await packPort(process.cwd());
  assert.equal(model.p.length, 27180);
  assert.equal(model.f.length, 53314);
  assert.equal(model.c.length, 14);
  assert.deepEqual(new Set(model.s), new Set([0, 10, 11, 12]));
  for (const [i, face] of model.f.entries()) {
    assert(face.slice(0, 3).every((index) => model.p[index]?.every(Number.isFinite)));
    assert(face.slice(3).every((index) => model.c[index]?.every(Number.isFinite)));
    for (const index of model.fn[i]) assert(Math.abs(Math.hypot(...model.n[index]) - 1) < 0.00001);
  }
  const lowest = Math.min(...model.p.map((p) => p[1]));
  assert(
    PORT_DECK + (lowest - PORT_SOURCE_DECK) * PORT_SCALE * ISLAND_SPREAD < -0.68,
    'Сваи должны заходить под поверхность воды',
  );
});

test('габариты Blender-порта и маршрут высадки согласованы на четырёх сторонах берега', async () => {
  const model = await packPort(process.cwd());
  for (const direction of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const [dx, dz] = direction;
    const port = { t: 'port', x: 0, z: 0 };
    const contains = (x, z) => (x - 0.5) * dx + (z - 0.5) * dz < 0.5;
    const layout = harborLayout(port, {
      size: 0,
      contains,
      isLand: contains,
      shoreDirection: () => direction,
    });
    for (const p of model.p) {
      const world = layout.point(p[0] * PORT_SCALE, layout.distance + p[2] * PORT_SCALE);
      assert(!contains(world.x, world.z), 'Модель не перекрывает соседнюю сушу');
    }
    const event = { port, count: 1 };
    const stopped = voyageFrame(event, 3, direction, undefined, layout);
    assert.equal(stopped.x, layout.mooring.x);
    assert.equal(stopped.z, layout.mooring.z);
    for (let t = 2.01; t < 3.3; t += 0.03) {
      const passenger = voyageFrame(event, t, direction, undefined, layout).passengers[0];
      assert.equal(passenger.deckHeight, PORT_DECK);
      assert(
        layout.route.slice(1).some((b, i) => {
          const a = layout.route[i];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          return (
            Math.abs(
              Math.hypot(passenger.x - a.x, passenger.z - a.z) +
                Math.hypot(passenger.x - b.x, passenger.z - b.z) -
                length,
            ) < 0.00001
          );
        }),
        'Пассажир остаётся на настиле',
      );
    }
  }
});
