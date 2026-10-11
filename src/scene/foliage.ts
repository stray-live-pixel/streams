type Point = [number, number, number];
type Face = [number, number, number, number];

/** Broad, irregular boughs keep the silhouette hand-shaped without changing
 * tree placement or requiring another draw call. Palette slot 0 is textured
 * foliage; slot 4 is the visible trunk. */
export function pineGeometry(kind: string, x: number, z: number, seed: number) {
  const p: Point[] = [];
  const f: Face[] = [];
  let state = (seed ^ Math.round(x * 17381) ^ Math.round(z * 4783)) >>> 0;
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519) + 3266489917;
    return (state >>> 0) / 4294967296;
  };
  const young = kind === 'pine-young';
  const height = (young ? 1.18 : kind === 'pine-wide' ? 1.81 : 2.17) * (0.94 + random() * 0.1);
  const width = (young ? 0.4 : kind === 'pine-wide' ? 0.71 : 0.61) * (0.94 + random() * 0.09);
  const trunkRadius = young ? 0.06 : 0.085;
  const leanX = (random() - 0.5) * 0.1;
  const leanZ = (random() - 0.5) * 0.1;
  const ring = (count: number, radius: number, y: number, phase: number, uneven = false) => {
    const start = p.length;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + phase;
      const r = radius * (uneven ? 0.9 + random() * 0.21 : 1);
      p.push([
        Math.cos(a) * r + leanX * y,
        y + (uneven ? (random() - 0.5) * height * 0.055 : 0),
        Math.sin(a) * r + leanZ * y,
      ]);
    }
    return start;
  };
  const connect = (bottom: number, top: number, count: number, palette: number) => {
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      f.push([bottom + i, top + i, top + next, palette]);
      f.push([bottom + i, top + next, bottom + next, palette]);
    }
  };
  const trunkBottom = ring(7, trunkRadius, 0, 0);
  const trunkTop = ring(7, trunkRadius * 0.7, height * 0.78, 0);
  connect(trunkBottom, trunkTop, 7, 4);
  const layers = young
    ? [
        [0.2, 0.38, 1],
        [0.49, 0.32, 0.73],
        [0.76, 0.24, 0.43],
      ]
    : [
        [0.18, 0.34, 1],
        [0.42, 0.3, 0.83],
        [0.64, 0.27, 0.62],
        [0.82, 0.18, 0.37],
      ];
  for (const [base, span, breadth] of layers) {
    const phase = random() * Math.PI * 2;
    const count = 10;
    const radius = width * breadth;
    const bottom = ring(count, radius * 0.54, (base - 0.025) * height, phase);
    const skirt = ring(count, radius, base * height, phase, true);
    // The shoulder bows outward before tapering. A straight cone misses this
    // volume and turns overlapping tiers into flat, repetitive rings.
    const shoulder = ring(count, radius * 0.66, (base + span * 0.35) * height, phase, true);
    connect(bottom, skirt, count, 0);
    connect(skirt, shoulder, count, 0);
    const tip = p.length;
    const tipY = (base + span) * height;
    p.push([leanX * tipY, tipY, leanZ * tipY]);
    const underside = p.length;
    p.push([leanX * base * height, (base - 0.045) * height, leanZ * base * height]);
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      f.push([shoulder + i, tip, shoulder + next, 0]);
      f.push([bottom + next, underside, bottom + i, 0]);
    }
  }
  return { p, f, c: [[255, 255, 255], [], [], [], [145, 91, 43]] };
}
