import { restoreState } from '../domain/index.js';
// Ключ намеренно не переименован: текущие игроки сохранят свои города.
export const SAVE_KEY = 'ostrov-simple-v2';
/** Storage передаётся снаружи; в тестах вместо localStorage используется память. */
export function createStorage(getStorage) {
  return {
    load() {
      try {
        const text = getStorage().getItem(SAVE_KEY);
        return { state: text ? restoreState(JSON.parse(text)) : null, error: null };
      } catch (error) {
        // Не стираем повреждённую запись при чтении — она может понадобиться для восстановления.
        return { state: null, error: `Не удалось загрузить город: ${error.message}` };
      }
    },
    save(state) {
      try {
        getStorage().setItem(SAVE_KEY, JSON.stringify(state));
        return null;
      } catch {
        return 'Браузер не разрешил сохранение. Не закрывайте вкладку.';
      }
    },
  };
}
