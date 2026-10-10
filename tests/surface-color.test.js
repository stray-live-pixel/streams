import test from 'node:test';
import assert from 'node:assert/strict';
import { grassPigment, rockPigment } from '../src/scene/surface-color.ts';

const stone = [224, 198, 152];

test('мокрые скалы темнее сухих, а граница намокания не образует ровную полосу', () => {
  const wet = rockPigment(2, -0.7, 3, stone);
  const dry = rockPigment(2, 0, 3, stone);
  wet.forEach((channel, i) => assert(channel < dry[i] * 0.7));
  const ratios = Array.from(
    { length: 20 },
    (_, x) => rockPigment(x, -0.5, 3, stone)[0] / rockPigment(x, 0, 3, stone)[0],
  );
  assert(Math.max(...ratios) - Math.min(...ratios) > 0.08);
});

test('цветовые пятна воспроизводимы и остаются в диапазоне палитры', () => {
  const grass = [166, 191, 66];
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const point = [(i % 10) * 0.7, Math.floor(i / 10) * 0.7];
    const painted = grassPigment(...point, grass);
    assert.deepEqual(painted, grassPigment(...point, grass));
    samples.push(painted);
    for (const color of [painted, rockPigment(point[0], -i / 20, point[1], stone)])
      assert(color.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255));
  }
  assert(new Set(samples.map((color) => color.join(','))).size > 10);
});
