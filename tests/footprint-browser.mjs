import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initialState, STEP } from '../src/domain/index.ts';

// Настройки тестовой модели не должны менять исходники и сохранения разработчика.
const source = process.cwd();
const root = await mkdtemp(path.join(tmpdir(), 'harbor-footprint-game-'));
let browser;
try {
  for (const file of ['src', 'scripts', 'package.json', 'tsconfig.json'])
    await cp(path.join(source, file), path.join(root, file), { recursive: true });
  for (const file of ['assets', 'node_modules'])
    await symlink(path.join(source, file), path.join(root, file));
  const config = JSON.parse(await readFile(path.join(root, 'src/objects/templates.json'), 'utf8'));
  const footprint = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ];
  for (let i = 0; i < 4; i++) config.settings[`game/house/${i}`] = { scale: 0.5, footprint };
  await writeFile(path.join(root, 'src/objects/templates.json'), JSON.stringify(config));
  const { build } = await import(pathToFileURL(path.join(root, 'scripts/build.mjs')).href);
  await build();
  const { buildingGeometry } = await import(
    pathToFileURL(path.join(root, 'src/scene/geometry.ts')).href
  );
  const geometry = buildingGeometry({ t: 'house', x: 0, z: 0 });
  const xs = geometry.positions.filter((_, i) => i % 3 === 0);
  assert(Math.max(...xs) - Math.min(...xs) < 0.7, 'Game geometry must apply the saved 50% scale');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, offline: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href);
  const city = initialState();
  city.step = STEP.FREE;
  city.money = 10000;
  city.buildings.push({ t: 'port', x: 6, z: 11 });
  await page.evaluate(
    (state) => localStorage.setItem('ostrov-simple-v2', JSON.stringify(state)),
    city,
  );
  await page.reload();
  await page.click('#menu-start');
  const place = async (type, x, z) => {
    await page.click(`[data-type="${type}"]`);
    const point = await page.evaluate(([x, z]) => cityDebug.projectTile(x, z), [x, z]);
    await page.mouse.click(point.x, point.y);
  };
  await place('house', 2, 3);
  let state = await page.evaluate(() => cityDebug.state);
  assert.deepEqual(state.buildings.find((b) => b.t === 'house').footprint, footprint);
  assert.equal(state.money, 9900);
  await place('road', 3, 3);
  assert.equal(
    (await page.evaluate(() => cityDebug.state)).buildings.filter((b) => b.t === 'road').length,
    0,
  );
  await place('shop', 3, 4);
  state = await page.evaluate(() => cityDebug.state);
  assert(
    state.buildings.some((b) => b.t === 'shop' && b.x === 3 && b.z === 4),
    'Missing corner must remain buildable',
  );
  await place('house', 11, 5);
  assert.deepEqual(
    await page.evaluate(() => cityDebug.state),
    state,
    'Out-of-bounds footprint must not charge or build',
  );
  await page.reload();
  await page.click('#menu-start');
  assert.deepEqual(await page.evaluate(() => cityDebug.state), state);
  assert.deepEqual(errors, []);
  console.log(
    'Built game: saved model scale, L-shaped placement, occupied cells, free corner, island edge and reload PASS',
  );
} finally {
  await browser?.close();
  await rm(root, { recursive: true, force: true });
}
