import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager.js';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { copyParts, editableObjectIds, objectTemplate, type ObjectPart } from '../objects/index.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import {
  buildingGeometry,
  defaultObjectParts,
  objectPartGeometry,
  modelGeometry,
  shipGeometry,
  streetGeometry,
  terrainGeometry,
  registerObjectAssets,
} from '../scene/index.js';
import { createPerson, createSmoke, lifeColors } from '../scene/index.js';
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
registerObjectAssets(library);
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
  const gizmos = new GizmoManager(scene);
  gizmos.usePointerToAttachGizmos = false;
  gizmos.enableAutoPicking = false;
  gizmos.scaleRatio = 1.2;
  let meshes = new Map<string, Mesh>();
  let parts: ObjectPart[] = [];
  let picked: string | null = null;
  let mode: 'position' | 'rotation' | 'scale' = 'position';
  let onPick = (_id: string | null) => {};
  let onChange = (_parts: ObjectPart[]) => {};
  let snap = true;
  let grid: ReturnType<typeof CreateLineSystem> | undefined;
  function attach(id: string | null) {
    picked = id;
    for (const [key, mesh] of meshes) mesh.showBoundingBox = key === id;
    gizmos.attachToMesh(id ? (meshes.get(id) ?? null) : null);
  }
  function setMode(next: typeof mode) {
    mode = next;
    gizmos.positionGizmoEnabled = mode === 'position';
    gizmos.rotationGizmoEnabled = mode === 'rotation';
    gizmos.scaleGizmoEnabled = mode === 'scale';
    attach(picked);
    const current = gizmos.gizmos[`${mode}Gizmo`];
    if (current) {
      current.snapDistance = snap ? (mode === 'rotation' ? Math.PI / 12 : 0.05) : 0;
      if (!observed.has(current)) {
        observed.add(current);
        current.onDragStartObservable.add(() => camera.detachControl());
        current.onDragEndObservable.add(() => {
          camera.attachControl(canvas, true);
          for (const part of parts) {
            const mesh = meshes.get(part.id)!;
            part.position = mesh.position.asArray() as ObjectPart['position'];
            part.rotation = (
              mesh.rotationQuaternion?.toEulerAngles() ?? mesh.rotation
            ).asArray() as ObjectPart['rotation'];
            part.scale = mesh.scaling
              .asArray()
              .map((v) => Math.max(0.01, Math.min(100, v))) as ObjectPart['scale'];
            part.position = part.position.map((v) =>
              Math.max(-100, Math.min(100, v)),
            ) as ObjectPart['position'];
          }
          onChange(copyParts(parts));
        });
      }
    }
  }
  const observed = new WeakSet<object>();
  scene.onPointerObservable.add((event) => {
    if (event.type !== PointerEventTypes.POINTERTAP || gizmos.isHovered || gizmos.isDragging)
      return;
    const mesh = event.pickInfo?.pickedMesh;
    const id = [...meshes].find(([, value]) => value === mesh)?.[0];
    if (id) {
      attach(id);
      onPick(id);
    }
  });
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
  function clear() {
    attach(null);
    meshes.clear();
    grid = undefined;
    for (const node of [...scene.transformNodes]) node.dispose();
    for (const mesh of [...scene.meshes]) mesh.dispose();
    for (const material of [...scene.materials]) material.dispose();
  }
  function palette() {
    const material = new StandardMaterial('palette', scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    return material;
  }
  function measure(fit = true, minExtent = 0.001) {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    let triangles = 0;
    for (const mesh of scene.meshes) {
      if (mesh.metadata?.editorHelper) continue;
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(bounds.minimumWorld);
      max.maximizeInPlace(bounds.maximumWorld);
      triangles += mesh.getTotalIndices() / 3;
    }
    if (!triangles) {
      min.set(-0.5, 0, -0.5);
      max.set(0.5, 1, 0.5);
    }
    const size = max.subtract(min);
    if (fit) {
      const frameMin = grid ? Vector3.Minimize(min, new Vector3(-0.6, 0, -0.6)) : min;
      const frameMax = grid ? Vector3.Maximize(max, new Vector3(0.6, 0.1, 0.6)) : max;
      target = frameMin.add(frameMax).scale(0.5);
      extent = Math.max(frameMax.subtract(frameMin).length() / 2, minExtent);
      engine.resize();
      fitRadius();
      resetCamera();
    }
    return {
      triangles,
      size: [size.x, size.y, size.z],
      outside: min.x < -0.501 || max.x > 0.501 || min.z < -0.501 || max.z > 0.501,
    };
  }
  function setParts(next: ObjectPart[], id: string | null, fit = false) {
    clear();
    parts = copyParts(next);
    const material = palette();
    for (const part of parts) {
      const mesh = new Mesh(part.id, scene);
      objectPartGeometry(part).applyToMesh(mesh);
      mesh.material = material;
      mesh.position.copyFromFloats(...part.position);
      mesh.rotation.copyFromFloats(...part.rotation);
      mesh.scaling.copyFromFloats(...part.scale);
      meshes.set(part.id, mesh);
    }
    const lines: Vector3[][] = [];
    for (let i = 0; i <= 10; i++) {
      const n = -0.5 + i / 10;
      lines.push([new Vector3(n, 0.002, -0.5), new Vector3(n, 0.002, 0.5)]);
      lines.push([new Vector3(-0.5, 0.002, n), new Vector3(0.5, 0.002, n)]);
    }
    grid = CreateLineSystem('building-cell-grid', { lines }, scene);
    grid.color = Color3.FromHexString('#c7b37f');
    grid.alpha = 0.4;
    grid.isPickable = false;
    grid.metadata = { editorHelper: true };
    const cell = CreateGround('building-cell', { width: 1, height: 1 }, scene);
    cell.position.y = -0.004;
    cell.isPickable = false;
    cell.metadata = { editorHelper: true };
    const floor = new StandardMaterial('building-cell-material', scene);
    floor.disableLighting = true;
    floor.emissiveColor = Color3.FromHexString('#a6b08b');
    floor.alpha = 0.8;
    floor.backFaceCulling = false;
    cell.material = floor;
    // Контур имеет физическую ширину 0,012 игровой единицы и остаётся видимым на фоне.
    const edgeLines = [-0.006, 0, 0.006].map((offset) => [
      new Vector3(-0.5 + offset, 0.004, -0.5 + offset),
      new Vector3(0.5 - offset, 0.004, -0.5 + offset),
      new Vector3(0.5 - offset, 0.004, 0.5 - offset),
      new Vector3(-0.5 + offset, 0.004, 0.5 - offset),
      new Vector3(-0.5 + offset, 0.004, -0.5 + offset),
    ]);
    const border = CreateLineSystem('building-cell-border', { lines: edgeLines }, scene);
    border.color = Color3.FromHexString('#ffe2a5');
    border.metadata = { editorHelper: true };
    border.isPickable = false;
    const stats = measure(fit, 0.7);
    setMode(mode);
    attach(id);
    return stats;
  }
  return {
    setParts,
    getParts(id: string) {
      return copyParts(objectTemplate(id) ?? defaultObjectParts(id));
    },
    bindEditor(select: typeof onPick, change: typeof onChange) {
      onPick = select;
      onChange = change;
    },
    setMode,
    setSnap(value: boolean) {
      snap = value;
      setMode(mode);
    },
    attach,
    select(id: string) {
      const entry = entries.find((entry) => entry.id === id);
      if (!entry) throw new Error(`Неизвестный объект: ${id}`);
      if (editableObjectIds.includes(id))
        return setParts(copyParts(objectTemplate(id) ?? defaultObjectParts(id)), null, true);
      clear();
      parts = [];
      entry.create(scene, palette());
      return measure();
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
    resetCamera() {
      measure(true, grid ? 0.7 : 0.001);
    },
    dispose() {
      resize.disconnect();
      gizmos.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
