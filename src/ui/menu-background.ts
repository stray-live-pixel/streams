/** Один видеотаймлайн служит и автоматическим облётом, и ручным обзором острова. */
export function createMenuBackground(
  surface: HTMLElement,
  video: HTMLVideoElement,
  animated: boolean,
) {
  const controller = new AbortController();
  const { signal } = controller;
  const document = surface.ownerDocument;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const idleDelay = 5000;
  let active = true;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeAt = 0;
  let drag: { pointerId: number; x: number; time: number } | undefined;

  video.muted = true;
  // 48 кадров в файле дают 24 кадра/с при замедлении в браузере.
  video.defaultPlaybackRate = 0.5;
  video.playbackRate = 0.5;

  function available() {
    return active && animated && !motionPreference.matches && !document.hidden && !video.error;
  }
  function clearTimer() {
    clearTimeout(resumeTimer);
    resumeTimer = undefined;
  }
  function releasePointer() {
    const pointerId = drag?.pointerId;
    drag = undefined;
    surface.classList.remove('is-dragging');
    if (pointerId !== undefined && surface.hasPointerCapture(pointerId))
      surface.releasePointerCapture(pointerId);
  }
  function update() {
    clearTimer();
    video.hidden = !animated || motionPreference.matches || video.error !== null;
    const enabled = available();
    surface.classList.toggle('can-drag-orbit', enabled);
    if (!enabled) {
      releasePointer();
      resumeAt = 0;
    }
    if (!enabled || drag) {
      video.pause();
      return;
    }
    const remaining = resumeAt - Date.now();
    if (remaining > 0) {
      video.pause();
      resumeTimer = setTimeout(update, remaining);
    } else {
      // При запрете автозапуска остаётся неподвижный кадр/постер.
      void video.play().catch(() => {});
    }
  }
  function finishDrag() {
    if (!drag) return;
    releasePointer();
    resumeAt = Date.now() + idleDelay;
    update();
  }
  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        drag ||
        !available() ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !(event.target instanceof Element) ||
        event.target.closest('.menu-card, button, a, input, select, textarea, dialog')
      )
        return;
      event.preventDefault();
      drag = { pointerId: event.pointerId, x: event.clientX, time: video.currentTime };
      clearTimer();
      video.pause();
      surface.setPointerCapture(event.pointerId);
      surface.classList.add('is-dragging');
    },
    { signal },
  );
  surface.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      // Перетаскиваем пейзаж: ширина экрана соответствует одному полному кругу.
      const time = drag.time - ((event.clientX - drag.x) / surface.clientWidth) * video.duration;
      video.currentTime = ((time % video.duration) + video.duration) % video.duration;
    },
    { signal },
  );
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    surface.addEventListener(
      eventName,
      (event) => {
        if (event.pointerId === drag?.pointerId) finishDrag();
      },
      { signal },
    );
  }
  window.addEventListener('blur', finishDrag, { signal });
  document.addEventListener('visibilitychange', update, { signal });
  motionPreference.addEventListener('change', update, { signal });
  video.addEventListener('error', update, { signal });
  update();
  return {
    setActive(value: boolean) {
      active = value;
      update();
    },
    setAnimated(value: boolean) {
      animated = value;
      update();
    },
    dispose() {
      controller.abort();
      clearTimer();
      releasePointer();
      surface.classList.remove('can-drag-orbit');
      video.pause();
    },
  };
}
