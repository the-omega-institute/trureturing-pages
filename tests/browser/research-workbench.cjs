const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = process.env.ATLAS_ORIGIN || "http://127.0.0.1:8767";
const key = "trureturing.pages.research-notes.v1";
const output = path.resolve("artifacts/atlas-preview/screenshots");
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    await fs.mkdir(output, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1512, height: 982 },
    });
    const page = await context.newPage(),
      second = await context.newPage();
    const open = async (p) => {
      p.on("pageerror", (error) => errors.push(error.message));
      await p.goto(`${root}/research.html`);
      await p.locator(".rw-card").first().waitFor();
      assert.equal(await p.locator(".rw-card").count(), 41);
    };
    await open(page);
    await open(second);
    await page.locator("#question-dfao-finite-unsat > summary").click();
    await page
      .locator("#note-dfao-finite-unsat")
      .fill("First tab evidence <script>private</script>");
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key))?.entries[
          "dfao-finite-unsat"
        ]?.note.includes("First tab"),
      key,
    );
    await second.locator("#question-mub-basis-context > summary").click();
    await second.locator("#note-mub-basis-context").fill("Second tab evidence");
    await second.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key))?.entries["mub-basis-context"]
          ?.note === "Second tab evidence",
      key,
    );
    assert.match(
      (await stored(second)).entries["dfao-finite-unsat"].note,
      /First tab/,
    );
    await second.locator("#question-dfao-finite-unsat > summary").click();
    await second.locator("#stage-dfao-finite-unsat").selectOption("working");
    await second.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key))?.entries["dfao-finite-unsat"]
          ?.stage === "working",
      key,
    );
    assert.match(
      (await stored(second)).entries["dfao-finite-unsat"].note,
      /First tab/,
      "Editing another field preserves the note saved by another tab",
    );
    await Promise.all([
      page
        .locator("#note-dfao-finite-unsat")
        .fill("Concurrent first tab evidence"),
      second.locator("#stage-dfao-finite-unsat").selectOption("blocked"),
    ]);
    await page.waitForFunction((key) => {
      const entry = JSON.parse(localStorage.getItem(key))?.entries[
        "dfao-finite-unsat"
      ];
      return (
        entry?.note === "Concurrent first tab evidence" &&
        entry.stage === "blocked"
      );
    }, key);
    await page.reload();
    await page.locator("#question-dfao-finite-unsat > summary").click();
    assert.equal(
      await page.locator("#stage-dfao-finite-unsat").inputValue(),
      "blocked",
    );
    assert.match(
      await page.locator("#note-dfao-finite-unsat").inputValue(),
      /Concurrent first tab/,
    );
    const issue = await page
      .locator("#question-dfao-finite-unsat")
      .getByRole("link", { name: "Record progress on GitHub" })
      .getAttribute("href");
    assert.equal(issue.includes("private"), false);
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export notebook", exact: true })
      .click();
    const notebook = JSON.parse(
      await fs.readFile(await (await downloadEvent).path(), "utf8"),
    );
    assert.equal(
      notebook.entries["mub-basis-context"].note,
      "Second tab evidence",
    );
    const imported = {
      ...notebook,
      entries: {
        "dfao-finite-unsat": {
          ...notebook.entries["dfao-finite-unsat"],
          note: "Imported evidence",
        },
      },
    };
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "notebook.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(imported)),
      });
    await page.getByText(/Imported 1 entries/).waitFor();
    assert.equal(
      (await stored(page)).entries["mub-basis-context"].note,
      "Second tab evidence",
    );
    const before = await stored(page);
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
    await page.getByText(/Import rejected/).waitFor();
    assert.deepEqual(await stored(page), before);
    await page.locator("#rw-literature").selectOption("new");
    await page.locator("#rw-kind").selectOption("open-question");
    assert.equal(await page.locator(".rw-card").count(), 6);
    await page.evaluate(() => {
      location.hash = "rp=suzuki-boundary-characteristic-limit";
    });
    await page
      .locator("#question-suzuki-boundary-characteristic-limit[open]")
      .waitFor();
    assert.equal(await page.locator(".rw-card").count(), 41);
    assert.equal(
      await page
        .locator("#question-suzuki-boundary-characteristic-limit")
        .getByRole("link", { name: "Pinned arXiv source", exact: true })
        .getAttribute("href"),
      "https://arxiv.org/abs/2606.09096v1",
    );
    await page.locator("#research-release-dossiers > summary").click();
    assert.equal(await page.locator(".problem-row:visible").count(), 7);
    for (const width of [1512, 390, 320]) {
      await page.setViewportSize({ width, height: 982 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(150);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const nav = await page.locator("body > header nav").boundingBox();
      assert.ok(Math.abs(nav.x + nav.width / 2 - width / 2) < 1);
      await page.screenshot({
        path: path.join(output, `research-workbench-${width}.png`),
      });
    }
    const unavailable = await context.newPage();
    await unavailable.route("**/research-catalog.json", (route) =>
      route.abort(),
    );
    await unavailable.goto(`${root}/research.html`);
    await unavailable.locator(".rw-load-error").waitFor();
    assert.equal(await unavailable.locator(".problem-row:visible").count(), 7);
    const denied = await context.newPage();
    await denied.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Test quota denial", "QuotaExceededError");
      };
    });
    await denied.goto(`${root}/research.html#rp=dfao-finite-unsat`);
    await denied.locator("#note-dfao-finite-unsat").fill("Unsaved evidence");
    await denied.getByText(/Browser storage unavailable or full/).waitFor();
    const unsavedDownload = denied.waitForEvent("download");
    await denied
      .getByRole("button", { name: "Export notebook", exact: true })
      .click();
    const unsaved = JSON.parse(
      await fs.readFile(await (await unsavedDownload).path(), "utf8"),
    );
    assert.equal(unsaved.entries["dfao-finite-unsat"].note, "Unsaved evidence");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual HTTP modules, 41 targets, native persistence and reload, cross-tab note/field preservation, import/export, private-note exclusion, literature filters, permalinks, original dossiers, three widths and catalog-failure fallback.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
