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
        await visiblePixels();
      }
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
    `Objects: all ${rawIds.length} OBJ models, game compositions, camera, search, mobile, offline and save isolation PASS`,
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
