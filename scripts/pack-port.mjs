import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Blender OBJ uses Y-up; preserve its evaluated geometry, normals and material palette. */
export async function packPort(root) {
  const directory = path.join(root, 'assets/art/port-reference-simple');
  const materials = new Map();
  let material;
  for (const line of (await readFile(path.join(directory, 'port.mtl'), 'utf8')).split('\n')) {
    const [kind, ...values] = line.trim().split(/\s+/);
    if (kind === 'newmtl') material = values.join(' ');
    // Blender writes linear RGB. The game's vertex palette is authored in sRGB.
    if (kind === 'Kd')
      materials.set(
        material,
        values
          .map(Number)
          .map((v) =>
            Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)),
          ),
      );
  }
  const p = [],
    n = [],
    f = [],
    fn = [],
    c = [],
    s = [];
  const palette = new Map();
  for (const line of (await readFile(path.join(directory, 'port.obj'), 'utf8')).split('\n')) {
    const [kind, ...values] = line.trim().split(/\s+/);
    if (kind === 'v') p.push(values.map(Number));
    if (kind === 'vn') {
      const normal = values.map(Number);
      const length = Math.hypot(...normal) || 1;
      n.push(normal.map((value) => Number((value / length).toFixed(6))));
    }
    if (kind === 'usemtl') material = values.join(' ');
    if (kind !== 'f') continue;
    if (!materials.has(material)) throw new Error(`Unknown port material: ${material}`);
    if (!palette.has(material)) {
      palette.set(material, c.length);
      c.push(materials.get(material));
    }
    const refs = values.map((v) => v.split('/').map(Number));
    const color = palette.get(material);
    // Blender's OBJ exporter leaves evaluated curve tubes as convex quads.
    for (let i = 1; i < refs.length - 1; i++) {
      const triangle = [refs[0], refs[i], refs[i + 1]];
      f.push([...triangle.map((r) => r[0] - 1), color, color, color]);
      fn.push(triangle.map((r) => r[2] - 1));
      s.push(
        /roof/i.test(material)
          ? 11
          : /plaster/i.test(material)
            ? 12
            : /timber|deck|wood/i.test(material)
              ? 10
              : 0,
      );
    }
  }
  if (!p.length || !f.length || fn.flat().some((i) => !n[i]))
    throw new Error('Port export is empty or has missing normals');
  return { p, f, c, n, fn, s };
}
