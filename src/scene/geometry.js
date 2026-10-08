import { BufferGeometry, Float32BufferAttribute } from 'three';
import assets from '../../.generated/models.json';

// Композиции состоят из исходных деталей Kenney. Параметры — координаты,
// масштаб и поворот; стоимость и правила зданий этому модулю неизвестны.
// PNG хранит цвета в sRGB, а Three.js считает цвет вершин линейным.
// Преобразование сохраняет исходные оттенки палитры после вывода на экран.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hash = (x, z) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
// Одна клетка — одна единица; X/Z лежат на земле, Y направлена вверх.
// Геометрия неподвижного острова объединяется, чтобы сократить число вызовов отрисовки.
function builder(board) {
  let sceneVertices = [];
  function rgb(hex) {
    return hex.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
  }
  function triangle(a, b, c, color, lit = true) {
    let u = b.map((v, i) => v - a[i]),
      v = c.map((x, i) => x - a[i]),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      len = Math.hypot(...n) || 1;
    let light = lit
      ? 0.67 + 0.33 * Math.max(0, (-n[0] * 0.45 + n[1] * 0.82 + n[2] * 0.35) / len)
      : 1;
    for (let p of [a, b, c])
      sceneVertices.push(...p, ...color.map((v) => toLinear((v / 255) * light)));
  }
  function quad(a, b, c, d, color) {
    triangle(a, b, c, color, false);
    triangle(a, c, d, color, false);
  }
  function terrain(x, z) {
    let top = rgb(hash(x, z) > 0.5 ? '#98b48a' : '#9db98e');
    quad([x, 0, z], [x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], top);
    quad([x, -0.43, z], [x, -0.43, z + 1], [x, 0, z + 1], [x, 0, z], rgb('#bcb08d'));
    quad(
      [x + 1, -0.43, z + 1],
      [x + 1, -0.43, z],
      [x + 1, 0, z],
      [x + 1, 0, z + 1],
      rgb('#b4aa87'),
    );
    quad(
      [x, -0.43, z + 1],
      [x + 1, -0.43, z + 1],
      [x + 1, 0, z + 1],
      [x, 0, z + 1],
      rgb('#c4b894'),
    );
    quad([x + 1, -0.43, z], [x, -0.43, z], [x, 0, z], [x + 1, 0, z], rgb('#b2a583'));
  }
  function model(name, x, y, z, sx = 1, sy = sx, sz = sx, angle = 0) {
    let a = assets[name],
      co = Math.cos(angle),
      si = Math.sin(angle),
      points = a.p.map((p) => [
        x + p[0] * sx * co - p[2] * sz * si,
        y + p[1] * sy,
        z + p[0] * sx * si + p[2] * sz * co,
      ]);
    for (let f of a.f) triangle(points[f[0]], points[f[1]], points[f[2]], a.c[f[3]]);
  }
  function shadow(x, z, rx, rz) {
    for (let i = 0; i < 20; i++) {
      let a = (i * Math.PI) / 10,
        b = ((i + 1) * Math.PI) / 10;
      triangle(
        [x, 0.012, z],
        [x + Math.cos(a) * rx, 0.012, z + Math.sin(a) * rz],
        [x + Math.cos(b) * rx, 0.012, z + Math.sin(b) * rz],
        rgb('#869f79'),
        false,
      );
    }
  }
  function cottage(x, z, s = 0.65, y = 0.025) {
    model('wall-block', x, y, z, s, s * 0.78, s);
    // Малый сдвиг не даёт совпадающим поверхностям стены и двери мерцать.
    model('wall-wood-door', x, y, z + 0.003, s, s * 0.78, s, Math.PI / 2);
    model('wall-wood-window-glass', x - 0.003, y, z, s, s * 0.78, s, Math.PI);
    model('roof-gable', x, y + s * 0.78, z, s, s, s);
    model('chimney', x, y + s * 0.64, z - 0.08, s * 0.8, s * 0.6, s * 0.8);
  }
  function building(b) {
    let x = b.x + 0.5,
      z = b.z + 0.5;
    if (b.t === 'road') {
      model('planks', x, 0.005, z, 1, 1, 1);
      return;
    }
    if (b.t === 'port') {
      const [dx, dz] = board.shoreDirection(b.x, b.z) || [0, 1];
      for (let i = 0; i < 3; i++)
        model('planks', x + dx * i * 0.5, 0.03, z + dz * i * 0.5, 0.9, 1, 0.9);
      cottage(x - dx * 0.12, z - dz * 0.12, 0.45);
      model('lantern', x + 0.35, 0.2, z, 0.6, 0.6, 0.6);
      return;
    }
    shadow(x + 0.06, z + 0.07, 0.47, 0.37);
    if (b.t === 'house') {
      cottage(x, z, 0.72);
      model('fence', x - 0.08, 0.025, z - 0.35, 0.65, 0.65, 0.65, Math.PI / 2);
    }
    if (b.t === 'hall') {
      cottage(x + 0.06, z, 0.84);
      model('wall-block', x - 0.25, 0.025, z + 0.03, 0.38, 1.02, 0.38);
      model('roof-high-point', x - 0.25, 1.045, z + 0.03, 0.48, 0.58, 0.48);
      model('banner-red', x - 0.25, 0.36, z + 0.037, 0.44, 0.54, 0.44, Math.PI / 2);
    }
    if (b.t === 'farm') {
      cottage(x - 0.12, z - 0.1, 0.6);
      model('windmill', x - 0.13, 0.86, z + 0.23, 0.3, 0.3, 0.3, Math.PI / 2);
      model('cart', x + 0.26, 0.025, z - 0.05, 0.32, 0.32, 0.32);
      model('fence', x - 0.04, 0.025, z - 0.13, 0.78, 0.75, 0.78, 0);
      model('fence', x, 0.025, z - 0.05, 0.8, 0.75, 0.8, Math.PI / 2);
    }
    if (b.t === 'shop') {
      model('stall-red', x - 0.2, 0.025, z, 0.47, 0.6, 0.6);
      model('stall-green', x + 0.25, 0.025, z - 0.07, 0.38, 0.48, 0.47);
      model('cart', x + 0.16, 0.025, z + 0.33, 0.25, 0.25, 0.25, Math.PI / 2);
    }
  }

  function finish() {
    const p = [],
      c = [];
    for (let i = 0; i < sceneVertices.length; i += 6) {
      p.push(...sceneVertices.slice(i, i + 3));
      c.push(...sceneVertices.slice(i + 3, i + 6));
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(c, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }
  return { terrain, building, model, shadow, finish };
}
/** Полностью пересобирается только при изменении списка построек. */
export function islandGeometry(buildings, board) {
  const b = builder(board),
    occupied = new Set(buildings.map((p) => p.x + ',' + p.z));
  for (let x = 0; x < board.size; x++)
    for (let z = 0; z < board.size; z++) {
      if (!board.isLand(x, z)) continue;
      b.terrain(x, z);
      if (!occupied.has(x + ',' + z) && hash(x, z) > 0.77 && !(x > 2 && x < 9 && z > 2 && z < 9)) {
        const scale = 0.3 + hash(z, x) * 0.12;
        b.shadow(x + 0.51, z + 0.55, 0.28, 0.21);
        b.model(
          hash(z, x) > 0.5 ? 'tree' : 'tree-high',
          x + 0.45,
          0.02,
          z + 0.52,
          scale,
          scale,
          scale,
          hash(x, z) * 6,
        );
      }
    }
  for (const building of buildings) b.building(building);
  return b.finish();
}
/** Корабль — отдельный объект; анимация не пересоздаёт геометрию острова. */
export function shipGeometry() {
  const b = builder({});
  b.model('ship-small', 0, 0, 0, 0.19, 0.19, 0.19);
  return b.finish();
}
