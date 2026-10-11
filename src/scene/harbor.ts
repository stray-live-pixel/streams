import { portLayout, type Tile } from '../domain/index.js';
import type { Board } from './types.js';

// Source X runs along the coast; source -Y (OBJ +Z) points out to sea.
export const PORT_SCALE = 0.35;
export const PORT_DECK = 0.07;
export const PORT_SOURCE_DECK = 1.54;

/** Rendering, placement outline and passenger route share the same quay anchors. */
export function harborLayout(port: Tile, board: Board) {
  const layout = portLayout(port, {
    contains: board.contains ?? ((x, z) => board.isLand(Math.floor(x), Math.floor(z))),
    shoreDirection: board.shoreDirection,
  });
  const back = layout.distance - 3.6 * PORT_SCALE;
  const pierSide = 4.5 * PORT_SCALE;
  const pierEnd = layout.distance + 4.2 * PORT_SCALE;
  return {
    ...layout,
    back,
    mooring: layout.point(pierSide, pierEnd + 0.8),
    route: [
      layout.point(pierSide, pierEnd),
      layout.point(pierSide, layout.distance - 0.45 * PORT_SCALE),
      layout.point(0, layout.distance - 0.45 * PORT_SCALE),
      layout.point(0, 0),
    ],
    outline: [
      [-0.45, 0],
      [0.45, 0],
      [0.45, back],
      [2.1, back],
      [2.1, layout.distance + 1.575],
      [1.05, layout.distance + 1.575],
      [1.05, layout.distance],
      [-2.1, layout.distance],
      [-2.1, back],
      [-0.45, back],
    ],
    beacon: layout.point(-1.85, layout.distance - 0.12),
  };
}
