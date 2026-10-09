import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import {
  buildingGeometry,
  modelGeometry,
  shipGeometry,
  streetGeometry,
  terrainGeometry,
} from './geometry.js';
import { createPerson, createSmoke, lifeColors } from './life.js';
import library from '../../.generated/library-models.json';

export interface PreviewObject {
  id: string;
  name: string;
  group: string;
  source: string;
}
interface Entry extends PreviewObject {
  create(scene: Scene, material: StandardMaterial): void;
}
const entries: Entry[] = [];
const geometryEntry = (
  id: string,
  name: string,
  geometry: () => ReturnType<typeof modelGeometry>,
  source = 'src/scene/geometry.ts',
  group = 'Объекты игры',
) =>
  entries.push({
    id,
    name,
    source,
    group,
    create(scene, material) {
      const mesh = new Mesh(id, scene);
      geometry().applyToMesh(mesh);
      mesh.material = material;
    },
  });
for (const [type, name, variants] of [
  ['house', 'Жилой дом', 4],
  ['shop', 'Магазин', 2],
  ['farm', 'Ферма и мельница', 1],
  ['hall', 'Ратуша', 1],
  ['road', 'Дорога', 1],
] as const) {
  for (let variant = 0; variant < variants; variant++) {
    geometryEntry(
      `game/${type}/${variant}`,
      `${name}${variants > 1 ? ` · вариант ${variant + 1}` : ''}`,
      () => buildingGeometry({ t: type, x: 0, z: variant }),
    );
  }
}
geometryEntry('game/port', 'Порт', () => buildingGeometry({ t: 'port', x: 0, z: 0 }));
geometryEntry('game/beacon', 'Порт с маяком', () =>
  buildingGeometry({ t: 'port', x: 0, z: 0 }, true),
);
geometryEntry('game/ship', 'Корабль переселенцев', shipGeometry);
geometryEntry('game/terrain', 'Участок острова', terrainGeometry);
geometryEntry('game/fountain', 'Дорога с фонтаном', () => streetGeometry(true));
geometryEntry('game/lantern', 'Дорога с фонарём', () => streetGeometry(false));
for (const [variant, color] of lifeColors.coats.entries()) {
  entries.push({
    id: `game/person/${variant}`,
    name: `Житель · одежда ${variant + 1}`,
    group: 'Объекты игры',
    source: 'src/scene/life.ts',
    create(scene) {
      const coat = new StandardMaterial('coat', scene);
      coat.disableLighting = true;
      coat.emissiveColor = Color3.FromHexString(color);
      const skin = new StandardMaterial('skin', scene);
      skin.disableLighting = true;
      skin.emissiveColor = Color3.FromHexString(lifeColors.skin);
      createPerson(scene, variant, coat, skin).setEnabled(true);
    },
  });
}
entries.push({
  id: 'game/smoke',
  name: 'Дым из трубы',
  group: 'Объекты игры',
  source: 'src/scene/life.ts',
  create(scene) {
    const material = new StandardMaterial('smoke', scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(lifeColors.smoke);
    material.alpha = 0.22;
    createSmoke(scene, material);
  },
});
for (const [id, data] of Object.entries(library)) {
  const [pack, name] = id.split('/');
  geometryEntry(
    id,
    name,
    () => modelGeometry(data),
    `assets/${pack}/Models/OBJ format/${name}.obj`,
    pack === 'kenney-fantasy-town' ? 'Fantasy Town · детали' : 'Pirate Kit · детали',
  );
}

/** Каталог включает каждый OBJ из установленных наборов, даже ещё не использованный в городе. */
export const previewObjects: readonly PreviewObject[] = entries.map(
  ({ id, name, group, source }) => ({ id, name, group, source }),
);

export function createObjectPreview(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.imageProcessingConfiguration.isEnabled = false;
  const camera = new ArcRotateCamera(
    'preview-camera',
    Math.PI / 3,
    Math.PI / 3,
    4,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  camera.panningSensibility = 0;
  camera.wheelDeltaPercentage = 0.01;
  camera.pinchDeltaPercentage = 0.01;
  let radius = 4;
  let extent = 1;
  let target = Vector3.Zero();
  const resize = new ResizeObserver(() => {
    engine.resize();
    fitRadius();
    resetCamera();
  });
  resize.observe(canvas);
  function fitRadius() {
    // Сфера полностью помещается и в узком мобильном окне, и при вращении камеры.
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const halfFov = Math.atan(Math.tan(camera.fov / 2) * Math.min(1, aspect));
    radius = (extent / Math.sin(halfFov)) * 1.15;
    camera.lowerRadiusLimit = extent * 1.05;
    camera.upperRadiusLimit = radius * 5;
    camera.minZ = extent / 100;
    camera.maxZ = radius * 20;
  }
  function resetCamera() {
    camera.target.copyFrom(target);
    camera.alpha = Math.PI / 3;
    camera.beta = Math.PI / 3;
    camera.radius = radius;
  }
  engine.runRenderLoop(() => {
    if (!document.hidden) scene.render();
  });
  return {
    select(id: string) {
      const entry = entries.find((entry) => entry.id === id);
      if (!entry) throw new Error(`Неизвестный объект: ${id}`);
      for (const node of [...scene.transformNodes]) node.dispose();
      for (const mesh of [...scene.meshes]) mesh.dispose();
      for (const material of [...scene.materials]) material.dispose();
      const material = new StandardMaterial('palette', scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.White();
      material.backFaceCulling = false;
      entry.create(scene, material);
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      let triangles = 0;
      for (const mesh of scene.meshes) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        min.minimizeInPlace(bounds.minimumWorld);
        max.maximizeInPlace(bounds.maximumWorld);
        triangles += mesh.getTotalIndices() / 3;
      }
      const size = max.subtract(min);
      target = min.add(max).scale(0.5);
      extent = Math.max(size.length() / 2, 0.001);
      engine.resize();
      fitRadius();
      resetCamera();
      return { triangles, size: [size.x, size.y, size.z] };
    },
    rotate(direction: number) {
      camera.alpha += (direction * Math.PI) / 4;
    },
    zoom(direction: number) {
      camera.radius = Math.max(
        camera.lowerRadiusLimit!,
        Math.min(camera.upperRadiusLimit!, camera.radius * (direction > 0 ? 0.8 : 1.25)),
      );
    },
    resetCamera,
    dispose() {
      resize.disconnect();
      scene.dispose();
      engine.dispose();
    },
  };
}
