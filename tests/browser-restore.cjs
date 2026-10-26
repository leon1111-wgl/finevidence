// FE-015: real Python HTTP replay, with browser route aborts for network faults.
// This suite requires the loopback workbench; it never requests a model.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const {errorCode,observe,screenshot,reporter}=require('./helpers/review-report.cjs');
const base = process.env.BASE_URL || "http://127.0.0.1:8765/";
const out = path.join(process.env.BROWSER_ARTIFACTS || "browser-artifacts", "restore");
const storageKey = "finevidence.review.v1";
const note = "Synthetic review: both annual revenue amounts and units checked.";
const ready = (p) => p.waitForFunction(() => !document.getElementById("run").disabled);
const stored = (p) => p.evaluate((key) => localStorage.getItem(key), storageKey);
const cases = [
    { name: "normal-restore", failures: 0 },
    { name: "single-failure-retry", failures: 1 },
    { name: "repeated-failure-retry", failures: 2, narrow: true },
    { name: "edited-scope-revokes-restore", failures: 1, edit: true },
    { name: "retry-filters-stale-citation", failures: 1, staleID: true },
    { name: "failure-then-reload", failures: 1, reload: true },
  ];
const rows=cases.map(spec=>({name:spec.name,width:spec.narrow?390:1440,status:'not_run',phase:'not_started',passed:null}));
const metadata={classification:'REAL_PYTHON_HTTP_WITH_OFFLINE_NETWORK_FAULTS',source_documents:4,paid_calls:0,suite_phase:'browser-launch'};
const save=reporter(out,rows,metadata);
let browser,suiteError=null;
(async()=>{
  await fs.mkdir(out,{recursive:true});await save();
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  metadata.suite_phase='cases';
  for (const [index,spec] of cases.entries()) {
    const row=rows[index],start=performance.now();
    let context,p,capture;
    const phase=async value=>{row.phase=value;await save();};
    const pageErrors=[],operations=[],replayRequests=[];
    row.status='running';await phase('context-create');
    try {
      context=await browser.newContext({viewport:{width:row.width,height:1000},acceptDownloads:true});
      await phase('page-create');p=await context.newPage();
      capture=observe(p,new URL(base).origin,()=>row.phase);
      p.on('pageerror',()=>pageErrors.push('PAGE_ERROR'));
      p.on('request',r=>{if(new URL(r.url()).pathname==='/api/run')operations.push(r.postDataJSON().operation);});
      await phase('initial-navigation');await p.goto(base);
      await phase('initial-ready');await ready(p);
        assert.match(await p.locator("#runtime").textContent(), /Python/, "start the Python loopback workbench");
        await p.selectOption("#operation", "revenue-growth");
        await phase("calculation-ready");await p.click("#run"); await ready(p);
        assert.equal(await p.locator(".value").textContent(), "20.00%");
        await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
        await p.locator(".evidence-row").filter({ hasText: "2023" }).click();
        await p.getByRole("checkbox", { name: "已核对这条原文" }).check();
        await p.fill("#notes", note);
        await phase("review-saved");
        const original = JSON.parse(await stored(p));
        assert.equal(original.reviewed.length, 2);
        assert.match(await p.locator("#source-content").textContent(), /aurora_2023.json/);
        if (spec.staleID) {
          await p.evaluate((key) => {
            const draft = JSON.parse(localStorage.getItem(key));
            draft.reviewed.push("not-in-current-result");
            localStorage.setItem(key, JSON.stringify(draft));
          }, storageKey);
        }
        const before = await stored(p);
        let faultsLeft = spec.failures;
        await p.route("**/api/run", async (route) => {
          replayRequests.push(route.request().postDataJSON());
          if (faultsLeft > 0) { faultsLeft--; return route.abort(); }
          return route.continue(); // The real server recomputes from source-checked facts.
        });
        await phase("replay-navigation");await p.reload();
        await phase("replay-ready");await ready(p);
        for (let failed = 0; failed < spec.failures; failed++) {
          await phase("replay-failure-check");await p.locator("#retry").waitFor({ state: "visible" });
          assert.equal(await stored(p), before, "failed replay must not replace the saved review");
          assert.equal(await p.locator("#export").isDisabled(), true);
          assert.equal(await p.locator(".value").count(), 0);
          assert.equal(replayRequests.length, failed + 1, "no automatic retries");
          if (failed === spec.failures - 1) {
            await p.screenshot({ path: path.join(out, `${spec.name}-failure.png`), fullPage: true });
          }
          if (spec.edit || spec.reload) break;
          await phase("retry-ready");await p.focus("#retry"); await p.keyboard.press("Enter"); await ready(p);
        }
        if (spec.edit) {
          await phase("edited-scope");await p.selectOption("#company", "Harbor Lantern");
          assert.equal(await p.locator("#retry").isVisible(), false);
          const busy = await p.locator("#retry").evaluate((button) => {
            button.click(); return document.getElementById("query-form").getAttribute("aria-busy");
          });
          assert.equal(busy, "false", "editing must revoke the pending restore callback");
          assert.equal(await stored(p), before);
          await phase("edited-calculation-ready");await p.click("#run"); await ready(p);
          assert.equal(await p.locator(".value").textContent(), "-20.00%");
          assert.equal(await p.inputValue("#notes"), "");
          assert.deepEqual(JSON.parse(await stored(p)).reviewed, []);
          assert.equal(JSON.parse(await stored(p)).request.company, "Harbor Lantern");
          assert.equal(replayRequests.length, 2);
        } else {
          if (spec.reload) { await phase("recovery-reload-navigation");await p.reload();await phase("recovery-reload-ready");await ready(p); }
          assert.equal(await p.locator(".value").textContent(), "20.00%");
          assert.equal(await p.inputValue("#notes"), note, "successful retry must retain review notes");
          assert.match(await p.locator("#review-count").textContent(), /2 \/ 2/);
          assert.match(await p.locator("#source-content").textContent(), /aurora_2023.json/);
          const after = JSON.parse(await stored(p));
          assert.deepEqual(after.reviewed.sort(), [...original.reviewed].sort());
          assert.equal(after.selected, original.selected);
          assert.equal(replayRequests.length, spec.failures + 1);
          for (const request of replayRequests) assert.deepEqual(request, original.request);
          await phase("export");const event = p.waitForEvent("download"); await p.click("#export");
          const download = await event;
          const record = JSON.parse(await fs.readFile(await download.path(), "utf8"));
          assert.equal(record.review.notes, note);
          assert.deepEqual(record.review.checked_citation_ids.sort(), [...original.reviewed].sort());
          assert.equal(record.sources.length, 2);
          assert.equal(record.result.calculations[0].display, "20.00%");
          await fs.writeFile(path.join(out, `${spec.name}-export.json`), JSON.stringify(record, null, 2));
          await phase("verification-navigation");await p.reload();
          await phase("verification-ready");await ready(p);
          assert.equal(await p.inputValue("#notes"), note, "a later refresh must retain the review too");
          assert.match(await p.locator("#review-count").textContent(), /2 \/ 2/);
        }
        await phase("final-assertions");assert.ok(operations.every((op) => op === "revenue-growth"), "replay never calls a model");
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(pageErrors, []);
        await phase('success-screenshot');
        await p.screenshot({path:path.join(out,`${spec.name}.png`),fullPage:true});
        Object.assign(row,{passed:true,status:'passed',phase:'complete'});
    } catch(e) {
      Object.assign(row,{passed:false,status:'failed',error_code:errorCode(e)});
      if(capture)row.diagnostics=await capture();
      if(p)row.screenshot=await screenshot(p,out,row);
      await save();
    } finally {
      row.replay_requests=replayRequests.length;
      row.model_requests=operations.filter(op=>op==='agent').length;
      row.seconds=(performance.now()-start)/1000;
      try{await context?.close();}catch(e){row.cleanup_error=errorCode(e);if(row.passed)Object.assign(row,{passed:false,status:'failed',phase:'cleanup'});}
      await save();
    }
  }
  if(rows.some(row=>!row.passed))process.exitCode=1;
})().catch(e=>{suiteError=errorCode(e);process.exitCode=1;process.stderr.write(suiteError+'\n');}).finally(async()=>{
  try{await browser?.close();}catch(e){suiteError=errorCode(e);metadata.suite_phase='browser-close';process.exitCode=1;}
  try{await save(true,suiteError);}catch{process.exitCode=1;process.stderr.write('REPORT_WRITE_FAILED\n');}
  console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,total:rows.length}));
});
