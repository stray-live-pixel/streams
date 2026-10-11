import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/domain/index.ts';
import { environmentLayout } from '../src/scene/environment.ts';
import { contactShadowPixels } from '../src/scene/contact-shadows.ts';

test('контактное затенение локально у оснований и обновляется вместе с постройками', () => {
  const board = createWorld(3210380753);
  const size = 256;
  const sample = (pixels, x, z) => {
    const ix = Math.floor(((x + 2) / 16) * size);
    const iz = Math.floor(((z + 2) / 16) * size);
    return pixels[(iz * size + ix) * 4];
  };
  const pixels = contactShadowPixels(board, []);
  assert.deepEqual(contactShadowPixels(board, []), pixels);
  assert.equal(sample(pixels, -1, -1), 0, 'Открытые участки не затенены');
  const tree = environmentLayout(board, []).find((item) => item.asset.startsWith('pine'));
  assert(sample(pixels, tree.x, tree.z) > 160, 'Под кроной есть контактная тень');
  const built = contactShadowPixels(board, [{ t: 'house', x: 5, z: 5 }]);
  assert(sample(built, 5.5, 5.5) > 150, 'Новая постройка получает затенение у основания');
  assert.equal(sample(built, -1, -1), 0);
});
