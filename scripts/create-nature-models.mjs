import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Авторские готовые меши окружения. Генерируются один раз, а игра только
// расставляет экземпляры: ни Blender, ни генератор вершин ей не нужны.
const directory = fileURLToPath(new URL('../assets/models/island-nature/', import.meta.url));
const palette = [
  [65, 99, 66],
  [82, 117, 70],
  [106, 137, 79],
  [132, 153, 88],
  [115, 84, 49],
  [143, 110, 66],
  [184, 170, 143],
  [210, 193, 160],
  [163, 156, 138],
  [141, 159, 71],
  [174, 181, 86],
  [225, 195, 91],
  [242, 224, 161],
];
function mesh() {
  const p = [],
    f = [];
  return {
    p,
    f,
    c: palette,
    vertex(x, y, z) {
      p.push([x, y, z].map((v) => +v.toFixed(5)));
      return p.length - 1;
    },
    face(a, b, c, color) {
      f.push([a, b, c, color, color, color]);
    },
  };
}
function ring(m, x, y, z, radius, sides, turn = 0, stretch = 1, wobble = 0) {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i * Math.PI * 2) / sides + turn;
    const r = radius * (1 + wobble * Math.sin(i * 4.73 + y));
    return m.vertex(x + Math.cos(a) * r, y, z + Math.sin(a) * r * stretch);
  });
}
function connect(m, lower, upper, color, variation = false) {
  for (let i = 0; i < lower.length; i++) {
    const n = (i + 1) % lower.length;
    const c = variation ? color + (i % 2) : color;
    m.face(lower[i], upper[i], upper[n], c);
    m.face(lower[i], upper[n], lower[n], c);
  }
}
function pine(height, width, turn) {
  const m = mesh();
  connect(m, ring(m, 0, 0, 0, 0.09, 7), ring(m, 0.025, height * 0.76, 0, 0.058, 7), 4, true);
  for (let tier = 0; tier < 4; tier++) {
    const y = height * (0.2 + tier * 0.19),
      r = width * (1 - tier * 0.21);
    const skirt = ring(m, 0.025, y, 0, r, 9, turn + tier * 0.17, 1, 0.12);
    const shoulder = ring(m, 0.025, y + height * 0.09, 0, r * 0.73, 9, turn + tier * 0.17, 1, 0.1);
    connect(m, skirt, shoulder, tier > 1 ? 1 : 0, true);
    const tip = m.vertex(0.025, y + height * 0.38, 0);
    const bottom = m.vertex(0.025, y + 0.04, 0);
    for (let i = 0; i < 9; i++) {
      m.face(shoulder[i], tip, shoulder[(i + 1) % 9], tier > 1 ? 2 : 1);
      m.face(skirt[i], skirt[(i + 1) % 9], bottom, 0);
    }
  }
  return m;
}
function rock(height, width, phase) {
  const m = mesh();
  const lower = ring(m, 0, 0, 0, width * 0.85, 7, phase, 0.85, 0.17);
  const middle = ring(m, -0.07, height * 0.43, 0.03, width, 7, phase + 0.11, 0.85, 0.2);
  const upper = ring(m, 0.05, height * 0.84, 0, width * 0.54, 7, phase + 0.3, 0.75, 0.2);
  connect(m, lower, middle, 6, true);
  connect(m, middle, upper, 6, true);
  const tip = m.vertex(-0.04, height, 0.03);
  for (let i = 0; i < 7; i++) m.face(upper[i], tip, upper[(i + 1) % 7], 7);
  return m;
}
function shrub() {
  const m = mesh();
  for (const [x, z, r, h] of [
    [0, 0, 0.26, 0.38],
    [0.25, 0.05, 0.2, 0.27],
    [-0.19, 0.1, 0.18, 0.23],
  ]) {
    const a = ring(m, x, 0.03, z, r, 7, x, 1, 0.1);
    const b = ring(m, x, h * 0.65, z, r * 0.75, 7, x + 0.3);
    connect(m, a, b, 2, true);
    const top = m.vertex(x, h, z);
    for (let i = 0; i < 7; i++) m.face(b[i], top, b[(i + 1) % 7], 3);
  }
  return m;
}
function grass(flowers = false) {
  const m = mesh();
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      x = Math.cos(a) * 0.11,
      z = Math.sin(a) * 0.11;
    const h = 0.13 + (i % 3) * 0.055;
    const left = m.vertex(x - 0.028, 0.005, z),
      right = m.vertex(x + 0.028, 0.005, z);
    m.face(
      left,
      right,
      m.vertex(x + Math.cos(a) * 0.08, h, z + Math.sin(a) * 0.08),
      i % 2 ? 9 : 10,
    );
    if (flowers && i % 2 === 0) {
      const r = 0.052,
        center = m.vertex(x, h, z);
      const petals = ring(m, x, h + 0.012, z, r, 5, a);
      for (let j = 0; j < 5; j++)
        m.face(center, petals[(j + 1) % 5], petals[j], 11 + ((i / 2) % 2));
    }
  }
  return m;
}
const models = {
  'pine-tall': pine(1.9, 0.53, 0.1),
  'pine-wide': pine(1.55, 0.61, 0.4),
  'pine-young': pine(1.03, 0.35, 0.25),
  'rock-large': rock(0.96, 0.58, 0.2),
  'rock-flat': rock(0.38, 0.5, 0.6),
  'rock-small': rock(0.39, 0.25, 0.9),
  bush: shrub(),
  grass: grass(),
  flowers: grass(true),
};

// Стандартные GLB тех же мешей — для последующего редактирования в Blender.
function glb(name, model) {
  const positions = [],
    normals = [],
    colors = [];
  for (const face of model.f) {
    const [a, b, c] = face.slice(0, 3).map((i) => model.p[i]);
    const u = b.map((v, i) => v - a[i]),
      v = c.map((n, i) => n - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;
    for (let i = 0; i < 3; i++) {
      positions.push(...[a, b, c][i]);
      normals.push(...n.map((x) => x / length));
      colors.push(
        ...model.c[face[3 + i]].map((x) => {
          const s = x / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }),
      );
    }
  }
  const arrays = [positions, normals, colors].map((a) => new Float32Array(a));
  const bin = Buffer.concat(arrays.map((a) => Buffer.from(a.buffer)));
  let offset = 0;
  const bufferViews = arrays.map((a) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: a.byteLength, target: 34962 };
    offset += a.byteLength;
    return view;
  });
  const doc = {
    asset: { version: '2.0', generator: 'Quiet Harbor nature model generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [
      { name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }] },
    ],
    materials: [
      { doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.95 } },
    ],
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    accessors: arrays.map((a, i) => ({
      bufferView: i,
      componentType: 5126,
      count: a.length / 3,
      type: 'VEC3',
      ...(i === 0
        ? {
            min: [0, 1, 2].map((j) => Math.min(...model.p.map((p) => p[j]))),
            max: [0, 1, 2].map((j) => Math.max(...model.p.map((p) => p[j]))),
          }
        : {}),
    })),
  };
  const source = Buffer.from(JSON.stringify(doc)),
    json = Buffer.alloc(Math.ceil(source.length / 4) * 4, 32);
  source.copy(json);
  const header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bin.length, 8);
  jsonHeader.writeUInt32LE(json.length);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binHeader, bin]);
}
await mkdir(directory, { recursive: true });
const saved = Object.fromEntries(
  Object.entries(models).map(([id, { p, f, c }]) => [id, { p, f, c }]),
);
await writeFile(path.join(directory, 'models.json'), JSON.stringify(saved));
for (const [id, model] of Object.entries(models))
  await writeFile(path.join(directory, `${id}.glb`), glb(id, model));
console.log(
  `Nature pack: ${Object.keys(models).length} reusable meshes, ${Object.values(models).reduce((n, m) => n + m.f.length, 0)} triangles total.`,
);
