import type { Command } from './domain/index.js';
import type { CityScene } from './scene/index.js';
import { createGame, MAP_SIZE, isLand, shoreDirection } from './domain/index.js';
import { createStorage } from './persistence/index.js';
import { createUI } from './ui/index.js';
import { createScene } from './scene/index.js';
import { bindInput } from './input/index.js';

/**
 * Точка сборки приложения (composition root).
 * Только здесь модули соединяются друг с другом. Они не ищут соседей через window.
 */
const storage = createStorage(() => window.localStorage);
const loaded = storage.load();
const game = createGame(loaded.state);
let scene: CityScene | undefined;
let disposeInput: (() => void) | undefined;
const ui = createUI(
  document,
  (command) => dispatch(command),
  (action) => {
    if (action === 'home') scene?.resetCamera();
    else scene?.rotate(action === 'left' ? -1 : 1);
  },
);
function refresh() {
  const model = game.snapshot();
  ui.render(model);
  scene?.setModel(model);
}
function dispatch(command: Command) {
  const result = game.dispatch(command);
  // Сначала фиксируем экономику дня, потом запускаем необязательную анимацию.
  // Перезагрузка во время высадки не должна повторно начислить жителей или доход.
  if (result.changed) {
    const error = storage.save(game.serialize());
    if (error) ui.saveStatus(error);
  }
  for (const event of result.events) {
    if (event.type === 'notice') ui.notify(event.text);
    if (event.type === 'arrival') scene?.playArrival(event);
    if (event.type === 'reset-view') scene?.reset();
  }
  refresh();
}
try {
  scene = createScene({
    canvas: document.getElementById('world') as HTMLCanvasElement,
    board: { size: MAP_SIZE, isLand, shoreDirection },
    onArrivalFinished: () => dispatch({ type: 'arrival-finished' }),
    onError: (text) => ui.notify(text),
  });
  refresh();
  disposeInput = bindInput(document.getElementById('world') as HTMLCanvasElement, scene, dispatch);
  if (loaded.error) {
    ui.notify(loaded.error);
    ui.saveStatus('Старое сохранение не изменено. Новая игра начнётся после вашего действия.');
  }
  // Только чтение, для диагностики и сквозных тестов. Внутреннее состояние не выдаётся.
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
    renderer: 'Babylon.js',
    projectTile(x: number, z: number) {
      return scene!.project(x + 0.5, 0, z + 0.5);
    },
  });
} catch (error) {
  ui.render(game.snapshot());
  ui.saveStatus(
    'Для 3D нужен современный браузер с WebGL 2. Попробуйте включить аппаратное ускорение.',
  );
  ui.notify('Не удалось запустить 3D-сцену. Сохранённый город не изменён.');
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '.build,#coach-action,#next-day',
  ))
    button.disabled = true;
  console.error(error);
}
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return; // Кэш «назад/вперёд» восстановит готовую страницу.
  disposeInput?.();
  scene?.dispose();
  ui.dispose();
});

declare global {
  interface Window {
    cityDebug: {
      readonly state: ReturnType<typeof game.serialize>;
      readonly stats: ReturnType<typeof game.snapshot>['stats'];
      readonly busy: boolean;
      readonly renderer: string;
      projectTile(x: number, z: number): { x: number; y: number };
    };
  }
}
