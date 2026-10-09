import { build as bundle } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packAssets } from './pack-assets.mjs';
import { packWorkshop } from './pack-workshop.mjs';

export async function buildEditor(root = fileURLToPath(new URL('../', import.meta.url))) {
  await packAssets(root);
  await packWorkshop(root);
  const directory = path.join(root, '.generated/editor');
  await mkdir(directory, { recursive: true });
  await bundle({
    absWorkingDir: root,
    entryPoints: ['src/editor/app.ts'],
    outfile: path.join(directory, 'app.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    legalComments: 'inline',
  });
  await writeFile(
    path.join(directory, 'index.html'),
    await readFile(path.join(root, 'src/editor/template.html')),
  );
  const css = await Promise.all(
    ['src/ui/theme.css', 'src/editor/styles.css'].map((file) =>
      readFile(path.join(root, file), 'utf8'),
    ),
  );
  await writeFile(path.join(directory, 'styles.css'), css.join('\n'));
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Редактор собран: ${await buildEditor()}`);
}
