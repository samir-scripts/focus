const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const evidence = process.argv[2];
assert.ok(evidence, 'Pass a local evidence directory');
fs.mkdirSync(evidence, { recursive: true });
const root = path.resolve(__dirname, '../../..');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const name of fs.readdirSync(__dirname).filter(name => name.endsWith('.md'))) {
  const input = fs.readFileSync(path.join(__dirname, name), 'utf8');
  for (const [, target] of input.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(__dirname, target.split('#')[0])), `${name}: broken link ${target}`);
  }
  for (const line of input.split('\n')) {
    const reference = line.match(/^\| \[[^\]]+\]\(([^)]+)\).*`([a-f0-9]{64})`/);
    if (reference) assert.equal(hash(path.resolve(__dirname, reference[1])), reference[2], reference[1]);
  }
}
async function main() {
  const browser = await chromium.launch({executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const context = await browser.newContext({viewport:{width:960,height:640},offline:true,colorScheme:'light'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (!request.url().startsWith('file:')) errors.push(request.url());});
    await page.goto(pathToFileURL(path.join(__dirname,'proof.html')).href);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    async function assertFont(selector, expected) {
      await page.evaluate(() => document.fonts.ready);
      const {root:{nodeId}} = await cdp.send('DOM.getDocument');
      const {nodeId:target} = await cdp.send('DOM.querySelector',{nodeId,selector});
      const {fonts} = await cdp.send('CSS.getPlatformFontsForNode',{nodeId:target});
      assert.ok(fonts.length && fonts.every(font => font.isCustomFont && font.glyphCount > 0), `${selector}: ${JSON.stringify(fonts)}`);
      const face = await page.locator(selector).evaluate(node => {const style=getComputedStyle(node);return `${style.fontFamily.split(',')[0].replace(/["']/g,'')} ${style.fontWeight}`;});
      assert.equal(face, expected);
    }
    const select = (name,value) => page.locator(`#${name}`).selectOption(value);
    const view = name => page.locator(`[data-view=${name}]`).click();
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    const shot = name => page.screenshot({path:path.join(evidence,`${name}.png`),animations:'disabled'});
    await assertFont('#heading','Focus Bitmap Solid 800');
    assert.deepEqual(await page.locator('#swatches small').allTextContents(), ['Canvas', 'Rail', 'Text ink', 'Action', 'Secondary']);
    const resolved = await page.evaluate(() => Object.fromEntries(Object.keys(palettes).map(id => [id,{light:paletteRoles(id,false),dark:paletteRoles(id,true)}])));
    assert.deepEqual(resolved, require('./palette.json'), 'Resolved palette manifest diverges from source');
    await assertFont('.wordmark','Focus Bitmap Wordmark 700');
    await assertFont('.title-row p','Focus Bitmap 400');
    await assertFont('.sample strong','Focus Bitmap 700');
    const ids = await page.locator('#light option').evaluateAll(options=>options.map(option=>option.value));
    assert.equal(ids.length,7);
    for (const mode of ['light','dark']) {
      await select('mode',mode);
      for (const id of ids) {
        await select(mode,id);
        for (const name of ['settings','sites']) {
          await view(name); await noOverflow();
          if (name === 'sites') {
            for (const target of [page.getByRole('checkbox',{name:/Hide suggested feeds/}),page.locator('#browser-settings')]) {
              const bounds = await target.boundingBox();
              assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 640, 'Required Sites control below fold');
            }
            assert.ok(await page.getByRole('radio',{name:/Pause/}).isDisabled());
          }
          const result=await page.evaluate(({id,mode})=>{
            const roles=paletteRoles(id,mode==='dark');const css=getComputedStyle(document.documentElement);
            const lum=hex=>{const v=hex.slice(1).match(/../g).map(pair=>parseInt(pair,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
            const contrast=(a,b)=>{const x=lum(roles[a]),y=lum(roles[b]);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
            const backgrounds=['canvas','surface','rail','selected'];
            return {palette:document.documentElement.dataset.activePalette,
              computed:Object.entries(roles).every(([role,value])=>css.getPropertyValue('--'+role).trim()===value),
              text:Math.min(...backgrounds.flatMap(bg=>[contrast('ink',bg),contrast('muted',bg)]),contrast('accent','on-accent')),
              boundary:Math.min(...backgrounds.flatMap(bg=>[contrast('edge',bg),contrast('accent',bg)]))};
          },{id,mode});
          assert.equal(result.palette,id);assert.ok(result.computed);
          assert.ok(result.text>=4.5,`${mode}/${id} text ${result.text}`);assert.ok(result.boundary>=3,`${mode}/${id} boundary ${result.boundary}`);
          assert.ok(await page.locator('.art').isVisible());
          await shot(`${mode}-${id}-${name}`);
        }
      }
    }
    await select('mode','system');await select('light','plum');await select('dark','cobalt');
    for(const [scheme,id] of [['light','plum'],['dark','cobalt']]){
      await page.emulateMedia({colorScheme:scheme});
      await page.waitForFunction(id=>document.documentElement.dataset.activePalette===id,id);
    }
    assert.equal(await page.locator('#light').inputValue(),'plum');assert.equal(await page.locator('#dark').inputValue(),'cobalt');
    await select('source','incumbent');
    for(const mode of ['light','dark']){
      assert.equal(await page.locator(`#${mode} option`).count(),3);
      await select('mode',mode);
      for(const id of ['sage','cobalt','plum']){
        await select(mode,id);
        for(const name of ['settings','sites']){
          await view(name);
          assert.ok(await page.evaluate(mode=>{const root=document.documentElement,css=getComputedStyle(root);return !root.style.getPropertyValue('--canvas')&&css.getPropertyValue('--canvas').trim()===css.getPropertyValue(`--${mode}-paper`).trim();},mode));
          await shot(`incumbent-${mode}-${id}-${name}`);
        }
      }
    }
    await select('source','proposed');await select('mode','light');await view('home');
    await assertFont('#heading','Focus Bitmap Display 800');
    await page.getByRole('button',{name:'November 26',exact:true}).click();
    assert.equal(await page.locator('#day').textContent(),'Selected: November 26');
    await shot('home-960');
    for(const [width,scale] of [[635,1],[480,2]]){
      // At 200% a 960-CSS-pixel viewport presents 480 CSS pixels of layout.
      await page.setViewportSize({width,height:640/scale});
      for(const name of ['settings','sites','home']){
        await view(name);await noOverflow();await shot(`${name}-${width}-css`);
      }
    }
    assert.deepEqual(errors,[]);
    const inputs=['proof.html','palette.js'].map(name=>path.join(__dirname,name)).concat(['packages/ui/src/tokens.css',...['Regular','Bold','Display','DisplaySolid','Wordmark'].map(name=>`packages/ui/src/assets/FocusBitmap-${name}.ttf`)].map(name=>path.join(root,name)));
    fs.writeFileSync(path.join(evidence,'proof-sha256.txt'),inputs.map(file=>`${hash(file)}  ${path.relative(root,file)}`).join('\n')+'\n');
    const summary=`Chrome ${browser.version()}: PASS\n28 proposed + 12 incumbent Settings/Sites captures\nSystem switching preserves independent slots\nFive production bitmap faces painted; no network requests\nContrast, tracked links and reference hashes verified\n960 / 635 / 480 CSS px layouts; 480 models 200% reflow\nHome calendar fixture responds to selection`;
    const report=await context.newPage();
    await report.setContent('<title>Packet 00 verification</title><pre></pre>');
    await report.locator('pre').evaluate((node,text)=>{node.style.cssText='font:18px/1.6 monospace; padding:24px';node.textContent=text;},summary);
    await report.screenshot({path:path.join(evidence,'verification.png')});
    console.log(summary);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
