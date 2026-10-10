import test from 'node:test';
import assert from 'node:assert/strict';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { createWorld } from '../src/domain/index.ts';
import { daylightState, DAY_CYCLE_SECONDS } from '../src/scene/lighting.ts';
import { waterGeometry, shoreDistancePixels, WATER_LEVEL } from '../src/scene/ocean.ts';
import { environmentGeometry } from '../src/scene/environment.ts';
import { softenNormals } from '../src/scene/smoothing.ts';

test('сутки проходят полный цикл, фиксированные часы остаются постоянными', () => {
  const day = daylightState(0);
  const night = daylightState(DAY_CYCLE_SECONDS / 2);
  assert(day.daylight > 0.99 && day.sun.y > 0);
  assert.equal(night.daylight, 0);
  assert(night.sun.y < 0);
  assert.deepEqual(daylightState(DAY_CYCLE_SECONDS), day);
  for (const mode of ['dawn', 'day', 'dusk', 'night'])
    assert.deepEqual(daylightState(0, mode), daylightState(137, mode));
  assert(daylightState(0, 'dawn').sun.x > 0);
  assert(daylightState(0, 'dusk').sun.x < 0);
});

test('вода имеет крупные цветовые грани и непрерывные рёбра без щелей', () => {
  const high = waterGeometry(),
    low = waterGeometry(false);
  assert(high.indices.length > low.indices.length);
  assert.equal(high.indices.length / 3, 4608);
  assert.equal(low.indices.length / 3, 2048);
  assert.equal(high.uvs.length, (high.positions.length / 3) * 2);
  const positionKeys = new Map();
  const positionsByKey = new Map();
  for (let i = 0; i < high.positions.length / 3; i++) {
    const position = high.positions.slice(i * 3, i * 3 + 3);
    const key = position.join(':');
    positionKeys.set(i, key);
    positionsByKey.set(key, position);
  }
  const edges = new Map();
  for (let i = 0; i < high.indices.length; i += 3) {
    const [a, b, c] = high.indices.slice(i, i + 3);
    const p = high.positions;
    const area =
      (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) -
      (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
    assert(area > 0, 'Треугольники не вырождены, нормаль направлена вверх');
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = [positionKeys.get(u), positionKeys.get(v)].sort().join(',');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const length = Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 2] - p[v * 3 + 2]);
      assert(length < 2.2, 'Даже у края воды нет гигантских вытянутых треугольников');
    }
    assert.deepEqual(high.uvs.slice(a * 2, a * 2 + 2), high.uvs.slice(b * 2, b * 2 + 2));
    assert.deepEqual(high.uvs.slice(a * 2, a * 2 + 2), high.uvs.slice(c * 2, c * 2 + 2));
  }
  for (const [edge, count] of edges) {
    assert(count === 1 || count === 2);
    if (count === 1)
      for (const key of edge.split(','))
        assert(
          Math.abs(positionsByKey.get(key)[0] - 6) === 24 ||
            Math.abs(positionsByKey.get(key)[2] - 6) === 24,
          'Открытые рёбра допускаются только на внешнем периметре',
        );
  }
  assert(high.positions.every(Number.isFinite));
  assert(high.positions.filter((_, i) => i % 3 === 1).every((y) => y === WATER_LEVEL));
});

test('поле прибоя соответствует seed, затопленной суше и открытому морю', () => {
  const first = shoreDistancePixels(createWorld(1234), [], 64);
  assert.deepEqual(first, shoreDistancePixels(createWorld(1234), [], 64));
  assert.notDeepEqual(first, shoreDistancePixels(createWorld(9876), [], 64));
  assert.equal(first[0], 255);
  const center = (32 * 64 + 32) * 4;
  assert.equal(first[center], 0);
  assert.equal(first[center + 1], 255);
});

test('нормали мягко соединяют близкие грани, сохраняя прямые углы и верх земли', () => {
  const data = new VertexData();
  data.positions = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  data.normals = [0, 1, 0, 0.6, 0.8, 0, 0, 0, 1];
  softenNormals(data);
  assert(data.normals[0] > 0 && data.normals[1] > 0.8);
  assert.deepEqual(data.normals.slice(6), [0, 0, 1]);
  const land = environmentGeometry(createWorld(1234), []);
  assert(land.normals[1] > 0.9, 'Верх рельефа освещается сверху в правой системе координат');
});
