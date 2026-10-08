import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Vector3,
  Vector2,
  Raycaster,
  Plane,
  SRGBColorSpace,
} from 'three';
import { islandGeometry, shipGeometry } from './geometry.js';
import { voyageFrame } from './voyage.js';

/**
 * Публичный адаптер 3D. Получает снимки и события, никогда не изменяет город.
 * board — переданная география: renderer не импортирует внутренности домена.
 */
export function createScene({ canvas, board, onArrivalFinished, onError }) {
  const context = canvas.getContext('2d');
  const surface = document.createElement('canvas');
  surface.id = 'scene';
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = 'position:fixed;inset:0;pointer-events:none';
  canvas.before(surface);
  canvas.style.position = 'relative';
  const renderer = new WebGLRenderer({ canvas: surface, alpha: true, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const material = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    toneMapped: false,
  });
  const ship = new Mesh(shipGeometry(), material);
  ship.visible = false;
  scene.add(ship);
  let island = null,
    signature = '',
    model = null,
    hovered = null,
    arrival = null;
  let width = 0,
    height = 0,
    yaw = -0.68,
    zoom = 1,
    panX = 0,
    panY = 0,
    scale = 1,
    dirty = true,
    frameId = 0;
  const ray = new Raycaster(),
    ground = new Plane(new Vector3(0, 1, 0), 0);
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
    camera.left = -cx / scale;
    camera.right = (width - cx) / scale;
    camera.top = cy / scale;
    camera.bottom = -(height - cy) / scale;
    // Изометрический вид сохраняет размер домов при перемещении по острову.
    camera.position.set(
      5.5 + Math.sin(yaw) * 0.86 * 40,
      0.52 * 40,
      5.5 + Math.cos(yaw) * 0.86 * 40,
    );
    camera.lookAt(5.5, 0, 5.5);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    dirty = true;
  }
  function resize() {
    width = innerWidth;
    height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    surface.style.width = width + 'px';
    surface.style.height = height + 'px';
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCamera();
  }
  window.addEventListener('resize', resize, { signal: signal.signal });
  resize();
  function project(x, y, z) {
    const p = new Vector3(x, y, z).project(camera);
    return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
  }
  function pick(x, y) {
    ray.setFromCamera(new Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    const hit = ray.ray.intersectPlane(ground, new Vector3());
    if (!hit) return null;
    const tile = { x: Math.floor(hit.x), z: Math.floor(hit.z) };
    return board.isLand(tile.x, tile.z) ? tile : null;
  }
  function outline(x, z, color) {
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
  function overlays(passengers) {
    context.clearRect(0, 0, width, height);
    if (!model) return;
    if (model.selected === 'port')
      for (let x = 0; x < board.size; x++)
        for (let z = 0; z < board.size; z++) {
          if (board.shoreDirection(x, z) && !model.buildings.some((b) => b.x === x && b.z === z))
            outline(x, z, '#f6deb633');
        }
    if (
      hovered &&
      model.selected &&
      !model.buildings.some((b) => b.x === hovered.x && b.z === hovered.z && b.t !== 'road')
    )
      outline(hovered.x, hovered.z, '#ebf9c344');
    for (const person of passengers) {
      const p = project(person.x, 0.18, person.z);
      context.fillStyle = ['#be644c', '#e3bc66', '#447e7c'][person.id % 3];
      context.fillRect(p.x - 2.5, p.y - 7 + Math.sin(person.progress * 25), 5, 7);
      context.fillStyle = '#f4d3ae';
      context.beginPath();
      context.arc(p.x, p.y - 10, 2.7, 0, Math.PI * 2);
      context.fill();
    }
  }
  function frame(now) {
    let passengers = [];
    if (arrival) {
      const result = voyageFrame(
        arrival.event,
        (now - arrival.started) / 1000,
        board.shoreDirection(arrival.event.port.x, arrival.event.port.z),
      );
      ship.position.set(result.x, -0.25, result.z);
      ship.rotation.y = result.rotation;
      passengers = result.passengers;
      dirty = true;
      if (result.done) {
        arrival = null;
        ship.visible = false;
        onArrivalFinished();
      }
    }
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    overlays(passengers);
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
    setModel(next) {
      model = next;
      const key = JSON.stringify(next.buildings);
      if (key !== signature) {
        if (island) {
          scene.remove(island);
          island.geometry.dispose();
        }
        island = new Mesh(islandGeometry(next.buildings, board), material);
        scene.add(island);
        signature = key;
        dirty = true;
      }
    },
    playArrival(event) {
      arrival = { event, started: performance.now() };
      ship.visible = true;
      resetCamera();
    },
    reset() {
      arrival = null;
      ship.visible = false;
      hovered = null;
      resetCamera();
    },
    rotate(direction) {
      yaw += (direction * Math.PI) / 4;
      updateCamera();
    },
    pan(dx, dy) {
      panX += dx;
      panY += dy;
      updateCamera();
    },
    zoom(delta) {
      zoom = Math.max(0.65, Math.min(2, zoom + delta));
      updateCamera();
    },
    hover(tile) {
      hovered = tile;
    },
    pick,
    project,
    resetCamera,
    dispose() {
      cancelAnimationFrame(frameId);
      signal.abort();
      island?.geometry.dispose();
      ship.geometry.dispose();
      material.dispose();
      renderer.dispose();
      surface.remove();
    },
  };
}
