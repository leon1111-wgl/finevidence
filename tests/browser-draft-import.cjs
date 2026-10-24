// Authored synthetic receiving workflows; no model or real financial labels.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "draft-import",
  );
  await fs.mkdir(out, { recursive: true });
  const names = [
    "roundtrip",
    "renamed-source",
    "wrong-source",
    "altered-draft",
    "invalid-input",
    "read-failure-retry",
    "discard-staged",
    "edit-revokes-staged",
    "cancel-late-read",
    "clear-late-read",
    "replace-late-read",
    "deadline-retry",
    "keyboard-isolation",
  ];
  const rows = [1440, 390].flatMap((width) =>
    names.map((name) => ({ width, name, passed: null })),
  );
  let browser,
    finished = false;
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_DEVELOPMENT",
          finished,
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
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const pdf = await fs.readFile(
      path.join(__dirname, "fixtures/pdf/text.pdf"),
    );
    for (const row of rows) {
      if (
        process.env.DRAFT_IMPORT_ONLY &&
        row.name !== process.env.DRAFT_IMPORT_ONLY
      )
        continue;
      let c;
      const start = performance.now();
      try {
        c = await browser.newContext({
          viewport: { width: row.width, height: 1000 },
          acceptDownloads: true,
        });
        const p = await c.newPage();
        p.setDefaultTimeout(6000);
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        const select = async (name = "original.pdf") => {
          await p.setInputFiles("#pdf-file", {
            name,
            mimeType: "application/pdf",
            buffer: pdf,
          });
          await p.waitForFunction(
            () =>
              document
                .querySelector("#pdf-intake")
                .getAttribute("aria-busy") === "false",
          );
          await p.locator("#fact-draft > summary").click();
        };
        const add = async (page = 1, title = "Sender") => {
          await p.selectOption("#pdf-page", String(page));
          for (const [k, v] of Object.entries({
            company: "SYNTHETIC Example",
            title,
            period: page === 1 ? "2024" : "2023",
            raw_value: page === 1 ? "120" : "100",
          }))
            await p.fill("#draft-" + k, v);
          await p.click("#draft-use-page");
          await p.click("#draft-add");
        };
        const download = async () => {
          const wait = p.waitForEvent("download");
          await p.click("#draft-download");
          return JSON.parse(
            await fs.readFile(await (await wait).path(), "utf8"),
          );
        };
        await select();
        await add(1);
        await add(2);
        const incoming = await download();
        await p.reload();
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        await select(
          row.name === "renamed-source" ? "renamed.pdf" : "original.pdf",
        );
        await add(1, "Existing receiver work");
        const before = await download();
        const choose = async (value = incoming) => {
          await p.setInputFiles("#draft-import-file", {
            name: "handoff.json",
            mimeType: "application/json",
            buffer: Buffer.isBuffer(value)
              ? value
              : Buffer.from(
                  typeof value === "string" ? value : JSON.stringify(value),
                ),
          });
        };
        const stage = async (value = incoming) => {
          await choose(value);
          await p.waitForFunction(
            () => !document.querySelector("#draft-import-apply").hidden,
          );
        };
        const status = () => p.locator("#draft-import-status").textContent();
        const refused = async (value, code) => {
          await choose(value);
          await p.waitForFunction(
            (code) =>
              document
                .querySelector("#draft-import-status")
                .textContent.includes(code),
            code,
          );
          assert.equal(await p.locator("#draft-import-apply").isHidden(), true);
          assert.deepEqual(await download(), before);
        };
        const fault = async (mode) => {
          await p.evaluate((mode) => {
            const real = File.prototype.arrayBuffer;
            window.restoreDraftReader = () => {
              File.prototype.arrayBuffer = real;
            };
            File.prototype.arrayBuffer = function () {
              if (this.name !== "handoff.json") return real.call(this);
              if (mode === "reject")
                return Promise.reject(Error("PRIVATE_CANARY"));
              return new Promise((resolve, reject) => {
                window.finishDraftRead = () =>
                  real.call(this).then(resolve, reject);
              });
            };
          }, mode);
        };
        const release = () => p.evaluate(() => window.finishDraftRead?.());
        const assertPreserved = async () =>
          assert.deepEqual(await download(), before);
        switch (row.name) {
          case "roundtrip":
          case "renamed-source": {
            await stage();
            await assertPreserved();
            assert.match(await status(), /2 条/);
            assert.match(
              await p.locator("#draft-import-preview").textContent(),
              /交接文件：handoff.json/,
            );
            await p.click("#draft-import-apply");
            const actual = await download();
            const expected = structuredClone(incoming);
            if (row.name === "renamed-source") {
              expected.file.name = "renamed.pdf";
              for (const d of expected.drafts)
                d.provenance.file_name = "renamed.pdf";
            }
            assert.deepEqual(actual, expected);
            await fs.writeFile(
              path.join(out, `${row.width}-${row.name}.json`),
              JSON.stringify(actual, null, 2),
            );
            await p
              .getByRole("button", { name: "查看草稿 2 原文", exact: true })
              .click();
            assert.equal(await p.locator("#pdf-page").inputValue(), "2");
            assert.match(await p.locator("#pdf-text").textContent(), /100/);
            await p.click("#pdf-preview-show");
            await p.waitForSelector("#pdf-preview-image canvas");
            await p.screenshot({
              path: path.join(out, `${row.width}-${row.name}.png`),
              fullPage: true,
            });
            break;
          }
          case "wrong-source": {
            for (const patch of [
              { sha256: "b".repeat(64) },
              { bytes: incoming.file.bytes + 1 },
            ]) {
              const x = structuredClone(incoming);
              Object.assign(x.file, patch);
              await refused(x, "IMPORT_SOURCE");
            }
            break;
          }
          case "altered-draft": {
            for (const mutate of [
              (x) => (x.drafts[0].normalized_value = "999"),
              (x) => (x.drafts[0].review_status = "approved"),
              (x) => (x.drafts[0].provenance.excerpt = "Invented 120"),
            ]) {
              const x = structuredClone(incoming);
              mutate(x);
              await refused(x, "IMPORT_CHANGED");
            }
            break;
          }
          case "invalid-input": {
            await stage();
            await refused("{", "IMPORT_JSON");
            await refused(Buffer.from([0xff]), "IMPORT_ENCODING");
            await refused(Buffer.alloc(1024 * 1024 + 1, 32), "IMPORT_LIMIT");
            await refused(
              JSON.stringify(incoming).replace(
                '"schema_version":1',
                '"schema_version":2,"schema_version":1',
              ),
              "IMPORT_JSON",
            );
            await stage();
            break;
          }
          case "read-failure-retry": {
            await fault("reject");
            await refused(incoming, "IMPORT_READ");
            assert.doesNotMatch(await status(), /PRIVATE_CANARY/);
            await p.screenshot({
              path: path.join(out, `${row.width}-error.png`),
              fullPage: true,
            });
            await p.evaluate(() => window.restoreDraftReader());
            await stage();
            await p.click("#draft-import-apply");
            assert.deepEqual(await download(), incoming);
            break;
          }
          case "discard-staged": {
            await stage();
            await p.click("#draft-import-cancel");
            assert.equal(
              await p.locator("#draft-import-apply").isHidden(),
              true,
            );
            await assertPreserved();
            break;
          }
          case "edit-revokes-staged": {
            await stage();
            await add(2, "New receiver work");
            assert.equal(
              await p.locator("#draft-import-apply").isHidden(),
              true,
            );
            assert.equal((await download()).drafts.length, 2);
            break;
          }
          case "cancel-late-read":
          case "clear-late-read":
          case "replace-late-read": {
            await fault("pending");
            await choose();
            await p.waitForSelector("#draft-import-cancel");
            await p.screenshot({
              path: path.join(out, `${row.width}-${row.name}-loading.png`),
              fullPage: true,
            });
            if (row.name === "cancel-late-read")
              await p.click("#draft-import-cancel");
            else if (row.name === "clear-late-read")
              await p.click("#pdf-clear");
            else await select("new-source.pdf");
            await release();
            await p.waitForTimeout(100);
            assert.equal(
              await p.locator("#draft-import-apply").isHidden(),
              true,
            );
            if (row.name === "cancel-late-read") await assertPreserved();
            else assert.equal(await p.locator("#draft-list li").count(), 0);
            break;
          }
          case "deadline-retry": {
            await fault("pending");
            await choose();
            await p.waitForFunction(
              () =>
                document
                  .querySelector("#draft-import-status")
                  .textContent.includes("IMPORT_TIMEOUT"),
              null,
              { timeout: 7000 },
            );
            await assertPreserved();
            await release();
            await p.waitForTimeout(50);
            assert.equal(
              await p.locator("#draft-import-apply").isHidden(),
              true,
            );
            await choose();
            await release();
            await p.waitForFunction(
              () => !document.querySelector("#draft-import-apply").hidden,
            );
            await p.click("#draft-import-apply");
            assert.deepEqual(await download(), incoming);
            break;
          }
          case "keyboard-isolation": {
            await p.click("#run");
            await p.waitForSelector(".value");
            await p.fill("#notes", "Existing synthetic review");
            const saved = await p.evaluate(() =>
              localStorage.getItem("finevidence.review.v1"),
            );
            const requests = [];
            p.on("request", (r) => requests.push(r.method()));
            incoming.drafts[0].company = "<img src=x onerror=alert(1)>";
            await stage();
            assert.equal(
              await p.locator("#draft-import-preview img").count(),
              0,
            );
            assert.match(
              await p.locator("#draft-import-preview").textContent(),
              /<img src=x onerror=alert\(1\)>/,
            );
            await p.focus("#draft-import-apply");
            await p.keyboard.press("Enter");
            assert.deepEqual(await download(), incoming);
            assert.equal(
              await p.evaluate(() =>
                localStorage.getItem("finevidence.review.v1"),
              ),
              saved,
            );
            assert.equal(requests.includes("POST"), false);
            assert.ok(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
            );
            await p.locator("#draft-count").scrollIntoViewIfNeeded();
            await p.screenshot({
              path: path.join(out, `${row.width}-restored.png`),
            });
            break;
          }
        }
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = String(e.message)
          .replace(/https?:\/\/[^\s)]+/g, "[url]")
          .slice(0, 700);
        process.exitCode = 1;
      } finally {
        await c?.close();
        row.elapsed_ms = Math.round(performance.now() - start);
        await save();
        console.log(JSON.stringify(row));
      }
    }
    finished = true;
  } catch (e) {
    process.exitCode = 1;
    console.log("IMPORT_BROWSER_SETUP_FAILED", e.name);
  } finally {
    await browser?.close();
    await save();
  }
})();
