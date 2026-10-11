import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Reproducible art review in an isolated browser profile; never touches a
// player's save. The output stays outside the repository.
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('Pass an absolute output directory');
await mkdir(output, { recursive: true });
const recording = process.argv.includes('--record');
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined),
});
const context = await browser.newContext({
  viewport: { width: 1680, height: 945 },
  deviceScaleFactor: 1,
  ...(recording ? { recordVideo: { dir: output, size: { width: 1280, height: 720 } } } : {}),
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 500));
});
await page.addInitScript(() =>
  localStorage.setItem(
    'ostrov-simple-v2',
    JSON.stringify({
      version: 6,
      islandSeed: 123456789,
      pop: 0,
      money: 600,
      food: 30,
      day: 1,
      step: 0,
      won: false,
      endingSeen: false,
      buildings: [
        { t: 'hall', x: 5, z: 5 },
        { t: 'port', x: 6, z: 11 },
        { t: 'house', x: 8, z: 6 },
      ],
    }),
  ),
);
try {
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.click('#menu-start');
  await page.waitForFunction(() => cityDebug.environment?.settled);
  await page.click('#time-of-day');
  await page.click('#time-of-day');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'overview-ui.png') });
  await page.addStyleTag({
    content: '#game-screen > :not(canvas) { visibility:hidden !important }',
  });
  await page.screenshot({ path: path.join(output, 'overview.png') });
  const point = await page.evaluate(() => cityDebug.projectTile(6.5, 11.5));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(1000, 490, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, -560);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(output, 'harbor.png') });
  const measurements = await page.evaluate(async () => {
    const intervals = [],
      cpu = [];
    let previousTime = cityDebug.environment.water.time,
      lastFrame = performance.now();
    const start = lastFrame;
    while (performance.now() - start < 5000) {
      await new Promise(requestAnimationFrame);
      const state = cityDebug.environment;
      if (state.water.time !== previousTime) {
        const now = performance.now();
        intervals.push(now - lastFrame);
        cpu.push(state.renderMilliseconds);
        lastFrame = now;
        previousTime = state.water.time;
      }
    }
    const summarize = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        count: sorted.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted.at(-1),
      };
    };
    return {
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      frameIntervalsMs: summarize(intervals),
      cpuSubmitMs: summarize(cpu),
      note: 'Five-second desktop smoke sample, not a GPU timing or mobile/thermal certification',
      environment: cityDebug.environment,
      camera: cityDebug.camera,
    };
  });
  await page.keyboard.down('e');
  await page.waitForTimeout(recording ? 5000 : 1200);
  await page.keyboard.up('e');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, 'harbor-rotated.png') });
  await writeFile(
    path.join(output, 'capture.json'),
    JSON.stringify({ errors, ...measurements }, null, 2),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await context.close();
  if (recording) await page.video().saveAs(path.join(output, 'gameplay.webm'));
  await browser.close();
}
