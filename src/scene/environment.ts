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
const beach = (angle: number, seed: number) =>
  Math.exp(-Math.pow(wrapAngle(angle - 1.1 - 0.1 * Math.sin(seed)) / 0.31, 2));

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

/** Земля, вода и готовые природные меши объединяются в один статичный буфер.
 * Освещение цвета вершин не требует теневых карт или дорогого рендера. */
export function environmentGeometry(board: Board, buildings: Building[]) {
  const world = createWorld(board.seed ?? 0);
  const positions: number[] = [],
    colors: number[] = [];
  function triangle(a: Point, b: Point, c: Point, color: number[], lit = false) {
    const u = b.map((v, i) => v - a[i]),
      v = c.map((n, i) => n - a[i]);
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const length = Math.hypot(...normal) || 1;
    const light = lit
      ? 0.77 +
        0.26 * Math.max(0, (-normal[0] * 0.58 + normal[1] * 0.78 - normal[2] * 0.24) / length)
      : 1;
    for (const point of [a, b, c]) {
      positions.push(...point);
      colors.push(...color.map((n) => Math.min(1, (n / 255) * light)), 1);
    }
  }
  function quad(a: Point, b: Point, c: Point, d: Point, color: number[], lit = false) {
    triangle(a, b, c, color, lit);
    triangle(a, c, d, color, lit);
  }
  const random = randomSequence(world.seed ^ 0x29e0b51);
  // Крупные спокойные грани воды; не сетка игрового поля.
  for (let x = -55; x < 65; x += 2.6)
    for (let z = -55; z < 65; z += 2.6) {
      const tint = random() * 9;
      const a: Point = [x, -0.68, z],
        b: Point = [x + 2.6, -0.68, z],
        c: Point = [x + 2.6, -0.68, z + 2.6],
        d: Point = [x, -0.68, z + 2.6];
      triangle(a, b, c, [70 + tint, 151 + tint, 164 + tint]);
      triangle(a, c, d, [73 + tint, 154 + tint, 167 + tint]);
    }
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
    triangle(points[0], points[1], points[2], [167 + patch, 179 + patch, 91 + patch * 0.6]);
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
  // Уступ под травой, светлый каменный берег и песчаная бухта.
  for (let i = 0; i < segments; i++) {
    const a = angleAt(i),
      b = angleAt(i + 1),
      sandA = beach(a, world.seed),
      sandB = beach(b, world.seed),
      sand = (sandA + sandB) / 2;
    const radial = (angle: number, r: number, y: number): Point => [
      6 + Math.cos(angle) * r,
      y,
      6 + Math.sin(angle) * r,
    ];
    const g0 = point(i, 1),
      g1 = point(i + 1, 1);
    // Вся разрешённая для строительства суша, включая песок, имеет Y=0.
    // Склон начинается за контуром: дом и трава не повиснут над пляжем.
    const rim0 = radial(a, world.coastRadius(a), 0),
      rim1 = radial(b, world.coastRadius(b), 0);
    quad(g0, g1, rim1, rim0, [221, 204, 160]);
    const e0 = radial(a, world.coastRadius(a) + 0.06, -0.12),
      e1 = radial(b, world.coastRadius(b) + 0.06, -0.12);
    quad(rim0, rim1, e1, e0, sand > 0.12 ? [217, 199, 154] : [145, 156, 76]);
    const bottom0 = radial(a, world.coastRadius(a) + 0.24 + sandA * 0.32, -0.67),
      bottom1 = radial(b, world.coastRadius(b) + 0.24 + sandB * 0.32, -0.67);
    quad(
      e0,
      e1,
      bottom1,
      bottom0,
      sand > 0.35 ? [223, 204, 157] : [174 + random() * 12, 164 + random() * 10, 141],
      sand <= 0.35,
    );
    const shallow0 = radial(a, world.coastRadius(a) + 0.52 + sandA * 0.32, -0.674),
      shallow1 = radial(b, world.coastRadius(b) + 0.52 + sandB * 0.32, -0.674);
    quad(bottom0, bottom1, shallow1, shallow0, [105, 180, 183]);
    // Линия пены прерывистая и повторяет контур берега.
    if (i % 7 !== 0) {
      const foam0 = radial(a, world.coastRadius(a) + 0.36 + sandA * 0.32, -0.666),
        foam1 = radial(b, world.coastRadius(b) + 0.36 + sandB * 0.32, -0.666);
      const outer0 = radial(a, world.coastRadius(a) + 0.39 + sandA * 0.32, -0.665),
        outer1 = radial(b, world.coastRadius(b) + 0.39 + sandB * 0.32, -0.665);
      quad(foam0, foam1, outer1, outer0, [193, 224, 204]);
    }
  }
  const layout = environmentLayout(board, buildings);
  function ellipse(x: number, y: number, z: number, rx: number, rz: number, color: number[]) {
    const center: Point = [x, y, z];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2,
        b = ((i + 1) / 12) * Math.PI * 2;
      triangle(
        center,
        [x + Math.cos(a) * rx, y, z + Math.sin(a) * rz],
        [x + Math.cos(b) * rx, y, z + Math.sin(b) * rz],
        color,
      );
    }
  }
  for (const instance of layout) {
    const { asset, x, y, z, scale, stretch, rotation } = instance;
    const model = nature[asset],
      co = Math.cos(rotation),
      si = Math.sin(rotation);
    if (asset.startsWith('pine') || asset === 'bush') {
      ellipse(
        x + scale * 0.18,
        0.004,
        z + scale * 0.07,
        scale * 0.45,
        scale * 0.33,
        [141, 157, 78],
      );
      ellipse(
        x + scale * 0.07,
        0.007,
        z + scale * 0.03,
        scale * 0.23,
        scale * 0.18,
        [130, 147, 73],
      );
    }
    if (y < -0.2) {
      ellipse(x, -0.672, z, scale * 0.65, scale * 0.56, [100, 175, 179]);
      // Пена вокруг выступающих из воды отдельных камней.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2,
          b = ((i + 0.65) / 10) * Math.PI * 2;
        quad(
          [x + Math.cos(a) * scale * 0.65, -0.665, z + Math.sin(a) * scale * 0.56],
          [x + Math.cos(b) * scale * 0.65, -0.665, z + Math.sin(b) * scale * 0.56],
          [x + Math.cos(b) * scale * 0.67, -0.665, z + Math.sin(b) * scale * 0.58],
          [x + Math.cos(a) * scale * 0.67, -0.665, z + Math.sin(a) * scale * 0.58],
          [192, 225, 211],
        );
      }
    }
    const points: Point[] = model.p.map(([px, py, pz]) => [
      x + (px * co - pz * si) * scale,
      y + py * scale * stretch,
      z + (px * si + pz * co) * scale,
    ]);
    for (const f of model.f)
      triangle(points[f[0]], points[f[1]], points[f[2]], model.c[f[3]], true);
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = Array.from({ length: positions.length / 3 }, (_, i) => i);
  data.normals = [];
  VertexData.ComputeNormals(positions, data.indices, data.normals);
  return data;
}
