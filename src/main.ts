import type { Command } from './domain/index.js';
import type { CityScene } from './scene/index.js';
import { createGame, createWorld } from './domain/index.js';
import { createStorage } from './persistence/index.js';
import { createUI, createMenu, fitGameViewport } from './ui/index.js';
import { createScene } from './scene/index.js';
import { bindInput } from './input/index.js';
import { objectFootprints } from './objects/index.js';

/** Только координатор соединяет город, навигацию, сохранения и ленивую 3D-сцену. */
const disposeViewport = fitGameViewport(document.getElementById('game-viewport')!);
const storage = createStorage(() => window.localStorage);
const loaded = storage.load();
const game = createGame(
  loaded.state,
  objectFootprints(),
  () => crypto.getRandomValues(new Uint32Array(1))[0] || 1,
);
let settings = storage.loadSettings();
let hasGame = loaded.state !== null;
let scene: CityScene | undefined;
let disposeInput: (() => void) | undefined;
let paused = true;
const canvas = document.getElementById('world') as HTMLCanvasElement;
const ui = createUI(document, dispatch, (action, pressed) => {
  if (action === 'home') scene?.resetCamera();
  else scene?.setCameraInput(`toolbar:${action}`, pressed ? action : null);
});
const menu = createMenu(document, settings, {
  start() {
    if (!ensureScene()) return false;
    if (!hasGame) {
      hasGame = true;
      save();
    }
    return true;
  },
  restart() {
    if (!ensureScene()) return false;
    hasGame = true;
    dispatch({ type: 'reset' });
    return true;
  },
  pause(value) {
    paused = value;
    disposeInput?.();
    disposeInput = undefined;
    scene?.setPaused(value);
    if (!value && scene) disposeInput = bindInput(canvas, scene, dispatch);
    refresh();
  },
  settings(value) {
    settings = value;
    applySettings();
    return storage.saveSettings(value);
  },
});
function applySettings() {
  document.body.dataset.hints = settings.showHints ? 'show' : 'hide';
  scene?.setSettings(settings);
}
function refresh() {
  const model = game.snapshot();
  menu.render(model, hasGame);
  if (menu.inGame) ui.render(model);
  scene?.setModel(model);
}
function save() {
  const error = storage.save(game.serialize());
  ui.saveStatus(error ?? '✦ Летопись сохраняется сама');
  menu.error(error ?? '');
}
function dispatch(command: Command) {
  // При закрытой сцене горячие клавиши и клики не должны изменять город.
  if (paused && command.type !== 'reset' && command.type !== 'arrival-finished') return;
  const result = game.dispatch(command);
  // Фиксируем экономику до анимации; меню и перезагрузка не начислят день повторно.
  if (result.changed) save();
  for (const event of result.events) {
    if (event.type === 'notice') ui.notify(event.text);
    if (event.type === 'arrival') scene?.playArrival(event);
    if (event.type === 'reset-view') scene?.reset();
  }
  refresh();
}
function ensureScene() {
  if (scene) return true;
  try {
    scene = createScene({
      canvas,
      board: createWorld(game.snapshot().islandSeed),
      onArrivalFinished: () => dispatch({ type: 'arrival-finished' }),
      onError: (text) => ui.notify(text),
    });
    applySettings();
    scene.setModel(game.snapshot());
    scene.setPaused(true);
    return true;
  } catch (error) {
    scene?.dispose();
    scene = undefined;
    menu.error(
      'Не удалось открыть остров. Для 3D включите аппаратное ускорение и WebGL 2 в браузере. Сохранение не изменено.',
    );
    console.error(error);
    return false;
  }
}
applySettings();
refresh();
if (loaded.error)
  menu.error(`${loaded.error}. Сохранение не изменится, пока вы не начнёте новую игру.`);

// Только чтение: тесты и диагностика не получают доступа к изменяемому городу.
window.cityDebug = Object.freeze({
  get state() {
    return game.serialize();
  },
  get stats() {
    return game.snapshot().stats;
  },
  get busy() {
    return game.snapshot().busy;
  },
  get renderer() {
    return scene ? 'Babylon.js' : 'not-started';
  },
  get paused() {
    return paused;
  },
  get camera() {
    return scene?.cameraState ?? null;
  },
  projectTile(x: number, z: number) {
    if (!scene) throw new Error('Сначала откройте остров из главного меню.');
    const point = scene.project(x + 0.5, 0, z + 0.5);
    const bounds = canvas.getBoundingClientRect();
    return {
      x: bounds.left + (point.x / canvas.clientWidth) * bounds.width,
      y: bounds.top + (point.y / canvas.clientHeight) * bounds.height,
    };
  },
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposeInput?.();
  disposeViewport();
  scene?.dispose();
  ui.dispose();
  menu.dispose();
});

declare global {
  interface Window {
    cityDebug: {
      readonly state: ReturnType<typeof game.serialize>;
      readonly stats: ReturnType<typeof game.snapshot>['stats'];
      readonly busy: boolean;
      readonly renderer: string;
      readonly paused: boolean;
      readonly camera: CityScene['cameraState'] | null;
      projectTile(x: number, z: number): { x: number; y: number };
    };
  }
}
