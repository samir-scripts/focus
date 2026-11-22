import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [artifact, evidence] = process.argv.slice(2);
if (!artifact || !evidence) throw new Error('Usage: node record.mjs HTML EVIDENCE_DIR');
const dir = resolve(evidence, 'recording');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const viewport = { width: 960, height: 640 };
  const context = await browser.newContext({ viewport, offline: true, recordVideo: { dir, size: viewport } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(artifact).href);
  const canvas = page.getByRole('application');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  const x = box.x + box.width / 2, y = box.y + 95;
  const reset = page.getByRole('button', { name: 'Reset view' });
  const pause = page.getByRole('button', { name: 'Pause toner' });
  await page.mouse.move(x, y);
  await page.waitForTimeout(2200);
  await pause.click(); // Isolate yaw in the two equal-distance gestures.
  for (const delay of [170, 0]) {
    await reset.click();
    await page.waitForTimeout(540);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let dx = 12; dx <= 72; dx += 12) {
      if (delay) await page.waitForTimeout(delay);
      await page.mouse.move(x + dx, y);
    }
    await page.mouse.up();
    await page.waitForTimeout(950);
  }
  await reset.click();
  await pause.click();
  await page.waitForTimeout(600);
  const video = page.video();
  await context.close();
  const input = await video.path();
  const output = resolve(evidence, 'gentle-drag-and-flick.mp4');
  const ffmpeg = spawnSync('ffmpeg', ['-nostdin', '-y', '-i', input, '-c:v', 'libx264', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: 'inherit' });
  if (ffmpeg.status !== 0) throw new Error('ffmpeg encoding failed', { cause: ffmpeg.error });
  console.log(output);
} finally {
  await browser.close();
}
