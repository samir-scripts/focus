// Run against the desktop dev server. CHROME_BIN selects an installed Chromium browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const executable = process.env.CHROME_BIN ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'focus-motion-'));
const browser = spawn(executable, ['--headless', '--disable-background-networking', '--no-first-run',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: browser.stderr });
    lines.on('line', line => {
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { lines.close(); resolve(new URL(match[1]).host); }
    });
    browser.once('error', reject);
    browser.once('exit', () => reject(new Error('Chromium exited before debugger startup')));
  });
  const targets = await (await fetch('http://' + endpoint + '/json/list')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  let nextId = 0;
  async function command(method, params = {}) {
    const id = ++nextId;
    const response = new Promise((resolve, reject) => {
      function receive({ data }) {
        const message = JSON.parse(data);
        if (message.id !== id) return;
        socket.removeEventListener('message', receive);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      socket.addEventListener('message', receive);
    });
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  }
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true });
    assert.equal(response.exceptionDetails, undefined, response.exceptionDetails?.text);
    return response.result.value;
  }
  async function until(expression) {
    const deadline = Date.now() + 10000;
    while (!await evaluate(expression)) {
      assert(Date.now() < deadline, 'Timed out waiting for ' + expression);
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }
  await command('Page.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    window.isTauri = true;
    // Substitute only the native IPC boundary; exercise the real desktop UI in Chromium.
    const customSite = host => ({
      id: 'custom:' + host, label: host, hosts: [host],
      grayscale: false, rules: {}, entry: { mode: 'allow' },
    });
    const sites = Array.from({ length: 20 }, (_, n) => customSite('fixture-' + n + '.example'));
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'browser_state') {
        const open = window.reviewOpenSite ? { siteId: window.reviewOpenSite } : null;
        window.reviewOpenSite = null;
        return { revision: sites.length, hideShorts: false, sites: [...sites], profiles: [], pending: [], open,
          accessibility: { holdSeconds: 15, twoStepConfirmation: false } };
      }
      if (command === 'designate_site') {
        const site = customSite(args.host);
        sites.push(site);
        return site.id;
      }
      if (command === 'scan_browsers') return { supported: false, targets: [] };
      throw new Error('Unexpected review command ' + command);
    } };
  ` });
  await command('Emulation.setDeviceMetricsOverride', {
    width: 480, height: 320, deviceScaleFactor: 1, mobile: false
  });
  await command('Page.navigate', { url: process.env.FOCUS_DEV_URL ?? 'http://localhost:1420/' });
  await until("Boolean(document.querySelector('.toolbar.native-mac'))");
  const scroll = await evaluate(`(() => {
    const workspace = document.querySelector('.workspace');
    workspace.scrollTop = 100;
    return {
      toolbarWidth: document.querySelector('.toolbar').getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
      workspaceTop: workspace.scrollTop,
      rootHeight: document.scrollingElement.scrollHeight,
      viewportHeight: window.innerHeight
    };
  })()`);
  assert.equal(scroll.workspaceTop, 100, 'The workspace must scroll independently of the native toolbar');
  assert.equal(scroll.rootHeight, scroll.viewportHeight, 'The window must not have a root scrollbar');
  assert.equal(scroll.toolbarWidth, scroll.viewportWidth, 'The native toolbar must span the viewport');
  console.log('The native toolbar spans the viewport while the workspace scrolls.');
  assert.equal(await evaluate('document.scrollingElement.scrollWidth'), 480, 'Sites must not scroll horizontally at narrow widths');
  const scrollbar = selector => `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const track = getComputedStyle(element, '::-webkit-scrollbar-track');
    const thumb = getComputedStyle(element, '::-webkit-scrollbar-thumb');
    const width = getComputedStyle(element, '::-webkit-scrollbar').width;
    return {
      width, track: track.backgroundColor, thumb: thumb.backgroundColor,
      inset: parseFloat(thumb.borderLeftWidth) + parseFloat(thumb.borderRightWidth),
      clip: thumb.backgroundClip, nativeColor: getComputedStyle(element).scrollbarColor,
      surface: getComputedStyle(element === document.documentElement ? document.body
        : element.matches('.workspace') ? element.querySelector('main') : element).backgroundColor,
      overflows: element.scrollHeight > element.clientHeight,
      fitsWidth: element.scrollWidth === element.clientWidth,
    };
  })()`;
  const luminance = color => color.match(/\d+/g).slice(0, 3).map(channel => {
    const value = Number(channel) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  async function checkScrollbar(selector, expectOverflow = true) {
    const { width, track, thumb, inset, clip, surface, overflows, fitsWidth } = await evaluate(scrollbar(selector));
    if (expectOverflow) assert(overflows, `${selector} must exercise vertical overflow`);
    assert(fitsWidth, `${selector} must not overflow horizontally`);
    assert.equal(track, surface, `${selector} scrollbar track must match its surface`);
    const [dark, light] = [luminance(track), luminance(thumb)].sort((a, b) => a - b);
    assert((light + .05) / (dark + .05) >= 3, `${selector} scrollbar thumb must contrast with its track`);
    const pixels = parseFloat(width);
    assert(clip === 'padding-box' && pixels >= 14 && pixels - inset >= 7 && pixels - inset <= 9,
      `${selector} must have an inset thumb on a grab-friendly track`);
  }
  await checkScrollbar('.workspace');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 960, height: 200, deviceScaleFactor: 1, mobile: false
  });
  await checkScrollbar('.library > ul');
  await checkScrollbar('.with-library > main');
  await checkScrollbar('html', false);
  console.log('Desktop scrollbars contrast against their own surfaces without horizontal overflow.');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 960, height: 640, deviceScaleFactor: 1, mobile: false
  });
  const sitesArt = "document.querySelector('[data-print=\"margin\"]')";
  assert.match(await evaluate(`getComputedStyle(${sitesArt}).backgroundImage`), /^url\(/,
    'Wide Sites must render a local poster inset');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 635, height: 640, deviceScaleFactor: 1, mobile: false
  });
  assert.equal(await evaluate(`${sitesArt}.getBoundingClientRect().width`), 0, 'The inset must leave room for narrow Sites');
  assert((await evaluate(scrollbar('.workspace'))).fitsWidth, 'The compact workspace must not scroll horizontally');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 960, height: 640, deviceScaleFactor: 1, mobile: false
  });
  await until("Boolean(document.querySelector('.designate-trigger'))");
  const railState = await evaluate(`(() => {
    const rail = document.querySelector('.library > ul');
    const row = rail.querySelector('button[aria-label="fixture-19.example"]');
    const bottom = rail.getBoundingClientRect().top + rail.clientHeight;
    return { scroll: rail.scrollTop, distance: row.getBoundingClientRect().bottom - bottom };
  })()`);
  assert.equal(railState.scroll, 0);
  assert(railState.distance > 0, 'The extension target must start offscreen');
  async function checkSelectedRow(host) {
    await until(`document.activeElement?.matches('.site-heading h1') &&
      document.activeElement.textContent === ${JSON.stringify(host)}`);
    const result = await evaluate(`(() => {
      const rail = document.querySelector('.library > ul');
      const row = rail.querySelector('button[aria-pressed="true"]');
      const range = rail.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return { selected: row.getAttribute('aria-label'), top: rect.top - range.top,
        bottomGap: range.top + rail.clientHeight - rect.bottom, railTop: rail.scrollTop,
        workspaceTop: document.querySelector('.workspace').scrollTop,
        detailTop: document.querySelector('main').scrollTop };
    })()`);
    assert.equal(result.selected, host);
    assert(result.top >= 0 && result.bottomGap >= -0.5 && result.bottomGap <= 1,
      `The selected row must be fully revealed at the nearest rail edge: ${JSON.stringify(result)}`);
    assert(result.railTop > 0);
    assert.equal(result.workspaceTop, 0);
    assert.equal(result.detailTop, 0);
  }
  await evaluate("window.reviewOpenSite = 'custom:fixture-19.example'");
  await checkSelectedRow('fixture-19.example');
  await evaluate("document.querySelector('.library > ul').scrollTop = 0; document.querySelector('.designate-trigger').click()");
  await until("document.activeElement?.id === 'custom-host'");
  await command('Input.insertText', { text: 'added.example' });
  await evaluate("document.querySelector('.designate').requestSubmit()");
  await checkSelectedRow('added.example');
  console.log('Extension navigation and Add site reveal the offscreen row in the rail and focus the heading.');
  const markEvents = "window.reviewMarkEvents";
  await evaluate(`window.reviewMarkEvents = [];
    document.addEventListener('animationstart', event => {
      if (event.animationName.includes('site-ink')) {
        window.reviewMarkEvents.push(event.target.closest('button')?.getAttribute('aria-label') ?? 'detail');
      }
    }); document.querySelector('.library > ul').scrollTop = 0;`);
  async function moveTo(selector) {
    const point = await evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    return point;
  }
  async function activateByKeyboard(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  }
  const row = name => '.library button[aria-label=' + JSON.stringify(name) + ']';
  const nav = name => 'nav button[aria-label=' + JSON.stringify(name) + ']';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  await activateByKeyboard(row('YouTube'));
  await until("document.querySelector('.site-heading h1').textContent === 'YouTube'");
  await delay(300);
  assert.deepEqual(await evaluate(markEvents), [], 'Keyboard site changes must not print a mark');
  const reddit = await moveTo(row('Reddit'));
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...reddit });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...reddit });
  await until("document.querySelector('.site-heading h1').textContent === 'Reddit'");
  await delay(400);
  assert.deepEqual(await evaluate(markEvents), ['Reddit'], 'Entering and immediately clicking a row must print it once');
  await moveTo('.site-heading h1');
  await until(markEvents + '.length >= 2');
  await delay(400);
  assert.deepEqual(await evaluate(markEvents), ['Reddit', 'detail'], 'Holding the heading hover must print once');
  await activateByKeyboard(nav('Statistics'));
  await activateByKeyboard(nav('Sites'));
  await delay(300);
  assert.deepEqual(await evaluate(markEvents), ['Reddit', 'detail'], 'Keyboard re-entry must not print under a stationary pointer');
  await moveTo(row('Instagram'));
  await delay(350);
  const instagram = await moveTo(row('Instagram'));
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...instagram });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...instagram });
  await delay(300);
  assert.deepEqual(await evaluate(markEvents), ['Reddit', 'detail', 'Instagram', 'detail'],
    'A separate pointer activation must print the newly selected detail mark');
  for (const feature of [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'forced-colors', value: 'active' }]) {
    await command('Emulation.setEmulatedMedia', { features: [feature] });
    await moveTo(row('YouTube'));
    await moveTo('.site-heading h1');
    await delay(300);
    assert.equal(await evaluate(markEvents + '.length'), 4, `No mark playback in ${feature.name}`);
  }
  await command('Emulation.setEmulatedMedia', { features: [] });
  await activateByKeyboard(nav('Settings'));
  const pauseToner = "[...document.querySelectorAll('label')].find(e => e.textContent.includes('Pause toner particles')).click()";
  await evaluate(pauseToner);
  await activateByKeyboard(nav('Sites'));
  await moveTo(row('YouTube'));
  await moveTo('.site-heading h1');
  await delay(300);
  assert.equal(await evaluate(markEvents + '.length'), 4, 'No mark playback with toner paused');
  await activateByKeyboard(nav('Settings'));
  await evaluate(pauseToner);
  await activateByKeyboard(nav('Sites'));
  console.log('Site marks print once on pointer interactions, not on keyboard navigation or in static modes.');
  const drift = "document.getAnimations().filter(a => a.animationName?.includes('drift-toner'))";
  await until(drift + ".some(a => a.playState === 'running')");
  const poses = await evaluate(`['slow', 'mid', 'quick'].map(layer => {
    const toner = document.querySelector('main .toner.' + layer);
    const drift = toner.getAnimations().find(a => a.animationName?.includes('drift-toner'));
    const duration = drift.effect.getComputedTiming().duration;
    drift.pause();
    const transformAt = ms => {
      drift.currentTime = ms;
      return getComputedStyle(toner).transform;
    };
    const quarters = [0, 0.25, 0.5, 0.75].map(fraction =>
      [5, 75, 90].map(offset => transformAt(fraction * duration + offset)));
    const midpointX = new DOMMatrixReadOnly(transformAt(duration / 2)).m41;
    drift.currentTime = 0;
    drift.play();
    return { layer, quarters, midpointX };
  })`);
  for (const { layer, quarters, midpointX } of poses) {
    for (const [index, [first, held, next]] of quarters.entries()) {
      assert.equal(held, first, `${layer} toner quarter ${index + 1} must hold the first pose`);
      assert.notEqual(next, held, `${layer} toner quarter ${index + 1} must advance after 1/12 s`);
    }
    assert(Math.abs(midpointX - 380) < 0.01, `${layer} toner must travel half a tile by midloop`);
  }
  console.log('All toner layers hold poses at 12 fps without changing travel speed.');
  const grain = "document.getAnimations().filter(a => a.animationName?.includes('grain-static'))";
  const ink = "document.getAnimations().filter(a => a.animationName === 'ink-static')";
  await until(ink + ".some(a => a.playState === 'running')");
  const inkPoses = await evaluate(`(() => {
    const heading = document.querySelector('.page-heading');
    const animation = heading.getAnimations({ subtree: true }).find(a => a.animationName === 'ink-static');
    animation.pause();
    animation.currentTime = 0;
    const first = [getComputedStyle(heading, '::after').maskImage, getComputedStyle(heading, '::after').maskPosition];
    animation.currentTime = 500;
    const next = [getComputedStyle(heading, '::after').maskImage, getComputedStyle(heading, '::after').maskPosition];
    animation.play();
    return [first, next];
  })()`);
  assert.notEqual(inkPoses[0][0], inkPoses[1][0], 'Ink static must change block patterns');
  assert.equal(inkPoses[0][1], inkPoses[1][1], 'Ink static must not shuffle the line');
  await until(grain + ".some(a => a.playState === 'running')");
  const grainPoses = await evaluate(`(() => {
    const stock = document.querySelector('main .stock');
    const animation = stock.getAnimations({ subtree: true }).find(a => a.animationName?.includes('grain-static'));
    animation.pause();
    const frame = ms => {
      animation.currentTime = ms;
      const style = getComputedStyle(stock, '::before');
      return [style.maskImage, style.transform, style.maskPosition];
    };
    const poses = [1, 301, 3601, 3901].map(frame);
    animation.play();
    return poses;
  })()`);
  assert.notEqual(grainPoses[0][0], grainPoses[1][0], 'Paper grain must change its static pattern');
  assert.equal(grainPoses[0][1], grainPoses[1][1], 'Paper grain must not shake');
  assert.equal(grainPoses[0][2], grainPoses[1][2], 'Paper grain must not move its mask');
  assert.deepEqual(grainPoses.slice(2), grainPoses.slice(0, 2), 'Paper grain must repeat its 3.6s cycle independently of flakes');
  // Seeking animations through WAAPI overrides CSS play-state; reload before checking the control.
  const reloaded = new Promise(resolve => {
    function receive({ data }) {
      if (JSON.parse(data).method !== 'Page.loadEventFired') return;
      socket.removeEventListener('message', receive);
      resolve();
    }
    socket.addEventListener('message', receive);
  });
  await command('Page.reload');
  await reloaded;
  await until(grain + ".some(a => a.playState === 'running')");
  await evaluate("document.querySelector('nav button[aria-label=\"Settings\"]').click()");
  await until("Boolean(document.querySelector('input[type=checkbox]'))");
  await evaluate("[...document.querySelectorAll('label')].find(e => e.textContent.includes('Pause toner particles')).click()");
  await until(grain + ".every(a => a.playState === 'paused')");
  await until(drift + ".every(a => a.playState === 'paused')");
  await until(ink + ".every(a => a.playState === 'paused')");
  await evaluate("[...document.querySelectorAll('label')].find(e => e.textContent.includes('Pause toner particles')).click()");
  await until(grain + ".some(a => a.playState === 'running')");
  await until(drift + ".some(a => a.playState === 'running')");
  await until(ink + ".some(a => a.playState === 'running')");
  console.log('Paper and ink static change in place; pause stops and resumes them with toner.');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(drift + '.length === 0');
  await until(grain + '.length === 0');
  await until(ink + '.length === 0');
  await command('Emulation.setEmulatedMedia', { features: [] });
  await until(drift + ".some(a => a.playState === 'running')");
  await evaluate("document.querySelector('nav button[aria-label=\"Sites\"]').click()");
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await until("getComputedStyle(document.querySelector('main .stock')).display === 'none'");
  assert.equal(await evaluate(`${sitesArt}.getBoundingClientRect().width`), 0, 'Forced colors suppress the poster inset');
  for (const selector of ['html', '.workspace', '.library > ul', '.with-library > main']) {
    const { width, nativeColor } = await evaluate(scrollbar(selector));
    assert.equal(width, 'auto', `${selector} must use native scrollbar sizing in forced colors`);
    assert.equal(nativeColor, 'auto', `${selector} must leave scrollbar colors to the browser in forced colors`);
  }
  await until(grain + '.length === 0');
  await until(ink + '.length === 0');
  await until(drift + '.length === 0');
  console.log('Toner follows live reduced-motion and forced-colors changes.');
} finally {
  socket?.close();
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) {
    const stopped = once(browser, 'exit');
    browser.kill();
    await stopped;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
