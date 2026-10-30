// Catches report-write errors skipping real context/browser cleanup in the runner.
const assert = require("node:assert/strict"), fs = require("node:fs/promises");
const path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process"), { once } = require("node:events");
const out = path.resolve(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "brief-write");
const scenarios = ["healthy", "after-page-create", "after-context-close"];
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
    const dir = path.join(out, scenario), start = performance.now();
    await fs.mkdir(dir); // New evidence directory: never overwrite an earlier arm.
    const child = spawn(process.execPath, ["--require", path.join(__dirname, "helpers/brief-write-fault.cjs"), path.join(__dirname, "browser-brief-recovery.cjs")], {
      cwd: path.resolve(__dirname, ".."), env: { ...process.env, BASE_URL: `http://127.0.0.1:${server.address().port}/`, BROWSER_ARTIFACTS: dir, BRIEF_WRITE_FAULT: scenario }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", timedOut = false, killTimer;
    child.stdout.on("data", b => stdout += b); child.stderr.on("data", b => stderr += b);
    const timer = setTimeout(() => {
      timedOut = true; child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
    }, 90000);
    let code, signal;
    try { [code, signal] = await once(child, "close"); }
    finally { clearTimeout(timer); clearTimeout(killTimer); }
    await fs.writeFile(path.join(dir, "child.stdout.log"), stdout);
    await fs.writeFile(path.join(dir, "child.stderr.log"), stderr);
    const row = { scenario, passed: false, child_exit: code, signal, seconds: (performance.now() - start) / 1000 };
    try {
      const events = (await fs.readFile(path.join(dir, "cleanup.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
      const raw = await fs.readFile(path.join(dir, "brief-recovery/result.json"), "utf8"), report = JSON.parse(raw);
      row.browser_closes = events.filter(x => x.event === "browser-close").length;
      row.context_closes = events.filter(x => x.event === "context-close").length;
      row.probe_cleanup = events.some(x => x.event === "probe-cleanup");
      row.checkpoint = { finished: report.finished, passed: report.passed, failed: report.failed, not_run: report.not_run, total: report.total };
      assert.equal(timedOut, false); assert.equal(signal, null);
      assert.equal(code, scenario === "healthy" ? 0 : 1);
      assert.equal(row.probe_cleanup, false, "runner must close resources without probe intervention");
      assert.equal(row.browser_closes, 1);
      assert.equal(row.context_closes, scenario === "healthy" ? 4 : 1);
      assert.ok(events.some(x => x.event === "browser-closed" && !x.connected && x.contexts === 0));
      assert.equal(events.filter(x => x.event === "context-closed" && x.pages === 0).length, row.context_closes);
      assert.equal(report.total, 4);
      for (const text of [raw, stdout, stderr]) assert.ok(!text.includes("/Users/") && !text.includes("http://"));
      if (scenario === "healthy") {
        assert.equal(report.finished, true); assert.equal(report.passed, 4);
        assert.equal(stderr, "");
        row.download_controls = 0;
        for (const x of report.rows) {
          const html = await fs.readFile(path.join(dir, "brief-recovery", `${x.width}-${x.name}.html`), "utf8");
          for (const token of ["30.00%", "SYNTHETIC", "syn_aurora_2024", x.name === "download-retry" ? "corrected note on explicit retry" : "preserved draft before download"]) assert.ok(html.includes(token));
          row.download_controls++;
        }
      } else {
        assert.equal(events.filter(x => x.event === "filesystem-collision").length, 1);
        assert.ok((await fs.stat(path.join(dir, "brief-recovery/result.json.tmp"))).isDirectory());
        assert.equal(report.finished, false, "unwritable output cannot promise a final report");
        assert.equal(report.passed, scenario === "after-page-create" ? 0 : 1);
        assert.equal(report.not_run, 3); assert.equal(report.failed, 0);
        assert.equal(stderr.trim(), "REPORT_WRITE_FAILED");
      }
      row.passed = true;
    } catch (e) { row.error = e.message; process.exitCode = 1; }
    rows.push(row); console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ classification: "SYNTHETIC_REPORT_WRITE_CLEANUP", model_calls: 0, fault_cases: 2, healthy_runs: 1, total: 3, passed: rows.filter(x => x.passed).length, rows }, null, 2));
  }
})().catch(e => { console.error(e.name); process.exitCode = 1; }).finally(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
