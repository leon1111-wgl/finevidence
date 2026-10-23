// FE-018: leave the old module request pending while allowing a real retry.
// Resource timing faults only; the PDF.js module, Worker and PDF bytes stay real.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf-loading",
  );
  await fs.mkdir(out, { recursive: true });
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const fixture = (name) => path.join(__dirname, "fixtures/pdf", name);
  const expectedHash = createHash("sha256")
    .update(await fs.readFile(fixture("mixed.pdf")))
    .digest("hex");
  const rows = [];
  try {
    for (const width of [1440, 390])
      for (const scenario of [
        {
          name: "timeout-late-reject",
          stop: "timeout",
          late: "reject",
          when: "complete",
        },
        {
          name: "cancel-late-resolve",
          stop: "cancel",
          late: "resolve",
          when: "complete",
        },
        {
          name: "cancel-reject-during-retry",
          stop: "cancel",
          late: "reject",
          when: "pending",
        },
        {
          name: "cancel-resolve-during-retry",
          stop: "cancel",
          late: "resolve",
          when: "pending",
        },
      ]) {
        const c = await b.newContext({
          viewport: { width, height: 1000 },
          acceptDownloads: true,
        });
        const p = await c.newPage();
        p.setDefaultTimeout(5000);
        const errors = [],
          requests = [],
          held = [];
        p.on("pageerror", (e) => errors.push(e.message));
        await p.addInitScript(() => {
          const Original = Worker;
          window.pdfWorkerCounts = { started: 0, terminated: 0 };
          window.Worker = class extends Original {
            constructor(...args) {
              super(...args);
              window.pdfWorkerCounts.started++;
            }
            terminate() {
              window.pdfWorkerCounts.terminated++;
              return super.terminate();
            }
          };
        });
        let row = { width, name: scenario.name, passed: false };
        try {
          await p.goto(base);
          await p.waitForFunction(
            () => !document.getElementById("run").disabled,
          );
          await p.route("**/vendor/pdf.min.mjs*", async (route) => {
            requests.push(route.request().url());
            if (requests.length > 2) return route.continue();
            let release;
            const pending = new Promise((resolve) => (release = resolve));
            held.push({ release, url: route.request().url() });
            const action = await pending;
            try {
              if (action === "reject") await route.abort("failed");
              else await route.continue();
            } catch {}
          });
          const select = (name) => p.setInputFiles("#pdf-file", fixture(name));
          const done = () =>
            p.waitForFunction(
              () =>
                document
                  .getElementById("pdf-intake")
                  .getAttribute("aria-busy") === "false",
              null,
              { timeout: 17000 },
            );
          const waitRequest = async (n) => {
            const until = Date.now() + 3000;
            while (requests.length < n && Date.now() < until)
              await new Promise((resolve) => setTimeout(resolve, 20));
            assert.equal(
              requests.length,
              n,
              "manual retry must start a fresh module request while the old request stays pending",
            );
          };
          const settleOld = async () => {
            held[0].release(scenario.late);
            await p.waitForFunction(
              (url) =>
                performance
                  .getEntriesByType("resource")
                  .some((e) => e.name === url),
              held[0].url,
            );
            // Drain promise callbacks after network completion before checking stale effects.
            await p.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
          };
          const start = Date.now();
          await select("text.pdf");
          await waitRequest(1);
          if (scenario.stop === "cancel") {
            await p.focus("#pdf-cancel");
            await p.keyboard.press("Enter");
          }
          await done();
          row.first_ms = Date.now() - start;
          row.first_status = await p.locator("#pdf-status").innerText();
          assert.match(
            row.first_status,
            scenario.stop === "timeout"
              ? /PDF_(READER_)?TIMEOUT/
              : /PDF_CANCELLED/,
          );
          assert.equal(await p.locator("#pdf-download").isDisabled(), true);
          await p
            .locator("#pdf-intake")
            .screenshot({
              path: path.join(out, `${width}-${scenario.name}-stopped.png`),
            });
          assert.equal(requests.length, 1, "no automatic retries");
          const retryStart = Date.now();
          await select("mixed.pdf");
          await waitRequest(2);
          assert.notEqual(requests[0], requests[1]);
          if (scenario.when === "pending") {
            await settleOld();
            assert.equal(
              await p.locator("#pdf-intake").getAttribute("aria-busy"),
              "true",
            );
            assert.equal(await p.locator("#pdf-download").isDisabled(), true);
            assert.deepEqual(await p.evaluate(() => pdfWorkerCounts), {
              started: 0,
              terminated: 0,
            });
          }
          held[1].release("resolve");
          await done();
          row.retry_ms = Date.now() - retryStart;
          assert.equal(await p.locator("#pdf-download").isDisabled(), false);
          if (scenario.when === "complete") await settleOld();
          assert.equal(await p.locator("#pdf-hash").innerText(), expectedHash);
          assert.equal(await p.locator("#pdf-name").innerText(), "mixed.pdf");
          assert.deepEqual(await p.evaluate(() => pdfWorkerCounts), {
            started: 1,
            terminated: 1,
          });
          const download = p.waitForEvent("download");
          await p.focus("#pdf-download");
          await p.keyboard.press("Enter");
          const report = JSON.parse(
            await fs.readFile(await (await download).path(), "utf8"),
          );
          assert.equal(report.file.sha256, expectedHash);
          assert.equal(report.page_count, 2);
          assert.equal(report.text_pages, 1);
          assert.equal(report.financial_calculation_eligible, false);
          await p
            .locator("#pdf-intake")
            .screenshot({
              path: path.join(out, `${width}-${scenario.name}-recovered.png`),
            });
          // Old success/failure must not evict the current success cache.
          await select("mixed.pdf");
          await done();
          assert.equal(requests.length, 2);
          assert.equal(await p.locator("#pdf-download").isDisabled(), false);
          assert.deepEqual(await p.evaluate(() => pdfWorkerCounts), {
            started: 2,
            terminated: 2,
          });
          assert.deepEqual(errors, []);
          if (scenario.stop === "timeout")
            assert.match(row.first_status, /PDF_READER_TIMEOUT/);
          row = {
            ...row,
            passed: true,
            module_requests: requests.length,
            worker_counts: await p.evaluate(() => pdfWorkerCounts),
          };
        } catch (e) {
          row.error = e.message;
        } finally {
          for (const h of held) h.release("reject");
          await c.close();
        }
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    const result = {
      base,
      classification: "SYNTHETIC_RESOURCE_RECOVERY_NOT_FINANCIAL_ACCURACY",
      paid_calls: 0,
      passed: rows.filter((r) => r.passed).length,
      total: rows.length,
      rows,
    };
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    assert.equal(result.passed, result.total);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
