import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function command(path, args, env = {}) {
  return execFileSync(path, args, { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function admin(...args) { return command(adminBin, args, { FOCUS_DATA_DIR: data, FOCUS_FIXTURE_NO_DESKTOP: '1', FOCUS_FIXTURE_ENTRY: scenario === 'entry' ? '1' : '0' }); }
function state() { return JSON.parse(admin('state')); }
async function eventually(label, fn, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
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
  try {
    command(python, [join(root, 'tests/browser/firefox-ui.py'), ...args], {
      HOME: homes.firefox, DISPLAY: display.name, DBUS_SESSION_BUS_ADDRESS: bus.address,
    });
  } catch (error) {
    throw new Error(error.stderr?.trim() || 'Firefox setup input failed');
  }
}
function prompt(key) {
  command('xdotool', ['key', '--clearmodifiers', key], { DISPLAY: display.name });
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
    results.browsers.chromium = command(chromium.executablePath(), ['--version']).trim();
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${chromiumId}/setup.html`);
    return { context, setup, page: await context.newPage() };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}
async function firefoxStart() {
  const options = new firefox.Options();
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
    focusWindow('firefox');
    prompt('ctrl+l');
    command('xdotool', ['type', '--clearmodifiers', `moz-extension://${firefoxUuid}/setup.html`], { DISPLAY: display.name });
    prompt('Return');
    firefoxUi('wait', 'entry', 'Profile label');
    return { driver, page };
  } catch (error) {
    await driver.quit().catch(() => {});
    throw error;
  }
}
function focusWindow(windowClass) {
  const env = { DISPLAY: display.name };
  const windows = command('xdotool', ['search', '--onlyvisible', '--class', windowClass], env).trim().split(/\s+/);
  command('xdotool', ['windowraise', windows.at(-1)], env);
  command('xdotool', ['windowfocus', '--sync', windows.at(-1)], env);
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
  focusWindow('firefox');
  firefoxUi('click', 'page tab', 'focus. browser setup');
  if (action === 'label') firefoxUi('fill', 'entry', 'Profile label', value);
  if (action === 'connect') firefoxUi('click', 'push button', 'Connect to focus.');
  if (action === 'select') firefoxUi('check', 'check box', 'YouTube');
  if (action === 'grant') firefoxUi('click', 'push button', 'Grant access');
}
async function grant(browser, accept = true) {
  // The button calls permissions.request from the actual extension's direct
  // user gesture. Xvfb is private to this run; no user's desktop is touched.
  if (!browser.context) {
    await setupAction(browser, 'grant');
    if (accept) firefoxUi('click', 'push button', 'Allow|Add');
    else prompt('Escape');
    return;
  }
  await browser.setup.bringToFront();
  const click = setupAction(browser, 'grant');
  await sleep(1000);
  focusWindow('chrome|chromium');
  if (accept) prompt('Tab');
  prompt(accept ? 'Return' : 'Escape');
  await click;
}
async function pair(browser, browserId, label, approve = true) {
  await setupAction(browser, 'browser', browserId);
  await setupAction(browser, 'label', label);
  await setupAction(browser, 'connect');
  const pending = await eventually(`${label} pairing request`, () => state().pending.find(p => p.label === label));
  admin(approve ? 'approve' : 'deny', pending.id);
  if (!approve) {
    await eventually(`${label} denied`, () => !state().pending.some(p => p.id === pending.id));
    return;
  }
  const profile = await eventually(`${label} paired`, () => state().profiles.find(p => p.label === label && p.online));
  assert.equal(profile.browser, browserId);
  return profile.id;
}
async function navigate(browser, path = '/', host = 'www.youtube.com') {
  const url = `https://${host}${path}`;
  if (browser.context) await browser.page.goto(url, { waitUntil: 'domcontentloaded' });
  else { await browser.driver.switchTo().window(browser.page); await browser.driver.get(url); }
}
async function currentUrl(browser) {
  return browser.context ? browser.page.url() : browser.driver.getCurrentUrl();
}

async function clickSite(browser, id) {
  await eventually('site document has committed and its control is visible', () => visible(browser, `#${id}`));
  if (browser.context) await browser.page.locator(`#${id}`).click();
  else await (await browser.driver.findElement(By.id(id))).click();
}

async function continueEntry(browser) {
  if (browser.context) {
    await browser.page.getByRole('button', { name: 'Continue' }).click({ timeout: 20000 });
  } else {
    focusWindow('firefox');
    firefoxUi('enabled', 'push button', 'Continue');
    firefoxUi('click', 'push button', 'Continue');
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
  await eventually('current acknowledged grants', () => {
    const profile = state().profiles.find(p => p.id === id);
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
    await mkdir(join(temp, browser)); command('unzip', ['-q', archive, '-d', join(temp, browser)]);
  }
  await nativeRegistration('chromium', chromiumId);
  await nativeRegistration('firefox', 'focus@focus-local');
  command(executable('web-ext'), ['lint', '--source-dir', join(temp, 'firefox'), '--no-input']);
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
    const initial = state();
    assert.equal(initial.hideShorts, false);
    for (const id of [chromeId, foxId]) assert.deepEqual(initial.profiles.find(p => p.id === id).origins, []);
    await navigate(chrome); await navigate(fox); await fixture(chrome, false); await fixture(fox, false);
  });
  if (scenario === 'entry') {
    for (const [name, browser, id] of [['chromium', chrome, chromeId], ['firefox', fox, foxId]]) {
      await check(`${name}: grant access and measure Allow`, async () => {
        await setupAction(browser, 'select'); await grant(browser);
        await ack(id, state().revision, youtubeOrigins);
        const path = `/watch?id=73&allow=${name}`;
        await navigate(browser, path);
        assert.equal(proxy.documents('www.youtube.com', path), 1);
      });
    }
    for (const enabled of [true, false]) {
      await check(`grayscale ${enabled ? 'applies' : 'reverses'} in both profiles`, async () => {
        admin('grayscale', String(state().revision), 'youtube', String(enabled));
        await ack(chromeId, state().revision, youtubeOrigins);
        await ack(foxId, state().revision, youtubeOrigins);
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
        await navigate(browser, path, 'm.youtube.com');
        const title = browser.context ? await browser.page.title() : await browser.driver.getTitle();
        assert.equal(title, 'Worker response');
        assert.equal(proxy.documents('m.youtube.com', path), 0);
        await navigate(browser);
      }
    });
    const entryFailures = [];
    async function checkEntry(label, run) {
      try { await check(label, run); }
      catch (error) { entryFailures.push({ label, error }); }
    }
    for (const mode of ['pause', 'block']) {
      await check(`apply ${mode} policy`, async () => {
        admin('entry', String(state().revision), 'youtube', JSON.stringify(mode === 'pause'
          ? { mode, seconds: 5, finish: 'manual', frequency: 'page' } : { mode }));
        await ack(chromeId, state().revision, youtubeOrigins);
        await ack(foxId, state().revision, youtubeOrigins);
        if (mode === 'pause') for (const browser of [chrome, fox]) {
          await eventually('already-open gated document is replaced', async () => {
            if (browser.context) return browser.page.url().includes('/entry.html#');
            await browser.driver.switchTo().window(browser.page);
            return (await browser.driver.getCurrentUrl()).includes('/entry.html#');
          });
        }
      });
      if (mode === 'pause') for (const [name, browser] of [['chromium', chrome], ['firefox', fox]]) {
        await checkEntry(`${name}: pause intercepts service-worker-controlled documents`, async () => {
          const path = `/worker-navigation?pause=${name}`;
          await navigate(browser, path, 'm.youtube.com');
          const url = await currentUrl(browser);
          (results.workerInterception ??= {})[name] = url.includes('/entry.html#');
          assert.match(url, /-extension:\/\/[^/]+\/entry\.html#/);
          assert.equal(new URL(url).hash.slice(1), `https://m.youtube.com${path}`);
        });
      }
      if (mode === 'pause') for (const [name, browser] of [['chromium', chrome], ['firefox', fox]]) {
        await checkEntry(`${name}: one-page pass does not follow a gated redirect`, async () => {
          const query = `?id=redirect&engine=${name}`;
          const from = `/fixture-redirect${query}`;
          const to = `/watch${query}`;
          await navigate(browser, from, 'youtu.be');
          assert.equal(proxy.documents('youtu.be', from), 0);
          await continueEntry(browser);
          await eventually('redirect destination has its own interstitial', async () =>
            new URL(await currentUrl(browser)).hash === `#https://www.youtube.com${to}`);
          assert.equal(proxy.documents('youtu.be', from), 1);
          assert.equal(proxy.documents('www.youtube.com', to), 0);
        });
      }
      for (const [name, browser] of [['chromium', chrome], ['firefox', fox]]) {
        await checkEntry(`${name}: ${mode} makes zero destination document requests`, async () => {
          const path = `/watch?id=73&${mode}=${name}`;
          if (mode === 'block') {
            await navigate(browser, path).catch(() => {}); // Native blocked pages may reject navigation.
          } else {
            await navigate(browser, path);
            const url = browser.context ? browser.page.url() : await browser.driver.getCurrentUrl();
            assert.match(url, /-extension:\/\/[^/]+\/entry\.html#/);
            assert.equal(new URL(url).hash.slice(1), `https://www.youtube.com${path}`);
          }
          const count = proxy.documents('www.youtube.com', path);
          (results.documentRequests ??= {})[`${name}-${mode}`] = count;
          assert.equal(count, 0);
          if (mode === 'pause') {
            const secondPath = `/watch?id=73&second=${name}`;
            if (browser.context) {
              const second = await browser.context.newPage();
              await second.goto(`https://www.youtube.com${secondPath}`, { waitUntil: 'domcontentloaded' });
              assert.match(second.url(), /-extension:\/\/[^/]+\/entry\.html#/);
              await second.close();
            } else {
              await browser.driver.switchTo().newWindow('tab');
              await browser.driver.get(`https://www.youtube.com${secondPath}`);
              assert.match(await browser.driver.getCurrentUrl(), /-extension:\/\/[^/]+\/entry\.html#/);
              await browser.driver.close();
              await browser.driver.switchTo().window(browser.page);
            }
            assert.equal(proxy.documents('www.youtube.com', secondPath), 0);
          }
          if (mode === 'pause') {
            await continueEntry(browser);
            await eventually('resumed destination commits and is ready for interaction', async () =>
              (await currentUrl(browser)) === `https://www.youtube.com${path}` &&
              proxy.documents('www.youtube.com', path) === 1 && await visible(browser, '#fixture-anchor'));
            const spaPath = `/watch?id=spa&engine=${name}`;
            await clickSite(browser, 'fixture-anchor');
            await eventually('anchor navigation does not start a new Pause', async () =>
              (await currentUrl(browser)) === `https://www.youtube.com${path}#comments`);
            assert.equal(proxy.documents('www.youtube.com', path), 1);
            await clickSite(browser, 'spa-route');
            await eventually('page-mode SPA route requires another pause', async () => {
              const url = await currentUrl(browser);
              assert.match(url, /-extension:\/\/[^/]+\/entry\.html#/);
              assert.equal(new URL(url).hash, `#https://www.youtube.com${spaPath}`);
              return true;
            });
            assert.equal(proxy.documents('www.youtube.com', spaPath), 0);
            await continueEntry(browser);
            await eventually('SPA destination resumes as a fresh document', async () =>
              (await currentUrl(browser)) === `https://www.youtube.com${spaPath}` &&
              await visible(browser, '#spa-route'));
            assert.equal(proxy.documents('www.youtube.com', spaPath), 1);
            if (browser.context) await browser.page.reload({ waitUntil: 'domcontentloaded' });
            else await browser.driver.navigate().refresh();
            await eventually('page-mode reload requires another Pause', async () =>
              (await currentUrl(browser)).includes(`/entry.html#https://www.youtube.com${spaPath}`));
            assert.equal(proxy.documents('www.youtube.com', spaPath), 1);
          }
        });
      }
    }
    for (const browser of [chrome, fox]) {
      // Auto must start from an outside page, not an existing gate switched to Auto.
      await navigate(browser, '/safe', 'outside.test');
    }
    await check('apply automatic visit Pause', async () => {
      admin('entry', String(state().revision), 'youtube', JSON.stringify({ mode: 'pause', seconds: 8, finish: 'auto', frequency: 'visit' }));
      await ack(chromeId, state().revision, youtubeOrigins);
      await ack(foxId, state().revision, youtubeOrigins);
    });
    for (const [name, browser] of [['chromium', chrome], ['firefox', fox]]) {
      await checkEntry(`${name}: auto opens after waiting and visit ends upon leaving`, async () => {
        const path = `/watch?id=73&auto=${name}`;
        const start = Date.now();
        await navigate(browser, path);
        assert.equal(proxy.documents('www.youtube.com', path), 0);
        await eventually('auto-resume commits the original document', async () =>
          (await currentUrl(browser)) === `https://www.youtube.com${path}` && proxy.documents('www.youtube.com', path) === 1);
        assert(Date.now() - start >= 8000);
        await navigate(browser, path, 'youtube.com');
        assert.equal(proxy.documents('youtube.com', path), 1);
        await navigate(browser, '/safe', 'outside.test');
        await navigate(browser, path);
        assert.equal(proxy.documents('www.youtube.com', path), 1);
        assert.match(await currentUrl(browser), /-extension:\/\/[^/]+\/entry\.html#/);
      });
    }
    if (entryFailures.length) {
      results.entryFailures = entryFailures.map(({ label, error }) => ({ check: label, error: error.name }));
      step = entryFailures[0].label;
      throw new AggregateError(entryFailures.map(({ error }) => error), 'Entry qualification failed');
    }
  } else {
  await check('enable once and grant only Chromium', async () => {
    admin('rule', String(state().revision), 'true');
    await setupAction(chrome, 'select'); await grant(chrome, false);
    await chrome.setup.getByText('Access not granted', { exact: true }).waitFor();
    await eventually('denied origin remains ungranted', () => state().profiles.find(p => p.id === chromeId)?.origins.length === 0);
    await navigate(chrome); await fixture(chrome, false);
    await grant(chrome);
    await ack(chromeId, state().revision, youtubeOrigins);
    await navigate(chrome); await navigate(fox); await fixture(chrome, true); await fixture(fox, false);
  });
  await check('grant Firefox and protect ordinary content on each alias', async () => {
    await setupAction(fox, 'select'); await grant(fox);
    await ack(foxId, state().revision, youtubeOrigins);
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
    await eventually('partial grant acknowledged', () => {
      const p = state().profiles.find(p => p.id === chromeId);
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
    await ack(chromeId, state().revision, youtubeOrigins);
    await chrome.context.close(); chrome = null;
    chrome = await chromiumStart();
    await ack(chromeId, state().revision, youtubeOrigins);
    await navigate(chrome); await fixture(chrome, true);
  });
  await check('host unavailable preserves last policy', async () => {
    await writeFile(offline, 'offline');
    assert(await killHosts() >= 2, 'Expected to stop both verified disposable native hosts');
    await eventually('both bridge leases expired', () => state().profiles.filter(profile => [chromeId, foxId].includes(profile.id) && !profile.online).length === 2);
    await navigate(chrome); await fixture(chrome, true);
    await navigate(fox); await fixture(fox, true);
    await rm(offline);
    await eventually('both bridges reconnect', () => state().profiles.filter(profile => [chromeId, foxId].includes(profile.id) && profile.online).length === 2);
  });
  await check('disable restores pages in both connected browsers', async () => {
    await fixture(chrome, true); await fixture(fox, true);
    admin('rule', String(state().revision), 'false');
    await fixture(chrome, false); await fixture(fox, false);
    admin('rule', String(state().revision), 'true');
    await fixture(fox, true);
  });
  await check('desktop unpair clears connected policy', async () => {
    admin('revoke', foxId);
    await eventually('revoked profile restores page', async () => await visible(fox, '#shorts-shelf'));
    await fixture(fox, false);
  });
  await check('Firefox temporary reinstallation starts as a new installation', async () => {
    await fox.driver.quit(); fox = null;
    fox = await firefoxStart();
    const reinstalledId = await pair(fox, 'firefox', 'Fixture Firefox reinstalled');
    assert.notEqual(reinstalledId, foxId);
    assert.deepEqual(state().profiles.find(p => p.id === reinstalledId).origins, []);
    await navigate(fox); await fixture(fox, false);
  });
  }
  results.status = 'passed';
} catch (error) {
  // No browser page content, URLs, tokens, or screenshots are written to reports.
  results.failure = { step, message: error.name || 'Error' };
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
