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
    await page.goto(`${root}/atlas.html`);
    await page.waitForFunction(
      () =>
        window.atlasDiagnostics?.().visuals.bundles > 0 &&
        window.atlasDiagnostics?.().changes,
    );
    await page.waitForTimeout(900);
    let diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.visuals.error, null);
    assert.ok(diagnostics.visuals.spineEdges > 100);
    assert.equal(diagnostics.visuals.bundlesVisible, true);
    assert.equal(diagnostics.changes.kind, "baseline");
    assert.equal(diagnostics.changes.active, false);
    assert.equal(
      await page
        .getByRole("button", { name: "Show release changes", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: path.join(output, "visual-atlas-overview.png"),
    });
    const png = PNG.sync.read(await page.locator("#graph canvas").screenshot());
    let colored = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (Math.max(...png.data.subarray(i, i + 3)) > 65) colored++;
    assert.ok(colored > 2000);
    await page.locator(".bundle-label:visible").first().click();
    await page.waitForTimeout(700);
    diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.ok(diagnostics.visuals.bundle);
    const expanded = Number(
      (await page.locator("#wiki-content .wiki-intro").innerText()).match(
        /(\d+) proof dependencies/,
      )[1],
    );
    assert.equal(await page.locator(".bundle-relation").count(), expanded);
    assert.equal(
      diagnostics.nodes,
      2890,
      "Expanded connection retains mathematical context",
    );
    const bundle = diagnostics.visuals.bundle,
      camera = diagnostics.camera;
    await page.screenshot({
      path: path.join(output, "visual-bundle-expanded.png"),
    });
    await page.locator(".bundle-relation .concept-row").first().click();
    await page.waitForTimeout(700);
    assert.ok(await page.locator("#selection-summary").isVisible());
    assert.ok(
      (await page.locator("#selection-summary").innerText()).includes(
        "foundations",
      ),
    );
    await page.screenshot({
      path: path.join(output, "visual-local-focus.png"),
    });
    await page
      .getByRole("button", { name: "Previous view", exact: true })
      .click();
    await page.waitForTimeout(650);
    diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.visuals.bundle, bundle);
    assert.ok(
      diagnostics.camera.every(
        (value, index) => Math.abs(value - camera[index]) < 0.1,
      ),
    );
    await page
      .getByRole("button", { name: "Return to all concepts", exact: true })
      .click();
    await page.waitForTimeout(750);
    await page
      .getByRole("button", {
        name: "Bundle cross-family dependencies",
        exact: true,
      })
      .click();
    assert.equal(
      await page.evaluate(
        () => window.atlasDiagnostics().visuals.bundlesVisible,
      ),
      false,
    );
    await page
      .getByRole("button", {
        name: "Bundle cross-family dependencies",
        exact: true,
      })
      .click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.waitForTimeout(280);
    }
    assert.notEqual(
      await page.evaluate(() => window.atlasDiagnostics().visuals.lod),
      "overview",
    );
    assert.ok((await page.locator("#node-labels .node-label").count()) > 0);
    await page
      .getByRole("button", { name: "Open questions", exact: true })
      .click();
    await page.waitForFunction(
      () => window.atlasDiagnostics?.().visuals.researchMarkers === 7,
    );
    await page.waitForTimeout(750);
    assert.equal(await page.locator("[data-scene-kind=research]").count(), 7);
    await page.screenshot({
      path: path.join(output, "visual-research-targets.png"),
    });
    await page.locator(".research-marker-label:visible").first().click();
    assert.equal(
      await page.evaluate(
        () => window.atlasDiagnostics().visuals.researchMarkers,
      ),
      1,
    );
    assert.equal(await page.locator(".research-path a").count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1100);
    await page.screenshot({
      path: path.join(output, "visual-atlas-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const overlap = await page.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll(
          ".family-label, .node-label, .research-marker-label, .bundle-label",
        ),
      ]
        .filter(
          (el) => !el.hidden && getComputedStyle(el).visibility === "visible",
        )
        .map((el) => el.getBoundingClientRect());
      return boxes.some((a, i) =>
        boxes
          .slice(i + 1)
          .some(
            (b) =>
              a.x < b.right &&
              a.right > b.x &&
              a.y < b.bottom &&
              a.bottom > b.y,
          ),
      );
    });
    assert.equal(overlap, false, "Adaptive labels do not overlap");
    const mobilePng = PNG.sync.read(
      await page.locator("#graph canvas").screenshot(),
    );
    let mobileColored = 0;
    for (let i = 0; i < mobilePng.data.length; i += 4)
      if (Math.max(...mobilePng.data.subarray(i, i + 3)) > 65) mobileColored++;
    assert.ok(mobileColored > 100, "Mobile research geometry is visible");
    assert.equal(
      await page.locator(".research-marker-label:visible").count(),
      1,
    );
    await page.locator("#wiki-content .concept-row").first().click();
    await page.waitForTimeout(800);
    assert.equal(
      await page
        .getByRole("button", { name: "Previous view", exact: true })
        .isVisible(),
      true,
    );
    await page
      .getByRole("button", { name: "Previous view", exact: true })
      .click();
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().selected),
      null,
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS: dependency skeleton, exact expandable bundles, focus roles and return camera, semantic zoom, seven research targets, source paths, real baseline, mobile non-overlap. Canvas: ${colored} visible pixels.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
