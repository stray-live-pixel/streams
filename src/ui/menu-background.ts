/** Один стабильный участок служит и плавным пролётом, и ручным обзором острова. */
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
  let drag:
    | { pointerId: number; x: number; lastX: number; progress: number; direction: number }
    | undefined;

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
  function viewProgress() {
    const half = video.duration / 2;
    const time = Math.min(video.currentTime, video.duration - video.currentTime);
    return (1 - Math.cos((Math.PI * time) / half)) / 2;
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
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        lastX: event.clientX,
        progress: viewProgress(),
        direction: video.currentTime < video.duration / 2 ? 1 : -1,
      };
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
      // Обе половины видео показывают ту же дугу. Перетаскивание всегда движет
      // ракурс в сторону мыши и останавливается у края, а не прыгает на другой вид.
      const progress = Math.max(
        0,
        Math.min(1, drag.progress - (event.clientX - drag.x) / surface.clientWidth),
      );
      if (event.clientX !== drag.lastX) drag.direction = event.clientX < drag.lastX ? 1 : -1;
      drag.lastX = event.clientX;
      const time = (video.duration / (2 * Math.PI)) * Math.acos(1 - 2 * progress);
      // Выбор половины сохраняет направление последнего жеста после пяти секунд паузы.
      video.currentTime = Math.min(
        video.duration - 0.001,
        drag.direction > 0 ? time : video.duration - time,
      );
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
