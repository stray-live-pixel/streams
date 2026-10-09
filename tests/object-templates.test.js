import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObjectStore,
  objectStorageKey,
  objectTemplate,
  objectTemplateRevision,
  parseObjectTemplates,
} from '../src/objects/index.ts';

const asset = 'kenney-fantasy-town/wall-block';
const assets = new Set([asset]);
const part = () => ({
  id: 'wall',
  asset,
  position: [0, 0, 0],
  rotation: [0, Math.PI / 2, 0],
  scale: [1, 2, 1],
});
const config = () => ({ version: 1, objects: { 'game/house/0': [part()] } });
const storage = () => {
  const data = new Map([['ostrov-simple-v2', 'city unchanged']]);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    data,
  };
};

test('композиция переживает сохранение, экспорт и новый запуск, не затрагивая город', () => {
  const disk = storage(),
    store = createObjectStore(() => disk, assets);
  const before = objectTemplateRevision();
  store.save('game/house/0', [part()]);
  assert(objectTemplateRevision() > before);
  const exported = store.export();
  assert.deepEqual(JSON.parse(exported), config());
  assert.deepEqual(objectTemplate('game/house/0'), [part()]);
  const another = createObjectStore(() => disk, assets);
  assert.equal(another.export(), exported);
  assert.equal(disk.data.get('ostrov-simple-v2'), 'city unchanged');
});

test('импорт отвергает некорректную схему и не применяет части повреждённого файла', () => {
  const disk = storage(),
    store = createObjectStore(() => disk, assets);
  store.import(JSON.stringify(config()));
  const before = store.export();
  for (const invalid of [
    { version: 2, objects: {} },
    { version: 1, objects: { 'game/unknown': [] } },
    { version: 1, objects: { 'game/house/0': [{ ...part(), asset: 'missing' }] } },
    { version: 1, objects: { 'game/house/0': [{ ...part(), position: [NaN, 0, 0] }] } },
    { version: 1, objects: { 'game/house/0': [{ ...part(), scale: [-1, 1, 1] }] } },
    { version: 1, objects: { 'game/house/0': [part(), part()] } },
    {
      version: 1,
      objects: {
        'game/house/0': Array.from({ length: 201 }, (_, i) => ({ ...part(), id: String(i) })),
      },
    },
  ]) {
    assert.throws(() => store.import(JSON.stringify(invalid)));
    assert.equal(store.export(), before);
    assert.equal(disk.data.get(objectStorageKey), before.replace(/\s/g, ''));
  }
  assert.throws(() =>
    parseObjectTemplates(
      { ...config(), objects: { 'game/house/0': [{ ...part(), tint: [256, 0, 0] }] } },
      assets,
    ),
  );
});

test('пустая композиция допустима, ошибки хранилища не подменяют сохранённую версию', () => {
  const disk = storage();
  const store = createObjectStore(() => disk, assets);
  store.save('game/house/0', []);
  assert.deepEqual(objectTemplate('game/house/0'), []);
  disk.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => store.save('game/house/0', [part()]));
  assert.deepEqual(objectTemplate('game/house/0'), []);
  disk.data.set(objectStorageKey, '{broken');
  const failed = createObjectStore(() => disk, assets);
  assert.match(failed.warning, /Не удалось/);
  assert.equal(disk.data.get(objectStorageKey), '{broken');
});
