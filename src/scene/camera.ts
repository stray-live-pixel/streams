export type CameraAction =
  | 'left'
  | 'right'
  | 'tiltUp'
  | 'tiltDown'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'boost';

const initial = () => ({
  yaw: -0.68,
  pitch: Math.atan2(0.52, 0.86),
  zoom: 1,
  x: 5.5,
  z: 5.5,
});
export type CameraState = ReturnType<typeof initial>;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Независимая от FPS орбитальная камера. Цель движения отделена от текущего ракурса. */
export function createCameraMotion() {
  let current = initial();
  let target = initial();
  const inputs = new Map<string, CameraAction>();

  function move(actions: ReadonlySet<CameraAction>, seconds: number) {
    const axis = (positive: CameraAction, negative: CameraAction) =>
      Number(actions.has(positive)) - Number(actions.has(negative));
    const speed = actions.has('boost') ? 2 : 1;
    target.yaw += axis('right', 'left') * 1.35 * seconds * speed;
    target.pitch = clamp(target.pitch + axis('tiltUp', 'tiltDown') * seconds * speed, 0.22, 1.2);
    target.zoom = clamp(
      target.zoom * Math.exp(axis('zoomIn', 'zoomOut') * 1.2 * seconds * speed),
      0.55,
      3,
    );
    const dx = axis('panRight', 'panLeft');
    const dz = axis('panDown', 'panUp');
    const distance = (5 * seconds * speed) / (current.zoom * Math.max(1, Math.hypot(dx, dz)));
    target.x += (dx * Math.cos(current.yaw) + dz * Math.sin(current.yaw)) * distance;
    target.z += (-dx * Math.sin(current.yaw) + dz * Math.cos(current.yaw)) * distance;
  }

  return {
    get state(): CameraState {
      return { ...current };
    },
    input(source: string, action: CameraAction | null) {
      if (action) {
        // Даже короткое нажатие между кадрами даёт небольшой плавный поворот.
        if (!inputs.has(source) && action !== 'boost') move(new Set([action]), 0.04);
        inputs.set(source, action);
      } else inputs.delete(source);
    },
    clear(prefix = '') {
      for (const source of inputs.keys()) if (source.startsWith(prefix)) inputs.delete(source);
    },
    stop() {
      inputs.clear();
      target = { ...current };
    },
    reset() {
      inputs.clear();
      target = initial();
      // Возвращаемся кратчайшим путём даже после нескольких полных оборотов.
      target.yaw =
        current.yaw +
        Math.atan2(Math.sin(target.yaw - current.yaw), Math.cos(target.yaw - current.yaw));
    },
    orbit(dx: number, dy: number) {
      target.yaw += dx * 0.006;
      target.pitch = clamp(target.pitch + dy * 0.005, 0.22, 1.2);
    },
    pan(dx: number, dy: number, pixelsPerUnit: number) {
      // Панорамирование меняет центр орбиты: после перемещения вращаемся вокруг нового места.
      const across = -dx / pixelsPerUnit;
      const along = -dy / (pixelsPerUnit * Math.sin(current.pitch));
      target.x += across * Math.cos(current.yaw) + along * Math.sin(current.yaw);
      target.z += -across * Math.sin(current.yaw) + along * Math.cos(current.yaw);
    },
    zoom(delta: number) {
      target.zoom = clamp(target.zoom * Math.exp(delta), 0.55, 3);
    },
    tick(seconds: number) {
      const dt = clamp(seconds, 0, 0.05);
      move(new Set(inputs.values()), dt);
      const blend = 1 - Math.exp(-18 * dt);
      let changed = false;
      for (const key of Object.keys(current) as (keyof CameraState)[]) {
        const difference = target[key] - current[key];
        if (Math.abs(difference) < 0.00001) {
          if (current[key] !== target[key]) changed = true;
          current[key] = target[key];
        } else {
          current[key] += difference * blend;
          changed = true;
        }
      }
      return changed;
    },
  };
}
