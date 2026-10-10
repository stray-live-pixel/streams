import { buildingCells, createWorld, type Building } from '../domain/index.js';
import { terrainContourPoints, terrainHeight } from './terrain.js';
import { cliffRockGeometry, type CliffSpec } from './cliffs.js';

export const COAST_SEGMENTS = 192;

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export function beachInfluence(angle: number, seed: number) {
  const shift = 0.1 * Math.sin(seed);
  const influence = Math.max(
    Math.exp(-Math.pow(wrapAngle(angle - 1.1 - shift) / 0.4, 4)),
    Math.exp(-Math.pow(wrapAngle(angle - 3.85 + shift) / 0.38, 4)),
  );
  return influence < 0.0001 ? 0 : influence;
}
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
    const width = 0.95 + next() * 1.5,
      depth = 1.25 + next() * 0.9;
    // Корона целиком ниже дерна. Наружу выходят только сколотые боковые
    // грани; отдельные круглые крышки камней не образуют берег.
    const top = -0.002;
    const bottom = -1.08 - next() * 0.24;
    const shoulderHeight = 0.29 + next() * 0.42;
    const crownScale = 0.98 + next() * 0.2;
    const lean = 0.02 + next() * 0.16;
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
type CliffContours = { land: Float64Array; water: Float64Array };
const contourCache = new Map<string, CliffContours>();
const CONTOUR_SEGMENTS = 768;

/** Пересечение треугольников с горизонтальной плоскостью. Один mesh используется
 * для уровня травы и ватерлинии, поэтому контуры не расходятся с геометрией. */
function horizontalSection(positions: number[], level: number): Section[] {
  const segments: Section[] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const cut: [number, number][] = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = i + edge * 3;
      const b = i + ((edge + 1) % 3) * 3;
      if (positions[a + 1] < level === positions[b + 1] < level) continue;
      const t = (level - positions[a + 1]) / (positions[b + 1] - positions[a + 1]);
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
    const landSegments: Section[] = [];
    for (const spec of coastalCliffs(seed, buildings)) {
      const mesh = cliffRockGeometry(spec);
      landSegments.push(...horizontalSection(mesh.positions, -0.008));
    }
    contours = {
      land: new Float64Array(CONTOUR_SEGMENTS),
      water: new Float64Array(CONTOUR_SEGMENTS),
    };
    for (let i = 0; i < CONTOUR_SEGMENTS; i++) {
      const theta = (i / CONTOUR_SEGMENTS) * Math.PI * 2;
      const coast = world.coastRadius(theta);
      const landCut = outerSectionRadius(theta, landSegments);
      const sand = beachInfluence(theta, seed);
      // No rock should leave a green shelf suspended over a fissure. An absent
      // section retreats slightly inland; open beaches keep their old contour.
      // Дёрн закрывает весь верх заглублённых камней и не проваливается
      // в круглые впадины между ними. Снаружи видны только скальные бока.
      const land = Number.isFinite(landCut) ? landCut + 0.015 : coast - 0.22;
      const blend = Math.max(0, Math.min(1, sand / 0.18));
      const beachBlend = blend * blend * (3 - 2 * blend);
      contours.land[i] = land * (1 - beachBlend) + coast * beachBlend;
      // Скальный бок связан с дёрном и почти отвесен: под водой он
      // расширяется всего на 5 см, а песок сохраняет пологий спуск.
      contours.water[i] = contours.land[i] + 0.051 * (1 - sand) + 1.29 * sand;
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
  const land = cliffLandRadius(angle, seed, buildings);
  const sand = beachInfluence(angle, seed);
  const progression = [0, 0.34, 0.7, 1, 1.4][band];
  const depth = [0, -0.22, -0.47, -0.68, -1.15][band];
  const variation =
    band === 1
      ? Math.sin(angle * 17 + seed) * 0.075
      : band === 2
        ? Math.cos(angle * 13 - seed) * 0.055
        : 0;
  const height = depth + variation * (1 - sand);
  // Почти вертикальное ребро; редкие неглубокие сколы не превращаются
  // в сплошные горизонтальные полки вокруг острова.
  const chip = band === 1 || band === 2 ? Math.sin(angle * 37 + seed) * 0.028 : 0;
  const rockOffset = -height * 0.075 + chip;
  return [land + rockOffset * (1 - sand) + sand * progression * 1.29, height];
}
