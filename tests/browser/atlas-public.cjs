const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const output = path.resolve("artifacts/atlas-preview/screenshots");
const url = process.env.ATLAS_URL || "http://127.0.0.1:8765/atlas.html";
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(
      () => typeof window.atlasDiagnostics === "function",
      { timeout: 60000 },
    );
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(output, "desktop-overview.png") });
    const initial = await page.evaluate(() => window.atlasDiagnostics());
    console.log(
      JSON.stringify({
        initialNodes: initial.nodes,
        initialEdges: initial.edges,
        errors,
        labels: await page.locator(".family-label:visible").allTextContents(),
      }),
    );
    const png = PNG.sync.read(await page.locator("#graph canvas").screenshot());
    let colored = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) > 65)
        colored++;
    }
    assert.ok(
      colored > 1000,
      `Graph canvas appears blank: ${colored} visible pixels`,
    );
    assert.equal(errors.length, 0);
    console.log(`Canvas: ${colored} non-background pixels`);
    if (process.env.ATLAS_SMOKE_ONLY) return;
    await page
      .getByRole("button", { name: "Rotate structure", exact: true })
      .click();
    const cameraBefore = await page.evaluate(
      () => window.atlasDiagnostics().camera,
    );
    await page.waitForTimeout(500);
    const cameraAfter = await page.evaluate(
      () => window.atlasDiagnostics().camera,
    );
    assert.notDeepEqual(
      cameraBefore,
      cameraAfter,
      "Rotation should move the camera",
    );
    await page
      .getByRole("button", { name: "Rotate structure", exact: true })
      .click();
    await page
      .locator(".family-row")
      .filter({ hasText: "Quantum structures" })
      .click();
    await page.waitForTimeout(900);
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().family),
      "quantum",
    );
    await page.screenshot({ path: path.join(output, "desktop-family.png") });
    await page
      .getByLabel("Find a concept", { exact: true })
      .fill("Mellin Reconstruction");
    await page.locator("#search-results button").first().click();
    await page.waitForTimeout(900);
    const selected = await page.evaluate(() => window.atlasDiagnostics());
    assert.ok(selected.selected.includes("CompletedZetaMellinReconstruction"));
    assert.ok(await page.locator(".article-copy").innerText());
    await page.screenshot({ path: path.join(output, "desktop-concept.png") });
    await page.getByRole("tab", { name: "Connections", exact: true }).click();
    assert.ok((await page.locator("#wiki .concept-row").count()) > 0);
    const positionsBefore = selected.positions;
    await page.locator("#wiki .concept-row").first().click();
    const neighborSelected = await page.evaluate(() =>
      window.atlasDiagnostics(),
    );
    assert.notEqual(neighborSelected.selected, selected.selected);
    for (const [id, p] of Object.entries(neighborSelected.positions)) {
      if (positionsBefore[id])
        assert.deepEqual(
          [p.x, p.y, p.z],
          [positionsBefore[id].x, positionsBefore[id].y, positionsBefore[id].z],
        );
    }
    await page
      .getByRole("button", { name: "Return to all concepts", exact: true })
      .click();
    await page.waitForTimeout(900);
    const reset = await page.evaluate(() => window.atlasDiagnostics());
    assert.equal(reset.nodes, initial.nodes);
    assert.equal(reset.selected, null);
    const screenNode = Object.entries(reset.positions).find(
      ([id, p]) =>
        p.screen.x > 260 &&
        p.screen.x < 480 &&
        p.screen.y > 320 &&
        p.screen.y < 450,
    );
    assert.ok(screenNode, "Expected a draggable visible node");
    const graphRect = await page.locator("#graph").boundingBox();
    const [, dragPoint] = screenNode;
    await page.mouse.move(
      graphRect.x + dragPoint.screen.x,
      graphRect.y + dragPoint.screen.y,
    );
    await page.mouse.down();
    await page.mouse.move(
      graphRect.x + dragPoint.screen.x + 48,
      graphRect.y + dragPoint.screen.y + 20,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.waitForTimeout(200);
    const dragged = await page.evaluate(() => window.atlasDiagnostics());
    const moved = Object.entries(dragged.positions).filter(
      ([id, p]) =>
        p.x !== reset.positions[id].x ||
        p.y !== reset.positions[id].y ||
        p.z !== reset.positions[id].z,
    );
    assert.equal(moved.length, 1, "Dragging moves exactly one node");
    console.log(`Dragged one node: ${moved[0][0]}`);
    const pointerTarget = moved[0][1].screen;
    await page.mouse.move(
      graphRect.x + pointerTarget.x,
      graphRect.y + pointerTarget.y,
    );
    await page.waitForTimeout(100);
    await page.mouse.click(
      graphRect.x + pointerTarget.x,
      graphRect.y + pointerTarget.y,
    );
    await page.waitForFunction(() => window.atlasDiagnostics().selected, {
      timeout: 3000,
    });
    await page
      .getByRole("button", { name: "Dependencies", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().mode),
      "dependency",
    );
    await page
      .getByRole("button", { name: "Open questions", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.atlasDiagnostics().mode),
      "frontier",
    );
    await page.screenshot({ path: path.join(output, "desktop-frontier.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await page.waitForFunction(
      () => typeof window.atlasDiagnostics === "function",
      { timeout: 60000 },
    );
    await page.waitForTimeout(1000);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Mobile page should not overflow horizontally",
    );
    await page.screenshot({
      path: path.join(output, "mobile-overview.png"),
      fullPage: true,
    });
    const mobilePng = PNG.sync.read(
      await page.locator("#graph canvas").screenshot(),
    );
    let mobileColored = 0;
    for (let i = 0; i < mobilePng.data.length; i += 4)
      if (
        Math.max(
          mobilePng.data[i],
          mobilePng.data[i + 1],
          mobilePng.data[i + 2],
        ) > 65
      )
        mobileColored++;
    assert.ok(
      mobileColored > 500,
      `Mobile canvas appears blank: ${mobileColored} pixels`,
    );
    await page
      .getByLabel("Find a concept", { exact: true })
      .fill("Mellin Reconstruction");
    await page.locator("#search-results button").first().click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(output, "mobile-concept.png") });
    const wikiBox = await page.locator("#wiki").boundingBox();
    assert.ok(
      wikiBox.y > 200 && wikiBox.y < 500,
      "Wiki should open as a mobile bottom sheet",
    );
    const mobileGraph = await page.locator("#graph").boundingBox();
    assert.ok(
      mobileGraph.y + mobileGraph.height <= wikiBox.y + 1,
      "The Wiki must not cover the graph",
    );
    const deepLink = page.url();
    await page.reload();
    await page.waitForFunction(
      () =>
        typeof window.atlasDiagnostics === "function" &&
        window.atlasDiagnostics().selected,
      { timeout: 60000 },
    );
    assert.equal(page.url(), deepLink, "Shared concept URL survives reload");
    for (const [name, width, height] of [
      ["wide", 1920, 1080],
      ["tablet", 820, 1180],
      ["small-mobile", 360, 780],
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .getByRole("button", { name: "All concepts", exact: true })
        .click();
      await page.waitForTimeout(900);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} has horizontal overflow`,
      );
      await page.screenshot({
        path: path.join(output, `${name}-overview.png`),
      });
      if (name !== "small-mobile") {
        await page
          .getByLabel("Find a concept", { exact: true })
          .fill("Mellin Reconstruction");
        await page.locator("#search-results button").first().click();
      }
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    const failedPage = await browser.newPage();
    await failedPage.route("**/data/pages-atlas-view.v1.json", (route) =>
      route.fulfill({ contentType: "application/json", body: "{}" }),
    );
    await failedPage.goto(url);
    await failedPage
      .getByText("Graph digest does not match the published manifest.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await failedPage.locator("canvas").count(),
      0,
      "Invalid published graph is not rendered",
    );
    await failedPage.close();
    console.log(
      `PASS: canvas clicks, search, family focus, Wiki, related concepts, stable positions, drag, rotation, modes, five viewports, deep links, corrupt-release rejection. Mobile canvas: ${mobileColored} visible pixels.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
