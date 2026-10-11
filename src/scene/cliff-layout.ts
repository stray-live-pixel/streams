import { buildingCells, createWorld, type Building } from '../domain/index.js';
import { terrainContourPoints, terrainHeight } from './terrain.js';
import { cliffRockGeometry, type CliffSpec } from './cliffs.js';

export const COAST_SEGMENTS = 192;

import { beachInfluence, coastalElevation } from './coast-height.js';
export { beachInfluence } from './coast-height.js';

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function portClear(x: number, z: number, seed: number, buildings: Building[]) {
  const world = createWorld(seed);
  return buildings
    .filter((b) => b.t === 'port')
    .every((port) => {
      const [dx, dz] = world.shoreDirection(port.x, port.z) ?? [0, 1];
      const rx = x - port.x - 0.5,
        rz = z - port.z - 0.5;
      return rx * dx + rz * dz < -0.75 || Math.abs(rx * dz - rz * dx) > 2.35;
    });
}

/** Перекрывающиеся глыбы образуют сам берег, верх травы не выдвигается над ними полками. */
export function coastalCliffs(seed: number, buildings: Building[] = []): CliffSpec[] {
  const world = createWorld(seed),
    next = random(seed ^ 0x1a73bd5);
  const result: CliffSpec[] = [];
  for (let i = 0; i < 44; i++) {
    const angle = ((i + (next() - 0.5) * 0.86) / 44) * Math.PI * 2;
    const radius = world.coastRadius(angle) - (0.12 + next() * 0.22);
    const x = 6 + Math.cos(angle) * radius,
      z = 6 + Math.sin(angle) * radius;
    const width = 0.7 + next() * 1.0,
      depth = 0.95 + next() * 0.7;
    // Внутренняя корона под дёрном, наружная скошена к воде.
    // Плоская крышка не подпирает траву широким нависающим козырьком.
    const top = -0.002;
    const bottom = -1.08 - next() * 0.24;
    const shoulderHeight = 0.29 + next() * 0.42;
    const crownScale = 0.66 + next() * 0.24;
    const lean = 0.01 + next() * 0.04;
    const rotation = angle + Math.PI / 2 + (next() - 0.5) * 0.65;
    if (beachInfluence(angle, seed) > 0.18 || !portClear(x, z, seed, buildings)) continue;
    result.push({
      x,
      z,
      width,
      depth,
      top,
      bottom,
      shoulderHeight,
      profile: 'layered',
      elevation: (px, pz) => coastalElevation(px, pz, seed, buildings),
      crownSlope: 0.16 + 0.06 * Math.sin(i * 2.3),
      crownScale,
      lean,
      rotation,
      seed: seed ^ (i * 5347 + 17),
    });
  }
  return result;
}

/** Те же объёмные глыбы подпирают высокие борта плато, оставляя пологие проходы. */
export function uplandCliffs(seed: number, buildings: Building[] = []): CliffSpec[] {
  const contours = terrainContourPoints(seed),
    result: CliffSpec[] = [];
  const occupied = buildings.flatMap(buildingCells);
  for (let hill = 0; hill < 2; hill++) {
    for (let i = 0; i < 32; i += 2) {
      const offset = hill * 32 * 7 + i * 7;
      const outer = contours[offset],
        inner = contours[offset + 5];
      const dx = outer[0] - inner[0],
        dz = outer[1] - inner[1];
      const run = Math.hypot(dx, dz);
      const bottom = terrainHeight(...outer, seed, buildings) - 0.13;
      const top = terrainHeight(...inner, seed, buildings) - 0.035;
      // Длинный подъём остаётся травяным; скальные стенки получают отдельные плечи и сколы.
      if ((top - bottom) / run < 1.7) continue;
      const inset = 0.88 + Math.sin(i * 2.7 + seed) * 0.08;
      const x = outer[0] * (1 - inset) + inner[0] * inset;
      const z = outer[1] * (1 - inset) + inner[1] * inset;
      if (
        occupied.some(
          (cell) => x > cell.x - 0.2 && x < cell.x + 1.2 && z > cell.z - 0.2 && z < cell.z + 1.2,
        )
      )
        continue;
      const neighbor = contours[hill * 32 * 7 + ((i + 2) % 32) * 7];
      const width = Math.max(
        0.68,
        Math.hypot(neighbor[0] - outer[0], neighbor[1] - outer[1]) * 1.35,
      );
      result.push({
        // Корона уходит под ровную часть плато; наружу остаётся скальный бок.
        x: x - Math.sin(Math.atan2(dz, dx) + Math.PI / 2) * 0.4,
        z: z + Math.cos(Math.atan2(dz, dx) + Math.PI / 2) * 0.4,
        width,
        depth: run + 0.58,
        top,
        ceiling: (px, pz) => terrainHeight(px, pz, seed, buildings) - 0.005,
        crownScale: 0.57 + ((i * 7 + hill) % 5) * 0.045,
        shoulderHeight: 0.3 + ((i * 11 + hill) % 7) * 0.06,
        lean: 0.13,
        bottom,
        rotation: Math.atan2(dz, dx) + Math.PI / 2,
        seed: seed ^ (hill * 5707 + i * 3253 + 887),
      });
      // Низкие передние глыбы разбивают сплошной пояс на группы разных высот.
      if (i % 6 === 0) {
        const rise = top - bottom;
        result.push({
          x: x + (dx / run) * 0.24,
          z: z + (dz / run) * 0.24,
          width: width * 0.74,
          depth: (run + 0.47) * 0.8,
          bottom: bottom - 0.06,
          top: bottom + rise * 0.62,
          crownSlope: rise * 0.18,
          rotation: Math.atan2(dz, dx) + Math.PI / 2 + 0.17,
          seed: seed ^ (hill * 6703 + i * 3253 + 191),
        });
      }
    }
  }
  return result;
}

type Section = [number, number, number, number];
type CliffContours = { land: Float64Array; water: Float64Array; bands: Float64Array[] };
const contourCache = new Map<string, CliffContours>();
const CONTOUR_SEGMENTS = 768;

/** Пересечение треугольников с горизонтальной плоскостью. Один mesh используется
 * для уровня травы и ватерлинии, поэтому контуры не расходятся с геометрией. */
function horizontalSection(
  positions: number[],
  level: number,
  elevation?: (x: number, z: number) => number,
): Section[] {
  const segments: Section[] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const cut: [number, number][] = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = i + edge * 3;
      const b = i + ((edge + 1) % 3) * 3;
      const ay = positions[a + 1] - (elevation?.(positions[a], positions[a + 2]) ?? 0);
      const by = positions[b + 1] - (elevation?.(positions[b], positions[b + 2]) ?? 0);
      if (ay < level === by < level) continue;
      const t = (level - ay) / (by - ay);
      cut.push([
        positions[a] + (positions[b] - positions[a]) * t - 6,
        positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t - 6,
      ]);
    }
    if (cut.length === 2) segments.push([...cut[0], ...cut[1]]);
  }
  return segments;
}

function outerSectionRadius(angle: number, segments: Section[]) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  let radius = -Infinity;
  for (const [ax, az, bx, bz] of segments) {
    const denominator = dx * (bz - az) - dz * (bx - ax);
    if (Math.abs(denominator) < 1e-10) continue;
    const t = (ax * bz - az * bx) / denominator;
    const u = (ax * dz - az * dx) / denominator;
    if (t > 0 && u >= 0 && u <= 1) radius = Math.max(radius, t);
  }
  return radius;
}

function cliffContours(seed: number, buildings: Building[]): CliffContours {
  const key = `${seed}:${buildings
    .filter((b) => b.t === 'port')
    .map((b) => `${b.x},${b.z}`)
    .sort()
    .join(';')}`;
  let contours = contourCache.get(key);
  if (!contours) {
    const world = createWorld(seed);
    const levels = [-0.008, -0.22, -0.47, -0.68, -1.15];
    const sections: Section[][] = levels.map(() => []);
    for (const spec of coastalCliffs(seed, buildings)) {
      const mesh = cliffRockGeometry(spec);
      levels.forEach((height, band) => {
        sections[band].push(
          ...horizontalSection(
            mesh.positions,
            height,
            band === 0 ? (x, z) => coastalElevation(x, z, seed, buildings) : undefined,
          ),
        );
      });
    }
    contours = {
      land: new Float64Array(CONTOUR_SEGMENTS),
      water: new Float64Array(CONTOUR_SEGMENTS),
      bands: levels.map(() => new Float64Array(CONTOUR_SEGMENTS)),
    };
    for (let i = 0; i < CONTOUR_SEGMENTS; i++) {
      const theta = (i / CONTOUR_SEGMENTS) * Math.PI * 2;
      const coast = world.coastRadius(theta);
      const landCut = outerSectionRadius(theta, sections[0]);
      const sand = beachInfluence(theta, seed);
      // Дёрн следует верхнему сечению скошенной короны. Малый отступ
      // оставляет каменный скос снаружи и убирает зелёные козырьки.
      // Во впадинах край отступает внутрь, пляжи сохраняют свой контур.
      const land = Number.isFinite(landCut) ? landCut - 0.045 : coast - 0.3;
      const blend = Math.max(0, Math.min(1, sand / 0.18));
      const beachBlend = blend * blend * (3 - 2 * blend);
      contours.land[i] = land * (1 - beachBlend) + coast * beachBlend;
      // Each height follows the actual boulder section instead of extruding
      // the grass outline. Broad shoulders and recessed joints now have depth.
      // The bounded offset keeps the mass upright rather than splaying sideways.
      for (let band = 0; band < levels.length; band++) {
        const cut = outerSectionRadius(theta, sections[band]);
        const offset = Number.isFinite(cut) ? Math.max(-0.16, Math.min(0.42, cut - land)) : -0.1;
        // The continuous inner shell closes joints; individual boulder meshes
        // form the visible faces. Recess it so it cannot flicker over them.
        const recess = band === 0 || band === 3 ? 0 : 0.1;
        const rock = band === 0 ? land : land + offset - recess;
        const beach = coast + [0, 0.34, 0.7, 1, 2.1][band] * 1.29;
        contours.bands[band][i] = rock * (1 - beachBlend) + beach * beachBlend;
      }
      contours.bands[0][i] = contours.land[i];
      const waterCut = outerSectionRadius(theta, sections[3]);
      if (Number.isFinite(waterCut)) {
        contours.bands[3][i] = Math.max(contours.bands[3][i], waterCut + 0.015);
      }
      contours.water[i] = contours.bands[3][i];
    }
    if (contourCache.size >= 8) contourCache.delete(contourCache.keys().next().value!);
    contourCache.set(key, contours);
  }
  return contours;
}

/** Земля, камень и пена используют одну ломаную из 192 рёбер.
 * Интерполяция радиуса сглаживала бы углы и открывала узкие зазоры. */
function sampleContour(angle: number, radii: Float64Array) {
  const count = COAST_SEGMENTS;
  const step = (Math.PI * 2) / count;
  const wrapped = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor(wrapped / step);
  const anchor = (i: number) => {
    const a = (i % count) * step;
    const r = radii[(i % count) * (CONTOUR_SEGMENTS / count)];
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const [ax, az] = anchor(index),
    [bx, bz] = anchor(index + 1);
  return (ax * bz - az * bx) / (Math.cos(wrapped) * (bz - az) - Math.sin(wrapped) * (bx - ax));
}

/** Реальная ватерлиния общего скального бока и песчаных бухт. */
export function cliffShorelineRadius(angle: number, seed: number, buildings: Building[] = []) {
  return sampleContour(angle, cliffContours(seed, buildings).water);
}

/** Общая кромка верхней земли и отвесного скального бока. */
export function cliffLandRadius(angle: number, seed: number, buildings: Building[] = []) {
  return sampleContour(angle, cliffContours(seed, buildings).land);
}

/** Пять поперечных уровней берега: скалы почти отвесны, пляжи пологи. */
export function coastSection(
  angle: number,
  band: number,
  seed: number,
  buildings: Building[] = [],
): [number, number] {
  const contours = cliffContours(seed, buildings);
  const depth = [0, -0.22, -0.47, -0.68, -1.15][band];
  const radius = sampleContour(angle, contours.bands[band]);
  const rise = coastalElevation(
    6 + Math.cos(angle) * radius,
    6 + Math.sin(angle) * radius,
    seed,
    buildings,
  );
  return [radius, depth + rise * [1, 0, 0, 0, 0][band]];
}
