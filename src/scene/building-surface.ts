/** Material tags describe a whole triangle, never interpolate between paint
 * families. Preserve the source palette: a blue roof stays blue after painting. */
export function buildingSurface(asset: string, colors: number[][]): number {
  const average = [0, 1, 2].map(
    (axis) => colors.reduce((sum, color) => sum + color[axis], 0) / colors.length,
  );
  const [r, g, b] = average;
  const warm = r > g * 1.1 && r > b * 1.2;
  if (/roof/.test(asset)) return 11;
  if (warm && /wall|plank|platform|dock|fence|barrel|crate|cart|balcony|door|windmill/.test(asset))
    return 10;
  if (/wall/.test(asset) && Math.max(...average) > 95 && !warm) return 12;
  return 0;
}
