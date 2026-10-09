import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objectTemplate,
  objectTemplateRevision,
  parseObjectTemplates,
  setObjectTemplates,
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
test('файловая конфигурация обновляет геометрию, не отдавая изменяемый снимок', () => {
  const next = parseObjectTemplates(config(), assets),
    before = objectTemplateRevision();
  setObjectTemplates(next);
  next.objects['game/house/0'][0].position[0] = 99;
  assert(objectTemplateRevision() > before);
  assert.equal(objectTemplate('game/house/0')[0].position[0], 0);
});
test('валидатор отклоняет неверные файлы, не меняя применённую конфигурацию', () => {
  setObjectTemplates(config());
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
  ])
    assert.throws(() => parseObjectTemplates(invalid, assets));
  assert.deepEqual(objectTemplate('game/house/0'), [part()]);
});
test('пустая композиция допустима и сохраняется как пустая', () => {
  setObjectTemplates(parseObjectTemplates({ version: 1, objects: { 'game/house/0': [] } }, assets));
  assert.deepEqual(objectTemplate('game/house/0'), []);
});
test('масштаб и форма участка проверяются независимо от геометрии', () => {
  const settings = {
    'game/house/0': {
      scale: 0.7,
      footprint: [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 0, z: 1 },
      ],
    },
  };
  assert.deepEqual(parseObjectTemplates({ ...config(), settings }, assets).settings, settings);
  for (const setting of [
    { scale: 0, footprint: [{ x: 0, z: 0 }] },
    { scale: NaN, footprint: [{ x: 0, z: 0 }] },
    {
      scale: 1,
      footprint: [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
      ],
    },
  ])
    assert.throws(() =>
      parseObjectTemplates({ ...config(), settings: { 'game/house/0': setting } }, assets),
    );
});
