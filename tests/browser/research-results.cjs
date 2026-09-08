const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8766";
const catalog = JSON.parse(fs.readFileSync("site/assets/research-news.json", "utf8"));
const stories = JSON.parse(fs.readFileSync("site/assets/result-stories.json", "utf8"));
const shots = "artifacts/atlas-preview/screenshots";
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const errors = [], missing = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("response", r => { if (r.status() >= 400) missing.push(r.url()); });
    await page.route("**/trureturing-mdbook/**", r => r.abort());
    for (const width of [1512, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const item of catalog.results) {
        await page.goto(`${root}/research.html`);
        await page.locator(`#${item.id}`).getByRole("link", { name: "Read result", exact: true }).click();
        await page.waitForURL(`**/results/${item.id}/`);
        assert.equal(await page.locator(".knowledge-header [aria-current=page]").innerText(), "Research");
        await page.locator(".result-equations .katex").first().waitFor();
        assert.equal(await page.locator(".katex-error").count(), 0);
        assert.equal(await page.getByRole("link", { name: `Development PR #${item.pr}`, exact: true }).isVisible(), false);
        assert.equal(await page.locator("#question").count(), 1);
        assert.equal(await page.locator("#scope").count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (width === 1512 || width === 390) {
          await page.screenshot({ path: `${shots}/result-${item.id}-${width}.png`, fullPage: true });
        }
        await page.getByRole("link", { name: "Lean theorem", exact: true }).click();
        const theorem = await page.locator("#result-theorem").textContent();
        assert.ok(theorem.startsWith(`theorem ${item.declaration} `));
        const original = fs.readFileSync(`site/assets/proofs/${item.id}.lean`, "utf8");
        const [start, end] = stories[item.id].theorem_lines;
        assert.equal(theorem, original.split("\n").slice(start - 1, end).join("\n"));
        await page.getByRole("button", { name: "Copy theorem", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Theorem copied." }).waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), theorem);
        const downloaded = await page.request.get(`${root}/assets/proofs/${item.id}.lean`);
        assert.equal(downloaded.status(), 200);
        assert.equal(crypto.createHash("sha256").update(await downloaded.body()).digest("hex"), stories[item.id].source_sha256);
        await page.getByText("Definitions used in the statement", { exact: true }).click();
        await page.locator(".result-source-details summary").last().click();
        assert.equal(await page.locator(".result-full-source code").textContent(), original);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.getByRole("link", { name: "Research", exact: true }).first().click();
        await page.waitForURL("**/research.html*");
      }
    }
    const plainContext = await browser.newContext({ javaScriptEnabled: false });
    const plain = await plainContext.newPage();
    for (const item of catalog.results) {
      await plain.goto(`${root}/results/${item.id}/`);
      assert.ok((await plain.locator("#result-theorem").innerText()).includes(item.declaration));
      await plain.locator(".result-source-details summary").last().click();
      assert.ok(await plain.locator(".result-full-source").isVisible());
      assert.equal(await plain.getByRole("button", { name: "Copy theorem", exact: true }).isVisible(), false);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    await plainContext.close();
    console.log("PASS: Four result pages at four widths, formulas, local navigation, exact Lean excerpts, copy, full source, download digests and no-JavaScript reading.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
