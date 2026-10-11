import test from 'node:test';
import assert from 'node:assert/strict';
import { triangulate } from '../src/scene/environment.ts';

test('точка на общем ребре склона разделяет обе грани, не оставляя висящего шва', () => {
  const points = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 1, 2],
    [0, 1, 2],
    [1, 0.8, 1],
    [0.5, 0.6, 0.5],
    [1.5, 1, 1.5],
  ];
  const triangles = triangulate(points, 4);
  const edges = new Map();
  let area = 0;
  for (const t of triangles) {
    const [a, b, c] = t.map((i) => points[i]);
    area += ((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
    for (let i = 0; i < 3; i++) {
      const a = t[i],
        b = t[(i + 1) % 3];
      const key = [a, b].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
      for (let j = 4; j < points.length; j++) {
        if (j === a || j === b) continue;
        const u = [points[b][0] - points[a][0], points[b][2] - points[a][2]];
        const v = [points[j][0] - points[a][0], points[j][2] - points[a][2]];
        const dot = u[0] * v[0] + u[1] * v[1];
        const onSegment =
          Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-9 &&
          dot > 1e-9 &&
          dot < u[0] ** 2 + u[1] ** 2 - 1e-9;
        assert(!onSegment, 'Ни одно ребро не проходит сквозь несоединённую вершину');
      }
    }
  }
  assert.equal(area, 4);
  assert.equal([...edges.values()].filter((n) => n === 1).length, 4);
  assert([...edges.values()].every((n) => n === 1 || n === 2));
  assert.equal(new Set(triangles.flat()).size, points.length);
});
