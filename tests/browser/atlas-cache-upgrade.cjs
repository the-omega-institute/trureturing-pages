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
  const old = new Map(['atlas-public.js','atlas-public-core.mjs','atlas-theory-core.mjs','atlas-startup.mjs'].map(name=>[
   name, execFileSync('git',['show',`a71d298:site/assets/${name}`],{encoding:'utf8'}),
  ]));
  for (const mixed of ['old-entry','old-model','old-layout','old-startup','all-old']) {
   const page = await browser.newPage({reducedMotion:'reduce',viewport:{width:1512,height:982}});
   const errors=[],requests=[];
   page.on('pageerror', e=>errors.push(e.message));
   page.on('console', msg=>{if(msg.type()==='error' && msg.text().includes('TypeError'))errors.push(msg.text());});
   await page.route('**/assets/atlas-*', async route=>{
    const url=new URL(route.request().url()),name=path.posix.basename(url.pathname);
    requests.push({name,version:url.searchParams.get('v')});
    const stale = mixed==='all-old' || ({'old-entry':'atlas-public.js','old-model':'atlas-public-core.mjs','old-layout':'atlas-theory-core.mjs','old-startup':'atlas-startup.mjs'})[mixed]===name;
    if(stale && old.has(name) && !url.searchParams.has('v'))
     await route.fulfill({contentType:'application/javascript',body:old.get(name)});
    else await route.continue();
   });
   await page.goto(root+'/atlas.html?lang=en');
   await page.waitForFunction(()=>window.atlasDiagnostics,null,{timeout:60000});
   const d=await page.evaluate(()=>({nodes:window.atlasDiagnostics().nodes,edges:window.atlasDiagnostics().edges,visible:window.atlasDiagnostics().visibleEdges,mode:window.atlasDiagnostics().mode}));
   assert.equal(d.mode,'theory');assert.equal(d.nodes,11237);assert.equal(d.edges,14799);assert.equal(d.visible,14799);
   assert.equal(await page.locator('#loading.is-error').count(),0);
   assert.deepEqual(errors,[]);
   assert.ok(requests.some(r=>r.name==='atlas-public.js'&&r.version==='connected-dag-v3'));
   assert.ok(requests.some(r=>r.name==='atlas-theory-core.mjs'&&r.version==='connected-dag-v3'));
   fs.writeFileSync(path.join(output,mixed+'.json'),JSON.stringify({mixed,...d,errors,requests},null,2));
   if(mixed==='all-old')await page.screenshot({path:path.join(output,'upgraded-dag.png'),timeout:30000});
   await page.close();
   console.log('PASS: '+mixed+' cache cannot replace the complete connected DAG');
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
