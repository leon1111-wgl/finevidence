// Authored synthetic development plan; actual downloaded HTML and JSON must agree.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  reporter,
  observe,
  errorCode,
  screenshot,
} = require("./helpers/review-report.cjs");
const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.resolve(
  process.env.BROWSER_ARTIFACTS || "browser-artifacts",
  "review-brief",
);
const rows = [1440, 390].flatMap((width) =>
  ["growth", "decline", "empty", "refusal-retry"].map((name) => ({
    name,
    width,
    status: "not_run",
    phase: "not_started",
    passed: null,
  })),
);
const save = reporter(out, rows, {
  classification: "SYNTHETIC_BRIEF_DEVELOPMENT",
  source_documents: 4,
  independent_financial_tasks: 2,
  expected_displays: ["20.00%", "-20.00%"],
});
const note =
  'Review <script>globalThis.untrusted = true</script> & "quoted"\nUnits checked; no authenticated approval.';
let browser,
  suiteError = null;
async function download(page, key, filename, keyboard = false) {
  const pending = page.waitForEvent("download");
  if (keyboard) await page.keyboard.press("Enter");
  else await page.locator(key).click();
  const d = await pending;
  assert.equal(await d.failure(), null);
  await d.saveAs(filename);
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  await save();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  for (const row of rows) {
    let context, page, capture;
    const begin = performance.now();
    row.status = "running";
    const phase = async (s) => {
      row.phase = s;
      await save();
    };
    try {
      context = await browser.newContext({
        viewport: { width: row.width, height: 1000 },
        acceptDownloads: true,
      });
      page = await context.newPage();
      capture = observe(page, base, () => row.phase);
      await phase("ready");
      await page.goto(base);
      await page.waitForFunction(
        () => document.querySelector("#run")?.disabled === false,
      );
      assert.equal(
        await page.locator("#export-brief").count(),
        1,
        "readable brief control exists",
      );
      assert.equal(await page.locator("#export-brief").isDisabled(), true);
      if (row.name === "decline")
        await page.selectOption("#company", "Harbor Lantern");
      await page.selectOption(
        "#operation",
        row.name === "empty" ? "search" : "revenue-growth",
      );
      if (row.name === "empty") await page.fill("#query", "zzzzmissing");
      if (row.name === "refusal-retry") {
        await phase("missing-prior");
        await page.selectOption("#year", "2023");
        await page.click("#run");
        await page.waitForFunction(
          () =>
            document.querySelector("#status")?.getAttribute("role") === "alert",
        );
        assert.equal(await page.locator("#export-brief").isDisabled(), true);
        await page.selectOption("#year", "2024");
      }
      await phase("run");
      await page.click("#run");
      await page.waitForFunction(
        () => document.querySelector("#export")?.disabled === false,
      );
      if (row.name !== "empty") {
        await page.locator(".review-check input").check();
      }
      await page.fill("#notes", note);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "export",
      );
      const stem = `${row.width}-${row.name}`;
      await download(page, "#export", path.join(out, `${stem}.json`), true);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "export-brief",
      );
      await phase("html-download");
      await download(
        page,
        "#export-brief",
        path.join(out, `${stem}.html`),
        true,
      );
      await page.screenshot({
        path: path.join(out, `${stem}-workbench.png`),
        fullPage: true,
      });
      const record = JSON.parse(
        await fs.readFile(path.join(out, `${stem}.json`), "utf8"),
      );
      const brief = await context.newPage();
      const outbound = [];
      brief.on("request", (r) => {
        if (!r.url().startsWith("file:")) outbound.push(r.url());
      });
      await phase("standalone-review");
      await brief.goto(pathToFileURL(path.join(out, `${stem}.html`)).href);
      const text = await brief.locator("body").innerText();
      assert.equal(
        await brief.locator("script,iframe,img,form,object,link").count(),
        0,
      );
      assert.equal(await brief.evaluate(() => globalThis.untrusted), undefined);
      assert.equal(await brief.locator("#brief-notes").textContent(), note);
      for (const s of [
        record.source_commit,
        record.corpus_sha256,
        "SYNTHETIC",
        "未经认证",
        record.result.status,
      ])
        assert.ok(text.includes(s));
      for (const c of record.result.calculations)
        for (const s of [
          c.display,
          c.formula,
          ...Object.values(c.normalized_inputs || {}),
        ])
          assert.ok(text.includes(s), s);
      for (const f of record.result.facts || [])
        for (const s of [
          f.fact_id,
          f.raw_value,
          f.currency,
          f.unit_scale,
          f.period_start,
          f.period_end,
          f.accounting_basis,
          f.consolidation_scope,
        ])
          assert.ok(text.includes(s), s);
      for (const source of record.sources) {
        assert.ok(text.includes(source.sha256));
        for (const p of source.pages)
          assert.ok(text.includes(p), "complete source page");
      }
      assert.ok(
        text.includes(
          `${record.review.checked_citation_ids.length} / ${record.result.citations.length}`,
        ),
      );
      if (row.name === "empty") {
        assert.equal(record.result.status, "NO_MATCH");
        assert.ok(text.includes("没有匹配证据"));
      } else
        assert.ok(text.includes(row.name === "decline" ? "-20.00%" : "20.00%"));
      for (const href of await brief
        .locator("a")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
        assert.ok(href.startsWith("#"));
        assert.equal(await brief.locator(href).count(), 1);
      }
      assert.ok(
        await brief.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "no page overflow",
      );
      await brief.screenshot({
        path: path.join(out, `${stem}-brief.png`),
        fullPage: true,
      });
      await brief.emulateMedia({ media: "print" });
      await brief.screenshot({
        path: path.join(out, `${stem}-print.png`),
        fullPage: true,
      });
      assert.deepEqual(outbound, []);
      row.parity = true;
      row.external_requests = 0;
      await phase("stale-revocation");
      await page.selectOption("#year", "2023");
      assert.equal(await page.locator("#export-brief").isDisabled(), true);
      row.status = "passed";
      row.passed = true;
    } catch (e) {
      row.status = "failed";
      row.passed = false;
      row.error_code = errorCode(e);
      row.assertion =
        e.code === "ERR_ASSERTION" ? e.message.slice(0, 160) : undefined;
      if (capture) row.diagnostics = await capture();
      if (page) row.screenshot = await screenshot(page, out, row);
      process.exitCode = 1;
    } finally {
      if (context) await context.close();
      row.seconds = (performance.now() - begin) / 1000;
      await save();
      console.log(JSON.stringify(row));
    }
  }
})()
  .catch((e) => {
    suiteError = errorCode(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    await save(true, suiteError);
  });
