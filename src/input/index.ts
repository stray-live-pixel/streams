import type { CommandHandler, BuildingType } from '../domain/index.js';
import type { CameraAction, CityScene } from '../scene/index.js';
const cameraKeys: Record<string, CameraAction> = {
  KeyQ: 'left',
  ArrowLeft: 'left',
  KeyE: 'right',
  ArrowRight: 'right',
  ArrowUp: 'tiltUp',
  ArrowDown: 'tiltDown',
  KeyW: 'panUp',
  KeyS: 'panDown',
  KeyA: 'panLeft',
  KeyD: 'panRight',
  Equal: 'zoomIn',
  NumpadAdd: 'zoomIn',
  Minus: 'zoomOut',
  NumpadSubtract: 'zoomOut',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
};
/** Преобразует физические жесты в команды. Здесь нет правил строительства. */
export function bindInput(canvas: HTMLCanvasElement, scene: CityScene, onCommand: CommandHandler) {
  const events = new AbortController();
  const options = { signal: events.signal };
  // Указатель приходит в координатах окна, сцена ожидает координаты логического холста.
  function point(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.clientWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.clientHeight,
    };
  }
  let pointer: { id: number; x: number; y: number; moved: boolean; orbit: boolean } | null = null;
  const blocked = (target: EventTarget | null) =>
    !!document.querySelector('dialog[open]') ||
    (target instanceof Element &&
      !!target.closest('input,select,textarea,[contenteditable="true"]'));
  function stop() {
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
    scene.stopCamera();
  }
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || ![0, 2].includes(event.button) || blocked(event.target)) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      pointer = { id: event.pointerId, ...point(event), moved: false, orbit: event.button === 2 };
      canvas.setPointerCapture(event.pointerId);
    },
    options,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const position = point(event);
      if (pointer && pointer.id === event.pointerId) {
        const dx = position.x - pointer.x,
          dy = position.y - pointer.y;
        if (Math.hypot(dx, dy) > 5 || pointer.moved) {
          if (pointer.orbit) scene.orbit(dx, dy);
          else scene.pan(dx, dy);
          pointer.x = position.x;
          pointer.y = position.y;
          pointer.moved = true;
          scene.hover(null);
          return;
        }
      }
      scene.hover(scene.pick(position.x, position.y));
    },
    options,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (pointer?.id !== event.pointerId) return;
      if (!pointer.moved && !pointer.orbit) {
        const position = point(event);
        const tile = scene.pick(position.x, position.y);
        if (tile) onCommand({ type: 'build', ...tile });
      }
      pointer = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    },
    options,
  );
  canvas.addEventListener(
    'pointercancel',
    () => {
      pointer = null;
    },
    options,
  );
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      pointer = null;
    },
    options,
  );
  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  canvas.addEventListener(
    'pointerleave',
    () => {
      if (!pointer) scene.hover(null);
    },
    options,
  );
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      scene.zoom(-e.deltaY * 0.001);
    },
    { ...options, passive: false },
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (blocked(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const action = cameraKeys[e.code];
      if (action) {
        e.preventDefault();
        scene.setCameraInput(`key:${e.code}`, action);
        scene.hover(null);
        return;
      }
      if (e.code === 'Home') {
        e.preventDefault();
        if (!e.repeat) scene.resetCamera();
        return;
      }
      if ((e.target instanceof Element && e.target.closest('button')) || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onCommand({ type: 'next-day' });
      }
      const shortcuts: Record<string, BuildingType> = {
        1: 'house',
        2: 'farm',
        3: 'shop',
        4: 'road',
      };
      const type = shortcuts[e.key];
      if (type) onCommand({ type: 'select', building: type });
    },
    options,
  );
  document.addEventListener(
    'keyup',
    (event) => scene.setCameraInput(`key:${event.code}`, null),
    options,
  );
  window.addEventListener('blur', stop, options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) stop();
    },
    options,
  );
  document.addEventListener(
    'focusin',
    (event) => {
      if (blocked(event.target)) stop();
    },
    options,
  );
  return () => {
    stop();
    events.abort();
  };
}
