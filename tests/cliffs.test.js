import test from 'node:test';
import assert from 'node:assert/strict';
import { coastalCliffs, uplandCliffs } from '../src/scene/cliff-layout.ts';
import { terrainHeight } from '../src/scene/terrain.ts';
import { cliffRockGeometry } from '../src/scene/cliffs.ts';
import { coastalElevation } from '../src/scene/coast-height.ts';

const spec = {
  x: 3,
  z: 4,
  bottom: -1.14,
  top: 0.18,
  width: 1.1,
  depth: 0.96,
  rotation: 0,
  seed: 42,
};

test('скальный блок замкнут, обращён наружу и имеет плоскую корону для травы', () => {
  const data = cliffRockGeometry(spec);
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < data.positions.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map((offset) => data.positions.slice(i + offset, i + offset + 3));
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    const points = [a, b, c].map((p) => p.map((n) => n.toFixed(8)).join(','));
    for (let j = 0; j < 3; j++) {
      const edge = [points[j], points[(j + 1) % 3]].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert([...edges.values()].every((count) => count === 2));
  assert(volume > 0.5 && volume < 1.4);
  const ys = data.positions.filter((_, i) => i % 3 === 1);
  assert.equal(Math.min(...ys), spec.bottom);
  assert.equal(Math.max(...ys), spec.top);
  assert(ys.filter((y) => y === spec.top).length >= 21);
  for (let i = 0; i < data.normals.length; i += 3)
    assert(Math.abs(Math.hypot(...data.normals.slice(i, i + 3)) - 1) < 1e-10);
  assert(data.colors.every((v) => v >= 0 && v <= 1));
});

test('скальные блоки воспроизводимы и сохраняют заданные габариты', () => {
  const data = cliffRockGeometry(spec);
  assert.deepEqual(cliffRockGeometry(spec), data);
  assert.notDeepEqual(cliffRockGeometry({ ...spec, seed: 43 }).positions, data.positions);
  const xs = data.positions.filter((_, i) => i % 3 === 0);
  const zs = data.positions.filter((_, i) => i % 3 === 2);
  assert(Math.abs(Math.max(...xs) - Math.min(...xs) - spec.width) < 1e-10);
  assert(Math.abs(Math.max(...zs) - Math.min(...zs) - spec.depth) < 1e-10);
  const rotated = cliffRockGeometry({ ...spec, rotation: 1.2 });
  assert(rotated.positions.every(Number.isFinite));
  assert.throws(() => cliffRockGeometry({ ...spec, top: spec.bottom }), RangeError);
});

test('наружная корона опускается к воде, а внутренняя остаётся на уровне травы', () => {
  const crownSlope = 0.48;
  const data = cliffRockGeometry({ ...spec, crownSlope });
  const cap = data.positions.slice(-7 * 9);
  let front = 0;
  let rear = 0;
  for (let i = 0; i < cap.length; i += 3) {
    const y = cap[i + 1];
    const normalizedZ = (cap[i + 2] - spec.z) / spec.depth;
    const expected = spec.top - crownSlope * Math.max(0, Math.min(1, -normalizedZ * 2));
    assert(Math.abs(y - expected) < 1e-10);
    if (normalizedZ >= 0) {
      assert.equal(y, spec.top);
      rear++;
    } else {
      assert(y < spec.top && y >= spec.top - crownSlope);
      front++;
    }
  }
  assert(front > 0 && rear > 0);
  assert(data.normals.every(Number.isFinite));
  const edges = new Map();
  for (let i = 0; i < data.positions.length; i += 9) {
    const points = [0, 3, 6].map((offset) =>
      data.positions
        .slice(i + offset, i + offset + 3)
        .map((n) => n.toFixed(8))
        .join(','),
    );
    for (let j = 0; j < 3; j++) {
      const edge = [points[j], points[(j + 1) % 3]].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert([...edges.values()].every((count) => count === 2));
  assert.deepEqual(cliffRockGeometry({ ...spec, crownSlope: undefined }), cliffRockGeometry(spec));
  assert.throws(() => cliffRockGeometry({ ...spec, crownSlope: NaN }), RangeError);
  assert.throws(() => cliffRockGeometry({ ...spec, crownSlope: -1 }), RangeError);
});

test('короны основных береговых и нагорных глыб спрятаны под травой', () => {
  for (const seed of [0, 1, 42, 1234, 3210380753]) {
    for (const rock of coastalCliffs(seed)) {
      assert(rock.top < 0, 'Береговая корона ниже дерна');
      assert(rock.shoulderHeight >= 0.25 && rock.shoulderHeight <= 0.75);
    }
    for (const rock of uplandCliffs(seed)) {
      const cap = cliffRockGeometry(rock).positions.slice(-7 * 9);
      for (let i = 0; i < cap.length; i += 3)
        assert(
          cap[i + 1] <= terrainHeight(cap[i], cap[i + 2], seed),
          'Главная и малая глыбы не выступают над травой на склоне',
        );
    }
  }
});

test('вариации наклона и плеча сохраняют замкнутую конечную геометрию', () => {
  for (const lean of [-0.3, 0, 0.3])
    for (const shoulderHeight of [0.3, 0.5, 0.7])
      for (const crownScale of [0.6, 1, 1.15]) {
        const mesh = cliffRockGeometry({ ...spec, lean, shoulderHeight, crownScale });
        assert.equal(mesh.indices.length / 3, 42);
        assert(mesh.positions.every(Number.isFinite));
        assert(mesh.normals.every(Number.isFinite));
      }
});

test('береговые глыбы имеют четыре неровных яруса над водой и расширяются книзу', () => {
  for (const seed of [0, 1, 42, 1234, 3210380753]) {
    for (const rock of coastalCliffs(seed).slice(0, 6)) {
      const mesh = cliffRockGeometry(rock);
      assert.equal(mesh.indices.length / 3, 84);
      const edges = new Map();
      const heights = new Set();
      for (let i = 0; i < mesh.positions.length; i += 9) {
        const points = [0, 3, 6].map((o) => mesh.positions.slice(i + o, i + o + 3));
        for (let j = 0; j < 3; j++) {
          const a = points[j],
            b = points[(j + 1) % 3];
          const key = [a.join(','), b.join(',')].sort().join('|');
          edges.set(key, (edges.get(key) ?? 0) + 1);
          if (a[1] > -0.68) heights.add(a[1].toFixed(5));
        }
      }
      assert(
        [...edges.values()].every((n) => n === 2),
        'Замкнутая оболочка без разрывов',
      );
      assert(
        heights.size >= 22,
        'Плечи разных ярусов не лежат на одинаковых горизонтальных срезах',
      );
      function sectionWidth(level, p = mesh.positions) {
        const points = [];
        for (let i = 0; i < p.length; i += 9)
          for (let edge = 0; edge < 3; edge++) {
            const a = i + edge * 3,
              b = i + ((edge + 1) % 3) * 3;
            if (p[a + 1] < level === p[b + 1] < level) continue;
            const t = (level - p[a + 1]) / (p[b + 1] - p[a + 1]);
            const dx = p[a] + (p[b] - p[a]) * t - rock.x;
            const dz = p[a + 2] + (p[b + 2] - p[a + 2]) * t - rock.z;
            points.push(dx * Math.cos(rock.rotation) + dz * Math.sin(rock.rotation));
          }
        return Math.max(...points) - Math.min(...points);
      }
      const cap = mesh.positions.slice(-7 * 9);
      const narrowLevel = Math.min(...cap.filter((_, i) => i % 3 === 1)) - 0.04;
      assert(sectionWidth(-0.65) > sectionWidth(narrowLevel), 'К воде глыба становится шире');
      // Local shape must retain a visible taper even when a low beach bends
      // its crown. Absolute world-height cuts sample different local layers.
      const local = cliffRockGeometry({ ...rock, elevation: undefined }).positions;
      const localCrown = Math.min(...local.slice(-7 * 9).filter((_, i) => i % 3 === 1)) - 0.04;
      assert(sectionWidth(-0.65, local) > sectionWidth(localCrown, local) * 1.12);
      assert(mesh.positions.every(Number.isFinite));
      assert(mesh.normals.every(Number.isFinite));
    }
  }
});

test('береговые короны скошены наружу, а не образуют плоскую полку под травой', () => {
  for (const rock of coastalCliffs(123456789)) {
    const cap = cliffRockGeometry(rock).positions.slice(-7 * 9);
    const heights = cap.filter((_, i) => i % 3 === 1);
    for (let i = 0; i < cap.length; i += 3)
      assert(cap[i + 1] <= coastalElevation(cap[i], cap[i + 2], 123456789));
    assert(Math.max(...heights) - Math.min(...heights) > 0.03);
  }
});

test('глыба под неровным плато целиком остаётся под поверхностью, без торчащих плеч', () => {
  const ceiling = (x, z) => -0.18 + (x - spec.x) * 0.22 + (z - spec.z) * 0.9;
  const mesh = cliffRockGeometry({
    ...spec,
    profile: 'layered',
    crownScale: 0.84,
    top: 0.5,
    bottom: -0.5,
    ceiling,
  });
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = mesh.positions.slice(i, i + 3);
    assert(y <= ceiling(x, z) + 1e-10, 'Боковые плечи также учитывают поверхность плато');
  }
  assert(mesh.normals.every(Number.isFinite));
});
