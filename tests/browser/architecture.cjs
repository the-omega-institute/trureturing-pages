const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8765";
const output = path.resolve("artifacts/atlas-preview/screenshots");
const nodeId = "D5/S0/Tower/GoldenGapZeckendorf";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const core = await import("../../site/assets/architecture-core.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${root}/atlas.html#mode=dependency`);
    await page.waitForFunction(() => window.atlasDiagnostics, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator(".architecture-rank").count(), 2890);
    const baseline = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(baseline.nodes, 2890);
    await page.screenshot({
      path: path.join(output, "architecture-desktop.png"),
    });
    const pixels = PNG.sync.read(
      await page.locator("#graph canvas").screenshot(),
    );
    let colored = 0;
    for (let i = 0; i < pixels.data.length; i += 4)
      if (Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) > 65)
        colored++;
    assert.ok(colored > 1000, "Architecture canvas must not be blank");
    await page
      .getByLabel("Architecture metric", { exact: true })
      .selectOption("coverage");
    assert.ok(
      (await page.locator(".architecture-rank").first().innerText()).includes(
        "W-Digit Convention",
      ),
    );
    assert.deepEqual(
      (await page.evaluate(() => window.atlasDiagnostics())).positions,
      baseline.positions,
      "Metric changes keep the layout stable",
    );
    await page.getByLabel("Find a concept", { exact: true }).fill(nodeId);
    await page.locator("#search-results button").first().click();
    await page.getByRole("tab", { name: "Architecture", exact: true }).click();
    let diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.architecture.reach, 98);
    assert.equal(diagnostics.architecture.direct, 2);
    assert.equal(diagnostics.architecture.coverage, 6);
    assert.equal(diagnostics.mode, "dependency");
    await page.locator(".architecture-domain").first().click();
    await page.locator(".architecture-paths summary").first().click();
    assert.ok((await page.locator(".architecture-paths ol li").count()) >= 2);
    await page.getByRole("button", { name: "Structure", exact: true }).click();
    assert.equal(
      (await page.evaluate(() => window.atlasDiagnostics())).selected,
      nodeId,
    );
    await page
      .getByRole("button", { name: "Dependencies", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => window.atlasDiagnostics())).selected,
      nodeId,
    );
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(output, "architecture-node.png") });
    const deepLink = page.url();
    await page.reload();
    await page.waitForFunction(
      () => window.atlasDiagnostics?.().selected,
      null,
      { timeout: 60000 },
    );
    assert.equal(page.url(), deepLink);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Architecture", exact: true }).click();
    await page.screenshot({
      path: path.join(output, "architecture-node-mobile.png"),
    });
    const graphBounds = await page.locator("#graph").boundingBox();
    const wikiBounds = await page.locator("#wiki").boundingBox();
    assert.ok(
      graphBounds.y + graphBounds.height <= wikiBounds.y + 1,
      "Mobile Wiki must not overlap the architecture graph",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const mobilePixels = PNG.sync.read(
      await page.locator("#graph canvas").screenshot(),
    );
    let mobileColored = 0;
    for (let i = 0; i < mobilePixels.data.length; i += 4)
      if (Math.max(...mobilePixels.data.subarray(i, i + 3)) > 65)
        mobileColored++;
    assert.ok(mobileColored > 100);
    await page.goto(
      `${root}/evolution.html#node=${encodeURIComponent(nodeId)}`,
    );
    await page.waitForFunction(
      () => window.architectureHistoryDiagnostics,
      null,
      { timeout: 30000 },
    );
    assert.equal(await page.locator(".architecture-baseline").count(), 1);
    assert.equal(await page.locator(".architecture-chart circle").count(), 1);
    assert.equal(await page.locator(".evolution-line").count(), 0);
    await page.screenshot({
      path: path.join(output, "evolution-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.screenshot({
      path: path.join(output, "evolution-desktop.png"),
      fullPage: true,
    });
    await page
      .getByLabel("Find a module", { exact: true })
      .fill("Golden Ratio Identities");
    assert.equal(await page.locator("#evolution-nodes button").count(), 1);
    await page.locator("#evolution-nodes button").click();
    assert.ok(page.url().includes("GoldenRatio"));

    // Synthetic observations are intercepted only inside this test browser.
    const sha = (c) => `sha256:${c.repeat(64)}`;
    const graphs = ["a", "b", "c", "d"].map((release, i) => ({
      source_snapshot: {
        truth_release_digest: sha(release),
        topology_algorithm: i === 3 ? "Topology/2" : "Topology/1",
      },
      nodes: [
        {
          id: "A",
          kind: "truth",
          human_title: "Test Foundation",
          domain: "Digit",
        },
        { id: "B", kind: "truth", domain: "Fourier" },
        ...(i > 0 ? [{ id: "C", kind: "truth", domain: "Quantum" }] : []),
      ],
      edges: [
        { source: "A", target: "B", layer: "truth-dependency" },
        ...(i > 0
          ? [{ source: "B", target: "C", layer: "truth-dependency" }]
          : []),
      ],
    }));
    const snapshots = graphs.map((g, i) =>
      core.snapshotFromGraph(g, sha(String(i + 1))),
    );
    const entries = [];
    for (const snapshot of snapshots) {
      const text = JSON.stringify(snapshot),
        digest = await core.sha256(text),
        route = `data/architecture/${digest.slice(7)}.json`;
      entries.push({
        path: route,
        digest,
        truth_release_digest: snapshot.truth_release_digest,
        atlas_graph_digest: snapshot.atlas_graph_digest,
      });
      await page.route(`**/${route}`, (route) =>
        route.fulfill({ contentType: "application/json", body: text }),
      );
    }
    const index = {
      schema_version: core.HISTORY_SCHEMA,
      current_truth_release_digest: snapshots.at(-1).truth_release_digest,
      entries,
    };
    await page.route("**/data/architecture-history.v1.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(index),
      }),
    );
    await page.route("**/data/pages-atlas-manifest.v1.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: "pages-atlas-manifest.v1",
          truth_release_digest: snapshots.at(-1).truth_release_digest,
          atlas_graph_digest: snapshots.at(-1).atlas_graph_digest,
        }),
      }),
    );
    await page.goto(`${root}/evolution.html#node=A`);
    await page.reload();
    await page.waitForFunction(
      () => window.architectureHistoryDiagnostics?.().snapshots === 4,
    );
    assert.equal(await page.locator(".architecture-chart circle").count(), 4);
    assert.equal(
      await page.locator(".evolution-line").count(),
      2,
      "Analysis changes must break the trajectory",
    );
    const slider = page.getByLabel("Release observation", { exact: true });
    await slider.fill("1");
    assert.ok(
      (await page.locator(".architecture-observation").innerText()).includes(
        "Support change +1",
      ),
    );
    await page.getByLabel("Release share", { exact: true }).check();
    assert.ok(
      (
        await page.locator(".architecture-chart svg").getAttribute("aria-label")
      ).includes("release share"),
    );
    await page
      .getByLabel("Evolution metric", { exact: true })
      .selectOption("coverage");
    await page.locator(".architecture-history-table summary").click();
    assert.equal(
      await page.locator(".architecture-history-table tbody tr").count(),
      4,
    );
    await page.route(`**/${entries[0].path}`, (route) =>
      route.fulfill({ contentType: "application/json", body: "{}" }),
    );
    await page.reload();
    await page
      .getByText(
        "History unavailable: Architecture snapshot digest mismatch.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.locator(".architecture-chart").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        desktopPixels: colored,
        mobilePixels: mobileColored,
        errors,
      }),
    );
    console.log(
      "PASS architecture rankings, immutable coordinates, retained selection, real Zeckendorf metrics, domain paths, current baseline, deep links, responsive layouts, synthetic multi-release growth, share, analysis boundaries and corrupt-history rejection.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
