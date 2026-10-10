import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { buildingCells, createWorld, type Building } from '../domain/index.js';
import nature from '../../.generated/nature-models.json';
import type { Board } from './types.js';
import { terrainContourPoints, terrainHeight } from './terrain.js';
import {
  beachInfluence,
  coastSection,
  COAST_SEGMENTS,
  uplandCliffs,
  coastalCliffs,
  cliffShorelineRadius,
  cliffLandRadius,
} from './cliff-layout.js';
import { cliffRockGeometry } from './cliffs.js';
import { grassPigment, rockPigment } from './surface-color.js';
export { beachInfluence } from './cliff-layout.js';

type Point = [number, number, number];
type NatureId = keyof typeof nature;
export interface NatureInstance {
  asset: NatureId;
  x: number;
  y: number;
  z: number;
  scale: number;
  stretch: number;
  rotation: number;
}

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
/** Общий контур прибоя по реальному сечению скальных глыб. */
export function shorelineRadius(
  angle: number,
  seed: number,
  _landRadius?: number,
  buildings: Building[] = [],
) {
  return cliffShorelineRadius(angle, seed, buildings);
}

// Цвета мешей сохраняются в исходных GLB. Эта палитра задаёт их прочтение
// именно в солнечной игровой сцене: хвоя насыщеннее, камень теплее и светлее.
const sceneNaturePalette = [
  [76, 126, 60],
  [105, 153, 66],
  [139, 178, 77],
  [167, 194, 93],
  [145, 91, 43],
  [181, 125, 62],
  [224, 198, 152],
  [245, 222, 179],
  [200, 185, 147],
  [166, 191, 66],
  [198, 210, 87],
  [253, 209, 73],
  [255, 239, 171],
];

/** Одинаковый seed даёт те же экземпляры. Здания только расчищают своё место:
 * новая постройка не перемешивает лес на другом конце острова. */
export function environmentLayout(board: Board, buildings: Building[]): NatureInstance[] {
  const world = createWorld(board.seed ?? 0);
  const random = randomSequence((board.seed ?? 0) ^ 0x51a7c03);
  const instances: NatureInstance[] = [];
  const occupied = buildings.flatMap(buildingCells);
  const ports = buildings.filter((b) => b.t === 'port');
  const clear = (x: number, z: number, radius: number) => {
    if (
      occupied.some(
        (b) =>
          Math.hypot(x - clamp(x, b.x - 0.12, b.x + 1.12), z - clamp(z, b.z - 0.12, b.z + 1.12)) <
          radius,
      )
    )
      return false;
    // Проход и акватория выбранного причала остаются свободными от скал.
    return ports.every((p) => {
      const [dx, dz] = board.shoreDirection(p.x, p.z) ?? [0, 1];
      const rx = x - p.x - 0.5,
        rz = z - p.z - 0.5;
      const outward = rx * dx + rz * dz,
        side = rx * dz - rz * dx;
      return !(outward > -0.7 && outward < 6 && Math.abs(side) < 2.05 + radius);
    });
  };
  const add = (asset: NatureId, x: number, y: number, z: number, scale: number, stretch = 1) => {
    const rotation = random() * Math.PI * 2;
    if (clear(x, z, asset.startsWith('pine') ? scale * 0.38 : scale * 0.22))
      instances.push({
        asset,
        x,
        y: y > -0.1 ? y + terrainHeight(x, z, world.seed, buildings) : y,
        z,
        scale,
        stretch,
        rotation,
      });
  };
  // Камни идут нерегулярными группами по берегу, а не по клеткам.
  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * Math.PI * 2 + (random() - 0.5) * 0.045;
    const c = world.coastRadius(angle),
      sand = beachInfluence(angle, world.seed);
    const scale = 0.52 + random() * 0.62;
    const distance = c + (random() - 0.5) * 0.25;
    const x = 6 + Math.cos(angle) * distance,
      z = 6 + Math.sin(angle) * distance;
    if (sand < 0.28) add('rock-large', x, -0.69, z, scale, 0.9 + random() * 0.55);
    if (i % 3 === 0 && sand < 0.28)
      add(
        'rock-flat',
        6 + Math.cos(angle) * (c - 0.28),
        -0.045,
        6 + Math.sin(angle) * (c - 0.28),
        0.4 + random() * 0.5,
      );
  }
  // Сохраняем последовательность случайных чисел старого декора, чтобы
  // деревья не переезжали при замене береговой геометрии на цельные глыбы.
  instances.length = 0;
  // Несколько отдельных скал в море и редкие внутренние каменные группы.
  for (let i = 0; i < 12; i++) {
    const angle = random() * Math.PI * 2,
      r = world.coastRadius(angle) + 0.75 + random() * 1.1;
    if (beachInfluence(angle, world.seed) > 0.28) continue;
    add(
      'rock-large',
      6 + Math.cos(angle) * r,
      -0.7,
      6 + Math.sin(angle) * r,
      0.45 + random() * 0.6,
      0.8,
    );
  }
  const groveCenters = [
    [3.0, 3.8],
    [8.6, 6.3],
    [5.4, 9.6],
  ];
  const trees: { x: number; z: number }[] = [];
  for (let i = 0; i < 450; i++) {
    const x = 0.4 + random() * 11.2,
      z = 0.4 + random() * 11.2;
    const angle = Math.atan2(z - 6, x - 6);
    const edgeDistance = world.coastRadius(angle) - Math.hypot(x - 6, z - 6);
    const grove = groveCenters.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 0.78);
    if (!world.contains(x, z, 0.55) || (!grove && (edgeDistance > 1.35 || i % 3 !== 0))) continue;
    if (beachInfluence(angle, world.seed) > 0.4 && edgeDistance < 1.5) continue;
    if (trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 0.68)) continue;
    trees.push({ x, z });
    const young = random() > 0.73;
    add(
      young ? 'pine-young' : random() > 0.55 ? 'pine-wide' : 'pine-tall',
      x,
      0.018,
      z,
      0.78 + random() * 0.32,
    );
    if (i % 2 === 0) add('bush', x + 0.4, 0.015, z + 0.3, 0.65 + random() * 0.5);
  }
  for (let i = 0; i < 720; i++) {
    const x = random() * 12,
      z = random() * 12;
    const angle = Math.atan2(z - 6, x - 6);
    const distance = world.coastRadius(angle) - Math.hypot(x - 6, z - 6);
    if (!world.contains(x, z, 0.22)) continue;
    const nearTree = trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 0.9);
    // Центральная поляна свободна; мелкая растительность группируется у края и деревьев.
    if (!nearTree && distance > 1.3 && i % 11 !== 0) continue;
    const roll = random();
    add(
      roll < 0.08 ? 'rock-small' : roll < 0.19 ? 'bush' : roll < 0.48 ? 'flowers' : 'grass',
      x,
      0.012,
      z,
      0.55 + random() * 0.65,
    );
  }
  for (const [x, z] of [
    [8.7, 6.65],
    [2.8, 4.1],
  ]) {
    add('rock-large', x, -0.025, z, 0.65);
    add('rock-small', x + 0.43, 0, z + 0.25, 0.8);
    add('bush', x - 0.45, 0.01, z + 0.25, 0.8);
  }
  // Низкие валуны у основания собирают отдельные скальные группы,
  // а не повторяют один ряд одинаковых верхних камней.
  const talusRandom = randomSequence(world.seed ^ 0x541ea);
  for (let i = 0; i < 22; i++) {
    const angle = ((i + talusRandom() * 0.65) / 22) * Math.PI * 2;
    if (beachInfluence(angle, world.seed) > 0.12) continue;
    const radius = world.coastRadius(angle) + 0.68 + talusRandom() * 0.25;
    add(
      'rock-large',
      6 + Math.cos(angle) * radius,
      -1.03,
      6 + Math.sin(angle) * radius,
      0.76 + talusRandom() * 0.34,
      0.76 + talusRandom() * 0.14,
    );
  }
  return instances;
}

/** Нерегулярная сетка с закреплённым внешним контуром.
 * Удалять треугольники обычной Delaunay-сетки по центру недостаточно:
 * в вогнутых бухтах это оставляет щели между землёй и скалами. */
function triangulate(points: Point[], boundaryCount: number): [number, number, number][] {
  type Face = [number, number, number];
  const cross = (a: number, b: number, c: number) =>
    (points[b][0] - points[a][0]) * (points[c][2] - points[a][2]) -
    (points[b][2] - points[a][2]) * (points[c][0] - points[a][0]);
  const face = (a: number, b: number, c: number): Face =>
    cross(a, b, c) >= 0 ? [a, b, c] : [b, a, c];
  const inside = (a: number, b: number, c: number, p: number) =>
    cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  const polygon = Array.from({ length: boundaryCount }, (_, index) => index);
  const triangles: Face[] = [];
  while (polygon.length > 3) {
    let removed = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[(i + polygon.length - 1) % polygon.length];
      const b = polygon[i],
        c = polygon[(i + 1) % polygon.length];
      if (cross(a, b, c) <= 1e-9) continue;
      if (polygon.some((p) => p !== a && p !== b && p !== c && inside(a, b, c, p))) continue;
      triangles.push([a, b, c]);
      polygon.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) break;
  }
  for (let i = 1; i + 1 < polygon.length; i++)
    triangles.push(face(polygon[0], polygon[i], polygon[i + 1]));
  for (let index = boundaryCount; index < points.length; index++) {
    const found = triangles.findIndex(([a, b, c]) => inside(a, b, c, index));
    if (found < 0) continue;
    const [a, b, c] = triangles[found];
    triangles.splice(found, 1, face(a, b, index), face(b, c, index), face(c, a, index));
  }
  function inCircle(triangle: Face, p: number[]) {
    const [a, b, c] = triangle.map((index) => points[index]);
    const ax = a[0] - p[0],
      ay = a[2] - p[2],
      bx = b[0] - p[0],
      by = b[2] - p[2];
    const cx = c[0] - p[0],
      cy = c[2] - p[2];
    return (
      (ax * ax + ay * ay) * (bx * cy - by * cx) -
        (bx * bx + by * by) * (ax * cy - ay * cx) +
        (cx * cx + cy * cy) * (ax * by - ay * bx) >
      1e-8
    );
  }
  // Локальные перевороты сокращают вытянутые грани, сохраняя все береговые рёбра.
  for (let pass = 0; pass < 30; pass++) {
    const edges = new Map<string, { triangle: number; a: number; b: number; opposite: number }>();
    const changed = new Set<number>();
    for (let index = 0; index < triangles.length; index++) {
      if (changed.has(index)) continue;
      const t = triangles[index];
      for (let j = 0; j < 3; j++) {
        const a = t[j],
          b = t[(j + 1) % 3],
          c = t[(j + 2) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const other = edges.get(key);
        if (!other) {
          edges.set(key, { triangle: index, a, b, opposite: c });
          continue;
        }
        if (changed.has(other.triangle)) continue;
        const d = other.opposite;
        if (cross(c, d, a) * cross(c, d, b) >= -1e-9 || !inCircle(t, points[d])) continue;
        triangles[index] = face(c, d, a);
        triangles[other.triangle] = face(d, c, b);
        changed.add(index);
        changed.add(other.triangle);
        break;
      }
    }
    if (!changed.size) break;
  }
  return triangles.filter(([a, b, c]) => cross(a, b, c) > 1e-9);
}

/** Земля и готовые природные меши объединяются в один статичный буфер.
 * Вода и небо имеют отдельные материалы и анимацию. */
export function environmentGeometry(board: Board, buildings: Building[], spread = 1) {
  const world = createWorld(board.seed ?? 0);
  const positions: number[] = [],
    colors: number[] = [];
  function triangle(a: Point, b: Point, c: Point, color: number[], stone = false) {
    // Материалы получают исходный цвет: свет и тени рассчитывает Babylon.
    for (const point of [a, b, c]) {
      positions.push(6 + (point[0] - 6) * spread, point[1], 6 + (point[2] - 6) * spread);
      const pigment = stone ? rockPigment(...point, color) : color;
      colors.push(...pigment.map((n) => Math.min(1, n / 255)), 1);
    }
  }
  const random = randomSequence(world.seed ^ 0x29e0b51);
  const segments = COAST_SEGMENTS;
  const angleAt = (i: number) => ((i % segments) / segments) * Math.PI * 2;
  const boundary: Point[] = Array.from({ length: segments }, (_, i) => {
    const angle = angleAt(i),
      radius = cliffLandRadius(angle, world.seed, buildings);
    const x = 6 + Math.cos(angle) * radius,
      z = 6 + Math.sin(angle) * radius;
    return [x, 0, z];
  });
  // Независимые точки по всей площади: треугольники больше не расходятся
  // лучами из центра. Береговые точки входят в ту же триангуляцию.
  const insideTurf = (x: number, z: number) =>
    Math.hypot(x - 6, z - 6) <
    cliffLandRadius(Math.atan2(z - 6, x - 6), world.seed, buildings) - 0.12;
  const contours = terrainContourPoints(world.seed).filter(
    ([x, z]) => world.contains(x, z, 0.2) && insideTurf(x, z),
  );
  const groundPoints: Point[] = [
    ...boundary,
    ...contours.map(([x, z]): Point => [x, terrainHeight(x, z, world.seed, buildings), z]),
  ];
  for (let z = -0.1; z <= 12.1; z += 0.46) {
    for (let x = -0.1; x <= 12.1; x += 0.46) {
      const px = x + (random() - 0.5) * 0.29;
      const pz = z + (random() - 0.5) * 0.29;
      if (
        world.contains(px, pz, 0.2) &&
        insideTurf(px, pz) &&
        !contours.some(([x, z]) => Math.hypot(x - px, z - pz) < 0.12)
      )
        groundPoints.push([px, terrainHeight(px, pz, world.seed, buildings), pz]);
    }
  }
  for (const indices of triangulate(groundPoints, segments)) {
    const points = indices.map((index) => groundPoints[index]);
    const x = points.reduce((sum, p) => sum + p[0], 0) / 3;
    const z = points.reduce((sum, p) => sum + p[2], 0) / 3;
    const u = points[1].map((v, i) => v - points[0][i]);
    const v = points[2].map((n, i) => n - points[0][i]);
    const nx = u[1] * v[2] - u[2] * v[1],
      ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const steep = Math.hypot(nx, nz) / Math.max(0.0001, Math.abs(ny));
    const variation =
      Math.sin(x * 2.18 + z * 1.63) * 3.4 + Math.cos(z * 3.17 - x * 1.43) * 2.8 + random() * 4;
    const color =
      steep > 0.95
        ? [232 + variation, 207 + variation, 158 + variation * 0.7]
        : [186 + variation, 202 + variation, 81 + variation * 0.6];
    // Bowyer-Watson даёт CCW в XZ; в правой системе вверх смотрит обратный обход.
    triangle(
      points[0],
      points[2],
      points[1],
      steep > 0.95 ? color : grassPigment(x, z, color),
      steep > 0.95,
    );
  }

  const radial = (angle: number, r: number, y: number): Point => [
    6 + Math.cos(angle) * r,
    y,
    6 + Math.sin(angle) * r,
  ];
  // Верх скального бока использует те же вершины, что и земля.
  // Это цельный край, а не отдельные клинья под нависающим дёрном.
  const ledge = (i: number, band: number): Point => {
    if (band === 0) return boundary[i % segments];
    const angle = angleAt(i);
    const [radius, height] = coastSection(angle, band, world.seed, buildings);
    return radial(angle, radius, height);
  };
  for (let i = 0; i < segments; i++) {
    const sand =
      (beachInfluence(angleAt(i), world.seed) + beachInfluence(angleAt(i + 1), world.seed)) / 2;
    for (let band = 0; band < 4; band++) {
      const a = ledge(i, band),
        b = ledge(i + 1, band);
      const c = ledge(i + 1, band + 1),
        d = ledge(i, band + 1);
      const facet = Math.sin(angleAt(i) * 9 + world.seed) * 3;
      const color = [224 + sand * 23 + facet, 198 + sand * 27 + facet, 152 + sand * 17 + facet];
      triangle(a, b, c, color, sand < 0.4);
      triangle(a, c, d, color, sand < 0.4);
    }
  }
  for (const spec of [
    ...coastalCliffs(world.seed, buildings),
    ...uplandCliffs(world.seed, buildings),
  ]) {
    const rock = cliffRockGeometry(spec);
    for (let i = 0; i < rock.positions.length; i += 9) {
      const points = [0, 3, 6].map(
        (offset) => rock.positions.slice(i + offset, i + offset + 3) as Point,
      );
      const color = rock.colors.slice((i / 3) * 4, (i / 3) * 4 + 3).map((value) => value * 255);
      triangle(points[0], points[1], points[2], color, true);
    }
  }
  const layout = environmentLayout(board, buildings);
  for (const instance of layout) {
    const { asset, x, y, z, scale, stretch, rotation } = instance;
    const model = nature[asset],
      co = Math.cos(rotation),
      si = Math.sin(rotation);
    const points: Point[] = model.p.map(([px, py, pz]) => [
      x + ((px * co - pz * si) * scale) / spread,
      // У подводных камней основание остаётся ниже самой глубокой впадины волны.
      y +
        py * scale * stretch -
        (asset.startsWith('rock') && y < -0.2 ? Math.max(0, 0.2 - py) * 1.6 : 0),
      z + ((px * si + pz * co) * scale) / spread,
    ]);
    for (const f of model.f)
      triangle(
        points[f[0]],
        points[f[1]],
        points[f[2]],
        sceneNaturePalette[f[3]] ?? model.c[f[3]],
        asset.startsWith('rock'),
      );
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
  data.normals = [];
  VertexData.ComputeNormals(positions, data.indices, data.normals, { useRightHandedSystem: true });
  return data;
}
