import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { initialState, STEP } from '../src/domain/index.ts';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, offline: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  const saved = initialState(123456789);
  saved.step = STEP.FREE;
  saved.money = 10000;
  saved.buildings.push({ t: 'port', x: 6.17, z: 10.98 });
  await page.evaluate((s) => localStorage.setItem('ostrov-simple-v2', JSON.stringify(s)), saved);
  await page.reload();
  await page.click('#menu-start');
  await page.waitForFunction(() => cityDebug.environment?.settled);
  const move = async (x, z) => {
    const p = await page.evaluate(([x, z]) => cityDebug.projectTile(x, z), [x, z]);
    await page.mouse.move(p.x, p.y);
    return p;
  };
  await page.click('[data-type="house"]');
  const p = await move(7.173, 5.219);
  await page.mouse.click(p.x, p.y);
  let state = await page.evaluate(() => cityDebug.state);
  const house = state.buildings.find((b) => b.t === 'house');
  assert(house, 'Fractional house was not built');
  assert(Math.abs(house.x - 7.173) < 0.02 && Math.abs(house.z - 5.219) < 0.02);
  assert(Math.abs(house.x - Math.round(house.x)) > 0.1, 'Position must not snap to a grid');
  await page.click('[data-type="shop"]');
  const overlap = await move(7.42, 5.47);
  await page.mouse.click(overlap.x, overlap.y);
  assert.deepEqual(
    await page.evaluate(() => cityDebug.state),
    state,
    'Overlapping building must be rejected',
  );
  await page.reload();
  await page.click('#menu-start');
  assert.deepEqual(
    await page.evaluate(() => cityDebug.state),
    state,
    'Coordinates must survive reload',
  );
  // Starting a port preview must not paint a grid across the map.
  await page.click('#open-menu');
  await page.click('#pause-settings');
  await page.click('#reset-progress');
  await page.click('#confirm-reset');
  await page.click('#coach-action');
  await page.click('[data-type="port"]');
  await page.mouse.move(1, 1);
  await page.waitForTimeout(100);
  const ink = await page.evaluate(() => {
    const c = document.querySelector('#world');
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
    return count;
  });
  assert.equal(ink, 0, 'No map-wide cell highlights when placing a port');
  const inland = await move(6.17, 6.23);
  await page.mouse.click(inland.x, inland.y);
  assert(!(await page.evaluate(() => cityDebug.state.buildings)).some((b) => b.t === 'port'));
  const coast = await move(6.17, 10.98);
  await page.mouse.click(coast.x, coast.y);
  state = await page.evaluate(() => cityDebug.state);
  assert(
    state.buildings.some((b) => b.t === 'port'),
    'Coastal fractional port must be accepted',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Free placement: fractional pointer coordinates, overlap rejection, exact reload, no grid and partial-water port PASS',
  );
} finally {
  await browser.close();
}
