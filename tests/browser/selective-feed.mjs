import assert from 'node:assert/strict';

export async function runSelectiveFeed({ engines, profiles, admin, state, setupAction, grant, check, eventually, navigate, visible, removeOrigin, By }) {
  async function edit(rules) {
    const revision = (await state()).revision;
    await admin('content', String(revision), JSON.stringify(rules));
    await eventually('both profiles acknowledged the selective rules', async () => {
      const current = await state();
      return [...profiles.values()].every(id => current.profiles.find(p => p.id === id)?.ackRevision === current.revision);
    });
  }
  async function click(browser, selector) {
    if (browser.context) await browser.page.locator(selector).click();
    else { await browser.driver.switchTo().window(browser.page); await (await browser.driver.findElement(By.css(selector))).click(); }
  }
  async function show(browser, expected) {
    await eventually('fixture visibility', async () => {
      for (const [selector, shown] of Object.entries(expected)) if (await visible(browser, selector) !== shown) return false;
      return true;
    });
  }
  for (const [name, browser] of engines) {
    await check(`${name}: grant the three canonical destinations through the extension`, async () => {
      for (const label of ['YouTube', 'X / Twitter', 'Reddit']) await setupAction(browser, 'select', label);
      await grant(browser);
      const profile = profiles.get(name);
      await eventually('canonical grants acknowledged', async () => {
        const current = await state();
        const p = current.profiles.find(p => p.id === profile);
        return p?.protocol === 5 && p.ackRevision === current.revision &&
          ['https://x.com/*', 'https://www.reddit.com/*', 'https://www.youtube.com/*'].every(origin => p.origins.includes(origin));
      });
    });
  }
  await check('X: hide For you, open Following and fall back without touching protected routes', async () => {
    const x = async (hideForYou, openFollowing) => edit({ site: 'x', hideForYou, openFollowing });
    await x(true, false);
    for (const [, browser] of engines) {
      await navigate(browser, '/home', 'x.com');
      await show(browser, { '#x-feed': false, '#composer': true, '#x-neighbor': true });
      await click(browser, '#following'); await show(browser, { '#x-feed': true });
      await click(browser, '#for-you'); await show(browser, { '#x-feed': false });
      await click(browser, '#next'); await show(browser, { '#x-feed': true });
    }
    await x(false, true);
    for (const [, browser] of engines) {
      await navigate(browser, '/home', 'x.com');
      await show(browser, { '#following[aria-selected=true]': true, '#x-feed': true, '#composer': true });
      await navigate(browser, '/home?failed=1', 'x.com');
      await show(browser, { '#x-feed': false, '#composer': true });
    }
    await x(false, false);
    for (const [, browser] of engines) await show(browser, { '#x-feed': true });
  });
  await check('Reddit: distinguish For You, populated Following and mixed Home', async () => {
    const reddit = async (hideRecommendations, hideAllHome) => edit({ site: 'reddit', hideRecommendations, hideAllHome });
    await reddit(true, false);
    for (const [, browser] of engines) {
      await navigate(browser, '/', 'www.reddit.com');
      await show(browser, { '#reddit-feed': false, '#reddit-neighbor': true });
      await click(browser, '#following'); await show(browser, { '#post': true });
    }
    await reddit(false, true);
    for (const [, browser] of engines) {
      await show(browser, { '#reddit-feed': false });
      await click(browser, '#next'); await show(browser, { '#post': true });
    }
    await reddit(true, false);
    for (const [, browser] of engines) {
      await navigate(browser, '/?mixed=1', 'www.reddit.com');
      await show(browser, { '#post': false, '#followed': true, '#reddit-neighbor': true });
    }
    await reddit(false, false);
    for (const [, browser] of engines) await show(browser, { '#post': true });
  });
  await check('YouTube: independent rules, protected neighbors, late DOM, and SPA reversal', async () => {
    for (const [, browser] of engines) await navigate(browser);
    for (const [home, shorts] of [[false, true], [true, true], [true, false], [false, false]]) {
      await edit({ site: 'youtube', hideHomeRecommendations: home, hideShorts: shorts });
      for (const [, browser] of engines) await show(browser, { '#recommended': !home, '#shorts-shelf': !shorts, '#subscribed': true, '#playback': true });
    }
    await edit({ site: 'youtube', hideHomeRecommendations: true, hideShorts: true });
    for (const [, browser] of engines) {
      await click(browser, '#late-home');
      await show(browser, { '#recommended': false, '#late-card': false });
      await click(browser, '#spa-route'); await show(browser, { '#late-card': true, '#shorts-shelf': true, '#ordinary-video': true, '#playback': true });
      for (const path of ['/results?search_query=sample', '/feed/subscriptions', '/@sample', '/shorts/direct']) {
        await navigate(browser, path); await show(browser, { '#recommended': true, '#subscribed': true, '#playback': true });
      }
    }
  });
  await check('Open in paired browser: only the selected profile opens one catalog tab', async () => {
    const revision = (await state()).revision;
    const chrome = engines.find(([name]) => name === 'chromium')[1];
    const fox = engines.find(([name]) => name === 'firefox')[1];
    const existing = chrome.context.pages().length;
    const firefoxTabs = (await fox.driver.getAllWindowHandles()).length;
    await assert.rejects(() => admin('browser-open', profiles.get('chromium'), 'youtube', String(revision - 1)));
    const intent = (await admin('browser-open', profiles.get('chromium'), 'youtube', String(revision))).trim();
    await eventually('acknowledged tab creation', async () => (await admin('browser-open-state', intent)).trim() === 'true');
    const added = chrome.context.pages().at(-1);
    assert.equal(chrome.context.pages().length, existing + 1);
    assert.equal((await fox.driver.getAllWindowHandles()).length, firefoxTabs);
    await added.waitForURL('https://www.youtube.com/');
    await added.close();
    const intentFox = (await admin('browser-open', profiles.get('firefox'), 'youtube', String(revision))).trim();
    await eventually('Firefox reports tab creation', async () => (await admin('browser-open-state', intentFox)).trim() === 'true');
    assert.equal(chrome.context.pages().length, existing);
    assert.equal((await fox.driver.getAllWindowHandles()).length, firefoxTabs + 1);
    await navigate(chrome);
    await show(chrome, { '#recommended': false, '#shorts-shelf': false });
    await removeOrigin(chrome, 'https://www.youtube.com/*');
    await show(chrome, { '#recommended': true, '#shorts-shelf': true });
    await eventually('exact grant was revoked', async () => !(await state()).profiles.find(p => p.id === profiles.get('chromium')).origins.includes('https://www.youtube.com/*'));
    await assert.rejects(() => admin('browser-open', profiles.get('chromium'), 'youtube', String(revision)));
    await admin('revoke', profiles.get('firefox'));
    await assert.rejects(() => admin('browser-open', profiles.get('firefox'), 'youtube', String(revision)));
  });
}
