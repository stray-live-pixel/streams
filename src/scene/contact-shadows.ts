import { buildingCells, type Building } from '../domain/index.js';
import { environmentLayout } from './environment.js';
import type { Board } from './types.js';

export const CONTACT_TEXTURE_SIZE = 256;
export const CONTACT_TEXTURE_SPAN = 16;
export const CONTACT_TEXTURE_ORIGIN = -2;

/** Soft ambient contact at plant roots and building feet. This is baked only
 * when the island changes, so many overlapping plants cost one texture sample
 * per ground fragment, not another light or a screen-space postprocess. */
export function contactShadowPixels(
  board: Board,
  buildings: Building[],
  size = CONTACT_TEXTURE_SIZE,
) {
  const occlusion = new Float32Array(size * size);
  function ellipse(x: number, z: number, rx: number, rz: number, strength: number) {
    const pixel = CONTACT_TEXTURE_SPAN / size;
    const minX = Math.max(0, Math.floor((x - rx - CONTACT_TEXTURE_ORIGIN) / pixel));
    const maxX = Math.min(size - 1, Math.ceil((x + rx - CONTACT_TEXTURE_ORIGIN) / pixel));
    const minZ = Math.max(0, Math.floor((z - rz - CONTACT_TEXTURE_ORIGIN) / pixel));
    const maxZ = Math.min(size - 1, Math.ceil((z + rz - CONTACT_TEXTURE_ORIGIN) / pixel));
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const dx = (CONTACT_TEXTURE_ORIGIN + (ix + 0.5) * pixel - x) / rx;
        const dz = (CONTACT_TEXTURE_ORIGIN + (iz + 0.5) * pixel - z) / rz;
        const radius = dx * dx + dz * dz;
        if (radius >= 1) continue;
        const shade = (1 - radius) ** 2 * strength;
        const index = iz * size + ix;
        occlusion[index] = 1 - (1 - occlusion[index]) * (1 - shade);
      }
    }
  }
  for (const item of environmentLayout(board, buildings)) {
    if (item.y < -0.2 || item.asset === 'grass' || item.asset === 'flowers') continue;
    const pine = item.asset.startsWith('pine');
    const radius = item.scale * (pine ? 0.54 : item.asset === 'bush' ? 0.33 : 0.31);
    ellipse(item.x, item.z, radius, radius * 0.9, pine ? 0.83 : 0.67);
  }
  for (const building of buildings) {
    if (building.t === 'road' || building.t === 'port') continue;
    for (const cell of buildingCells(building)) {
      ellipse(cell.x + 0.5, cell.z + 0.5, 0.72, 0.72, 0.8);
    }
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let index = 0; index < occlusion.length; index++) {
    pixels[index * 4] = Math.round(Math.min(0.93, occlusion[index]) * 255);
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}
