const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");
const base = process.env.ATLAS_URL || "http://127.0.0.1:8765/atlas.html";
const output = process.env.ATLAS_OUTPUT || "artifacts/atlas-preview/full-dag";
fs.mkdirSync(output, { recursive: true });
const pairs = edges => edges.map(e => JSON.stringify(e)).sort();

(async () => {
  const { createPublicModel } = await import("../../site/assets/atlas-public-core.mjs");
  const { mathematicalArchitecture } = await import("../../site/assets/architecture-core.mjs");
  const { theoryModel, LEGACY_ROUTE_ANCHORS } = await import("../../site/assets/atlas-theory-core.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1512, height: 982 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const index = await (await page.request.get(new URL("data/atlas-startup.v1.json", base).href)).json();
    const response = await page.request.get(new URL(index.graph.path, base).href);
    const graph = JSON.parse(gunzipSync(await response.body()));
    const { applyAdmission } = await import("../../site/assets/atlas-admission.mjs");
    const manifest = await (await page.request.get(new URL("data/pages-atlas-manifest.v1.json", base).href)).json();
    const admission = JSON.parse(gunzipSync(await (await page.request.get(new URL(index.admission.path, base).href)).body()));
    const model = createPublicModel(applyAdmission(graph, manifest, admission));
    const theory = theoryModel(model, mathematicalArchitecture(model));
    const expectedNodes = model.nodes.map(n => n.id).sort();
    const expectedEdges = pairs(model.edges.map(e => [e.source, e.target]));
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.layoutWorkers = 0;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (/atlas-(public|dag)-worker/.test(String(url))) window.layoutWorkers++;
        }
      };
    });
    await page.goto(base + "?lang=en");
    await page.waitForFunction(() => window.atlasDiagnostics, null, { timeout: 60000 });
    await page.waitForTimeout(900);
    const initial = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    const assertFull = async () => {
      const d = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
      assert.equal(d.mode, "theory");
      assert.equal(d.theory.component, null);
      assert.deepEqual(d.nodeIds.sort(), expectedNodes);
      assert.deepEqual(pairs(d.edgePairs), expectedEdges, "Every actual import is rendered, including cross-parent and shortcut edges");
      assert.equal(d.visibleEdges, model.edges.length, "No proof edges are hidden by Structure bundling");
      return d;
    };
    await assertFull();
    assert.equal(await page.evaluate(() => window.layoutWorkers), 0, "Published positions require no client simulation");
    assert.equal(initial.theory.components, theory.components.length);
    assert.equal(initial.theory.largestComponent, theory.components[0].ids.length);
    assert.equal(initial.theory.isolated, theory.isolated);
    const assertPresentation = async target => {
      const facts = await target.locator(".dag-facts").evaluate(node => ({
        display: getComputedStyle(node).display,
        cells: [...node.children].map(item => ({ x: item.getBoundingClientRect().x, y: item.getBoundingClientRect().y })),
        values: [...node.querySelectorAll("dd")].map(item => item.textContent.replaceAll(",", "")),
        semanticOrder: [...node.children].every(item => item.firstElementChild.tagName === "DT"),
      }));
      assert.equal(facts.display, "grid");
      assert.equal(facts.cells[0].y, facts.cells[1].y);
      assert.ok(facts.cells[1].x > facts.cells[0].x, "Statistics remain in two columns");
      assert.deepEqual(facts.values, [model.nodes.length, model.edges.length, theory.components.length, theory.maxDepth].map(String));
      assert.ok(facts.semanticOrder, "Each statistic's term precedes its definition");
      const label = target.locator(".dag-isolated-label");
      assert.ok((await label.textContent()).includes(theory.isolated.toLocaleString("en-US")), "Grid annotation retains its count when collision handling hides it on a narrow viewport");
      assert.ok((await target.locator(".dag-connectivity").innerText()).includes((theory.components.length - theory.isolated).toLocaleString("en-US")));
    };
    await assertPresentation(page);
    assert.equal(await page.locator(".dag-isolated-label").evaluate(node => getComputedStyle(node).visibility), "visible");
    assert.equal(await page.locator(".theory-route").count(), 0);
    assert.equal(await page.locator(".family-label:visible").count(), 0);
    for (const edge of model.edges) assert.ok(initial.positions[edge.source].y > initial.positions[edge.target].y);
    await page.screenshot({ timeout: 30000, path: path.join(output, "full-dag-desktop.png") });
    const overviewCamera = initial.camera;
    await page.getByRole("button", { name: "Locate unconnected modules →", exact: true }).click();
    await assertFull();
    const isolatedCamera = await page.evaluate(() => window.atlasDiagnostics().camera);
    assert.notDeepEqual(isolatedCamera, overviewCamera, "Locating the grid moves the camera while retaining the complete graph");
    await page.screenshot({ timeout: 30000, path: path.join(output, "unconnected-modules.png") });
    await page.getByRole("button", { name: "Previous view", exact: true }).click();
    await assertFull();

    await page.getByRole("button", { name: /^Focus the largest connected component/ }).click();
    const component = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    assert.deepEqual(component.nodeIds.sort(), theory.components[0].ids);
    assert.deepEqual(pairs(component.edgePairs), pairs(model.edges.filter(e => theory.components[0].members.has(e.source)).map(e => [e.source, e.target])));
    assert.ok(page.url().includes("component="));
    await page.screenshot({ timeout: 30000, path: path.join(output, "largest-component.png") });
    await page.getByRole("button", { name: "Previous view", exact: true }).click();
    await assertFull();
    await page.getByRole("button", { name: /^Focus the largest connected component/ }).click();
    await page.getByRole("button", { name: "Return to the whole DAG", exact: true }).click();
    await assertFull();

    await page.locator("#wiki-content .concept-row").first().click();
    assert.ok(await page.locator(".article-copy").innerText());
    const selected = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    const selectedIds = new Set(selected.nodeIds), selectedEdges = new Set(pairs(selected.edgePairs));
    assert.ok(expectedNodes.every(id => selectedIds.has(id)), "Selecting a module keeps the full mathematical context");
    assert.ok(expectedEdges.every(pair => selectedEdges.has(pair)));
    await page.locator(".article-audit > summary").click();
    const sourceLink = await page.getByRole("link", { name: "Lean source at this release", exact: true }).getAttribute("href");
    assert.match(sourceLink, /github\.com\/the-omega-institute\/trureturing\/blob\/[a-f0-9]{40}\/.*\.lean$/);
    await page.screenshot({ timeout: 30000, path: path.join(output, "module-dependencies.png") });
    await page.getByRole("button", { name: "Previous view", exact: true }).click();
    await assertFull();
    await page.getByRole("button", { name: "Structure", exact: true }).click();
    await page.getByRole("button", { name: "Full DAG", exact: true }).click();
    await assertFull();
    await page.getByRole("button", { name: "Dependencies", exact: true }).click();
    const dependency = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    assert.deepEqual(dependency.nodeIds.sort(), expectedNodes);
    assert.deepEqual(pairs(dependency.edgePairs), expectedEdges);
    assert.equal(dependency.visibleEdges, model.edges.length);
    await page.getByRole("button", { name: "Full DAG", exact: true }).click();
    await page.getByLabel("Find a concept", { exact: true }).fill("Mellin Reconstruction");
    await page.locator("#search-results button").first().click();
    assert.ok((await page.evaluate(() => window.atlasDiagnostics().selected)).includes("CompletedZetaMellinReconstruction"));
    await page.getByRole("button", { name: "Return to all concepts", exact: true }).click();
    await assertFull();

    console.log("PASS: full graph, component scope, sources, search and mode transitions");
    await page.close();
    const zh = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1512, height: 982 } });
    zh.on("pageerror", e => errors.push(e.message));
    await zh.goto(base + "?lang=zh-CN#route=measurement");
    await zh.waitForFunction(() => window.atlasDiagnostics?.().selected, null, { timeout: 60000 });
    assert.equal(await zh.evaluate(() => window.atlasDiagnostics().selected), LEGACY_ROUTE_ANCHORS.measurement);
    assert.ok((await zh.evaluate(() => window.atlasDiagnostics().nodes)) >= model.nodes.length, "Legacy route links locate a node in the complete graph");
    await zh.screenshot({ timeout: 30000, path: path.join(output, "full-dag-chinese-module.png") });
    await zh.locator("#back-to-all").click();
    await assertPresentation(zh);
    assert.match(await zh.locator(".dag-isolated-label").innerText(), /无图内连线/);
    await zh.screenshot({ timeout: 30000, path: path.join(output, "full-dag-chinese.png") });

    console.log("PASS: Chinese and legacy route links retain the complete graph");
    await zh.close();
    const mobile = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on("pageerror", e => errors.push(e.message));
    await mobile.goto(base + "?lang=en");
    await mobile.waitForFunction(() => window.atlasDiagnostics, null, { timeout: 60000 });
    assert.equal(await mobile.evaluate(() => window.atlasDiagnostics().nodes), model.nodes.length);
    assert.equal(await mobile.evaluate(() => window.atlasDiagnostics().visibleEdges), model.edges.length);
    await assertPresentation(mobile);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({ timeout: 30000, path: path.join(output, "full-dag-mobile.png"), fullPage: true });
    await mobile.locator("#wiki-content .concept-row").first().click();
    assert.ok(await mobile.locator("#wiki").evaluate(node => node.classList.contains("has-selection")));
    await mobile.getByRole("button", { name: "Previous view", exact: true }).click();
    assert.equal(await mobile.evaluate(() => window.atlasDiagnostics().nodes), model.nodes.length);
    assert.deepEqual(errors, []);
    const receipt = { nodes: initial.nodes, edges: initial.edges, visibleEdges: initial.visibleEdges, theory: initial.theory, startup: initial.startup, exactNodeAndEdgeMatch: true, errors };
    fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 2000))]); }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
