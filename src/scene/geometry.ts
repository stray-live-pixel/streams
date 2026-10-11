import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import {
  objectTemplate,
  type ObjectPart,
  setObjectTemplates,
  parseObjectTemplates,
  builtInObjectTemplates,
  objectSettings,
  scaleObjectParts,
} from '../objects/index.js';
import templateModels from '../../.generated/template-models.json';
import modelIds from '../../.generated/model-ids.json';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { buildingObjectId, type Building } from '../domain/index.js';
import type { Board } from './types.js';
import { harborLayout, PORT_SCALE, PORT_DECK, PORT_SOURCE_DECK } from './harbor.js';
import { environmentGeometry } from './environment.js';
import { softenNormals } from './smoothing.js';
import { buildingElevation, terrainHeight } from './terrain.js';
import { ISLAND_SPREAD, sceneCoordinate } from './space.js';
import assets from '../../.generated/models.json';
import { buildingSurface } from './building-surface.js';
import { COTTAGE_GROUND, COTTAGE_SCALE } from './cottage.js';

// В игре только используемые ассеты; полную библиотеку подключает редактор.
let objectAssets: Record<string, ModelData> = {
  ...Object.fromEntries(
    Object.entries(assets).map(([name, data]) => [
      (modelIds as Record<string, string>)[name],
      data,
    ]),
  ),
  ...templateModels,
};
setObjectTemplates(
  parseObjectTemplates(builtInObjectTemplates, new Set(Object.keys(objectAssets))),
);
export function registerObjectAssets(models: Record<string, ModelData>) {
  objectAssets = models;
}

// Композиции состоят из деталей Kenney и собственных моделей. Параметры — координаты,
// масштаб и поворот; стоимость и правила зданий этому модулю неизвестны.
// В игре палитру освещают источники сцены; мастерская сохраняет прежний запечённый свет.
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
// Одна клетка — одна единица; X/Z лежат на земле, Y направлена вверх.
// Геометрия неподвижного острова объединяется, чтобы сократить число вызовов отрисовки.
export interface ModelData {
  p: number[][];
  // Три индекса позиций, затем три индекса цветов UV-углов треугольника.
  f: number[][];
  c: number[][];
  // Optional authored Blender normals, corner indices and material surface tags.
  n?: number[][];
  fn?: number[][];
  s?: number[];
}
function builder(
  board: Board,
  completed = false,
  models: Record<string, ModelData> = assets,
  capture?: ObjectPart[],
  overrides = true,
  realtimeLighting = false,
  islandBuildings: Building[] = [],
) {
  const sceneVertices: number[] = [];
  const surfaces: number[] = [];
  const authoredNormals: (number[] | undefined)[] = [];
  function rgb(hex: string) {
    return hex.match(/[0-9a-f]{2}/gi)!.map((v) => parseInt(v, 16));
  }
  function triangle(
    a: number[],
    b: number[],
    c: number[],
    colors: number[][],
    lit = true,
    surface = 0,
    normals?: number[][],
  ) {
    let u = b.map((v, i) => v - a[i]),
      v = c.map((x, i) => x - a[i]),
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      len = Math.hypot(...n) || 1;
    let light =
      !realtimeLighting && lit
        ? 0.67 + 0.33 * Math.max(0, (-n[0] * 0.45 + n[1] * 0.82 + n[2] * 0.35) / len)
        : 1;
    for (const [i, p] of [a, b, c].entries()) {
      sceneVertices.push(...p, ...colors[i].map((v) => (v / 255) * light));
      surfaces.push(surface, 0);
      authoredNormals.push(normals?.[i]);
    }
  }
  function quad(a: number[], b: number[], c: number[], d: number[], color: number[]) {
    triangle(a, b, c, [color, color, color], false);
    triangle(a, c, d, [color, color, color], false);
  }
  function faceColors(data: ModelData, face: number[], tint?: number[]) {
    return face.slice(3, 6).map((index) => {
      const original = data.c[index];
      return tint ? tint.map((v) => v * (0.7 + Math.max(...original) / 850)) : original;
    });
  }
  function terrain(x: number, z: number) {
    let top = rgb(hash(x, z) > 0.5 ? '#9db58c' : '#a1b890');
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
  function model(
    name: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
    angle = 0,
    tint?: number[],
  ) {
    if (capture)
      capture.push({
        id: `part-${capture.length + 1}`,
        asset: (modelIds as Record<string, string>)[name],
        position: [x, y, z],
        rotation: [0, -angle, 0],
        scale: [sx, sy, sz],
        ...(tint ? { tint: [...tint] as [number, number, number] } : {}),
      });
    let a = models[name],
      co = Math.cos(angle),
      si = Math.sin(angle),
      points = a.p.map((p) => [
        x + p[0] * sx * co - p[2] * sz * si,
        y + p[1] * sy,
        z + p[0] * sx * si + p[2] * sz * co,
      ]);
    for (const [faceIndex, f] of a.f.entries()) {
      const normals = a.fn?.[faceIndex].map((index) => {
        const n = a.n![index];
        const nx = n[0] / sx,
          ny = n[1] / sy,
          nz = n[2] / sz;
        const length = Math.hypot(nx, ny, nz);
        return [(nx * co - nz * si) / length, ny / length, (nx * si + nz * co) / length];
      });
      const colors = faceColors(a, f, tint);
      triangle(
        points[f[0]],
        points[f[1]],
        points[f[2]],
        colors,
        true,
        realtimeLighting ? (a.s?.[faceIndex] ?? buildingSurface(name, colors)) : 0,
        normals,
      );
    }
  }
  function parts(items: ObjectPart[], x = 0, z = 0) {
    for (const part of items) {
      const data = objectAssets[part.asset];
      const matrix = Matrix.Compose(
        Vector3.FromArray(part.scale),
        Quaternion.FromEulerAngles(...part.rotation),
        Vector3.FromArray(part.position),
      );
      const points = data.p.map((p) => {
        const v = Vector3.TransformCoordinates(Vector3.FromArray(p), matrix);
        return [v.x + x, v.y, v.z + z];
      });
      // Normals transform by the inverse transpose, including non-uniform editor scaling.
      const normalMatrix = data.n && Matrix.Transpose(matrix.clone().invert());
      const normals =
        normalMatrix &&
        data.n!.map((n) =>
          Vector3.TransformNormal(Vector3.FromArray(n), normalMatrix).normalize().asArray(),
        );
      for (const [faceIndex, f] of data.f.entries()) {
        const colors = faceColors(data, f, part.tint);
        triangle(
          points[f[0]],
          points[f[1]],
          points[f[2]],
          colors,
          true,
          realtimeLighting ? (data.s?.[faceIndex] ?? buildingSurface(part.asset, colors)) : 0,
          data.fn?.[faceIndex].map((index) => normals![index]),
        );
      }
    }
  }
  function shadow(x: number, z: number, rx: number, rz: number) {
    if (realtimeLighting) return;
    for (let i = 0; i < 20; i++) {
      let a = (i * Math.PI) / 10,
        b = ((i + 1) * Math.PI) / 10;
      triangle(
        [x, 0.012, z],
        [x + Math.cos(a) * rx, 0.012, z + Math.sin(a) * rz],
        [x + Math.cos(b) * rx, 0.012, z + Math.sin(b) * rz],
        [rgb('#869f79'), rgb('#869f79'), rgb('#869f79')],
        false,
      );
    }
  }
  const roofs = [
    [65, 142, 133],
    [182, 93, 68],
    [100, 115, 148],
    [148, 111, 72],
  ];
  function cottage(x: number, z: number, size = 0.88, y = 0.035, variant = 0) {
    const height = variant % 2 ? size * 1.18 : size * 0.86;
    const tint = roofs[variant % roofs.length];
    model(variant % 2 ? 'wall-wood-block' : 'wall-block', x, y, z, size, height, size);
    // Отступ предотвращает мерцание совпадающих поверхностей двери и стены.
    model('wall-wood-door', x, y, z + 0.005, size, height, size, Math.PI / 2);
    model('wall-window-shutters', x - 0.005, y, z, size, height, size, Math.PI);
    model('wall-window-glass', x + 0.005, y, z, size, height, size);
    model(
      variant % 3 === 2 ? 'roof-high-gable' : 'roof-gable',
      x,
      y + height,
      z,
      size,
      size * 0.85,
      size,
      0,
      tint,
    );
    model('chimney', x + size * 0.2, y + height + size * 0.15, z - size * 0.2, size * 0.6);
    if (variant % 2)
      model(
        'balcony-wall-fence',
        x,
        y + height * 0.5,
        z + 0.015,
        size * 0.85,
        size * 0.55,
        size * 0.85,
        Math.PI / 2,
      );
  }
  function harbor(b: Building) {
    const layout = harborLayout(b, board);
    const place = (
      name: keyof typeof assets,
      side: number,
      outward: number,
      y: number,
      sx: number,
      sy = sx,
      sz = sx,
      turn = 0,
      tint?: number[],
    ) => {
      const p = layout.point(side, outward);
      model(name, p.x, y, p.z, sx, sy, sz, layout.angle + turn, tint);
    };
    // A short landing joins the back edge of the actual Blender quay to dry land.
    for (let v = 0.2; v < layout.back + 0.25; v += 0.4)
      place('planks', 0, v, PORT_DECK - 0.04, 0.8, 0.6, 0.55, 0, [202, 165, 107]);
    place(
      'starter-port',
      0,
      layout.distance,
      PORT_DECK - PORT_SOURCE_DECK * PORT_SCALE,
      PORT_SCALE,
    );
    if (completed) {
      place('tower-complete-small', -1.85, layout.distance - 0.12, PORT_DECK, 0.23);
      place('flag', -1.85, layout.distance - 0.12, 1.55, 0.23);
    }
  }
  function building(b: Building) {
    const x = b.x + 0.5,
      z = b.z + 0.5;
    const variant = (((Math.floor(b.x) * 3 + Math.floor(b.z)) % 4) + 4) % 4;
    const id = b.t === 'port' && completed ? 'game/beacon' : buildingObjectId(b);
    const custom = overrides ? gameObjectParts(id) : undefined;
    if (custom) {
      if (b.t !== 'road' && b.t !== 'port')
        shadow(
          x + 0.03,
          z + 0.06,
          0.52 * objectSettings(id).scale,
          0.45 * objectSettings(id).scale,
        );
      if (b.t === 'port') {
        const layout = harborLayout(b, board);
        const [dx, dz] = layout.direction;
        const shore = Quaternion.FromEulerAngles(0, Math.atan2(dx, dz), 0);
        parts(
          custom.map((part) => {
            const position = [...part.position] as [number, number, number];
            // Базовый пирс вынесен на 1,8; у вырезанных берегов удлиняем морскую часть.
            if (position[2] >= 0.9) position[2] += layout.distance - 1.8;
            return {
              ...part,
              position: [
                dz * position[0] + dx * position[2],
                position[1],
                -dx * position[0] + dz * position[2],
              ],
              rotation: shore
                .multiply(Quaternion.FromEulerAngles(...part.rotation))
                .toEulerAngles()
                .asArray() as [number, number, number],
            };
          }),
          x,
          z,
        );
      } else parts(custom, x, z);
      return;
    }
    if (b.t === 'road') {
      model('planks', x, 0.018, z, 0.96, 0.6, 0.96);
      return;
    }
    if (b.t === 'port') {
      harbor(b);
      return;
    }
    shadow(x + 0.03, z + 0.06, 0.52, 0.45);
    if (b.t === 'house') {
      model('cottage-house', x, COTTAGE_GROUND, z, COTTAGE_SCALE);
    }
    if (b.t === 'hall') {
      cottage(x, z, 0.97, 0.03, 1);
      model('wall-block', x - 0.29, 0.03, z + 0.08, 0.38, 1.65, 0.38);
      model('roof-high-point', x - 0.29, 1.68, z + 0.08, 0.5, 0.65, 0.5, 0, roofs[1]);
      model('banner-red', x - 0.29, 0.76, z + 0.09, 0.48, 0.7, 0.48, Math.PI / 2);
    }
    if (b.t === 'farm') {
      // Силуэт мельницы и ряды посевов отличают ферму от жилого дома.
      cottage(x - 0.14, z - 0.1, 0.64, 0.03, 3);
      model('wall-wood-block', x - 0.15, 0.45, z - 0.09, 0.35, 0.9, 0.35);
      model('roof-high-point', x - 0.15, 1.35, z - 0.09, 0.45, 0.35, 0.45, 0, roofs[3]);
      model('windmill', x - 0.15, 1.15, z + 0.29, 0.32, 0.32, 0.32, Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        model('planks', x + 0.32, 0.024, z - 0.32 + i * 0.2, 0.25, 0.4, 0.12);
        model('hedge', x + 0.25, 0.04, z - 0.32 + i * 0.2, 0.26, 0.6, 0.16);
      }
      model('fence', x, 0.025, z - 0.42, 0.9, 0.75, 0.85, Math.PI / 2);
    }
    if (b.t === 'shop') {
      cottage(x, z - 0.14, 0.72, 0.03, 0);
      model(variant % 2 ? 'stall-green' : 'stall-red', x, 0.03, z + 0.28, 0.72, 0.72, 0.45);
      model('cart', x + 0.36, 0.035, z + 0.23, 0.2);
      model('crate', x - 0.38, 0.035, z + 0.34, 0.2);
    }
  }

  function finish(smooth = false) {
    const p: number[] = [],
      c: number[] = [];
    for (let i = 0; i < sceneVertices.length; i += 6) {
      p.push(...sceneVertices.slice(i, i + 3));
      c.push(...sceneVertices.slice(i + 3, i + 6), 1);
    }
    const geometry = new VertexData();
    geometry.positions = p;
    geometry.colors = c;
    geometry.uvs = surfaces;
    geometry.indices = Array.from({ length: p.length / 3 }, (_, i) => i);
    geometry.normals = [];
    VertexData.ComputeNormals(p, geometry.indices, geometry.normals, {
      useRightHandedSystem: realtimeLighting,
    });
    if (smooth) softenNormals(geometry);
    // Keep the source's bevel/weighted normals after smoothing other buildings.
    for (const [i, normal] of authoredNormals.entries())
      if (normal)
        for (let axis = 0; axis < 3; axis++) geometry.normals[i * 3 + axis] = normal[axis];
    return geometry;
  }
  function streetDecoration(x: number, z: number, fountain: boolean) {
    if (fountain) {
      model('fountain-round', x + 0.5, 0.065, z + 0.5, 0.18);
      model('fountain-center', x + 0.5, 0.065, z + 0.5, 0.18);
    } else model('lantern', x + 0.9, 0.07, z + 0.1, 0.38);
  }
  function onIsland(building: Building, draw: () => void) {
    const start = sceneVertices.length;
    draw();
    const x = building.x + 0.5,
      z = building.z + 0.5,
      elevation = buildingElevation(building, board.seed ?? 0);
    // Расстояния между участками растут вместе с островом, дома сохраняют
    // габариты. Настилы дорог и гавани растягиваются, чтобы оставаться связными.
    const spread = building.t === 'road' || building.t === 'port' ? ISLAND_SPREAD : 1;
    for (let i = start; i < sceneVertices.length; i += 6) {
      const ground =
        building.t === 'road'
          ? terrainHeight(sceneVertices[i], sceneVertices[i + 2], board.seed ?? 0, islandBuildings)
          : elevation;
      sceneVertices[i] = sceneCoordinate(x) + (sceneVertices[i] - x) * spread;
      sceneVertices[i + 1] += ground;
      // Scale the port uniformly around its deck: the original model keeps its proportions.
      if (building.t === 'port')
        sceneVertices[i + 1] = PORT_DECK + (sceneVertices[i + 1] - PORT_DECK) * spread;
      sceneVertices[i + 2] = sceneCoordinate(z) + (sceneVertices[i + 2] - z) * spread;
    }
  }
  return { terrain, building, model, parts, shadow, streetDecoration, finish, onIsland };
}
/** Полностью пересобирается только при изменении списка построек. */
export function islandGeometry(buildings: Building[], board: Board, completed = false) {
  const b = builder(board, completed, assets, undefined, true, true, buildings);
  // Маленькая площадь использует построенную улицу, не захватывая свободные клетки.
  const roads = new Set(buildings.filter((p) => p.t === 'road').map((p) => `${p.x},${p.z}`));
  const roadNeighbors = (road: Building) =>
    [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ].filter(([dx, dz]) => roads.has(`${road.x + dx},${road.z + dz}`)).length;
  const roadTemplate = (road: Building) => {
    const neighbors = roadNeighbors(road);
    return neighbors >= 3
      ? gameObjectParts('game/fountain')
      : (road.x + road.z) % 3 === 0
        ? gameObjectParts('game/lantern')
        : undefined;
  };
  for (const building of buildings) {
    // Композиция дороги с декором уже содержит настил: второй дал бы мерцание.
    if (building.t !== 'road' || !roadTemplate(building))
      b.onIsland(building, () => b.building(building));
  }
  for (const road of buildings.filter((p) => p.t === 'road')) {
    const neighbors = roadNeighbors(road);
    const decoration = roadTemplate(road);
    b.onIsland(road, () => {
      if (decoration && (neighbors >= 3 || (road.x + road.z) % 3 === 0)) {
        b.parts(decoration, road.x + 0.5, road.z + 0.5);
      } else if (neighbors >= 3) {
        b.streetDecoration(road.x, road.z, true);
      } else if ((road.x + road.z) % 3 === 0) {
        b.streetDecoration(road.x, road.z, false);
      }
    });
  }
  const environment = environmentGeometry(board, buildings, ISLAND_SPREAD);
  // У природных граней сохраняем плоские нормали: резные скалы должны читаться.
  const built = b.finish(true);
  return environment.merge(built, true);
}
/** Корабль — отдельный объект; анимация не пересоздаёт геометрию острова. */
export function shipGeometry(realtimeLighting = false) {
  const b = builder(
    { size: 0, isLand: () => false, shoreDirection: () => null },
    false,
    assets,
    undefined,
    true,
    realtimeLighting,
  );
  const custom = gameObjectParts('game/ship');
  if (custom) b.parts(custom);
  else b.model('ship-small', 0, 0, 0, 0.19, 0.19, 0.19);
  return b.finish();
}

const previewBoard: Board = {
  size: 0,
  isLand: () => false,
  shoreDirection: () => [0, 1],
};

/** Просмотрщик вызывает те же сборщики, поэтому правки сразу видны и в игре, и здесь. */
export function buildingGeometry(building: Building, completed = false) {
  const b = builder(previewBoard, completed);
  b.building(building);
  return b.finish();
}
export function terrainGeometry() {
  const b = builder(previewBoard);
  b.terrain(0, 0);
  return b.finish();
}
export function streetGeometry(fountain: boolean) {
  const b = builder(previewBoard);
  const custom = gameObjectParts(fountain ? 'game/fountain' : 'game/lantern');
  if (custom) b.parts(custom, 0.5, 0.5);
  else {
    b.building({ t: 'road', x: 0, z: 0 });
    b.streetDecoration(0, 0, fountain);
  }
  return b.finish();
}
export function modelGeometry(data: ModelData) {
  const b = builder(previewBoard, false, { preview: data });
  b.model('preview', 0, 0, 0);
  return b.finish();
}

/** Исходная сборка переводится в детали без копирования рецептов зданий в редактор. */
export function defaultObjectParts(id: string): ObjectPart[] {
  const result: ObjectPart[] = [];
  const b = builder(previewBoard, id === 'game/beacon', assets, result, false);
  let center = 0.5;
  if (id === 'game/ship') {
    b.model('ship-small', 0, 0, 0, 0.19);
    center = 0;
  } else if (id === 'game/fountain' || id === 'game/lantern') {
    b.building({ t: 'road', x: 0, z: 0 });
    b.streetDecoration(0, 0, id === 'game/fountain');
  } else {
    const [, type, variant] = id.split('/');
    const t = type === 'beacon' ? 'port' : type;
    if (!['house', 'shop', 'farm', 'hall', 'road', 'port'].includes(t)) return [];
    const z = Number(variant ?? 0);
    b.building({ t: t as Building['t'], x: 0, z });
    for (const part of result) part.position[2] -= z;
  }
  for (const part of result) {
    part.position[0] -= center;
    part.position[2] -= center;
  }
  return result;
}
function gameObjectParts(id: string) {
  const scale = objectSettings(id).scale;
  const parts = objectTemplate(id) ?? (scale !== 1 ? defaultObjectParts(id) : undefined);
  return parts && scaleObjectParts(parts, scale);
}
export function objectPartGeometry(part: ObjectPart) {
  const b = builder(previewBoard);
  b.parts([part]);
  const transform = Matrix.Compose(
    Vector3.FromArray(part.scale),
    Quaternion.FromEulerAngles(...part.rotation),
    Vector3.FromArray(part.position),
  );
  // Запекаем свет в мировой ориентации, но оставляем локальные вершины для манипулятора.
  return b.finish().transform(transform.invert());
}
