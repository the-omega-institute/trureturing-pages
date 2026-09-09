/* Real HTTP/browser coverage; run against a generated preview or deployed Pages. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const root = (process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8766').replace(/\/$/, '') + '/';
const route = path => root + path;
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors = [], links = new Set();
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  async function open(path, selector = '.mm-heading h1') {
    const response = await page.goto(route(path), {waitUntil:'domcontentloaded'});
    assert.equal(response.status(), 200, path);
    await page.locator(selector).first().waitFor();
    await page.locator('.site-language select').waitFor();
  }
  async function english() {
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    const han = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), found = [];
      while (walker.nextNode()) {
        const n=walker.currentNode;
        if (!n.parentElement.closest('script,style,textarea,code,pre,.katex,math,.site-language,[data-i18n-original]') && /\p{Script=Han}/u.test(n.textContent)) found.push(n.textContent);
      }
      for(const n of document.querySelectorAll('[title],[aria-label],[placeholder]')) if(!n.closest('.site-language')) for(const k of ['title','aria-label','placeholder']) if(/\p{Script=Han}/u.test(n.getAttribute(k)||''))found.push(n.getAttribute(k));
      return found;
    });
    assert.deepEqual(han, [], 'English rendered content: '+page.url());
    for (const href of await page.locator('a[href]').evaluateAll(nodes => nodes.filter(n=>!n.download).map(n=>new URL(n.getAttribute('href'), location.href).href))) if(href.startsWith(root)) links.add(href);
  }
  try {
    for(const id of ['rh','pnp','hodge','navier-stokes','yang-mills','bsd','poincare']) {
      await open(`millennium.html?problem=${id}`); await english();
      assert.equal(await page.locator('.mm-problems>a').count(),7);
      assert.equal(await page.locator('header nav [aria-current="page"]').innerText(),'Conjectures');
      if(id!=='rh')assert.equal(await page.locator('.mm-node').count(),3);
    }
    await open('millennium.html?problem=rh&view=catalogue');
    assert.equal(await page.locator('.mm-spec-card').count(),93); await english();
    const data = await (await context.request.get(route('assets/millennium-data.json'))).json();
    for(const [id] of data.problems[0].catalogue) {
      await open(`millennium.html?problem=rh&node=${id}`);
      await english();
      assert.ok(await page.locator('#mm-detail h2').innerText(),id);
    }
    await open('millennium.html?problem=rh&node=A045&family=F08&view=map&specs=1#details');
    const title = await page.locator('#mm-detail h2').innerText();
    await page.locator('#mm-note-text').fill('研究笔记 T(x)=x — keep this original.');
    await page.locator('.site-language select').selectOption('zh-CN');
    await page.waitForURL('**lang=zh-CN#details');await page.locator('.mm-heading h1').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    assert.equal(await page.locator('#mm-family').inputValue(),'F08');
    assert.equal(new URL(page.url()).searchParams.get('node'),'A045');
    assert.equal(await page.locator('#mm-note-text').inputValue(),'研究笔记 T(x)=x — keep this original.');
    assert.match(await page.locator('#mm-detail').innerText(),/此表述/);
    await page.locator('.site-language select').selectOption('en');
    await page.waitForURL('**lang=en#details');await page.locator('.mm-heading h1').waitFor();
    assert.equal(await page.locator('#mm-detail h2').innerText(),title);
    await page.getByRole('button',{name:'Shared core',exact:true}).click();
    await page.locator('[data-mm-node="zeros"]').click();
    assert.match(await page.locator('#mm-detail .mm-eyebrow').innerText(),/zeros/);
    await page.goBack(); assert.match(await page.locator('#mm-detail .mm-eyebrow').innerText(),/GOAL \/ rh/);
    await english();
    for(const [path, selector] of [
      ['conjectures.html#next-questions','.mm-entry-cards'], ['research.html','.news-results-grid'],
      ['discover.html','.discovery'], ['atlas.html','.atlas-app'],
      ['knowledge/','main'], ['evolution.html','main'], ['library-history.html','main'],
      ['library-version.html','main'], ['conclusions.html','main'], ['dag.html','main'],
      ['research/base-phi-negative-prefix-trident/','main'],
      ['knowledge/node/35b9ed520bf5997fd92ed38277ff38290799a1eb64af4b31738a853ddaaf7d4c/','main']
    ]) {
      await open(path, selector); await english();
      assert.deepEqual(await page.locator('body > header nav a').allTextContents(),['Explore','Research','Conjectures','Library','Evolution'],path);
    }
    await open('conjectures.html?lang=zh-CN#next-questions','.mm-entry-cards');
    const navier=page.locator('.mm-entry-cards a[href*="navier-stokes"]');
    assert.equal(new URL(await navier.getAttribute('href'), page.url()).searchParams.get('lang'),'zh-CN');
    await navier.click();await page.locator('.mm-heading').waitFor();assert.match(await page.locator('.mm-heading h1').innerText(),/纳维/);
    await page.locator('body > header nav a[href*="research.html"]').click();await page.locator('.site-language select').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('lang'),'zh-CN');
    assert.equal(await page.locator('body > header nav [aria-current="page"]').innerText(),'研究动态');
    // A language preference survives direct navigation without a lang parameter.
    await open('millennium.html?problem=navier-stokes');assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    for(const width of [1440,900,700,390]) {
      await page.setViewportSize({width,height:900});
      const control=await page.locator('.site-language').boundingBox();assert.ok(control.x>=0&&control.x+control.width<=width);
      const nav=await page.locator('body > header nav').boundingBox();
      assert.ok(Math.abs(nav.x+nav.width/2-width/2)<1,`nav centered at ${width}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`no overflow at ${width}`);
      const brand=await page.locator('body > header .brand').boundingBox();
      assert.ok(brand.x+brand.width<=control.x || brand.y+brand.height<=control.y,`language does not overlap brand at ${width}`);
    }
    await page.screenshot({path:'/private/tmp/millennium-i18n-mobile.png',fullPage:true});
    const blocked = await browser.newContext();
    await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}));
    const bp=await blocked.newPage();await bp.goto(route('millennium.html?problem=navier-stokes&lang=zh-CN'));await bp.locator('.mm-heading').waitFor();
    assert.equal(await bp.locator('html').getAttribute('lang'),'zh-CN');assert.match(await bp.locator('#mm-message').innerText(),/不可用/);
    await bp.locator('.site-language select').selectOption('en');await bp.waitForURL('**lang=en');await bp.locator('.mm-heading').waitFor();
    assert.equal(await bp.locator('html').getAttribute('lang'),'en');await blocked.close();
    const failure=await browser.newContext(),fp=await failure.newPage();
    await fp.route('**/assets/locales/zh-CN.json',r=>r.fulfill({status:503,body:'unavailable'}));
    await fp.goto(route('millennium.html?problem=navier-stokes&lang=zh-CN'));await fp.locator('.mm-heading').waitFor();
    assert.equal(await fp.locator('html').getAttribute('lang'),'en');assert.match(await fp.locator('.language-warning').innerText(),/Translation unavailable/);
    await fp.route('**/assets/millennium-data.json',r=>r.fulfill({status:503,body:'unavailable'}));
    await fp.goto(route('millennium.html?lang=en'));await fp.locator('#mm-app[role="alert"]').waitFor();
    assert.match(await fp.locator('#mm-app').innerText(),/Research map unavailable/);await failure.close();
    assert.deepEqual(errors,[]);
    // Follow distinct owned HTML destinations collected from real, dynamic rendered anchors.
    const destinations=[...new Set([...links].map(h=>{const u=new URL(h);return /\.html$|\/$/.test(u.pathname)&&!u.pathname.includes('/api/v1/')?u.origin+u.pathname:null;}).filter(Boolean))];
    const bad=[];
    for(let i=0;i<destinations.length;i+=12)await Promise.all(destinations.slice(i,i+12).map(async href=>{const r=await context.request.get(href);if(r.status()!==200)bad.push([href,r.status()]);}));
    assert.deepEqual(bad,[]);
    console.log(`PASS: 7 maps, 93 individual RH routes, all catalogue entries, bilingual switching, navigation, notes, mobile, storage/loading failures; ${destinations.length} owned HTML destinations resolve.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
