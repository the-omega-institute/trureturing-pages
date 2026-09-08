const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const output = "artifacts/atlas-preview/screenshots";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const bookRequests = [];
    await page.route("**/trureturing-mdbook/**", route => {
      bookRequests.push(route.request().url());
      return route.abort();
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1512, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${root}/research.html`);
      assert.equal(await page.locator(".news-paper").count(), 3);
      assert.equal(await page.locator(".news-result").count(), 4);
      assert.equal(await page.getByRole("link", { name: "Read result", exact: true }).count(), 4);
      for (const href of await page.getByRole("link", { name: "Read result", exact: true }).evaluateAll(links => links.map(link => link.href))) {
        assert.equal(new URL(href).origin, new URL(root).origin);
        assert.match(new URL(href).pathname, /\/results\/[^/]+\/$/);
      }
      assert.equal(await page.locator("#research-workbench").count(), 0);
      assert.ok(await page.locator(".news-qualification").isVisible());
      await page.locator("#publications").scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        [...document.images].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      );
      await page
        .locator(".news-result details")
        .first()
        .evaluate((el) => (el.open = true));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `${output}/research-news-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto(`${root}/research.html#rp=dfao-finite-unsat`);
    await page.waitForURL("**/conjectures.html#rp=dfao-finite-unsat");
    await page.locator("#research-workbench").waitFor();
    await page.goto(`${root}/research.html#publications`);
    assert.equal(new URL(page.url()).pathname.endsWith("/research.html"), true);
    await page.evaluate(() => (location.hash = "research-bank"));
    await page.waitForURL("**/conjectures.html#research-bank");
    assert.deepEqual(errors, []);
    assert.deepEqual(bookRequests, [], "Pages renders results without requesting mdBook data");
    const offline = await browser.newContext({ javaScriptEnabled: false });
    const plain = await offline.newPage();
    await plain.goto(`${root}/research.html`);
    assert.equal(await plain.locator(".news-paper").count(), 3);
    assert.equal((await plain.locator(".news-result a").count()) > 9, true);
    await offline.close();
    console.log(
      "PASS: Research content, evidence, image loading, four widths, legacy routes and no-JavaScript reading.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
