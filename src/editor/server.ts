import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createEditorRepository, EditorError } from './repository.js';
import type { ObjectPart, ObjectSettings } from '../objects/index.js';
import { buildEditor } from '../../scripts/build-editor.mjs';
import { buildFresh } from '../../scripts/build-fresh.mjs';

export function createEditorServer(options: {
  root: string;
  directory: string;
  assets: ReadonlySet<string>;
  rebuild?: () => Promise<unknown>;
  token?: string;
}) {
  // При перезапуске можно сохранить токен открытой вкладки, не теряя её черновики.
  if (options.token !== undefined && !/^[a-f0-9]{64}$/.test(options.token))
    throw new Error('Некорректный токен сессии редактора.');
  const token = options.token ?? randomBytes(32).toString('hex');
  const repository = createEditorRepository(options.root, options.assets);
  let committing = false;
  const json = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(body));
  };
  async function body(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 2_000_000) throw new EditorError(413, 'Композиция слишком большая.');
      chunks.push(buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new EditorError(400, 'Не удалось прочитать JSON.');
    }
  }
  const server = createServer(async (request, response) => {
    try {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      const host = `127.0.0.1:${port}`;
      if (request.headers.host !== host)
        throw new EditorError(403, 'Редактор доступен только через локальный адрес.');
      const route = new URL(request.url ?? '/', `http://${host}`).pathname;
      if (route.startsWith('/api/')) {
        if (
          request.headers['x-editor-token'] !== token ||
          (request.headers.origin && request.headers.origin !== `http://${host}`)
        )
          throw new EditorError(403, 'Откройте редактор по его локальному адресу.');
        if (route === '/api/project' && request.method === 'GET')
          return json(response, 200, await repository.read());
        if (route === '/api/save' && request.method === 'POST') {
          if (!request.headers['content-type']?.startsWith('application/json'))
            throw new EditorError(415, 'Ожидается JSON.');
          if (committing) throw new EditorError(409, 'Сохранение ещё выполняется.');
          const data = await body(request);
          if (
            !data ||
            typeof data !== 'object' ||
            !('id' in data) ||
            typeof data.id !== 'string' ||
            !('parts' in data) ||
            !Array.isArray(data.parts) ||
            !('revision' in data) ||
            typeof data.revision !== 'string'
          )
            throw new EditorError(422, 'Некорректное сохранение.');
          committing = true;
          try {
            const result = await repository.save(
              data.id,
              data.parts as ObjectPart[],
              data.revision,
              'settings' in data ? (data.settings as ObjectSettings) : undefined,
            );
            if (result.changed && options.rebuild) {
              try {
                await options.rebuild();
              } catch (error) {
                result.buildError =
                  error instanceof Error ? error.message : 'Не удалось пересобрать игру.';
              }
            }
            return json(response, 200, result);
          } finally {
            committing = false;
          }
        }
        throw new EditorError(404, 'Неизвестный запрос.');
      }
      if (request.method !== 'GET') throw new EditorError(405, 'Метод не поддерживается.');
      const files: Record<string, [string, string]> = {
        '/': ['index.html', 'text/html; charset=utf-8'],
        '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
        '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      };
      const file = files[route];
      if (!file) throw new EditorError(404, 'Файл не найден.');
      let content = await readFile(path.join(options.directory, file[0]), 'utf8');
      if (route === '/') content = content.replace('__EDITOR_TOKEN__', token);
      response.writeHead(200, {
        'Content-Type': file[1],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
      json(response, error instanceof EditorError ? error.status : 422, { error: message });
    }
  });
  return { server, token };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = await buildEditor(root);
  const library = JSON.parse(
    await readFile(path.join(root, '.generated/library-models.json'), 'utf8'),
  ) as Record<string, unknown>;
  const { server } = createEditorServer({
    root,
    directory,
    assets: new Set(Object.keys(library)),
    rebuild: () => buildFresh(root),
    token: process.env.EDITOR_SESSION_TOKEN,
  });
  const port = Number(process.env.EDITOR_PORT ?? 4174);
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Мастерская: http://127.0.0.1:${port}\nСохранить → src/objects/templates.json → коммит в локальную main → пересборка игры.`,
    ),
  );
  server.on('error', (error) => {
    console.error(`Не удалось запустить редактор: ${error.message}`);
    process.exitCode = 1;
  });
  for (const event of ['SIGINT', 'SIGTERM'] as const) process.on(event, () => server.close());
}
