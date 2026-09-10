const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8771';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1512,390]){
   await page.setViewportSize({width,height:1000});
   await page.goto(origin+'/discover.html');
   await page.locator('.research-chain li').last().waitFor();
   assert.equal(await page.locator('.research-chain li').count(),5);
   assert.match(await page.locator('#research-chain').innerText(),/reader assessment pending/);
   assert.ok(await page.locator('.map-node').count()>3);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`/private/tmp/research-bridges-${width}.png`,fullPage:true});
   const transform=await page.locator('#discovery-map svg > g').getAttribute('transform');
   await page.getByRole('button',{name:'Zoom in',exact:true}).click();
   assert.notEqual(await page.locator('#discovery-map svg > g').getAttribute('transform'),transform);
   await page.getByRole('button',{name:'Reset view',exact:true}).click();
   const selected=page.locator('.map-node.selected');await selected.scrollIntoViewIfNeeded();
   const beforeDrag=await selected.getAttribute('transform'), box=await selected.boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2+22,box.y+box.height/2+16,{steps:4});await page.mouse.up();
   assert.notEqual(await selected.getAttribute('transform'),beforeDrag);
   await page.locator('.map-node').filter({hasText:'representation'}).first().focus();
   await page.keyboard.press('Enter');
   assert.match(await page.locator('#discovery-detail').innerText(),/reducedParikh_eq_parikh_runCompress/);
   await page.goBack();
   assert.match(await page.locator('#discovery-detail').innerText(),/odd-length recurrence/);
   await page.locator('#discovery-query').fill('https://doi.org/10.2307/1968867');
   await page.getByRole('button',{name:'Search',exact:true}).click();
   assert.match(await page.locator('#discovery-detail').innerText(),/Newman/);
   assert.ok(await page.locator('#discovery-detail .connection').count()>0);
   assert.equal(await page.locator('.research-chain li').count(),0);
   await page.locator('#discovery-query').fill('A026471');await page.getByRole('button',{name:'Search',exact:true}).click();
   assert.match(await page.locator('#discovery-detail').innerText(),/not covered/);
   await page.locator('#discovery-query').fill('A999999');await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.getByRole('heading',{name:'No indexed match'}).waitFor();
   assert.equal(await page.locator('.map-node').count(),0);
  }
  await page.goto(origin+'/discover.html?record=representation%3Athue-morse-reduced-abelian-odd&lang=zh-CN');
  await page.getByRole('heading',{name:'独立理解',exact:true}).waitFor();
  assert.match(await page.locator('#research-chain').innerText(),/迁移效果待测量/);
  await page.goto(origin+'/discover.html?record=representation%3Athue-morse-reduced-abelian-odd&lang=en');
  await page.getByRole('heading',{name:'Independent understanding',exact:true}).waitFor();
  const plain=await browser.newPage({javaScriptEnabled:false});await plain.goto(origin+'/oeis/');
  assert.ok((await plain.locator('main').innerText()).includes('A010060'));
  await plain.goto(origin+'/oeis/A026471/');assert.match(await plain.locator('main').innerText(),/not covered/);
  assert.deepEqual(errors,[]);
  console.log('PASS: five evidence stages, graph keyboard traversal, zoom, history, DOI attribution, OEIS proof scope, empty states, bilingual deep links, desktop/mobile and static listings.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
