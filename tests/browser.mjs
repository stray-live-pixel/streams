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
      deviceScaleFactor: width === 390 ? 2 : 1,
    });
    const page = await context.newPage();
    // This tutorial uses fixed placement coordinates. Keep its coastline fixed;
    // randomized geography is exercised by the dedicated island/placement suites.
    await page.addInitScript(() => {
      const randomValues = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = 2674391865;
          return array;
        }
        return randomValues(array);
      };
    });
    page.setDefaultTimeout(20000);
    const errors = [],
      network = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => {
      if (/^https?:/.test(req.url())) network.push(req.url());
    });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    await page.waitForFunction(() => window.cityDebug);
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'not-started');
    assert.equal(await page.locator('#scene').count(), 0);
    assert.equal(await page.locator('#game-screen').isVisible(), false);
    const background = page.locator('img.menu-background');
    await background.evaluate((image) => image.decode());
    assert.equal(await background.evaluate((image) => image.naturalWidth), 1536);
    assert.match(await background.getAttribute('src'), /^data:image\/webp;base64,/);
    assert.equal(await page.locator('#main-menu svg').count(), 0);
    assert.equal(
      await page.locator('#main-menu').evaluate((menu) => menu.scrollWidth > menu.clientWidth),
      false,
    );
    assert.equal(await page.locator('#menu-start').textContent(), 'Новая игра');
    assert.equal(await page.evaluate(() => localStorage.getItem('ostrov-simple-v2')), null);
    await page.screenshot({ path: path.join(screenshots, `menu-${width}.png`) });
    await page.click('#menu-help');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#main-menu').isVisible(), true);
    await page.click('#menu-settings');
    assert.equal(await page.locator('#reset-progress').isDisabled(), true);
    await page.selectOption('#setting-quality', 'low');
    await page.uncheck('#setting-animation');
    await page.uncheck('#setting-hints');
    await page.screenshot({ path: path.join(screenshots, `settings-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.reload();
    await page.click('#menu-settings');
    assert.equal(await page.locator('#setting-quality').inputValue(), 'low');
    assert.equal(await page.locator('#setting-animation').isChecked(), false);
    assert.equal(await page.locator('#setting-hints').isChecked(), false);
    assert.equal(await page.locator('#scene').count(), 0);
    await page.click('#close-settings');
    await page.click('#menu-start');
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'Babylon.js');
    assert.equal(await page.evaluate(() => cityDebug.paused), false);
    assert.equal(await page.locator('#coach-title').isVisible(), true);
    assert.equal(await page.locator('#scene').evaluate((c) => c.width), 1440);
    const requestReset = async () => {
      await page.click('#open-menu');
      await page.click('#pause-settings');
      await page.click('#reset-progress');
    };
    const reloadAndContinue = async () => {
      await page.reload();
      assert.equal(await page.locator('#menu-start').textContent(), 'Продолжить');
      assert.equal(await page.locator('#scene').count(), 0);
      assert.equal(await page.locator('#ending-dialog').isVisible(), false);
      await page.click('#menu-start');
    };
    // Escape работает с фокусом на кнопке; под паузой горячие клавиши не строят город.
    await page.focus('#coach-action');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pause-dialog').isVisible(), true);
    await page.click('#pause-settings');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pause-dialog').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => cityDebug.paused), false);
    // Логика может работать даже при пустом WebGL-кадре. Проверяем сам рисунок острова.
    await page.waitForFunction(() => {
      const source = document.querySelector('#scene');
      const sample = document.createElement('canvas');
      sample.width = sample.height = 32;
      const ctx = sample.getContext('2d');
      ctx.drawImage(source, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 100) visible++;
      return visible > 50;
    });
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
    // Пауза и главное меню замораживают рейс, даже дольше его полной длительности.
    await page.keyboard.press('Escape');
    const beforePause = await page.evaluate(() => cityDebug.state);
    const pausedFrame = await page.locator('#scene').evaluate((c) => c.toDataURL());
    await page.locator('#pause-title').evaluate((title) => {
      title.tabIndex = -1;
      title.focus();
    });
    await page.keyboard.press('Space');
    await page.click('#main-menu-button');
    assert.equal(await page.locator('#menu-start').textContent(), 'Продолжить');
    await page.locator('#menu-title').evaluate((title) => {
      title.tabIndex = -1;
      title.focus();
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(width === 1440 ? 7300 : 400);
    assert.deepEqual(await page.evaluate(() => cityDebug.state), beforePause);
    assert.equal(await page.evaluate(() => cityDebug.busy), true);
    assert.equal(await page.locator('#scene').evaluate((c) => c.toDataURL()), pausedFrame);
    await page.screenshot({ path: path.join(screenshots, `continue-${width}.png`) });
    await page.click('#menu-start');
    await page.waitForTimeout(3100);
    await page.screenshot({ path: path.join(screenshots, `arrival-${width}.png`) });
    await page.waitForFunction(() => !cityDebug.busy);
    await page.click('#coach-action');
    await page.click('#next-day');
    assert.equal(await page.evaluate(() => cityDebug.busy), false);
    await requestReset();
    await page.click('#cancel-reset');
    assert.equal(await page.locator('#settings-dialog').isVisible(), true);
    await page.click('#close-settings');
    await page.click('#resume-game');
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 10);
    await reloadAndContinue();
    assert.equal(await page.evaluate(() => cityDebug.state.pop), 10);
    assert.equal(await page.locator('#coach-text').isVisible(), false);
    assert.equal(await page.locator('#mission').isVisible(), true);
    await page.click('#rotate-right');
    await page.click('#home');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: path.join(screenshots, `city-${width}.png`) });
    await requestReset();
    await page.click('#confirm-reset');
    assert.equal(await page.locator('#coach-title').isVisible(), true);
    assert.equal(await page.locator('#setting-quality').inputValue(), 'low');
    await reloadAndContinue();
    assert.equal(await page.evaluate(() => cityDebug.state.money), 600);
    assert.equal(await page.evaluate(() => cityDebug.state.step), 0);
    // Отдельный сохранённый город у порога финала. Полный экономический путь покрыт domain-тестом.
    await page.evaluate(() => {
      const state = {
        ...cityDebug.state,
        day: 12,
        pop: 50,
        money: 350,
        food: 120,
        step: 6,
        won: false,
        endingSeen: false,
        buildings: [
          { t: 'hall', x: 5, z: 5 },
          { t: 'port', x: 6, z: 11 },
          ...[
            [4, 5],
            [6, 5],
            [4, 7],
            [6, 7],
            [7, 5],
          ].map(([x, z]) => ({ t: 'house', x, z })),
          ...[
            [3, 4],
            [3, 6],
            [3, 8],
          ].map(([x, z]) => ({ t: 'farm', x, z })),
          { t: 'shop', x: 7, z: 7 },
          ...[
            [5, 6],
            [5, 7],
            [5, 8],
            [6, 8],
            [6, 9],
            [6, 10],
            [4, 6],
            [6, 6],
            [7, 6],
          ].map(([x, z]) => ({ t: 'road', x, z })),
        ],
      };
      localStorage.setItem('ostrov-simple-v2', JSON.stringify(state));
    });
    await reloadAndContinue();
    await page.waitForFunction(() => cityDebug.state.pop === 50);
    await page.click('#light-beacon');
    await page.waitForSelector('#ending-dialog[open]');
    assert.equal(await page.evaluate(() => cityDebug.state.money), 50);
    await page.screenshot({ path: path.join(screenshots, `ending-${width}.png`) });
    await reloadAndContinue();
    await page.waitForSelector('#ending-dialog[open]');
    assert.equal(await page.evaluate(() => cityDebug.state.money), 50);
    await page.click('#continue-city');
    await reloadAndContinue();
    await page.waitForFunction(() => cityDebug.state.endingSeen);
    assert.equal(await page.locator('#ending-dialog').evaluate((d) => d.open), false);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshots, `finished-city-${width}.png`) });
    await page.click('#read-ending');
    await page.waitForSelector('#ending-dialog[open]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ending-dialog').evaluate((d) => d.open), false);
    await page.click('#next-day');
    assert.equal(await page.evaluate(() => cityDebug.state.day), 13);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log(
      `${width}px: offline release, main menu, pause, settings, tutorial, arrivals, saves, reset, finale PASS`,
    );
    await context.close();
  }
  // Проверяем реальный декодер, переход через конец ролика и экономию ресурсов вне меню.
  const videoContext = await browser.newContext({ offline: true, reducedMotion: 'no-preference' });
  const videoPage = await videoContext.newPage();
  await videoPage.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  const video = videoPage.locator('#menu-video');
  const waitForPlayback = () =>
    videoPage.waitForFunction(() => {
      const background = document.querySelector('#menu-video');
      return !background.paused && background.currentTime > 0.1;
    });
  await waitForPlayback();
  const media = await video.evaluate((v) => ({
    duration: v.duration,
    muted: v.muted,
    loop: v.loop,
    playbackRate: v.playbackRate,
  }));
  assert(Math.abs(media.duration - 15) < 0.1);
  assert.equal(media.muted, true);
  assert.equal(media.loop, true);
  assert.equal(media.playbackRate, 0.5);
  await videoPage.screenshot({ path: path.join(screenshots, 'menu-video.png') });
  await video.evaluate((v) => {
    v.currentTime = v.duration - 0.2;
  });
  await videoPage.waitForFunction(() => {
    const background = document.querySelector('#menu-video');
    return !background.paused && background.currentTime < 1;
  });
  // Обе половины показывают одну дугу: жест сохраняет направление и не перескакивает край.
  await video.evaluate((v) => {
    v.currentTime = v.duration / 4;
  });
  const viewProgress = () =>
    video.evaluate((v) => {
      const time = Math.min(v.currentTime, v.duration - v.currentTime);
      return (1 - Math.cos((2 * Math.PI * time) / v.duration)) / 2;
    });
  await videoPage.mouse.move(50, 100);
  await videoPage.mouse.down();
  const dragStart = await viewProgress();
  const viewportWidth = await videoPage
    .locator('#main-menu')
    .evaluate((el) => el.getBoundingClientRect().width);
  const expectedProgress = (x) => Math.max(0, Math.min(1, dragStart + (x - 50) / viewportWidth));
  await videoPage.mouse.move(250, 100);
  assert.equal(await video.evaluate((v) => v.paused), true);
  assert(Math.abs((await viewProgress()) - expectedProgress(250)) < 0.01);
  assert(
    await video.evaluate((v) => v.currentTime < v.duration / 2),
    'После жеста вправо продолжить в прямой половине',
  );
  await videoPage.mouse.move(20, 100);
  assert(Math.abs((await viewProgress()) - expectedProgress(20)) < 0.01);
  assert(
    await video.evaluate((v) => v.currentTime > v.duration / 2),
    'После жеста влево продолжить в обратной половине',
  );
  await videoPage.mouse.move(1200, 100);
  assert((await viewProgress()) > 0.999, 'Остановиться у края, не перескочить на другой ракурс');
  await videoPage.mouse.move(20, 100);
  await videoPage.waitForFunction(() => !document.querySelector('#menu-video').seeking);
  await videoPage.screenshot({ path: path.join(screenshots, 'menu-dragged.png') });
  await videoPage.waitForTimeout(5100);
  assert.equal(await video.evaluate((v) => v.paused), true, 'Не играть, пока мышь зажата');
  await videoPage.mouse.up();
  const selectedTime = await video.evaluate((v) => v.currentTime);
  await videoPage.waitForTimeout(4000);
  assert.equal(await video.evaluate((v) => v.paused), true, 'Ждать 5 секунд после отпускания');
  await waitForPlayback();
  assert(Math.abs((await video.evaluate((v) => v.currentTime)) - selectedTime) < 0.7);
  // Таймер после ручного обзора не должен запускать фон в самой игре.
  await videoPage.mouse.move(50, 100);
  await videoPage.mouse.down();
  await videoPage.mouse.up();
  await videoPage.click('#menu-start');
  assert.equal(await video.evaluate((v) => v.paused), true);
  await videoPage.waitForTimeout(5100);
  assert.equal(await video.evaluate((v) => v.paused), true);
  await videoPage.keyboard.press('Escape');
  await videoPage.click('#main-menu-button');
  await waitForPlayback();
  await videoPage.click('#menu-settings');
  await videoPage.uncheck('#setting-animation');
  assert.equal(await video.evaluate((v) => v.paused && v.hidden), true);
  await videoPage.check('#setting-animation');
  await waitForPlayback();
  await videoPage.emulateMedia({ reducedMotion: 'reduce' });
  await videoPage.waitForFunction(() => {
    const background = document.querySelector('#menu-video');
    return background.paused && background.hidden;
  });
  await videoContext.close();
  console.log(
    'Menu video: stable 15s sweep, clamped two-way scrubbing, playback direction, 5s idle, pause, settings and reduced motion PASS',
  );
} finally {
  await browser.close();
}
console.log(`Screenshots: ${screenshots}`);
