import test from 'node:test';
import assert from 'node:assert/strict';
import { pineGeometry, bushGeometry } from '../src/scene/foliage.ts';

function checkClosedMesh(model) {
  const edges = new Map();
  let volume = 0;
  for (const [a, b, c] of model.f) {
    const points = [a, b, c].map((index) => model.p[index]);
    assert(points.every((point) => point?.every(Number.isFinite)));
    const [p, q, r] = points;
    const u = q.map((value, axis) => value - p[axis]);
    const v = r.map((value, axis) => value - p[axis]);
    assert(
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) >
        1e-7,
      'No collapsed triangles',
    );
    volume +=
      (p[0] * (q[1] * r[2] - q[2] * r[1]) +
        p[1] * (q[2] * r[0] - q[0] * r[2]) +
        p[2] * (q[0] * r[1] - q[1] * r[0])) /
      6;
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = [Math.min(start, end), Math.max(start, end)].join(',');
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++;
      edge.winding += start < end ? 1 : -1;
      edges.set(key, edge);
    }
  }
  assert(volume > 0, 'Outward-facing volume');
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'Every edge is closed');
    assert.equal(edge.winding, 0, 'Adjacent faces agree about the outside');
  }
}

test('сосны и кусты остаются замкнутыми и невырожденными при разных seed', () => {
  for (const seed of [0, 1, 1234, 3210380753]) {
    for (const kind of ['pine-tall', 'pine-wide', 'pine-young']) {
      const model = pineGeometry(kind, 2.3, 4.7, seed);
      checkClosedMesh(model);
      assert(model.f.length < 300);
    }
    const bush = bushGeometry(2.3, 4.7, seed);
    checkClosedMesh(bush);
    assert(bush.f.length < 180);
  }
});

test('кусты воспроизводятся по позиции и сохраняют низкий широкий силуэт', () => {
  const bush = bushGeometry(2.3, 4.7, 1234);
  assert.deepEqual(bush, bushGeometry(2.3, 4.7, 1234));
  assert.notDeepEqual(bush.p, bushGeometry(2.4, 4.7, 1234).p);
  const width = Math.max(...bush.p.map((p) => p[0])) - Math.min(...bush.p.map((p) => p[0]));
  const height = Math.max(...bush.p.map((p) => p[1])) - Math.min(...bush.p.map((p) => p[1]));
  assert(height > 0.3 && height < 0.55);
  assert(width > height * 1.6);
});
