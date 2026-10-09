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
    assert.equal(await page.locator('#scene').evaluate((c) => c.width), width);
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
} finally {
  await browser.close();
}
console.log(`Screenshots: ${screenshots}`);
