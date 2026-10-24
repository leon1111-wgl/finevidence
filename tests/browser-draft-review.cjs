// Authored preparation/editing scenarios, not financial semantic accuracy.
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const names = [
    "missing-fields-export",
    "conflict-edit-save",
    "invalid-edit-retry",
    "cancel-keeps-saved",
    "page-change-ends-edit",
    "import-ends-edit",
    "delete-ends-edit",
    "file-reset",
    "keyboard-layout",
    "no-promotion-isolation",
    "duplicate-edit-preserves",
    "save-invalidates-import",
  ];
  const planned = process.env.REVIEW_BASELINE ? names.slice(0, 2) : names;
  const rows = [1440, 390].flatMap((width) =>
    planned.map((name) => ({ width, name, passed: null })),
  );
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "draft-review",
  );
  await fs.mkdir(out, { recursive: true });
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_DEVELOPMENT",
          source_documents: 1,
          model_calls: 0,
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
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    for (const row of rows) {
      let context;
      const start = performance.now();
      try {
        context = await browser.newContext({
          viewport: { width: row.width, height: 1000 },
          acceptDownloads: true,
        });
        const p = await context.newPage();
        p.setDefaultTimeout(6000);
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(() => !document.querySelector("#run").disabled);
        const requests = [],
          errors = [];
        p.on("request", (r) => requests.push(r.method()));
        p.on("pageerror", (e) => errors.push(e.message));
        const select = async () => {
          await p.setInputFiles(
            "#pdf-file",
            path.join(__dirname, "fixtures/pdf/text.pdf"),
          );
          await p.waitForFunction(
            () => !document.querySelector("#pdf-result").hidden,
          );
          await p.locator("#fact-draft > summary").click();
        };
        const fill = async (raw = "120", known = true) => {
          for (const [k, v] of Object.entries({
            company: "SYNTHETIC Example",
            title: "Synthetic report",
            period: "2024",
            raw_value: raw,
            basis: known ? "IFRS" : "unknown",
            scope: known ? "consolidated" : "unknown",
            source_url: known ? "https://example.com/report.pdf" : "",
          }))
            await p.fill("#draft-" + k, v);
          await p.selectOption("#draft-currency", known ? "USD" : "unknown");
          await p.selectOption("#draft-scale", known ? "1000000" : "unknown");
          await p.click("#draft-use-page");
        };
        const download = async (id = "draft-download") => {
          const event = p.waitForEvent("download");
          await p.click("#" + id);
          const d = await event;
          const data = await fs.readFile(await d.path(), "utf8");
          await fs.writeFile(
            path.join(out, `${row.width}-${row.name}-${id}.json`),
            data,
          );
          return JSON.parse(data);
        };
        const edit = async (n = 1) =>
          p.getByRole("button", { name: `修改草稿 ${n}`, exact: true }).click();
        await select();
        await fill("120", row.name !== "missing-fields-export");
        await p.click("#draft-add");
        assert.equal(await p.locator("#draft-list > li").count(), 1);
        // Immediate capability check lets the same task plans measure the old release.
        assert.equal(
          await p.locator("#draft-review-download").count(),
          1,
          "review checklist capability absent",
        );
        if (row.name === "missing-fields-export") {
          assert.match(
            await p.textContent("#draft-list"),
            /待补证：来源网址、币种、单位倍率、会计准则、合并范围/,
          );
          await p.locator("#draft-count").scrollIntoViewIfNeeded();
          await p.screenshot({
            path: path.join(out, `${row.width}-missing-before-edit.png`),
          });
          const pack = await download("draft-review-download");
          assert.equal(pack.checks.rows_needing_attention, 1);
          assert.equal(pack.drafts[0].normalized_value, null);
          assert.equal(pack.financial_calculation_eligible, false);
          await edit();
          await p.selectOption("#draft-currency", "USD");
          await p.selectOption("#draft-scale", "1000000");
          await p.fill("#draft-basis", "IFRS");
          await p.fill("#draft-scope", "consolidated");
          await p.fill("#draft-source_url", "https://example.com/report.pdf");
          await p.click("#draft-add");
          assert.equal(await p.locator("#draft-list > li").count(), 1);
          assert.match(
            await p.textContent("#draft-review-summary"),
            /0 条有缺项/,
          );
          assert.equal(
            (await download()).drafts[0].normalized_value,
            "120000000",
          );
        } else if (row.name === "conflict-edit-save") {
          await p.selectOption("#pdf-page", "2");
          await fill("100");
          await p.click("#draft-add");
          assert.match(
            await p.textContent("#draft-list"),
            /同一声明口径金额不一致/,
          );
          await p.locator("#draft-count").scrollIntoViewIfNeeded();
          await p.screenshot({
            path: path.join(out, `${row.width}-conflict-before-edit.png`),
          });
          const r = await download("draft-review-download");
          assert.deepEqual(r.checks.groups[0].rows, [1, 2]);
          assert.deepEqual(r.checks.groups[0].normalized_values, [
            "120000000",
            "100000000",
          ]);
          await edit(2);
          assert.equal(await p.inputValue("#pdf-page"), "2");
          await p.fill("#draft-period", "2023");
          await p.click("#draft-add");
          assert.equal(await p.locator("#draft-list > li").count(), 2);
          assert.match(
            await p.textContent("#draft-review-summary"),
            /0 条有缺项/,
          );
          const pack = await download();
          assert.equal(pack.drafts[1].period, "2023");
          assert.equal(pack.drafts[1].provenance.page, 2);
          await p
            .getByRole("button", { name: "查看草稿 2 原文", exact: true })
            .click();
          assert.match(await p.textContent("#pdf-text"), /100/);
        } else if (row.name === "invalid-edit-retry") {
          const before = await download();
          await edit();
          await p.fill("#draft-raw_value", "999");
          await p.click("#draft-add");
          assert.equal(await p.getAttribute("#draft-status", "role"), "alert");
          assert.deepEqual(await download(), before);
          assert.equal(await p.locator("#draft-edit-cancel").isVisible(), true);
          await p.fill("#draft-raw_value", "120");
          await p.fill("#draft-period", "2024 revised declaration");
          await p.click("#draft-add");
          assert.equal(
            (await download()).drafts[0].period,
            "2024 revised declaration",
          );
        } else if (row.name === "cancel-keeps-saved") {
          const before = await download();
          await edit();
          await p.fill("#draft-period", "2099");
          await p.click("#draft-edit-cancel");
          assert.deepEqual(await download(), before);
          assert.equal(await p.textContent("#draft-edit-state"), "");
        } else if (row.name === "page-change-ends-edit") {
          await edit();
          await p.selectOption("#pdf-page", "2");
          assert.equal(await p.textContent("#draft-edit-state"), "");
          await fill("100");
          await p.click("#draft-add");
          const d = await download();
          assert.equal(d.drafts.length, 2);
          assert.equal(d.drafts[0].raw_value, "120");
          assert.equal(d.drafts[1].provenance.page, 2);
        } else if (row.name === "import-ends-edit") {
          const pack = await download();
          await edit();
          await p.fill("#draft-period", "2099");
          await p.setInputFiles("#draft-import-file", {
            name: "saved.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(pack)),
          });
          await p.waitForSelector("#draft-import-apply:visible");
          await p.click("#draft-import-apply");
          assert.equal(await p.textContent("#draft-edit-state"), "");
          assert.deepEqual(await download(), pack);
          assert.equal(await p.textContent("#draft-add"), "保存待核验草稿");
        } else if (row.name === "delete-ends-edit") {
          await p.selectOption("#pdf-page", "2");
          await fill("100");
          await p.click("#draft-add");
          await edit(2);
          await p
            .getByRole("button", { name: "删除草稿 1", exact: true })
            .click();
          assert.equal(await p.textContent("#draft-edit-state"), "");
          const pack = await download();
          assert.equal(pack.drafts.length, 1);
          assert.equal(pack.drafts[0].raw_value, "100");
        } else if (row.name === "duplicate-edit-preserves") {
          await p.fill("#draft-period", "2023");
          await p.click("#draft-add");
          const before = await download();
          await edit(2);
          await p.fill("#draft-period", "2024");
          await p.click("#draft-add");
          assert.equal(await p.getAttribute("#draft-status", "role"), "alert");
          assert.deepEqual(await download(), before);
          assert.match(await p.textContent("#draft-edit-state"), /草稿 2/);
        } else if (row.name === "save-invalidates-import") {
          const before = await download();
          await edit();
          await p.setInputFiles("#draft-import-file", {
            name: "old.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(before)),
          });
          await p.waitForSelector("#draft-import-apply:visible");
          await p.fill("#draft-period", "2024 corrected declaration");
          await p.click("#draft-add");
          assert.equal(
            await p.locator("#draft-import-apply").isVisible(),
            false,
          );
          assert.equal(
            (await download()).drafts[0].period,
            "2024 corrected declaration",
          );
        } else if (row.name === "file-reset") {
          await edit();
          await p.click("#pdf-clear");
          assert.equal(
            await p.locator("#draft-review-download").isDisabled(),
            true,
          );
          await select();
          assert.equal(await p.locator("#draft-list > li").count(), 0);
          assert.equal(await p.textContent("#draft-edit-state"), "");
          assert.match(
            await p.textContent("#draft-review-summary"),
            /保存草稿后/,
          );
        } else if (row.name === "keyboard-layout") {
          // Real Tab traversal from the source button to Edit; no injected handlers.
          await p
            .getByRole("button", { name: "查看草稿 1 原文", exact: true })
            .focus();
          await p.keyboard.press("Tab");
          assert.equal(
            await p.evaluate(() => document.activeElement.textContent),
            "修改草稿 1",
          );
          await p.keyboard.press("Enter");
          assert.equal(
            await p.evaluate(() => document.activeElement.id),
            "draft-company",
          );
          await p.keyboard.press("Tab");
          assert.equal(
            await p.evaluate(() => document.activeElement.id),
            "draft-title",
          );
          await p.fill("#draft-title", "Keyboard revision");
          await p.focus("#draft-add");
          await p.keyboard.press("Enter");
          assert.equal(
            await p.evaluate(() => document.activeElement.id),
            "draft-count",
          );
          assert.equal((await download()).drafts[0].title, "Keyboard revision");
          assert.ok(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        } else if (row.name === "no-promotion-isolation") {
          const report = await download("draft-review-download");
          assert.equal(report.kind, "unverified_draft_review");
          assert.equal(report.financial_calculation_eligible, false);
          assert.equal(report.licensing_status, "not_verified");
          assert.equal(report.drafts[0].verified_by, null);
          assert.equal(report.drafts[0].review_status, "pending_human_review");
          assert.deepEqual(report.checks.gates, [
            "SOURCE_RIGHTS_NOT_VERIFIED",
            "AUTHENTICATED_SEMANTIC_REVIEW_REQUIRED",
          ]);
          const file = {
            name: "checklist.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(report)),
          };
          await p.setInputFiles("#draft-import-file", file);
          await p.waitForFunction(
            () =>
              document
                .querySelector("#draft-import-status")
                .getAttribute("role") === "alert",
          );
          assert.match(
            await p.textContent("#draft-import-status"),
            /IMPORT_SCHEMA/,
          );
          await p.setInputFiles("#replay-file", file);
          await p.waitForFunction(
            () => !document.querySelector("#replay-report").disabled,
          );
          assert.match(await p.textContent("#replay-status"), /SCHEMA_INVALID/);
          assert.equal(await p.locator("#draft-list > li").count(), 1);
        }
        assert.deepEqual(errors, []);
        assert.ok(
          requests.every((m) => m === "GET"),
          "no user data uploads",
        );
        await p.locator("#draft-count").scrollIntoViewIfNeeded();
        await p.screenshot({
          path: path.join(out, `${row.width}-${row.name}.png`),
        });
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = String(e.message).slice(0, 800);
      } finally {
        row.elapsed_ms = +(performance.now() - start).toFixed(2);
        await context?.close();
        await save();
      }
    }
  } finally {
    await browser?.close();
    await save();
  }
  const summary = {
    total: rows.length,
    passed: rows.filter((r) => r.passed === true).length,
  };
  console.log(JSON.stringify(summary));
  if (summary.passed !== summary.total) process.exitCode = 1;
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
