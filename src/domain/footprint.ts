import type { Building, BuildingType, Tile } from './types.js';
import { isLand } from './world.js';

export type FootprintCatalog = Record<string, Tile[]>;
export const singleCell = (): Tile[] => [{ x: 0, z: 0 }];

/** Маска до 4×4: опорная клетка обязательна, части соединены сторонами. */
export function validFootprint(value: unknown): value is Tile[] {
  if (!Array.isArray(value) || !value.length || value.length > 16) return false;
  const cells = new Set<string>();
  for (const cell of value) {
    if (
      !cell ||
      typeof cell !== 'object' ||
      !Number.isInteger(cell.x) ||
      !Number.isInteger(cell.z) ||
      cell.x < 0 ||
      cell.x > 3 ||
      cell.z < 0 ||
      cell.z > 3
    )
      return false;
    cells.add(`${cell.x},${cell.z}`);
  }
  if (cells.size !== value.length || !cells.has('0,0')) return false;
  const visited = new Set(['0,0']);
  const queue = [{ x: 0, z: 0 }];
  for (const cell of queue) {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: cell.x + dx, z: cell.z + dz },
        key = `${next.x},${next.z}`;
      if (cells.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return visited.size === cells.size;
}

export function buildingObjectId(building: Building): string {
  const variant = (building.x * 3 + building.z) % 4;
  return building.t === 'port'
    ? 'game/port'
    : `game/${building.t}/${building.t === 'house' ? variant : building.t === 'shop' ? variant % 2 : 0}`;
}
export function proposedBuilding(
  t: BuildingType,
  x: number,
  z: number,
  catalog: FootprintCatalog,
): Building {
  const building: Building = { t, x, z };
  const footprint = catalog[buildingObjectId(building)];
  if (footprint && footprint.length > 1) building.footprint = structuredClone(footprint);
  return building;
}
export function buildingCells(building: Building): Tile[] {
  return (building.footprint ?? singleCell()).map((cell) => ({
    x: building.x + cell.x,
    z: building.z + cell.z,
  }));
}
export function occupies(building: Building, x: number, z: number): boolean {
  return buildingCells(building).some((cell) => cell.x === x && cell.z === z);
}
export function placementIssue(
  building: Building,
  existing: Building[],
  land: (x: number, z: number) => boolean = isLand,
): 'water' | 'occupied' | null {
  const cells = buildingCells(building);
  if (cells.some((cell) => !land(cell.x, cell.z))) return 'water';
  if (
    cells.some((cell) =>
      existing.some((other) => other.t !== 'road' && occupies(other, cell.x, cell.z)),
    )
  )
    return 'occupied';
  return null;
}
