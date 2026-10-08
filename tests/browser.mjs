import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const screenshots = await mkdtemp(path.join(tmpdir(), 'quiet-harbor-'));
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 1000 },
      offline: true,
    });
    const page = await context.newPage();
    const errors = [],
      network = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (/^https?:/.test(req.url())) network.push(req.url());
    });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    await page.waitForFunction(() => window.cityDebug);
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'Three.js');
    const tile = async (x, z) => {
      const point = await page.evaluate(([x, z]) => cityDebug.projectTile(x, z), [x, z]);
      assert.equal(
        await page.evaluate((p) => document.elementFromPoint(p.x, p.y).id, point),
        'world',
      );
      await page.mouse.click(point.x, point.y);
    };
    await page.click('#coach-action');
    await page.click('[data-type="port"]');
    await tile(7, 6);
    assert.equal(await page.evaluate(() => cityDebug.state.step), 7);
    await tile(6, 11);
    await page.click('[data-type="road"]');
    await tile(7, 6);
    await tile(7, 6);
    assert.equal(await page.evaluate(() => cityDebug.state.money), 600);
    for (const [type, x, z] of [
      ['house', 7, 6],
      ['farm', 4, 7],
      ['shop', 6, 7],
    ]) {
      await page.click(`[data-type="${type}"]`);
      await tile(x, z);
    }
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 0);
    await page.click('#next-day');
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 10);
    assert.equal(await page.evaluate(() => cityDebug.state.money), 300);
    await page.waitForTimeout(3100);
    await page.screenshot({ path: path.join(screenshots, `arrival-${width}.png`) });
    await page.waitForFunction(() => !cityDebug.busy);
    await page.click('#coach-action');
    await page.click('#next-day');
    assert.equal(await page.evaluate(() => cityDebug.busy), false);
    await page.click('#reset-progress');
    await page.click('#cancel-reset');
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 10);
    await page.reload();
    await page.waitForFunction(() => window.cityDebug);
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 10);
    await page.click('#rotate-right');
    await page.click('#home');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: path.join(screenshots, `city-${width}.png`) });
    await page.click('#reset-progress');
    await page.click('#confirm-reset');
    await page.reload();
    assert.equal(await page.evaluate(() => cityDebug.state.money), 600);
    assert.equal(await page.evaluate(() => cityDebug.state.step), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log(`${width}px: offline release, tutorial, roads, arrivals, saves, reset PASS`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Screenshots: ${screenshots}`);
