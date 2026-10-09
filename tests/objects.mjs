import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const screenshots = await mkdtemp(path.join(tmpdir(), 'quiet-harbor-objects-'));
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const rawIds = [];
for (const pack of ['kenney-fantasy-town', 'kenney-pirate']) {
  for (const file of await readdir(`assets/${pack}/Models/OBJ format`)) {
    if (file.endsWith('.obj')) rawIds.push(`${pack}/${file.slice(0, -4)}`);
  }
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      offline: true,
    });
    const page = await context.newPage();
    const errors = [],
      requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    const before = await page.evaluate(() => JSON.stringify(cityDebug.state));
    await page.click('#menu-objects');
    await page.locator('#objects-dialog').waitFor({ state: 'visible' });
    const ids = await page
      .locator('#objects-list button')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.object));
    for (const id of rawIds) assert(ids.includes(id), `Missing OBJ: ${id}`);
    assert(
      ids.includes('game/beacon') && ids.includes('game/person/3') && ids.includes('game/smoke'),
    );
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'not-started');
    assert.equal(await page.evaluate(() => localStorage.getItem('ostrov-simple-v2')), null);
    assert.equal(await page.locator('#menu-video').evaluate((video) => video.paused), true);
    assert.equal(
      await page
        .locator('#objects-dialog')
        .evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth),
      false,
    );
    const visiblePixels = async () => {
      await page.waitForFunction(() => {
        const source = document.querySelector('#object-canvas');
        const sample = document.createElement('canvas');
        sample.width = sample.height = 48;
        const ctx = sample.getContext('2d');
        ctx.drawImage(source, 0, 0, 48, 48);
        const pixels = ctx.getImageData(0, 0, 48, 48).data;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 10) count++;
        return count > 15;
      });
    };
    await visiblePixels();
    await page.screenshot({ path: path.join(screenshots, `objects-${width}.png`) });
    if (width === 1440) {
      // Every item must generate valid, visible geometry, not just appear in the list.
      for (const id of ids) {
        await page
          .locator('#objects-list button')
          .evaluateAll(
            (buttons, id) => buttons.find((button) => button.dataset.object === id).click(),
            id,
          );
        assert.equal(await page.locator('#object-error').textContent(), '', id);
        assert.match(await page.locator('#object-stats').textContent(), /[1-9]/, id);
        assert(!/NaN|Infinity/.test(await page.locator('#object-stats').textContent()), id);
        // Wait for the newly selected model, including asynchronous material compilation.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await visiblePixels().catch((error) => {
          throw new Error(`${id}: ${error.message}`);
        });
      }
    }
    if (width === 1440) {
      await page.selectOption('#object-project', 'game/house/0');
      assert.equal(await page.locator('#object-parts button').count(), 8);
      await page.locator('#object-parts button').first().click();
      // Drag the actual rendered Y-axis handle, rather than invoking scene internals.
      await page.waitForTimeout(150);
      const beforeDrag = await page.inputValue('#part-position-1');
      const handle = await page.locator('#object-canvas').evaluate((canvas) => {
        const context = document.createElement('canvas').getContext('2d');
        context.canvas.width = canvas.width;
        context.canvas.height = canvas.height;
        context.drawImage(canvas, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sumX = 0,
          sumY = 0,
          count = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (data[i + 1] > 170 && data[i] < 90 && data[i + 2] < 90) {
              sumX += x;
              sumY += y;
              count++;
            }
          }
        if (!count) throw new Error('Y-axis gizmo is not visible');
        const box = canvas.getBoundingClientRect();
        return {
          x: box.x + ((sumX / count) * box.width) / canvas.width,
          y: box.y + ((sumY / count) * box.height) / canvas.height,
        };
      });
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x, handle.y - 45, { steps: 12 });
      await page.mouse.up();
      assert.notEqual(await page.inputValue('#part-position-1'), beforeDrag);
      await page.click('#object-undo');
      assert.equal(await page.inputValue('#part-position-1'), beforeDrag);
      // Numeric transforms survive selection changes and undo/redo.
      for (const [field, value] of [
        ['position-0', '0.25'],
        ['rotation-2', '15'],
        ['scale-1', '0.9'],
      ]) {
        await page.fill(`#part-${field}`, value);
        await page.locator(`#part-${field}`).press('Tab');
      }
      await page.click('#object-undo');
      assert.notEqual(await page.inputValue('#part-scale-1'), '0.9');
      await page.click('#object-redo');
      assert.equal(await page.inputValue('#part-scale-1'), '0.9');
      await page.click('#object-duplicate');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      await page.click('#object-delete');
      assert.equal(await page.locator('#object-parts button').count(), 8);
      await page.click('#object-undo');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      await page.click('#object-redo');
      assert.equal(await page.locator('#object-parts button').count(), 8);
      await page.click('#object-library');
      await page.fill('#objects-search', 'chimney');
      await page.click('#object-add');
      assert.equal(await page.locator('#object-title').textContent(), 'Жилой дом · вариант 1');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      await page.fill('#part-position-0', '0.4');
      await page.locator('#part-position-0').press('Tab');
      await page.fill('#part-scale-0', '0.3');
      await page.locator('#part-scale-0').press('Tab');
      await page.selectOption('#object-project', 'game/shop/0');
      await page.selectOption('#object-project', 'game/house/0');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      await page.locator('#object-parts button').last().click();
      assert.equal(await page.inputValue('#part-position-0'), '0.4');
      // Export includes unsaved work; save persists separately from the city.
      const downloadEvent = page.waitForEvent('download');
      await page.click('#object-export');
      const download = await downloadEvent;
      const downloadPath = await download.path();
      const exported = JSON.parse(
        await (await import('node:fs/promises')).readFile(downloadPath, 'utf8'),
      );
      assert.equal(exported.objects['game/house/0'].length, 9);
      await page.click('#object-save');
      const savedTemplates = await page.evaluate(() =>
        localStorage.getItem('ostrov-object-templates-v1'),
      );
      assert.equal(JSON.parse(savedTemplates).objects['game/house/0'].at(-1).position[0], 0.4);
      await page.keyboard.press('Escape');
      await page.click('#menu-objects');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      await page.reload();
      await page.click('#menu-objects');
      assert.equal(await page.locator('#object-parts button').count(), 9);
      const invalid = {
        version: 1,
        objects: { 'game/house/0': [{ id: 'bad', asset: 'missing' }] },
      };
      await page.setInputFiles('#object-import-file', {
        name: 'invalid.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(invalid)),
      });
      await page.waitForFunction(() =>
        document.querySelector('#object-save-status').textContent.includes('Некорректный'),
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem('ostrov-object-templates-v1')),
        savedTemplates,
      );
      await page.setInputFiles('#object-import-file', {
        name: 'templates.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(exported)),
      });
      await page.waitForFunction(() =>
        document.querySelector('#object-save-status').textContent.includes('импортирована'),
      );
      await page.locator('#object-parts button').first().click();
      await page.screenshot({ path: path.join(screenshots, 'workshop-editor.png') });
      // Restore a clean composition through the same reversible editing path.
      await page.click('#object-original');
      assert.equal(await page.locator('#object-parts button').count(), 8);
      await page.click('#object-save');
      await page.fill('#objects-search', '');
    }
    await page.selectOption('#objects-group', 'Объекты игры');
    await page.fill('#objects-search', 'маяк');
    assert.equal(await page.locator('#objects-list button').count(), 1);
    assert.equal(await page.locator('#object-title').textContent(), 'Порт с маяком');
    await visiblePixels();
    await page.screenshot({ path: path.join(screenshots, `beacon-${width}.png`) });
    const pixels = () => page.locator('#object-canvas').evaluate((canvas) => canvas.toDataURL());
    const initial = await pixels();
    await page.click('#object-right');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.notEqual(await pixels(), initial);
    await page.click('#object-zoom-in');
    await page.click('#object-reset');
    await page.fill('#objects-search', 'does-not-exist');
    assert.equal(await page.locator('#objects-empty').isVisible(), true);
    assert.equal(await page.locator('#object-next').isDisabled(), true);
    await page.fill('#objects-search', '');
    await page.click('#object-next');
    assert.notEqual(await page.locator('#object-title').textContent(), 'Порт с маяком');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#objects-dialog').isVisible(), false);
    assert.equal(
      await page.locator('#menu-objects').evaluate((button) => button === document.activeElement),
      true,
    );
    assert.equal(await page.evaluate(() => JSON.stringify(cityDebug.state)), before);
    await page.click('#menu-objects');
    await visiblePixels();
    await page.click('#objects-close');
    await page.click('#menu-start');
    await page.click('#open-menu');
    await page.click('#main-menu-button');
    const saved = await page.evaluate(() => localStorage.getItem('ostrov-simple-v2'));
    await page.click('#menu-objects');
    await page.click('#object-next');
    await page.click('#objects-close');
    assert.equal(await page.evaluate(() => localStorage.getItem('ostrov-simple-v2')), saved);
    await page.click('#menu-start');
    assert.equal(await page.evaluate(() => cityDebug.paused), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    await context.close();
  }
  console.log(
    `Objects: all ${rawIds.length} OBJ models, game compositions, editing, history, import/export, persistence, camera, search, mobile, offline and save isolation PASS`,
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
