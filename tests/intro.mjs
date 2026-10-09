import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const frames = JSON.parse(await readFile('assets/audio/marta-intro/frames.json', 'utf8'));
const screenshots = await mkdtemp(path.join(tmpdir(), 'quiet-harbor-intro-'));
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      offline: true,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const errors = [],
      network = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
    const initialStorage = await page.evaluate(() => ({ ...localStorage }));
    await page.click('#menu-intro');
    assert(await page.locator('#intro-dialog').isVisible());
    assert.equal(await page.locator('#menu-shell').isVisible(), false);
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'not-started');
    assert.equal(await page.locator('#intro-subtitle').textContent(), frames[0].text);
    assert.equal(await page.locator('#intro-previous').isDisabled(), true);
    const portrait = page.locator('.intro-character img');
    await portrait.evaluate((image) => image.decode());
    assert((await portrait.evaluate((image) => image.naturalWidth)) >= 1024);
    const portraitBox = await portrait.boundingBox();
    assert(
      Math.abs(portraitBox.y + portraitBox.height - height) <= 3,
      'portrait meets the bottom edge',
    );
    assert.equal(
      (await page.locator('.intro-letter .intro-author').textContent()).trim(),
      'Мартасмотрительница гавани',
    );
    assert.equal(await page.locator('.intro-letter #intro-close').count(), 1);
    assert.equal(
      await page
        .locator(
          '#intro-pages, #intro-frame-title, #intro-progress, #intro-help, .intro-character figcaption',
        )
        .count(),
      0,
    );
    assert.equal(await page.locator('#intro-page-count').textContent(), `1/${frames.length}`);
    const countBox = await page.locator('#intro-page-count').boundingBox();
    const controlsBox = await page.locator('.intro-controls').boundingBox();
    assert(Math.abs(countBox.x + countBox.width / 2 - controlsBox.x - controlsBox.width / 2) < 2);
    assert(Math.abs(countBox.y + countBox.height / 2 - controlsBox.y - controlsBox.height / 2) < 2);
    const sheetBox = await page.locator('#intro-sheet').boundingBox();
    if (width === 1440) assert(sheetBox.height < 300, 'short page leaves the harbor visible');
    assert.equal(
      await page
        .locator(
          '#intro-play-icon svg, #intro-replay-icon svg, #intro-next-icon svg, #intro-previous-icon svg, #intro-close-icon svg',
        )
        .count(),
      5,
    );
    assert(
      (await page
        .locator('#intro-subtitle')
        .evaluate((text) => parseFloat(getComputedStyle(text).fontSize))) <= 18,
    );

    await page.waitForFunction(() => {
      const audio = document.querySelector('#intro-audio');
      return !audio.paused && audio.currentTime > 0.05;
    });
    assert.match(
      await page.locator('#intro-audio').getAttribute('src'),
      /^data:audio\/mpeg;base64,/,
    );

    // Реальное окончание аудио оставляет текущие субтитры и работающую гавань.
    await page.locator('#intro-audio').evaluate((audio) => {
      audio.currentTime = audio.duration - 0.15;
    });
    await page.waitForFunction(() => document.querySelector('#intro-audio').ended);
    assert.equal(await page.locator('#intro-page-count').textContent(), '1/11');
    assert.equal(await page.locator('#intro-subtitle').textContent(), frames[0].text);
    assert.equal(await page.locator('#intro-audio-status').isVisible(), false);
    assert.equal(await page.locator('#menu-video').evaluate((video) => video.paused), false);
    await page.click('#intro-replay');
    await page.waitForFunction(() => {
      const audio = document.querySelector('#intro-audio');
      return !audio.paused && audio.currentTime < 2;
    });
    await page.click('#intro-play');
    assert.equal(await page.locator('#intro-audio').evaluate((audio) => audio.paused), true);
    await page.click('#intro-play');
    await page.waitForFunction(() => !document.querySelector('#intro-audio').paused);

    // Раннее переключение прерывает фразу, назад запускает запись с начала.
    await page.click('#intro-next');
    await page.waitForFunction(() => document.querySelector('#intro-audio').currentTime > 0.05);
    assert.equal(await page.locator('#intro-subtitle').textContent(), frames[1].text);
    assert.equal(await page.locator('#intro-previous').isEnabled(), true);
    assert.equal(
      await page
        .locator('#intro-dialog')
        .evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth),
      false,
    );
    await page.locator('.intro-sheet-copy').waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(screenshots, `intro-${width}.png`) });
    if (width === 1440) {
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#intro-subtitle').textContent(), frames[2].text);
      assert.equal(await page.locator('.intro-sheet-copy').count(), 1);
      assert.equal(await page.locator('.intro-sheet-copy [id]').count(), 0);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#intro-subtitle').textContent(), frames[2].text);
      assert((await page.locator('.intro-sheet-copy').count()) <= 1);
      await page.keyboard.press('ArrowLeft');
      await page.locator('.intro-sheet-copy').waitFor({ state: 'detached' });
    }
    await page.click('#intro-previous');
    assert.equal(await page.locator('#intro-page-count').textContent(), '1/11');
    assert((await page.locator('#intro-audio').evaluate((audio) => audio.currentTime)) < 2);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#intro-page-count').textContent(), '2/11');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#intro-page-count').textContent(), '1/11');

    // Скрытие вкладки останавливает голос; возврат не возобновляет его неожиданно.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#intro-audio').evaluate((audio) => audio.paused), true);
    assert.equal(await page.locator('#menu-video').evaluate((video) => video.paused), true);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#intro-audio').evaluate((audio) => audio.paused), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#intro-dialog').isVisible(), false);
    assert.equal(await page.locator('#menu-shell').isVisible(), true);
    assert.equal(await page.locator('#intro-audio').getAttribute('src'), null);
    assert.equal(
      await page.locator('#menu-intro').evaluate((button) => document.activeElement === button),
      true,
    );

    // Повторный просмотр начинается сначала и заканчивается меню, а не новой игрой.
    await page.click('#menu-intro');
    assert.equal(await page.locator('#intro-page-count').textContent(), '1/11');
    for (let i = 1; i < frames.length; i++) {
      await page.click('#intro-next');
      assert.equal(await page.locator('#intro-subtitle').textContent(), frames[i].text);
      await page.waitForFunction(() => document.querySelector('#intro-audio').readyState >= 2);
      const duration = await page.locator('#intro-audio').evaluate((audio) => audio.duration);
      assert(Math.abs(duration - frames[i].duration_seconds) < 0.2);
    }
    assert.equal(await page.locator('#intro-next-label').textContent(), 'Завершить');
    await page.click('#intro-next');
    assert.equal(await page.locator('#intro-dialog').isVisible(), false);
    assert.equal(await page.evaluate(() => cityDebug.renderer), 'not-started');
    assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), initialStorage);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#menu-intro');
    await page.click('#intro-next');
    assert.equal(await page.locator('.intro-sheet-copy').count(), 0);
    assert.equal(
      await page.locator('#menu-video').evaluate((video) => video.paused && video.hidden),
      true,
    );
    await page.click('#intro-close');
    assert.equal(await page.locator('#intro-audio').evaluate((audio) => audio.paused), true);
    if (width === 1440) {
      // Даже при недоступном звуке кадры читаются и выход остаётся рабочим.
      await page.click('#menu-intro');
      await page.locator('#intro-audio').evaluate((audio) => {
        audio.src = 'data:audio/mpeg;base64,AAAA';
        audio.load();
      });
      await page.waitForFunction(() => document.querySelector('#intro-audio').error !== null);
      assert.match(await page.locator('#intro-audio-status').textContent(), /читать/);
      await page.click('#intro-next');
      assert.equal(await page.locator('#intro-subtitle').textContent(), frames[1].text);
      await page.click('#intro-close');
      await page.click('#menu-settings');
      await page.uncheck('#setting-animation');
      await page.click('#close-settings');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.click('#menu-intro');
      assert.equal(
        await page.locator('#menu-video').evaluate((video) => video.paused && video.hidden),
        true,
      );
      await page.click('#intro-close');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    await context.close();
    console.log(
      `Intro ${width}×${height}: manual frames, audio, replay, exit, offline, motion and unchanged saves PASS`,
    );
  }

  // Вступление доступно и после игры: просмотр не меняет сохранённый город.
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.click('#menu-start');
  await page.keyboard.press('Escape');
  await page.click('#main-menu-button');
  const savedCity = await page.evaluate(() => localStorage.getItem('ostrov-simple-v2'));
  await page.click('#menu-intro');
  await page.click('#intro-next');
  await page.click('#intro-close');
  assert.equal(await page.evaluate(() => localStorage.getItem('ostrov-simple-v2')), savedCity);
  assert.equal(await page.evaluate(() => cityDebug.paused), true);
  assert.equal(await page.locator('#menu-start').textContent(), 'Продолжить');
  await context.close();
} finally {
  await browser.close();
}
console.log(`Intro screenshots: ${screenshots}`);
