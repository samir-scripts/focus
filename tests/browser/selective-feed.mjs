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
    const engine = engines.find(([, candidate]) => candidate === browser)[0];
    const expectations = Object.entries(expected);
    const label = expectations.map(([selector, shown]) => `${selector} ${shown ? 'visible' : 'hidden'}`).join(', ');
    await eventually(`${engine}: fixture visibility (${label})`, async () => {
      for (const [selector, shown] of expectations) if (await visible(browser, selector) !== shown) return false;
      return true;
    });
  }
  for (const [name, browser] of engines) {
    await check(`${name}: grant the five canonical destinations through the extension`, async () => {
      for (const label of ['YouTube', 'X / Twitter', 'Reddit', 'Instagram', 'TikTok']) await setupAction(browser, 'select', label);
      await grant(browser);
      const profile = profiles.get(name);
      await eventually('canonical grants acknowledged', async () => {
        const current = await state();
        const p = current.profiles.find(p => p.id === profile);
        return p?.protocol === 7 && p.ackRevision === current.revision &&
          ['https://x.com/*', 'https://www.reddit.com/*', 'https://www.youtube.com/*', 'https://www.instagram.com/*', 'https://www.tiktok.com/*']
            .every(origin => p.origins.includes(origin));
      });
    });
  }
  async function probe(browser, action) {
    const script = (action) => {
      const scroller = document.querySelector('#videos, #shorts-container, #column-list-container');
      if (!scroller) return null;
      const video = document.getElementById('first');
      const pane = document.querySelector('#viewer-comments, ytd-comments #contents');
      let allowed = true;
      let touchMove, touchEnd;
      const wheel = (target, deltaY) => target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
      const key = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
      if (action === 'wheel') allowed = wheel(video, 160);
      else if (action === 'key') allowed = key(video, 'ArrowDown');
      else if (action === 'next' || action === 'prev') {
        allowed = document.getElementById(action).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } else if (action === 'outside') allowed = wheel(document.getElementById('outside'), 160);
      else if (action === 'ended') video.dispatchEvent(new Event('ended'));
      else if (action === 'touch') {
        const touch = (type, y, end = false) => {
          const point = new Touch({ identifier: 1, target: video, clientX: 20, clientY: y });
          return video.dispatchEvent(new TouchEvent(type, {
            bubbles: true, cancelable: true, touches: end ? [] : [point], changedTouches: [point],
          }));
        };
        touch('touchstart', 240);
        touchMove = touch('touchmove', 120);
        touchEnd = touch('touchend', 110, true);
      } else if (action === 'reply') allowed = key(document.getElementById('reply'), 'ArrowDown');
      else if (action === 'comments-top' || action === 'comments-middle' || action === 'comments-bottom') {
        if (!pane) return null;
        const max = pane.scrollHeight - pane.clientHeight;
        pane.scrollTop = action === 'comments-top' ? 0 : action === 'comments-bottom' ? max : max / 2;
        allowed = wheel(pane, action === 'comments-top' ? -160 : 160);
      } else if (action === 'back') history.back();
      return { allowed, touchMove, touchEnd, top: scroller.scrollTop, pinned: getComputedStyle(scroller).scrollSnapType === 'none',
        commentsReady: !!pane && (scroller.contains(pane) || getComputedStyle(pane).overscrollBehaviorY === 'contain'),
        permalink: location.pathname === '/@fixture/video/123',
        replay: Number(document.getElementById('replay-count').value),
        advance: Number(document.getElementById('advance-count').value) };
    };
    if (browser.context) return browser.page.evaluate(script, action);
    await browser.driver.switchTo().window(browser.page);
    return browser.driver.executeScript(script, action);
  }
  const videoSites = [
    { site: 'instagram', opened: '/reel/fixture/', discovery: '/reels/', hideSuggestedHome: false, hideReelsDiscovery: false },
    { site: 'youtube', opened: '/shorts/fixture', discovery: '/shorts/', hideShorts: false, hideHomeRecommendations: false },
    { site: 'tiktok', opened: '/@fixture/video/123', discovery: '/' },
  ];
  for (const { opened, discovery, ...rules } of videoSites) {
    const host = `www.${rules.site}.com`;
    const open = (browser, path) => navigate(browser, `${path}?focus-viewer=1`, host);
    const pinned = (browser, value) => eventually(`${host}: viewer ${value ? 'pinned' : 'restored'}`,
      async () => (await probe(browser, 'state'))?.pinned === value);
    await check(`${rules.site}: opened and discovery lock, advance inputs, late comments, close/back and Off`, async () => {
      if (rules.site === 'tiktok') {
        for (const [engine, browser] of engines) {
          await open(browser, opened);
          await pinned(browser, false);
          assert.equal((await probe(browser, 'wheel')).allowed, true, `${engine}: Off allows advance`);
          await eventually(`${engine}: Off changes selection`, async () => (await probe(browser, 'state')).top === 300);
        }
      }
      await edit({ ...rules, navigationMode: 'openedVideos' });
      for (const [engine, browser] of engines) {
        await open(browser, opened);
        await pinned(browser, true);
        for (const action of ['wheel', 'key', 'next', 'prev']) {
          assert.equal((await probe(browser, action)).allowed, false, `${engine}: ${action}`);
        }
        const { touchMove, touchEnd } = await probe(browser, 'touch');
        assert.equal(touchMove, false, `${engine}: touchmove`);
        assert.equal(touchEnd, false, `${engine}: touchend`);
        assert.equal((await probe(browser, 'outside')).allowed, true);
        const afterEnd = await probe(browser, 'ended');
        assert.equal(afterEnd.replay, 1);
        assert.equal(afterEnd.advance, 1, `${engine}: only ended reached the advance handler`);
        await eventually('automatic scroll attempt restored without suppressing replay', async () => (await probe(browser, 'state')).top === 0);
        await click(browser, '#late');
        if (browser.context) {
          await browser.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))));
        } else {
          await browser.driver.executeAsyncScript((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))));
        }
        await eventually(`${engine}: late comments mounted and scoped`, async () => (await probe(browser, 'state'))?.commentsReady);
        const beforeComments = (await probe(browser, 'state')).advance;
        assert.equal((await probe(browser, 'comments-top')).allowed, false, `${engine}: comments top`);
        assert.equal((await probe(browser, 'comments-middle')).allowed, true, `${engine}: comments interior`);
        assert.equal((await probe(browser, 'comments-bottom')).allowed, false, `${engine}: comments bottom`);
        assert.equal((await probe(browser, 'reply')).allowed, true, `${engine}: reply editor`);
        assert.equal((await probe(browser, 'state')).advance - beforeComments, 0, `${engine}: comments reached the site advance handler`);
        await open(browser, discovery);
        if (rules.site === 'tiktok') {
          await click(browser, '#late'); // For You retains its DOM and replaces the URL with a permalink.
          await eventually(`${engine}: comments permalink reached`, async () => (await probe(browser, 'state')).permalink);
        }
        await pinned(browser, false);
        assert.equal((await probe(browser, 'wheel')).allowed, true);
      }
      await edit({ ...rules, navigationMode: 'allShortVideoViewers' });
      for (const [, browser] of engines) {
        if (rules.site === 'tiktok') {
          await open(browser, opened);
          await pinned(browser, true);
          assert.equal((await probe(browser, 'wheel')).allowed, false);
          assert.equal((await probe(browser, 'state')).top, 0);
          await open(browser, discovery);
        }
        await pinned(browser, true);
        assert.equal((await probe(browser, 'wheel')).allowed, false);
        await click(browser, '#close');
        await pinned(browser, false);
        assert.equal((await probe(browser, 'next')).allowed, true);
        await probe(browser, 'back');
        await pinned(browser, true);
      }
      await edit({ ...rules, navigationMode: 'off' });
      for (const [, browser] of engines) {
        await pinned(browser, false);
        assert.equal((await probe(browser, 'next')).allowed, true);
      }
      if (rules.site === 'tiktok') {
        await edit({ ...rules, navigationMode: 'allShortVideoViewers' });
        const origin = `https://${host}/*`;
        for (const [engine, browser] of engines) {
          await open(browser, opened);
          await pinned(browser, true);
          const grants = async () => (await state()).profiles.find(p => p.id === profiles.get(engine)).origins;
          const before = await grants();
          assert(before.includes(origin), `${engine}: exact origin granted before revocation`);
          await removeOrigin(browser, origin);
          await eventually(`${engine}: exact origin revocation acknowledged`, async () => !(await grants()).includes(origin));
          assert.deepEqual((await grants()).sort(), before.filter((grant) => grant !== origin).sort());
          await pinned(browser, false);
          assert.equal((await probe(browser, 'wheel')).allowed, true);
        }
        await edit({ ...rules, navigationMode: 'off' });
      }
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
  await check('Instagram: independent choices, reused DOM, protected reel and exact grant reversal', async () => {
    const host = 'www.instagram.com';
    const origin = `https://${host}/*`;
    const instagram = (hideSuggestedHome, hideReelsDiscovery) => edit({ site: 'instagram', hideSuggestedHome, hideReelsDiscovery });
    for (const [, browser] of engines) await navigate(browser, '/', host);
    for (const [suggested, reels] of [[false, false], [true, false], [false, true], [true, true]]) {
      await instagram(suggested, reels);
      for (const [, browser] of engines) await show(browser, {
        '#suggested': !suggested, '#owned': !suggested, '#shelf': !reels, '#shortcut': !reels,
        '#followed': true, '#stories': true, '#ambiguous': true, '#explore': true, '#messages': true, '#home-copy': true,
        '#ordinary-reels': true, '#paid': true, '#people': true,
      });
    }
    for (const [, browser] of engines) {
      await click(browser, '#late');
      await show(browser, { '#late-post': false });
      await click(browser, '#reuse');
      await show(browser, { '#late-post': true });
      await click(browser, '#to-feed');
      await show(browser, { '#feed': false, '#player': true });
      await show(browser, { '#shortcut': false, '#ordinary-reels': true });
      await click(browser, '#to-shared');
      await show(browser, { '#feed': true, '#player video': true, '#comments': true, '#share': true, '#mixed-reels video': true, '#shelf': false });
      await navigate(browser, '/direct/inbox/', host);
      await show(browser, { '#suggested': true, '#owned': true, '#shelf': true });
      await navigate(browser, '/reels/', host);
      await show(browser, { '#viewer': false, '#viewer-current': false, '#viewer-controls': true });
      await click(browser, '#to-unrelated');
      await show(browser, { '#viewer-video-1': true, '#viewer-video-2': true, '#viewer-controls': true });
      await navigate(browser, '/reels/sample/', host);
      await show(browser, { '#viewer-current': true, '#viewer-video-1': true, '#viewer-video-2': true, '#viewer-controls': true });
      await navigate(browser, '/', host);
      await show(browser, { '#shortcut': false });
      await click(browser, '#to-viewer');
      await show(browser, { '#viewer': false, '#viewer-controls': true });
      await click(browser, '#push-viewer');
      await show(browser, { '#viewer-current': true, '#viewer-video-1': true, '#viewer-video-2': true, '#viewer-controls': true });
      await navigate(browser, '/', host);
    }
    const chrome = engines.find(([name]) => name === 'chromium')[1];
    const revision = (await state()).revision;
    const [tab] = await Promise.all([
      chrome.context.waitForEvent('page'),
      (async () => {
        const intent = (await admin('browser-open', profiles.get('chromium'), 'instagram', String(revision))).trim();
        await eventually('Instagram Home opened in the selected profile', async () => (await admin('browser-open-state', intent)).trim() === 'true');
      })(),
    ]);
    assert.notEqual(tab, chrome.page);
    await tab.waitForURL(`https://${host}/`);
    await tab.close();
    await show(chrome, { '#owned': false });
    await removeOrigin(chrome, origin);
    await show(chrome, { '#suggested': true, '#owned': true, '#shelf': true, '#shortcut': true });
    await eventually('Instagram grant was revoked', async () => !(await state()).profiles.find(p => p.id === profiles.get('chromium')).origins.includes(origin));
    await assert.rejects(() => admin('browser-open', profiles.get('chromium'), 'instagram', String(revision)));
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
    await eventually('Chromium automation observed the new tab', () => chrome.context.pages().length > existing);
    const added = chrome.context.pages().at(-1);
    assert.equal(chrome.context.pages().length, existing + 1);
    assert.equal((await fox.driver.getAllWindowHandles()).length, firefoxTabs);
    await added.waitForURL('https://www.youtube.com/');
    await added.close();
    const intentFox = (await admin('browser-open', profiles.get('firefox'), 'youtube', String(revision))).trim();
    await eventually('Firefox reports tab creation', async () => (await admin('browser-open-state', intentFox)).trim() === 'true');
    assert.equal(chrome.context.pages().length, existing);
    await eventually('Firefox automation observed the new tab', async () => (await fox.driver.getAllWindowHandles()).length > firefoxTabs);
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
