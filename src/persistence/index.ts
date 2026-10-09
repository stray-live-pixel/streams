import type { CityState } from '../domain/index.js';
import { restoreState } from '../domain/index.js';
// Ключ намеренно не переименован: текущие игроки сохранят свои города.
export const SAVE_KEY = 'ostrov-simple-v2';
export const SETTINGS_KEY = 'quiet-harbor-settings-v1';
export interface GameSettings {
  quality: 'high' | 'low';
  animateCity: boolean;
  showHints: boolean;
}
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  quality: 'high',
  animateCity: true,
  showHints: true,
});
/** Storage передаётся снаружи; в тестах вместо localStorage используется память. */
export function createStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  return {
    loadSettings(): GameSettings {
      try {
        const raw: unknown = JSON.parse(getStorage().getItem(SETTINGS_KEY) || 'null');
        if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
        const settings = raw as Record<string, unknown>;
        return {
          quality: settings.quality === 'low' ? 'low' : 'high',
          animateCity: typeof settings.animateCity === 'boolean' ? settings.animateCity : true,
          showHints: typeof settings.showHints === 'boolean' ? settings.showHints : true,
        };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    saveSettings(settings: GameSettings) {
      try {
        getStorage().setItem(SETTINGS_KEY, JSON.stringify(settings));
        return null;
      } catch {
        return 'Настройки применены только до закрытия страницы: браузер запретил сохранение.';
      }
    },
    load() {
      try {
        const text = getStorage().getItem(SAVE_KEY);
        return { state: text ? restoreState(JSON.parse(text)) : null, error: null };
      } catch (error) {
        // Не стираем повреждённую запись при чтении — она может понадобиться для восстановления.
        return {
          state: null,
          error: `Не удалось загрузить город: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    save(state: CityState) {
      try {
        getStorage().setItem(SAVE_KEY, JSON.stringify(state));
        return null;
      } catch {
        return 'Браузер не разрешил сохранение. Не закрывайте вкладку.';
      }
    },
  };
}
