import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function runChromiumBlock({
  chrome, inEntryTab, checkEntry, navigate, currentUrl, entryUrl, eventually, proxy,
  applyEntry, removeOrigin, ack, chromeId, youtubeOrigins, results, root, setupAction, grant,
}) {
  const host = 'm.youtube.com';
  const origin = `https://${host}/*`;
  const target = path => `https://${host}${path}`;
  const waitForBlock = async (tab, url) => {
    await eventually('target worker Block interstitial', async () =>
      await currentUrl(tab) === entryUrl(tab, url), 6000);
    await tab.page.getByText('Site entry is blocked. Change this setting in focus.', { exact: true })
      .waitFor({ timeout: 6000 });
    await tab.page.getByRole('button', { name: 'Go back', exact: true }).waitFor({ timeout: 6000 });
    assert.equal(await tab.page.getByRole('button').count(), 1, 'Block must not offer a continuation');
  };
  const checkWorkerAllow = async (tab, path) => {
    const url = target(path);
    const before = proxy.documents(host, path);
    await navigate(tab, path, host);
    await eventually('worker Allow document committed', async () =>
      (tab.commits.get(url) ?? 0) === 1 && await currentUrl(tab) === url);
    assert.equal(await tab.page.title(), 'Worker response');
    assert.equal(tab.commits.get(url), 1);
    assert.equal(proxy.documents(host, path) - before, 0);
  };

  const allow = await checkEntry('chromium: worker Block Allow control policy', () => applyEntry({ mode: 'allow' }));
  await inEntryTab(chrome, async tab => {
    await checkEntry('chromium: worker Block Allow control commits once without a request',
      () => checkWorkerAllow(tab, '/worker-navigation?block-control=allow-before'), allow);
  });

  let revision;
  const block = await checkEntry('chromium: apply worker Block policy', async () => {
    revision = await applyEntry({ mode: 'block' });
  });
  await inEntryTab(chrome, async tab => {
    await checkEntry('chromium: worker Block repeated destinations, reload, history and keyboard back', async () => {
      const first = '/worker-navigation?block-repeat=first';
      const second = '/worker-navigation?block-repeat=second';
      const firstUrl = target(first);
      const secondUrl = target(second);
      await navigate(tab, '/safe', 'outside.test');
      await navigate(tab, first, host);
      await waitForBlock(tab, firstUrl);
      assert.ok((tab.commits.get(firstUrl) ?? 0) >= 1, 'worker response must have committed before fallback');
      await tab.page.reload({ waitUntil: 'domcontentloaded' });
      await waitForBlock(tab, firstUrl);
      await navigate(tab, second, host);
      await waitForBlock(tab, secondUrl);
      assert.ok((tab.commits.get(secondUrl) ?? 0) >= 1, 'second worker response must have committed before fallback');
      await tab.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await eventually('history reaches a usable worker Block page', async () => {
        const url = await currentUrl(tab);
        return url === entryUrl(tab, firstUrl) || url === entryUrl(tab, secondUrl);
      }, 6000);
      const historyUrl = await currentUrl(tab) === entryUrl(tab, firstUrl) ? firstUrl : secondUrl;
      await waitForBlock(tab, historyUrl);
      assert.equal(proxy.documents(host, first), 0);
      assert.equal(proxy.documents(host, second), 0);

      const back = tab.page.getByRole('button', { name: 'Go back', exact: true });
      await back.focus();
      await tab.page.screenshot({ path: join(root, 'artifacts/extensions/entry-block-focus.png') });
      await tab.page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
      try {
        assert.equal(await tab.page.evaluate(() => matchMedia('(forced-colors: active)').matches &&
          matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        await tab.page.screenshot({ path: join(root, 'artifacts/extensions/entry-block-forced-colors.png') });
      } finally {
        await tab.page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
      }
      const zoomTab = await tab.setup.evaluate(async url => {
        const item = (await chrome.tabs.query({})).find(candidate => candidate.url === url);
        if (!item?.id) throw new Error('Block tab not found for zoom');
        await chrome.tabs.setZoom(item.id, 2);
        return { id: item.id, zoom: await chrome.tabs.getZoom(item.id) };
      }, entryUrl(tab, historyUrl));
      try {
        assert.equal(zoomTab.zoom, 2);
        await tab.page.screenshot({ path: join(root, 'artifacts/extensions/entry-block-zoom-200.png') });
      } finally {
        await tab.setup.evaluate(async id => chrome.tabs.setZoom(id, 1), zoomTab.id);
      }
      await back.focus();
      await tab.page.keyboard.press('Enter');
      await eventually('worker Block Go back reaches safe page', async () =>
        !tab.page.isClosed() && await currentUrl(tab) === 'https://outside.test/safe', 6000);
      assert.equal(tab.page.isClosed(), false, 'safe previous tab must not close');
      results.chromiumWorkerBlock = { firstCommits: tab.commits.get(firstUrl), secondCommits: tab.commits.get(secondUrl), requests: 0 };
    }, block);
  });

  await inEntryTab(chrome, async first => {
    await inEntryTab(chrome, async second => {
      await checkEntry('chromium: worker Block independently gates two tabs', async () => {
        const firstPath = '/worker-navigation?block-tab=first';
        const secondPath = '/worker-navigation?block-tab=second';
        await navigate(first, firstPath, host);
        await waitForBlock(first, target(firstPath));
        await navigate(second, secondPath, host);
        await waitForBlock(second, target(secondPath));
        await waitForBlock(first, target(firstPath));
        assert.equal(proxy.documents(host, firstPath), 0);
        assert.equal(proxy.documents(host, secondPath), 0);
      }, block);
    });
  });

  let revoked = false;
  try {
    const removed = await checkEntry('chromium: revoke worker origin under Block', async () => {
      await removeOrigin(chrome, origin);
      revoked = true;
      await ack(chromeId, revision, youtubeOrigins.filter(value => value !== origin));
    }, block);
    await inEntryTab(chrome, async tab => {
      await checkEntry('chromium: revoked worker origin is not gated by Block',
        () => checkWorkerAllow(tab, '/worker-navigation?block-control=revoked'), removed);
    });
  } finally {
    if (revoked) {
      await checkEntry('chromium: restore worker origin grant', async () => {
        await setupAction(chrome, 'select');
        await grant(chrome);
        await ack(chromeId, revision, youtubeOrigins);
      });
    }
  }
  const restored = await checkEntry('chromium: restore Allow after worker Block', () => applyEntry({ mode: 'allow' }));
  await inEntryTab(chrome, async tab => {
    await checkEntry('chromium: worker Allow restored after Block and origin revocation',
      () => checkWorkerAllow(tab, '/worker-navigation?block-control=allow-after'), restored);
  });
}
