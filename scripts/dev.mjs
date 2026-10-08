import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';

// Локальная разработка без внешнего сервиса. Готовый HTML не нуждается в этом сервере.
const port = Number(process.env.PORT || 4173);
await build();
const server = createServer(async (req, res) => {
  if (!['/', '/index.html'].includes(req.url.split('?')[0])) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(await readFile(path.join(root, 'dist/index.html')));
  } catch {
    res.writeHead(503);
    res.end('Сборка ещё не готова');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Откройте http://127.0.0.1:${port}. После изменения исходников обновите вкладку.`),
);
let pending = Promise.resolve(),
  timer;
const watchers = ['src', 'assets', 'scripts'].map((directory) =>
  watch(path.join(root, directory), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(build).catch((error) => console.error(error.message));
    }, 150);
  }),
);
function close() {
  clearTimeout(timer);
  watchers.forEach((w) => w.close());
  server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
