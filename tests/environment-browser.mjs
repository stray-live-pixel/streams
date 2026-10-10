import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined),
});
const screenshots = await mkdtemp(path.join(tmpdir(), 'harbor-environment-'));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, offline: true });
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'ostrov-simple-v2',
      JSON.stringify({
        version: 6,
        islandSeed: 3210380753,
        pop: 0,
        money: 600,
        food: 30,
        day: 1,
        step: 0,
        won: false,
        endingSeen: false,
        buildings: [{ t: 'hall', x: 5, z: 5 }],
      }),
    ),
  );
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.click('#menu-start');
  await page.waitForFunction(() => cityDebug.environment?.water.reflectionUpdates >= 2);
  const state = () => page.evaluate(() => cityDebug.environment);
  const frame = async (name) =>
    PNG.sync.read(
      await page.locator('#scene').screenshot({ path: path.join(screenshots, name + '.png') }),
    );
  const stats = (png, rect) => {
    let sum = 0,
      count = 0,
      bright = 0,
      min = Infinity,
      max = 0;
    for (let y = rect[1]; y < rect[1] + rect[3]; y++)
      for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
        const i = (y * png.width + x) * 4,
          [r, g, b] = png.data.subarray(i, i + 3),
          value = (r + g + b) / 3;
        sum += value;
        count++;
        min = Math.min(min, value);
        max = Math.max(max, value);
        if (r > 180 && g > 190 && b > 180) bright++;
      }
    return { mean: sum / count, bright, min, max };
  };
  const difference = (a, b, rect, onlyFoam = false) => {
    let changed = 0;
    for (let y = rect[1]; y < rect[1] + rect[3]; y++)
      for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
        const i = (y * a.width + x) * 4;
        if (
          onlyFoam &&
          !(a.data[i] > 180 && a.data[i + 1] > 190 && a.data[i + 2] > 180) &&
          !(b.data[i] > 180 && b.data[i + 1] > 190 && b.data[i + 2] > 180)
        )
          continue;
        if (
          Math.abs(a.data[i] - b.data[i]) +
            Math.abs(a.data[i + 1] - b.data[i + 1]) +
            Math.abs(a.data[i + 2] - b.data[i + 2]) >
          25
        )
          changed++;
      }
    return changed;
  };
  // Фиксированный дневной свет отделяет анимацию волн и пены от смены освещения.
  await page.click('#time-of-day');
  await page.click('#time-of-day');
  await page.waitForTimeout(400);
  const a = await frame('day-a'),
    first = await state();
  await page.waitForTimeout(1200);
  const b = await frame('day-b'),
    second = await state();
  assert(second.water.time > first.water.time + 1);
  assert.equal(second.water.triangles, 4608);
  assert.equal(second.lensBlur, true);
  assert(Math.abs(second.islandSpread ** 2 - 2) < 1e-12);
  assert(
    second.water.reflectionUpdates - first.water.reflectionUpdates <=
      Math.ceil((second.water.time - first.water.time) * 4) + 1,
    'Неподвижная камера: отражение обновляется не чаще 4 Гц',
  );
  assert(second.water.reflectionUpdates > first.water.reflectionUpdates);
  assert(difference(a, b, [380, 180, 1000, 560]) > 1000, 'Вода движется');
  assert(difference(a, b, [600, 510, 600, 170], true) > 100, 'Белая пена меняет форму у берега');
  assert(
    stats(a, [400, 100, 500, 120]).max - stats(a, [400, 100, 500, 120]).min > 15,
    'В открытой воде несколько оттенков',
  );
  assert.equal(second.shadowSize, 2048);
  assert.equal(second.shadowFilter, 'PCF 5×5');
  // При вращении старый снимок отражения не должен оставаться на новом ракурсе.
  await page.keyboard.down('e');
  const movement = await page.evaluate(async () => {
    let lastYaw = cityDebug.camera.yaw;
    let lastReflection = cityDebug.environment.water.reflectionUpdates;
    let changedFrames = 0;
    let staleFrames = 0;
    for (let i = 0; i < 35; i++) {
      await new Promise(requestAnimationFrame);
      const yaw = cityDebug.camera.yaw;
      const reflection = cityDebug.environment.water.reflectionUpdates;
      if (Math.abs(yaw - lastYaw) > 0.0001) {
        changedFrames++;
        if (reflection === lastReflection) staleFrames++;
      }
      lastYaw = yaw;
      lastReflection = reflection;
    }
    return { changedFrames, staleFrames };
  });
  await page.keyboard.up('e');
  assert(movement.changedFrames > 5, 'Проверено непрерывное движение камеры');
  assert.equal(movement.staleFrames, 0, 'Каждый новый ракурс получает свежее отражение');
  await page.click('#home');
  await page.waitForTimeout(900);
  await page.click('#time-of-day');
  await page.waitForTimeout(100);
  assert.equal((await state()).label, 'Закат');
  await frame('dusk');
  await page.click('#time-of-day');
  await page.waitForTimeout(300);
  const night = await frame('night');
  assert.equal((await state()).sunEnabled, false);
  assert(
    stats(night, [600, 300, 500, 330]).mean < stats(a, [600, 300, 500, 330]).mean * 0.6,
    'Ночью меняется освещение самой сцены',
  );
  // Рассветный диск виден через обычную камеру и не заменяет собой освещение.
  await page.click('#time-of-day');
  await page.click('#time-of-day');
  await page.click('#look-at-sky');
  await page.waitForTimeout(1200);
  const sun = await state();
  assert(
    sun.sunEnabled &&
      sun.sunScreen.x > 0 &&
      sun.sunScreen.x < 1440 &&
      sun.sunScreen.y > 0 &&
      sun.sunScreen.y < 810,
  );
  const sky = await frame('sunrise-sun');
  assert(
    stats(sky, [Math.round(sun.sunScreen.x) - 20, Math.round(sun.sunScreen.y) - 20, 40, 40]).mean >
      160,
    'В точке солнца есть яркий диск',
  );
  await page.click('#home');
  await page.waitForTimeout(900);
  // Низкое качество уменьшает геометрию, тени и отражение. Выключение анимации замораживает текущую воду.
  await page.click('#open-menu');
  await page.click('#pause-settings');
  await page.selectOption('#setting-quality', 'low');
  await page.uncheck('#setting-animation');
  await page.click('#close-settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  const low = await state(),
    frozen = await frame('low-frozen');
  assert(
    low.water.triangles < second.water.triangles &&
      low.water.reflectionSize === 128 &&
      low.shadowSize === 1024,
  );
  await page.waitForTimeout(1000);
  const frozen2 = await frame('low-frozen-again');
  assert.equal((await state()).water.time, low.water.time);
  assert.equal(difference(frozen, frozen2, [0, 0, 1440, 810]), 0);
  await page.click('#open-menu');
  await page.click('#pause-settings');
  await page.check('#setting-animation');
  await page.click('#close-settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const before = await state();
  await page.waitForTimeout(1600);
  const after = await state();
  assert(after.water.time > before.water.time + 1);
  assert(
    after.water.reflectionUpdates - before.water.reflectionUpdates <=
      Math.ceil((after.water.time - before.water.time) * 2) + 1,
    'Низкое качество, неподвижная камера: отражение не чаще 2 Гц',
  );
  await page.click('#open-menu');
  const paused = await state();
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), paused);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  // Babylon also supports WebGL 1: explicitly exercise the derivatives extension.
  const legacyPage = await browser.newPage({
    viewport: { width: 960, height: 540 },
    offline: true,
  });
  const legacyErrors = [];
  legacyPage.on('pageerror', (error) => legacyErrors.push(error.message));
  legacyPage.on('console', (message) => {
    if (message.type() === 'error') legacyErrors.push(message.text());
  });
  await legacyPage.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...options) {
      return name === 'webgl2' ? null : getContext.call(this, name, ...options);
    };
  });
  await legacyPage.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await legacyPage.click('#menu-start');
  await legacyPage.waitForFunction(() => cityDebug.environment?.settled);
  await legacyPage.locator('#scene').screenshot({ path: path.join(screenshots, 'webgl1.png') });
  assert.deepEqual(legacyErrors, [], 'WebGL 1 fallback compiles the water shader');
  await legacyPage.close();
  console.log(
    JSON.stringify({
      high: first,
      low,
      screenshots,
      checks:
        'water+foam pixels, day/night lighting, visible sun, camera reflections, freeze/resume, pause, offline, WebGL 1',
    }),
  );
} finally {
  await browser.close();
}
