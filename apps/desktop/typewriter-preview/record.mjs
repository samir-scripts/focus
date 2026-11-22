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
  const { x, y } = await canvas.boundingBox();
  const startX = x + 28;
  const startY = y + 95;
  await page.mouse.move(startX, startY);
  await canvas.focus();
  await page.waitForTimeout(6250);
  await page.mouse.down();
  for (let dx = 4; dx <= 360; dx += 4) {
    await page.mouse.move(startX + dx, startY);
    await page.waitForTimeout(dx === 216 ? 380 : 20); // Hold the rear view briefly.
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
  for (const code of ['a', 's']) {
    await page.keyboard.press(code, { delay: 430 });
    await page.waitForTimeout(240);
  }
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.waitForTimeout(500);
  const video = page.video();
  await context.close();
  const input = await video.path();
  const output = resolve(evidence, 'motion-orbit-press.mp4');
  const ffmpeg = spawnSync('ffmpeg', ['-nostdin', '-y', '-i', input, '-c:v', 'libx264', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: 'inherit' });
  if (ffmpeg.status !== 0) throw new Error('ffmpeg encoding failed', { cause: ffmpeg.error });
  console.log(output);
} finally {
  await browser.close();
}
