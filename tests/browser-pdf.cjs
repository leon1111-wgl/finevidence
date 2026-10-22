// Actual PDF bytes and parser in a real browser; authored synthetic cases only.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "pdf",
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
      const c = await browser.newContext({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await c.newPage();
      p.setDefaultTimeout(5000);
      const errors = [],
        network = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base);
      await p.waitForFunction(() => !document.getElementById("run").disabled);
      await p.locator("#pdf-file").waitFor({ state: "visible", timeout: 2500 });
      await p.click("#run");
      await p.waitForSelector(".value");
      await p.fill("#notes", "Synthetic PDF test must preserve this review");
      const draft = await p.evaluate(() =>
        localStorage.getItem("finevidence.review.v1"),
      );
      p.on("request", (r) =>
        network.push({ method: r.method(), url: r.url() }),
      );
      const done = () =>
        p.waitForFunction(
          () =>
            document.getElementById("pdf-intake").getAttribute("aria-busy") ===
            "false",
        );
      const select = async (name, buffer) => {
        await p.setInputFiles(
          "#pdf-file",
          buffer
            ? { name, mimeType: "application/pdf", buffer }
            : path.join(__dirname, "fixtures/pdf", name),
        );
        await done();
      };
      const report = async () => {
        const e = p.waitForEvent("download");
        await p.focus("#pdf-download");
        await p.keyboard.press("Enter");
        return JSON.parse(await fs.readFile(await (await e).path(), "utf8"));
      };
      const check = async (name, fn) => {
        try {
          await fn();
          rows.push({ width, name, passed: true });
        } catch (e) {
          rows.push({ width, name, passed: false, error: e.message });
        }
        console.log(JSON.stringify(rows.at(-1)));
      };
      await check("text-pages-hash-export", async () => {
        await select("text.pdf");
        const r = await report();
        const raw = await fs.readFile(
          path.join(__dirname, "fixtures/pdf/text.pdf"),
        );
        assert.equal(
          r.file.sha256,
          createHash("sha256").update(raw).digest("hex"),
        );
        assert.equal(r.file.name, "text.pdf");
        assert.equal(r.page_count, 2);
        assert.deepEqual(
          r.pages.map((x) => x.page),
          [1, 2],
        );
        assert.match(r.pages[0].text, /revenue USD 120 million/);
        assert.match(r.pages[1].text, /prior revenue USD 100 million/);
        assert.equal(r.classification, "USER_SUPPLIED_UNVERIFIED");
        assert.equal(r.financial_calculation_eligible, false);
        assert.equal(r.status, "NEEDS_REVIEW");
        assert.equal(r.parser.version, "6.4.299");
        await p.selectOption("#pdf-page", "2");
        assert.match(
          await p.locator("#pdf-text").innerText(),
          /prior revenue USD 100 million/,
        );
        assert.equal(await p.locator(".value").innerText(), "30.00%");
        await p
          .locator("#pdf-intake")
          .screenshot({ path: path.join(out, `${width}-text.png`) });
      });
      await check("mixed-textless-page-explicit", async () => {
        await select("mixed.pdf");
        const r = await report();
        assert.equal(r.status, "NEEDS_OCR_OR_REVIEW");
        assert.equal(r.text_pages, 1);
        assert.equal(r.pages[1].status, "NO_EXTRACTABLE_TEXT");
        assert.equal(r.pages[1].text, "");
        await p.selectOption("#pdf-page", "2");
        assert.match(
          await p.locator("#pdf-text").innerText(),
          /没有提取到文字/,
        );
        await p
          .locator("#pdf-intake")
          .screenshot({ path: path.join(out, `${width}-mixed.png`) });
      });
      await check("unsupported-filter-remains-inconclusive", async () => {
        await select("page-error.pdf");
        const r = await report();
        assert.equal(r.page_count, 2);
        assert.equal(r.pages[1].status, "NO_EXTRACTABLE_TEXT");
        assert.equal(r.status, "NEEDS_OCR_OR_REVIEW");
        assert.equal(r.financial_calculation_eligible, false);
      });
      await check("image-only-needs-ocr-or-review", async () => {
        await select("image-only.pdf");
        const r = await report();
        assert.equal(r.text_pages, 0);
        assert.equal(r.status, "NEEDS_OCR_OR_REVIEW");
        assert.equal(r.pages[0].status, "NO_EXTRACTABLE_TEXT");
      });
      await check("blank-is-not-ready", async () => {
        await select("blank.pdf");
        const r = await report();
        assert.equal(r.text_pages, 0);
        assert.equal(r.status, "NEEDS_OCR_OR_REVIEW");
      });
      for (const [file, code] of [
        ["encrypted.pdf", "PDF_ENCRYPTED"],
        ["corrupt.pdf", "PDF_INVALID"],
        ["broken-page-tree.pdf", "PDF_EXTRACTION_FAILED"],
        ["not-pdf.pdf", "PDF_SIGNATURE"],
        ["pages-limit.pdf", "PDF_PAGE_LIMIT"],
        ["text-limit.pdf", "PDF_TEXT_LIMIT"],
        ["total-text-limit.pdf", "PDF_TEXT_LIMIT"],
      ]) {
        await check(file, async () => {
          await select(file);
          assert.match(
            await p.locator("#pdf-status").innerText(),
            new RegExp(code),
          );
          assert.equal(await p.locator("#pdf-download").isDisabled(), true);
          assert.equal(await p.locator("#pdf-result").isVisible(), false);
        });
      }
      await check("byte-limit-before-read", async () => {
        await select("oversize.pdf", Buffer.alloc(5 * 1024 * 1024 + 1));
        assert.match(
          await p.locator("#pdf-status").innerText(),
          /PDF_BYTE_LIMIT/,
        );
        assert.equal(await p.locator("#pdf-download").isDisabled(), true);
      });
      await check("retry-and-safe-name", async () => {
        const raw = await fs.readFile(
          path.join(__dirname, "fixtures/pdf/text.pdf"),
        );
        await select("<svg onload=alert(1)> " + "x".repeat(100) + ".pdf", raw);
        assert.equal(await p.locator("#pdf-name svg").count(), 0);
        assert.equal(await p.locator("#pdf-download").isDisabled(), false);
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      });
      await check("cancel-read-then-retry", async () => {
        await p.evaluate(() => {
          const original = File.prototype.arrayBuffer;
          File.prototype.arrayBuffer = async function () {
            File.prototype.arrayBuffer = original;
            await new Promise((resolve) => (window.releasePdfRead = resolve));
            return original.call(this);
          };
        });
        await p.setInputFiles(
          "#pdf-file",
          path.join(__dirname, "fixtures/pdf/text.pdf"),
        );
        await p.waitForFunction(
          () => typeof window.releasePdfRead === "function",
        );
        await p.focus("#pdf-cancel");
        await p.keyboard.press("Space");
        await done();
        assert.match(
          await p.locator("#pdf-status").innerText(),
          /PDF_CANCELLED/,
        );
        assert.equal(await p.locator("#pdf-download").isDisabled(), true);
        await p.evaluate(() => {
          window.releasePdfRead();
          delete window.releasePdfRead;
        });
        await select("text.pdf");
        assert.equal(await p.locator("#pdf-download").isDisabled(), false);
      });
      await check("synthetic-demo-keyboard", async () => {
        await p.focus("#pdf-demo");
        await p.keyboard.press("Space");
        await done();
        const r = await report();
        assert.equal(r.classification, "SYNTHETIC_DEMO_UNVERIFIED");
        assert.equal(r.financial_calculation_eligible, false);
        assert.equal(r.page_count, 2);
      });
      await check("clear-no-persistence-no-data-requests", async () => {
        await p.focus("#pdf-clear");
        await p.keyboard.press("Enter");
        assert.equal(await p.locator("#pdf-result").isVisible(), false);
        assert.equal(await p.locator("#pdf-download").isDisabled(), true);
        assert.equal(
          await p.evaluate(() => localStorage.getItem("finevidence.review.v1")),
          draft,
        );
        assert.equal(
          network.every(
            (r) =>
              r.method === "GET" &&
              new URL(r.url).origin === new URL(base).origin,
          ),
          true,
          JSON.stringify(network),
        );
        assert.deepEqual(errors, []);
        await p.reload();
        await p.waitForSelector(".value");
        assert.equal(await p.locator("#pdf-result").isVisible(), false);
        assert.equal(
          await p.inputValue("#notes"),
          "Synthetic PDF test must preserve this review",
        );
      });
      await c.close();
    }
    const result = {
      classification: "SYNTHETIC_PDF_BROWSER_ACCEPTANCE",
      base,
      paid_calls: 0,
      total: rows.length,
      passed: rows.filter((x) => x.passed).length,
      rows,
    };
    await fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    assert.equal(result.total, 34);
    assert.equal(result.passed, 34);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
