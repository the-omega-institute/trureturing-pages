const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.env.ATLAS_ORIGIN || 'http://127.0.0.1:8772').replace(/\/$/, '');
const output = process.env.ATLAS_OUTPUT || 'artifacts/visualize-domain';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], failed = [], checked = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 982 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(base + '/visualize/') && response.status() >= 400)
        failed.push([response.status(), response.url()]);
    });
    await page.goto(base + '/atlas.html?lang=en&v=visualize-domain-v1');
    await page.locator('header nav a[href*="visualize/"]').click();
    await page.locator('.card').first().waitFor();
    assert.equal(new URL(page.url()).origin, new URL(base).origin);
    assert.equal(new URL(page.url()).pathname, '/visualize/');
    assert.equal(await page.evaluate(() => TRV.lang()), 'en');
    const publication = await (await page.request.get(base + '/visualize/publication.v1.json')).json();
    const registry = await (await page.request.get(base + '/visualize/visualizations.json')).json();
    const live = registry.visualizations.filter(v => v.status === 'live');
    assert.equal(await page.locator('.card').count(), live.length);
    assert.equal(live.length, 30);
    assert.match(await page.locator('.pages-atlas-link').getAttribute('href'), /atlas\?lang=en$/);
    await page.screenshot({ path: path.join(output, 'hub-en.png') });
    for (const entry of live) {
      await page.goto(base + '/visualize/' + entry.path + '?lang=en', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.TRV && [...document.querySelectorAll('canvas')].some(cv => cv.width > 0 && cv.height > 0));
      assert.equal(new URL(page.url()).origin, new URL(base).origin);
      assert.ok(new URL(page.url()).pathname.startsWith('/visualize/viz/'));
      assert.equal(await page.evaluate(() => TRV.lang()), 'en');
      checked.push(entry.id);
      if (entry.id === 'uncertainty') {
        const control = page.locator('input[type="range"]:visible').first();
        const before = await control.inputValue();
        await control.focus();
        await control.press('Home');
        await control.press('ArrowRight');
        assert.notEqual(await control.inputValue(), before, 'Interactive controls still update under the mounted path');
        await page.screenshot({ path: path.join(output, 'uncertainty-en.png') });
        await page.locator('a[href="../../"]').click();
        await page.locator('.card').first().waitFor();
        assert.equal(new URL(page.url()).pathname, '/visualize/');
        assert.equal(await page.evaluate(() => TRV.lang()), 'en');
      }
      console.log('PASS: same-domain visualization ' + entry.id);
    }
    await page.goto(base + '/atlas.html?lang=zh-CN&v=visualize-domain-v1');
    await page.locator('header nav a[href*="visualize/"]').click();
    await page.locator('.card').first().waitFor();
    assert.equal(await page.evaluate(() => TRV.lang()), 'zh');
    assert.match(await page.locator('.pages-atlas-link').innerText(), /理论图谱/);
    await page.locator('.card h3 a').first().click();
    await page.waitForFunction(() => window.TRV && TRV.lang() === 'zh');
    assert.equal(new URL(page.url()).origin, new URL(base).origin);
    assert.equal(new URL(page.url()).searchParams.get('lang'), 'zh');
    await page.goto(base + '/visualize/?lang=zh-CN');
    await page.locator('.card').first().waitFor();
    await page.screenshot({ path: path.join(output, 'hub-zh-CN.png') });
    await page.locator('.pages-atlas-link').click();
    assert.equal(new URL(page.url()).pathname, '/atlas');
    assert.equal(new URL(page.url()).searchParams.get('lang'), 'zh-CN');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/visualize/?lang=en');
    await page.locator('.card').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('button', { name: '中', exact: true }).click();
    assert.equal(await page.evaluate(() => TRV.lang()), 'zh');
    await page.screenshot({ path: path.join(output, 'hub-mobile.png') });
    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
    const receipt = { base, publication: publication.source_commit, visualizations: checked,
      entryFromAtlas: true, returnToAtlas: true, bilingual: true, mobile: true, failed, errors };
    fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  }
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
