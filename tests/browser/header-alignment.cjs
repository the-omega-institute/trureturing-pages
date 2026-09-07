const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const routes = [
  "atlas.html",
  "knowledge/",
  "evolution.html",
  "research.html",
  "library-history.html",
  "library-version.html",
  "conclusions.html",
  "dag.html",
  "knowledge/node/35b9ed520bf5997fd92ed38277ff38290799a1eb64af4b31738a853ddaaf7d4c/",
  "research/wall-sun-sun-golden-unit-lift/",
];
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    for (const [width, height] of [
      [1512, 982],
      [900, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      let previous;
      for (const route of routes) {
        await page.goto(`${root}/${route}`, { waitUntil: "domcontentloaded" });
        const nav = page
          .locator('header nav[aria-label="Primary navigation"]')
          .first();
        await nav.waitFor();
        const box = await nav.boundingBox();
        assert.ok(
          Math.abs(box.x + box.width / 2 - width / 2) < 1,
          `${route} navigation centered at ${width}`,
        );
        if (previous)
          assert.ok(
            Math.abs(box.y - previous.y) < 1,
            `${route} navigation shares its row at ${width}`,
          );
        previous = box;
        assert.deepEqual(
          await nav
            .locator("a")
            .allTextContents()
            .then((items) => items.map((s) => s.trim())),
          ["Explore", "Library", "Evolution", "Research"],
        );
        const header = page.locator("body > header").first();
        const brand = await header.locator(".brand").boundingBox();
        assert.ok(
          brand.y + brand.height <= box.y || brand.x + brand.width <= box.x,
          `${route} brand and navigation do not overlap`,
        );
      }
    }
    console.log(
      "PASS: identical centered navigation and header rows across ten owned pages, desktop, tablet and mobile.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
