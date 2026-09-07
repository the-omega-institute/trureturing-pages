const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const sha = (text) =>
  "sha256:" + createHash("sha256").update(text).digest("hex");

(async () => {
  const core = await import("../../site/assets/architecture-core.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    reducedMotion: "reduce",
  });
  try {
    const get = async (file) =>
      (await page.request.get(`${root}/${file}`)).json();
    const graph = await get("data/pages-atlas-view.v1.json");
    const manifest = await get("data/pages-atlas-manifest.v1.json");
    const library = await get("data/library-history.v1.json");
    const current = core.snapshotFromGraph(graph, manifest.atlas_graph_digest);
    const added = current.nodes.find(
      (n) =>
        n.direct === 0 && current.dependency_edges.some((e) => e[1] === n.id),
    ).id;
    const changed = current.nodes.find((n) => n.id !== added).id;
    // These observations exist only in intercepted browser responses, never in site artifacts.
    const olderGraph = structuredClone(graph);
    olderGraph.source_snapshot.truth_release_digest = sha(
      "visual-test-previous-release",
    );
    olderGraph.source_snapshot.source_commit = "b".repeat(40);
    olderGraph.nodes = olderGraph.nodes
      .filter((n) => n.id !== added)
      .map((n) => {
        delete n.descendant_count;
        delete n.out_degree;
        delete n.true_depth;
        return n;
      });
    olderGraph.edges = olderGraph.edges.filter(
      (e) => e.source !== added && e.target !== added,
    );
    const previous = core.snapshotFromGraph(
      olderGraph,
      sha(JSON.stringify(olderGraph)),
    );
    const entries = [];
    for (const snapshot of [previous, current]) {
      const text = JSON.stringify(snapshot),
        digest = sha(text),
        file = `data/architecture/${digest.slice(7)}.json`;
      entries.push({
        path: file,
        digest,
        truth_release_digest: snapshot.truth_release_digest,
        atlas_graph_digest: snapshot.atlas_graph_digest,
      });
      await page.route(`**/${file}`, (route) =>
        route.fulfill({ contentType: "application/json", body: text }),
      );
    }
    await page.route("**/data/architecture-history.v1.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schema_version: core.HISTORY_SCHEMA,
          current_truth_release_digest: current.truth_release_digest,
          entries,
        }),
      }),
    );
    const oldLibraryText = JSON.stringify({
      schema_version: "pages-library-snapshot.v1",
      truth_release_digest: previous.truth_release_digest,
      atlas_graph_digest: previous.atlas_graph_digest,
      graph: olderGraph,
      problems: [],
    });
    const oldDigest = sha(oldLibraryText),
      oldPath = `data/library/${oldDigest.slice(7)}.json`;
    await page.route(`**/${oldPath}`, (route) =>
      route.fulfill({ contentType: "application/json", body: oldLibraryText }),
    );
    library.entries = [
      {
        path: oldPath,
        digest: oldDigest,
        truth_release_digest: previous.truth_release_digest,
        atlas_graph_digest: previous.atlas_graph_digest,
      },
      library.entries.at(-1),
    ];
    const timeline = JSON.stringify({
      schema_version: "pages-content-timeline.v1",
      nodes: {
        [added]: [{ observation: 1, present: true, event: "Appeared" }],
        [changed]: [
          { observation: 1, present: true, event: "Content changed" },
        ],
      },
      problems: {},
    });
    const timelineDigest = sha(timeline),
      timelinePath = `data/library/${timelineDigest.slice(7)}.json`;
    library.timeline = { path: timelinePath, digest: timelineDigest };
    await page.route(`**/${timelinePath}`, (route) =>
      route.fulfill({ contentType: "application/json", body: timeline }),
    );
    await page.route("**/data/library-history.v1.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(library),
      }),
    );
    await page.goto(`${root}/atlas.html`);
    await page.waitForFunction(
      () =>
        window.atlasDiagnostics?.().changes?.kind === "comparable" &&
        window.atlasDiagnostics?.().visuals.bundles > 0,
    );
    let diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.changes.added, 1);
    assert.equal(diagnostics.changes.changed, 1);
    assert.ok(diagnostics.changes.edgesAdded > 0);
    assert.equal(
      diagnostics.changes.active,
      false,
      "Reduced-motion preference suppresses automatic pulses",
    );
    await page
      .getByRole("button", { name: "Show release changes", exact: true })
      .click();
    diagnostics = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(diagnostics.visuals.changeHalos, 2);
    assert.equal(diagnostics.changes.active, true);
    assert.equal(await page.locator("#wiki-content .concept-row").count(), 2);
    assert.ok(
      (await page.locator("#wiki-content").innerText()).includes(
        "What changed",
      ),
    );
    const output = path.resolve("artifacts/atlas-preview/screenshots");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({
      path: path.join(output, "visual-release-changes-fixture.png"),
    });
    await page
      .getByRole("button", { name: "Show release changes", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().visuals.changeHalos),
      0,
    );
    console.log(
      "PASS: a browser-only second-release fixture activates exact new-node, changed-content and new-dependency highlights; manual controls work and reduced motion suppresses automatic pulses.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
