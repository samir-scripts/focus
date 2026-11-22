import assert from 'node:assert/strict';

export async function verifyTumble(page, evidence) {
  const canvas = page.getByRole('application');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  const opening = await canvas.screenshot();
  const views = [opening];
  for (const direction of [1, -1]) {
    // Three 320px strokes exercise both poles and wrap without leaving the canvas.
    for (let stroke = 0; stroke < 3; stroke++) {
      const start = direction > 0 ? box.y + 28 : box.y + 348;
      const x = box.x + box.width / 2;
      await page.mouse.move(x, start);
      await page.mouse.down();
      await page.mouse.move(x, start + direction * (240 - stroke * 80), { steps: 6 });
      if (direction > 0) {
        const name = ['top', 'inverted', 'underside'][stroke];
        const frame = await canvas.screenshot(evidence ? { path: `${evidence}/orbit-${name}.png` } : {});
        assert.ok(views.every(previous => !frame.equals(previous)), `${name} is a distinct rendered pose`);
        views.push(frame);
      }
      await page.mouse.move(x, start + direction * 320, { steps: 6 });
      await page.mouse.up();
    }
    assert.deepEqual(await canvas.screenshot(), opening, `vertical turn wraps exactly in direction ${direction}`);
  }
  assert.equal(await page.getByRole('status').getAttribute('data-key'), null, 'vertical drags do not actuate keys');
  await canvas.focus();
  for (const key of ['ArrowUp', 'ArrowDown']) {
    for (let i = 0; i < 8; i++) await page.keyboard.press(key);
    const pastStop = await canvas.screenshot();
    for (let i = 0; i < 8; i++) await page.keyboard.press(key);
    assert.notDeepEqual(await canvas.screenshot(), pastStop, `${key} keeps turning past the former limit`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Escape');
    assert.deepEqual(await canvas.screenshot(), opening, 'reset restores both axes');
  }
  console.log('PASS top, inverted and underside views; exact vertical wrap both directions; keyboard pitch and mixed-axis reset');
}
