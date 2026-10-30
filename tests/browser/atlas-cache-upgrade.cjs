const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8767';
const output = process.env.ATLAS_OUTPUT || 'artifacts/atlas-cache-upgrade';
fs.mkdirSync(output, {recursive:true});

(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const {gunzipSync}=require('node:zlib');
  const dataPage=await browser.newPage();
  const index=await (await dataPage.request.get(root+'/data/atlas-startup.v1.json')).json();
  const manifest=await (await dataPage.request.get(root+'/data/pages-atlas-manifest.v1.json')).json();
  const {validateView}=await import('../../site/assets/atlas-startup-view.mjs');
  const summary=validateView(JSON.parse(gunzipSync(await (await dataPage.request.get(root+'/'+index.fast.graph.path)).body())),manifest);
  const {createPublicModel}=await import('../../site/assets/atlas-public-core.mjs');
  const expected=createPublicModel(summary), expectedEdges=expected.edges.length;
  await dataPage.close();
 const old = new Map(['atlas-public.js','atlas-public-core.mjs','atlas-theory-core.mjs','atlas-startup.mjs','atlas-startup-view.mjs','architecture-core.mjs'].map(name=>[
   name, execFileSync('git',['show',`fb950db:site/assets/${name}`],{encoding:'utf8'}),
  ]));
  for (const name of ['atlas-public.css', 'i18n.mjs', 'locales/zh-CN.json'])
   old.set(path.posix.basename(name),execFileSync('git',['show',`fb950db:site/assets/${name}`],{encoding:'utf8'}));
  for (const mixed of ['old-entry','old-model','old-layout','old-startup','old-style','old-locale','old-view','old-architecture','old-index','all-old']) {
   const page = await browser.newPage({reducedMotion:'reduce',viewport:{width:1512,height:982}});
   const errors=[],requests=[];
   page.on('pageerror', e=>errors.push(e.message));
   page.on('console', msg=>{if(msg.type()==='error' && msg.text().includes('TypeError'))errors.push(msg.text());});
   await page.route('**/data/atlas-startup.v1.json*', async route => {
    const url = new URL(route.request().url());
    requests.push({name:'startup-index',version:url.searchParams.get('v')});
    if (['old-index','all-old'].includes(mixed) && url.searchParams.get('v') !== 'lean-admission-v1')
     return route.fulfill({json:{schema_version:'stale-unversioned-index'}});
    return route.continue();
   });
   await page.route('**/assets/**', async route=>{
    const url=new URL(route.request().url()),name=path.posix.basename(url.pathname);
    if(old.has(name)) requests.push({name,version:url.searchParams.get('v')});
    const stale = mixed==='all-old' || ({'old-entry':'atlas-public.js','old-model':'atlas-public-core.mjs','old-layout':'atlas-theory-core.mjs','old-startup':'atlas-startup.mjs','old-style':'atlas-public.css','old-locale':'zh-CN.json','old-view':'atlas-startup-view.mjs','old-architecture':'architecture-core.mjs'})[mixed]===name;
    if(stale && old.has(name) && url.searchParams.get('v') !== 'lean-admission-v1')
     await route.fulfill({contentType:name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'application/javascript',body:old.get(name)});
    else await route.continue();
   });
   const lang=['old-locale','all-old'].includes(mixed)?'zh-CN':'en';
   await page.goto(root+'/atlas.html?lang='+lang);
   await page.waitForFunction(()=>window.atlasDiagnostics,null,{timeout:60000});
   const d=await page.evaluate(()=>({nodes:window.atlasDiagnostics().nodes,edges:window.atlasDiagnostics().edges,visible:window.atlasDiagnostics().visibleEdges,mode:window.atlasDiagnostics().mode}));
   assert.equal(d.mode,'theory');assert.equal(d.nodes,expected.nodes.length);assert.equal(d.edges,expectedEdges);assert.equal(d.visible,expectedEdges);
   assert.equal(await page.locator('#loading.is-error').count(),0);
   assert.deepEqual(errors,[]);
   assert.ok(requests.some(r=>r.name==='atlas-public.js'&&r.version==='lean-admission-v1'));
   assert.ok(requests.some(r=>r.name==='atlas-theory-core.mjs'&&r.version==='lean-admission-v1'));
   assert.ok(requests.some(r=>r.name==='atlas-public.css'&&r.version==='lean-admission-v1'));
   assert.ok(requests.some(r=>r.name==='startup-index'&&r.version==='lean-admission-v1'));
   assert.equal(await page.locator('.dag-facts').evaluate(node=>getComputedStyle(node).display),'grid');
   if(lang==='zh-CN')assert.match(await page.locator('.dag-isolated-label').innerText(),/无图内连线/);
   fs.writeFileSync(path.join(output,mixed+'.json'),JSON.stringify({mixed,...d,errors,requests},null,2));
   if(mixed==='all-old')await page.screenshot({path:path.join(output,'upgraded-dag.png'),timeout:30000});
   await page.close();
   console.log('PASS: '+mixed+' cache cannot replace the complete connected DAG');
  }
 } finally {await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
