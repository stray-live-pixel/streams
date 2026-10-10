import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { buildingCells, createWorld, type Building } from '../domain/index.js';
import nature from '../../.generated/nature-models.json';
import type { Board } from './types.js';

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
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const beach = (angle: number, seed: number) => {
  const influence = Math.exp(-Math.pow(wrapAngle(angle - 1.1 - 0.1 * Math.sin(seed)) / 0.31, 2));
  return influence < 0.0001 ? 0 : influence;
};

/** Общая для береговой геометрии и прибоя кромка на уровне воды.
 * Граница доступной для строительства суши остаётся внутри, на Y=0. */
export function shorelineRadius(
  angle: number,
  seed: number,
  landRadius = createWorld(seed).coastRadius(angle),
) {
  const phase = ((seed >>> 0) / 4294967296) * Math.PI * 2;
  return landRadius + 0.44 + beach(angle, seed) * 0.28 + 0.06 * Math.sin(angle * 7 + phase);
}

// Цвета мешей сохраняются в исходных GLB. Эта палитра задаёт их прочтение
// именно в солнечной игровой сцене: хвоя насыщеннее, камень теплее и светлее.
const sceneNaturePalette = [
  [66, 111, 72],
  [83, 133, 77],
  [111, 151, 82],
  [139, 171, 91],
  [124, 87, 49],
  [153, 116, 67],
  [205, 185, 150],
  [230, 210, 172],
  [182, 171, 145],
  [153, 178, 65],
  [181, 196, 81],
  [240, 207, 88],
  [251, 232, 167],
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
      instances.push({ asset, x, y, z, scale, stretch, rotation });
  };
  // Камни идут нерегулярными группами по берегу, а не по клеткам.
  for (let i = 0; i < 100; i++) {
    const angle = (i / 100) * Math.PI * 2 + (random() - 0.5) * 0.045;
    const c = world.coastRadius(angle),
      sand = beach(angle, world.seed);
    const scale = 0.52 + random() * 0.62;
    const distance = c + (random() - 0.5) * 0.25;
    const x = 6 + Math.cos(angle) * distance,
      z = 6 + Math.sin(angle) * distance;
    if (sand < 0.55 || random() > 0.92)
      add('rock-large', x, -0.69, z, scale, 0.9 + random() * 0.55);
    if (i % 3 === 0 && sand < 0.5)
      add(
        'rock-flat',
        6 + Math.cos(angle) * (c - 0.28),
        -0.045,
        6 + Math.sin(angle) * (c - 0.28),
        0.4 + random() * 0.5,
      );
  }
  // Несколько отдельных скал в море и редкие внутренние каменные группы.
  for (let i = 0; i < 12; i++) {
    const angle = random() * Math.PI * 2,
      r = world.coastRadius(angle) + 0.75 + random() * 1.1;
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
    if (beach(angle, world.seed) > 0.4 && edgeDistance < 1.5) continue;
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
  return instances;
}

/** Земля и готовые природные меши объединяются в один статичный буфер.
 * Вода и небо имеют отдельные материалы и анимацию. */
export function environmentGeometry(board: Board, buildings: Building[]) {
  const world = createWorld(board.seed ?? 0);
  const positions: number[] = [],
    colors: number[] = [];
  function triangle(a: Point, b: Point, c: Point, color: number[]) {
    // Материалы получают исходный цвет: свет и тени рассчитывает Babylon.
    for (const point of [a, b, c]) {
      positions.push(...point);
      colors.push(...color.map((n) => Math.min(1, n / 255)), 1);
    }
  }
  function quad(a: Point, b: Point, c: Point, d: Point, color: number[]) {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  }
  const random = randomSequence(world.seed ^ 0x29e0b51);
  const segments = 96,
    rings = 14;
  const angleAt = (i: number) => ((i % segments) / segments) * Math.PI * 2;
  const groundRadius = (a: number) => world.coastRadius(a) - beach(a, world.seed) * 0.58;
  function point(i: number, fraction: number, y = 0): Point {
    const a = angleAt(i),
      radius = groundRadius(a) * fraction;
    return [6 + Math.cos(a) * radius, y, 6 + Math.sin(a) * radius];
  }
  function turf(points: Point[]) {
    const x = points.reduce((s, p) => s + p[0], 0) / 3,
      z = points.reduce((s, p) => s + p[2], 0) / 3;
    const patch = Math.sin(x * 2.8 + z * 1.4) * Math.cos(z * 2.3 - x) * 3.5 + random() * 4;
    triangle(points[0], points[1], points[2], [175 + patch, 188 + patch, 82 + patch * 0.6]);
  }
  for (let ring = 0; ring < rings; ring++)
    for (let i = 0; i < segments; i++) {
      const a = point(i, ring / rings),
        b = point(i + 1, ring / rings),
        c = point(i + 1, (ring + 1) / rings),
        d = point(i, (ring + 1) / rings);
      if (ring) turf([a, b, c]);
      turf([a, c, d]);
    }
  // Наружный скат продолжает плоскую игровую поверхность. Неровные
  // плечи и отдельные треугольники цвета земли вплетают дерн в камни,
  // вместо одинакового вертикального среза по всему периметру.
  const phase = ((world.seed >>> 0) / 4294967296) * Math.PI * 2;
  const radial = (angle: number, r: number, y: number): Point => [
    6 + Math.cos(angle) * r,
    y,
    6 + Math.sin(angle) * r,
  ];
  const shoulder = (angle: number, band: number): Point => {
    const coast = world.coastRadius(angle),
      width = shorelineRadius(angle, world.seed, coast) - coast,
      sand = beach(angle, world.seed),
      fold = Math.sin(angle * 11 + phase) * 0.5 + Math.sin(angle * 17 - phase) * 0.25;
    if (band === 0) return radial(angle, coast, 0);
    if (band === 1)
      return radial(
        angle,
        coast + width * (0.32 + fold * 0.12),
        -0.09 - (fold + 0.75) * 0.075 * (1 - sand),
      );
    if (band === 2) return radial(angle, coast + width * (0.7 + fold * 0.08), -0.39 - fold * 0.055);
    return radial(angle, coast + width, -0.74);
  };
  for (let i = 0; i < segments; i++) {
    const a = angleAt(i),
      b = angleAt(i + 1),
      sand = (beach(a, world.seed) + beach(b, world.seed)) / 2;
    const g0 = point(i, 1),
      g1 = point(i + 1, 1),
      rim0 = shoulder(a, 0),
      rim1 = shoulder(b, 0);
    // Песок в бухте также находится на Y=0: строения не повиснут над ним.
    if (sand > 0) quad(g0, g1, rim1, rim0, [230, 210, 164]);
    for (let band = 0; band < 3; band++) {
      const upper0 = shoulder(a, band),
        upper1 = shoulder(b, band),
        lower0 = shoulder(a, band + 1),
        lower1 = shoulder(b, band + 1);
      for (const points of [
        [upper0, upper1, lower1],
        [upper0, lower1, lower0],
      ]) {
        const mottling = random() * 8,
          grassTongue = (Math.sin((a + b) * 5.5 + phase) + 1) * 0.5,
          grass = sand > 0.25 ? 0 : band === 0 ? 1 : band === 1 ? grassTongue * 0.65 : 0;
        const rock = [219 + mottling, 197 + mottling * 0.7, 155 + mottling * 0.4],
          turfColor = [173 + mottling, 186 + mottling, 84 + mottling * 0.6];
        triangle(
          points[0],
          points[1],
          points[2],
          rock.map((c, j) => c * (1 - grass) + turfColor[j] * grass),
        );
      }
    }
  }
  const layout = environmentLayout(board, buildings);
  for (const instance of layout) {
    const { asset, x, y, z, scale, stretch, rotation } = instance;
    const model = nature[asset],
      co = Math.cos(rotation),
      si = Math.sin(rotation);
    const points: Point[] = model.p.map(([px, py, pz]) => [
      x + (px * co - pz * si) * scale,
      y + py * scale * stretch,
      z + (px * si + pz * co) * scale,
    ]);
    for (const f of model.f)
      triangle(points[f[0]], points[f[1]], points[f[2]], sceneNaturePalette[f[3]] ?? model.c[f[3]]);
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
  data.normals = [];
  VertexData.ComputeNormals(positions, data.indices, data.normals, { useRightHandedSystem: true });
  return data;
}
