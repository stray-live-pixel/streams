import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildEditor } from '../scripts/build-editor.mjs';
import { createEditorServer } from '../src/editor/server.ts';

const root = await mkdtemp(path.join(tmpdir(), 'harbor-editor-e2e-'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
await mkdir(path.join(root, 'src/objects'), { recursive: true });
await writeFile(path.join(root, 'src/objects/templates.json'), '{"version":1,"objects":{}}\n');
git('init', '-b', 'main');
git('config', 'user.name', 'Editor test');
git('config', 'user.email', 'editor@example.invalid');
git('add', '.');
git('commit', '-m', 'fixture');
const directory = await buildEditor();
const library = JSON.parse(await readFile('.generated/library-models.json', 'utf8'));
let rebuilds = 0;
const { server } = createEditorServer({
  root,
  directory,
  assets: new Set(Object.keys(library)),
  rebuild: async () => {
    rebuilds++;
  },
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
});
const screenshots = await mkdtemp(path.join(tmpdir(), 'harbor-editor-screens-'));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(url))
      external.push(request.url());
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('#object-parts button').length === 8);
  assert.equal(await page.locator('#object-project').count(), 0);
  assert.equal(await page.locator('#object-export, #object-import').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(await page.locator('#objects-list button').count(), 259);
  const choose = async (id) => {
    await page.selectOption('#objects-group', '');
    await page.fill('#objects-search', '');
    await page.locator(`[data-object="${id}"]`).click();
  };
  const visible = () =>
    page.waitForFunction(() => {
      const canvas = document.querySelector('#object-canvas'),
        sample = document.createElement('canvas');
      sample.width = sample.height = 48;
      const ctx = sample.getContext('2d');
      ctx.drawImage(canvas, 0, 0, 48, 48);
      return (
        ctx.getImageData(0, 0, 48, 48).data.filter((v, i) => i % 4 === 3 && v > 10).length > 15
      );
    });
  for (const id of Object.keys(library)) {
    await page.locator(`[data-object="${id}"]`).evaluate((button) => button.click());
    assert.equal(await page.locator('#object-error').textContent(), '', id);
    await visible();
  }
  await choose('game/house/0');
  await visible();
  await page.locator('#object-parts button').first().click();
  await page.waitForTimeout(150);
  const startY = await page.inputValue('#part-position-1');
  const handle = await page.locator('#object-canvas').evaluate((canvas) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.canvas.width = canvas.width;
    ctx.canvas.height = canvas.height;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sx = 0,
      sy = 0,
      count = 0;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 1] > 170 && data[i] < 90 && data[i + 2] < 90) {
          sx += x;
          sy += y;
          count++;
        }
      }
    if (!count) throw new Error('No Y-axis handle');
    const box = canvas.getBoundingClientRect();
    return {
      x: box.x + ((sx / count) * box.width) / canvas.width,
      y: box.y + ((sy / count) * box.height) / canvas.height,
    };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y - 45, { steps: 12 });
  await page.mouse.up();
  assert.notEqual(await page.inputValue('#part-position-1'), startY);
  await page.click('#object-undo');
  assert.equal(await page.inputValue('#part-position-1'), startY);
  await page.fill('#part-position-0', '1');
  await page.locator('#part-position-0').press('Tab');
  assert.equal(await page.locator('#object-bounds').getAttribute('data-outside'), 'true');
  await page.click('#object-undo');
  assert.equal(await page.locator('#object-bounds').getAttribute('data-outside'), 'false');
  await page.fill('#part-rotation-2', '15');
  await page.locator('#part-rotation-2').press('Tab');
  await page.fill('#part-scale-1', '0.9');
  await page.locator('#part-scale-1').press('Tab');
  await page.click('#object-undo');
  await page.click('#object-redo');
  assert.equal(await page.inputValue('#part-scale-1'), '0.9');
  await page.click('#object-duplicate');
  assert.equal(await page.locator('#object-parts button').count(), 9);
  await page.click('#object-delete');
  assert.equal(await page.locator('#object-parts button').count(), 8);
  await page.click('#object-library');
  await page.fill('#objects-search', 'chimney');
  await page.click('#object-add');
  assert.equal(await page.locator('#object-parts button').count(), 9);
  await page.fill('#part-scale-0', '0.3');
  await page.locator('#part-scale-0').press('Tab');
  await page.fill('#part-position-0', '0.4');
  await page.locator('#part-position-0').press('Tab');
  const oldCommit = git('rev-parse', 'main');
  await page.click('#object-save');
  await page.waitForFunction(() =>
    /main · [a-f0-9]{7}/.test(document.querySelector('#object-save-status').textContent),
  );
  assert.notEqual(git('rev-parse', 'main'), oldCommit);
  assert.equal(rebuilds, 1);
  assert.equal(
    git('diff-tree', '--no-commit-id', '--name-only', '-r', 'main'),
    'src/objects/templates.json',
  );
  assert.equal(
    JSON.parse(git('show', 'main:src/objects/templates.json')).objects['game/house/0'].at(-1)
      .position[0],
    0.4,
  );
  assert.equal(git('status', '--porcelain'), '');
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#object-parts button').length === 9);
  await page.locator('#object-parts button').last().click();
  assert.equal(await page.inputValue('#part-position-0'), '0.4');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  const token = await page.locator('meta[name="editor-token"]').getAttribute('content');
  assert.equal((await fetch(`${url}/api/project`)).status, 403);
  assert.equal(
    (
      await fetch(`${url}/api/project`, {
        headers: { 'X-Editor-Token': token, Origin: 'https://example.invalid' },
      })
    ).status,
    403,
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await visible();
  await page.screenshot({ path: path.join(screenshots, 'editor-1100.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await choose('game/house/1');
  await visible();
  await page.locator('#object-parts button').nth(4).click();
  await page.screenshot({ path: path.join(screenshots, 'editor-1440.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    'Editor: 239 assets, bounded game cell, gizmos, transforms, history, direct file save, main commit, reload, no browser storage and local API access PASS',
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
