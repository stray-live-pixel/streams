/**
 * География острова — чистые функции: здесь нет ни браузера, ни Babylon.js.
 * Клетка имеет размер 1 × 1; участок здания задаётся отдельной маской клеток.
 */
export const MAP_SIZE = 12;
export function isLand(x: number, z: number) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    z >= 0 &&
    x < MAP_SIZE &&
    z < MAP_SIZE &&
    !(x < 2 && z < 2) &&
    !(x > 9 && z < 2) &&
    !(x > 9 && z > 9) &&
    !(x < 2 && z > 9)
  );
}
/** Направление от причала к открытому морю или null для внутренней клетки. */
export function shoreDirection(x: number, z: number): [number, number] | null {
  if (!isLand(x, z)) return null;
  return (
    (
      [
        [0, 1],
        [1, 0],
        [-1, 0],
        [0, -1],
      ] as [number, number][]
    ).find(([dx, dz]) => !isLand(x + dx, z + dz) && !isLand(x + dx * 2, z + dz * 2)) ?? null
  );
}

/** География новой игры воспроизводится по seed; ноль сохраняет прежние города. */
export function createWorld(seed = 0) {
  const phase = ((seed >>> 0) / 4294967296) * Math.PI * 2;
  const coastRadius = (angle: number) => {
    const dx = Math.cos(angle),
      dz = Math.sin(angle);
    if (seed === 0) {
      let low = 0,
        high = 10;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2;
        if (isLand(Math.floor(6 + dx * mid), Math.floor(6 + dz * mid))) low = mid;
        else high = mid;
      }
      return low;
    }
    // Скруглённый остров, а не квадрат клеток. Низкие гармоники дают бухты;
    // небольшая амплитуда сохраняет большую связанную поляну в центре.
    const exponent = 3.4 + 0.5 * Math.sin(phase);
    const base =
      5.94 /
      Math.pow(Math.pow(Math.abs(dx), exponent) + Math.pow(Math.abs(dz), exponent), 1 / exponent);
    const ripple = 0.18 * Math.sin(angle * 5 + phase) + 0.11 * Math.cos(angle * 9 - phase * 2);
    const radius = base + ripple;
    // Южный берег имеет удобное открытое место для первого порта.
    const south = Math.max(0, 1 - Math.abs(angle - Math.PI / 2) / 0.45);
    return Math.min(
      radius * (1 - south) + 5.94 * south,
      5.98 / Math.max(Math.abs(dx), Math.abs(dz)),
    );
  };
  const contains = (x: number, z: number, margin = 0) => {
    const dx = x - 6,
      dz = z - 6;
    return Math.hypot(dx, dz) + margin <= coastRadius(Math.atan2(dz, dx));
  };
  const land =
    seed === 0
      ? isLand
      : (x: number, z: number) =>
          Number.isInteger(x) &&
          Number.isInteger(z) &&
          x >= 0 &&
          z >= 0 &&
          x < MAP_SIZE &&
          z < MAP_SIZE &&
          contains(x + 0.5, z + 0.5, 0.12);
  const shore = (x: number, z: number): [number, number] | null => {
    if (!land(x, z)) return null;
    const directions: [number, number][] = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ];
    // В новой бухте выбираем сторону открытого моря, а не скользящий вдоль берега выход.
    // Для старых сохранений оставляем прежний порядок и ориентацию причалов.
    if (seed !== 0)
      directions.sort((a, b) => (b[0] - a[0]) * (x + 0.5 - 6) + (b[1] - a[1]) * (z + 0.5 - 6));
    return (
      directions.find(([dx, dz]) => !land(x + dx, z + dz) && !land(x + 2 * dx, z + 2 * dz)) ?? null
    );
  };
  return { size: MAP_SIZE, seed, isLand: land, shoreDirection: shore, coastRadius, contains };
}
export type IslandWorld = ReturnType<typeof createWorld>;
