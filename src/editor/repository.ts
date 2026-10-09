import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, unlink, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  editableObjectIds,
  parseObjectTemplates,
  type ObjectPart,
  type ObjectSettings,
} from '../objects/index.js';
import type { ProjectSnapshot, SaveResult } from './protocol.js';

const run = promisify(execFile);
const configPath = 'src/objects/templates.json';
export class EditorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Одна транзакция записывает только конфигурацию; чужие изменения в индексе не коммитятся. */
export function createEditorRepository(root: string, assets: ReadonlySet<string>) {
  let saving = false;
  const git = async (...args: string[]) => (await run('git', args, { cwd: root })).stdout.trim();
  const filename = path.join(root, configPath);
  const revision = (text: string) => createHash('sha256').update(text).digest('hex');
  async function read(): Promise<ProjectSnapshot> {
    const text = await readFile(filename, 'utf8');
    return {
      config: parseObjectTemplates(JSON.parse(text), assets),
      revision: revision(text),
      commit: await git('rev-parse', 'HEAD'),
      branch: await git('branch', '--show-current'),
    };
  }
  async function atomicWrite(text: string) {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text, { flag: 'wx' });
      await rename(temporary, filename);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  return {
    read,
    async save(
      id: string,
      parts: ObjectPart[],
      expectedRevision: string,
      settings?: ObjectSettings,
    ): Promise<SaveResult> {
      if (saving) throw new EditorError(409, 'Предыдущее сохранение ещё выполняется.');
      saving = true;
      try {
        const before = await read();
        if (before.branch !== 'main')
          throw new EditorError(
            409,
            'Сохранение доступно только в main. Переключите репозиторий на main и повторите.',
          );
        if (before.revision !== expectedRevision)
          throw new EditorError(
            409,
            'Конфигурация изменилась вне редактора. Обновите страницу перед сохранением.',
          );
        if (!editableObjectIds.includes(id))
          throw new EditorError(422, 'Этот объект доступен только для просмотра.');
        if (await git('diff', '--name-only', '--diff-filter=U'))
          throw new EditorError(409, 'Сначала завершите разрешение конфликтов Git.');
        if (await git('diff', '--cached', '--name-only', '--', configPath))
          throw new EditorError(
            409,
            'Конфигурация уже подготовлена в индексе Git. Завершите этот коммит перед сохранением.',
          );
        // Если идёт merge/rebase, commit --only не должен завершать чужую операцию.
        for (const marker of [
          'MERGE_HEAD',
          'CHERRY_PICK_HEAD',
          'REVERT_HEAD',
          'rebase-merge',
          'rebase-apply',
        ]) {
          const markerPath = await git('rev-parse', '--git-path', marker);
          if (
            await access(path.resolve(root, markerPath)).then(
              () => true,
              () => false,
            )
          )
            throw new EditorError(409, 'Завершите текущую операцию Git перед сохранением.');
        }
        const next = parseObjectTemplates(
          {
            ...before.config,
            objects: { ...before.config.objects, [id]: parts },
            ...(settings !== undefined
              ? { settings: { ...before.config.settings, [id]: settings } }
              : {}),
          },
          assets,
        );
        if (JSON.stringify(before.config) === JSON.stringify(next))
          return { ...before, changed: false };
        const original = await readFile(filename, 'utf8');
        // Повторная проверка перед записью защищает от внешнего редактирования во время Git-проверок.
        if (
          revision(original) !== expectedRevision ||
          (await git('branch', '--show-current')) !== 'main'
        )
          throw new EditorError(
            409,
            'Проект изменился во время сохранения. Повторите после обновления редактора.',
          );
        const written = JSON.stringify(next, null, 2) + '\n';
        await atomicWrite(written);
        try {
          // --only сохраняет прочие staged-файлы и не включает их в этот коммит.
          await git(
            'commit',
            '--only',
            '-m',
            `assets: update ${id} in object editor`,
            '--',
            configPath,
          );
        } catch (error) {
          const unchanged = (await readFile(filename, 'utf8')) === written;
          if (unchanged) await atomicWrite(original);
          const detail =
            error instanceof Error && 'stderr' in error
              ? String(error.stderr).trim()
              : 'Не удалось выполнить git commit.';
          throw new EditorError(
            500,
            `Git не создал коммит. ${unchanged ? 'Конфигурация восстановлена.' : 'Конфигурация изменена внешним процессом; проверьте файл.'} ${detail}`,
          );
        }
        return { ...(await read()), changed: true };
      } finally {
        saving = false;
      }
    },
  };
}
