import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildFresh } from '../scripts/build-fresh.mjs';

test('повторная сборка сервера читает изменённый упаковщик и JSON без module cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'harbor-fresh-build-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await writeFile(
      path.join(root, 'scripts/build.mjs'),
      "import { readFile } from 'node:fs/promises'; import { pack } from './pack.mjs'; console.log(pack(JSON.parse(await readFile('model.json'))));",
    );
    await writeFile(path.join(root, 'model.json'), '{"version":1}');
    await writeFile(
      path.join(root, 'scripts/pack.mjs'),
      'export const pack = data => `old:${data.version}`;',
    );
    assert.equal(await buildFresh(root), 'old:1');
    await writeFile(
      path.join(root, 'scripts/pack.mjs'),
      'export const pack = data => `new:${data.version}`;',
    );
    await writeFile(path.join(root, 'model.json'), '{"version":2}');
    assert.equal(await buildFresh(root), 'new:2');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
