const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.layoutTiming = {};
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          if (!String(url).includes("atlas-public-worker")) return;
          window.layoutTiming.start = performance.now();
          this.addEventListener("message", ({ data }) => {
            if (data.positions) window.layoutTiming.end = performance.now();
          });
        }
      };
    });
    for (const visit of ["cold", "repeat"]) {
      await page.goto(
        process.env.ATLAS_URL || "http://127.0.0.1:8766/atlas.html",
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction(
        () =>
          window.atlasDiagnostics && document.querySelector("#loading").hidden,
        null,
        { timeout: 90000 },
      );
      const result = await page.evaluate(() => ({
        visitReadyMs: Math.round(performance.now()),
        layoutMs: window.layoutTiming.end
          ? Math.round(window.layoutTiming.end - window.layoutTiming.start)
          : 0,
        phases: window.atlasDiagnostics().startup || null,
        requests: performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes("/data/"))
          .map((r) => ({
            path: new URL(r.name).pathname.split("/").slice(-2).join("/"),
            startMs: Math.round(r.startTime),
            durationMs: Math.round(r.duration),
            transferBytes: r.transferSize,
            decodedBytes: r.decodedBodySize,
          })),
      }));
      console.log(JSON.stringify({ visit, ...result }));
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
