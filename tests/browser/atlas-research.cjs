const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const output = path.resolve("artifacts/atlas-preview/screenshots");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    // An existing engineering-node selection must not leak into the question overview.
    await page.goto(`${root}/atlas.html#node=D5%2FX_Frontier%2FPaperGenerator`);
    await page.waitForFunction(() => window.atlasDiagnostics?.().selected);
    assert.ok(
      (await page.locator(".article-meta").innerText()).includes("Open module"),
    );
    await page
      .getByRole("button", { name: "Open questions", exact: true })
      .click();
    await page.waitForFunction(
      () => window.atlasDiagnostics?.().researchQuestions === 7,
    );
    let diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.selected, null);
    assert.equal(diagnostics.researchQuestions, 7);
    assert.equal(diagnostics.researchAnchors, 39);
    assert.equal(diagnostics.researchError, null);
    assert.ok(diagnostics.nodes >= 39);
    assert.ok(
      Object.keys(diagnostics.positions).every(
        (id) => !id.includes("X_Frontier"),
      ),
    );
    assert.equal(await page.locator(".research-question").count(), 7);
    await page.locator('.frontier-results a[href="research.html#bosma-conjecture-17"]').waitFor();
    assert.equal(await page.locator(".frontier-results a").count(), 4);
    assert.doesNotMatch(
      await page.locator("#wiki-content").innerText(),
      /Paper Generator|Values Producer/,
    );
    await page.waitForTimeout(900);
    const png = PNG.sync.read(await page.locator("#graph canvas").screenshot());
    let colored = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (Math.max(...png.data.subarray(i, i + 3)) > 65) colored++;
    assert.ok(colored > 1000);
    await page.screenshot({
      path: path.join(output, "research-atlas-desktop.png"),
    });
    const slug = "wall-sun-sun-golden-unit-lift";
    await page.locator(`[data-problem="${slug}"]`).click();
    diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.problem, slug);
    assert.ok(diagnostics.nodes > 0);
    const dossier = page.getByRole("link", {
      name: "Question, missing bridges & proposed route",
    });
    assert.equal(await dossier.getAttribute("href"), `research/${slug}/`);
    assert.ok(new URL(page.url()).hash.includes(`problem=${slug}`));
    await page.reload();
    await page.waitForFunction(() => window.atlasDiagnostics?.().problem);
    await page.locator(`[data-problem="${slug}"]`).waitFor();
    assert.equal(
      await page
        .locator(`[data-problem="${slug}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .locator("#wiki-content button.concept-row:not(.research-question)")
      .first()
      .click();
    assert.ok(
      (await page.locator("#wiki-content .article-meta").innerText()).includes(
        "Proven",
      ),
    );
    assert.ok(
      (await page.locator("#wiki-content .relationship-controls").count()) > 0,
    );
    await page
      .getByRole("button", { name: "Research questions", exact: true })
      .click();
    assert.equal(await page.locator(".research-question").count(), 7);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    const mobile = PNG.sync.read(
      await page.locator("#graph canvas").screenshot(),
    );
    let mobileColored = 0;
    for (let i = 0; i < mobile.data.length; i += 4)
      if (Math.max(...mobile.data.subarray(i, i + 3)) > 65) mobileColored++;
    assert.ok(
      mobileColored > 100,
      "Selected research foundations must remain visible after mobile resize",
    );
    await page.screenshot({
      path: path.join(output, "research-atlas-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await dossier.click();
    await page.locator(".dossier-heading").waitFor();

    // Catalog failures are distinct from a release that has no research.
    await page.route("**/data/library-history.v1.json", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.goto(`${root}/atlas.html#mode=frontier`);
    await page.waitForFunction(() => window.atlasDiagnostics?.().researchError);
    diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.ok(diagnostics.researchError);
    assert.equal(diagnostics.nodes, 0);
    assert.equal(await page.locator(".research-question").count(), 0);
    assert.ok(
      (await page.locator("#wiki-content").innerText()).includes("unavailable"),
    );
    await page.unroute("**/data/library-history.v1.json");
    await page.getByRole("button", { name: "Retry research catalog" }).click();
    await page.locator(".research-question").first().waitFor();
    assert.equal(await page.locator(".research-question").count(), 7);
    assert.deepEqual(errors, []);
    console.log(
      `PASS: 7 sourced questions, 39 foundations, no engineering frontier leakage, dossier scope, deep links, full concept relationships, mobile layout, catalog failure and recovery. Canvas: ${colored} visible pixels.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
