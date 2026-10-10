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
  assert(second.water.triangles > 18000);
  assert(
    second.water.reflectionUpdates - first.water.reflectionUpdates <= 4,
    'Отражение обновляется с ограниченной частотой',
  );
  assert(second.water.reflectionUpdates > first.water.reflectionUpdates);
  assert(difference(a, b, [380, 180, 1000, 560]) > 1000, 'Вода движется');
  assert(difference(a, b, [600, 510, 600, 170], true) > 100, 'Белая пена меняет форму у берега');
  assert(
    stats(a, [400, 100, 500, 120]).max - stats(a, [400, 100, 500, 120]).min > 15,
    'В открытой воде несколько оттенков',
  );
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
      low.shadowSize === 512,
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
    after.water.reflectionUpdates - before.water.reflectionUpdates <= 2,
    'Низкое качество: не более одного отражения в секунду',
  );
  await page.click('#open-menu');
  const paused = await state();
  await page.waitForTimeout(500);
  assert.deepEqual(await state(), paused);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(
    JSON.stringify({
      high: first,
      low,
      screenshots,
      checks:
        'water+foam pixels, day/night lighting, visible sun, reflection budget, freeze/resume, pause, offline',
    }),
  );
} finally {
  await browser.close();
}
