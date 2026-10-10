import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
});
const screenshots = await mkdtemp(path.join(tmpdir(), 'harbor-island-'));
try {
  const context = await browser.newContext({
    offline: true,
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 810 },
  });
  const page = await context.newPage();
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  const ready = async () => {
    await page.waitForFunction(() => {
      const source = document.querySelector('#scene');
      if (!source || !cityDebug.environment?.settled) return false;
      const sample = document.createElement('canvas');
      sample.width = 144;
      sample.height = 81;
      const ctx = sample.getContext('2d');
      ctx.drawImage(source, 0, 0, 144, 81);
      const pixels = ctx.getImageData(0, 0, 144, 81).data;
      let land = 0,
        sea = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > pixels[i + 2] * 1.35 && pixels[i + 1] > pixels[i + 2] * 1.4) land++;
        if (pixels[i + 2] > pixels[i] * 1.5 && pixels[i + 1] > pixels[i] * 1.5) sea++;
      }
      return land > 650 && sea > 2500;
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  const frame = () => page.locator('#scene').evaluate((c) => c.toDataURL());
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.click('#menu-start');
  await ready();
  const first = await page.evaluate(() => cityDebug.state);
  assert(first.islandSeed > 0);
  const firstFrame = await frame();
  await page.screenshot({ path: path.join(screenshots, 'new-island.png') });
  await page.reload();
  await page.click('#menu-start');
  await ready();
  assert.equal(await page.evaluate(() => cityDebug.state.islandSeed), first.islandSeed);
  assert.equal(await frame(), firstFrame, 'Продолжение сохраняет и географию, и декор');
  await page.click('#open-menu');
  await page.click('#pause-settings');
  await page.click('#reset-progress');
  await page.click('#confirm-reset');
  await ready();
  const second = await page.evaluate(() => cityDebug.state);
  assert.notEqual(second.islandSeed, first.islandSeed);
  assert.notEqual(await frame(), firstFrame, 'Новая история действительно меняет 3D-остров');
  await page.screenshot({ path: path.join(screenshots, 'another-island.png') });
  // Выбранный на новой географии порт проходит и визуальное попадание, и доменные правила.
  await page.click('#coach-action');
  await page.click('[data-type="port"]');
  const location = await page.evaluate(() => cityDebug.projectTile(6, 11));
  await page.mouse.click(location.x, location.y);
  assert((await page.evaluate(() => cityDebug.state.buildings)).some((b) => b.t === 'port'));
  await ready();
  await page.screenshot({ path: path.join(screenshots, 'island-with-port.png') });
  // Старый город мигрирует без случайного изменения берега или потери построек.
  await page.evaluate(() => {
    const old = { ...cityDebug.state, version: 5 };
    delete old.islandSeed;
    old.buildings = old.buildings.map(({ legacy, ...b }) => ({
      ...b,
      x: Math.round(b.x),
      z: Math.round(b.z),
    }));
    localStorage.setItem('ostrov-simple-v2', JSON.stringify(old));
  });
  await page.reload();
  await page.click('#menu-start');
  await ready();
  assert.equal(await page.evaluate(() => cityDebug.state.islandSeed), 0);
  assert((await page.evaluate(() => cityDebug.state.buildings)).some((b) => b.t === 'port'));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await context.close();
  console.log(
    `Procedural island: real WebGL land/water, stable save, different new game, port picking, old-city migration and offline assets PASS. Screenshots: ${screenshots}`,
  );
} finally {
  await browser.close();
}
