import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: 960, height: 640 }, deviceScaleFactor: 1, reducedMotion: 'reduce',
    recordVideo: process.env.CAPTURE ? { dir: process.env.CAPTURE, size: { width: 960, height: 640 } } : undefined,
  });
  await page.goto(process.argv[2] ?? 'http://localhost:1420');
  if (!process.argv[2]) await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Settings', exact: true });
  await heading.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const layers = heading.locator('.settings-print-ink');
  const idle = () => layers.evaluateAll(nodes => nodes.map(node => ({
    mask: getComputedStyle(node).maskImage,
    duration: getComputedStyle(node).animationDuration,
    state: getComputedStyle(node).animationPlayState,
    opacity: getComputedStyle(node).opacity,
  })));
  assert.equal(await layers.count(), 2, 'the heading needs solid and screened impressions');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await heading.scrollIntoViewIfNeeded();
  const textWidths = await layers.evaluateAll(nodes => nodes.map(node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  }));
  assert.equal(textWidths[0], textWidths[1]);
  const bounds = await heading.boundingBox();
  const initial = await idle();
  assert.notEqual(initial[1].mask, 'none');
  assert.equal(initial[1].duration, '3.6s');
  assert.equal(initial[1].state, 'running');
  if (process.env.CAPTURE) await page.waitForTimeout(7300);
  await heading.hover();
  for (const delay of [0, 1000]) {
    if (delay) await page.waitForTimeout(delay);
    const solid = await idle();
    assert.equal(solid[0].opacity, '1');
    assert.equal(solid[1].opacity, '0');
    assert.deepEqual(await heading.boundingBox(), bounds);
  }
  await page.mouse.move(0, 0);
  assert.equal((await idle())[0].opacity, '0');
  const pause = page.getByRole('checkbox', { name: 'Pause toner particles' });
  await pause.check();
  assert.equal((await idle())[1].state, 'paused');
  await pause.uncheck();
  assert.equal((await idle())[1].state, 'running');
  if (process.env.CAPTURE) await page.waitForTimeout(1100);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await idle())[1].state, 'paused');
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal((await idle())[0].opacity, '1');
  assert.equal((await idle())[1].opacity, '0');
  console.log('Settings print: idle, held solid hover, unchanged bounds, exit, reduced motion and forced colors');
} finally {
  await browser.close();
}
