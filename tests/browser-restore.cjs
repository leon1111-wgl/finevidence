// FE-015: real Python HTTP replay, with browser route aborts for network faults.
// This suite requires the loopback workbench; it never requests a model.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "restore");
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const storageKey = "finevidence.review.v1";
  const note = "Synthetic review: both annual revenue amounts and units checked.";
  const ready = (p) => p.waitForFunction(() => !document.getElementById("run").disabled);
  const stored = (p) => p.evaluate((key) => localStorage.getItem(key), storageKey);
  const rows = [];
  const cases = [
    { name: "normal-restore", failures: 0 },
    { name: "single-failure-retry", failures: 1 },
    { name: "repeated-failure-retry", failures: 2, narrow: true },
    { name: "edited-scope-revokes-restore", failures: 1, edit: true },
    { name: "retry-filters-stale-citation", failures: 1, staleID: true },
    { name: "failure-then-reload", failures: 1, reload: true },
  ];
  try {
    for (const spec of cases) {
      const context = await browser.newContext({
        viewport: { width: spec.narrow ? 390 : 1440, height: 1000 },
        acceptDownloads: true,
      });
      const p = await context.newPage();
      const pageErrors = [], operations = [], replayRequests = [];
      p.on("pageerror", (e) => pageErrors.push(e.message));
      p.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/run") operations.push(r.postDataJSON().operation);
      });
      try {
        await p.goto(base); await ready(p);
        assert.match(await p.locator("#runtime").textContent(), /Python/, "start the Python loopback workbench");
        await p.selectOption("#operation", "revenue-growth");
        await p.click("#run"); await ready(p);
        assert.equal(await p.locator(".value").textContent(), "20.00%");
        await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
        await p.locator(".evidence-row").filter({ hasText: "2023" }).click();
        await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
        await p.fill("#notes", note);
        const original = JSON.parse(await stored(p));
        assert.equal(original.reviewed.length, 2);
        assert.match(await p.locator("#source-content").textContent(), /aurora_2023.json/);
        if (spec.staleID) {
          await p.evaluate((key) => {
            const draft = JSON.parse(localStorage.getItem(key));
            draft.reviewed.push("not-in-current-result");
            localStorage.setItem(key, JSON.stringify(draft));
          }, storageKey);
        }
        const before = await stored(p);
        let faultsLeft = spec.failures;
        await p.route("**/api/run", async (route) => {
          replayRequests.push(route.request().postDataJSON());
          if (faultsLeft > 0) { faultsLeft--; return route.abort(); }
          return route.continue(); // The real server recomputes from source-checked facts.
        });
        await p.reload(); await ready(p);
        for (let failed = 0; failed < spec.failures; failed++) {
          await p.locator("#retry").waitFor({ state: "visible" });
          assert.equal(await stored(p), before, "failed replay must not replace the saved review");
          assert.equal(await p.locator("#export").isDisabled(), true);
          assert.equal(await p.locator(".value").count(), 0);
          assert.equal(replayRequests.length, failed + 1, "no automatic retries");
          if (failed === spec.failures - 1) {
            await p.screenshot({ path: path.join(out, `${spec.name}-failure.png`), fullPage: true });
          }
          if (spec.edit || spec.reload) break;
          await p.focus("#retry"); await p.keyboard.press("Enter"); await ready(p);
        }
        if (spec.edit) {
          await p.selectOption("#company", "Harbor Lantern");
          assert.equal(await p.locator("#retry").isVisible(), false);
          const busy = await p.locator("#retry").evaluate((button) => {
            button.click(); return document.getElementById("query-form").getAttribute("aria-busy");
          });
          assert.equal(busy, "false", "editing must revoke the pending restore callback");
          assert.equal(await stored(p), before);
          await p.click("#run"); await ready(p);
          assert.equal(await p.locator(".value").textContent(), "-20.00%");
          assert.equal(await p.inputValue("#notes"), "");
          assert.deepEqual(JSON.parse(await stored(p)).reviewed, []);
          assert.equal(JSON.parse(await stored(p)).request.company, "Harbor Lantern");
          assert.equal(replayRequests.length, 2);
        } else {
          if (spec.reload) { await p.reload(); await ready(p); }
          assert.equal(await p.locator(".value").textContent(), "20.00%");
          assert.equal(await p.inputValue("#notes"), note, "successful retry must retain review notes");
          assert.match(await p.locator("#review-count").textContent(), /2 \/ 2/);
          assert.match(await p.locator("#source-content").textContent(), /aurora_2023.json/);
          const after = JSON.parse(await stored(p));
          assert.deepEqual(after.reviewed.sort(), [...original.reviewed].sort());
          assert.equal(after.selected, original.selected);
          assert.equal(replayRequests.length, spec.failures + 1);
          for (const request of replayRequests) assert.deepEqual(request, original.request);
          const event = p.waitForEvent("download"); await p.click("#export");
          const download = await event;
          const record = JSON.parse(await fs.readFile(await download.path(), "utf8"));
          assert.equal(record.review.notes, note);
          assert.deepEqual(record.review.checked_citation_ids.sort(), [...original.reviewed].sort());
          assert.equal(record.sources.length, 2);
          assert.equal(record.result.calculations[0].display, "20.00%");
          await fs.writeFile(path.join(out, `${spec.name}-export.json`), JSON.stringify(record, null, 2));
          await p.reload(); await ready(p);
          assert.equal(await p.inputValue("#notes"), note, "a later refresh must retain the review too");
          assert.match(await p.locator("#review-count").textContent(), /2 \/ 2/);
        }
        assert.ok(operations.every((op) => op === "revenue-growth"), "replay never calls a model");
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(pageErrors, []);
        rows.push({ name: spec.name, passed: true, replay_requests: replayRequests.length, model_requests: 0 });
      } catch (e) {
        rows.push({ name: spec.name, passed: false, error: e.message });
      } finally {
        await p.screenshot({ path: path.join(out, `${spec.name}.png`), fullPage: true });
        await context.close();
      }
    }
    const report = { base, classification: "REAL_PYTHON_HTTP_WITH_OFFLINE_NETWORK_FAULTS", paid_calls: 0,
      passed: rows.filter((r) => r.passed).length, total: rows.length, rows };
    await fs.writeFile(path.join(out, "result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.passed !== report.total) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
