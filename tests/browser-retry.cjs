// FE-014 state transitions in a real browser. HTTP fault/model responses below
// are offline fixtures; no provider or model credential is used.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "retry");
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const rows = [];
  const ready = (p) => p.waitForFunction(() => !document.getElementById("run").disabled);
  const submit = async (p, selector = "#run") => {
    await p.click(selector);
    await ready(p);
  };
  const emptyFailure = async (p, code) => {
    assert.match(await p.locator("#status").textContent(), new RegExp(code));
    assert.equal(await p.locator("#export").isDisabled(), true);
    assert.equal(await p.locator(".value").count(), 0);
    assert.equal(await p.locator(".evidence-row").count(), 0);
    assert.equal(await p.locator("#retry").isVisible(), true);
  };
  const edited = async (p) => {
    assert.equal(await p.locator("#retry").isVisible(), false, "edited input must invalidate the old retry");
    assert.equal(await p.locator("#export").isDisabled(), true);
    assert.equal(await p.locator(".value").count(), 0);
  };
  async function check(name, body, narrow = false) {
    const ctx = await browser.newContext({ viewport: narrow ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    const pageErrors = [];
    p.on("pageerror", (e) => pageErrors.push(e.message));
    try {
      await body(p);
      assert.deepEqual(pageErrors, []);
      rows.push({ name, passed: true });
    } catch (e) {
      rows.push({ name, passed: false, error: e.message });
    } finally {
      await p.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
      await ctx.close();
    }
  }
  const missing = async (p) => {
    await p.goto(base); await ready(p);
    await p.selectOption("#year", "2023");
    await p.selectOption("#operation", "revenue-growth");
    await submit(p); await emptyFailure(p, "FACTS_NOT_FOUND");
  };
  const badQuery = async (p) => {
    await p.goto(base); await ready(p);
    await p.selectOption("#operation", "search");
    await p.fill("#query", "收入");
    await submit(p); await emptyFailure(p, "INVALID_QUERY");
  };
  // Simulates only the HTTP boundary. Real DOM, app event handlers and fetch
  // requests remain active. Both fixture branches always block external calls.
  async function offlineHTTP(p, networkFault = false) {
    const requests = [];
    await p.route("**/runtime.json", (route) => route.fulfill({ json: {
      runtime: "python_local", model_configured: true, csrf: "offline-browser-fixture",
    } }));
    await p.route("**/api/run", async (route) => {
      const d = route.request().postDataJSON(); requests.push(d);
      if (networkFault && requests.length === 1) return route.abort();
      const model = d.operation === "agent";
      await route.fulfill({ status: model ? 422 : 200, json: {
        schema_version: "1.0", trace_id: "offline-browser-fixture", mode: "offline_http_fixture",
        status: model ? "MODEL_TIMEOUT" : "NO_MATCH", answer: null,
        facts: [], citations: [], calculations: [], claims: [],
        resolved_operation: d.operation, filters: { company: d.company, year: d.year }, query: d.query,
      } });
    });
    await p.goto(base); await ready(p);
    return requests;
  }
  try {
    await check("year-edit", async (p) => {
      await missing(p); await p.selectOption("#year", "2024"); await edited(p);
      await p.focus("#run"); await p.keyboard.press("Enter"); await ready(p);
      assert.equal(await p.locator(".value").textContent(), "20.00%");
      assert.equal(await p.locator(".evidence-row").count(), 2);
    });
    await check("query-edit", async (p) => {
      await badQuery(p); await p.fill("#query", "revenue"); await edited(p);
      await submit(p);
      assert.equal(await p.locator(".evidence-row").count(), 1);
      assert.match(await p.locator("#source-content").textContent(), /Aurora Orchard/);
    }, true);
    await check("company-edit", async (p) => {
      await badQuery(p); await p.selectOption("#company", "Harbor Lantern"); await edited(p);
      await p.fill("#query", "revenue"); await submit(p);
      assert.match(await p.locator("#source-content").textContent(), /Harbor Lantern/);
      assert.doesNotMatch(await p.locator("#source-content").textContent(), /Aurora Orchard/);
    });
    await check("operation-edit", async (p) => {
      await missing(p); await p.selectOption("#operation", "gross-margin"); await edited(p);
      await submit(p);
      assert.equal(await p.locator(".value").textContent(), "25.00%");
    });
    await check("unchanged-refusal", async (p) => {
      await missing(p); await submit(p, "#retry"); await emptyFailure(p, "FACTS_NOT_FOUND");
      assert.equal(await p.inputValue("#year"), "2023");
    });
    await check("unchanged-network-retry", async (p) => {
      const requests = await offlineHTTP(p, true);
      await p.selectOption("#operation", "search"); await p.fill("#query", "zzzzmissing");
      await submit(p); await emptyFailure(p, "fetch");
      assert.equal(requests.length, 1);
      await submit(p, "#retry");
      assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
      assert.match(await p.locator("#result-content").textContent(), /没有找到/);
      assert.equal(await p.locator("#retry").isVisible(), false);
    });
    await check("model-to-fixed", async (p) => {
      const requests = await offlineHTTP(p);
      await p.selectOption("#operation", "agent"); await p.fill("#query", "核对收入");
      await submit(p); await emptyFailure(p, "MODEL_TIMEOUT");
      await p.selectOption("#operation", "search"); await p.fill("#query", "zzzzmissing"); await edited(p);
      // A hidden action must also be revoked; hiding alone leaves the old closure.
      const busyAfterOldAction = await p.locator("#retry").evaluate((button) => {
        button.click();
        return document.getElementById("query-form").getAttribute("aria-busy");
      });
      assert.equal(busyAfterOldAction, "false", "the old callback itself must be revoked");
      await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(requests.length, 1, "editing must neither auto-run nor retain an old model retry");
      await submit(p);
      assert.deepEqual(requests.map((r) => r.operation), ["agent", "search"]);
      assert.match(await p.locator("#result-content").textContent(), /没有找到/);
    });
    const report = { base, classification: "OFFLINE_BROWSER_REGRESSION", paid_calls: 0, passed: rows.filter((r) => r.passed).length, total: rows.length, rows };
    await fs.writeFile(path.join(out, "result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.passed !== report.total) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
