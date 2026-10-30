// Separate new-capability boundaries, not extra financial accuracy tasks.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { reporter, observe, errorCode, screenshot } = require("./helpers/review-report.cjs");
const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.resolve(
  process.env.BROWSER_ARTIFACTS || "browser-artifacts",
  "brief-recovery",
);
const rows = [1440, 390].flatMap((width) =>
  ["download-retry", "legacy-html"].map((name) => ({
    name,
    width,
    status: "not_run",
    phase: "not_started",
    passed: null,
  })),
);
const metadata = {
  classification: "SYNTHETIC_BRIEF_BOUNDARIES",
  source_documents: 1,
  independent_financial_tasks: 1,
  suite_phase: "browser-launch",
  suite_cleanup_error: null,
};
const save = reporter(out, rows, metadata);
let browser, suiteError = null;
(async () => {
  await fs.mkdir(out, { recursive: true });
  await save();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  metadata.suite_phase = "cases";
  for (const row of rows) {
    let context, p, capture, cleanupFailed = false;
    const begin = performance.now();
    const phase = async value => { row.phase = value; await save(); };
    row.status = "running";
    await phase("context-create");
    try {
      context = await browser.newContext({
        viewport: { width: row.width, height: 1000 },
        acceptDownloads: true,
      });
      await phase("page-create");
      p = await context.newPage();
      capture = observe(p, base, () => row.phase);
      p.setDefaultTimeout(10000);
      await phase("legacy-setup");
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
      await phase("navigation");
      await p.goto(base);
      await phase("ready");
      await p.waitForFunction(
        () => document.querySelector("#run")?.disabled === false,
      );
      assert.equal(await p.locator("#export-brief").count(), 1);
      assert.equal(await p.locator("#export-brief").isDisabled(), true);
      await phase("calculation");
      await p.click("#run");
      await p.locator(".value").waitFor();
      await p.fill("#notes", "preserved draft before download");
      if (row.name === "download-retry") {
        await phase("allocation-failure");
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
      await phase("download");
      // Observe both promises immediately; a click failure must not leave an
      // unhandled download rejection which bypasses the final report.
      const [d] = await Promise.all([
        p.waitForEvent("download"), p.click("#export-brief"),
      ]);
      await phase("verify-download");
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
      row.status = "passed";
    } catch (e) {
      row.passed = false;
      row.status = "failed";
      row.error_code = errorCode(e);
      if (capture) row.diagnostics = await capture();
      if (p) row.screenshot = await screenshot(p, out, row);
      process.exitCode = 1;
    } finally {
      // Persist the original failure before cleanup; preserve its phase if
      // closing the context also fails. Stop new cases after unsafe cleanup.
      if (row.passed) row.phase = "context-close";
      try { await save(); }
      finally {
        // Persistence failure must not bypass the resources owned by this case.
        try { await context?.close(); }
        catch (e) {
          row.cleanup_error = errorCode(e);
          if (row.passed) row.error_code = row.cleanup_error;
          row.passed = false;
          row.status = "failed";
          cleanupFailed = true;
          suiteError = row.cleanup_error;
          metadata.suite_phase = "context-close";
          process.exitCode = 1;
        }
      }
      if (row.passed) row.phase = "complete";
      row.seconds = (performance.now() - begin) / 1000;
      await save();
      console.log(JSON.stringify(row));
    }
    if (cleanupFailed) break;
  }
})().catch(e => {
  suiteError = errorCode(e);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) {
    if (!suiteError) metadata.suite_phase = "browser-close";
    try { await save(false, suiteError); }
    finally {
      // Even a persistently unwritable report must allow the child to exit.
      try { await browser.close(); }
      catch (e) {
        metadata.suite_cleanup_error = errorCode(e);
        suiteError ??= metadata.suite_cleanup_error;
        process.exitCode = 1;
      }
    }
    if (!suiteError) metadata.suite_phase = "complete";
  }
  await save(true, suiteError);
}).catch(() => {
  // An unwritable output cannot promise an artifact; never print its raw path.
  console.error("REPORT_WRITE_FAILED");
  process.exitCode = 1;
});
