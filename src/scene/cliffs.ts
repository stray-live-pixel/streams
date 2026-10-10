import nature from '../../.generated/nature-models.json';

/** Local X runs along the cliff; local Z is its depth. Dimensions are complete
 * extents, before rotation. Positive local Z faces inland. The inland crown
 * meets `top`; the outer half can descend below the adjoining grass. */
export interface CliffSpec {
  x: number;
  z: number;
  bottom: number;
  top: number;
  width: number;
  depth: number;
  rotation: number;
  seed: number;
  crownSlope?: number;
  /** Layered coastal buttresses widen towards the water below the turf. */
  profile?: 'boulder' | 'layered';
  /** Main shoulder height as a fraction of the full rock: 0.25…0.75. */
  shoulderHeight?: number;
  /** Relative width/depth of the buried crown: 0.5…1.2. */
  crownScale?: number;
  /** Upper-rock shift in local Z, measured in depths: -0.35…0.35. */
  lean?: number;
}

export interface CliffGeometry {
  positions: number[];
  indices: number[];
  colors: number[];
  normals: number[];
}

type Point = [number, number, number];
const stone = [
  [224, 198, 152],
  [245, 222, 179],
  [200, 185, 147],
] as const;

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A cut from the same seven-sided boulder used for loose coastal rocks.
 * Its broad, uneven shoulders remain real geometry. The inland crown is cut
 * flat to meet turf, while its seaward half slopes down as exposed stone. */
export function cliffRockGeometry(spec: CliffSpec): CliffGeometry {
  const {
    x,
    z,
    bottom,
    top,
    width,
    depth,
    rotation,
    seed,
    crownSlope = 0,
    profile = 'boulder',
    shoulderHeight = 0.5,
    crownScale = 1,
    lean = 0,
  } = spec;
  if (
    ![
      x,
      z,
      bottom,
      top,
      width,
      depth,
      rotation,
      seed,
      crownSlope,
      shoulderHeight,
      crownScale,
      lean,
    ].every(Number.isFinite) ||
    top <= bottom ||
    width <= 0 ||
    depth <= 0 ||
    crownSlope < 0 ||
    crownSlope >= top - bottom ||
    shoulderHeight < 0.25 ||
    shoulderHeight > 0.75 ||
    crownScale < 0.5 ||
    crownScale > 1.2 ||
    Math.abs(lean) > 0.35
  )
    throw new RangeError('A cliff needs finite coordinates, positive dimensions and top > bottom');

  const random = randomSequence(seed);
  const source = nature['rock-large'].p;
  const rings: Point[][] = [[], [], []];
  const cut = (0.74 - 0.4128) / (0.8064 - 0.4128);
  for (let i = 0; i < 7; i++) {
    const base = source[i];
    const shoulder = source[7 + i];
    const crown = source[14 + i];
    const radial = 0.92 + random() * 0.16;
    // The buried foot is broad enough to avoid a floating/undercut boulder.
    // Distinct angular outlines are retained from the original sculpt.
    rings[0].push([
      (base[0] * 0.4 + shoulder[0] * 0.66) * radial,
      0,
      (base[2] * 0.4 + shoulder[2] * 0.66) * radial,
    ]);
    rings[1].push([
      shoulder[0] * radial,
      shoulderHeight - 0.1 + random() * 0.2,
      shoulder[2] * radial,
    ]);
    rings[2].push([
      (shoulder[0] + (crown[0] - shoulder[0]) * cut) * radial * crownScale,
      1,
      (shoulder[2] + (crown[2] - shoulder[2]) * cut) * radial * crownScale,
    ]);
  }

  if (profile === 'layered') {
    const crown = rings[2];
    // Four exposed courses plus a buried foot. Heights vary per corner so
    // they read as fractured rock, not horizontal masonry courses.
    const layers = [
      [0, 1.08],
      [0.34, 1.14],
      [0.58, 1.04],
      [0.73, 0.91],
      [0.87, 0.78],
    ];
    const stratified = layers.map(([height, width], layer) =>
      Array.from({ length: 7 }, (_, i): Point => {
        const p = source[7 + i];
        const irregularity = 0.94 + random() * 0.12;
        return [
          p[0] * width * irregularity,
          layer === 0 ? 0 : height + (random() - 0.5) * 0.09,
          p[2] * width * irregularity,
        ];
      }),
    );
    rings.splice(0, rings.length, ...stratified, crown);
  }

  const points = rings.flat();
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minZ = Math.min(...points.map((p) => p[2]));
  const maxZ = Math.max(...points.map((p) => p[2]));
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const transform = ([px, py, pz]: Point): Point => {
    const tx = ((px - (minX + maxX) * 0.5) / (maxX - minX)) * width;
    const tz = ((pz - (minZ + maxZ) * 0.5) / (maxZ - minZ)) * depth;
    const crown = top - crownSlope * Math.max(0, Math.min(1, (-tz / depth) * 2));
    // Shear moves the crown and its shoulders together, keeping the buried
    // foot planted. This changes the profile without a second stepped ring.
    const shiftedZ = tz + py * lean * depth;
    return [
      x + tx * cos - shiftedZ * sin,
      py === 0 ? bottom : py === 1 ? crown : bottom + py * (crown - bottom),
      z + tx * sin + shiftedZ * cos,
    ];
  };
  const transformed = rings.map((ring) => ring.map(transform));
  const data: CliffGeometry = { positions: [], indices: [], colors: [], normals: [] };
  function triangle(a: Point, b: Point, c: Point, material: number) {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    const color = stone[material];
    const first = data.positions.length / 3;
    data.indices.push(first, first + 1, first + 2);
    for (const point of [a, b, c]) {
      data.positions.push(...point);
      data.normals.push(nx / length, ny / length, nz / length);
      data.colors.push(color[0] / 255, color[1] / 255, color[2] / 255, 1);
    }
  }

  for (let layer = 0; layer < rings.length - 1; layer++) {
    for (let i = 0; i < 7; i++) {
      const next = (i + 1) % 7;
      const low = transformed[layer];
      const high = transformed[layer + 1];
      const material = (i + (seed >>> 0)) % 5 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
      // Alternating diagonals break up long planar-looking slabs while keeping
      // the silhouette, the shoulder ridge and every shared edge watertight.
      if ((i + layer) % 2 === 0) {
        triangle(low[i], high[i], high[next], material);
        triangle(low[i], high[next], low[next], material);
      } else {
        triangle(low[i], high[i], low[next], material);
        triangle(low[next], high[i], high[next], material);
      }
    }
  }
  for (const layer of [0, rings.length - 1]) {
    const ring = transformed[layer];
    const center = transform([
      rings[layer].reduce((sum, p) => sum + p[0], 0) / 7,
      layer === 0 ? 0 : 1,
      rings[layer].reduce((sum, p) => sum + p[2], 0) / 7,
    ]);
    for (let i = 0; i < 7; i++) {
      const next = (i + 1) % 7;
      if (layer === 0) triangle(center, ring[i], ring[next], 2);
      else triangle(center, ring[next], ring[i], 1);
    }
  }
  return data;
}
