import { portLayout, type Tile } from '../domain/index.js';
import type { Board } from './types.js';

/** Render exactly the same dry landing / wet dock that placement validates. */
export function harborLayout(port: Tile, board: Board) {
  return portLayout(port, {
    contains: board.contains ?? ((x, z) => board.isLand(Math.floor(x), Math.floor(z))),
    shoreDirection: board.shoreDirection,
  });
}
