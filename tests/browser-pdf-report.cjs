// FE-019: a real failing child suite must retain its planned cases and prior pass.
// Only loopback HTTP responses are injected; browser, suite and parser are real.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const root = path.resolve(__dirname, "..");
const names = [
  "demo-resource-retry",
  "library-retry",
  "worker-timeout",
  "worker-cancel-retry",
];
const canary = "PRIVATE_DIAGNOSTIC_CANARY_do_not_record";
(async () => {
  const out = path.resolve(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf-report",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [];
  for (const scenario of ["first-startup", "second-startup"]) {
    const dir = path.join(out, scenario);
    await fs.mkdir(dir, { recursive: true });
    let visits = 0;
    const server = http.createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, "http://localhost").pathname;
        if (pathname === "/") visits++;
        const fail =
          scenario === "first-startup"
            ? visits === 1 && pathname === "/manifest.json"
            : visits === 2 && pathname === "/runtime.json";
        if (fail) {
          res.writeHead(scenario === "first-startup" ? 503 : 200, {
            "Content-Type": "application/json",
            "X-Private-Test": canary,
          });
          res.end(canary);
          return;
        }
        const relative =
          pathname === "/"
            ? "index.html"
            : decodeURIComponent(pathname.slice(1));
        const target = path.resolve(root, "web", relative);
        if (!target.startsWith(path.join(root, "web") + path.sep)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const data = await fs.readFile(target);
        const type =
          {
            ".mjs": "text/javascript",
            ".html": "text/html",
            ".json": "application/json",
            ".css": "text/css",
            ".pdf": "application/pdf",
          }[path.extname(target)] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/`;
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "browser-pdf-faults.cjs")],
      {
        cwd: root,
        env: { ...process.env, BASE_URL: base, BROWSER_ARTIFACTS: dir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      timedOut = false,
      checkpoint = false;
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    const resultPath = path.join(dir, "pdf-faults", "result.json");
    const poll = setInterval(async () => {
      try {
        const d = JSON.parse(await fs.readFile(resultPath, "utf8"));
        if (d.finished === false && d.total === 4) checkpoint = true;
      } catch {}
    }, 100);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 60000);
    const [code, signal] = await once(child, "close");
    clearTimeout(timer);
    clearInterval(poll);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.writeFile(path.join(dir, "child.stdout.log"), stdout);
    await fs.writeFile(path.join(dir, "child.stderr.log"), stderr);
    let row = {
      name: scenario,
      passed: false,
      child_exit: code,
      child_signal: signal,
      checkpoint,
    };
    try {
      assert.equal(
        timedOut,
        false,
        "child must terminate within its existing startup wait",
      );
      assert.equal(code, 1, "startup failure must keep a failing exit");
      let raw;
      try {
        raw = await fs.readFile(resultPath, "utf8");
      } catch {
        assert.fail(
          "startup failure must persist a final result.json with all four planned cases",
        );
      }
      const report = JSON.parse(raw),
        passed = scenario === "first-startup" ? 0 : 1;
      assert.equal(report.total, 4);
      assert.equal(report.finished, true);
      assert.equal(report.passed, passed);
      assert.equal(report.failed, 1);
      assert.equal(report.not_run, 3 - passed);
      assert.equal(report.attempted, passed + 1);
      assert.deepEqual(
        report.rows.map((x) => x.name),
        names,
      );
      assert.deepEqual(
        report.rows.map((x) => x.status),
        passed
          ? ["passed", "failed", "not_run", "not_run"]
          : ["failed", "not_run", "not_run", "not_run"],
      );
      assert.equal(report.rows[passed].phase, "initialization");
      assert.equal(report.rows[passed].passed, false);
      assert.equal(
        report.rows[passed].diagnostics.readiness.run_disabled,
        true,
      );
      assert.equal(
        report.rows[passed].diagnostics.readiness.retry_visible,
        true,
      );
      assert.ok(report.rows[passed].diagnostics.resources.length <= 16);
      assert.ok(
        report.rows[passed].diagnostics.resources.some(
          (e) =>
            e.resource === (passed ? "runtime.json" : "manifest.json") &&
            e.status === (passed ? 200 : 503),
        ),
      );
      assert.ok(
        !raw.includes(canary) &&
          !stdout.includes(canary) &&
          !stderr.includes(canary),
        "diagnostics must not copy response or page content",
      );
      assert.equal(
        checkpoint,
        true,
        "persist a checkpoint before suite completion",
      );
      row = {
        ...row,
        passed: true,
        report: {
          passed: report.passed,
          failed: report.failed,
          not_run: report.not_run,
          total: report.total,
        },
      };
    } catch (e) {
      row.error = e.message;
    }
    rows.push(row);
    console.log(JSON.stringify(row));
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_TEST_RUNNER_RECOVERY",
          paid_calls: 0,
          passed: rows.filter((x) => x.passed).length,
          total: 2,
          rows,
        },
        null,
        2,
      ),
    );
  }
  assert.equal(rows.filter((x) => x.passed).length, 2);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
