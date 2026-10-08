import type { Tile } from '../domain/index.js';
import type { Board } from './types.js';

/** Широкая часть гавани только в море. В вырезанных углах острова выносим её дальше,
 * чтобы обновление старого города не накрыло соседние дома причалом. */
export function harborLayout(port: Tile, board: Board) {
  const direction = board.shoreDirection(port.x, port.z) ?? [0, 1];
  const [dx, dz] = direction;
  const point = (side: number, outward: number) => ({
    x: port.x + 0.5 + dx * outward + dz * side,
    z: port.z + 0.5 + dz * outward - dx * side,
  });
  let distance = 1.8;
  for (; distance < 3.6; distance += 0.3) {
    const water = [-1.5, 0, 1.5].every((side) =>
      [-0.9, 0, 0.9].every((depth) => {
        const p = point(side, distance + depth);
        return !board.isLand(Math.floor(p.x), Math.floor(p.z));
      }),
    );
    if (water) break;
  }
  return { point, distance, direction: direction as [number, number], angle: -Math.atan2(dx, dz) };
}
