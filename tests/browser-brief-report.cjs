// Frozen reporting contracts against the actual four-case brief recovery runner.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process"), { once } = require("node:events");
const out = path.resolve(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "brief-report");
const scenarios = ["ready", "download", "launch", "context", "context-close", "ready-close", "browser-close", "kill"];
const plan = [1440, 390].flatMap(width => ["download-retry", "legacy-html"].map(name => [width, name]));
let server;
(async () => {
  await fs.mkdir(out, { recursive: true });
  const web = path.resolve(__dirname, "../web");
  server = http.createServer(async (req, res) => {
    try {
      const name = new URL(req.url, "http://localhost").pathname;
      const file = path.resolve(web, name === "/" ? "index.html" : name.slice(1));
      if (!file.startsWith(web + path.sep)) throw Error();
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": { ".html": "text/html", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" }[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const rows = [];
  for (const scenario of scenarios) {
    const start = performance.now(), dir = path.join(out, scenario);
    await fs.mkdir(dir, { recursive: true });
    const child = spawn(process.execPath, ["--require", path.join(__dirname, "helpers/brief-report-fault.cjs"), path.join(__dirname, "browser-brief-recovery.cjs")], {
      cwd: path.resolve(__dirname, ".."), env: { ...process.env, BASE_URL: `http://127.0.0.1:${server.address().port}/`, BROWSER_ARTIFACTS: dir, BRIEF_REPORT_FAULT: scenario }, stdio: ["ignore", "pipe", "pipe"],
    });
    const reportPath = path.join(dir, "brief-recovery/result.json");
    let stdout = "", stderr = "", checkpoint = false, killed = false, timedOut = false, killTimer;
    child.stdout.on("data", b => stdout += b); child.stderr.on("data", b => stderr += b);
    const poll = setInterval(async () => {
      try {
        const r = JSON.parse(await fs.readFile(reportPath, "utf8"));
        if (!r.finished && r.total === 4 && (scenario === "kill"
          ? r.suite_phase === "browser-launch" && r.not_run === 4
          : r.passed === 2 && r.rows[2].status === "running")) {
          checkpoint = true;
          if (scenario === "kill" && !killed) { killed = true; child.kill("SIGKILL"); }
        }
      } catch {}
    }, 40);
    const timer = setTimeout(() => {
      timedOut = true; child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, scenario === "kill" ? 5000 : 90000);
    let code, signal;
    try { [code, signal] = await once(child, "close"); }
    finally { clearInterval(poll); clearTimeout(timer); clearTimeout(killTimer); }
    await fs.writeFile(path.join(dir, "child.stdout.log"), stdout);
    await fs.writeFile(path.join(dir, "child.stderr.log"), stderr);
    const row = { scenario, passed: false, child_exit: code, signal, checkpoint, seconds: (performance.now() - start) / 1000 };
    try {
      assert.equal(timedOut, false, "child must complete or reach the intended kill checkpoint");
      assert.equal(code, scenario === "kill" ? null : 1);
      const raw = await fs.readFile(reportPath, "utf8"), r = JSON.parse(raw);
      row.child_passed = r.passed; row.child_total = r.total;
      assert.equal(r.schema_version, 2); assert.equal(r.total, 4);
      assert.equal(r.classification, "SYNTHETIC_BRIEF_BOUNDARIES");
      assert.equal(r.model_calls, 0); assert.equal(r.source_documents, 1);
      assert.deepEqual(r.rows.map(x => [x.width, x.name]), plan);
      assert.equal(r.finished, scenario !== "kill");
      for (const text of [raw, stdout, stderr]) {
        assert.ok(!text.includes("PRIVATE_BRIEF_CANARY") && !text.includes("/Users/") && !text.includes("http://"), "private raw details must not escape");
      }
      if (["launch", "kill"].includes(scenario)) {
        assert.equal(r.suite_phase, "browser-launch");
        assert.equal(r.suite_error, scenario === "launch" ? "HARNESS_ERROR" : null);
        assert.equal(r.attempted, 0); assert.equal(r.passed, 0); assert.equal(r.failed, 0); assert.equal(r.not_run, 4);
        if (scenario === "kill") { assert.equal(checkpoint, true); assert.equal(signal, "SIGKILL"); }
      } else if (scenario === "browser-close") {
        assert.equal(r.suite_error, "HARNESS_ERROR"); assert.equal(r.suite_phase, "browser-close");
        assert.equal(r.suite_cleanup_error, "HARNESS_ERROR");
        assert.equal(r.passed, 4); assert.equal(r.failed, 0); assert.equal(r.not_run, 0);
      } else {
        const f = r.rows[2], cleanup = scenario.endsWith("close");
        assert.equal(r.attempted, cleanup ? 3 : 4); assert.equal(r.passed, cleanup ? 2 : 3);
        assert.equal(r.failed, 1); assert.equal(r.not_run, cleanup ? 1 : 0);
        assert.equal(r.suite_error, cleanup ? "HARNESS_ERROR" : null);
        assert.equal(f.status, "failed");
        const phase = scenario === "context" ? "context-create" : scenario === "context-close" ? "context-close" : scenario === "download" ? "download" : "ready";
        assert.equal(f.phase, phase);
        assert.equal(f.error_code, ["context", "context-close"].includes(scenario) ? "HARNESS_ERROR" : "TIMEOUT");
        assert.equal("error" in f, false);
        if (cleanup) assert.equal(f.cleanup_error, "HARNESS_ERROR");
        if (["ready", "ready-close", "download"].includes(scenario)) {
          assert.equal(checkpoint, true);
          assert.equal(f.diagnostics.schema_version, 2);
          assert.equal(f.diagnostics.readiness.run_disabled, scenario !== "download");
          assert.ok(f.diagnostics.resources.length <= 16);
          if (scenario !== "download") assert.ok(f.diagnostics.resources.some(e => e.resource === "runtime.json" && e.status === 503));
          assert.equal(f.screenshot.policy, "layout_only"); assert.equal(f.screenshot.saved, true);
          assert.equal((await fs.readFile(path.join(dir, "brief-recovery", f.screenshot.file))).subarray(1, 4).toString(), "PNG");
        }
      }
      // Inspect real downloads from every passing row; no synthetic assertion bypass.
      row.download_controls = 0;
      for (const x of r.rows.filter(x => x.passed)) {
        const html = await fs.readFile(path.join(dir, "brief-recovery", `${x.width}-${x.name}.html`), "utf8");
        for (const token of ["30.00%", "SYNTHETIC", "syn_aurora_2024", x.name === "download-retry" ? "corrected note on explicit retry" : "preserved draft before download"]) assert.ok(html.includes(token));
        row.download_controls++;
      }
      row.passed = true;
    } catch (e) { row.error = e.message; process.exitCode = 1; }
    rows.push(row); console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ classification: "SYNTHETIC_BRIEF_REPORT_CONTRACT", model_calls: 0, total: scenarios.length, passed: rows.filter(r => r.passed).length, rows }, null, 2));
  }
})().catch(e => { console.error(e.name); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
