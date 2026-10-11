import type { Building } from '../domain/index.js';
import { uplandCliffs } from './cliff-layout.js';
import { cliffRockGeometry } from './cliffs.js';

type Triangle = {
  x: number;
  y: number;
  z: number;
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  inverse: number;
};
type Rock = { minX: number; maxX: number; minZ: number; maxZ: number; faces: Triangle[] };
const geometryCache = new Map<string, Rock[]>();

function supportGeometry(seed: number, buildings: Building[]) {
  // Include full footprints: changing an existing building may clear or flatten
  // a different portion of the escarpment without changing its anchor point.
  const key = JSON.stringify([seed, buildings]);
  let rocks = geometryCache.get(key);
  if (rocks) return rocks;
  rocks = uplandCliffs(seed, buildings).map((spec) => {
    const positions = cliffRockGeometry(spec).positions;
    const rock: Rock = {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
      faces: [],
    };
    for (let i = 0; i < positions.length; i += 9) {
      const [x, y, z, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
      const ux = bx - x,
        uz = bz - z,
        vx = cx - x,
        vz = cz - z;
      const determinant = ux * vz - uz * vx;
      // Vertical faces have no area when projected onto the ground. They
      // cannot support a vertical ray, and dividing by them amplifies noise.
      if (Math.abs(determinant) < 1e-10) continue;
      rock.faces.push({
        x,
        y,
        z,
        ux,
        uy: by - y,
        uz,
        vx,
        vy: cy - y,
        vz,
        inverse: 1 / determinant,
      });
      rock.minX = Math.min(rock.minX, x, bx, cx);
      rock.maxX = Math.max(rock.maxX, x, bx, cx);
      rock.minZ = Math.min(rock.minZ, z, bz, cz);
      rock.maxZ = Math.max(rock.maxZ, z, bz, cz);
    }
    return rock;
  });
  if (geometryCache.size >= 8) geometryCache.delete(geometryCache.keys().next().value!);
  geometryCache.set(key, rocks);
  return rocks;
}

/** Highest actual inland-rock surface at board coordinates. The heightfield
 * alone misses the newly exposed shoulders, so decoration and picking share
 * this vertical-ray query. No rock under the point is represented by -Infinity. */
export function exposedRockHeight(x: number, z: number, seed: number, buildings: Building[] = []) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return -Infinity;
  const epsilon = 1e-8;
  let height = -Infinity;
  for (const rock of supportGeometry(seed, buildings)) {
    if (
      x < rock.minX - epsilon ||
      x > rock.maxX + epsilon ||
      z < rock.minZ - epsilon ||
      z > rock.maxZ + epsilon
    )
      continue;
    for (const face of rock.faces) {
      const dx = x - face.x,
        dz = z - face.z;
      const u = (dx * face.vz - dz * face.vx) * face.inverse;
      const v = (face.ux * dz - face.uz * dx) * face.inverse;
      if (u < -epsilon || v < -epsilon || u + v > 1 + epsilon) continue;
      height = Math.max(height, face.y + u * face.uy + v * face.vy);
    }
  }
  return height;
}
