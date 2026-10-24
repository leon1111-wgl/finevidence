// FE-024 characterization: commit is earlier than body parsing. No product mocks.
const { chromium } = require("playwright");
const { ready, dataError } = require("./helpers/browser-waits.cjs");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "waits",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [1440, 390].flatMap((width) =>
    ["ready", "dataError"].flatMap((wait) =>
      ["delayed", "absent", "wrong-state"].map((mode) => ({
        width,
        wait,
        mode,
        passed: null,
      })),
    ),
  );
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_TEST_WAIT_CONTRACT",
          total: rows.length,
          passed: rows.filter((r) => r.passed === true).length,
          failed: rows.filter((r) => r.passed === false).length,
          not_run: rows.filter((r) => r.passed === null).length,
          rows,
        },
        null,
        2,
      ),
    );
  await save();
  let release = () => {};
  let mode;
  const server = http.createServer((req, res) => {
    if (req.url !== "/") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(
      "<!doctype html><html><head><title>Test wait boundary</title></head>",
    );
    release = () =>
      res.end(
        "<body>" +
          (mode === "absent"
            ? ""
            : `<button id="run" ${mode === "wrong-state" ? "disabled" : ""}>Run</button><p id="status" role="${mode === "wrong-state" ? "status" : "alert"}">State</p>`) +
          "</body></html>",
      );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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
      });
      const p = await context.newPage();
      mode = row.mode;
      try {
        await p.goto(`http://127.0.0.1:${server.address().port}/`, {
          waitUntil: "commit",
        });
        assert.equal(await p.locator("#run").count(), 0);
        // Attach rejection immediately so the old predicate cannot escape the report.
        const waiting = { ready, dataError }[row.wait](p, 500).then(
          () => ({ ok: true }),
          (e) => ({ ok: false, name: e.name, message: e.message }),
        );
        await p.evaluate(() => document.readyState);
        release();
        const result = await waiting;
        if (row.mode === "delayed")
          assert.equal(result.ok, true, JSON.stringify(result));
        else {
          assert.equal(result.ok, false);
          assert.equal(result.name, "TimeoutError", JSON.stringify(result));
        }
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = e.message;
      } finally {
        release();
        await context.close();
        await save();
      }
    }
  } finally {
    release();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    JSON.stringify({
      total: rows.length,
      passed: rows.filter((r) => r.passed).length,
    }),
  );
  if (rows.some((r) => !r.passed)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
