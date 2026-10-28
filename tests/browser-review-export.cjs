// Real keyboard review -> download. Moving export away from notes, losing the
// review/source payload, or enabling stale exports must fail this acceptance.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { errorCode, observe, screenshot, reporter } = require("./helpers/review-report.cjs");

const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.join(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "review-export");
const note = "Synthetic review: source and unit checked; real report review pending.";
const rows = [1440, 390].map(width => ({ name: "notes-to-export", width, status: "not_run", phase: "not_started", passed: null }));
const save = reporter(out, rows, { classification: "SYNTHETIC_KEYBOARD_DEVELOPMENT", source_documents: 1, max_forward_tabs: 3 });
let browser;
let suiteError = null;

async function tabTo(page, matches) {
  for (let count = 1; count <= 80; count++) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      return { id: el.id, type: el.type, evidence: el.classList.contains("evidence-row") };
    });
    if (matches(active)) return count;
  }
  assert.fail("keyboard target unreachable within 80 forward Tabs");
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  await save();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const row of rows) {
    let context, page, capture;
    const start = performance.now();
    const phase = async value => { row.phase = value; await save(); };
    row.status = "running";
    row.model_requests = 0;
    try {
      await phase("context-create");
      context = await browser.newContext({ viewport: { width: row.width, height: 1000 }, acceptDownloads: true });
      page = await context.newPage();
      capture = observe(page, base, () => row.phase);
      page.on("request", req => {
        if (new URL(req.url()).pathname === "/api/run" && req.postDataJSON()?.operation === "agent") row.model_requests++;
      });
      await phase("initial-ready");
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector("#run")?.disabled === false);
      assert.equal(await page.locator("#export").isDisabled(), true);
      assert.equal(await page.inputValue("#operation"), "gross-margin");
      // Default scope intentionally avoids claiming native select-arrow coverage.
      // No click, focus(), selectOption or DOM mutation in the keyboard workflow.
      await phase("keyboard-review");
      await tabTo(page, a => a.id === "run");
      await page.keyboard.press("Enter");
      await page.locator(".value").waitFor();
      assert.equal(await page.locator(".value").textContent(), "30.00%");
      await tabTo(page, a => a.evidence);
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement.id), "source-heading");
      await tabTo(page, a => a.type === "checkbox");
      await page.keyboard.press("Space");
      assert.match(await page.locator("#review-count").textContent(), /1 \/ 1/);
      await tabTo(page, a => a.id === "notes");
      await page.keyboard.type(note);
      await phase("keyboard-export");
      row.forward_tabs = await tabTo(page, a => a.id === "export");
      await page.screenshot({ path: path.join(out, `${row.width}-export-focus.png`), fullPage: true });
      const pending = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const download = await pending;
      const data = await fs.readFile(await download.path());
      await fs.writeFile(path.join(out, `${row.width}-review.json`), data);
      const record = JSON.parse(data);
      assert.equal(record.classification, "SYNTHETIC");
      assert.equal(record.result.calculations[0].display, "30.00%");
      assert.equal(record.sources.length, 1);
      assert.equal(record.sources[0].year, 2024);
      assert.equal(record.review.checked_citation_ids.length, 1);
      assert.equal(record.review.checked_citation_ids[0], record.result.citations[0].citation_id);
      assert.equal(record.review.notes, note);
      assert.equal(record.review.verification, "browser_user_check_only_not_authenticated");
      row.export_valid = true;
      // Separate scope-invalidation control; this is not a keyboard-select claim.
      await phase("scope-invalidation");
      await page.selectOption("#company", "Harbor Lantern");
      assert.equal(await page.locator("#export").isDisabled(), true);
      assert.equal(await page.locator(".value").count(), 0);
      assert.equal(row.model_requests, 0);
      row.scope_invalidated = true;
      await phase("tab-budget");
      assert.ok(row.forward_tabs <= 3, `notes to export took ${row.forward_tabs} forward Tabs; budget is 3`);
      row.status = "passed";
      row.passed = true;
    } catch (error) {
      row.status = "failed";
      row.passed = false;
      row.error_code = errorCode(error);
      if (capture) row.diagnostics = await capture();
      if (page) row.screenshot = await screenshot(page, out, row);
      process.exitCode = 1;
    } finally {
      try { if (context) await context.close(); }
      catch (error) { row.cleanup_error = errorCode(error); row.status = "failed"; row.passed = false; process.exitCode = 1; }
      row.seconds = (performance.now() - start) / 1000;
      await save();
      console.log(JSON.stringify(row));
    }
  }
})().catch(error => { suiteError = errorCode(error); process.exitCode = 1; }).finally(async () => {
  try { if (browser) await browser.close(); }
  catch (error) { suiteError = errorCode(error); process.exitCode = 1; }
  await save(true, suiteError);
});
