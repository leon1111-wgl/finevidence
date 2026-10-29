// Separate new-capability boundaries, not extra financial accuracy tasks.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.resolve(
  process.env.BROWSER_ARTIFACTS || "browser-artifacts",
  "brief-recovery",
);
const rows = [1440, 390].flatMap((width) =>
  ["download-retry", "legacy-html"].map((name) => ({
    name,
    width,
    passed: null,
  })),
);
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    for (const row of rows) {
      const context = await browser.newContext({
        viewport: { width: row.width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await context.newPage();
      p.setDefaultTimeout(10000);
      const begin = performance.now();
      try {
        if (row.name === "legacy-html")
          await p.route(base, async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              body: (await response.text()).replace(
                /\s*<button id="export-brief"[\s\S]*?<\/button>/,
                "",
              ),
            });
          });
        await p.goto(base);
        await p.waitForFunction(
          () => document.querySelector("#run")?.disabled === false,
        );
        assert.equal(await p.locator("#export-brief").count(), 1);
        assert.equal(await p.locator("#export-brief").isDisabled(), true);
        await p.click("#run");
        await p.locator(".value").waitFor();
        await p.fill("#notes", "preserved draft before download");
        if (row.name === "download-retry") {
          await p.evaluate(() => {
            const original = URL.createObjectURL;
            URL.createObjectURL = function (blob) {
              URL.createObjectURL = original;
              throw Error("synthetic allocation failure");
            };
          });
          await p.click("#export-brief");
          assert.match(await p.locator("#status").textContent(), /导出未完成/);
          assert.equal(
            await p.inputValue("#notes"),
            "preserved draft before download",
          );
          assert.equal(await p.locator(".value").textContent(), "30.00%");
          assert.equal(await p.locator("#export-brief").isDisabled(), false);
          await p.screenshot({
            path: path.join(out, `${row.width}-retry.png`),
            fullPage: true,
          });
          await p.fill("#notes", "corrected note on explicit retry");
        }
        const pending = p.waitForEvent("download");
        await p.click("#export-brief");
        const d = await pending;
        const text = await fs.readFile(await d.path(), "utf8");
        assert.ok(
          text.includes(
            row.name === "download-retry"
              ? "corrected note on explicit retry"
              : "preserved draft before download",
          ),
        );
        assert.ok(text.includes("30.00%"));
        await d.saveAs(path.join(out, `${row.width}-${row.name}.html`));
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = e.code || e.name;
        process.exitCode = 1;
      } finally {
        await context.close();
        row.seconds = (performance.now() - begin) / 1000;
        await fs.writeFile(
          path.join(out, "result.json"),
          JSON.stringify(
            {
              classification: "SYNTHETIC_BRIEF_BOUNDARIES",
              total: 4,
              passed: rows.filter((x) => x.passed).length,
              rows,
            },
            null,
            2,
          ),
        );
      }
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  process.exitCode = 1;
  console.error(e.name);
});
