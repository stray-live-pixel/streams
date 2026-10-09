import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { packAssets } from '../scripts/pack-assets.mjs';

test('стена с окном сохраняет плавный градиент без швов между треугольниками', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await packAssets(root);
  const library = JSON.parse(
    await readFile(new URL('../.generated/library-models.json', import.meta.url)),
  );
  const { modelGeometry } = await import('../src/scene/geometry.ts');
  const geometry = modelGeometry(library['kenney-fantasy-town/wall-window-glass']);
  const samples = new Map();
  const shades = new Set();
  for (let i = 0; i < geometry.positions.length; i += 9) {
    const points = [0, 3, 6].map((offset) => geometry.positions.slice(i + offset, i + offset + 3));
    // Внешняя плоская штукатурка вокруг окна: все треугольники лежат в одной плоскости.
    if (!points.every(([x]) => Math.abs(x - 0.475) < 1e-6)) continue;
    const colors = [0, 1, 2].map((corner) =>
      geometry.colors.slice((i / 3 + corner) * 4, (i / 3 + corner) * 4 + 3),
    );
    // Коричневая оконная рама примыкает к стене, но имеет свой материал и границу цвета.
    if (!colors.every(([r, , b]) => b > r)) continue;
    for (let corner = 0; corner < 3; corner++) {
      const point = points[corner];
      const color = colors[corner];
      const key = point.join(',');
      if (samples.has(key)) assert.deepEqual(color, samples.get(key), `Шов в вершине ${key}`);
      samples.set(key, color);
      shades.add(color.join(','));
    }
  }
  assert.ok(samples.size >= 8, 'Проверена вся стена вокруг окна');
  assert.ok(shades.size >= 3, 'Градиент сохранён, а не заменён однотонной заливкой');
});
