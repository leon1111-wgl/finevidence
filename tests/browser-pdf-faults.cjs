// Inject only resource/network faults; keep the real DOM, Worker and parser paths.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

const errorCode = (error) =>
  error?.name === "TimeoutError"
    ? "TIMEOUT"
    : error?.code === "ERR_ASSERTION"
      ? "ASSERTION_FAILED"
      : "HARNESS_ERROR";

// Diagnostics are an allowlist, not a dump of URLs, DOM text or exception messages.
async function diagnostics(page, resources, pageErrors) {
  let timer;
  try {
    const readiness = await Promise.race([
      page.evaluate(() => {
        const run = document.getElementById("run"),
          retry = document.getElementById("retry");
        return {
          run_present: Boolean(run),
          run_disabled: run ? run.disabled : null,
          retry_visible: retry ? !retry.hidden : null,
          status_is_alert:
            document.getElementById("status")?.getAttribute("role") === "alert",
        };
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error()), 1500);
      }),
    ]);
    return { readiness, resources: [...resources], page_errors: pageErrors };
  } catch {
    return {
      readiness: null,
      resources: [...resources],
      page_errors: pageErrors,
      unavailable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf-faults",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [
    "demo-resource-retry",
    "library-retry",
    "worker-timeout",
    "worker-cancel-retry",
  ].map((name) => ({
    name,
    status: "not_run",
    passed: null,
    phase: "not_started",
  }));
  const runId = randomUUID();
  let b,
    suiteError = null;
  const persist = async (finished = false) => {
    const result = {
      schema_version: 1,
      run_id: runId,
      base_origin: new URL(base).origin,
      classification: "INJECTED_BROWSER_FAULTS_NOT_REAL_DOCUMENT_QUALITY",
      paid_calls: 0,
      finished,
      passed: rows.filter((x) => x.status === "passed").length,
      failed: rows.filter((x) => x.status === "failed").length,
      attempted: rows.filter((x) => x.status !== "not_run").length,
      not_run: rows.filter((x) => x.status === "not_run").length,
      total: rows.length,
      suite_error: suiteError,
      rows,
    };
    const target = path.join(out, "result.json");
    await fs.writeFile(target + ".tmp", JSON.stringify(result, null, 2));
    await fs.rename(target + ".tmp", target);
  };
  // Save the fixed plan before browser startup; later checkpoints retain prior cases.
  await persist();
  try {
    b = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    for (const row of rows) {
      const mode = row.name,
        started = Date.now(),
        resources = [];
      let c,
        p,
        pageErrors = 0;
      row.status = "running";
      row.phase = "initialization";
      await persist();
      try {
        c = await b.newContext({ viewport: { width: 390, height: 1000 } });
        p = await c.newPage();
        p.setDefaultTimeout(18000);
        const known = [
          "manifest.json",
          "runtime.json",
          "bundle.json",
          "app.mjs",
          "workbench.mjs",
          "bootstrap.mjs",
          "engine.mjs",
          "state.mjs",
          "handoff.mjs",
          "replay.mjs",
          "pdf-panel.mjs",
          "pdf-intake.mjs",
          "pdf-demo.pdf",
          "vendor/pdf.min.mjs",
          "vendor/pdf.worker.min.mjs",
        ];
        const resourceName = (url) => {
          const u = new URL(url);
          return known.find((name) => {
            const allowed = new URL(name, base);
            return (
              u.origin === allowed.origin && u.pathname.replace(/\/assets\/[a-f0-9]{64}\//, "/") === allowed.pathname
            );
          });
        };
        const record = (url, event, status) => {
          const resource = resourceName(url);
          if (resource && resources.length < 16)
            resources.push({
              resource,
              event,
              ...(status === undefined ? {} : { status }),
            });
        };
        p.on("response", (r) => record(r.url(), "response", r.status()));
        p.on("requestfailed", (r) => record(r.url(), "request_failed"));
        p.on("pageerror", () => {
          pageErrors = Math.min(pageErrors + 1, 1000);
        });
        await p.addInitScript(() => {
          const Original = Worker;
          window.pdfWorkersTerminated = 0;
          window.Worker = class extends Original {
            terminate() {
              window.pdfWorkersTerminated++;
              return super.terminate();
            }
          };
        });
        await p.goto(base);
        await p.waitForFunction(() => !document.getElementById("run").disabled);
        row.phase = "scenario";
        const select = () =>
          p.setInputFiles(
            "#pdf-file",
            path.join(__dirname, "fixtures/pdf/text.pdf"),
          );
        const done = () =>
          p.waitForFunction(
            () =>
              document
                .getElementById("pdf-intake")
                .getAttribute("aria-busy") === "false",
          );
        if (mode === "demo-resource-retry") {
          await p.route("**/pdf-demo.pdf", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 7000));
            try {
              await route.abort("failed");
            } catch {}
          });
          await p.click("#pdf-demo");
          await done();
          assert.match(
            await p.locator("#pdf-status").innerText(),
            /PDF_DEMO_TIMEOUT/,
          );
          assert.equal(await p.locator("#pdf-download").isDisabled(), true);
          await p.unroute("**/pdf-demo.pdf");
          await p.click("#pdf-demo");
          await done();
          assert.equal(await p.locator("#pdf-download").isDisabled(), false);
        } else if (mode === "library-retry") {
          await p.route("**/vendor/pdf.min.mjs*", (r) => r.abort("failed"));
          await select();
          await done();
          assert.match(
            await p.locator("#pdf-status").innerText(),
            /PDF_READER_UNAVAILABLE/,
          );
          await p.unroute("**/vendor/pdf.min.mjs*");
          await select();
          await done();
          assert.equal(await p.locator("#pdf-download").isDisabled(), false);
        } else {
          await p.route("**/vendor/pdf.worker.min.mjs", (r) =>
            r.fulfill({
              contentType: "text/javascript",
              body: "self.onmessage=()=>{};",
            }),
          );
          const start = Date.now();
          await select();
          await p.waitForFunction(() =>
            document
              .getElementById("pdf-status")
              .textContent.includes("检查 PDF"),
          );
          if (mode === "worker-cancel-retry") await p.click("#pdf-cancel");
          await done();
          const elapsed = Date.now() - start;
          assert.match(
            await p.locator("#pdf-status").innerText(),
            mode === "worker-timeout" ? /PDF_TIMEOUT/ : /PDF_CANCELLED/,
          );
          assert.equal(await p.locator("#pdf-download").isDisabled(), true);
          assert.equal(await p.locator("#pdf-result").isVisible(), false);
          assert.ok((await p.evaluate(() => pdfWorkersTerminated)) > 0);
          if (mode === "worker-timeout") {
            assert.ok(elapsed >= 11000 && elapsed < 17000);
            await p
              .locator("#pdf-intake")
              .screenshot({ path: path.join(out, "timeout.png") });
          }
          await p.unroute("**/vendor/pdf.worker.min.mjs");
          await select();
          await done();
          assert.equal(await p.locator("#pdf-download").isDisabled(), false);
        }
        row.status = "passed";
        row.passed = true;
        row.phase = "complete";
      } catch (e) {
        row.status = "failed";
        row.passed = false;
        row.error = errorCode(e);
        if (p) row.diagnostics = await diagnostics(p, resources, pageErrors);
      } finally {
        try {
          await c?.close();
        } catch {
          if (row.status !== "failed") {
            row.status = "failed";
            row.passed = false;
            row.phase = "cleanup";
          }
          row.cleanup_error = "CONTEXT_CLOSE_FAILED";
        }
        row.elapsed_ms = Date.now() - started;
        await persist();
      }
      console.log(JSON.stringify(row));
      // An unavailable workbench prevents subsequent PDF scenarios; don't invent results.
      if (row.status === "failed" && row.phase === "initialization") break;
    }
  } catch (e) {
    suiteError = errorCode(e);
  } finally {
    try {
      await b?.close();
    } catch {
      suiteError = "BROWSER_CLOSE_FAILED";
    }
    await persist(true);
  }
  assert.equal(suiteError, null);
  assert.equal(rows.filter((x) => x.passed).length, 4);
})().catch(() => {
  // Detailed, bounded evidence is in result.json; never print raw remote content.
  console.error("PDF_FAULT_SUITE_FAILED");
  process.exitCode = 1;
});
