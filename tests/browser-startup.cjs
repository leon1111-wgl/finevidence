// FE-023: real browser startup and recovery; synthetic transport faults only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:8765/';
  const out = path.join(process.env.BROWSER_ARTIFACTS || 'browser-artifacts', 'startup');
  await fs.mkdir(out, { recursive: true });
  const scenarios = ['healthy', 'dependency-abort', 'entry-404', 'syntax-error', 'late-dependency', 'bootstrap-missing', 'javascript-disabled', 'bundle-retry'];
  const rows = [1440, 390].flatMap(width => scenarios.map(name => ({ width, name, passed: null })));
  const save = () => fs.writeFile(path.join(out, 'result.json'), JSON.stringify({
    classification: 'SYNTHETIC_STARTUP_FAULT_REGRESSION', base, paid_calls: 0,
    total: rows.length, passed: rows.filter(r => r.passed === true).length,
    failed: rows.filter(r => r.passed === false).length, not_run: rows.filter(r => r.passed === null).length, rows,
  }, null, 2));
  await save();
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})});
  const ready = p => p.waitForFunction(() => !document.getElementById('run').disabled, null, {timeout: 12000});
  const open = p => p.goto(base, { waitUntil: 'commit', timeout: 20000 });
  const key = 'finevidence.review.v1';
  const note = 'SYNTHETIC startup recovery note';
  try {
    for (const row of rows) {
      const started = performance.now();
      const context = await browser.newContext({viewport: {width: row.width, height: 1000}, javaScriptEnabled: row.name !== 'javascript-disabled', acceptDownloads: true});
      const p = await context.newPage(); p.setDefaultTimeout(3000);
      const calls = []; let release = () => {}; let navigationCount = 0;
      p.on('request', req => { if (req.isNavigationRequest() && req.frame() === p.mainFrame()) navigationCount++; });
      await p.route('**/api/run', route => {
        const data = route.request().postDataJSON(); calls.push(data.operation);
        // Never allow a model call even if a regression triggers one.
        return data.operation === 'agent' ? route.abort() : route.continue();
      });
      try {
        let original;
        if (!['bootstrap-missing', 'javascript-disabled'].includes(row.name)) {
          await open(p); await ready(p);
          await p.click('#run'); await p.waitForSelector('.value');
          assert.equal(await p.locator('.value').textContent(), '30.00%');
          await p.fill('#notes', note);
          await p.locator('.evidence-row').first().click();
          await p.getByRole('checkbox', {name: '已核对这条原文'}).check();
          original = await p.evaluate(key => localStorage.getItem(key), key);
          assert.ok(original); calls.length = 0; navigationCount = 0;
        }
        let injected = 0; let lateCompleted;
        if (row.name === 'dependency-abort') await p.route('**/pdf-preview-panel.mjs', route => {injected++; return route.abort('connectionfailed');});
        if (row.name === 'entry-404') await p.route('**/workbench.mjs', route => {injected++; return route.fulfill({status: 404, body: 'SYNTHETIC missing entry'});});
        if (row.name === 'syntax-error') await p.route('**/workbench.mjs', route => {injected++; return route.fulfill({contentType: 'text/javascript', body: 'export function {'});});
        if (row.name === 'late-dependency') {
          const gate = new Promise(resolve => {release = resolve;});
          lateCompleted = new Promise(resolve => {
            p.route('**/pdf-preview-panel.mjs', async route => {
              injected++; const response = await route.fetch(); await gate;
              await route.fulfill({response}); resolve();
            });
          });
        }
        if (row.name === 'bootstrap-missing') await p.route('**/bootstrap.mjs', route => {injected++; return route.abort();});
        if (row.name === 'bundle-retry') await p.route('**/bundle.json', route => {injected++; return route.abort();});
        await open(p);
        if (row.name === 'healthy') {
          await ready(p);
        } else if (row.name === 'bundle-retry') {
          await p.waitForFunction(() => document.querySelector('#status').getAttribute('role') === 'alert');
          assert.equal(await p.locator('#retry').isVisible(), true);
          await p.unroute('**/bundle.json'); await p.focus('#retry'); await p.keyboard.press('Enter'); await ready(p);
          assert.equal(navigationCount, 1, 'data-only retry must not reload the document');
        } else {
          if (['bootstrap-missing', 'javascript-disabled'].includes(row.name)) {
            await p.locator('#startup-reload').waitFor({state: 'visible'});
            // Static fallback must work without bootstrap code or any JS.
            assert.equal(await p.locator('#workbench').getAttribute('inert'), '');
          } else {
            await p.waitForFunction(() => document.querySelector('#startup-status')?.getAttribute('role') === 'alert', null, { timeout: 10000 });
            assert.match(await p.locator('#startup-status').textContent(), row.name === 'late-dependency' ? /STARTUP_TIMEOUT/ : /STARTUP_LOAD_FAILED/);
            assert.equal(await p.locator('#workbench').getAttribute('inert'), '');
            assert.equal(await p.locator('#run').isDisabled(), true);
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), original);
            assert.deepEqual(calls, [], 'failed startup must never dispatch a financial/model request');
            assert.equal(injected, 1, 'no automatic module retries');
          }
          await p.locator('#startup-reload').focus();
          assert.equal(await p.locator('#startup-reload').evaluate(n => n === document.activeElement), true);
          assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await p.screenshot({path: path.join(out, `${row.width}-${row.name}-failure.png`)});
          if (row.name === 'late-dependency') {
            release(); await lateCompleted;
            await p.evaluate(() => import(new URL('./workbench.mjs', document.querySelector('script[type=module]').src).href).then(() => null)); // Wait for actual late evaluation.
            assert.equal(await p.locator('#workbench').getAttribute('inert'), '');
            assert.match(await p.locator('#startup-status').textContent(), /STARTUP_TIMEOUT/);
            assert.equal(await p.locator('#run').isDisabled(), true);
            assert.deepEqual(calls, []);
          }
          await p.unroute('**/pdf-preview-panel.mjs'); await p.unroute('**/workbench.mjs'); await p.unroute('**/bootstrap.mjs');
          const before = navigationCount;
          await Promise.all([p.waitForNavigation({waitUntil: 'load'}), p.keyboard.press('Enter')]);
          assert.equal(navigationCount, before + 1, 'keyboard recovery must navigate once');
          if (row.name === 'javascript-disabled') {
            await p.locator('#startup-reload').waitFor();
            assert.match(await p.locator('noscript').textContent(), /JavaScript/);
            row.passed = true; continue;
          }
          await ready(p);
        }
        if (original) {
          await p.waitForFunction(() => document.querySelector('#notes').value === 'SYNTHETIC startup recovery note');
          assert.equal(await p.locator('.value').textContent(), '30.00%');
          assert.equal(await p.evaluate(key => localStorage.getItem(key), key), original);
          const download = p.waitForEvent('download'); await p.click('#export');
          const file = await (await download).path(); const data = JSON.parse(await fs.readFile(file, 'utf8'));
          assert.equal(data.review.notes, note); assert.equal(data.review.checked_citation_ids.length, 1);
          assert.equal(data.result.calculations[0].display, '30.00%');
          // A second start call must not reinitialize, restore, or bind duplicate listeners.
          const count = calls.length;
          await p.evaluate(async () => { const app = await import(new URL('./workbench.mjs', document.querySelector('script[type=module]').src).href); if (app.startWorkbench) app.startWorkbench(); });
          await p.waitForTimeout(150);
          assert.equal(calls.length, count);
          assert.ok(calls.length <= 1, 'only one deterministic restore is permitted');
        }
        assert.equal(calls.includes('agent'), false);
        assert.equal(await p.locator('#startup-reload').isVisible(), false);
        row.passed = true;
      } catch (e) { row.passed = false; row.error = e.message.slice(0, 900); }
      finally {
        release(); row.elapsed_ms = Math.round(performance.now() - started); row.operations = calls;
        await p.screenshot({path: path.join(out, `${row.width}-${row.name}.png`), fullPage: true}).catch(() => {});
        await context.close(); await save(); console.log(JSON.stringify(row));
      }
    }
  } finally { await browser.close(); }
  if (rows.some(r => r.passed !== true)) process.exitCode = 1;
})().catch(e => {console.error(e); process.exitCode = 1;});
