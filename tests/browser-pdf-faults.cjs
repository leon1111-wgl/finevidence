// Inject only resource/network faults; keep the real DOM, Worker and parser paths.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf-faults",
  );
  await fs.mkdir(out, { recursive: true });
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const rows = [];
  try {
    for (const mode of [
      "demo-resource-retry",
      "library-retry",
      "worker-timeout",
      "worker-cancel-retry",
    ]) {
      const c = await b.newContext({ viewport: { width: 390, height: 1000 } });
      const p = await c.newPage();
      p.setDefaultTimeout(18000);
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
      const select = () =>
        p.setInputFiles(
          "#pdf-file",
          path.join(__dirname, "fixtures/pdf/text.pdf"),
        );
      const done = () =>
        p.waitForFunction(
          () =>
            document.getElementById("pdf-intake").getAttribute("aria-busy") ===
            "false",
        );
      try {
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
        rows.push({ name: mode, passed: true });
      } catch (e) {
        rows.push({ name: mode, passed: false, error: e.message });
      }
      await c.close();
      console.log(JSON.stringify(rows.at(-1)));
    }
    const result = {
      base,
      classification: "INJECTED_BROWSER_FAULTS_NOT_REAL_DOCUMENT_QUALITY",
      paid_calls: 0,
      passed: rows.filter((x) => x.passed).length,
      total: rows.length,
      rows,
    };
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    assert.equal(result.passed, 4);
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
