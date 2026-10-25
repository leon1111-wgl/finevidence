// Synthetic stopped-store recovery through Chrome; no real identities or models.
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const TOKEN = 'synthetic-recovered-browser-token-123456789';
const rows = ['record', 'revoke'].flatMap(action => [1440, 390].map(width => ({ action, width, passed: null })));
const out = path.join(process.env.BROWSER_ARTIFACTS || 'browser-artifacts', 'review-recovery');
const save = () => fs.writeFile(path.join(out, 'result.json'), JSON.stringify({
  classification: 'SYNTHETIC_CRASH_RECOVERY_UI', total: 4,
  passed: rows.filter(r => r.passed === true).length,
  not_run: rows.filter(r => r.passed === null).length, model_calls: 0, rows,
}, null, 2));
let browser, tmp;
(async () => {
  await fs.mkdir(out, { recursive: true }); await save();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-review-recovery-'));
  const setup = spawnSync(process.env.PYTHON || 'python3', ['-c', `import sys,json
from pathlib import Path
sys.path.insert(0,'tests')
from review_crash_fixture import interrupted_store,OPERATOR
from finevidence.review_recovery import recover_review_store
r=Path(sys.argv[1]);p=r/'outputs';p.mkdir(mode=0o700);rows=[]
for action in ['record','revoke']:
 source=r/action;expected,*_=interrupted_store(source,action)
 result=recover_review_store(source,OPERATOR,p,stopped=True)
 rows.append(dict(action=action,directory=result['directory'],expected=expected))
print(json.dumps(rows))`, tmp], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.equal(setup.status, 0, 'Synthetic recovery fixture failed');
  const cases = JSON.parse(setup.stdout);
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  for (const row of rows) {
    const fixture = cases.find(c => c.action === row.action);
    let server, context;
    try {
      const code = `import os,signal
from finevidence.server import make_server
s=make_server(port=0,review_directory=os.environ['TEST_DIR'],reviewer='Synthetic crash operator',review_token=os.environ['TEST_TOKEN'])
def stop(*_):raise KeyboardInterrupt()
signal.signal(signal.SIGTERM,stop)
print(s.server_address[1],flush=True)
try:s.serve_forever()
except KeyboardInterrupt:pass
finally:s.server_close();s.workspace.close()`;
      server = spawn(process.env.PYTHON || 'python3', ['-u', '-c', code], {
        cwd: ROOT, env: { ...process.env, TEST_DIR: fixture.directory, TEST_TOKEN: TOKEN },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('server startup timeout')), 10000);
        server.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
        server.once('exit', () => { clearTimeout(timer); reject(Error('server startup failed')); });
        server.once('error', error => { clearTimeout(timer); reject(error); });
      });
      context = await browser.newContext({ viewport: { width: row.width, height: 1000 }, acceptDownloads: true });
      const p = await context.newPage(), errors = [];
      p.on('pageerror', error => errors.push(error.message));
      await p.goto(`http://127.0.0.1:${port}/`);
      await p.waitForFunction(() => document.querySelector('#run')?.disabled === false);
      await p.locator('#review-ledger > summary').click();
      await p.fill('#ledger-token', TOKEN);
      await p.focus('#ledger-connect'); await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.querySelector('#ledger-status').textContent.includes('Synthetic crash operator'));
      assert.equal(await p.locator('#ledger-records li').count(), 2);
      const reports = [];
      for (let i = 0; i < 2; i++) {
        const download = p.waitForEvent('download');
        await p.locator('#ledger-records button[data-export]').nth(i).click();
        reports.push(JSON.parse(await fs.readFile(await (await download).path(), 'utf8')));
      }
      assert.deepEqual(reports, fixture.expected.records);
      assert.deepEqual(reports.map(r => r.state).sort(), ['recorded', 'revoked']);
      assert(reports.every(r => r.financial_calculation_eligible === false));
      assert(!await p.evaluate(t => Object.values(localStorage).some(s => s.includes(t)), TOKEN));
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await p.locator('#review-ledger').screenshot({ path: path.join(out, `${row.action}-${row.width}.png`) });
      row.passed = true; row.exports = 2;
    } catch (error) {
      row.passed = false; row.error = error.message; process.exitCode = 1;
    } finally {
      await context?.close();
      if (server && server.exitCode === null && server.signalCode === null) {
        await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
      }
      await save();
    }
  }
})().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; })
  .finally(async () => {
    await browser?.close();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
    await save(); console.log(JSON.stringify({ passed: rows.filter(r => r.passed).length, total: 4 }));
  });
