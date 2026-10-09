import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createEditorRepository } from '../src/editor/repository.ts';

export const asset = 'kenney-fantasy-town/wall-block';
const part = () => ({
  id: 'wall',
  asset,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'harbor-editor-git-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Editor test');
  git('config', 'user.email', 'editor@example.invalid');
  await mkdir(path.join(root, 'src/objects'), { recursive: true });
  await writeFile(path.join(root, 'src/objects/templates.json'), '{"version":1,"objects":{}}\n');
  await writeFile(path.join(root, 'notes.txt'), 'original');
  git('add', '.');
  git('commit', '-m', 'fixture');
  return { root, git, repo: createEditorRepository(root, new Set([asset])) };
}
test('Сохранить создаёт коммит только конфигурации в main, сохраняя чужой индекс', async (t) => {
  const { root, git, repo } = await fixture(t);
  await writeFile(path.join(root, 'notes.txt'), 'unrelated staged change');
  git('add', 'notes.txt');
  const original = await repo.read();
  const saved = await repo.save('game/house/0', [part()], original.revision);
  assert.equal(saved.branch, 'main');
  assert.notEqual(saved.commit, original.commit);
  assert.deepEqual(JSON.parse(git('show', 'main:src/objects/templates.json')), saved.config);
  assert.equal(
    git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'),
    'src/objects/templates.json',
  );
  assert.equal(git('diff', '--cached', '--name-only'), 'notes.txt');
  assert.equal(git('show', 'HEAD:notes.txt'), 'original');
  const repeated = await repo.save('game/house/0', [part()], saved.revision);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.commit, saved.commit);
});
test('другая ветка, устаревшая ревизия и плохой ассет не меняют файл', async (t) => {
  const { root, git, repo } = await fixture(t),
    before = await repo.read();
  git('switch', '-c', 'feature');
  await assert.rejects(repo.save('game/house/0', [part()], before.revision), /только в main/);
  git('switch', 'main');
  await assert.rejects(
    repo.save('game/house/0', [{ ...part(), asset: 'unknown' }], before.revision),
    /Некорректный/,
  );
  await writeFile(
    path.join(root, 'src/objects/templates.json'),
    '{"version":1,"objects":{"game/ship":[]}}',
  );
  await assert.rejects(repo.save('game/house/0', [part()], before.revision), /изменилась вне/);
  assert.equal(git('rev-parse', 'HEAD'), before.commit);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, 'src/objects/templates.json'), 'utf8')).objects,
    { 'game/ship': [] },
  );
});
test('отказ Git hook восстанавливает конфигурацию, сохраняя черновик на клиенте', async (t) => {
  const { root, git, repo } = await fixture(t),
    before = await repo.read();
  const filename = path.join(root, 'src/objects/templates.json'),
    original = await readFile(filename, 'utf8');
  await writeFile(
    path.join(root, '.git/hooks/pre-commit'),
    '#!/bin/sh\necho "test hook rejected" >&2\nexit 1\n',
    { mode: 0o755 },
  );
  await assert.rejects(
    repo.save('game/house/0', [part()], before.revision),
    /Git не создал коммит/,
  );
  assert.equal(await readFile(filename, 'utf8'), original);
  assert.equal(git('rev-parse', 'HEAD'), before.commit);
  assert.equal(git('status', '--porcelain'), '');
});
test('масштаб и маска сохраняются с деталями в одном коммите без потери соседних объектов', async (t) => {
  const { repo, git } = await fixture(t);
  const original = await repo.read();
  const setting = {
    scale: 0.7,
    footprint: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ],
  };
  const first = await repo.save('game/house/0', [part()], original.revision, setting);
  const second = await repo.save('game/house/1', [part()], first.revision, {
    scale: 0.5,
    footprint: [{ x: 0, z: 0 }],
  });
  assert.deepEqual(second.config.settings['game/house/0'], setting);
  const unchanged = await repo.save(
    'game/house/1',
    [part()],
    second.revision,
    second.config.settings['game/house/1'],
  );
  assert.equal(unchanged.changed, false);
  assert.equal(
    git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'),
    'src/objects/templates.json',
  );
});
