const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { gzipSync, gunzipSync } = require("node:zlib");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const output = path.resolve("artifacts/atlas-preview/screenshots");
fs.mkdirSync(output, { recursive: true });
const nodeId = "D5/S0/Tower/GoldenGapZeckendorf";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${root}/research.html`);
    await page.waitForFunction(
      () =>
        document.querySelector("#research-search") &&
        document.querySelector("svg.lucide"),
    );
    assert.equal(await page.locator(".problem-row").count(), 7);
    await page.locator("#research-release-dossiers > summary").click();
    await page.getByLabel("Find a question").fill("automaton");
    assert.ok((await page.locator(".problem-row:visible").count()) >= 1);
    await page.getByLabel("Find a question").fill("");
    await page.getByLabel("Research scope").selectOption("wall");
    assert.equal(await page.locator(".problem-row:visible").count(), 2);
    await page.getByLabel("Research scope").selectOption("");
    await page.screenshot({ path: path.join(output, "research-desktop.png") });
    const wall = page.locator('.problem-row[href*="wall-sun-sun"]');
    await wall.click();
    await page
      .locator(".relation-map-node")
      .first()
      .waitFor({ timeout: 30000 });
    assert.ok((await page.locator(".relation-map-node").count()) > 5);
    assert.equal(await page.locator(".dossier-section").count(), 9);
    assert.ok(await page.locator(".katex").count() > 0);
    assert.ok(
      (await page.locator(".dossier-status").innerText()).includes(
        "not rechecked",
      ),
    );
    await page.locator(".content-timeline li").first().waitFor();
    await page.screenshot({
      path: path.join(output, "research-dossier-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "research-dossier-mobile.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(`${root}/research.html`);
    await page.screenshot({ path: path.join(output, "research-mobile.png") });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(`${root}/library-history.html`);
    await page.locator(".archive-row").first().waitFor();
    assert.equal(await page.locator(".archive-row").count(), 60);
    await page.getByLabel("Find a concept", { exact: true }).fill(nodeId);
    await page.waitForFunction(
      () => document.querySelectorAll(".archive-row").length === 2,
    );
    await page
      .locator(
        `.archive-row[href*="${createHash("sha256").update(nodeId).digest("hex")}"]`,
      )
      .click();
    await page
      .locator("[data-content-history] .content-timeline li")
      .first()
      .waitFor();
    assert.ok(
      (await page.locator(".release-banner").innerText()).includes(
        "Immutable release view",
      ),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(`${root}/evolution.html`);
    await page.waitForFunction(() => window.architectureHistoryDiagnostics);
    let diagnostics = await page.evaluate(() =>
      window.architectureHistoryDiagnostics(),
    );
    assert.ok(diagnostics.sceneEdges > 100);
    assert.ok(diagnostics.sceneNodes > 100);
    assert.equal(
      await page
        .getByLabel("Play release evolution", { exact: true })
        .isDisabled(),
      true,
    );
    const mobilePixels = PNG.sync.read(
      await page.locator("#evolution-map canvas").screenshot(),
    );
    let count = 0;
    for (let i = 0; i < mobilePixels.data.length; i += 4)
      if (Math.max(...mobilePixels.data.subarray(i, i + 3)) > 65) count++;
    assert.ok(count > 800, "Mobile lineage must be visibly nonblank");
    await page.screenshot({
      path: path.join(output, "lineage-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.screenshot({ path: path.join(output, "lineage-desktop.png") });
    const before = await page.locator("#evolution-map canvas").screenshot();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    assert.notDeepEqual(
      await page.locator("#evolution-map canvas").screenshot(),
      before,
    );
    await page
      .getByRole("button", { name: "Fit lineage", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Across releases", exact: true })
      .click();
    diagnostics = await page.evaluate(() =>
      window.architectureHistoryDiagnostics(),
    );
    assert.equal(diagnostics.mode, "time");
    assert.equal(
      diagnostics.sceneEdges,
      0,
      "Single release has no fabricated continuity",
    );
    await page
      .getByRole("button", { name: "Dependency lineage", exact: true })
      .click();
    await page.getByLabel("Find a module").fill(nodeId);
    await page.locator("#evolution-nodes button").click();
    await page.locator(".architecture-chart circle").waitFor();
    await page.screenshot({
      path: path.join(output, "lineage-selected-desktop.png"),
    });
    await page.goto(`${root}/library-history.html`);
    await page.locator(".archive-row").first().waitFor();
    await page.screenshot({
      path: path.join(output, "library-history-desktop.png"),
    });
    const archive = await (
      await page.request.get(`${root}/data/library-history.v1.json`)
    ).json();
    const originalEntry = archive.entries.at(-1);
    const sourceResponse = await page.request.get(
      `${root}/${originalEntry.path}`,
    );
    const originalBytes = await sourceResponse.body();
    const compressed = gzipSync(
      originalEntry.path.endsWith(".gz")
        ? gunzipSync(originalBytes)
        : originalBytes,
      { mtime: 0 },
    );
    const compressedDigest =
      "sha256:" + createHash("sha256").update(compressed).digest("hex");
    originalEntry.digest = compressedDigest;
    originalEntry.path = `data/library/${compressedDigest.slice(7)}.json.gz`;
    await page.route("**/data/library-history.v1.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(archive),
      }),
    );
    await page.route(`**/${originalEntry.path}`, (route) =>
      route.fulfill({ contentType: "application/gzip", body: compressed }),
    );
    await page.goto(
      `${root}/library-version.html#${new URLSearchParams({ snapshot: archive.entries.at(-1).digest, node: nodeId })}`,
    );
    await page.locator(".relation-map-node").first().waitFor();
    assert.ok(
      (await page.locator("#archived-concept").innerText()).includes(
        "Golden Gap",
      ),
    );
    await page.screenshot({
      path: path.join(output, "archived-concept-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.goto(`${root}/library-history.html`);
    await page.route(`**/${archive.entries.at(-1).path}`, (route) =>
      route.fulfill({ contentType: "application/json", body: "{}" }),
    );
    await page.reload();
    await page
      .getByText("Archive unavailable: Library artifact digest mismatch.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".archive-row").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        researchDossiers: 7,
        mobileLineagePixels: count,
        errors,
      }),
    );
    console.log(
      "PASS research filtering, sourced dossiers, candidate maps, mobile layout, immutable Library history, lineage modes, zoom, deep links and corrupted archive rejection.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
