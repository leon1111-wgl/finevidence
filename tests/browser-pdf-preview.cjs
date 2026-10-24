// Fixed authored UI scenarios, never financial accuracy or human approval.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf-preview",
  );
  await fs.mkdir(out, { recursive: true });
  const names = [
    "page-layout-keyboard",
    "page-change",
    "blank-page",
    "worker-failure-retry",
    "cancel-late-result",
    "replacement-clear",
    "draft-export-unchanged",
    "identity-and-limits",
    "zoom-collapse",
    "held-worker-timeout",
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
    for (const row of rows) {
      const c = await browser.newContext({
        viewport: { width: row.width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await c.newPage();
      p.setDefaultTimeout(6000);
      const requests = [],
        errors = [];
      p.on("request", (r) =>
        requests.push({ url: r.url(), method: r.method() }),
      );
      p.on("pageerror", (e) => errors.push(e.message));
      const start = performance.now();
      try {
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        assert.equal(
          await p.locator("#pdf-preview-show").count(),
          1,
          "Original-page preview action must exist",
        );
        const select = async (name = "text.pdf") => {
          await p.setInputFiles(
            "#pdf-file",
            path.join(__dirname, "fixtures/pdf", name),
          );
          await p.waitForFunction(
            () =>
              document
                .querySelector("#pdf-intake")
                .getAttribute("aria-busy") === "false",
          );
        };
        const render = async () => {
          await p.focus("#pdf-preview-show");
          await p.keyboard.press("Enter");
          await p.waitForFunction(
            () =>
              document
                .querySelector("#pdf-preview")
                .getAttribute("aria-busy") === "false",
            null,
            { timeout: 15000 },
          );
        };
        const pixels = () =>
          p.locator("#pdf-preview-image canvas").evaluate((can) => {
            const d = can
              .getContext("2d")
              .getImageData(0, 0, can.width, can.height).data;
            let dark = 0;
            for (let i = 0; i < d.length; i += 4)
              if (d[i] < 200 && d[i + 1] < 200 && d[i + 2] < 200) dark++;
            return { width: can.width, height: can.height, dark };
          });
        await select(row.name === "blank-page" ? "blank.pdf" : "text.pdf");
        if (row.name === "page-layout-keyboard") {
          await render();
          const x = await pixels();
          assert.ok(x.dark > 100);
          assert.ok(x.width * x.height <= 2000000);
          assert.ok(x.width <= 2000 && x.height <= 2000);
          assert.match(
            await p.locator("#pdf-preview-status").innerText(),
            /物理页 1/,
          );
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await p.locator("#pdf-preview").scrollIntoViewIfNeeded();
          await p.screenshot({
            path: path.join(out, `${row.width}-layout.png`),
          });
        } else if (row.name === "page-change") {
          await render();
          const first = await p
            .locator("canvas")
            .evaluate((x) => x.toDataURL());
          await p.selectOption("#pdf-page", "2");
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          await render();
          assert.match(
            await p.locator("#pdf-preview-status").innerText(),
            /物理页 2/,
          );
          assert.notEqual(
            await p.locator("canvas").evaluate((x) => x.toDataURL()),
            first,
          );
        } else if (row.name === "blank-page") {
          await render();
          assert.equal((await pixels()).dark, 0);
          assert.match(
            await p.locator("#pdf-text").innerText(),
            /没有提取到文字/,
          );
          assert.equal(await p.locator("#draft-add").isDisabled(), true);
        } else if (row.name === "worker-failure-retry") {
          await p.route("**/vendor/pdf.worker.min.mjs", (route) =>
            route.abort(),
          );
          await render();
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          assert.match(
            await p.locator("#pdf-preview-status").innerText(),
            /PDF_PREVIEW_(FAILED|TIMEOUT)/,
          );
          await p.locator("#pdf-preview").scrollIntoViewIfNeeded();
          await p.screenshot({
            path: path.join(out, `${row.width}-error.png`),
          });
          await p.unroute("**/vendor/pdf.worker.min.mjs");
          await render();
          assert.ok((await pixels()).dark > 100);
        } else if (row.name === "cancel-late-result") {
          let held;
          await p.route("**/vendor/pdf.worker.min.mjs", (route) => {
            held = route;
          });
          await p.click("#pdf-preview-show");
          await p.waitForFunction(
            () =>
              document
                .querySelector("#pdf-preview")
                .getAttribute("aria-busy") === "true",
          );
          await p.locator("#pdf-preview").scrollIntoViewIfNeeded();
          await p.screenshot({
            path: path.join(out, `${row.width}-loading.png`),
          });
          await p.focus("#pdf-preview-cancel");
          await p.keyboard.press("Enter");
          await p.waitForFunction(
            () =>
              document
                .querySelector("#pdf-preview")
                .getAttribute("aria-busy") === "false",
          );
          assert.match(
            await p.locator("#pdf-preview-status").innerText(),
            /取消/,
          );
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          if (held) await held.continue().catch(() => {});
          await p.unroute("**/vendor/pdf.worker.min.mjs");
          await render();
          assert.ok((await pixels()).dark > 100);
        } else if (row.name === "replacement-clear") {
          await render();
          await select("not-pdf.pdf");
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          assert.equal(await p.locator("#pdf-result").isHidden(), true);
          await select();
          await render();
          await p.click("#pdf-clear");
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
        } else if (row.name === "draft-export-unchanged") {
          await p.locator("#fact-draft summary").click();
          for (const [k, v] of Object.entries({
            company: "SYNTHETIC",
            title: "Synthetic report",
            period: "2024",
            raw_value: "120",
          }))
            await p.fill("#draft-" + k, v);
          await p.click("#draft-use-page");
          await p.click("#draft-add");
          const download = async () => {
            const e = p.waitForEvent("download");
            await p.click("#draft-download");
            return JSON.parse(
              await fs.readFile(await (await e).path(), "utf8"),
            );
          };
          const before = await download();
          await render();
          await p.selectOption("#pdf-page", "2");
          await render();
          assert.deepEqual(await download(), before);
          assert.equal(before.financial_calculation_eligible, false);
          assert.equal(before.drafts[0].verified_by, null);
          await fs.writeFile(
            path.join(out, `${row.width}-unverified.json`),
            JSON.stringify(before, null, 2),
          );
        } else if (row.name === "zoom-collapse") {
          await render();
          assert.equal(await p.locator("#pdf-preview-zoom").count(), 1);
          await p.selectOption("#pdf-preview-zoom", "actual");
          assert.equal(
            await p
              .locator("#pdf-preview-image")
              .evaluate((x) => x.scrollWidth > x.clientWidth),
            row.width === 390,
          );
          await p.focus("#pdf-preview-image");
          await p.keyboard.press("ArrowRight");
          if (row.width === 390)
            await p.waitForFunction(
              () => document.querySelector("#pdf-preview-image").scrollLeft > 0,
            );
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
          );
          await p.locator("#pdf-preview").scrollIntoViewIfNeeded();
          await p.screenshot({ path: path.join(out, `${row.width}-zoom.png`) });
          await p.focus("#pdf-preview-hide");
          await p.keyboard.press("Enter");
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          await render();
          assert.equal(await p.inputValue("#pdf-preview-zoom"), "fit");
        } else if (row.name === "held-worker-timeout") {
          let held;
          await p.route("**/vendor/pdf.worker.min.mjs", (route) => {
            held = route;
          });
          await render();
          assert.match(
            await p.locator("#pdf-preview-status").innerText(),
            /PDF_PREVIEW_TIMEOUT/,
          );
          assert.equal(await p.locator("#pdf-preview-image canvas").count(), 0);
          if (held) await held.continue().catch(() => {});
          await p.unroute("**/vendor/pdf.worker.min.mjs");
          await render();
          assert.ok((await pixels()).dark > 100);
        } else {
          const result = await p.evaluate(async () => {
            const { renderPdfPage, previewViewport } = await import(
              "./pdf-preview.mjs"
            );
            const raw = await (await fetch("./pdf-demo.pdf")).arrayBuffer();
            const file = new File([raw], "test.pdf");
            const can = document.createElement("canvas");
            const codes = [];
            for (const [hash, page] of [
              ["0".repeat(64), 1],
              ["0".repeat(64), 0],
            ]) {
              try {
                await renderPdfPage(file, { sha256: hash, page, canvas: can });
                codes.push("ACCEPTED");
              } catch (e) {
                codes.push(e.code);
              }
            }
            let invalid;
            try {
              previewViewport({ width: Infinity, height: 100 });
            } catch (e) {
              invalid = e.code;
            }
            return {
              codes,
              invalid,
              large: previewViewport({ width: 1e7, height: 1e7 }),
            };
          });
          assert.deepEqual(result.codes, [
            "PDF_PREVIEW_CHANGED",
            "PDF_PREVIEW_PAGE",
          ]);
          assert.equal(result.invalid, "PDF_PREVIEW_SIZE");
          assert.ok(result.large.width * result.large.height <= 2000000);
        }
        assert.deepEqual(errors, []);
        assert.equal(
          requests.some((r) => r.method !== "GET"),
          false,
        );
        assert.equal(
          requests.some(
            (r) =>
              !r.url.startsWith("blob:") &&
              new URL(r.url).origin !== new URL(p.url()).origin,
          ),
          false,
        );
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = e.message;
        process.exitCode = 1;
      }
      row.elapsed_ms = performance.now() - start;
      await save();
      console.log(JSON.stringify(row));
      await c.close();
    }
    finished = true;
  } catch (e) {
    process.exitCode = 1;
    await fs.writeFile(path.join(out, "harness-error.txt"), String(e));
  } finally {
    await save();
    await browser?.close();
  }
})();
