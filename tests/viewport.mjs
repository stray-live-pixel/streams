import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    offline: true,
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);

  async function checkFrame(width, height) {
    await page.waitForFunction(
      ({ width, height }) => {
        const box = document.querySelector('#game-viewport').getBoundingClientRect();
        return Math.abs(box.width - Math.min(width, (height * 16) / 9)) < 0.1;
      },
      { width, height },
    );
    const box = await page.locator('#game-viewport').boundingBox();
    assert(Math.abs(box.width / box.height - 16 / 9) < 0.001);
    assert(Math.abs(box.x * 2 + box.width - width) < 0.1);
    assert(Math.abs(box.y * 2 + box.height - height) < 0.1);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const image = PNG.sync.read(await page.screenshot());
    const points =
      box.y > 2
        ? [
            [width / 2, 1],
            [width / 2, height - 2],
          ]
        : box.x > 2
          ? [
              [1, height / 2],
              [width - 2, height / 2],
            ]
          : [];
    for (const [x, y] of points) {
      const pixel = (Math.floor(y * 2) * image.width + Math.floor(x * 2)) * 4;
      assert.deepEqual([...image.data.subarray(pixel, pixel + 4)], [0, 0, 0, 255]);
    }
    return box;
  }
  async function inside(selector, frame) {
    const box = await page.locator(selector).boundingBox();
    assert(box, `${selector} is visible`);
    assert(box.x >= frame.x - 1 && box.y >= frame.y - 1, `${selector} starts within frame`);
    assert(box.x + box.width <= frame.x + frame.width + 1, `${selector} fits horizontally`);
    assert(box.y + box.height <= frame.y + frame.height + 1, `${selector} fits vertically`);
  }

  for (const [width, height] of [
    [1440, 1000],
    [2400, 900],
    [1280, 720],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const frame = await checkFrame(width, height);
    await inside('.menu-card', frame);
    await page.click('#menu-settings');
    await inside('#settings-dialog', frame);
    const settings = await page.locator('#settings-dialog').boundingBox();
    assert(Math.abs(settings.width / frame.width - 560 / 1440) < 0.001);
    await checkFrame(width, height);
    await page.keyboard.press('Escape');
    await page.click('#menu-intro');
    const intro = await page.locator('#intro-dialog').boundingBox();
    assert(Math.abs(intro.width - frame.width) < 0.1);
    assert(Math.abs(intro.height - frame.height) < 0.1);
    await inside('.intro-sheet', frame);
    await checkFrame(width, height);
    await page.click('#intro-close');
  }

  assert.equal(await page.locator('#menu-objects').count(), 0);
  await page.click('#menu-start');
  await page.click('#coach-action');
  await page.click('[data-type="port"]');
  // Build using real pointer coordinates after resizing an already-created WebGL scene.
  await page.setViewportSize({ width: 390, height: 844 });
  const frame = await checkFrame(390, 844);
  await inside('#world', frame);
  const point = await page.evaluate(() => cityDebug.projectTile(6, 11));
  await page.mouse.click(point.x, point.y);
  assert(
    await page.evaluate(() =>
      cityDebug.state.buildings.some((b) => b.t === 'port' && b.x === 6 && b.z === 11),
    ),
  );
  await page.keyboard.press('Escape');
  await inside('#pause-dialog', frame);
  await checkFrame(390, 844);
  assert.deepEqual(errors, []);
  console.log('16:9: fit, black bars, resize, menu, dialogs, intro and scaled building input PASS');
} finally {
  await browser.close();
}
