// Real DOM/File/Download workflow; synthetic corpus, no model or upload calls.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "handoff",
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
    for (const width of [1440, 390]) {
      const c = await b.newContext({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await c.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base);
      await p.waitForFunction(() => !document.getElementById("run").disabled);
      assert.equal(await p.locator("#replay-export").isDisabled(), true);
      await p.selectOption("#operation", "revenue-growth");
      await p.click("#run");
      await p.waitForSelector(".value");
      await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
      await p.fill("#notes", "交接：前期仍需人工复核。");
      const download = async (id) => {
        const event = p.waitForEvent("download");
        await p.focus(id);
        await p.keyboard.press("Enter");
        return JSON.parse(
          await fs.readFile(await (await event).path(), "utf8"),
        );
      };
      const data = await download("#replay-export");
      assert.equal(data.snapshot.calculations[0].display, "20.00%");
      assert.equal(data.snapshot.sources.length, 2);
      const saved = await p.evaluate(() =>
        localStorage.getItem("finevidence.review.v1"),
      );
      const requests = [];
      p.on("request", (r) => requests.push(r.url()));
      const select = async (buffer) => {
        await p.setInputFiles("#replay-file", {
          name: "review.json",
          mimeType: "application/json",
          buffer,
        });
        await p.waitForFunction(
          () =>
            document.getElementById("handoff").getAttribute("aria-busy") ===
            "false",
        );
      };
      // Delay only the file read to observe the actual loading UI. Bytes and
      // verifier remain real; this is an offline timing fault, not a slow-disk claim.
      await p.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = async function () {
          await new Promise((resolve) => {
            window.finishReplayRead = () => {
              File.prototype.arrayBuffer = original;
              resolve();
            };
          });
          return original.call(this);
        };
      });
      const chooserEvent = p.waitForEvent("filechooser");
      await p.focus("#replay-file");
      await p.keyboard.press("Space");
      await (
        await chooserEvent
      ).setFiles({
        name: "review.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
      await p.waitForFunction(
        () => typeof window.finishReplayRead === "function",
      );
      assert.equal(await p.locator("#replay-file").isDisabled(), true);
      assert.match(
        await p.locator("#replay-status").textContent(),
        /正在本机读取/,
      );
      await p.screenshot({
        path: path.join(out, `${width}-loading.png`),
        fullPage: true,
      });
      await p.evaluate(() => {
        window.finishReplayRead();
        delete window.finishReplayRead;
      });
      await p.waitForFunction(
        () =>
          document.getElementById("handoff").getAttribute("aria-busy") ===
          "false",
      );
      rows.push({
        name: `${width}-keyboard-file-picker-and-loading`,
        passed: true,
      });

      assert.match(await p.locator("#replay-status").textContent(), /一致/);
      assert.equal(await p.locator("#replay-checks li").count(), 7);
      const report = await download("#replay-report");
      assert.equal(report.passed, true);
      assert.equal(report.reviewed_count, 1);
      assert.match(report.file_sha256, /^[a-f0-9]{64}$/);
      rows.push({
        name: `${width}-keyboard-export-valid-roundtrip`,
        passed: true,
      });
      await p.screenshot({
        path: path.join(out, `${width}-verified.png`),
        fullPage: true,
      });
      data.snapshot.calculations[0].display = "999.00%";
      await select(Buffer.from(JSON.stringify(data)));
      assert.match(await p.locator("#replay-status").textContent(), /差异/);
      assert.match(
        await p.locator("#replay-checks").textContent(),
        /CALCULATION_MISMATCH/,
      );
      assert.match(
        await p.locator("#replay-checks .difference").textContent(),
        /999\.00%/,
      );
      assert.match(
        await p.locator("#replay-checks .difference").textContent(),
        /20\.00%/,
      );
      const bad = await download("#replay-report");
      assert.equal(bad.passed, false);
      await p.screenshot({
        path: path.join(out, `${width}-difference.png`),
        fullPage: true,
      });
      rows.push({ name: `${width}-changed-value-rejected`, passed: true });
      for (const [name, buffer, expected] of [
        ["legacy", Buffer.from('{"schema_version":1}'), "SCHEMA_INVALID"],
        ["broken-json", Buffer.from("{"), "JSON_INVALID"],
        ["oversize", Buffer.alloc(262145, 32), "FILE_LIMIT"],
        ["encoding", Buffer.from([0xff]), "UTF8_INVALID"],
      ]) {
        await select(buffer);
        assert.match(
          await p.locator("#replay-status").textContent(),
          new RegExp(expected),
        );
        rows.push({ name: `${width}-${name}`, passed: true });
      }
      data.snapshot.calculations[0].display = "20.00%";
      data.review.notes = "<img src=x onerror=alert(1)>";
      await select(Buffer.from(JSON.stringify(data)));
      assert.match(await p.locator("#replay-detail").textContent(), /<img/);
      assert.equal(await p.locator("#replay-detail img").count(), 0);
      assert.equal((await download("#replay-report")).passed, true);
      assert.equal(await p.inputValue("#notes"), "交接：前期仍需人工复核。");
      assert.equal(await p.locator(".value").textContent(), "20.00%");
      assert.equal(
        await p.evaluate(() => localStorage.getItem("finevidence.review.v1")),
        saved,
      );
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      rows.push({
        name: `${width}-safe-notes-recovery-no-network-no-draft-overwrite`,
        passed: true,
      });
      await p.selectOption("#company", "Harbor Lantern");
      assert.equal(await p.locator("#replay-export").isDisabled(), true);
      rows.push({ name: `${width}-scope-invalidates-export`, passed: true });
      await c.close();
    }
    const report = {
      base,
      classification: "SYNTHETIC_BROWSER_REGRESSION",
      paid_calls: 0,
      passed: rows.length,
      total: 18,
      rows,
    };
    assert.equal(rows.length, 18);
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
