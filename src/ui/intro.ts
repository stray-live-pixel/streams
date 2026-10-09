import frames from '../../.generated/intro.json';

/** Каждый кадр — отдельная запись: окончание голоса никогда не переключает текст. */
export function createIntro(document: Document, onOpenChange: (open: boolean) => void) {
  const controller = new AbortController();
  const { signal } = controller;
  function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Отсутствует элемент #${id}`);
    return found as T;
  }
  const dialog = element<HTMLDialogElement>('intro-dialog');
  const audio = element<HTMLAudioElement>('intro-audio');
  const play = element<HTMLButtonElement>('intro-play');
  const previous = element<HTMLButtonElement>('intro-previous');
  const next = element<HTMLButtonElement>('intro-next');
  let index = 0;
  let finished = false;
  let generation = 0;
  let opened = false;

  function updatePlayback() {
    play.textContent = finished ? 'Слушать ещё раз' : audio.paused ? 'Слушать' : 'Пауза';
    play.setAttribute('aria-label', finished ? 'Повторить озвучку кадра' : play.textContent);
    element('intro-audio-status').textContent = finished
      ? 'Можно задержаться здесь или перейти дальше.'
      : audio.paused
        ? 'Читайте в своём темпе. Озвучку можно включить.'
        : 'Марта рассказывает…';
  }

  function startAudio() {
    const request = generation;
    if (finished) {
      audio.currentTime = 0;
      finished = false;
    }
    void audio.play().catch((error: unknown) => {
      if (request !== generation || !dialog.open) return;
      updatePlayback();
      // Быстрое переключение кадров штатно прерывает предыдущий play().
      if (error instanceof DOMException && error.name === 'AbortError') return;
      element('intro-audio-status').textContent =
        'Звук не запустился. Нажмите «Слушать» или продолжайте читать.';
    });
  }

  function showFrame(nextIndex: number) {
    generation++;
    audio.pause();
    index = nextIndex;
    finished = false;
    const frame = frames[index]!;
    element('intro-frame-title').textContent = frame.title;
    element('intro-subtitle').textContent = frame.text;
    element('intro-counter').textContent = `Кадр ${index + 1} из ${frames.length}`;
    element<HTMLProgressElement>('intro-progress').value = index + 1;
    const focusWasPrevious = document.activeElement === previous;
    previous.disabled = index === 0;
    // Отключённая кнопка «Назад» не должна уводить клавиатурный фокус из диалога.
    if (previous.disabled && focusWasPrevious) next.focus();
    next.textContent = index === frames.length - 1 ? 'В главное меню' : 'Далее →';
    audio.src = frame.audio;
    updatePlayback();
    startAudio();
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    finishClose();
  }

  function finishClose() {
    if (!opened) return;
    opened = false;
    generation++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    onOpenChange(false);
    element('menu-intro').focus();
  }

  function advance() {
    if (index === frames.length - 1) close();
    else showFrame(index + 1);
  }

  const listen = (id: string, action: () => void) =>
    element(id).addEventListener('click', action, { signal });
  listen('intro-close', close);
  listen('intro-next', advance);
  listen('intro-previous', () => {
    if (index > 0) showFrame(index - 1);
  });
  listen('intro-play', () => {
    if (audio.paused) startAudio();
    else audio.pause();
  });
  listen('intro-replay', () => {
    audio.currentTime = 0;
    finished = false;
    startAudio();
  });
  audio.addEventListener('play', updatePlayback, { signal });
  audio.addEventListener('pause', updatePlayback, { signal });
  audio.addEventListener(
    'ended',
    () => {
      if (!dialog.open || !audio.ended) return;
      finished = true;
      updatePlayback();
    },
    { signal },
  );
  audio.addEventListener(
    'error',
    () => {
      if (!dialog.open || !audio.hasAttribute('src')) return;
      element('intro-audio-status').textContent =
        'Не удалось воспроизвести запись. Историю можно прочитать и листать дальше.';
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) audio.pause();
    },
    { signal },
  );
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close();
    },
    { signal },
  );
  dialog.addEventListener(
    'close',
    () => {
      if (!dialog.open) finishClose();
    },
    { signal },
  );
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        advance();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        showFrame(index - 1);
      }
    },
    { signal },
  );

  return {
    open() {
      if (dialog.open) return;
      dialog.showModal();
      opened = true;
      onOpenChange(true);
      showFrame(0);
      next.focus();
    },
    dispose() {
      generation++;
      audio.pause();
      controller.abort();
    },
  };
}
