import { build as bundle } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { packAssets } from './pack-assets.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));

/** Единственный производитель release HTML. Исходный шаблон никогда не перезаписывается. */
export async function build() {
  const models = await packAssets(root);
  const result = await bundle({
    absWorkingDir: root,
    entryPoints: ['src/main.js'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    // Шейдеры Three.js содержат многострочные строки; экранируем их в итоговом JS.
    supported: { 'template-literal': false },
    legalComments: 'inline',
    charset: 'utf8',
    logLevel: 'warning',
  });
  const template = await readFile(path.join(root, 'src/ui/template.html'), 'utf8');
  const css = await readFile(path.join(root, 'src/ui/styles.css'), 'utf8');
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // Лицензия путешествует вместе с единственным HTML, даже когда исходников рядом нет.
  const license = await readFile(path.join(root, 'node_modules/three/LICENSE'), 'utf8');
  const notices = `Three.js\n${license}\nKenney Fantasy Town Kit / Pirate Kit: CC0\nhttps://kenney.nl/assets/fantasy-town-kit\nhttps://kenney.nl/assets/pirate-kit`;
  const html = template
    .replace('/* STYLES */', () => css)
    .replace(
      '<!-- APPLICATION -->',
      () => `<script>${js}</script>\n<!-- ${notices.replace(/--/g, '—')} -->`,
    );
  if (!html.includes('<script>') || !html.includes(css)) throw new Error('Потерян маркер шаблона');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html);
  // Этот путь уже открыт у игрока. Сохраняем его, чтобы file://-сохранения не потерялись.
  await writeFile(path.join(root, 'index.html'), html);
  console.log(
    `Готово: dist/index.html (${Math.round(Buffer.byteLength(html) / 1024)} КБ), ${models} моделей.`,
  );
  return html;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await build();
