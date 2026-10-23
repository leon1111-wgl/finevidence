// Synthetic identity mapping for offline CI. Real PDFs are never fixtures.
const { chromium } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "source-catalog",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [];
  let browser;
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_DEVELOPMENT",
          planned: 14,
          passed: rows.filter((r) => r.passed).length,
          rows,
        },
        null,
        2,
      ),
    );
  try {
    const fixture = await fs.readFile(
      path.join(__dirname, "../web/pdf-demo.pdf"),
    );
    const hash = createHash("sha256").update(fixture).digest("hex");
    let moduleSource;
    try {
      moduleSource = await fs.readFile(
        path.join(__dirname, "../web/source-catalog.mjs"),
        "utf8",
      );
    } catch {
      moduleSource = "";
    }
    const fake = moduleSource
      .replace(
        "dd453567d91ae07d1db89bfc227fa441dba06f1de84ff819f6ee8f9484f7e5c7",
        hash,
      )
      .replace("1126393", String(fixture.length));
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await context.newPage();
      p.setDefaultTimeout(10000);
      // Only the known fingerprint is replaced: screenshots/results are labelled synthetic.
      await p.route("**/source-catalog.mjs", (r) =>
        r.fulfill({ contentType: "text/javascript", body: fake }),
      );
      const requests = [];
      p.on("request", (r) =>
        requests.push({ method: r.method(), url: r.url() }),
      );
      const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
      await p.goto(base);
      await p.waitForFunction(() => !document.querySelector("#run").disabled);
      const check = async (name, fn) => {
        const row = { width, name };
        const start = performance.now();
        try {
          await fn();
          row.passed = true;
        } catch (e) {
          row.passed = false;
          row.error = e.message;
          process.exitCode = 1;
        }
        row.elapsed_ms = performance.now() - start;
        rows.push(row);
        await save();
      };
      const upload = async (buffer = fixture, name = "renamed.pdf") => {
        await p.setInputFiles("#pdf-file", {
          name,
          mimeType: "application/pdf",
          buffer,
        });
        await p.waitForFunction(
          () =>
            document.querySelector("#pdf-intake").getAttribute("aria-busy") ===
            "false",
        );
      };
      const download = async (id) => {
        const d = p.waitForEvent("download");
        await p.focus(id);
        await p.keyboard.press("Enter");
        return JSON.parse(await fs.readFile(await (await d).path(), "utf8"));
      };
      await check(
        "keyboard catalog and no implicit external fetch",
        async () => {
          await p.focus("#source-catalog summary");
          await p.keyboard.press("Enter");
          assert.equal(
            await p.locator("#source-catalog").getAttribute("open"),
            "",
          );
          assert.equal(await p.locator("#source-catalog-list a").count(), 4);
          for (const a of await p.locator("#source-catalog-list a").all()) {
            assert.equal(
              new URL(await a.getAttribute("href")).hostname,
              "investor.kingdee.com",
            );
            assert.match(await a.getAttribute("rel"), /noreferrer/);
          }
          assert.equal(await p.locator("#pdf-result").isVisible(), false);
          assert.equal(
            requests.some(
              (r) =>
                new URL(r.url).origin !== new URL(base).origin ||
                r.method !== "GET",
            ),
            false,
          );
        },
      );
      await check("renamed file identity and unverified export", async () => {
        await upload();
        assert.match(
          await p.locator("#pdf-source").innerText(),
          /目录文件一致/,
        );
        const report = await download("#pdf-download");
        assert.equal(
          report.source_reference.record.id,
          "kingdee-fy2023-results",
        );
        assert.equal(report.file.sha256, hash);
        assert.equal(report.verification_status, "unverified");
        assert.equal(report.financial_calculation_eligible, false);
        await p.locator("#fact-draft summary").click();
        for (const [k, v] of Object.entries({
          company: "SYNTHETIC user assertion",
          title: "SYNTHETIC source identity test",
          period: "2024",
          raw_value: "120",
          excerpt: "120",
        }))
          await p.fill("#draft-" + k, v);
        await p.focus("#draft-add");
        await p.keyboard.press("Enter");
        const draft = await download("#draft-download");
        assert.equal(
          draft.source_reference.record.id,
          "kingdee-fy2023-results",
        );
        assert.equal(draft.source_metadata_status, "user_supplied_unverified");
        assert.equal(draft.licensing_status, "not_verified");
        assert.equal(draft.drafts[0].company, "SYNTHETIC user assertion");
        assert.equal(draft.drafts[0].verified_by, null);
        assert.equal(draft.financial_calculation_eligible, false);
        await p.locator("#pdf-source").scrollIntoViewIfNeeded();
        await p.screenshot({
          path: path.join(out, `SYNTHETIC-${width}-matched.png`),
        });
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      });
      await check(
        "changed bytes with same filename revoke catalog match",
        async () => {
          await upload(Buffer.concat([fixture, Buffer.from("\n")]));
          assert.match(
            await p.locator("#pdf-source").innerText(),
            /未匹配目录/,
          );
          assert.equal(
            (await download("#pdf-download")).source_reference.record,
            null,
          );
          assert.equal(await p.locator("#draft-list li").count(), 0);
        },
      );
      await check("invalid file clears previous reference", async () => {
        await upload(Buffer.from("not a PDF"));
        assert.match(
          await p.locator("#pdf-status").innerText(),
          /PDF_SIGNATURE/,
        );
        assert.equal(await p.locator("#pdf-source").textContent(), "");
        assert.equal(await p.locator("#pdf-download").isDisabled(), true);
      });
      await check("explicit retry restores only current identity", async () => {
        await upload();
        assert.match(
          await p.locator("#pdf-source").innerText(),
          /目录文件一致/,
        );
        assert.equal(
          (await download("#pdf-download")).source_reference.record.id,
          "kingdee-fy2023-results",
        );
      });
      await check("keyboard clear removes all identity", async () => {
        await p.focus("#pdf-clear");
        await p.keyboard.press("Enter");
        assert.equal(await p.locator("#pdf-source").textContent(), "");
        assert.equal(await p.locator("#pdf-result").isVisible(), false);
        assert.equal(await p.locator("#pdf-download").isDisabled(), true);
      });
      await check("catalog does not upload files or call model", async () => {
        assert.equal(
          requests.some(
            (r) =>
              r.method !== "GET" ||
              new URL(r.url).origin !== new URL(base).origin,
          ),
          false,
        );
      });
      await context.close();
    }
  } catch (e) {
    process.exitCode = 1;
    rows.push({ name: "harness", passed: false, error: e.stack });
  } finally {
    await save();
    await browser?.close();
  }
  console.log(
    JSON.stringify({
      passed: rows.filter((r) => r.passed).length,
      total: 14,
      failed: rows.filter((r) => !r.passed),
    }),
  );
})();
