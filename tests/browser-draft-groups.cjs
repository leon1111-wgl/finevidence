// One authored synthetic PDF. Navigation/density coverage, not financial quality.
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const out = path.join(
    process.env.BROWSER_ARTIFACTS || "browser-artifacts",
    "draft-groups",
  );
  await fs.mkdir(out, { recursive: true });
  const rows = [1440, 390].flatMap((width) =>
    [
      "twenty-members",
      "delete-reindex",
      "resolve-conflict",
      "replace-clear",
    ].map((name) => ({ width, name, passed: null })),
  );
  const save = () =>
    fs.writeFile(
      path.join(out, "result.json"),
      JSON.stringify(
        {
          classification: "SYNTHETIC_REVIEW_NAVIGATION",
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
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    for (const row of rows) {
      const context = await browser.newContext({
        viewport: { width: row.width, height: 1000 },
        acceptDownloads: true,
      });
      const p = await context.newPage();
      p.setDefaultTimeout(5000);
      const started = performance.now();
      try {
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8765/");
        await p.waitForFunction(
          () => document.querySelector("#run")?.disabled === false,
        );
        const calls = [],
          errors = [];
        p.on("request", (r) => calls.push(r.method()));
        p.on("pageerror", (e) => errors.push(e.message));
        await p.setInputFiles(
          "#pdf-file",
          path.join(__dirname, "fixtures/pdf/text.pdf"),
        );
        await p.waitForSelector("#pdf-result:visible");
        await p.locator("#fact-draft > summary").click();
        for (const [k, v] of Object.entries({
          company: "SYNTHETIC Example",
          title: "Row 1",
          period: "2024",
          raw_value: "120",
          basis: "IFRS",
          scope: "group",
          source_url: "https://example.com/report.pdf",
        }))
          await p.fill("#draft-" + k, v);
        await p.selectOption("#draft-currency", "USD");
        await p.selectOption("#draft-scale", "1000");
        await p.click("#draft-use-page");
        await p.click("#draft-add");
        const download = async (id = "draft-download", label = "saved") => {
          const event = p.waitForEvent("download");
          await p.click("#" + id);
          const raw = await fs.readFile(await (await event).path(), "utf8");
          await fs.writeFile(
            path.join(out, `${row.width}-${row.name}-${label}.json`),
            raw,
          );
          return JSON.parse(raw);
        };
        const one = await download();
        const receive = async (pack) => {
          await p.setInputFiles("#draft-import-file", {
            name: "drafts.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(pack)),
          });
          await p.waitForSelector("#draft-import-apply:visible");
          await p.click("#draft-import-apply");
        };
        const many = structuredClone(one);
        many.drafts = Array.from({ length: 20 }, (_, i) => ({
          ...structuredClone(one.drafts[0]),
          title: `Row ${i + 1}`,
        }));
        await receive(many);
        assert.equal(await p.locator("#draft-list > li").count(), 20);
        const before = await download(
          "draft-review-download",
          "checklist-before",
        );
        row.member_lists = await p
          .locator("#draft-review-groups details")
          .count();
        assert.equal(
          row.member_lists,
          1,
          "one shared comparison group is needed",
        );
        const summary = p.locator("#draft-review-groups summary");
        await summary.focus();
        await p.keyboard.press("Enter");
        assert.equal(await p.locator("#draft-review-groups a").count(), 20);
        if (row.name === "twenty-members") {
          for (let n = 1; n <= 20; n++) {
            const link = p.getByRole("link", {
              name: `定位草稿 ${n}`,
              exact: true,
            });
            if (n === 1) {
              await summary.focus();
              await p.keyboard.press("Tab");
              assert.equal(
                await link.evaluate((e) => e === document.activeElement),
                true,
              );
            } else await link.focus();
            await p.keyboard.press("Enter");
            assert.equal(
              await p.evaluate(() => document.activeElement.id),
              `draft-row-${n}`,
            );
            const back = p
              .locator("#draft-list > li")
              .nth(n - 1)
              .getByRole("link", { name: "查看检查组 1", exact: true });
            await p.keyboard.press("Tab");
            assert.equal(
              await back.evaluate((e) => e === document.activeElement),
              true,
            );
            await p.keyboard.press("Enter");
            assert.equal(
              await p.evaluate(() => document.activeElement.tagName),
              "SUMMARY",
            );
          }
          assert.deepEqual(
            await download("draft-review-download", "checklist-after"),
            before,
          );
          row.keyboard_targets = 20;
          row.full_member_lists = 1;
        } else if (row.name === "delete-reindex") {
          await p
            .getByRole("button", { name: "删除草稿 1", exact: true })
            .click();
          await p.locator("#draft-review-groups summary").click();
          assert.equal(await p.locator("#draft-review-groups a").count(), 19);
          await p
            .getByRole("link", { name: "定位草稿 19", exact: true })
            .click();
          assert.equal(
            await p.evaluate(() => document.activeElement.id),
            "draft-row-19",
          );
          const pack = await download(
            "draft-review-download",
            "checklist-after",
          );
          assert.equal(pack.drafts[18].title, "Row 20");
          assert.deepEqual(
            pack.checks.groups[0].rows,
            Array.from({ length: 19 }, (_, i) => i + 1),
          );
          assert.equal(pack.checks.rows_needing_attention, 19);
        } else if (row.name === "resolve-conflict") {
          await receive(one);
          await p.selectOption("#pdf-page", "2");
          await p.fill("#draft-raw_value", "100");
          await p.fill("#draft-title", "Prior row");
          await p.click("#draft-use-page");
          await p.click("#draft-add");
          await p.locator("#draft-review-groups summary").click();
          await p
            .getByRole("link", { name: "定位草稿 2", exact: true })
            .click();
          await p
            .getByRole("button", { name: "修改草稿 2", exact: true })
            .click();
          await p.fill("#draft-period", "2023");
          await p.click("#draft-add");
          assert.equal(
            await p.locator("#draft-review-groups").isVisible(),
            false,
          );
          const pack = await download(
            "draft-review-download",
            "checklist-after",
          );
          assert.deepEqual(pack.checks.groups, []);
          assert.equal(pack.drafts[1].provenance.page, 2);
          assert.equal(pack.financial_calculation_eligible, false);
        } else {
          await receive(one);
          assert.equal(
            await p.locator("#draft-review-groups").isVisible(),
            false,
          );
          assert.deepEqual(await download(), one);
          await p
            .getByRole("button", { name: "删除草稿 1", exact: true })
            .click();
          assert.equal(await p.locator("#draft-review-groups a").count(), 0);
          assert.equal(
            await p.locator("#draft-review-download").isDisabled(),
            true,
          );
        }
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.deepEqual(errors, []);
        assert.equal(
          calls.some((m) => m !== "GET"),
          false,
        );
        await p.locator("#draft-count").scrollIntoViewIfNeeded();
        await p.screenshot({
          path: path.join(out, `${row.width}-${row.name}.png`),
        });
        row.passed = true;
      } catch (e) {
        row.passed = false;
        row.error = e.message;
        await p
          .screenshot({
            path: path.join(out, `${row.width}-${row.name}-failure.png`),
          })
          .catch(() => {});
      } finally {
        row.elapsed_ms = Math.round(performance.now() - started);
        await context.close();
        await save();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    JSON.stringify({
      total: rows.length,
      passed: rows.filter((r) => r.passed).length,
    }),
  );
  if (rows.some((r) => !r.passed)) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
