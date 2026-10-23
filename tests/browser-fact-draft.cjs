// Authored synthetic workflow cases, not real-report extraction accuracy.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "fact-draft",
  );
  await fs.mkdir(out, { recursive: true });
  const names = [
    "source-to-saved-export",
    "invalid-and-duplicate",
    "unknown-unit",
    "page-identity",
    "remove-and-empty",
    "replacement-error-retry",
    "keyboard-and-layout",
    "isolation",
    "clipped-amount-keeps-saved-list",
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
    for (const width of [1440, 390]) {
      const c = await browser.newContext({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await c.newPage();
      p.setDefaultTimeout(6000);
      await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
      await p.waitForFunction(() => !document.querySelector("#run").disabled);
      await p.click("#run");
      await p.waitForSelector(".value");
      await p.fill("#notes", "Existing synthetic review");
      const saved = await p.evaluate(() =>
        localStorage.getItem("finevidence.review.v1"),
      );
      const req = [],
        errors = [];
      let lastPack;
      p.on("request", (r) => req.push({ method: r.method(), url: r.url() }));
      p.on("pageerror", (e) => errors.push(e.message));
      const select = async (name) => {
        await p.setInputFiles(
          "#pdf-file",
          path.join(__dirname, "fixtures/pdf", name),
        );
        await p.waitForFunction(
          () =>
            document.querySelector("#pdf-intake").getAttribute("aria-busy") ===
            "false",
        );
      };
      const open = async () => {
        await p.locator("#fact-draft summary").click();
      };
      const fill = async (raw = "120", scale = "1000000") => {
        for (const [id, value] of Object.entries({
          company: "SYNTHETIC Example",
          title: "Synthetic annual report",
          period: "2024 calendar year",
          raw_value: raw,
        }))
          await p.fill("#draft-" + id, value);
        await p.selectOption("#draft-currency", "USD");
        await p.selectOption("#draft-scale", scale);
        await p.click("#draft-use-page");
      };
      const add = () => p.click("#draft-add");
      const download = async () => {
        const event = p.waitForEvent("download");
        await p.focus("#draft-download");
        await p.keyboard.press("Enter");
        return JSON.parse(
          await fs.readFile(await (await event).path(), "utf8"),
        );
      };
      const check = async (name, fn) => {
        const row = rows.find((r) => r.width === width && r.name === name);
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
        console.log(JSON.stringify(row));
        await save();
      };
      await check("source-to-saved-export", async () => {
        await select("text.pdf");
        await open();
        await fill();
        await add();
        const pack = await download();
        assert.equal(pack.kind, "unverified_fact_drafts");
        assert.equal(pack.drafts.length, 1);
        const d = pack.drafts[0];
        assert.equal(d.normalized_value, "120000000");
        assert.equal(d.provenance.page, 1);
        assert.equal(d.provenance.page_kind, "pdf_physical");
        assert.equal(
          pack.file.sha256,
          createHash("sha256")
            .update(
              await fs.readFile(path.join(__dirname, "fixtures/pdf/text.pdf")),
            )
            .digest("hex"),
        );
        assert.equal(
          d.provenance.excerpt,
          await p.locator("#pdf-text").innerText(),
        );
        assert.equal(d.review_status, "pending_human_review");
        assert.equal(d.verified_by, null);
        assert.equal(pack.financial_calculation_eligible, false);
      });
      await check("invalid-and-duplicate", async () => {
        await add();
        assert.match(await p.locator("#draft-status").innerText(), /重复/);
        await p.fill("#draft-raw_value", "12");
        await add();
        assert.match(await p.locator("#draft-status").innerText(), /完整金额/);
        await p.fill("#draft-excerpt", "invented 120");
        await p.fill("#draft-raw_value", "120");
        await add();
        assert.match(
          await p.locator("#draft-status").innerText(),
          /当前物理页/,
        );
        assert.equal((await download()).drafts.length, 1);
      });
      await check("unknown-unit", async () => {
        await fill("120", "unknown");
        await add();
        const pack = await download();
        assert.equal(pack.drafts.length, 2);
        assert.equal(pack.drafts[1].normalized_value, null);
        assert.equal(pack.drafts[1].unit_scale, null);
      });
      await check("page-identity", async () => {
        await p.selectOption("#pdf-page", "2");
        assert.equal(await p.inputValue("#draft-excerpt"), "");
        assert.equal(await p.inputValue("#draft-raw_value"), "");
        await fill("100");
        await add();
        const pack = await download();
        assert.equal(pack.drafts[2].provenance.page, 2);
        assert.match(
          pack.drafts[2].provenance.excerpt,
          /prior revenue USD 100 million/,
        );
        await p
          .getByRole("button", { name: "查看草稿 1 原文", exact: true })
          .click();
        assert.equal(await p.inputValue("#pdf-page"), "1");
        assert.equal(
          await p.locator("#pdf-text").getAttribute("tabindex"),
          "0",
        );
      });
      await check("remove-and-empty", async () => {
        while (await p.locator("#draft-list li").count())
          await p.locator("#draft-list button[data-remove]").first().click();
        assert.equal(await p.locator("#draft-download").isDisabled(), true);
        assert.match(await p.locator("#draft-count").innerText(), /0/);
      });
      await check("replacement-error-retry", async () => {
        await fill();
        await add();
        await select("not-pdf.pdf");
        assert.equal(await p.locator("#pdf-result").isHidden(), true);
        assert.equal(await p.locator("#draft-download").isDisabled(), true);
        assert.equal(await p.locator("#draft-list li").count(), 0);
        await select("text.pdf");
        await open();
        assert.equal(await p.inputValue("#draft-company"), "");
        await fill();
        await add();
        assert.equal((await download()).drafts.length, 1);
        await select("blank.pdf");
        await open();
        assert.equal(await p.locator("#draft-add").isDisabled(), true);
        assert.equal(await p.locator("#draft-download").isDisabled(), true);
      });
      await check("keyboard-and-layout", async () => {
        await p.focus("#pdf-demo");
        await p.keyboard.press("Enter");
        await p.waitForFunction(
          () =>
            document.querySelector("#pdf-intake").getAttribute("aria-busy") ===
            "false",
        );
        await p.focus("#fact-draft summary");
        await p.keyboard.press("Enter");
        await p.focus("#draft-company");
        await p.keyboard.type("SYNTHETIC Example");
        await p.keyboard.press("Tab");
        await p.keyboard.type("Synthetic annual report");
        await p.keyboard.press("Tab"); // optional URL
        await p.keyboard.press("Tab");
        await p.keyboard.type("2024 calendar year");
        await p.keyboard.press("Tab"); // revenue selected
        await p.keyboard.press("Tab");
        await p.keyboard.type("120");
        await p.keyboard.press("Tab");
        await p.keyboard.type("USD"); // native select type-ahead
        await p.keyboard.press("Tab");
        await p.keyboard.type("1,000,000"); // million
        await p.keyboard.press("Tab"); // unknown basis
        await p.keyboard.press("Tab"); // unknown scope
        await p.keyboard.press("Tab"); // fill excerpt action
        assert.equal(
          await p.evaluate(() => document.activeElement.id),
          "draft-use-page",
        );
        await p.keyboard.press("Space");
        await p.keyboard.press("Tab"); // save after excerpt textarea
        assert.equal(
          await p.evaluate(() => document.activeElement.id),
          "draft-add",
        );
        await p.keyboard.press("Enter");
        const pack = await download();
        assert.equal(pack.drafts[0].normalized_value, "120000000");
        assert.equal(pack.drafts[0].currency, "USD");
        lastPack = pack;
        await fs.writeFile(
          path.join(out, `download-${width}.json`),
          JSON.stringify(pack, null, 2),
        );
        assert.equal(pack.classification, "SYNTHETIC_DEMO_UNVERIFIED");
        assert.equal(pack.drafts.length, 1);
        await p.focus("#draft-company");
        await p.keyboard.press("Tab");
        assert.equal(
          await p.evaluate(() => document.activeElement.id),
          "draft-title",
        );
        assert.equal(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await p.locator("#fact-draft").scrollIntoViewIfNeeded();
        await p.screenshot({ path: path.join(out, `worksheet-${width}.png`) });
        await p.locator("#draft-list").scrollIntoViewIfNeeded();
        await p.screenshot({ path: path.join(out, `saved-${width}.png`) });
      });
      await check("isolation", async () => {
        await p.setInputFiles("#replay-file", {
          name: "unverified.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(lastPack)),
        });
        await p.waitForFunction(() =>
          document
            .querySelector("#replay-status")
            .textContent.includes("SCHEMA_INVALID"),
        );
        assert.equal(await p.locator("#replay-report").isDisabled(), false);
        assert.deepEqual(errors, []);
        assert.equal(
          await p.evaluate(() => localStorage.getItem("finevidence.review.v1")),
          saved,
        );
        assert.equal(
          req.some((r) => r.method !== "GET"),
          false,
        );
        assert.equal(
          req.some(
            (r) =>
              new URL(r.url).origin !== new URL(p.url()).origin &&
              !r.url.startsWith("blob:"),
          ),
          false,
        );
        await p.reload();
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        assert.equal(await p.locator("#draft-list li").count(), 0);
        assert.equal(await p.locator("#draft-download").isDisabled(), true);
      });
      await check("clipped-amount-keeps-saved-list", async () => {
        await select("text.pdf");
        await open();
        await fill();
        await add();
        const original = await download();
        for (const fragment of ["12", "20"]) {
          await p.fill("#draft-raw_value", fragment);
          await p.fill("#draft-excerpt", fragment);
          await add();
          assert.match(
            await p.locator("#draft-status").innerText(),
            /完整金额/,
          );
          assert.equal(await p.locator("#draft-list li").count(), 1);
          if (fragment === "20") {
            await p.locator("#draft-status").scrollIntoViewIfNeeded();
            await p.screenshot({
              path: path.join(out, `clipped-refusal-${width}.png`),
            });
          }
          assert.deepEqual(await download(), original);
        }
      });
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
