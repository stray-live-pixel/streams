import { buildingCells } from './footprint.js';
import type { Building, Tile } from './types.js';

export type LandSurface = (x: number, z: number) => boolean;
export interface PlacementWorld {
  contains: LandSurface;
  shoreDirection(x: number, z: number): [number, number] | null;
}

// Camera projection uses float matrices. Ignore sub-pixel numerical overlap at shared edges.
const EDGE_EPSILON = 1e-4;

/** Existing footprint recipes describe shape in local units, not a world grid. */
export function buildingsOverlap(a: Building, b: Building): boolean {
  return buildingCells(a).some((p) =>
    buildingCells(b).some(
      (q) =>
        p.x < q.x + 1 - EDGE_EPSILON &&
        p.x + 1 > q.x + EDGE_EPSILON &&
        p.z < q.z + 1 - EDGE_EPSILON &&
        p.z + 1 > q.z + EDGE_EPSILON,
    ),
  );
}

/** Sample interiors and edges; a building cannot bridge a bay between dry corners. */
export function footprintSamples(building: Building): Tile[] {
  return buildingCells(building).flatMap((p) =>
    [0.02, 0.26, 0.5, 0.74, 0.98].flatMap((dx) =>
      [0.02, 0.26, 0.5, 0.74, 0.98].map((dz) => ({ x: p.x + dx, z: p.z + dz })),
    ),
  );
}

/** One layout shared by validation and rendering: dry landing and a wet T-shaped dock. */
export function portLayout(port: Tile, world: PlacementWorld) {
  const direction = world.shoreDirection(port.x, port.z) ?? [0, 1];
  const [dx, dz] = direction;
  const point = (side: number, outward: number) => ({
    x: port.x + 0.5 + dx * outward + dz * side,
    z: port.z + 0.5 + dz * outward - dx * side,
  });
  let distance = 1.8;
  for (; distance < 6; distance += 0.3) {
    if (
      [-1.5, -0.75, 0, 0.75, 1.5].every((side) =>
        [-0.9, 0, 0.9].every((depth) => {
          const p = point(side, distance + depth);
          return !world.contains(p.x, p.z);
        }),
      )
    )
      break;
  }
  return { point, distance, direction: direction as [number, number], angle: -Math.atan2(dx, dz) };
}

export function continuousPlacementIssue(
  building: Building,
  existing: Building[],
  world: PlacementWorld,
): 'water' | 'occupied' | 'shore' | null {
  if (![building.x, building.z].every(Number.isFinite)) return 'water';
  if (existing.some((other) => other.t !== 'road' && buildingsOverlap(building, other)))
    return 'occupied';
  const samples = footprintSamples(building);
  if (building.t !== 'port') return samples.every((p) => world.contains(p.x, p.z)) ? null : 'water';
  // The landing remains mostly dry; the dock must actually cross into open water.
  const dry = samples.filter((p) => world.contains(p.x, p.z)).length;
  if (dry < samples.length * 0.6 || !world.shoreDirection(building.x, building.z)) return 'shore';
  const layout = portLayout(building, world);
  const end = layout.point(0, layout.distance);
  return world.contains(end.x, end.z) || layout.distance >= 6 ? 'shore' : null;
}
