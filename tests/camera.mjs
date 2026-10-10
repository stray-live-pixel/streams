import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined),
});
const screenshots = await mkdtemp(path.join(tmpdir(), 'harbor-camera-'));
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    offline: true,
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.click('#menu-start');
  await page.waitForFunction(() => cityDebug.camera !== null);
  const state = () => page.evaluate(() => cityDebug.camera);
  const hold = async (key, ms = 350) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  const saved = await page.evaluate(() => cityDebug.state);
  const initial = await state();
  assert.equal(await page.locator('.camera button svg').count(), 5);
  // Камера работает даже после фокусировки обычной кнопки UI.
  await page.locator('#home').focus();
  await hold('e');
  assert((await state()).yaw > initial.yaw + 0.15);
  await page.waitForTimeout(600);
  const stopped = await state();
  await page.waitForTimeout(200);
  assert(Math.abs((await state()).yaw - stopped.yaw) < 0.002, 'Keyup must stop rotation');
  const tilted = await state();
  await hold('ArrowUp');
  assert((await state()).pitch > tilted.pitch + 0.1);
  await hold('w');
  assert(Math.hypot((await state()).x - initial.x, (await state()).z - initial.z) > 0.5);
  await hold('+');
  assert((await state()).zoom > initial.zoom + 0.1);
  await page.keyboard.press('Home');
  await page.waitForTimeout(650);
  for (const key of Object.keys(initial))
    assert(Math.abs((await state())[key] - initial[key]) < 0.002);
  await hold('ArrowDown', 2600);
  await page.waitForTimeout(650);
  assert((await state()).pitch < -1.55, 'Обзор достигает зенита');
  await page.keyboard.press('Home');
  await page.waitForTimeout(650);

  const left = await page.locator('#rotate-left').boundingBox();
  await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  assert((await state()).yaw < initial.yaw - 0.1, 'Toolbar must rotate while held');
  assert.equal(await page.locator('.camera [data-pressed]').count(), 0);
  await page.click('#home');
  await page.waitForTimeout(600);
  const canvas = await page.locator('#world').boundingBox();
  const x = canvas.x + canvas.width * 0.73,
    y = canvas.y + canvas.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 100, y + 35, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(350);
  assert((await state()).yaw > initial.yaw + 0.3);
  assert((await state()).pitch > initial.pitch + 0.08);
  const beforePan = await state();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 75, y + 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  assert(Math.hypot((await state()).x - beforePan.x, (await state()).z - beforePan.z) > 0.3);
  const beforeZoom = (await state()).zoom;
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(350);
  assert((await state()).zoom > beforeZoom + 0.1);
  assert.deepEqual(
    await page.evaluate(() => cityDebug.state),
    saved,
    'Camera gestures must not build or change the city',
  );

  await page.keyboard.down('e');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.keyboard.up('e');
  const paused = await state();
  await page.waitForTimeout(250);
  assert.deepEqual(await state(), paused);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.deepEqual(await state(), paused, 'Resume must not restore held movement');

  await page.click('#help');
  const dialogState = await state();
  await hold('e', 200);
  assert.deepEqual(await state(), dialogState, 'Dialog must own keyboard input');
  await page.click('#close-help');
  await page.keyboard.down('e');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('e');
  const blurred = await state();
  await page.waitForTimeout(250);
  assert.deepEqual(await state(), blurred, 'Blur must cancel held movement');

  await page.click('#home');
  await page.waitForTimeout(650);
  // После смены ракурса попадание по клетке всё ещё соответствует проекции камеры.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('#coach-action');
  await page.click('[data-type="port"]');
  await hold('e', 180);
  await hold('ArrowUp', 150);
  await page.waitForTimeout(350);
  const tile = await page.evaluate(() => cityDebug.projectTile(6, 11));
  await page.mouse.click(tile.x, tile.y);
  assert((await page.evaluate(() => cityDebug.state)).buildings.some((b) => b.t === 'port'));
  await page.click('#home');
  await page.waitForTimeout(650);
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const frame = await page.locator('#game-viewport').boundingBox();
    const panel = await page.locator('.camera').boundingBox();
    assert(
      panel.x >= frame.x &&
        panel.y >= frame.y &&
        panel.x + panel.width <= frame.x + frame.width + 1 &&
        panel.y + panel.height <= frame.y + frame.height + 1,
    );
    await page.screenshot({ path: path.join(screenshots, `camera-${width}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Camera: continuous keys, toolbar hold, orbit, pan, zoom, reset, pause, dialog, blur, unchanged city and scaled picking PASS',
  );
  console.log(`Camera screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
