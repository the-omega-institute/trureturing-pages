const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ATLAS_URL || 'http://127.0.0.1:8765/atlas.html';
const output = process.env.ATLAS_OUTPUT || 'artifacts/atlas-preview/knowledge';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: process.env.ATLAS_BROWSER_CHANNEL || 'chrome', headless: true });
  const errors = [], checks = [];
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    // Optional source overlay exercises local presentation against the unchanged,
    // digest-verified public data without rebuilding the release.
    if (process.env.ATLAS_LOCAL_PRESENTATION) await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.continue();
      const relative = /\/atlas(?:\.html)?$/.test(url.pathname) ? 'atlas.html' : url.pathname.replace(/^\//, '');
      if (!relative.startsWith('assets/') && relative !== 'atlas.html') return route.continue();
      const file = path.resolve(__dirname, '../../site', relative);
      if (!fs.existsSync(file)) return route.continue();
      return route.fulfill({ path: file, contentType: /\.(?:mjs|js)$/.test(file) ? 'text/javascript' : undefined });
    });
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(error.message));
    for (const lang of ['en', 'zh-CN']) {
      await page.goto(base + '?lang=' + lang, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.atlasDiagnostics, null, { timeout: 90000 });
      const initial = await page.evaluate(() => window.atlasDiagnostics());
      assert.equal(initial.mode, 'knowledge');
      assert.equal(await page.locator('.knowledge-topic').count(), initial.knowledge.topics);
      assert.equal(await page.locator('.knowledge-edge').count(), Math.min(12, initial.knowledge.pairs));
      assert.equal(await page.locator('[data-mode="knowledge"]').getAttribute('aria-pressed'), 'true');
      for (const width of [320, 390, 820, 1024, 1440, 1600]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}; };
          const cards = [...document.querySelectorAll('.knowledge-topic')].map(el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
          return { overflow: document.documentElement.scrollWidth > innerWidth, heading: rect('.atlas-heading'), search: rect('.search'), controls:rect('.view-controls'), cards,
            missing: [...document.querySelectorAll('.knowledge-topic-text strong')].some(el => !el.textContent.trim()) };
        });
        assert.equal(layout.overflow, false, `${lang}/${width}: horizontal overflow`);
        const overlap = (a,b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
        assert.equal(overlap(layout.heading,layout.search), false, `${lang}/${width}: heading/search overlap`);
        assert.equal(overlap(layout.search,layout.controls), false, `${lang}/${width}: search/tabs overlap`);
        for(let i=0;i<layout.cards.length;i++) for(let j=i+1;j<layout.cards.length;j++) assert.equal(overlap(layout.cards[i],layout.cards[j]),false,`${lang}/${width}: topic cards overlap`);
        assert.equal(layout.missing,false);
        if ([390,1440,1600].includes(width)) await page.screenshot({path:path.join(output,`${lang}-${width}.png`),fullPage:true});
        checks.push({lang,width,layout:true});
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('[data-topic="quantum"] .knowledge-topic-heading').click();
      assert.equal((await page.evaluate(()=>window.atlasDiagnostics())).knowledge.topic,'quantum');
      assert.ok(await page.locator('.knowledge-topic.is-active').isVisible());
      await page.locator('.knowledge-edge').first().focus();
      await page.locator('.knowledge-edge').first().press('Enter');
      assert.ok((await page.evaluate(()=>window.atlasDiagnostics())).knowledge.connection);
      assert.ok(await page.locator('.knowledge-import-pair').count());
      await page.screenshot({path:path.join(output,`${lang}-trace.png`),fullPage:true});
      // A module link opens a readable real neighborhood; the whole DAG stays available.
      await page.locator('.knowledge-import-pair .concept-row').first().click();
      await page.waitForFunction(()=>window.atlasDiagnostics().selected);
      const focused = await page.evaluate(()=>window.atlasDiagnostics());
      assert.equal(focused.mode,'theory'); assert.ok(focused.relatedNodes > 0);
      await page.screenshot({path:path.join(output,`${lang}-module.png`),fullPage:true});
      assert.ok(focused.nodes < initial.theory.nodes);
      await page.locator('[data-mode="knowledge"]').click();
      assert.equal((await page.evaluate(()=>window.atlasDiagnostics())).mode,'knowledge');
      await page.locator('#knowledge-reset').click();
      await page.locator('[data-mode="theory"]').click();
      const full = await page.evaluate(()=>window.atlasDiagnostics());
      assert.equal(full.nodes,initial.theory.nodes); assert.equal(full.edges,initial.theory.edges); assert.equal(full.visibleEdges,initial.theory.edges);
      await page.screenshot({path:path.join(output,`${lang}-full-dag.png`),fullPage:true});
      await page.locator('[data-mode="knowledge"]').click();
      await page.locator('#concept-query').fill('Finite-Dimensional Quantum Skeletons');
      await page.locator('#search-results button').first().click();
      assert.equal((await page.evaluate(()=>window.atlasDiagnostics())).selected,'D5/S3/Quantum/FiniteDimensional');
      await page.locator('[data-mode="knowledge"]').click();
      await page.setViewportSize({width:390,height:844});
      await page.locator('[data-topic="concepts"] .knowledge-topic-heading').click();
      assert.ok(await page.locator('#close-wiki').isVisible());
      assert.equal(await page.locator('#wiki').evaluate(e=>getComputedStyle(e).position),'fixed');
      await page.locator('#close-wiki').click();
      assert.equal((await page.evaluate(()=>window.atlasDiagnostics())).knowledge.topic,null);
      assert.equal(await page.locator('#wiki').evaluate(e=>getComputedStyle(e).position),'static');
      checks.push({lang,topic:true,keyboardTrace:true,moduleDrilldown:true,fullDAG:true,search:true,mobileInspector:true});
    }
    await page.goto(base+'?lang=en#mode=knowledge&topic=quantum');
    await page.waitForFunction(()=>window.atlasDiagnostics);
    assert.equal((await page.evaluate(()=>window.atlasDiagnostics())).knowledge.topic,'quantum');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({checks,deepLink:true,errors},null,2));
    console.log(JSON.stringify({checks:checks.length,deepLink:true,errors}));
  } finally { await browser.close(); }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
