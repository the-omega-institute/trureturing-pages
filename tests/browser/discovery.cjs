const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8766';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1512,390]) {
   await page.setViewportSize({width,height:900});
   await page.goto(origin+'/discover.html?q=A010060');
   await page.getByRole('button',{name:'Thue-Morse sequence',exact:true}).waitFor();
   assert.ok((await page.locator('#discovery-detail').innerText()).includes('not the derived complexity'));
   await page.locator('#discovery-detail button').first().click();
   await page.getByRole('link',{name:'Exact Lean source',exact:true}).waitFor();
   assert.match(await page.locator('#discovery-detail').innerText(), /builds on/i);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`artifacts/atlas-preview/screenshots/discovery-${width}.png`,fullPage:true});
   await page.locator('#discovery-query').fill('逻辑代数');await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.getByRole('button',{name:'Logic and algebra',exact:true}).waitFor();
   assert.equal(await page.locator('#discovery-detail .connection').count(),2);
   await page.locator('#discovery-query').fill('A026471');await page.getByRole('button',{name:'Search',exact:true}).click();
   assert.ok((await page.locator('#discovery-detail').innerText()).includes('not covered'));
   await page.locator('#discovery-query').fill('A999999');await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.getByRole('heading',{name:'No indexed match',exact:true}).waitFor();
  }
  const plain=await browser.newPage({javaScriptEnabled:false});await plain.goto(origin+'/oeis/A010060/');
  assert.ok((await plain.locator('main').innerText()).includes('not the derived complexity'));
  assert.deepEqual(errors,[]);console.log('PASS: OEIS, bilingual concept aliases, proof and follow-up traversal, unknown IDs, static crawlable content, desktop/mobile containment.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
