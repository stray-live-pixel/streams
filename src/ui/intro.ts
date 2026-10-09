import frames from '../../.generated/intro.json';
import icons from '../../.generated/intro-icons.json';

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
  const sheet = element('intro-sheet');
  const pages = element('intro-pages');
  let index = 0;
  let finished = false;
  let generation = 0;
  let opened = false;
  let rendered = false;
  let pageCopy: HTMLElement | undefined;
  let pageAnimations: Animation[] = [];

  function setIcon(id: string, name: keyof typeof icons) {
    // Источник — только SVG из установленного lucide-react, подготовленные при сборке.
    element(id).innerHTML = icons[name]!;
  }
  setIcon('intro-close-icon', 'close');
  setIcon('intro-replay-icon', 'replay');
  setIcon('intro-previous-icon', 'previous');

  function stopPageTurn() {
    for (const animation of pageAnimations) animation.cancel();
    pageAnimations = [];
    pageCopy?.remove();
    pageCopy = undefined;
  }

  function turnPage(copy: HTMLElement, direction: number) {
    copy.removeAttribute('id');
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
    for (const node of copy.querySelectorAll('[aria-live]')) node.removeAttribute('aria-live');
    copy.classList.add('intro-sheet-copy');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    sheet.parentElement!.append(copy);
    pageCopy = copy;
    const outgoing = copy.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${direction * 70}px, -32px) rotate(${direction * 5}deg)`,
          opacity: 0,
        },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
    );
    const incoming = sheet.animate(
      [
        {
          transform: `translateX(${-direction * 12}px) rotate(${-direction * 0.6}deg)`,
          opacity: 0.65,
        },
        { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
      ],
      { duration: 420, easing: 'ease-out' },
    );
    pageAnimations = [outgoing, incoming];
    void outgoing.finished
      .then(() => {
        if (pageCopy === copy) {
          copy.remove();
          pageCopy = undefined;
        }
      })
      .catch(() => {});
  }

  for (let pageIndex = 0; pageIndex < frames.length; pageIndex++) {
    const button = document.createElement('button');
    button.className = 'intro-page';
    button.type = 'button';
    button.setAttribute('aria-label', `Страница ${pageIndex + 1}`);
    button.title = `Страница ${pageIndex + 1}`;
    button.addEventListener(
      'click',
      () => {
        if (index !== pageIndex) showFrame(pageIndex);
      },
      { signal },
    );
    pages.append(button);
  }

  function clearStatus() {
    element('intro-audio-status').hidden = true;
    element('intro-audio-status').textContent = '';
  }

  function audioError(text: string) {
    element('intro-audio-status').textContent = text;
    element('intro-audio-status').hidden = false;
  }

  function updatePlayback() {
    const label = finished ? 'Повторить' : audio.paused ? 'Слушать' : 'Пауза';
    element('intro-play-label').textContent = label;
    play.setAttribute('aria-label', finished ? 'Повторить озвучку страницы' : label);
    setIcon('intro-play-icon', finished || audio.paused ? 'play' : 'pause');
  }

  function startAudio() {
    clearStatus();
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
      audioError('Звук не запустился. Нажмите «Слушать» или продолжайте читать.');
    });
  }

  function showFrame(nextIndex: number) {
    stopPageTurn();
    const oldIndex = index;
    const copy =
      rendered &&
      nextIndex !== index &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? (sheet.cloneNode(true) as HTMLElement)
        : undefined;
    generation++;
    audio.pause();
    index = nextIndex;
    finished = false;
    const frame = frames[index]!;
    element('intro-subtitle').textContent = frame.text;
    [...pages.children].forEach((page, pageIndex) => {
      if (pageIndex === index) page.setAttribute('aria-current', 'page');
      else page.removeAttribute('aria-current');
    });
    const focusWasPrevious = document.activeElement === previous;
    previous.disabled = index === 0;
    // Отключённая кнопка «Назад» не должна уводить клавиатурный фокус из диалога.
    if (previous.disabled && focusWasPrevious) next.focus();
    element('intro-next-label').textContent = index === frames.length - 1 ? 'Завершить' : 'Далее';
    next.setAttribute(
      'aria-label',
      index === frames.length - 1 ? 'Завершить письмо и вернуться в меню' : 'Следующая страница',
    );
    setIcon('intro-next-icon', index === frames.length - 1 ? 'home' : 'next');
    audio.src = frame.audio;
    updatePlayback();
    startAudio();
    rendered = true;
    if (copy) turnPage(copy, nextIndex > oldIndex ? 1 : -1);
  }

  function close() {
    if (!dialog.open) return;
    dialog.close();
    finishClose();
  }

  function finishClose() {
    if (!opened) return;
    opened = false;
    rendered = false;
    stopPageTurn();
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
      audioError('Не удалось воспроизвести запись. Историю можно прочитать и листать дальше.');
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        audio.pause();
        stopPageTurn();
      }
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
      stopPageTurn();
      controller.abort();
    },
  };
}
