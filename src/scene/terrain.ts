import { buildingCells, createWorld, type Building } from '../domain/index.js';
import { beachInfluence, beachInset, coastalElevation } from './coast-height.js';

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

type ReliefHill = {
  x: number;
  z: number;
  sx: number;
  sz: number;
  height: number;
  ramp: number;
  phase: number;
};
const profileSteps = [
  [0, 0],
  [0.18, 0.025],
  [0.31, 0.12],
  [0.46, 0.48],
  [0.6, 0.88],
  [0.8, 0.99],
  [1, 1],
];
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function reliefHills(seed: number): ReliefHill[] {
  const phase = ((seed >>> 0) / 4294967296) * Math.PI * 2;
  return [
    {
      x: 3.25 + Math.sin(phase) * 0.3,
      z: 3.65,
      sx: 1.85 * 1.12,
      sz: 1.85,
      height: 1.13,
      ramp: 2.7,
      phase,
    },
    {
      x: 8.8,
      z: 7.6 + Math.cos(phase) * 0.4,
      sx: 1.5,
      sz: 1.5 * 0.82,
      height: 0.66,
      ramp: 0.5,
      phase: phase + 1.7,
    },
  ];
}

// Контур состоит из широких плоских скальных граней. Его изломы общие
// для heightfield, сетки поверхности, растительности и попадания курсора.
function reliefRadius(angle: number, phase: number) {
  const step = (Math.PI * 2) / 16;
  const wrapped = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor(wrapped / step);
  const anchor = (i: number) => {
    const a = (i % 16) * step;
    // Broad unequal lobes and a shallow saddle replace the repeated oval
    // terrace. These same corners drive the hill, its rock faces and picking.
    const r =
      1 +
      0.13 * Math.sin(a * 2 + phase) +
      0.09 * Math.sin(a * 3 - phase * 0.7) +
      0.045 * Math.cos(a * 5 - phase);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const [ax, az] = anchor(index),
    [bx, bz] = anchor(index + 1);
  return (ax * bz - az * bx) / (Math.cos(wrapped) * (bz - az) - Math.sin(wrapped) * (bx - ax));
}

function reliefWidth(angle: number, hill: ReliefHill) {
  // Примерно четверть периметра — пологий травяной подъём. Остальные
  // три четверти образуют крутой срез с выступающими каменными глыбами.
  const ramp = 1 - smooth((Math.abs(wrapAngle(angle - hill.ramp)) - Math.PI / 4) / 0.16);
  return 0.24 + ramp * 0.25;
}

function reliefProfile(t: number) {
  const value = Math.max(0, Math.min(1, t));
  for (let i = 1; i < profileSteps.length; i++) {
    const [end, high] = profileSteps[i],
      [start, low] = profileSteps[i - 1];
    if (value <= end) return low + ((value - start) / (end - start)) * (high - low);
  }
  return 1;
}

/** Точки всех изломов скального профиля. Их высота вычисляется общим terrainHeight. */
export function terrainContourPoints(seed: number): [number, number][] {
  return reliefHills(seed).flatMap((hill) =>
    Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      const boundary = reliefRadius(angle, hill.phase);
      const width = reliefWidth(angle, hill);
      return profileSteps.map(([t]) => {
        const radius = boundary * (1 - t * width);
        return [
          hill.x + Math.cos(angle) * hill.sx * radius,
          hill.z + Math.sin(angle) * hill.sz * radius,
        ] as [number, number];
      });
    }).flat(),
  );
}

/** Плато с резными скальными бортами и пологими проходами между уровнями. */
function naturalHeight(x: number, z: number, seed: number) {
  const phase = ((seed >>> 0) / 4294967296) * Math.PI * 2;
  const hills = reliefHills(seed).reduce((sum, hill) => {
    const dx = (x - hill.x) / hill.sx,
      dz = (z - hill.z) / hill.sz;
    const angle = Math.atan2(dz, dx);
    const radius = Math.hypot(dx, dz) / reliefRadius(angle, hill.phase);
    const width = reliefWidth(angle, hill);
    const t = (1 - radius) / width;
    const ramp = (width - 0.24) / 0.25;
    return sum + hill.height * (reliefProfile(t) * (1 - ramp) + smooth(t) * ramp);
  }, 0);
  const rolling = 0.085 + 0.055 * Math.sin(x * 0.81 + phase) * Math.cos(z * 0.69 - phase);
  const distance = Math.hypot(x - 6, z - 6);
  const angle = Math.atan2(z - 6, x - 6);
  const coast = createWorld(seed).coastRadius(angle);
  // Fade small inland relief into the lowered cove before the sand begins.
  // Picking, buildings and decoration share this same continuous surface.
  const sandEdge = coast - beachInset(angle, seed);
  const openBeach = smooth((beachInfluence(angle, seed) - 0.72) / 0.28);
  const relief = 1 - openBeach * (1 - smooth((sandEdge - distance - 1) / 1.7));
  return (hills + rolling) * smooth((coast - distance - 0.65) / 0.95) * relief;
}

/** Одна горизонтальная площадка для всего здания, включая многоклеточные шаблоны. */
export function buildingElevation(building: Building, seed = 0) {
  if (building.t === 'port') return 0;
  const cells = buildingCells(building);
  const x = cells.reduce((sum, cell) => sum + cell.x + 0.5, 0) / cells.length;
  const z = cells.reduce((sum, cell) => sum + cell.z + 0.5, 0) / cells.length;
  return naturalHeight(x, z, seed) + coastalElevation(x, z, seed);
}

/** Общая высота для поверхности, растительности, зданий и попадания курсора.
 * Под пятном здания земля плоская; за его краем она плавно возвращается к рельефу. */
export function terrainHeight(x: number, z: number, seed = 0, buildings: Building[] = []) {
  const height = naturalHeight(x, z, seed) + coastalElevation(x, z, seed, buildings);
  let nearest = Infinity;
  let weightedHeight = 0;
  let totalWeight = 0;
  for (const building of buildings) {
    // Дороги лежат на общем рельефе: отдельное горизонтальное плато для
    // каждого сегмента разрывало бы настил на склоне.
    if (building.t === 'road') continue;
    let coreDistance = Infinity;
    let distance = Infinity;
    for (const cell of buildingCells(building)) {
      const dx = Math.max(cell.x - 0.13 - x, 0, x - cell.x - 1.13);
      const dz = Math.max(cell.z - 0.13 - z, 0, z - cell.z - 1.13);
      distance = Math.min(distance, Math.hypot(dx, dz));
      // Модель меньше участка. Её ровное ядро оставляет между соседними
      // площадками место для непрерывного перехода высот.
      const coreX = Math.max(cell.x + 0.14 - x, 0, x - cell.x - 0.86);
      const coreZ = Math.max(cell.z + 0.14 - z, 0, z - cell.z - 0.86);
      coreDistance = Math.min(coreDistance, Math.hypot(coreX, coreZ));
    }
    if (distance >= 0.85) continue;
    const target = buildingElevation(building, seed);
    if (coreDistance < 1e-9) return target;
    nearest = Math.min(nearest, distance);
    // Вес стремится к бесконечности у ровного ядра и плавно исчезает
    // снаружи площадки. Поэтому смена ближайшего здания не даёт скачка.
    const weight = (1 - smooth(distance / 0.85)) / (coreDistance * coreDistance);
    weightedHeight += target * weight;
    totalWeight += weight;
  }
  return totalWeight > 0
    ? height + (weightedHeight / totalWeight - height) * (1 - smooth(nearest / 0.85))
    : height;
}
