import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startFixtureProxy } from './fixture-proxy.mjs';
import { verifyPlayback } from './playback.mjs';

// This gate intentionally refuses macOS: neither browser's native-host lookup
// has been shown to respect a disposable HOME there. Never probe a user path.
if (process.platform !== 'linux') {
  throw new Error('Browser gate prerequisite: Linux with isolated HOME and Xvfb; macOS native-host registration isolation is not verified.');
}
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--case' && ['shared-rule', 'entry'].includes(args[1]))) {
  throw new Error('Usage: run.mjs [--case shared-rule|entry]');
}
const scenario = args[1] ?? 'shared-rule';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const archives = {
  chromium: join(root, 'artifacts/extensions/focus-chromium.zip'),
  firefox: join(root, 'artifacts/extensions/focus-firefox.zip'),
};
const nativeHost = join(root, 'apps/desktop/src-tauri/target/debug/focus-native-host');
const python = process.env.FOCUS_PYTHON || 'python3';
const adminBin = join(root, 'apps/desktop/src-tauri/target/debug/focus-fixture-admin');
const fixturePath = join(root, 'tests/sites/fixtures/youtube.html');
const reportPath = join(root, `artifacts/extensions/${scenario}-report.json`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const executable = name => {
  try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); }
  catch { throw new Error(`Browser gate prerequisite missing: ${name}`); }
};
for (const path of [...Object.values(archives), nativeHost, adminBin, fixturePath]) await access(path);
for (const name of ['unzip', 'Xvfb', 'xdotool', 'firefox', 'geckodriver', 'dbus-daemon', 'openssl', 'certutil', python]) executable(name);
try { execFileSync(python, ['-c', 'import pyatspi'], { stdio: 'ignore' }); }
catch { throw new Error('Browser gate prerequisite missing: python3-pyatspi'); }
const { chromium } = await import('playwright');
const { Builder, By } = await import('selenium-webdriver');
const firefox = await import('selenium-webdriver/firefox.js');
const { BrowsingContext } = await import('selenium-webdriver/bidi/generated/browsing_context.js');
const { Network } = await import('selenium-webdriver/bidi/generated/network.js');
const { key } = JSON.parse(await readFile(join(root, 'apps/extension/chromium-test-key.json'), 'utf8'));
const chromiumId = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)]
  .flatMap(byte => [byte >> 4, byte & 15]).map(n => String.fromCharCode(97 + n)).join('');
const firefoxUuid = randomUUID();
const temp = await mkdtemp(join(tmpdir(), 'focus-browser-gate-'));
const data = join(temp, 'data');
const hostPids = join(temp, 'host-pids');
const offline = join(temp, 'offline');
const wrapper = join(temp, 'native-host');
const homes = { chromium: join(temp, 'chromium-home'), firefox: join(temp, 'firefox-home') };
const results = { case: scenario, platform: process.platform, artifacts: {}, browsers: {}, fixture: 'YouTube test aliases served by private loopback HTTPS; other destinations rejected', checks: [], status: 'failed', firefoxRestart: 'temporary ZIP installation only; not signed-install persistence evidence' };
const youtubeOrigins = [
  'http://youtube.com/*', 'https://youtube.com/*',
  'http://www.youtube.com/*', 'https://www.youtube.com/*',
  'http://m.youtube.com/*', 'https://m.youtube.com/*',
  'http://youtu.be/*', 'https://youtu.be/*',
];
let step = 'initialization';
let proxy;
let display;
let bus;
let chrome;
let fox;

class FixtureCommandError extends Error {}
async function command(path, args, env = {}) {
  try {
    return (await execFileAsync(path, args, { encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL', env: { ...process.env, ...env } })).stdout;
  } catch (error) {
    const operation = path === adminBin ? `fixture admin ${args[0]}` : path === python ? `Firefox accessibility ${args[0]}` : `${path.split('/').at(-1)} ${args[0]}`;
    const reason = error.killed ? 'subprocess deadline' : Number.isInteger(error.code) ? `exit ${error.code}` : 'subprocess failure';
    throw new FixtureCommandError(`${operation}: ${reason}`);
  }
}
const execFileAsync = promisify(execFile);
async function admin(...args) {
  try {
    const { stdout } = await execFileAsync(adminBin, args, {
      encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL',
      env: { ...process.env, FOCUS_DATA_DIR: data, FOCUS_FIXTURE_NO_DESKTOP: '1', FOCUS_FIXTURE_ENTRY: scenario === 'entry' ? '1' : '0' },
    });
    return stdout;
  } catch (error) {
    const reason = error.killed ? 'subprocess deadline' : Number.isInteger(error.code) ? `exit ${error.code}` : 'subprocess failure';
    throw new FixtureCommandError(`fixture admin ${args[0]}: ${reason}`);
  }
}
async function state() { return JSON.parse(await admin('state')); }
async function eventually(label, fn, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (error) { if (error instanceof FixtureCommandError) throw error; last = error; }
    await sleep(250);
  }
  throw new Error(`${label} timed out${last instanceof Error ? `: ${last.message}` : ''}`);
}
async function check(label, fn) { step = label; console.log(`Checking ${label}`); await fn(); results.checks.push(label); }
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
async function killHosts() {
  let pids = '';
  try { pids = await readFile(hostPids, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(hostPids, '');
  let killed = 0;
  for (const pid of new Set(pids.trim().split(/\s+/).filter(Boolean))) {
    if (!/^\d+$/.test(pid)) throw new Error('Invalid recorded host PID');
    try {
      const [exe, cmdline, environment] = await Promise.all([
        readlink(`/proc/${pid}/exe`),
        readFile(`/proc/${pid}/cmdline`, 'utf8'),
        readFile(`/proc/${pid}/environ`, 'utf8'),
      ]);
      const argv0 = cmdline.split('\0', 1)[0];
      if ((exe === nativeHost || argv0 === nativeHost) && environment.split('\0').includes(`FOCUS_DATA_DIR=${data}`)) {
        process.kill(Number(pid), 'SIGTERM');
        killed += 1;
      }
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  return killed;
}
async function nativeRegistration(browser, id) {
  const directory = browser === 'chromium'
    ? join(temp, 'chromium-profile', 'NativeMessagingHosts')
    : join(homes.firefox, '.mozilla/native-messaging-hosts');
  await mkdir(directory, { recursive: true });
  const manifest = { name: 'com.focus_local.bridge', description: 'Disposable focus browser fixture', path: wrapper, type: 'stdio' };
  if (browser === 'chromium') manifest.allowed_origins = [`chrome-extension://${id}/`];
  else manifest.allowed_extensions = [id];
  await writeFile(join(directory, 'com.focus_local.bridge.json'), JSON.stringify(manifest));
}
async function startDisplay() {
  const child = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const number = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(output.trim()); });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Xvfb exited before allocating a display')));
  });
  if (!/^\d+$/.test(number)) throw new Error('Invalid Xvfb display');
  return { child, name: `:${number}` };
}
async function startAccessBus() {
  const child = spawn('dbus-daemon', ['--session', '--nofork', '--print-address=1'], {
    env: { ...process.env, HOME: homes.firefox, DISPLAY: display.name }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  const address = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(output.trim()); });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Private accessibility bus did not start')));
  });
  return { child, address };
}
function firefoxUi(...args) {
  return command(python, [join(root, 'tests/browser/firefox-ui.py'), ...args], {
    HOME: homes.firefox, DISPLAY: display.name, DBUS_SESSION_BUS_ADDRESS: bus.address,
  });
}
function prompt(key) {
  return command('xdotool', ['key', '--clearmodifiers', key], { DISPLAY: display.name });
}
async function chromiumStart() {
  const context = await chromium.launchPersistentContext(join(temp, 'chromium-profile'), {
    channel: 'chromium', headless: false,
    env: { ...process.env, HOME: homes.chromium, XDG_CONFIG_HOME: join(homes.chromium, '.config'), DISPLAY: display.name },
    args: [`--disable-extensions-except=${join(temp, 'chromium')}`, `--load-extension=${join(temp, 'chromium')}`,
      `--proxy-server=http://127.0.0.1:${proxy.port}`, '--proxy-bypass-list=<-loopback>',
      `--ignore-certificate-errors-spki-list=${proxy.spki}`,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
      '--no-first-run', '--disable-background-networking', '--disable-quic'],
  });
  try {
    results.browsers.chromium = (await command(chromium.executablePath(), ['--version'])).trim();
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${chromiumId}/setup.html`);
    const page = await context.newPage();
    const browser = { context, setup, page };
    if (scenario === 'entry') Object.assign(browser, await observeChromiumTab(context, page));
    return browser;
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
async function firefoxStart() {
  const options = new firefox.Options();
  if (scenario === 'entry') options.enableBidi();
  options.setProfile(proxy.firefoxProfile);
  options.setPreference('extensions.webextensions.uuids', JSON.stringify({ 'focus@focus-local': firefoxUuid }));
  options.setPreference('network.proxy.type', 1);
  options.setPreference('network.proxy.http', '127.0.0.1');
  options.setPreference('network.proxy.http_port', proxy.port);
  options.setPreference('network.proxy.ssl', '127.0.0.1');
  options.setPreference('network.proxy.ssl_port', proxy.port);
  options.setPreference('network.proxy.no_proxies_on', '');
  options.setPreference('network.trr.mode', 5);
  options.setPreference('network.dns.disablePrefetch', true);
  options.setPreference('network.http.http3.enabled', false);
  const service = new firefox.ServiceBuilder(executable('geckodriver'));
  service.setEnvironment({ ...process.env, HOME: homes.firefox, XDG_CONFIG_HOME: join(homes.firefox, '.config'),
    DISPLAY: display.name, DBUS_SESSION_BUS_ADDRESS: bus.address, GNOME_ACCESSIBILITY: '1' });
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  try {
    await driver.manage().setTimeouts({ pageLoad: 20000 });
    results.browsers.firefox = (await driver.getCapabilities()).get('browserVersion');
    const id = await driver.installAddon(archives.firefox, true);
    assert.equal(id, 'focus@focus-local');
    const page = await driver.getWindowHandle();
    await driver.switchTo().newWindow('tab');
    // WebDriver navigation rejects privileged schemes; use the address bar in
    // this run's private display, without changing Firefox security defaults.
    await focusWindow('firefox');
    await prompt('ctrl+l');
    await command('xdotool', ['type', '--clearmodifiers', `moz-extension://${firefoxUuid}/setup.html`], { DISPLAY: display.name });
    await prompt('Return');
    await firefoxUi('wait', 'entry', 'Profile label');
    const browser = { driver, page };
    if (scenario === 'entry') {
      browser.bidi = await BrowsingContext.create(driver);
      browser.tabs = new Map([[page, newObservation()]]);
      Object.assign(browser, browser.tabs.get(page));
      await browser.bidi.addCallback(BrowsingContext.NAVIGATION_COMMITTED, event => {
        const tab = browser.tabs.get(event.context);
        if (!tab) return;
        if (event.url.startsWith('about:neterror')) tab.errors.set(event.url, new URL(event.url).searchParams.get('e'));
        else recordCommit(tab, event.url);
      });
      results.firefoxSignals = {};
      for (const [label, signal] of [
        ['navigationFailed', BrowsingContext.NAVIGATION_FAILED],
        ['navigationAborted', BrowsingContext.NAVIGATION_ABORTED],
      ]) {
        try {
          await browser.bidi.addCallback(signal, event => browser.tabs.get(event.context)?.failed.add(event.url));
          results.firefoxSignals[label] = 'subscribed';
        } catch { results.firefoxSignals[label] = 'unsupported'; }
      }
      try {
        await browser.bidi.addCallback(BrowsingContext.HISTORY_UPDATED, event => browser.tabs.get(event.context)?.history.add(event.url));
        results.firefoxSignals.history = 'subscribed';
      } catch { results.firefoxSignals.history = 'unsupported'; }
      try {
        const network = await Network.create(driver);
        await network.addCallback(Network.FETCH_ERROR, event => {
          if (event.navigation !== null) browser.tabs.get(event.context)?.errors.set(event.request.url, event.errorText);
        });
        results.firefoxSignals.fetchError = 'subscribed';
      } catch { results.firefoxSignals.fetchError = 'unsupported'; }
    }
    return browser;
  } catch (error) {
    await driver.quit().catch(() => {});
    throw error;
  }
}
async function focusWindow(windowClass) {
  const env = { DISPLAY: display.name };
  const windows = (await command('xdotool', ['search', '--onlyvisible', '--class', windowClass], env)).trim().split(/\s+/);
  await command('xdotool', ['windowraise', windows.at(-1)], env);
  await command('xdotool', ['windowfocus', windows.at(-1)], env);
}
async function setupAction(browser, action, value) {
  if (browser.context) {
    const page = browser.setup;
    if (action === 'label') await page.getByLabel('Profile label').fill(value);
    if (action === 'browser') await page.getByRole('combobox').selectOption(value);
    if (action === 'connect') await page.getByRole('button', { name: 'Connect to focus.' }).click();
    if (action === 'select') await page.getByRole('checkbox', { name: 'YouTube' }).check();
    if (action === 'grant') await page.getByRole('button', { name: 'Grant access' }).click({ noWaitAfter: true });
    return;
  }
  await focusWindow('firefox');
  await firefoxUi('click', 'page tab', 'focus. browser setup');
  if (action === 'label') await firefoxUi('fill', 'entry', 'Profile label', value);
  if (action === 'connect') await firefoxUi('click', 'push button', 'Connect to focus.');
  if (action === 'select') await firefoxUi('check', 'check box', 'YouTube');
  if (action === 'grant') await firefoxUi('click', 'push button', 'Grant access');
}
async function grant(browser, accept = true) {
  // The button calls permissions.request from the actual extension's direct
  // user gesture. Xvfb is private to this run; no user's desktop is touched.
  if (!browser.context) {
    await setupAction(browser, 'grant');
    if (accept) await firefoxUi('click', 'push button', 'Allow|Add');
    else await prompt('Escape');
    return;
  }
  await browser.setup.bringToFront();
  const click = setupAction(browser, 'grant');
  await sleep(1000);
  await focusWindow('chrome|chromium');
  if (accept) await prompt('Tab');
  await prompt(accept ? 'Return' : 'Escape');
  await click;
}
async function pair(browser, browserId, label, approve = true) {
  await setupAction(browser, 'browser', browserId);
  await setupAction(browser, 'label', label);
  await setupAction(browser, 'connect');
  const pending = await eventually(`${label} pairing request`, async () => (await state()).pending.find(p => p.label === label));
  await admin(approve ? 'approve' : 'deny', pending.id);
  if (!approve) {
    await eventually(`${label} denied`, async () => !(await state()).pending.some(p => p.id === pending.id));
    return;
  }
  const profile = await eventually(`${label} paired`, async () => (await state()).profiles.find(p => p.label === label && p.online));
  assert.equal(profile.browser, browserId);
  return profile.id;
}
async function navigate(browser, path = '/', host = 'www.youtube.com') {
  const url = `https://${host}${path}`;
  if (browser.context) await browser.page.goto(url, { waitUntil: 'domcontentloaded' });
  else { await browser.driver.switchTo().window(browser.page); await browser.driver.get(url); }
}
async function currentUrl(browser) {
  if (browser.context) return browser.page.url();
  if (browser.bidi) {
    await browser.driver.switchTo().window(browser.page);
    return browser.driver.getCurrentUrl();
  }
  return browser.driver.getCurrentUrl();
}

function newObservation() {
  return { commits: new Map(), history: new Set(), errors: new Map(), failed: new Set(), pageErrors: [] };
}

async function observeChromiumTab(context, page) {
  const tab = newObservation();
  page.on('pageerror', error => {
    const message = String(error.message);
    tab.pageErrors.push({ name: error.name, pushState: message.includes('pushState'),
      url: message.includes('URL'), notFunction: message.includes('not a function'),
      invalidUrl: message.includes('Invalid URL'), constructor: message.includes('constructor'),
      searchParams: message.includes('searchParams'), invalidReceiver: message.includes('Illegal invocation') });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  let mainFrame = frameTree.frame.id;
  cdp.on('Page.frameNavigated', ({ frame }) => {
    if (frame.parentId) return;
    mainFrame = frame.id;
    if (frame.unreachableUrl) tab.failed.add(frame.unreachableUrl);
    else recordCommit(tab, frame.url);
  });
  cdp.on('Page.navigatedWithinDocument', ({ frameId, url }) => {
    if (frameId === mainFrame) tab.history.add(url);
  });
  return { ...tab, cdp };
}

async function inEntryTab(browser, run) {
  if (browser.context) {
    const page = await browser.context.newPage();
    try { await run({ ...browser, page, ...await observeChromiumTab(browser.context, page) }); }
    finally { await page.close(); }
    return;
  }
  await browser.driver.switchTo().newWindow('tab');
  const page = await browser.driver.getWindowHandle();
  const observation = newObservation();
  browser.tabs.set(page, observation);
  try { await run({ ...browser, page, ...observation }); }
  finally {
    browser.tabs.delete(page);
    await browser.driver.switchTo().window(page);
    await browser.driver.close();
    await browser.driver.switchTo().window(browser.page);
  }
}

function entryUrl(browser, url) {
  const origin = browser.context ? `chrome-extension://${chromiumId}` : `moz-extension://${firefoxUuid}`;
  return `${origin}/entry.html#${url}`;
}

async function waitForPause(browser, url) {
  await eventually('target Pause interstitial', async () => await currentUrl(browser) === entryUrl(browser, url), 6000);
  if (browser.context) {
    await browser.page.getByText('Pause before opening this site.', { exact: true }).waitFor({ timeout: 6000 });
  } else {
    await browser.driver.switchTo().window(browser.page);
    await focusWindow('firefox');
    await prompt('ctrl+9');
    await firefoxUi('wait', 'push button', 'Go back');
  }
}

async function verifyDestination(browser, host, path, requests = 1) {
  const url = `https://${host}${path}`;
  await eventually('target fixture document committed', async () =>
    browser.commits.get(url) === requests && await currentUrl(browser) === url &&
    proxy.documents(host, path) === requests && await visible(browser, '#fixture-anchor'), 15000);
}

function navigationCode(message) {
  return String(message).match(/\b(?:NS_ERROR_[A-Z_]+|NS_BINDING_[A-Z_]+|ERR_[A-Z_]+|blockedByClient|connectionFailure|proxyConnectFailure|netReset|dnsNotFound)\b/)?.[0];
}

async function probeBlocked(browser, host, path) {
  const url = `https://${host}${path}`;
  const before = proxy.documents(host, path);
  let code;
  let navigation = 'resolved';
  try {
    if (browser.context) {
      const result = await browser.cdp.send('Page.navigate', { url });
      code = navigationCode(result.errorText);
    } else {
      await browser.bidi.navigate({ context: browser.page, url, wait: 'none' });
    }
  } catch (error) {
    code = navigationCode(error.message);
    navigation = error.name;
  }
  // A failed attempt must still be scoped to this fresh tab and target URL.
  await eventually('native navigation reached a terminal outcome', () =>
    code || browser.failed.has(url) || browser.errors.has(url) || browser.commits.has(url), 5000).catch(() => {});
  const native = await currentUrl(browser);
  if (native.startsWith('about:neterror?')) {
    const params = new URL(native).searchParams;
    if (params.get('u') === url) code ??= navigationCode(params.get('e'));
  }
  const network = navigationCode(browser.errors.get(url));
  code ??= network;
  const blocked = browser.context
    ? code === 'ERR_BLOCKED_BY_CLIENT'
    : network === 'NS_ERROR_ABORT';
  return {
    commits: browser.commits.get(url) ?? 0, requests: proxy.documents(host, path) - before,
    outcome: blocked ? 'blocked' : 'unconfirmed', navigation, code: code ?? 'none',
    network: network ?? 'none', targetFailure: browser.failed.has(url),
  };
}

async function chromiumPassState(browser, tabId) {
  return browser.setup.evaluate(async id => {
    const [{ 'entry-session': session }, rules] = await Promise.all([
      chrome.storage.session.get('entry-session'), chrome.declarativeNetRequest.getSessionRules(),
    ]);
    return {
      pending: Boolean(session?.tabs?.[id]?.pending),
      nonce: session?.tabs?.[id]?.pending?.nonce,
      installed: rules.some(rule => rule.action.type === 'allow' && rule.condition.tabIds?.includes(id)),
    };
  }, tabId);
}
function recordCommit(browser, url) {
  browser.commits.set(url, (browser.commits.get(url) ?? 0) + 1);
}

async function clickSite(browser, id, expectedUrl) {
  if (browser.context) {
    await eventually('site document has committed and its control is visible', () => visible(browser, `#${id}`));
    await browser.page.locator(`#${id}`).click();
  }
  else {
    await browser.driver.switchTo().window(browser.page);
    assert.equal(await browser.driver.getWindowHandle(), browser.page, 'wrong Firefox browsing context');
    assert.equal(await browser.driver.getCurrentUrl(), expectedUrl, 'wrong fixture document before click');
    const state = await browser.driver.executeScript(`
      const target = document.getElementById(arguments[0]);
      if (!target) return { missing: true };
      const rect = target.getBoundingClientRect();
      const style = window.getComputedStyle(target);
      return {
        sameUrl: window.location.href === arguments[1],
        sameOrigin: window.location.origin === new window.URL(arguments[1]).origin,
        width: rect.width > 0, height: rect.height > 0,
        visibility: style.visibility, display: style.display,
        pointerEvents: style.pointerEvents,
      };
    `, id, expectedUrl);
    (results.clickTrace ??= {})[id] = state;
    assert.equal(state.sameUrl && state.sameOrigin, true, 'wrong fixture document before click');
    assert.ok(state.width && state.height && state.visibility === 'visible' && state.display !== 'none', 'fixture control is not visible');
    await browser.driver.executeScript(`
      if (window.location.href !== arguments[1] || window.location.origin !== new window.URL(arguments[1]).origin) {
        throw new Error('wrong fixture document before click');
      }
      const target = document.getElementById(arguments[0]);
      if (!target || window.getComputedStyle(target).visibility !== 'visible') throw new Error('fixture control is not visible');
      target.click();
    `, id, expectedUrl);
  }
}

async function continueEntry(browser, url) {
  assert.equal(await currentUrl(browser), entryUrl(browser, url), 'wrong tab or Pause target');
  if (browser.context) {
    await browser.page.getByRole('button', { name: 'Continue' }).click({ timeout: 12000 });
  } else {
    await browser.driver.switchTo().window(browser.page);
    await focusWindow('firefox');
    await prompt('ctrl+9');
    await firefoxUi('enabled', 'push button', 'Continue');
    await firefoxUi('click', 'push button', 'Continue');
  }
}
async function visible(browser, selector) {
  if (browser.context) return browser.page.locator(selector).isVisible();
  await browser.driver.switchTo().window(browser.page);
  return (await browser.driver.findElement(By.css(selector))).isDisplayed();
}
async function fixture(browser, hidden) {
  await eventually('Shorts shelf visibility', async () => (await visible(browser, '#shorts-shelf')) === !hidden);
  assert.equal(await visible(browser, '#shorts-card'), !hidden);
  for (const selector of ['#ordinary-video', '#playlist', '#direct-short', '#subscriptions-nav', '#site-search', '#playback', '#comments']) {
    assert.equal(await visible(browser, selector), true, selector);
  }
}
async function removeOrigin(browser, origin) {
  assert.equal(await browser.setup.evaluate(async origin => chrome.permissions.remove({ origins: [origin] }), origin), true);
}
async function ack(id, revision, origins) {
  await eventually('current acknowledged grants', async () => {
    const profile = (await state()).profiles.find(p => p.id === id);
    return profile && profile.ackRevision === revision && JSON.stringify([...profile.origins].sort()) === JSON.stringify([...origins].sort());
  });
}
try {
  await mkdir(data, { recursive: true });
  for (const home of Object.values(homes)) await mkdir(home, { recursive: true });
  await writeFile(wrapper, `#!/bin/sh\n[ ! -e ${shellQuote(offline)} ] || exit 1\necho $$ >> ${shellQuote(hostPids)}\nexport FOCUS_DATA_DIR=${shellQuote(data)}\nexport FOCUS_FIXTURE_NO_DESKTOP=1\nexport FOCUS_FIXTURE_ENTRY=${scenario === 'entry' ? '1' : '0'}\nexport FOCUS_FIXTURE_HOST_WRAPPER=${shellQuote(wrapper)}\nexec ${shellQuote(nativeHost)} "$@"\n`);
  await chmod(wrapper, 0o700);
  for (const [browser, archive] of Object.entries(archives)) {
    const bytes = await readFile(archive);
    results.artifacts[browser] = { file: archive.slice(root.length + 1), sha256: createHash('sha256').update(bytes).digest('hex') };
    await mkdir(join(temp, browser)); await command('unzip', ['-q', archive, '-d', join(temp, browser)]);
  }
  await nativeRegistration('chromium', chromiumId);
  await nativeRegistration('firefox', 'focus@focus-local');
  await command(executable('web-ext'), ['lint', '--source-dir', join(temp, 'firefox'), '--no-input']);
  display = await startDisplay();
  bus = await startAccessBus();
  proxy = await startFixtureProxy(fixturePath, temp);
  chrome = await chromiumStart();
  fox = await firefoxStart();
  let chromeId;
  let foxId;
  await check('pair both profiles with explicit approval and no default site grants', async () => {
    chromeId = await pair(chrome, 'chromium', 'Fixture Chromium');
    foxId = await pair(fox, 'firefox', 'Fixture Firefox');
    const initial = await state();
    assert.equal(initial.hideShorts, false);
    for (const id of [chromeId, foxId]) assert.deepEqual(initial.profiles.find(p => p.id === id).origins, []);
    await navigate(chrome); await navigate(fox); await fixture(chrome, false); await fixture(fox, false);
  });
  if (scenario === 'entry') {
    for (const [name, browser, id] of [['chromium', chrome, chromeId], ['firefox', fox, foxId]]) {
      await check(`${name}: grant access and measure Allow`, async () => {
        await setupAction(browser, 'select'); await grant(browser);
        await ack(id, (await state()).revision, youtubeOrigins);
        const path = `/watch?id=73&allow=${name}`;
        const url = `https://www.youtube.com${path}`;
        const before = browser.commits.get(url) ?? 0;
        await navigate(browser, path);
        await eventually(`${name} main-document commit listener control`, () => (browser.commits.get(url) ?? 0) > before);
        assert.equal(proxy.documents('www.youtube.com', path), 1);
      });
    }
    for (const enabled of [true, false]) {
      await check(`grayscale ${enabled ? 'applies' : 'reverses'} in both profiles`, async () => {
        await admin('grayscale', String((await state()).revision), 'youtube', String(enabled));
        const { revision } = await state();
        await ack(chromeId, revision, youtubeOrigins);
        await ack(foxId, revision, youtubeOrigins);
        for (const browser of [chrome, fox]) {
          await eventually('open document grayscale state', async () => {
            if (browser.context) return (await browser.page.evaluate(() => getComputedStyle(document.documentElement).filter)).includes('grayscale') === enabled;
            await browser.driver.switchTo().window(browser.page);
            return (await browser.driver.executeScript('return getComputedStyle(document.documentElement).filter')).includes('grayscale') === enabled;
          });
        }
      });
    }
    await check('install the fixture service worker on the explicit mobile alias', async () => {
      for (const [name, browser] of [['chromium', chrome], ['firefox', fox]]) {
        const path = `/worker-navigation?allow=${name}`;
        await navigate(browser, '/', 'm.youtube.com');
        if (browser.context) {
          await browser.page.locator('#install-worker').click();
          await browser.page.getByRole('button', { name: 'Worker ready' }).waitFor();
        } else {
          await (await browser.driver.findElement(By.id('install-worker'))).click();
          await eventually('fixture worker ready', async () => (await (await browser.driver.findElement(By.id('install-worker'))).getText()) === 'Worker ready');
        }
        const url = `https://m.youtube.com${path}`;
        const before = browser.commits.get(url) ?? 0;
        await navigate(browser, path, 'm.youtube.com');
        await eventually(`${name} cached-worker commit listener control`, () => (browser.commits.get(url) ?? 0) > before);
        const title = browser.context ? await browser.page.title() : await browser.driver.getTitle();
        assert.equal(title, 'Worker response');
        assert.equal(proxy.documents('m.youtube.com', path), 0);
        await navigate(browser);
      }
    });
    const entryFailures = [];
    results.transitions = {};
    async function checkEntry(label, run, prerequisite = true) {
      if (!prerequisite) {
        results.transitions[label] = { status: 'unverified' };
        return false;
      }
      try {
        await check(label, run);
        results.transitions[label] = { status: 'passed' };
        return true;
      } catch (error) {
        entryFailures.push({ label, error });
        const known = ['target Pause interstitial', 'site document has committed', 'actual SPA history change',
          'target fixture document committed', 'Firefox accessibility', 'wrong tab or Pause target',
          'wrong Firefox browsing context', 'wrong fixture document before click', 'fixture control missing',
          'fixture control is not visible', 'same-document anchor', 'is not a constructor', 'is not a function', 'Unexpected token'];
        results.transitions[label] = { status: 'failed', error: error.name,
          detail: known.find(text => String(error.message).includes(text)) ?? navigationCode(error.message) ?? 'other' };
        return false;
      }
    }
    const engines = [['chromium', chrome], ['firefox', fox]];
    async function applyEntry(policy) {
      await admin('entry', String((await state()).revision), 'youtube', JSON.stringify(policy));
      const { revision } = await state();
      await ack(chromeId, revision, youtubeOrigins);
      await ack(foxId, revision, youtubeOrigins);
      return revision;
    }
    await check('apply manual page Pause', () => applyEntry({ mode: 'pause', seconds: 5, finish: 'manual', frequency: 'page' }));
    for (const [name, browser] of engines) {
      for (const [kind, host, path] of [
        ['ordinary', 'www.youtube.com', `/watch?id=first-pause-${name}`],
        ['worker', 'm.youtube.com', `/worker-navigation?first=pause-${name}`],
      ]) {
        await inEntryTab(browser, async tab => {
          const url = `https://${host}${path}`;
          await checkEntry(`${name}: pause ${kind} first document`, async () => {
            let navigation = 'resolved';
            try { await navigate(tab, path, host); } catch (error) { navigation = error.name; }
            await sleep(500);
            const outcome = await currentUrl(tab) === entryUrl(tab, url) ? 'pause' : 'unconfirmed';
            const commits = tab.commits.get(url) ?? 0;
            const requests = proxy.documents(host, path);
            (results.firstDocuments ??= {})[`${name}-pause-${kind}`] = { commits, requests, outcome, navigation };
            assert.equal(commits, 0, 'gated destination committed');
            assert.equal(requests, 0, 'gated destination reached fixture server');
            assert.equal(outcome, 'pause');
          });
        });
      }
      await inEntryTab(browser, async tab => {
        const path = `/watch?id=73&pause=${name}`;
        const url = `https://www.youtube.com${path}`;
        let ready = await checkEntry(`${name}: Pause displayed`, async () => {
          await navigate(tab, path);
          await waitForPause(tab, url);
          assert.equal(tab.commits.get(url) ?? 0, 0);
          assert.equal(proxy.documents('www.youtube.com', path), 0);
          if (tab.context) await tab.page.screenshot({ path: join(root, 'artifacts/extensions/entry-pause.png') });
        });
        ready = await checkEntry(`${name}: Continue action`, () => continueEntry(tab, url), ready);
        ready = await checkEntry(`${name}: Continue destination commit`, () => verifyDestination(tab, 'www.youtube.com', path), ready);
        ready = await checkEntry(`${name}: anchor preserves page pass`, async () => {
          await clickSite(tab, 'fixture-anchor', url);
          await eventually('same-document anchor', async () => await currentUrl(tab) === `${url}#comments`, 6000);
          assert.equal(proxy.documents('www.youtube.com', path), 1);
          assert.equal(tab.commits.get(url), 1, 'anchor must not recommit the document');
          assert.equal(tab.commits.get(`${url}#comments`) ?? 0, 0, 'anchor must be same-document');
        }, ready);
        const spaPath = `/watch?id=spa&engine=${name}`;
        const spaUrl = `https://www.youtube.com${spaPath}`;
        ready = await checkEntry(`${name}: SPA fixture changes URL`, async () => {
          if (tab.context) (results.spaTrace ??= {})[name] = await tab.page.evaluate(() => ({
            historyType: typeof history, pushStateType: typeof history.pushState, urlType: typeof URL,
          }));
          if (!tab.context) {
            const observed = await currentUrl(tab);
            (results.spaTrace ??= {})[name] = {
              atOriginal: observed === url, atAnchor: observed === `${url}#comments`,
              atOriginalPause: observed === entryUrl(tab, url), atSpaPause: observed === entryUrl(tab, spaUrl),
            };
          }
          await clickSite(tab, 'spa-route', `${url}#comments`);
          try { await eventually('actual SPA history change', () => tab.history.has(spaUrl), 6000); }
          finally {
            const current = await currentUrl(tab);
            Object.assign((results.spaTrace ??= {})[name] ??= {}, {
              observedEvents: tab.history.size, expectedObserved: tab.history.has(spaUrl),
              otherSpaObserved: [...tab.history].some(value => value.includes('/watch?id=spa')),
              pageErrors: tab.pageErrors ?? [],
              atSecondPause: current === entryUrl(tab, spaUrl), atSpa: current === spaUrl,
            });
          }
        }, ready);
        ready = await checkEntry(`${name}: SPA route triggers second Pause`, async () => {
          await waitForPause(tab, spaUrl);
          assert.equal(proxy.documents('www.youtube.com', spaPath), 0);
        }, ready);
        ready = await checkEntry(`${name}: second Continue action`, () => continueEntry(tab, spaUrl), ready);
        ready = await checkEntry(`${name}: SPA destination commit`, () => verifyDestination(tab, 'www.youtube.com', spaPath), ready);
        await checkEntry(`${name}: SPA destination reload requires fresh Pause`, async () => {
          if (tab.context) await tab.page.reload({ waitUntil: 'domcontentloaded' });
          else { await tab.driver.switchTo().window(tab.page); await tab.driver.navigate().refresh(); }
          await waitForPause(tab, spaUrl);
          assert.equal(tab.commits.get(spaUrl), 1);
          assert.equal(proxy.documents('www.youtube.com', spaPath), 1);
        }, ready);
      });
      await inEntryTab(browser, async tab => {
        const path = `/watch?id=reload&pause=${name}`;
        const url = `https://www.youtube.com${path}`;
        const ready = await checkEntry(`${name}: reload setup destination`, async () => {
          await navigate(tab, path);
          await waitForPause(tab, url);
          await continueEntry(tab, url);
          await verifyDestination(tab, 'www.youtube.com', path);
        });
        await checkEntry(`${name}: reload requires Pause`, async () => {
          if (tab.context) await tab.page.reload({ waitUntil: 'domcontentloaded' });
          else { await tab.driver.switchTo().window(tab.page); await tab.driver.navigate().refresh(); }
          await waitForPause(tab, url);
          assert.equal(proxy.documents('www.youtube.com', path), 1);
        }, ready);
      });
      await inEntryTab(browser, async tab => {
        await checkEntry(`${name}: redirect destination requires its own Pause`, async () => {
          const query = `?id=redirect&engine=${name}`;
          const from = `/fixture-redirect${query}`;
          const to = `/watch${query}`;
          await navigate(tab, from, 'youtu.be');
          await waitForPause(tab, `https://youtu.be${from}`);
          assert.equal(proxy.documents('youtu.be', from), 0);
          await continueEntry(tab, `https://youtu.be${from}`);
          await waitForPause(tab, `https://www.youtube.com${to}`);
          assert.equal(proxy.documents('youtu.be', from), 1);
          assert.equal(proxy.documents('www.youtube.com', to), 0);
        });
      });
    }
    await check('apply block policy', () => applyEntry({ mode: 'block' }));
    for (const [name, browser] of engines) {
      const targets = [['unrelated-error', 'outside.test', `/unrelated-block-control-${name}`]];
      if (name === 'chromium') targets.unshift(
        ['ordinary', 'www.youtube.com', '/watch?id=first-block-chromium'],
        ['worker', 'm.youtube.com', '/worker-navigation?first=block-chromium'],
      );
      for (const [kind, host, path] of targets) {
        await inEntryTab(browser, async tab => {
          await checkEntry(`${name}: block ${kind} native outcome`, async () => {
            const result = await probeBlocked(tab, host, path);
            (results.firstDocuments ??= {})[`${name}-block-${kind}`] = result;
            assert.equal(result.commits, 0);
            assert.equal(result.requests, 0);
            assert.equal(result.outcome, kind === 'unrelated-error' ? 'unconfirmed' : 'blocked');
            if (kind === 'unrelated-error') assert.notEqual(result.code, 'none', 'negative control must actually fail');
          });
        });
      }
    }
    const firefoxTargets = [
      ['ordinary', 'www.youtube.com', '/watch?id=first-block-firefox', false],
      ['worker', 'm.youtube.com', '/worker-navigation?first=block-firefox', true],
    ];
    results.firefoxBlockComparisons = {};
    const firefoxAttempts = new Map();
    for (const [kind] of firefoxTargets) {
      const attempts = {};
      firefoxAttempts.set(kind, attempts);
      results.firefoxBlockComparisons[kind] = attempts;
    }
    for (const [attempt, mode] of [['allowBefore', 'allow'], ['block', 'block'], ['allowAfter', 'allow']]) {
      const revision = await applyEntry({ mode });
      for (const [kind, host, path, worker] of firefoxTargets) {
        const attempts = firefoxAttempts.get(kind);
        await inEntryTab(fox, async tab => {
          await checkEntry(`firefox: ${kind} ${attempt} control`, async () => {
            const url = `https://${host}${path}`;
            if (mode === 'block') {
              const result = await probeBlocked(tab, host, path);
              attempts[attempt] = { revision, ...result, outcome: 'unconfirmed' };
              assert.equal(result.network, 'NS_ERROR_ABORT', 'target top-level fetch must abort');
              assert.equal(result.commits, 0);
              assert.equal(result.requests, 0);
              return;
            }
            const before = proxy.documents(host, path);
            try {
              await navigate(tab, path, host);
              await eventually('Firefox Allow commit listener control', () => tab.commits.has(url));
              assert.equal(await currentUrl(tab), url);
              if (worker) assert.equal(await tab.driver.getTitle(), 'Worker response');
              else assert.equal(await visible(tab, '#fixture-anchor'), true);
            } finally {
              attempts[attempt] = {
                revision, commits: tab.commits.get(url) ?? 0,
                requests: proxy.documents(host, path) - before,
              };
            }
            assert.equal(attempts[attempt].commits, 1);
            assert.equal(attempts[attempt].requests, worker ? 0 : 1);
            attempts[attempt].outcome = worker ? 'worker-document' : 'fixture-document';
          });
        });
      }
    }
    for (const [kind] of firefoxTargets) {
      await checkEntry(`firefox: block ${kind} native outcome`, async () => {
        const { allowBefore, block, allowAfter } = firefoxAttempts.get(kind);
        assert.ok(allowBefore?.outcome && allowAfter?.outcome && block, 'incomplete Allow–Block–Allow comparison');
        assert.ok(allowBefore.revision < block.revision && block.revision < allowAfter.revision);
        assert.equal(block.network, 'NS_ERROR_ABORT');
        assert.equal(block.commits, 0);
        assert.equal(block.requests, 0);
        block.outcome = 'blocked';
        (results.firstDocuments ??= {})[`firefox-block-${kind}`] = block;
      });
    }
    await check('apply automatic visit Pause', () =>
      applyEntry({ mode: 'pause', seconds: 8, finish: 'auto', frequency: 'visit' }));
    for (const [name, browser] of engines) {
      await inEntryTab(browser, async tab => {
        const path = `/watch?id=73&auto=${name}`;
        const url = `https://www.youtube.com${path}`;
        const trace = (results.autoTrace ??= {})[name] = {};
        let start;
        let ready = await checkEntry(`${name}: auto Pause displayed`, async () => {
          await navigate(tab, '/safe', 'outside.test');
          start = Date.now();
          await navigate(tab, path);
          await waitForPause(tab, url);
          assert.equal(proxy.documents('www.youtube.com', path), 0);
          if (tab.context) {
            const { tabId } = await tab.cdp.send('Target.getTargetInfo').then(({ targetInfo }) =>
              tab.setup.evaluate(async target => {
                const tabs = await chrome.tabs.query({});
                return { tabId: tabs.find(item => item.url === target)?.id };
              }, targetInfo.url));
            trace.tabIdFound = tabId !== undefined;
            const generations = new Set();
            const initial = await chromiumPassState(tab, tabId);
            if (initial.nonce) generations.add(initial.nonce);
            trace.initial = { pending: initial.pending, installed: initial.installed };
            const interval = setInterval(() => {
              chromiumPassState(tab, tabId).then(state => {
                if (state.installed) trace.passInstalled = true;
                if (!state.pending) trace.pendingCleared = true;
                if (state.nonce) generations.add(state.nonce);
                trace.pendingGenerations = generations.size;
              }).catch(() => {});
            }, 100);
            tab.stopTrace = () => clearInterval(interval);
          }
        });
        ready = await checkEntry(`${name}: auto destination commit after timer`, async () => {
          try {
            await verifyDestination(tab, 'www.youtube.com', path);
            trace.elapsedMs = Date.now() - start;
            assert(trace.elapsedMs >= 8000);
          } finally {
            trace.commits = tab.commits.get(url) ?? 0;
            trace.requests = proxy.documents('www.youtube.com', path);
            const current = await currentUrl(tab).catch(() => '');
            trace.location = current === url ? 'destination' : current === entryUrl(tab, url) ? 'pause' : 'other';
            if (tab.context && trace.location === 'pause') {
              trace.countdown = await tab.page.getByLabel('Time remaining').textContent().catch(() => 'unavailable');
            }
            tab.stopTrace?.();
          }
        }, ready);
        ready = await checkEntry(`${name}: visit pass permits same-site navigation`, async () => {
          await navigate(tab, path, 'youtube.com');
          await verifyDestination(tab, 'youtube.com', path);
        }, ready);
        await checkEntry(`${name}: visit pass ends when tab leaves`, async () => {
          await navigate(tab, '/safe', 'outside.test');
          await navigate(tab, path);
          await waitForPause(tab, url);
          assert.equal(proxy.documents('www.youtube.com', path), 1);
        }, ready);
      });
    }
    if (entryFailures.length) {
      results.entryFailures = entryFailures.map(({ label, error }) => ({ check: label, error: error.name }));
      step = entryFailures[0].label;
      throw new AggregateError(entryFailures.map(({ error }) => new Error(error.name)), 'Entry qualification failed');
    }
  } else {
  await check('enable once and grant only Chromium', async () => {
    await admin('rule', String((await state()).revision), 'true');
    await setupAction(chrome, 'select'); await grant(chrome, false);
    await chrome.setup.getByText('Access not granted', { exact: true }).waitFor();
    await eventually('denied origin remains ungranted', async () => (await state()).profiles.find(p => p.id === chromeId)?.origins.length === 0);
    await navigate(chrome); await fixture(chrome, false);
    await grant(chrome);
    await ack(chromeId, (await state()).revision, youtubeOrigins);
    await navigate(chrome); await navigate(fox); await fixture(chrome, true); await fixture(fox, false);
  });
  await check('grant Firefox and protect ordinary content on each alias', async () => {
    await setupAction(fox, 'select'); await grant(fox);
    await ack(foxId, (await state()).revision, youtubeOrigins);
    for (const browser of [chrome, fox]) {
      for (const host of ['youtube.com', 'www.youtube.com', 'm.youtube.com']) {
        await navigate(browser, '/', host);
        await fixture(browser, true);
      }
      await navigate(browser, '/', 'youtu.be');
      await fixture(browser, false);
      await navigate(browser, '/watch?v=ordinary');
      await fixture(browser, false);
      await verifyPlayback(browser);
      await navigate(browser, '/shorts/direct');
      await fixture(browser, false);
      await verifyPlayback(browser);
    }
  });
  await check('partial origin revocation restores only that origin', async () => {
    await navigate(chrome); await navigate(fox);
    await fixture(chrome, true); await fixture(fox, true);
    await removeOrigin(chrome, 'https://www.youtube.com/*');
    await eventually('partial grant acknowledged', async () => {
      const p = (await state()).profiles.find(p => p.id === chromeId);
      return p && !p.origins.includes('https://www.youtube.com/*') && p.origins.includes('http://www.youtube.com/*');
    });
    await fixture(chrome, false);
    await fixture(fox, true);
    await navigate(chrome, '/', 'm.youtube.com');
    await fixture(chrome, true);
    results.partialAccess = [
      { browser: 'Chromium', origin: 'https://www.youtube.com/*', shorts: 'restored on the open tab' },
      { browser: 'Chromium', origin: 'https://m.youtube.com/*', shorts: 'still hidden' },
      { browser: 'Firefox', origin: 'https://www.youtube.com/*', shorts: 'still hidden' },
    ];
  });
  await check('regrant and restart Chromium with the enabled rule', async () => {
    await setupAction(chrome, 'select'); await grant(chrome);
    await ack(chromeId, (await state()).revision, youtubeOrigins);
    await chrome.context.close(); chrome = null;
    chrome = await chromiumStart();
    await ack(chromeId, (await state()).revision, youtubeOrigins);
    await navigate(chrome); await fixture(chrome, true);
  });
  await check('host unavailable preserves last policy', async () => {
    await writeFile(offline, 'offline');
    assert(await killHosts() >= 2, 'Expected to stop both verified disposable native hosts');
    await eventually('both bridge leases expired', async () => (await state()).profiles.filter(profile => [chromeId, foxId].includes(profile.id) && !profile.online).length === 2);
    await navigate(chrome); await fixture(chrome, true);
    await navigate(fox); await fixture(fox, true);
    await rm(offline);
    await eventually('both bridges reconnect', async () => (await state()).profiles.filter(profile => [chromeId, foxId].includes(profile.id) && profile.online).length === 2);
  });
  await check('disable restores pages in both connected browsers', async () => {
    await fixture(chrome, true); await fixture(fox, true);
    await admin('rule', String((await state()).revision), 'false');
    await fixture(chrome, false); await fixture(fox, false);
    await admin('rule', String((await state()).revision), 'true');
    await fixture(fox, true);
  });
  await check('desktop unpair clears connected policy', async () => {
    await admin('revoke', foxId);
    await eventually('revoked profile restores page', async () => await visible(fox, '#shorts-shelf'));
    await fixture(fox, false);
  });
  await check('Firefox temporary reinstallation starts as a new installation', async () => {
    await fox.driver.quit(); fox = null;
    fox = await firefoxStart();
    const reinstalledId = await pair(fox, 'firefox', 'Fixture Firefox reinstalled');
    assert.notEqual(reinstalledId, foxId);
    assert.deepEqual((await state()).profiles.find(p => p.id === reinstalledId).origins, []);
    await navigate(fox); await fixture(fox, false);
  });
  }
  results.status = 'passed';
} catch (error) {
  // No browser page content, URLs, tokens, or screenshots are written to reports.
  results.failure = { step, message: error instanceof FixtureCommandError ? error.message : error.name || 'Error' };
  throw error;
} finally {
  if (chrome) await chrome.context.close().catch(() => {});
  if (fox) await fox.driver.quit().catch(() => {});
  await killHosts();
  if (proxy) await proxy.close();
  if (display) display.child.kill('SIGTERM');
  if (bus) bus.child.kill('SIGTERM');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  await rm(temp, { recursive: true, force: true });
}
