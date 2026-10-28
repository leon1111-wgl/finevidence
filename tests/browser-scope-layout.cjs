// Known synthetic scope-selection path. Canvas geometry is a conservative
// clipping proxy, supplemented by screenshots; native select-arrow interaction
// and screen-reader output are not inferred from selectOption or Tab.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { errorCode, observe, screenshot, reporter } = require("./helpers/review-report.cjs");

const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.join(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "scope-layout");
const companies = [
  { name: "aurora", company: "Aurora Orchard", display: "30.00%", doc: "syn_aurora_2024" },
  { name: "harbor", company: "Harbor Lantern", display: "25.00%", doc: "syn_harbor_2024" },
];
const rows = [320, 360, 361, 390, 768, 1440].flatMap(width =>
  companies.map(item => ({ ...item, width, status: "not_run", phase: "not_started", passed: null })));
const save = reporter(out, rows, {
  classification: "SYNTHETIC_SCOPE_LAYOUT_DEVELOPMENT", source_documents: 2,
  arrow_reserve_px: 20, note: "Known cases at six widths; not human productivity or real financial accuracy.",
});
let browser, suiteError = null;

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
      await phase("initial-ready");
      context = await browser.newContext({ viewport: { width: row.width, height: 900 }, acceptDownloads: true });
      page = await context.newPage();
      capture = observe(page, base, () => row.phase);
      page.on("request", req => {
        if (new URL(req.url()).pathname === "/api/run" && req.postDataJSON()?.operation === "agent") row.model_requests++;
      });
      await page.goto(base);
      await page.waitForFunction(() => document.querySelector("#run")?.disabled === false);
      await phase("selection-layout");
      await page.selectOption("#company", row.company);
      assert.equal(await page.getByLabel("公司", { exact: true }).inputValue(), row.company);
      assert.equal(await page.inputValue("#year"), "2024");
      row.geometry = await page.locator("#company").evaluate(el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = el.selectedOptions[0].textContent;
        const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
        return { text, text_width: ctx.measureText(text).width, available_width: available,
          control_width: rect.width, left: rect.left, right: rect.right,
          page_width: document.documentElement.scrollWidth, viewport_width: innerWidth };
      });
      await page.screenshot({ path: path.join(out, `${row.width}-${row.name}-selection.png`) });
      await phase("keyboard-order");
      await page.locator("#company").focus();
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "year");
      row.keyboard_order_valid = true;
      await phase("calculate-review-export");
      await page.locator("#run").click();
      await page.locator(".value").waitFor();
      assert.equal(await page.locator(".value").textContent(), row.display);
      await page.locator(".evidence-row").first().click();
      await page.getByRole("checkbox", { name: "已核对这条原文", exact: true }).check();
      const note = `Synthetic scope check: ${row.company}, 2024.`;
      await page.locator("#notes").fill(note);
      const pending = page.waitForEvent("download");
      await page.locator("#export").click();
      const download = await pending;
      const bytes = await fs.readFile(await download.path());
      await fs.writeFile(path.join(out, `${row.width}-${row.name}-review.json`), bytes);
      const record = JSON.parse(bytes);
      assert.equal(record.classification, "SYNTHETIC");
      assert.equal(record.result.calculations[0].display, row.display);
      assert.equal(record.sources.length, 1);
      assert.equal(record.sources[0].doc_id, row.doc);
      assert.equal(record.sources[0].company, row.company);
      assert.equal(record.sources[0].year, 2024);
      assert.equal(record.review.notes, note);
      assert.deepEqual(record.review.checked_citation_ids, [record.result.citations[0].citation_id]);
      assert.equal(record.review.verification, "browser_user_check_only_not_authenticated");
      row.export_valid = true;
      await phase("scope-invalidation");
      await page.selectOption("#company", companies.find(item => item.company !== row.company).company);
      assert.equal(await page.locator("#export").isDisabled(), true);
      assert.equal(await page.locator(".value").count(), 0);
      assert.equal(row.model_requests, 0);
      row.scope_invalidated = true;
      await phase("readable-scope");
      assert.ok(row.geometry.text_width <= row.geometry.available_width, "selected company text exceeds available width after arrow reserve");
      assert.ok(row.geometry.left >= 0 && row.geometry.right <= row.width);
      assert.ok(row.geometry.page_width <= row.width);
      row.status = "passed";
      row.passed = true;
    } catch (error) {
      row.status = "failed"; row.passed = false; row.error_code = errorCode(error);
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
