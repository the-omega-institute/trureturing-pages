const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8769';
const output = process.env.ATLAS_OUTPUT || 'artifacts/atlas-fast-startup';
fs.mkdirSync(output, {recursive:true});

(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1512,height:982}});
  const index=await (await page.request.get(root+'/data/atlas-startup.v1.json')).json();
  assert.ok(index.fast);
  const errors=[], detailRequests=[],details=new Set(index.fast.details.map(e=>'/'+e.path));
  page.on('pageerror',e=>errors.push(e.message));
  let detailMode='fail';
  await page.route('**/data/atlas-startup/**',async route=>{
   if(details.has(new URL(route.request().url()).pathname)){
    detailRequests.push(route.request().url());
    if(detailMode==='fail')return route.fulfill({status:503,body:'temporarily unavailable'});
   }
   return route.continue();
  });
  await page.goto(root+'/atlas.html?lang=en');
  await page.waitForFunction(()=>window.atlasDiagnostics,null,{timeout:60000});
  const initial=await page.evaluate(()=>window.atlasDiagnostics({includeGraph:true}));
  assert.equal(initial.startup.compact,true);assert.equal(initial.mode,'theory');
  assert.equal(initial.visibleEdges,initial.edges);
  assert.equal(detailRequests.length,0,'No article shards delay the complete DAG');
  const requested=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname));
  assert.ok(!requested.includes('/'+index.graph.path),'The canonical archive is off the first-paint path');
  assert.ok(requested.includes('/'+index.fast.graph.path));
  assert.ok(requested.includes('/'+index.fast.layout.path));
  await page.locator('#wiki-content .concept-row').first().click();
  await page.getByRole('button',{name:'Retry concept details',exact:true}).waitFor();
  const selectedEdges=new Set(await page.evaluate(()=>window.atlasDiagnostics({includeGraph:true}).edgePairs.map(e=>JSON.stringify(e))));
  assert.ok(initial.edgePairs.every(e=>selectedEdges.has(JSON.stringify(e))),'Selecting an article preserves every mathematical dependency');
  detailMode='valid';
  await page.getByRole('button',{name:'Retry concept details',exact:true}).click();
  await page.locator('.article-copy').waitFor();
  await page.locator('.article-audit summary').click();
  const source=await page.getByRole('link',{name:'Lean source at this release',exact:true}).getAttribute('href');
  assert.match(source,/github.com\/the-omega-institute\/trureturing\/blob\/[a-f0-9]{40}\/.*\.lean$/);
  assert.equal(detailRequests.length,2,'A failed shard is retryable');
  await page.screenshot({path:output+'/lazy-details.png',timeout:30000});
  await page.getByRole('button',{name:'Return to all concepts',exact:true}).click();
  await page.locator('#wiki-content .concept-row').first().click();
  await page.locator('.article-copy').waitFor();
  assert.equal(detailRequests.length,2,'Reopening the same module reuses its verified details');
  const legacy=await browser.newPage();
  legacy.on('pageerror',e=>errors.push(e.message));
  await legacy.route('**/data/atlas-startup.v1.json',route=>route.fulfill({json:{...index,fast:undefined}}));
  await legacy.goto(root+'/atlas.html?lang=en');
  await legacy.waitForFunction(()=>window.atlasDiagnostics,null,{timeout:60000});
  const compatibility=await legacy.evaluate(()=>window.atlasDiagnostics());
  assert.equal(compatibility.startup.compact,false);
  assert.equal(compatibility.nodes,initial.nodes);assert.equal(compatibility.visibleEdges,initial.edges);
  assert.deepEqual(errors,[]);
  const receipt={nodes:initial.nodes,edges:initial.edges,compact:true,articleRequestsBeforeReady:0,detailRetry:true,detailCache:true,source,legacyStartupCompatible:true,errors};
  fs.writeFileSync(output+'/receipt.json',JSON.stringify(receipt,null,2));
  console.log(JSON.stringify(receipt));
  await page.close();await legacy.close();
 }finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))])}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
