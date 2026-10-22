// File identity belongs to the last attempted import, never to an older success.
// Actual File/DOM/download paths; only slow/unreadable files are injected faults.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "handoff-identity",
  );
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const rows = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await context.newPage();
      p.setDefaultTimeout(5000);
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base);
      await p.waitForFunction(() => !document.getElementById("run").disabled);
      await p.click("#run");
      await p.waitForSelector(".value");
      await p.fill("#notes", "Identity review must not overwrite this draft.");
      const download = async (id) => {
        const event = p.waitForEvent("download");
        await p.focus(id);
        await p.keyboard.press("Enter");
        return JSON.parse(
          await fs.readFile(await (await event).path(), "utf8"),
        );
      };
      const data = await download("#replay-export");
      const a = Buffer.from(
        JSON.stringify({ ...data, exported_at: "2026-10-22T00:00:00.000Z" }),
      );
      const b = Buffer.from(
        JSON.stringify({ ...data, exported_at: "2026-10-22T00:01:00.000Z" }),
      );
      const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
      assert.notEqual(hash(a), hash(b));
      const saved = await p.evaluate(() =>
        localStorage.getItem("finevidence.review.v1"),
      );
      const requests = [];
      p.on("request", (r) => requests.push(r.url()));
      const select = async (name, buffer) => {
        await p.setInputFiles("#replay-file", {
          name,
          mimeType: "application/json",
          buffer,
        });
        await p.waitForFunction(
          () =>
            document.getElementById("handoff").getAttribute("aria-busy") ===
            "false",
        );
      };
      const identity = () =>
        p.evaluate(() => ({
          name: document.getElementById("replay-name")?.textContent ?? null,
          short:
            document.getElementById("replay-hash-short")?.textContent ?? null,
          full:
            document.getElementById("replay-hash-full")?.textContent ?? null,
          fingerprintHidden:
            document.getElementById("replay-fingerprint")?.hidden ?? true,
        }));
      const identified = async (name, bytes) => {
        const state = await identity();
        assert.equal(state.name, name, "page must identify the current file");
        assert.equal(
          state.short,
          hash(bytes).slice(0, 12),
          "short digest must identify its bytes",
        );
        assert.equal(state.full, hash(bytes));
        assert.equal(state.fingerprintHidden, false);
        const report = await download("#replay-report");
        assert.equal(report.file_name, name);
        assert.equal(report.file_sha256, hash(bytes));
        assert.equal(
          await p.inputValue("#replay-file"),
          "",
          "same file must remain reselectable",
        );
        return report;
      };
      const unprocessed = async (name, code) => {
        const state = await identity();
        assert.equal(state.name, name);
        assert.equal(state.short, "");
        assert.equal(state.full, "");
        assert.equal(state.fingerprintHidden, true);
        assert.equal(await p.locator("#replay-report").isDisabled(), true);
        assert.equal(await p.locator("#replay-checks li").count(), 0);
        assert.match(
          await p.locator("#replay-status").textContent(),
          new RegExp(code),
        );
      };
      const check = async (name, fn) => {
        const start = performance.now();
        try {
          await fn();
          rows.push({
            name: `${width}-${name}`,
            passed: true,
            elapsed_ms: performance.now() - start,
          });
        } catch (e) {
          rows.push({
            name: `${width}-${name}`,
            passed: false,
            error: e.stack,
            elapsed_ms: performance.now() - start,
          });
        }
        console.log(JSON.stringify(rows.at(-1)));
      };
      await check("first-file", async () => {
        await select("交接A.json", a);
        assert.equal((await identified("交接A.json", a)).passed, true);
      });
      await check("replacement-file", async () => {
        await select("交接A.json", a);
        await select("交接B.json", b);
        assert.equal((await identified("交接B.json", b)).passed, true);
      });
      await check("same-name-different-bytes", async () => {
        await select("review.json", a);
        await select("review.json", b);
        assert.equal((await identified("review.json", b)).passed, true);
      });
      await check("rejected-json-still-identifies-bytes", async () => {
        const bytes = Buffer.from("{");
        await select("broken.json", bytes);
        assert.equal((await identified("broken.json", bytes)).passed, false);
        assert.match(
          await p.locator("#replay-status").textContent(),
          /JSON_INVALID/,
        );
      });
      for (const [name, bytes, code] of [
        ["oversize.json", Buffer.alloc(262145, 32), "FILE_LIMIT"],
        ["encoding.json", Buffer.from([255]), "UTF8_INVALID"],
      ])
        await check(name, async () => {
          await select("previous.json", a);
          await select(name, bytes);
          await unprocessed(name, code);
          await select("previous.json", a);
          assert.equal((await identified("previous.json", a)).passed, true);
        });
      await check("unreadable-then-retry", async () => {
        await select("previous.json", a);
        await p.evaluate(() => {
          const read = File.prototype.arrayBuffer;
          File.prototype.arrayBuffer = function () {
            File.prototype.arrayBuffer = read;
            return Promise.reject(
              new DOMException("injected", "NotReadableError"),
            );
          };
        });
        await select("unreadable.json", b);
        await unprocessed("unreadable.json", "FILE_READ_FAILED");
        await p
          .locator("#handoff")
          .screenshot({ path: path.join(out, `${width}-read-error.png`) });
        await select("unreadable.json", b);
        assert.equal((await identified("unreadable.json", b)).passed, true);
      });
      await check("pending-revokes-old-identity", async () => {
        await select("previous.json", a);
        await p.evaluate(() => {
          const read = File.prototype.arrayBuffer;
          File.prototype.arrayBuffer = async function () {
            await new Promise((resolve) => {
              window.finishIdentityRead = resolve;
            });
            File.prototype.arrayBuffer = read;
            return read.call(this);
          };
        });
        await p.setInputFiles("#replay-file", {
          name: "pending.json",
          mimeType: "application/json",
          buffer: b,
        });
        await p.waitForFunction(
          () => typeof window.finishIdentityRead === "function",
        );
        try {
          await unprocessed("pending.json", "正在本机读取");
        } finally {
          await p.evaluate(() => {
            window.finishIdentityRead();
            delete window.finishIdentityRead;
          });
          await p.waitForFunction(
            () =>
              document.getElementById("handoff").getAttribute("aria-busy") ===
              "false",
          );
        }
        assert.equal((await identified("pending.json", b)).passed, true);
      });
      await check("safe-long-name-keyboard-digest", async () => {
        const name =
          "<img src=x onerror=alert(1)>-" + "交接材料".repeat(30) + ".json";
        await select(name, a);
        assert.equal((await identified(name, a)).passed, true);
        assert.equal(await p.locator("#replay-name img").count(), 0);
        await p.focus("#replay-fingerprint summary");
        await p.keyboard.press("Enter");
        assert.equal(await p.locator("#replay-hash-full").isVisible(), true);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await p
          .locator("#handoff")
          .screenshot({ path: path.join(out, `${width}-identity.png`) });
      });
      await check("export-and-cancel-preserve-import-verdict", async () => {
        await select("review.json", a);
        const before = await p.locator("#replay-status").textContent();
        const priorIdentity = await identity();
        await download("#replay-export");
        assert.equal(
          await p.locator("#replay-status").textContent(),
          before,
          "export must not replace the received file verdict",
        );
        await p.setInputFiles("#replay-file", []);
        assert.deepEqual(await identity(), priorIdentity);
        assert.equal((await identified("review.json", a)).passed, true);
        assert.equal(
          await p.evaluate(() => localStorage.getItem("finevidence.review.v1")),
          saved,
        );
        assert.deepEqual(requests, []);
        assert.deepEqual(errors, []);
      });
      await context.close();
    }
    const report = {
      base,
      classification: "SYNTHETIC_BROWSER_REGRESSION",
      paid_calls: 0,
      passed: rows.filter((r) => r.passed).length,
      total: rows.length,
      rows,
    };
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    assert.equal(report.total, 20);
    assert.equal(report.passed, 20);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
