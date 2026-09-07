const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8765";
const slug = "35b9ed520bf5997fd92ed38277ff38290799a1eb64af4b31738a853ddaaf7d4c";
const nodeId = "D5/S3/Weil/ZetaAnalytic/WhiteFloorSamplingDuality";
const wiki = `${root}/knowledge/node/${slug}/`;
const output = path.resolve("artifacts/atlas-preview/screenshots");
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${root}/atlas.html#node=${encodeURIComponent(nodeId)}`);
    await page.waitForFunction(() => window.atlasDiagnostics?.().selected, {
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    const selected = await page.evaluate(() => window.atlasDiagnostics());
    assert.ok(
      selected.nodes >= 2890,
      "Selection retains the surrounding mathematical graph",
    );
    assert.equal(selected.relatedNodes, 10);
    assert.equal(selected.relatedEdges, 23);
    await page.screenshot({
      path: path.join(output, "atlas-expanded-context.png"),
    });
    await page.getByRole("tab", { name: "Connections", exact: true }).click();
    await page
      .locator('.relation-viewer[data-node-count="10"]')
      .waitFor({ timeout: 30000 });
    await page.getByLabel("Keep context", { exact: true }).uncheck();
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().nodes),
      10,
    );
    await page.getByLabel("Affinity", { exact: true }).uncheck();
    await page.getByLabel("Documents", { exact: true }).uncheck();
    assert.equal(await page.evaluate(() => window.atlasDiagnostics().nodes), 5);
    await page
      .getByLabel("Relationship range", { exact: true })
      .selectOption("1");
    assert.equal(await page.evaluate(() => window.atlasDiagnostics().nodes), 3);
    const filteredUrl = page.url();
    await page.reload();
    await page.waitForFunction(() => window.atlasDiagnostics?.().selected, {
      timeout: 60000,
    });
    assert.equal(page.url(), filteredUrl);
    assert.equal(await page.evaluate(() => window.atlasDiagnostics().nodes), 3);
    await page.getByRole("tab", { name: "Connections", exact: true }).click();
    await page
      .getByLabel("Relationship range", { exact: true })
      .selectOption("all");
    await page.getByLabel("Affinity", { exact: true }).check();
    await page.getByLabel("Documents", { exact: true }).check();
    await page
      .locator('.relation-viewer[data-node-count="10"]')
      .waitFor({ timeout: 30000 });
    await page.screenshot({
      path: path.join(output, "atlas-related-maps.png"),
    });
    await page.goto(wiki);
    assert.ok(
      page.url().startsWith(root),
      "Wiki links stay on the local Pages origin",
    );
    await page
      .locator('.relation-viewer[data-node-count="10"]')
      .waitFor({ timeout: 30000 });
    assert.equal(
      await page.locator('[data-rel-list="upstream"] li').count(),
      1,
    );
    assert.equal(
      await page.locator('[data-rel-list="downstream"] li').count(),
      3,
    );
    assert.equal(
      await page.locator('[data-rel-list="document"] li').count(),
      5,
    );
    assert.equal(
      await page.locator(".relation-viewer").getAttribute("data-edge-count"),
      "23",
    );
    await page.screenshot({
      path: path.join(output, "wiki-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Proof paths", exact: true }).click();
    await page.locator('.relation-viewer[data-node-count="5"]').waitFor();
    await page
      .getByRole("button", { name: "Expand relationship graph", exact: true })
      .click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator(".relation-viewer.is-expanded").isVisible());
    await page.screenshot({ path: path.join(output, "wiki-proof-map.png") });
    const beforeZoom = await page
      .locator(".relation-map-viewport > svg > g")
      .getAttribute("transform");
    await page
      .getByRole("button", { name: "Zoom relationship graph in", exact: true })
      .click();
    assert.notEqual(
      await page
        .locator(".relation-map-viewport > svg > g")
        .getAttribute("transform"),
      beforeZoom,
    );
    await page
      .getByRole("button", { name: "Focus current concept", exact: true })
      .click();
    const focused = await page
      .locator(".relation-map-node.is-selected")
      .boundingBox();
    const viewport = await page.locator(".relation-map-viewport").boundingBox();
    assert.ok(
      Math.abs(
        focused.x + focused.width / 2 - viewport.x - viewport.width / 2,
      ) < 2,
    );
    assert.ok(
      Math.abs(
        focused.y + focused.height / 2 - viewport.y - viewport.height / 2,
      ) < 2,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".relation-viewer.is-expanded").count(), 0);
    for (const [category, nodes] of [
      ["Structural affinity", 5],
      ["Documents", 10],
      ["All relations", 10],
    ]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      await page
        .locator(`.relation-viewer[data-node-count="${nodes}"]`)
        .waitFor();
    }
    await page
      .getByLabel("Relationship range", { exact: true })
      .selectOption("1");
    await page.locator('.relation-viewer[data-node-count="8"]').waitFor();
    await page
      .getByLabel("Relationship range", { exact: true })
      .selectOption("all");
    await page.locator('.relation-viewer[data-node-count="10"]').waitFor();
    const sourceNode = page
      .locator(".relation-map-node")
      .filter({ hasText: "Local Spectral Floors" });
    await sourceNode.press("Enter");
    await page.waitForURL((url) => !url.pathname.includes(slug));
    assert.ok(page.url().includes("/knowledge/node/"));
    await page.goto(
      `${root}/release/c0d04258d27972c1cf58485e21d64dbcbe336405346ba95133913c64ba2856aa/node/${slug}/`,
    );
    await page.locator('.relation-viewer[data-node-count="10"]').waitFor();
    assert.ok(
      await page
        .getByText("Immutable release view", { exact: false })
        .isVisible(),
    );
    await page.goto(`${root}/knowledge/`);
    await page.locator(".library-pagination").waitFor();
    assert.equal(await page.locator(".concept-row:visible").count(), 60);
    await page
      .getByLabel("Find a concept", { exact: true })
      .fill("White Floor and Sampling Duality");
    assert.equal(await page.locator(".concept-row:visible").count(), 1);
    await page.screenshot({ path: path.join(output, "library-desktop.png") });
    await page.locator(".concept-row:visible").click();
    await page.waitForURL(wiki);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
      .locator('.relation-viewer[data-node-count="10"]')
      .waitFor({ timeout: 30000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(output, "wiki-mobile.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Expand relationship graph", exact: true })
      .click();
    await page.screenshot({ path: path.join(output, "wiki-mobile-map.png") });
    await page.keyboard.press("Escape");
    for (const [name, route] of [
      ["overview", "/index.html"],
      ["history", "/conclusions.html"],
      ["research", "/dag.html"],
      ["authentication", "/auth/callback.html"],
      ["library", "/knowledge/"],
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(root + route);
      if (name === "research")
        await page
          .locator("#graph-status.graph-status-ready")
          .waitFor({ timeout: 60000 });
      if (name === "library")
        await page.locator(".library-pagination").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(output, `${name}-theme-desktop.png`),
        fullPage: name !== "library",
      });
      assert.ok(
        await page.evaluate(
          () =>
            getComputedStyle(document.body).backgroundColor ===
            "rgb(9, 12, 16)",
        ),
        `${name} should use the shared dark background`,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(output, `${name}-theme-mobile.png`),
        fullPage: name !== "library",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} should fit mobile width`,
      );
    }
    console.log(JSON.stringify({ errors }));
    assert.deepEqual(errors, []);
    const fallback = await browser.newPage({ javaScriptEnabled: false });
    await fallback.goto(wiki);
    assert.ok(await fallback.locator(".mini-graph").isVisible());
    assert.equal(
      await fallback.locator('[data-rel-list="upstream"] li').count(),
      1,
    );
    await fallback.close();
    console.log(
      "PASS: all relationship types, full lineage, retained context, 2D maps, zoom, expansion, node navigation, immutable pages, Library search, shared theme across all owned pages, mobile widths, no-JS fallback.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
