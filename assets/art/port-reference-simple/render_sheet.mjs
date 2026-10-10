import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const views = [
  ['front', 'СПЕРЕДИ · СО СТОРОНЫ МОРЯ'],
  ['back', 'СЗАДИ · СО СТОРОНЫ СУШИ'],
  ['right', 'СПРАВА'],
  ['top', 'СВЕРХУ'],
];
const cards = await Promise.all(views.map(async ([name, label]) => {
  const png = await readFile(new URL(`view-${name}.png`, import.meta.url));
  return `<section><img src="data:image/png;base64,${png.toString('base64')}"><div>${label}</div></section>`;
}));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1300 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><head><style>
    * { box-sizing: border-box; }
    body { margin: 0; display: grid; grid-template-columns: 800px 800px; background: #f2eee6; color: #4a4c40; }
    section { height: 650px; border: 1px solid #d6d0c4; }
    img { display: block; width: 798px; height: 598px; object-fit: contain; }
    div { height: 50px; font: 500 18px/50px Arial, sans-serif; text-align: center; letter-spacing: 2px; }
  </style></head><body>${cards.join('')}</body></html>`);
  await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode())); });
  await page.screenshot({ path: fileURLToPath(new URL('four-views.png', import.meta.url)) });
} finally {
  await browser.close();
}
