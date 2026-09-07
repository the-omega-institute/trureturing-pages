const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const assert = require("node:assert/strict");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let releaseResearch;
  const researchGate = new Promise((resolve) => {
    releaseResearch = resolve;
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    });
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.layoutWorkers = 0;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (String(url).includes("atlas-public-worker"))
            window.layoutWorkers++;
        }
      };
    });
    await page.route("**/data/library-history.v1.json", async (route) => {
      await researchGate;
      await route.continue();
    });
    await page.goto(`${root}/atlas.html`);
    await page.waitForFunction(() => window.atlasDiagnostics);
    const initial = await page.evaluate(() => ({
      ...window.atlasDiagnostics(),
      workers: window.layoutWorkers,
    }));
    assert.equal(initial.startup.source, "precomputed");
    assert.equal(initial.workers, 0);
    assert.equal(initial.nodes, 2890);
    assert.equal(
      initial.researchQuestions,
      0,
      "Graph must be ready while research is still waiting",
    );
    await page.waitForTimeout(800);
    const png = PNG.sync.read(await page.locator("#graph canvas").screenshot());
    let colored = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (Math.max(...png.data.subarray(i, i + 3)) > 65) colored++;
    assert.ok(colored > 1000);
    await page
      .getByRole("button", { name: "Open questions", exact: true })
      .click();
    assert.ok(
      (await page.locator("#wiki-content").innerText()).includes(
        "Loading research catalog",
      ),
    );
    releaseResearch();
    await page.locator(".research-question").first().waitFor();
    assert.equal(await page.locator(".research-question").count(), 7);
    await page.close();

    const cached = await browser.newPage();
    for (const visit of ["cold", "repeat"]) {
      await cached.goto(`${root}/atlas.html`);
      await cached.waitForFunction(() => window.atlasDiagnostics);
      const resources = await cached.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes("/data/atlas-startup/"))
          .map((r) => ({ bytes: r.transferSize, decoded: r.decodedBodySize })),
      );
      assert.equal(resources.length, 2);
      if (visit === "repeat")
        assert.ok(
          resources.every((r) => r.bytes === 0 && r.decoded > 0),
          "Repeat visits reuse both immutable startup artifacts",
        );
    }
    const index = await (
      await cached.request.get(`${root}/data/atlas-startup.v1.json`)
    ).json();
    const invalid = await browser.newPage();
    await invalid.route(`**/${index.layout.path}`, (route) =>
      route.fulfill({
        body: "corrupt",
        contentType: "application/octet-stream",
      }),
    );
    await invalid.goto(`${root}/atlas.html`);
    await invalid
      .getByText("Atlas startup artifact digest mismatch.", { exact: true })
      .waitFor();
    assert.equal(await invalid.locator("canvas").count(), 0);
    console.log(
      "PASS: precomputed layout without browser simulation, first paint independent of Research, eventual research availability, immutable repeat-visit caching and corrupt layout rejection.",
    );
  } finally {
    releaseResearch();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
