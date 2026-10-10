import type { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';

/** Усредняем нормали только близких граней. Прямые углы домов остаются,
 * а скалы и кроны получают мягкий свет без дополнительной геометрии. */
export function softenNormals(data: VertexData, cosine = 0.48) {
  const positions = data.positions!,
    original = data.normals!;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${Math.round(positions[i] * 10000)},${Math.round(positions[i + 1] * 10000)},${Math.round(positions[i + 2] * 10000)}`;
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  }
  const normals = Array.from(original);
  for (const indices of groups.values())
    for (const i of indices) {
      let x = 0,
        y = 0,
        z = 0;
      for (const j of indices) {
        const dot =
          original[i] * original[j] +
          original[i + 1] * original[j + 1] +
          original[i + 2] * original[j + 2];
        if (dot > cosine) {
          x += original[j];
          y += original[j + 1];
          z += original[j + 2];
        }
      }
      const length = Math.hypot(x, y, z) || 1;
      normals[i] = x / length;
      normals[i + 1] = y / length;
      normals[i + 2] = z / length;
    }
  data.normals = normals;
  return data;
}
