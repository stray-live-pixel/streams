import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packAssets } from './pack-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
/** esbuild удаляет типы, но не проверяет их. Поэтому tsc обязателен до выпуска HTML. */
export async function checkTypes() {
  try {
    await promisify(execFile)(
      process.execPath,
      [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'],
      { cwd: root },
    );
  } catch (error) {
    throw new Error(error.stdout || error.message);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // JSON импортируется типизированным кодом; чистая копия репозитория ещё не содержит его.
  await packAssets(root);
  await checkTypes();
}
