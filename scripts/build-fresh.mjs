import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

/** Долгоживущие серверы не должны держать старые упаковщики и JSON в module cache. */
export async function buildFresh(root) {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [path.join(root, 'scripts/build.mjs')],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim();
}
