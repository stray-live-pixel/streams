import { objectTemplateRevision } from '../objects/index.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Plane } from '@babylonjs/core/Maths/math.plane.js';
import '@babylonjs/core/Culling/ray.js';
import type { Arrival, GameModel, Tile } from '../domain/index.js';
import { buildingCells, proposedBuilding, placementIssue } from '../domain/index.js';
import type { SceneOptions, Passenger } from './types.js';
import { islandGeometry, shipGeometry } from './geometry.js';
import { createCityLife } from './life.js';
import { harborLayout } from './harbor.js';
import { voyageFrame } from './voyage.js';
export {
  defaultObjectParts,
  buildingGeometry,
  objectPartGeometry,
  modelGeometry,
  shipGeometry,
  streetGeometry,
  terrainGeometry,
  registerObjectAssets,
} from './geometry.js';
export { createPerson, createSmoke, lifeColors } from './life.js';

/**
 * Публичный адаптер 3D. Получает снимки и события, никогда не изменяет город.
 * board — переданная география: renderer не импортирует внутренности домена.
 */
export function createScene({ canvas, board, onArrivalFinished, onError }: SceneOptions) {
  const context = canvas.getContext('2d')!;
  const surface = document.createElement('canvas');
  surface.id = 'scene';
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  canvas.before(surface);
  canvas.style.position = 'relative';
  const viewport = canvas.parentElement!;
  let renderer: Engine;
  try {
    renderer = new Engine(surface, true, { alpha: true, preserveDrawingBuffer: true });
  } catch (error) {
    surface.remove();
    throw error;
  }
  const scene = new Scene(renderer);
  // Сохраняем систему координат прежней игры: это важно для старых городов и моделей.
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.imageProcessingConfiguration.isEnabled = false;
  const life = createCityLife(scene);
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let animateCity = true;
  let quality: 'high' | 'low' = 'high';
  let paused = false;
  let pausedAt = 0;
  let pausedDuration = 0;
  const camera = new FreeCamera('city-camera', Vector3.Zero(), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  const material = new StandardMaterial('palette', scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.backFaceCulling = false;
  const ship = new Mesh('arrival-ship', scene);
  shipGeometry().applyToMesh(ship);
  ship.material = material;
  ship.setEnabled(false);
  let island: Mesh | null = null;
  let signature = '';
  let model: GameModel | null = null;
  let hovered: Tile | null = null;
  let arrival: { event: Arrival; started: number } | null = null;
  let width = 0,
    height = 0,
    yaw = -0.68,
    zoom = 1,
    panX = 0,
    panY = 0,
    scale = 1,
    dirty = true,
    frameId = 0;
  const ground = new Plane(0, 1, 0, 0);
  const signal = new AbortController();
  surface.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      onError('3D временно недоступно. Обновите страницу — город сохранён.');
    },
    { signal: signal.signal },
  );
  surface.addEventListener(
    'webglcontextrestored',
    () => {
      dirty = true;
    },
    { signal: signal.signal },
  );
  function updateCamera() {
    const cx = width * (width < 760 ? 0.5 : 0.6) + panX,
      cy = height * (width < 760 ? 0.55 : 0.51) + panY;
    scale = Math.min(width / 20, height / 18) * zoom;
    camera.orthoLeft = -cx / scale;
    camera.orthoRight = (width - cx) / scale;
    camera.orthoTop = cy / scale;
    camera.orthoBottom = -(height - cy) / scale;
    // Изометрический вид сохраняет размер домов при перемещении по острову.
    camera.position.set(
      5.5 + Math.sin(yaw) * 0.86 * 40,
      0.52 * 40,
      5.5 + Math.cos(yaw) * 0.86 * 40,
    );
    camera.setTarget(new Vector3(5.5, 0, 5.5));
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    scene.updateTransformMatrix(true);
    dirty = true;
  }
  function resize() {
    // CSS задаёт логический размер даже до показа скрытого игрового экрана.
    const size = getComputedStyle(canvas);
    width = parseFloat(size.width);
    height = parseFloat(size.height);
    const dpr = quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, 2);
    renderer.setHardwareScalingLevel(1 / dpr);
    renderer.setSize(width * dpr, height * dpr);
    surface.style.width = width + 'px';
    surface.style.height = height + 'px';
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCamera();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  function project(x: number, y: number, z: number) {
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(width, height),
    );
    return { x: p.x, y: p.y };
  }
  function pick(x: number, y: number): Tile | null {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    const distance = ray.intersectsPlane(ground);
    if (distance === null) return null;
    const hit = ray.origin.add(ray.direction.scale(distance));
    const tile = { x: Math.floor(hit.x), z: Math.floor(hit.z) };
    return board.isLand(tile.x, tile.z) ? tile : null;
  }
  function outline(x: number, z: number, color: string) {
    const points = [
      [x + 0.025, z + 0.025],
      [x + 0.975, z + 0.025],
      [x + 0.975, z + 0.975],
      [x + 0.025, z + 0.975],
    ].map(([x, z]) => project(x, 0.025, z));
    context.beginPath();
    points.forEach((p, i) => (i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = '#fff3c8';
    context.lineWidth = 2;
    context.stroke();
  }
  function overlays(seconds: number) {
    context.clearRect(0, 0, width, height);
    if (!model) return;
    if (model.selected === 'port')
      for (let x = 0; x < board.size; x++)
        for (let z = 0; z < board.size; z++) {
          if (
            board.shoreDirection(x, z) &&
            !placementIssue(proposedBuilding('port', x, z, model.footprints), model.buildings)
          )
            outline(x, z, '#f6deb633');
        }
    const tile = hovered;
    if (tile && model.selected) {
      const candidate = proposedBuilding(model.selected, tile.x, tile.z, model.footprints);
      const allowed =
        !placementIssue(candidate, model.buildings) &&
        (model.selected !== 'port' || board.shoreDirection(tile.x, tile.z));
      for (const cell of buildingCells(candidate))
        outline(cell.x, cell.z, allowed ? '#ebf9c344' : '#e8a08b77');
    }
    // Тонкие блики остаются только на воде. Это декоративный слой, не клетки карты.
    context.strokeStyle = '#e4f0dd66';
    context.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const x = ((i * 7) % 23) - 6,
        z = ((i * 11) % 23) - 6;
      if (board.isLand(Math.floor(x), Math.floor(z))) continue;
      const drift =
        !animateCity || motionPreference.matches ? 0 : Math.sin(seconds * 0.35 + i) * 0.3;
      const a = project(x + drift, -0.3, z),
        b = project(x + 0.45 + drift, -0.3, z);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    if (model.won) {
      const port = model.buildings.find((b) => b.t === 'port');
      if (port) {
        const h = harborLayout(port, board),
          p = h.point(-0.7, h.distance);
        const light = project(p.x, 1.77, p.z);
        const glow = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, 28);
        glow.addColorStop(0, '#fff6bbdd');
        glow.addColorStop(1, '#ffe49b00');
        context.fillStyle = glow;
        context.fillRect(light.x - 28, light.y - 28, 56, 56);
      }
    }
  }

  let previousFrame = 0;
  function frame(now: number) {
    if (paused) return;
    const reducedMotion = !animateCity || motionPreference.matches;
    if (now - previousFrame < (quality === 'low' ? 50 : 32) && !dirty) {
      frameId = requestAnimationFrame(frame);
      return;
    }
    previousFrame = now;
    let passengers: Passenger[] = [];
    if (arrival) {
      const result = voyageFrame(
        arrival.event,
        (now - arrival.started) / 1000,
        board.shoreDirection(arrival.event.port.x, arrival.event.port.z) ?? [0, 1],
        harborLayout(arrival.event.port, board).distance + 1.45,
      );
      ship.position.set(result.x, -0.25, result.z);
      ship.rotation.y = result.rotation;
      passengers = result.passengers;
      dirty = true;
      if (result.done) {
        arrival = null;
        ship.setEnabled(false);
        onArrivalFinished();
      }
    }
    const seconds = (now - pausedDuration) / 1000;
    life.update(seconds, passengers, reducedMotion);
    if (dirty || (!!model?.pop && !reducedMotion)) {
      scene.render();
      // Babylon компилирует шейдеры асинхронно: первый render ещё может быть пустым.
      // Продолжаем кадры до готовности, затем экономим GPU на неподвижном острове.
      dirty = !scene.isReady();
    }
    overlays(seconds);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  function resetCamera() {
    yaw = -0.68;
    zoom = 1;
    panX = panY = 0;
    updateCamera();
  }
  return {
    setPaused(next: boolean) {
      if (paused === next) return;
      paused = next;
      if (next) {
        pausedAt = performance.now();
        cancelAnimationFrame(frameId);
        hovered = null;
      } else {
        const duration = performance.now() - pausedAt;
        pausedDuration += duration;
        if (arrival) arrival.started += duration;
        dirty = true;
        frameId = requestAnimationFrame(frame);
      }
    },
    setSettings(settings: { quality: 'high' | 'low'; animateCity: boolean }) {
      animateCity = settings.animateCity;
      if (quality !== settings.quality) {
        quality = settings.quality;
        resize();
      }
      dirty = true;
    },
    setModel(next: GameModel) {
      model = next;
      life.setModel(next);
      const key = JSON.stringify([next.buildings, next.won, objectTemplateRevision()]);
      if (key !== signature) {
        if (island) {
          island.dispose();
        }
        shipGeometry().applyToMesh(ship);
        island = new Mesh('island', scene);
        islandGeometry(next.buildings, board, next.won).applyToMesh(island);
        island.material = material;
        signature = key;
        dirty = true;
      }
    },
    playArrival(event: Arrival) {
      arrival = { event, started: performance.now() };
      ship.setEnabled(true);
      resetCamera();
    },
    reset() {
      arrival = null;
      ship.setEnabled(false);
      hovered = null;
      resetCamera();
    },
    rotate(direction: number) {
      yaw += (direction * Math.PI) / 4;
      updateCamera();
    },
    pan(dx: number, dy: number) {
      panX += dx;
      panY += dy;
      updateCamera();
    },
    zoom(delta: number) {
      zoom = Math.max(0.65, Math.min(2, zoom + delta));
      updateCamera();
    },
    hover(tile: Tile | null) {
      hovered = tile;
    },
    pick,
    project,
    resetCamera,
    dispose() {
      cancelAnimationFrame(frameId);
      signal.abort();
      observer.disconnect();
      scene.dispose();
      renderer.dispose();
      surface.remove();
    },
  };
}

export type CityScene = ReturnType<typeof createScene>;
