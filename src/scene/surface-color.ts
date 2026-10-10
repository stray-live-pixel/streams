type Color = readonly number[];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Broad pigment patches stay tied to world coordinates, like painted scenery. */
export function grassPigment(x: number, z: number, base: Color): number[] {
  const patch = Math.sin(x * 1.71 + Math.sin(z * 1.2)) * Math.cos(z * 1.43 - x * 0.24);
  const ochre = smooth((patch - 0.12) * 1.8) * 0.22;
  return base.map((channel, i) => channel * (1 - ochre) + [207, 194, 92][i] * ochre);
}

/** A hand-painted wet edge: darker, cooler stone near the water, matte above. */
export function rockPigment(x: number, y: number, z: number, base: Color): number[] {
  const wash = Math.sin(x * 2.7 + Math.cos(z * 1.8)) * Math.cos(z * 2.2 - x * 0.4);
  const warm = smooth(wash * 0.9 + 0.1) * 0.19;
  const tide = -0.39 + Math.sin(x * 3.3 + z * 1.7) * 0.035 + Math.cos(z * 4.1) * 0.02;
  const wet = smooth((tide - y) / 0.31);
  return base.map((channel, i) => {
    const painted = channel * (1 - warm) + [232, 187, 139][i] * warm;
    return painted * (1 - wet) + painted * [0.51, 0.62, 0.66][i] * wet;
  });
}
