const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { gunzipSync } = require("node:zlib");
const base = process.env.ATLAS_URL || "http://127.0.0.1:8765/atlas.html";
const output = process.env.ATLAS_OUTPUT || "artifacts/atlas-spatial-clarity";
fs.mkdirSync(output, { recursive: true });
const tuples = edges => edges.map(e => JSON.stringify(e)).sort();

(async () => {
  const { createPublicModel } = await import("../../site/assets/atlas-public-core.mjs");
  const { validateView } = await import("../../site/assets/atlas-startup-view.mjs");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(60000);
    const errors = [], workers = [], receipts = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("worker", worker => workers.push(worker.url()));
    const get = async path => (await page.request.get(new URL(path, base).href));
    const manifest = await (await get("data/pages-atlas-manifest.v1.json")).json();
    const index = await (await get("data/atlas-startup.v1.json")).json();
    assert.equal(index.layout_profile, "atlas-branched-dag-v5");
    const graph = validateView(JSON.parse(gunzipSync(await (await get(index.fast.graph.path)).body())), manifest);
    const model = createPublicModel(graph);
    await page.goto(base + "?lang=zh-CN");
    await page.waitForFunction(() => window.atlasDiagnostics?.().visuals.landmarks > 0);
    await page.waitForTimeout(800);
    const initial = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    assert.deepEqual(initial.nodeIds.sort(), model.nodes.map(n => n.id).sort());
    assert.deepEqual(tuples(initial.edgePairs), tuples(model.edges.map(e => [e.source, e.target])));
    assert.equal(initial.visibleEdges, model.edges.length);
    const labels = await page.locator(".node-label").evaluateAll(items => items.filter(e => getComputedStyle(e).visibility === "visible").map(e => e.getBoundingClientRect().toJSON()));
    assert.ok(labels.length >= 6);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      assert.ok(!(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top), "Landmark labels must not overlap");
    }
    await page.screenshot({ path: output + "/desktop.png" });
    await page.locator("#fit-all").click();
    await page.waitForTimeout(800);
    const full = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(full.nodes, initial.nodes);
    assert.match(await page.locator("#camera-scope").innerText(), new RegExp(initial.nodes.toLocaleString("en-US")));
    await page.locator("#previous-view").click();
    await page.waitForTimeout(700);
    const restored = await page.evaluate(() => window.atlasDiagnostics());
    assert.ok(Math.hypot(...restored.camera.map((value, i) => value - initial.camera[i])) < 1);
    const degree = n => model.parents.get(n.id).size + model.children.get(n.id).size;
    const node = model.nodes.filter(n => degree(n) > 0 && degree(n) < 50).sort((a, b) => degree(b) - degree(a))[0];
    const direct = new Set([node.id, ...model.parents.get(node.id), ...model.children.get(node.id)]);
    await page.locator("#concept-query").fill(node.id);
    await page.locator("#search-results button").first().click();
    await page.waitForFunction(id => window.atlasDiagnostics().selected === id, node.id);
    await page.waitForTimeout(800);
    const selected = await page.evaluate(() => window.atlasDiagnostics({ includeGraph: true }));
    assert.deepEqual(new Set(selected.nodeIds), direct);
    const size = await page.locator("#graph").boundingBox();
    for (const [id, point] of Object.entries(selected.positions)) {
      for (const axis of ["x", "y", "z"]) assert.equal(point[axis], initial.positions[id][axis]);
      assert.ok(point.screen.x >= 0 && point.screen.x <= size.width && point.screen.y >= 100 && point.screen.y <= size.height - 50, "Every direct neighbor fits the camera");
    }
    const points = selected.edgePairs.map(([source, target]) => {
      const a = selected.positions[source].screen, b = selected.positions[target].screen;
      return {x: size.x + (a.x + b.x) / 2, y: size.y + (a.y + b.y) / 2, length: Math.hypot(a.x - b.x, a.y - b.y)};
    }).filter(p => p.length > 40).sort((a, b) => b.length - a.length);
    let clickedImport = null;
    for (const point of points.slice(0, 15)) {
      if (!await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS", point)) continue;
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(180);
      const tooltip = page.locator(".import-tooltip");
      if (!await tooltip.count()) continue;
      const from = await tooltip.getAttribute("data-source"), to = await tooltip.getAttribute("data-target");
      assert.ok(model.edges.some(e => e.source === from && e.target === to));
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(id => window.atlasDiagnostics().selected === id, to);
      clickedImport = {source: from, target: to};
      break;
    }
    assert.ok(clickedImport, "Real imports expose endpoint tooltips and open their dependent on click");
    await page.locator("#back-to-all").click();
    receipts.push({case: "desktop", nodes: initial.nodes, edges: initial.edges, labels: labels.length, clickedImport});
    for (const [width, height, language] of [[1024, 900, "zh-CN"], [820, 1000, "en"], [390, 844, "zh-CN"], [320, 740, "en"]]) {
      await page.setViewportSize({width, height});
      await page.goto(base + "?lang=" + language);
      await page.waitForFunction(() => window.atlasDiagnostics?.().nodes > 0);
      await page.waitForTimeout(800);
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        labels: [...document.querySelectorAll(".node-label")].filter(e => getComputedStyle(e).visibility === "visible").length,
      }));
      assert.equal(metrics.overflow, false);
      assert.ok(metrics.labels > 0);
      await page.screenshot({path: output + "/" + language + "-" + width + ".png"});
      receipts.push({case: language + "-" + width, ...metrics});
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(workers, [], "Published v5 positions require no browser layout worker");
    fs.writeFileSync(output + "/receipt.json", JSON.stringify({receipts, errors, workers}, null, 2));
    console.log(JSON.stringify({receipts, errors, workers}));
  } finally {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
