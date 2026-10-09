import { build as bundle } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkTypes } from './typecheck.mjs';
import { packAssets } from './pack-assets.mjs';
import { packIntro } from './pack-intro.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));

/** Единственный производитель release HTML. Исходный шаблон никогда не перезаписывается. */
export async function build() {
  const models = await packAssets(root);
  await packIntro(root);
  await checkTypes();
  const result = await bundle({
    absWorkingDir: root,
    entryPoints: ['src/main.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    // Шейдеры Babylon.js содержат многострочные строки; экранируем их в итоговом JS.
    supported: { 'template-literal': false },
    legalComments: 'inline',
    charset: 'utf8',
    logLevel: 'warning',
  });
  const template = await readFile(path.join(root, 'src/ui/template.html'), 'utf8');
  // Иллюстрация путешествует вместе с HTML: меню также работает офлайн и через file://.
  const menuArt = await readFile(path.join(root, 'assets/art/main-menu.webp'));
  const menuVideo = await readFile(path.join(root, 'assets/art/main-menu-loop.mp4'));
  const martaPortrait = await readFile(path.join(root, 'assets/art/marta-portrait.webp'));
  const css = (
    await Promise.all(
      ['theme.css', 'styles.css'].map((name) => readFile(path.join(root, 'src/ui', name), 'utf8')),
    )
  ).join('\n');
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  // Лицензия путешествует вместе с единственным HTML, даже когда исходников рядом нет.
  const license = await readFile(
    path.join(root, 'node_modules/@babylonjs/core/license.md'),
    'utf8',
  );
  const notice = await readFile(path.join(root, 'node_modules/@babylonjs/core/NOTICE.md'), 'utf8');
  const notices = `Babylon.js\n${license}\n${notice}\nKenney Fantasy Town Kit / Pirate Kit: CC0\nhttps://kenney.nl/assets/fantasy-town-kit\nhttps://kenney.nl/assets/pirate-kit`;
  const html = template
    .replaceAll('__MENU_BACKGROUND__', () => `data:image/webp;base64,${menuArt.toString('base64')}`)
    .replace('__MENU_VIDEO__', () => `data:video/mp4;base64,${menuVideo.toString('base64')}`)
    .replace(
      '__MARTA_PORTRAIT__',
      () => `data:image/webp;base64,${martaPortrait.toString('base64')}`,
    )
    .replace('/* STYLES */', () => css)
    .replace(
      '<!-- APPLICATION -->',
      () =>
        `<script>${js}</script>\n<!-- ${notices
          .replace(/\r/g, '')
          .replace(/[ \t]+$/gm, '')
          .replace(/--/g, '—')} -->`,
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
