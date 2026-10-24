// Source-name compatibility regression. PDF content is explicitly synthetic.
const { chromium } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "draft-filename",
  );
  await fs.mkdir(out, { recursive: true });
  const cases = [
    ["newline", "report\n2024.pdf", '"report\\n2024.pdf"'],
    ["tab", "report\t2024.pdf", '"report\\t2024.pdf"'],
    ["literal-backslash", "report\\n2024.pdf", '"report\\\\n2024.pdf"'],
    ["bidi-html", "a\u202e<img src=x>.pdf", '"a\\u202e<img src=x>.pdf"'],
    ["legacy-v1", "report\n2024.pdf", '"report\\n2024.pdf"'],
    ["renamed-legacy", "renamed.pdf", "renamed.pdf"],
    ["invalid-retry", "normal.pdf", "normal.pdf"],
  ];
  const rows = [1440, 390].flatMap((width) =>
    cases.map(([name, file, display]) => ({
      width,
      name,
      file,
      display,
      passed: null,
    })),
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
      ),
      legacy = JSON.parse(
        await fs.readFile(
          path.join(__dirname, "fixtures/draft-filename-v1.json"),
          "utf8",
        ),
      );
    for (const row of rows) {
      let c;
      const start = performance.now();
      try {
        c = await browser.newContext({
          viewport: { width: row.width, height: 1000 },
          acceptDownloads: true,
        });
        const p = await c.newPage();
        p.setDefaultTimeout(7000);
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        const select = async (name) => {
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
        };
        if (row.name === "invalid-retry") {
          await select("x".repeat(513) + ".pdf");
          assert.match(
            await p.locator("#pdf-status").textContent(),
            /PDF_NAME_INVALID/,
          );
          assert.equal(await p.locator("#pdf-result").isHidden(), true);
          assert.equal(await p.locator("#pdf-download").isDisabled(), true);
        }
        await select(row.file);
        assert.equal(await p.locator("#pdf-name").textContent(), row.display);
        const originalText = await p.locator("#pdf-text").textContent();
        await p.locator("#fact-draft > summary").click();
        for (const [k, v] of Object.entries({
          company: "SYNTHETIC Example",
          title: "Saved before receive",
          period: "2024",
          raw_value: "120",
        }))
          await p.fill("#draft-" + k, v);
        await p.click("#draft-use-page");
        await p.click("#draft-add");
        const download = async (label, selector = "#draft-download") => {
          const e = p.waitForEvent("download");
          await p.click(selector);
          const d = await e;
          const dest = path.join(out, `${row.width}-${row.name}-${label}.json`);
          await d.saveAs(dest);
          return JSON.parse(await fs.readFile(dest, "utf8"));
        };
        const before = await download("before");
        assert.equal(before.file.name, row.file);
        assert.equal(before.drafts[0].provenance.file_name, row.file);
        assert.equal(
          (await download("pages", "#pdf-download")).file.name,
          row.file,
        );
        const incoming = row.name.includes("legacy")
          ? structuredClone(legacy)
          : before;
        const requests = [];
        p.on("request", (r) => {
          if (r.method() !== "GET") requests.push(r.method());
        });
        await p.setInputFiles("#draft-import-file", {
          name: "delivery\t1.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(incoming)),
        });
        await p.waitForFunction(
          () =>
            document
              .querySelector("#draft-import")
              .getAttribute("aria-busy") === "false",
        );
        assert.equal(
          await p.locator("#draft-import-apply").isVisible(),
          true,
          await p.locator("#draft-import-status").textContent(),
        );
        const preview = await p.locator("#draft-import-preview").textContent();
        assert.ok(preview.includes('"delivery\\t1.json"'));
        assert.ok(preview.includes(row.display));
        assert.equal(await p.locator("#draft-import-preview img").count(), 0);
        assert.deepEqual(await download("staged"), before);
        await p.focus("#draft-import-apply");
        await p.keyboard.press("Enter");
        const after = await download("after");
        const want = structuredClone(incoming);
        want.file.name = row.file;
        for (const d of want.drafts) d.provenance.file_name = row.file;
        assert.deepEqual(after, want);
        assert.equal(after.financial_calculation_eligible, false);
        assert.ok(
          after.drafts.every(
            (d) => d.verified_by === null && d.normalized_value === null,
          ),
        );
        assert.equal(await p.locator("#pdf-text").textContent(), originalText);
        await p.click("#pdf-preview-show");
        await p.waitForSelector("#pdf-preview-image canvas");
        assert.ok(
          (await p.locator("#pdf-preview-status").textContent()).includes(
            row.display,
          ),
        );
        assert.ok(
          (
            await p
              .locator("#pdf-preview-image canvas")
              .getAttribute("aria-label")
          ).includes(row.display),
        );
        await p.locator("#pdf-name").scrollIntoViewIfNeeded();
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await p.screenshot({
          path: path.join(out, `${row.width}-${row.name}.png`),
        });
        assert.equal(requests.length, 0);
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = e.message.slice(0, 600);
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
    console.log("FILENAME_SETUP_FAILED", e.name);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await save();
  }
})();
