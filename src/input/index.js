/** Преобразует физические жесты в команды. Здесь нет правил строительства. */
export function bindInput(canvas, scene, onCommand) {
  const events = new AbortController();
  const options = { signal: events.signal };
  let pointer = null;
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    },
    options,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (pointer && pointer.id === event.pointerId) {
        const dx = event.clientX - pointer.x,
          dy = event.clientY - pointer.y;
        if (Math.hypot(dx, dy) > 5 || pointer.moved) {
          scene.pan(dx, dy);
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          pointer.moved = true;
          scene.hover(null);
          return;
        }
      }
      scene.hover(scene.pick(event.clientX, event.clientY));
    },
    options,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (pointer?.id !== event.pointerId) return;
      if (!pointer.moved) {
        const tile = scene.pick(event.clientX, event.clientY);
        if (tile) onCommand({ type: 'build', ...tile });
      }
      pointer = null;
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
      if (
        document.querySelector('dialog[open]') ||
        e.target.matches('button,input,select,textarea') ||
        e.repeat
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        onCommand({ type: 'next-day' });
      }
      if (e.key === 'Escape') onCommand({ type: 'select', building: null });
      const type = { 1: 'house', 2: 'farm', 3: 'shop', 4: 'road' }[e.key];
      if (type) onCommand({ type: 'select', building: type });
    },
    options,
  );
  return () => events.abort();
}
