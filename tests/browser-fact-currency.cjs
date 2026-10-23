// Synthetic end-to-end transcription boundary regression; no model calls.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const makePdf = require("./fixtures/unicode-pdf.cjs");
const fixtures = [
  ["rmb-decimal", "RMB1,120.50", "1,120.50", "1120500000"],
  ["rmb-negative", "RMB-120", "-120", "-120000000"],
  ["rmb-clause-comma", "RMB120, including other", "120", "120000000"],
  ["sign-before-code", "-RMB 120", "120", null],
  ["embedded-code", "ARMB120", "120", null],
  ["percent", "RMB120%", "120", null],
  ["clipped-digits", "RMB1200", "120", null],
];
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "fact-currency",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [1440, 390].flatMap((width) =>
    fixtures.flatMap(([name]) =>
      ["full", "clipped"].map((excerpt) => ({
        width,
        name,
        excerpt,
        passed: null,
      })),
    ),
  );
  let browser,
    finished = false,
    phase = "launch";
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_DEVELOPMENT",
          finished,
          phase,
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
    // Each PDF owns a browser context: Chromium can throttle many rapid
    // downloads in one context. Save/refuse/download still share one report.
    for (const width of [1440, 390]) {
      for (const [name, token, raw, expected] of fixtures) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          acceptDownloads: true,
        });
        const p = await context.newPage();
        p.setDefaultTimeout(10000);
        phase = "initialization";
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        const requests = [];
        p.on("request", (r) => requests.push(r.method()));
        const fixture = makePdf(token);
        await fs.writeFile(path.join(out, `${name}.pdf`), fixture.bytes);
        for (const excerpt of ["full", "clipped"]) {
          const row = rows.find(
            (r) =>
              r.width === width && r.name === name && r.excerpt === excerpt,
          );
          const start = performance.now();
          phase = "case";
          try {
            await p.setInputFiles("#pdf-file", {
              name: `SYNTHETIC-${name}.pdf`,
              mimeType: "application/pdf",
              buffer: fixture.bytes,
            });
            await p.waitForFunction(
              () =>
                document
                  .querySelector("#pdf-intake")
                  .getAttribute("aria-busy") === "false",
            );
            row.extracted_text = await p.locator("#pdf-text").textContent();
            assert.equal(row.extracted_text, fixture.text);
            await p.locator("#fact-draft summary").click();
            for (const [field, value] of Object.entries({
              company: "SYNTHETIC",
              title: "SYNTHETIC",
              period: "2024",
              raw_value: "300",
              excerpt: "control 300 units",
            }))
              await p.fill("#draft-" + field, value);
            await p.selectOption("#draft-currency", "unknown");
            await p.selectOption("#draft-scale", "1000000");
            await p.focus("#draft-add");
            await p.keyboard.press("Enter");
            const download = async () => {
              const event = p.waitForEvent("download");
              await p.focus("#draft-download");
              await p.keyboard.press("Enter");
              return JSON.parse(
                await fs.readFile(await (await event).path(), "utf8"),
              );
            };
            const original = await download();
            assert.equal(
              original.file.sha256,
              createHash("sha256").update(fixture.bytes).digest("hex"),
            );
            assert.equal(original.drafts.length, 1);
            assert.equal(original.drafts[0].normalized_value, "300000000");
            assert.equal(original.drafts[0].verified_by, null);
            assert.equal(original.financial_calculation_eligible, false);
            await p.fill("#draft-raw_value", raw);
            await p.fill(
              "#draft-excerpt",
              excerpt === "full" ? fixture.text : raw,
            );
            await p.focus("#draft-add");
            await p.keyboard.press("Enter");
            row.status = await p.locator("#draft-status").innerText();
            row.saved_count = await p.locator("#draft-list li").count();
            await p.locator("#draft-status").scrollIntoViewIfNeeded();
            await p.screenshot({
              path: path.join(out, `${width}-${name}-${excerpt}.png`),
            });
            const after = await download();
            await fs.writeFile(
              path.join(out, `${width}-${name}-${excerpt}.json`),
              JSON.stringify(after, null, 2),
            );
            if (expected === null) {
              assert.match(row.status, /完整金额/);
              assert.equal(row.saved_count, 1);
              assert.deepEqual(after, original);
            } else {
              assert.equal(row.saved_count, 2, row.status);
              assert.equal(after.drafts.length, 2);
              assert.deepEqual(after.drafts[0], original.drafts[0]);
              assert.equal(after.drafts[1].raw_value, raw);
              assert.equal(after.drafts[1].normalized_value, expected);
              assert.equal(after.drafts[1].currency, null);
              assert.equal(after.drafts[1].verified_by, null);
              assert.equal(after.financial_calculation_eligible, false);
            }
            assert.equal(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              true,
            );
            assert.equal(
              requests.some((m) => m !== "GET"),
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
        }
        await context.close();
      }
    }
    phase = "complete";
    finished = true;
  } catch (e) {
    process.exitCode = 1;
    await fs.writeFile(path.join(out, "harness-error.txt"), String(e));
  } finally {
    await save();
    await browser?.close();
  }
})();
