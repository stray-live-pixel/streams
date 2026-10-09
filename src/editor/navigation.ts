import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

/** Сдвигаем и камеру, и центр орбиты: W летит по взгляду, не приближает к объекту. */
export function moveEditorCamera(
  camera: ArcRotateCamera,
  input: { forward: number; right: number; up: number },
  distance: number,
) {
  if (!input.forward && !input.right && !input.up) return;
  camera.getViewMatrix(true);
  const forward = camera.target.subtract(camera.position).normalize();
  const right = Vector3.Cross(forward, camera.upVector).normalize();
  const movement = forward
    .scale(input.forward)
    .add(right.scale(input.right))
    .add(camera.upVector.scale(input.up));
  if (movement.lengthSquared() === 0) return;
  camera.target.addInPlace(movement.normalize().scale(distance));
  camera.getViewMatrix(true);
}

/** Обзор из текущей точки, без облёта вокруг центра объекта. Сцена правосторонняя. */
export function lookEditorCamera(camera: ArcRotateCamera, dx: number, dy: number) {
  camera.getViewMatrix(true);
  const eye = camera.position.clone();
  camera.alpha += dx * 0.004;
  camera.beta = Math.max(0.02, Math.min(Math.PI - 0.02, camera.beta - dy * 0.004));
  const offset = new Vector3(
    Math.cos(camera.alpha) * Math.sin(camera.beta),
    Math.cos(camera.beta),
    Math.sin(camera.alpha) * Math.sin(camera.beta),
  ).scale(camera.radius);
  camera.target.copyFrom(eye.subtract(offset));
  camera.getViewMatrix(true);
}

export function bindEditorNavigation(
  canvas: HTMLCanvasElement,
  camera: ArcRotateCamera,
  options: { canNavigate(): boolean; speed(): number },
) {
  const document = canvas.ownerDocument;
  const window = document.defaultView!;
  const controller = new AbortController();
  const signal = controller.signal;
  const keys = new Set<string>();
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
  let looking: { pointer: number; x: number; y: number } | undefined;
  function stop() {
    keys.clear();
    const pointer = looking?.pointer;
    looking = undefined;
    canvas.style.cursor = '';
    if (pointer !== undefined && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
  }
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        document.activeElement !== canvas ||
        !options.canNavigate() ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.defaultPrevented
      )
        return;
      if (movementKeys.has(event.code) || event.code.startsWith('Shift')) {
        keys.add(event.code);
        event.preventDefault();
      }
    },
    { signal },
  );
  document.addEventListener('keyup', (event) => keys.delete(event.code), { signal });
  canvas.addEventListener('blur', stop, { signal });
  window.addEventListener('blur', stop, { signal });
  document.addEventListener('visibilitychange', stop, { signal });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.focus({ preventScroll: true });
      if (event.button !== 2 || !options.canNavigate()) return;
      camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
      looking = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
    },
    { signal },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!looking || looking.pointer !== event.pointerId || !options.canNavigate()) return;
      lookEditorCamera(camera, event.clientX - looking.x, event.clientY - looking.y);
      looking.x = event.clientX;
      looking.y = event.clientY;
    },
    { signal },
  );
  const endLook = (event: PointerEvent) => {
    if (event.pointerId === looking?.pointer) stop();
  };
  canvas.addEventListener('pointerup', endLook, { signal });
  canvas.addEventListener('pointercancel', endLook, { signal });
  canvas.addEventListener('lostpointercapture', endLook, { signal });
  const scene = camera.getScene();
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (document.hidden || document.activeElement !== canvas || !options.canNavigate()) {
      stop();
      return;
    }
    const pressed = (code: string) => Number(keys.has(code));
    moveEditorCamera(
      camera,
      {
        forward: pressed('KeyW') - pressed('KeyS'),
        right: pressed('KeyD') - pressed('KeyA'),
        up: pressed('KeyE') - pressed('KeyQ'),
      },
      Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05) *
        options.speed() *
        (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1),
    );
  });
  return () => {
    stop();
    controller.abort();
    scene.onBeforeRenderObservable.remove(observer);
  };
}
