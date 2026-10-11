type Point = [number, number, number];
type Face = [number, number, number, number];

function foliageRandom(x: number, z: number, seed: number) {
  let state = (seed ^ Math.round(x * 17381) ^ Math.round(z * 4783)) >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519) + 3266489917;
    return (state >>> 0) / 4294967296;
  };
}

/** A few full overlapping branch masses define each pine. The angular profile
 * stays coherent from skirt to shoulder: independent vertex noise would crease
 * every triangle and make the crown look crushed. Slot 0 uses the generated
 * needle painting, slot 4 is bark. */
export function pineGeometry(kind: string, x: number, z: number, seed: number) {
  const p: Point[] = [];
  const f: Face[] = [];
  const random = foliageRandom(x, z, seed);
  const young = kind === 'pine-young';
  const height = (young ? 1.18 : kind === 'pine-wide' ? 1.81 : 2.17) * (0.94 + random() * 0.1);
  const width = (young ? 0.43 : kind === 'pine-wide' ? 0.77 : 0.66) * (0.94 + random() * 0.09);
  const trunkRadius = young ? 0.06 : 0.085;
  const leanX = (random() - 0.5) * 0.055;
  const leanZ = (random() - 0.5) * 0.055;
  const trunkRing = (radius: number, y: number) => {
    const start = p.length;
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      p.push([Math.cos(angle) * radius + leanX * y, y, Math.sin(angle) * radius + leanZ * y]);
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
  const trunkBottom = trunkRing(trunkRadius, 0);
  const trunkTop = trunkRing(trunkRadius * 0.7, height * 0.79);
  connect(trunkBottom, trunkTop, 7, 4);
  const trunkBase = p.push([0, 0, 0]) - 1;
  const trunkTip = p.push([leanX * height * 0.79, height * 0.79, leanZ * height * 0.79]) - 1;
  for (let i = 0; i < 7; i++) {
    const next = (i + 1) % 7;
    f.push([trunkBottom + next, trunkBase, trunkBottom + i, 4]);
    f.push([trunkTop + i, trunkTip, trunkTop + next, 4]);
  }
  const layers = young
    ? [
        [0.23, 0.4, 1],
        [0.49, 0.33, 0.75],
        [0.76, 0.24, 0.43],
      ]
    : [
        [0.18, 0.37, 1],
        [0.4, 0.32, 0.83],
        [0.62, 0.28, 0.6],
        [0.81, 0.19, 0.33],
      ];
  for (const [base, span, breadth] of layers) {
    const phase = random() * Math.PI * 2;
    const count = 10;
    const radius = width * breadth * (0.97 + random() * 0.07);
    const offsetX = (random() - 0.5) * radius * 0.11;
    const offsetZ = (random() - 0.5) * radius * 0.11;
    const lobePhase = random() * Math.PI * 2;
    const tiltPhase = random() * Math.PI * 2;
    const profile = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + phase;
      return {
        angle,
        radius: 1 + 0.11 * Math.cos(angle * 3 + lobePhase) + 0.05 * Math.sin(angle * 2 - phase),
        height: (Math.sin(angle + tiltPhase) + Math.cos(angle * 3 + lobePhase) * 0.35) * 0.008,
      };
    });
    const branchRing = (scale: number, y: number, ripple: number) => {
      const start = p.length;
      for (const vertex of profile) {
        const r = radius * scale * vertex.radius;
        p.push([
          Math.cos(vertex.angle) * r + leanX * y + offsetX,
          y + height * vertex.height * ripple,
          Math.sin(vertex.angle) * r + leanZ * y + offsetZ,
        ]);
      }
      return start;
    };
    const bottom = branchRing(0.8, (base - 0.02) * height, 0.8);
    const skirt = branchRing(1, base * height, 1);
    // The shoulder carries the crown's volume. All rings share the same few
    // bough lobes, so broad planes survive without a patchwork of dents.
    const shoulder = branchRing(0.77, (base + span * 0.38) * height, 0.4);
    connect(bottom, skirt, count, 0);
    connect(skirt, shoulder, count, 0);
    const tip = p.length;
    const tipY = (base + span) * height;
    p.push([leanX * tipY + offsetX * 0.6, tipY, leanZ * tipY + offsetZ * 0.6]);
    const underside = p.length;
    p.push([
      leanX * base * height + offsetX,
      (base - 0.035) * height,
      leanZ * base * height + offsetZ,
    ]);
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      f.push([shoulder + i, tip, shoulder + next, 0]);
      f.push([bottom + next, underside, bottom + i, 0]);
    }
  }
  return { p, f, c: [[255, 255, 255], [], [], [], [145, 91, 43]] };
}

/** Low leaf pillows overlap into one bush silhouette. Rounded shoulders and
 * several unequal crowns separate vegetation from the angular stone props. */
export function bushGeometry(x: number, z: number, seed: number) {
  const p: Point[] = [];
  const f: Face[] = [];
  const random = foliageRandom(x, z, seed ^ 0x30b17);
  const count = 7;
  const lobes = [
    [-0.19, 0.035, 0.01, 0.24, 0.41],
    [0.12, 0, 0.06, 0.3, 0.5],
    [0.31, 0.01, -0.045, 0.19, 0.33],
  ];
  for (const [cx, cy, cz, size, tall] of lobes) {
    const radius = size * (0.91 + random() * 0.15);
    const height = tall * (0.94 + random() * 0.12);
    const phase = random() * Math.PI * 2;
    const squish = 0.75 + random() * 0.18;
    const ring = (y: number, scale: number) => {
      const start = p.length;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + phase;
        const r = radius * scale * (1 + 0.065 * Math.cos(angle * 3 + phase));
        p.push([cx + Math.cos(angle) * r, cy + height * y, cz + Math.sin(angle) * r * squish]);
      }
      return start;
    };
    const low = ring(0.12, 0.68);
    const middle = ring(0.44, 1);
    const high = ring(0.75, 0.78);
    const cap = ring(0.93, 0.38);
    const top = p.push([cx - radius * 0.06, cy + height, cz + radius * 0.04]) - 1;
    const bottom = p.push([cx, cy + height * 0.015, cz]) - 1;
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      f.push([low + i, middle + i, middle + next, 1]);
      f.push([low + i, middle + next, low + next, 1]);
      f.push([middle + i, high + i, high + next, 1]);
      f.push([middle + i, high + next, middle + next, 1]);
      f.push([high + i, cap + i, cap + next, 1]);
      f.push([high + i, cap + next, high + next, 1]);
      f.push([cap + i, top, cap + next, 1]);
      f.push([low + next, bottom, low + i, 1]);
    }
  }
  return { p, f, c: [[], [105, 153, 66]] };
}
