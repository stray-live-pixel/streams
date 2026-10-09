import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorage,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SAVE_KEY,
} from '../src/persistence/index.ts';

const memory = () => {
  const data = new Map();
  return {
    data,
    storage: createStorage(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    })),
  };
};

test('настройки сохраняются отдельно от города и переживают новую историю', () => {
  const { data, storage } = memory();
  const settings = { quality: 'low', animateCity: false, showHints: false };
  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
  assert.equal(storage.saveSettings(settings), null);
  assert.deepEqual(storage.loadSettings(), settings);
  assert.equal(data.has(SAVE_KEY), false);
  data.set(SAVE_KEY, 'existing-city');
  storage.saveSettings({ ...settings, showHints: true });
  assert.equal(data.get(SAVE_KEY), 'existing-city');
});

test('повреждённые настройки заменяются безопасными значениями без записи поверх города', () => {
  const { data, storage } = memory();
  for (const raw of ['{broken', 'null', '42', '{"quality":"ultra","animateCity":0}']) {
    data.set(SETTINGS_KEY, raw);
    assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
    assert.equal(data.get(SETTINGS_KEY), raw);
  }
});

test('при недоступном хранилище настройки работают с предупреждением', () => {
  const storage = createStorage(() => {
    throw Error('Storage blocked');
  });
  assert.deepEqual(storage.loadSettings(), DEFAULT_SETTINGS);
  assert.match(storage.saveSettings(DEFAULT_SETTINGS), /только до закрытия/);
});
