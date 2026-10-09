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
