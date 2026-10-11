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
import {
  buildingCells,
  proposedBuilding,
  continuousPlacementIssue,
  createWorld,
} from '../domain/index.js';
import type { SceneOptions, Passenger } from './types.js';
import { islandGeometry, shipGeometry } from './geometry.js';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess.js';
import { createLighting } from './lighting.js';
import { createOcean } from './ocean.js';
import { createLens } from './lens.js';
import { PaintedScenery } from './painted-material.js';
import { coastalSurfaceHeight } from './cliff-layout.js';
import { sceneCoordinate, boardCoordinate, ISLAND_SPREAD } from './space.js';
import { createCityLife } from './life.js';
import { harborLayout } from './harbor.js';
import { voyageFrame } from './voyage.js';
import { createCameraMotion } from './camera.js';
import type { CameraAction } from './camera.js';
export type { CameraAction, CameraState } from './camera.js';
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
export function createScene({
  canvas,
  board,
  onArrivalFinished,
  onError,
  onTimeChanged,
}: SceneOptions) {
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
  camera.maxZ = 650;
  new FxaaPostProcess('soft-edges', 1, camera);
  const lens = createLens(camera);
  const lighting = createLighting(scene, camera, (label) => onTimeChanged?.(label));
  const material = new StandardMaterial('palette', scene);
  material.disableLighting = false;
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.twoSidedLighting = false;
  material.backFaceCulling = false;
  const painted = new PaintedScenery(material);
  const ocean = createOcean(scene, camera, painted.natureTexture);
  const ship = new Mesh('arrival-ship', scene);
  const shipData = shipGeometry(true);
  shipData.uvs = new Array((shipData.positions!.length / 3) * 2).fill(0);
  shipData.applyToMesh(ship);
  ship.material = material;
  ship.setEnabled(false);
  let island: Mesh | null = null;
  let signature = '';
  let model: GameModel | null = null;
  let hovered: Tile | null = null;
  let arrival: { event: Arrival; started: number } | null = null;
  const motion = createCameraMotion();
  let width = 0,
    height = 0,
    scale = 1,
    dirty = true,
    frameId = 0;
  const upperGround = new Plane(0, 1, 0, -4);
  // The sandy apron sits below zero but above the sea; picking must reach it.
  const lowerGround = new Plane(0, 1, 0, 1.2);
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
    const { x, z, yaw, pitch, zoom } = motion.state;
    const cx = width * (width < 760 ? 0.5 : 0.6),
      cy = height * (width < 760 ? 0.55 : 0.51);
    scale = Math.min(width / 20, height / 18) * zoom;
    camera.orthoLeft = -cx / scale;
    camera.orthoRight = (width - cx) / scale;
    camera.orthoTop = cy / scale;
    camera.orthoBottom = -(height - cy) / scale;
    const eyeHeight = Math.max(3.2, Math.sin(pitch) * 40);
    // Изометрический вид сохраняет размер домов при перемещении по острову.
    camera.position.set(
      x + Math.sin(yaw) * Math.cos(pitch) * 40,
      eyeHeight,
      z + Math.cos(yaw) * Math.cos(pitch) * 40,
    );
    camera.setTarget(new Vector3(x, eyeHeight - Math.sin(pitch) * 40, z));
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
  function projectWorld(x: number, y: number, z: number) {
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(width, height),
    );
    return { x: p.x, y: p.y };
  }
  function heightAt(x: number, z: number) {
    return coastalSurfaceHeight(x, z, board.seed ?? 0, model?.buildings ?? []);
  }
  function project(x: number, y: number, z: number) {
    return projectWorld(sceneCoordinate(x), y + heightAt(x, z), sceneCoordinate(z));
  }
  function pick(x: number, y: number): Tile | null {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
    if (ray.direction.y >= -0.0001) return null;
    const start = ray.intersectsPlane(upperGround) ?? 0,
      end = ray.intersectsPlane(lowerGround);
    if (end === null) return null;
    const difference = (distance: number) => {
      const point = ray.origin.add(ray.direction.scale(distance));
      return point.y - heightAt(boardCoordinate(point.x), boardCoordinate(point.z));
    };
    let previous = Math.max(0, start),
      distance = end;
    // Берём первое пересечение: пологие холмы могут перекрывать дальнюю землю.
    for (let i = 1; i <= 64; i++) {
      const next = Math.max(0, start) + ((end - Math.max(0, start)) * i) / 64;
      if (difference(next) <= 0) {
        let low = previous,
          high = next;
        for (let j = 0; j < 24; j++) {
          const middle = (low + high) / 2;
          if (difference(middle) > 0) low = middle;
          else high = middle;
        }
        distance = (low + high) / 2;
        break;
      }
      previous = next;
    }
    const point = ray.origin.add(ray.direction.scale(distance));
    const hit = { x: boardCoordinate(point.x), z: boardCoordinate(point.z) };
    if (hit.x < -2 || hit.z < -2 || hit.x > board.size + 2 || hit.z > board.size + 2) return null;
    return { x: hit.x - 0.5, z: hit.z - 0.5 };
  }
  function placementOutline(candidate: Parameters<typeof buildingCells>[0], allowed: boolean) {
    const cells = buildingCells(candidate);
    const edges = new Map<string, [number, number][]>();
    context.beginPath();
    for (const cell of cells) {
      const corners: [number, number][] = [
        [cell.x, cell.z],
        [cell.x + 1, cell.z],
        [cell.x + 1, cell.z + 1],
        [cell.x, cell.z + 1],
      ];
      corners.forEach((p, i) => {
        const screen = project(p[0], 0.035, p[1]);
        if (i) context.lineTo(screen.x, screen.y);
        else context.moveTo(screen.x, screen.y);
        const q = corners[(i + 1) % 4];
        const key = [p.join(','), q.join(',')].sort().join('|');
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [p, q]);
      });
      context.closePath();
    }
    context.fillStyle = allowed ? '#ebf9c344' : '#e8a08b77';
    context.fill();
    context.beginPath();
    for (const [a, b] of edges.values()) {
      const p = project(a[0], 0.035, a[1]),
        q = project(b[0], 0.035, b[1]);
      context.moveTo(p.x, p.y);
      context.lineTo(q.x, q.y);
    }
    // The dock is part of the placement preview; no map-wide grid of available cells.
    if (candidate.t === 'port') {
      const layout = harborLayout(candidate, board);
      const perimeter = [
        [-0.45, 0],
        [0.45, 0],
        [0.45, layout.distance - 0.9],
        [1.5, layout.distance - 0.9],
        [1.5, layout.distance + 0.9],
        [-1.5, layout.distance + 0.9],
        [-1.5, layout.distance - 0.9],
        [-0.45, layout.distance - 0.9],
      ];
      perimeter.forEach(([side, depth], i) => {
        const p = layout.point(side, depth),
          screen = project(p.x, 0.035, p.z);
        if (i) context.lineTo(screen.x, screen.y);
        else context.moveTo(screen.x, screen.y);
      });
      context.closePath();
    }
    context.strokeStyle = allowed ? '#fff3c8' : '#e87962';
    context.lineWidth = 2;
    context.stroke();
  }
  function overlays(seconds: number) {
    context.clearRect(0, 0, width, height);
    if (!model) return;
    if (hovered && model.selected) {
      const candidate = proposedBuilding(model.selected, hovered.x, hovered.z, model.footprints);
      const world = createWorld(model.islandSeed);
      const allowed = !continuousPlacementIssue(candidate, model.buildings, world);
      placementOutline(candidate, allowed);
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

  let environmentSeconds = 0;
  let renderMilliseconds = 0;
  let previousFrame = 0;
  let previousMotion = 0;
  let previousEnvironmentFrame = 0;
  let cameraWasMoving = false;
  let resourcesWereReady = false;
  function frame(now: number) {
    if (paused) return;
    const elapsed = previousMotion ? (now - previousMotion) / 1000 : 1 / 60;
    previousMotion = now;
    const cameraMoving = motion.tick(elapsed);
    if (cameraMoving) {
      updateCamera();
      hovered = null;
    }
    // Последний неподвижный кадр отражения должен совпадать с новым ракурсом.
    if (cameraWasMoving && !cameraMoving) {
      ocean.invalidate();
      dirty = true;
    }
    cameraWasMoving = cameraMoving;
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
      ship.position.set(sceneCoordinate(result.x), -0.25, sceneCoordinate(result.z));
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
    if (!reducedMotion && previousEnvironmentFrame)
      environmentSeconds += Math.min((now - previousEnvironmentFrame) / 1000, 0.1);
    previousEnvironmentFrame = now;
    const sun = lighting.update(environmentSeconds);
    ocean.update(environmentSeconds, sun.daylight, sun.sun, now / 1000);
    if (dirty || !reducedMotion) {
      // Проверяем до рисования: после завершения компиляции нужен ещё один полный кадр.
      const resourcesReady = !dirty || (scene.isReady() && lighting.isReady());
      if (resourcesReady && !resourcesWereReady) {
        // Частично готовые проходы не должны остаться последними в замороженной сцене.
        lighting.invalidate();
        ocean.invalidate();
      }
      resourcesWereReady = resourcesReady;
      const renderStarted = performance.now();
      scene.render();
      renderMilliseconds = performance.now() - renderStarted;
      // Babylon компилирует шейдеры асинхронно: первый render ещё может быть пустым.
      // Продолжаем кадры до готовности, затем экономим GPU на неподвижном острове.
      dirty = !resourcesReady;
    }
    overlays(seconds);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  function resetCamera() {
    motion.reset();
  }
  return {
    setPaused(next: boolean) {
      if (paused === next) return;
      paused = next;
      if (next) {
        motion.stop();
        previousMotion = 0;
        previousEnvironmentFrame = 0;
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
      lighting.setQuality(settings.quality);
      ocean.setQuality(settings.quality);
      lens.setQuality(settings.quality);
      dirty = true;
    },
    setModel(next: GameModel) {
      if (board.seed !== next.islandSeed) board = createWorld(next.islandSeed);
      model = next;
      life.setModel(next);
      const key = JSON.stringify([
        next.buildings,
        next.won,
        next.islandSeed,
        objectTemplateRevision(),
      ]);
      if (key !== signature) {
        if (island) {
          island.dispose();
        }
        const shipData = shipGeometry(true);
        shipData.uvs = new Array((shipData.positions!.length / 3) * 2).fill(0);
        shipData.applyToMesh(ship);
        island = new Mesh('island', scene);
        islandGeometry(next.buildings, board, next.won).applyToMesh(island);
        island.material = material;
        island.receiveShadows = true;
        lighting.setCasters([island, ship]);
        ocean.setIsland(board, next.buildings, island, ship);
        signature = key;
        dirty = true;
      }
    },
    playArrival(event: Arrival) {
      arrival = { event, started: performance.now() };
      ship.setEnabled(true);
    },
    reset() {
      arrival = null;
      ship.setEnabled(false);
      hovered = null;
      resetCamera();
      environmentSeconds = 0;
      lighting.reset();
      ocean.invalidate();
    },
    cycleTime() {
      lighting.cycle();
      ocean.invalidate();
      dirty = true;
    },
    lookAtSky() {
      const sun = lighting.lookDirection;
      motion.look(Math.atan2(-sun.x, -sun.z), -Math.asin(sun.y));
    },
    get environmentState() {
      return {
        ...lighting.diagnostics,
        water: ocean.diagnostics,
        islandSpread: ISLAND_SPREAD,
        lensBlur: true,
        renderMilliseconds,
        settled: !dirty,
        sunScreen: projectWorld(...(lighting.diagnostics.sunPosition as [number, number, number])),
      };
    },
    get cameraState() {
      return motion.state;
    },
    setCameraInput(source: string, action: CameraAction | null) {
      motion.input(source, action);
    },
    clearCameraInput(prefix = '') {
      motion.clear(prefix);
    },
    stopCamera() {
      motion.stop();
    },
    orbit(dx: number, dy: number) {
      motion.orbit(dx, dy);
    },
    pan(dx: number, dy: number) {
      motion.pan(dx, dy, scale);
    },
    zoom(delta: number) {
      motion.zoom(delta);
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
      ocean.dispose();
      lighting.dispose();
      lens.dispose();
      scene.dispose();
      renderer.dispose();
      surface.remove();
    },
  };
}

export type CityScene = ReturnType<typeof createScene>;
