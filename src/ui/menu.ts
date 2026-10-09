import type { GameModel } from '../domain/index.js';
import type { GameSettings } from '../persistence/index.js';

interface MenuActions {
  start(): boolean;
  restart(): boolean;
  pause(paused: boolean): void;
  settings(value: GameSettings): string | null;
}

/** Навигация не меняет город. Сценой, сохранениями и командами владеет main.ts. */
export function createMenu(document: Document, settings: GameSettings, actions: MenuActions) {
  const controller = new AbortController();
  const signal = controller.signal;
  const element = <T extends HTMLElement = HTMLElement>(id: string) => {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Отсутствует элемент #${id}`);
    return found as T;
  };
  const dialog = (id: string) => element<HTMLDialogElement>(id);
  const listen = (id: string, action: () => void) =>
    element(id).addEventListener('click', action, { signal });
  let inGame = false;
  let settingsOrigin: 'main' | 'pause' = 'main';
  let animateBackground = settings.animateCity;
  const video = element<HTMLVideoElement>('menu-video');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  video.muted = true;

  function updateBackground() {
    const allowMotion = animateBackground && !motionPreference.matches;
    video.hidden = !allowMotion || video.error !== null;
    if (allowMotion && !inGame && !document.hidden && !video.error) {
      // При запрете автозапуска браузером остаётся статичный постер гавани.
      void video.play().catch(() => {});
    } else video.pause();
  }
  motionPreference.addEventListener('change', updateBackground, { signal });
  document.addEventListener('visibilitychange', updateBackground, { signal });
  video.addEventListener('error', updateBackground, { signal });

  function closeMenus() {
    for (const id of ['pause-dialog', 'settings-dialog', 'reset-dialog']) dialog(id).close();
  }
  function resume() {
    closeMenus();
    actions.pause(false);
    element('world').focus();
  }
  function enterGame() {
    inGame = true;
    element('main-menu').hidden = true;
    element('game-screen').hidden = false;
    updateBackground();
    resume();
  }
  function openPause() {
    if (!inGame || document.querySelector('dialog[open]')) return;
    actions.pause(true);
    dialog('pause-dialog').showModal();
  }
  function openSettings(origin: 'main' | 'pause') {
    settingsOrigin = origin;
    closeMenus();
    dialog('settings-dialog').showModal();
  }
  function leaveSettings() {
    dialog('settings-dialog').close();
    if (settingsOrigin === 'pause') dialog('pause-dialog').showModal();
    else element('menu-settings').focus();
  }
  listen('menu-start', () => {
    if (actions.start()) enterGame();
  });
  listen('open-menu', openPause);
  listen('resume-game', resume);
  listen('main-menu-button', () => {
    closeMenus();
    inGame = false;
    actions.pause(true);
    element('game-screen').hidden = true;
    element('main-menu').hidden = false;
    updateBackground();
    element('menu-start').focus();
  });
  listen('menu-settings', () => openSettings('main'));
  listen('pause-settings', () => openSettings('pause'));
  listen('close-settings', leaveSettings);
  listen('menu-help', () => dialog('help-dialog').showModal());
  listen('reset-progress', () => {
    dialog('settings-dialog').close();
    dialog('reset-dialog').showModal();
  });
  listen('cancel-reset', () => openSettings(settingsOrigin));
  listen('confirm-reset', () => {
    if (actions.restart()) enterGame();
  });
  for (const [id, cancel] of [
    ['pause-dialog', resume],
    ['settings-dialog', leaveSettings],
    ['reset-dialog', () => openSettings(settingsOrigin)],
  ] as const) {
    dialog(id).addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        cancel();
      },
      { signal },
    );
  }
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.repeat || !inGame) return;
      // Открытый диалог обрабатывает Escape сам: закрываем только верхний уровень.
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      openPause();
    },
    { signal },
  );
  const quality = element<HTMLSelectElement>('setting-quality');
  const animate = element<HTMLInputElement>('setting-animation');
  const hints = element<HTMLInputElement>('setting-hints');
  quality.value = settings.quality;
  animate.checked = settings.animateCity;
  hints.checked = settings.showHints;
  for (const control of [quality, animate, hints]) {
    control.addEventListener(
      'change',
      () => {
        const next: GameSettings = {
          quality: quality.value === 'low' ? 'low' : 'high',
          animateCity: animate.checked,
          showHints: hints.checked,
        };
        element('settings-status').textContent =
          actions.settings(next) ?? 'Настройки сохранены и применены.';
        animateBackground = next.animateCity;
        updateBackground();
      },
      { signal },
    );
  }
  updateBackground();
  return {
    get inGame() {
      return inGame;
    },
    render(model: GameModel, hasGame: boolean) {
      element('menu-start').textContent = hasGame ? 'Продолжить' : 'Новая игра';
      element('menu-greeting').textContent = hasGame ? 'Ваш остров ждёт' : 'Письмо с острова';
      element('menu-description').textContent = hasGame
        ? 'В гавани всё на своих местах. Вернитесь к истории вашего города.'
        : 'На краю карты есть тихая бухта. Постройте здесь город, в который захочется возвращаться.';
      element('menu-progress').textContent = hasGame
        ? `День ${model.day} · Жителей: ${model.pop} · Монет: ${model.money}`
        : 'Новая история · 600 монет · целый остров впереди';
      element<HTMLButtonElement>('reset-progress').disabled = !hasGame;
    },
    error(message: string) {
      element('menu-status').textContent = message;
    },
    dispose() {
      video.pause();
      controller.abort();
    },
  };
}
