// One fixed synthetic recovery plan; never retry a failed row for a better score.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ready } = require('./helpers/browser-waits.cjs');
const { reporter, observe, errorCode } = require('./helpers/review-report.cjs');
const base = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const out = path.join(process.env.BROWSER_ARTIFACTS || 'browser-artifacts', 'startup-focus');
const rows = [1440, 390].flatMap(width => ['healthy', 'entry-failure', 'dependency-timeout'].map(name => ({
  name, width, status: 'not_run', phase: 'not_started', passed: null,
})));
const save = reporter(out, rows, { classification: 'SYNTHETIC_STARTUP_FOCUS_DEVELOPMENT', source_documents: 1 });
const key = 'finevidence.review.v1', note = 'SYNTHETIC preserved review after anchored startup';
let browser, suiteError = null;
(async () => {
  await fs.mkdir(out, { recursive: true }); await save();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const row of rows) {
    const start = performance.now(); let context, p, diagnostics, release = () => {};
    const phase = async value => { row.phase = value; await save(); };
    row.status = 'running'; await phase('context');
    try {
      context = await browser.newContext({ viewport: { width: row.width, height: 900 }, acceptDownloads: true });
      p = await context.newPage(); p.setDefaultTimeout(10000);
      diagnostics = observe(p, base, () => row.phase);
      const operations = [];
      await p.route('**/api/run', route => {
        const op = route.request().postDataJSON().operation; operations.push(op);
        return op === 'agent' ? route.abort() : route.continue();
      });
      await phase('saved-review'); await p.goto(base); await ready(p);
      await p.click('#run'); await p.waitForSelector('.value');
      await p.getByRole('checkbox', { name: '已核对这条原文' }).check();
      await p.fill('#notes', note);
      const original = await p.evaluate(k => localStorage.getItem(k), key);
      operations.length = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const pattern = row.name === 'dependency-timeout' ? '**/pdf-preview-panel.mjs' : '**/workbench.mjs';
      let requested = 0;
      await p.route(pattern, async route => {
        requested++; row.injected_requests = requested; await gate;
        try {
          if (row.name === 'entry-failure') await route.fulfill({ status: 503, body: 'SYNTHETIC fault' });
          else await route.continue();
        } catch { /* The failed document can be destroyed by explicit recovery. */ }
      });
      await phase('anchored-navigation');
      await p.goto(base + '?_fe_focus_case=' + row.name + '#source-heading', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => scrollY > 200);
      row.initial_scroll_y = await p.evaluate(() => scrollY);
      if (row.name === 'healthy') {
        // A focused navigation link is a no-steal control, not a keyboard-path claim.
        await p.locator('nav a').first().evaluate(n => n.focus({ preventScroll: true }));
        release(); await ready(p);
        assert.equal(await p.locator('nav a').first().evaluate(n => n === document.activeElement), true);
        assert.equal(await p.evaluate(() => location.hash), '#source-heading');
        assert.ok(await p.evaluate(() => scrollY > 200));
        row.normal_position_preserved = true;
      } else {
        if (row.name === 'entry-failure') release();
        await phase('failed-startup');
        await p.waitForFunction(() => document.querySelector('#startup-status').getAttribute('role') === 'alert');
        assert.match(await p.locator('#startup-status').textContent(), row.name === 'dependency-timeout' ? /STARTUP_TIMEOUT/ : /STARTUP_LOAD_FAILED/);
        row.visibility = await p.evaluate(() => Object.fromEntries(['startup-status', 'startup-reload'].map(id => {
          const n = document.getElementById(id), r = n.getBoundingClientRect();
          return [id, { top: r.top, bottom: r.bottom, in_view: r.top >= 0 && r.bottom <= innerHeight }];
        })));
        row.error_focused = await p.locator('#startup-status').evaluate(n => n === document.activeElement);
        await p.screenshot({ path: path.join(out, `${row.width}-${row.name}-error.png`) });
        assert.ok(Object.values(row.visibility).every(v => v.in_view), 'error and recovery link must be in the viewport');
        assert.equal(row.error_focused, true, 'focus must announce the error before the recovery action');
        assert.equal(await p.locator('#workbench').getAttribute('inert'), '');
        assert.equal(await p.evaluate(k => localStorage.getItem(k), key), original);
        assert.deepEqual(operations, []);
        assert.equal(requested, 1);
        await p.keyboard.press('Tab');
        assert.equal(await p.locator('#startup-reload').evaluate(n => n === document.activeElement), true);
        row.tabs_to_recovery = 1;
        await p.screenshot({ path: path.join(out, `${row.width}-${row.name}-recovery-focus.png`) });
        await p.unroute(pattern); release();
        await phase('keyboard-recovery');
        await Promise.all([p.waitForNavigation(), p.keyboard.press('Enter')]); await ready(p);
      }
      await phase('restored-export');
      await p.waitForFunction(n => document.getElementById('notes').value === n, note);
      assert.equal(await p.locator('.value').textContent(), '30.00%');
      assert.equal(await p.evaluate(k => localStorage.getItem(k), key), original);
      assert.ok(operations.length <= 1 && !operations.includes('agent'));
      const event = p.waitForEvent('download'); await p.click('#export');
      const record = JSON.parse(await fs.readFile(await (await event).path(), 'utf8'));
      assert.equal(record.review.notes, note);
      assert.equal(record.review.checked_citation_ids.length, 1);
      assert.equal(record.sources.length, 1);
      assert.equal(record.result.calculations[0].display, '30.00%');
      await fs.writeFile(path.join(out, `${row.width}-${row.name}-export.json`), JSON.stringify(record, null, 2));
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      row.export_preserved = true; row.model_requests = operations.filter(op => op === 'agent').length;
      await p.screenshot({ path: path.join(out, `${row.width}-${row.name}-restored.png`), fullPage: true });
      Object.assign(row, { status: 'passed', passed: true, phase: 'complete' });
    } catch (e) {
      Object.assign(row, { status: 'failed', passed: false, error_code: errorCode(e) });
      if (diagnostics) row.diagnostics = await diagnostics();
    } finally {
      release();
      try { await context?.close(); } catch (e) { row.cleanup_error = errorCode(e); row.passed = false; row.status = 'failed'; }
      row.seconds = (performance.now() - start) / 1000; await save();
    }
  }
  if (rows.some(row => !row.passed)) process.exitCode = 1;
})().catch(e => { suiteError = errorCode(e); process.exitCode = 1; }).finally(async () => {
  try { await browser?.close(); } catch (e) { suiteError = errorCode(e); process.exitCode = 1; }
  await save(true, suiteError);
  console.log(JSON.stringify({ passed: rows.filter(row => row.passed).length, total: rows.length, suite_error: suiteError }));
});
