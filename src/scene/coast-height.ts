import { createWorld, type Building } from '../domain/index.js';

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function beachInfluence(angle: number, seed: number) {
  const shift = 0.1 * Math.sin(seed);
  const influence = Math.max(
    smooth((0.57 - Math.abs(wrapAngle(angle - 1.1 - shift))) / 0.31),
    smooth((0.55 - Math.abs(wrapAngle(angle - 3.85 + shift))) / 0.31),
  );
  return influence < 0.0001 ? 0 : influence;
}

/** A shallow cove cut into the island, instead of an outward sandy bulge. */
export function beachInset(angle: number, seed: number) {
  const shift = 0.1 * Math.sin(seed);
  const bell = (center: number, width: number) => {
    const t = Math.min(1, Math.abs(wrapAngle(angle - center)) / width);
    return Math.cos((t * Math.PI) / 2) ** 2;
  };
  return 0.85 * Math.max(bell(1.1 + shift, 0.57), bell(3.85 - shift, 0.55));
}

function sandHeight(offset: number) {
  const radii = [0, 0.36, 0.7, 1.02, 1.8];
  const heights = [-0.48, -0.54, -0.61, -0.68, -1.15];
  for (let i = 1; i < radii.length; i++) {
    if (offset <= radii[i]) {
      const t = Math.max(0, (offset - radii[i - 1]) / (radii[i] - radii[i - 1]));
      return heights[i - 1] + t * (heights[i] - heights[i - 1]);
    }
  }
  return heights[heights.length - 1];
}

/** Shared coastal rise: tall headlands, low sandy coves and a level dock approach.
 * Coordinates stay unchanged; trees and buildings sit on the same heightfield. */
export function coastalElevation(x: number, z: number, seed: number, buildings: Building[] = []) {
  const angle = Math.atan2(z - 6, x - 6);
  const radius = Math.hypot(x - 6, z - 6);
  const edge = createWorld(seed).coastRadius(angle) - beachInset(angle, seed);
  const headland =
    0.46 + 0.11 * Math.sin(angle * 3 + (seed % 31)) + 0.07 * Math.cos(angle * 7 - (seed % 17));
  const rise = 0.18 + (headland - 0.18) * smooth((radius - edge + 2.1) / 1.8);
  const beach = 1 - smooth(beachInfluence(angle, seed) / 0.99) * smooth((radius - edge + 2) / 1.2);
  let approach = 1;
  for (const port of buildings.filter((b) => b.t === 'port')) {
    approach = Math.min(
      approach,
      smooth((Math.hypot(x - port.x - 0.5, z - port.z - 0.5) - 1.5) / 1.4),
    );
  }
  // A beach meets the sea on a low apron, not on the raised grass rim.
  // Ease the descent inland so the sand does not form a convex mound.
  const openBeach = smooth((beachInfluence(angle, seed) - 0.72) / 0.28);
  // The last inland metre stays almost level and dry. The ascent begins
  // behind it, so widening the beach does not push its waterline seaward.
  const apron = 0.48 * openBeach * smooth((radius - edge + 4) / 3);
  const outerSand = openBeach * (sandHeight(Math.max(0, radius - edge)) + 0.48);
  return (rise * beach - apron + outerSand) * approach;
}
