import assert from 'node:assert/strict';

// Executed in the ordinary fixture tab in either browser.
async function playFixture() {
  const player = document.querySelector('#playback');
  player.muted = true;
  player.currentTime = 0;
  let timer;
  try {
    return await Promise.race([
      new Promise(resolve => {
        player.addEventListener('ended', () => resolve(player.currentTime > 0), { once: true });
        player.play().catch(() => resolve(false));
      }),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), 8000); }),
    ]);
  } finally {
    clearTimeout(timer);
    player.pause();
  }
}

export async function verifyPlayback(browser) {
  if (!browser.context) await browser.driver.switchTo().window(browser.page);
  const played = browser.context
    ? await browser.page.evaluate(playFixture)
    : await browser.driver.executeScript(playFixture);
  assert.equal(played, true, 'the local video played to completion');
}
