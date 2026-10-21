// Actual Chromium workflow checks. Start the local server or pass BASE_URL.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
let browser;
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
  const out = process.env.BROWSER_ARTIFACTS || "browser-artifacts";
  await fs.mkdir(out, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const wait = () =>
    p.waitForFunction(() => !document.getElementById("run").disabled);
  const run = async () => {
    await p.getByRole("button", { name: "运行核查", exact: true }).click();
    await p.waitForFunction(() => !document.getElementById("run").disabled);
  };
  await p.goto(base);
  await wait();
  await p.screenshot({
    path: path.join(out, "desktop-empty.png"),
    fullPage: true,
  });
  await p.selectOption("#operation", "revenue-growth");
  await p.focus("#run");
  await p.keyboard.press("Enter");
  await p.waitForSelector(".value");
  assert.equal(await p.locator(".value").textContent(), "20.00%");
  await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
  await p.locator(".evidence-row").filter({ hasText: "2023" }).click();
  await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
  await p.fill("#notes", "已核对 2023/2024 收入单位，合成样本。");
  const downloaded = p.waitForEvent("download");
  await p.click("#export");
  const download = await downloaded;
  const file = await download.path();
  const record = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(record.result.calculations[0].display, "20.00%");
  assert.equal(record.review.checked_citation_ids.length, 2);
  assert.equal(record.sources.length, 2);
  assert.equal(record.classification, "SYNTHETIC");
  await p.screenshot({
    path: path.join(out, "desktop-reviewed.png"),
    fullPage: true,
  });
  await p.reload();
  await wait();
  await p.waitForSelector(".value");
  assert.equal(
    await p.inputValue("#notes"),
    "已核对 2023/2024 收入单位，合成样本。",
  );
  assert.match(await p.locator("#review-count").textContent(), /2 \/ 2/);
  await p.selectOption("#company", "Harbor Lantern");
  assert.equal(await p.locator("#export").isDisabled(), true);
  assert.equal(await p.locator(".value").count(), 0);
  await run();
  assert.equal(await p.locator(".value").textContent(), "-20.00%");
  await p.selectOption("#year", "2023");
  await run();
  assert.match(await p.locator("#status").textContent(), /FACTS_NOT_FOUND/);
  assert.equal(await p.locator("#export").isDisabled(), true);
  await p.screenshot({
    path: path.join(out, "desktop-error.png"),
    fullPage: true,
  });
  await p.selectOption("#operation", "gross-margin");
  await run();
  assert.equal(await p.locator(".value").textContent(), "30.00%");
  await p.selectOption("#operation", "search");
  await p.fill("#query", "zzzzmissing");
  await run();
  assert.match(await p.locator("#result-content").textContent(), /没有找到/);
  await p.screenshot({
    path: path.join(out, "desktop-no-match.png"),
    fullPage: true,
  });
  await p.fill("#query", "收入");
  await run();
  assert.match(await p.locator("#status").textContent(), /INVALID_QUERY/);
  await p.fill("#query", "revenue");
  await run();
  assert.ok((await p.locator(".evidence-row").count()) > 0);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const m = await mobile.newPage();
  await m.goto(base);
  await m.waitForFunction(() => !document.getElementById("run").disabled);
  await m.click("#run");
  await m.waitForSelector(".value");
  assert.equal(await m.locator(".value").textContent(), "30.00%");
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await m.screenshot({
    path: path.join(out, "narrow-result.png"),
    fullPage: true,
  });
  const fault = await browser.newContext();
  const f = await fault.newPage();
  let release;
  const gate = new Promise((r) => (release = r));
  await f.route("**/bundle.json", async (route) => {
    await gate;
    await route.abort();
  });
  await f.goto(base);
  await f.getByText("正在校验资料…", { exact: true }).waitFor();
  await f.screenshot({ path: path.join(out, "loading.png"), fullPage: true });
  release();
  await f.locator("#retry").waitFor({ state: "visible" });
  assert.equal(await f.locator("#run").isDisabled(), true);
  await f.unroute("**/bundle.json");
  await f.click("#retry");
  await f.waitForFunction(() => !document.getElementById("run").disabled);
  await f.click("#run");
  await f.waitForSelector(".value");
  assert.equal(await f.locator(".value").textContent(), "30.00%");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, "result.json"),
    JSON.stringify(
      {
        base,
        passed: true,
        checks: [
          "initial",
          "keyboard-submit",
          "calculation",
          "both-source-checks",
          "export",
          "draft-replay",
          "scope-invalidation",
          "missing-year",
          "recover",
          "no-match",
          "invalid-query",
          "narrow-no-overflow",
          "loading",
          "network-retry",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log("Browser: 14 workflow checks passed at " + base);
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
