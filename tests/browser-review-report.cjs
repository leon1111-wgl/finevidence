// Execute the actual 14-case runner. Faults alter HTTP responses, not assertions.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const names = ['lifecycle-restart-revoke','lost-response-retry','auth-and-keyboard','source-change','revoke-lost-response','loading-disconnect','disabled-surface'];
(async () => {
  const out = path.resolve(process.env.BROWSER_ARTIFACTS || 'browser-artifacts', 'review-report');
  await fs.mkdir(out, {recursive:true});
  const rows = [];
  for (const scenario of ['initial-ready','revoke-confirm']) {
    const started = performance.now();
    const dir = path.join(out, scenario);
    await fs.mkdir(dir, {recursive:true});
    const child = spawn(process.execPath, ['--require',path.join(__dirname,'helpers/review-report-fault.cjs'),path.join(__dirname,'browser-review-ledger.cjs')], {
      cwd:path.resolve(__dirname,'..'), env:{...process.env,BROWSER_ARTIFACTS:dir,REVIEW_REPORT_FAULT:scenario},stdio:['ignore','pipe','pipe'],
    });
    let stdout='',stderr='',checkpoint=false,timedOut=false;
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    const reportPath = path.join(dir,'review-ledger/result.json');
    const poll=setInterval(async()=>{try {const d=JSON.parse(await fs.readFile(reportPath,'utf8'));if(d.finished===false && d.total===14 && d.passed===7 && d.rows[7].status==='running')checkpoint=true;}catch{}},100);
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},120000);
    const [code,signal]=await once(child,'close');clearTimeout(timer);clearInterval(poll);
    await fs.writeFile(path.join(dir,'child.stdout.log'),stdout);await fs.writeFile(path.join(dir,'child.stderr.log'),stderr);
    const row={scenario,passed:false,child_exit:code,signal,checkpoint,seconds:(performance.now()-started)/1000};
    try {
      assert.equal(timedOut,false);assert.equal(code,1);
      const raw=await fs.readFile(reportPath,'utf8'),report=JSON.parse(raw);
      assert.equal(report.finished,true,'runner must finalize its checkpoint');
      assert.equal(report.total,14);assert.equal(report.attempted,14);
      assert.equal(report.passed,13);assert.equal(report.failed,1);assert.equal(report.not_run,0);
      assert.deepEqual(report.rows.map(r=>[r.width,r.name]),[1440,390].flatMap(w=>names.map(n=>[w,n])));
      assert.ok(report.rows.slice(0,7).every(r=>r.status==='passed'));
      const failure=report.rows[7];
      assert.equal(failure.status,'failed');assert.equal(failure.phase,scenario);
      assert.equal(failure.error_code,'TIMEOUT');assert.equal('error' in failure,false);
      assert.equal(failure.diagnostics.readiness.run_disabled,scenario==='initial-ready');
      assert.ok(failure.diagnostics.resources.length<=16);
      assert.ok(failure.diagnostics.resources.some(r=>r.resource===(scenario==='initial-ready'?'runtime.json':'api/reviews/revoke')&&r.status===503));
      assert.equal(failure.screenshot.policy,'layout_only');
      assert.equal(failure.screenshot.saved,true);
      const png=await fs.readFile(path.join(dir,'review-ledger',failure.screenshot.file));
      assert.equal(png.subarray(1,4).toString(),'PNG');
      assert.ok(!raw.includes('PRIVATE_REVIEW_REPORT_CANARY')&&!stdout.includes('PRIVATE_REVIEW_REPORT_CANARY')&&!stderr.includes('PRIVATE_REVIEW_REPORT_CANARY'));
      assert.ok(!raw.includes('synthetic-browser-review-secret')&&!raw.includes('not executable')&&!raw.includes('http://')&&!raw.includes('/Users/'));
      assert.equal(checkpoint,true,'retain prior passes before a failure finishes');
      row.passed=true;
    }catch(e){row.error=e.message;}
    rows.push(row);console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_TEST_RUNNER_RECOVERY',model_calls:0,total:2,passed:rows.filter(r=>r.passed).length,rows},null,2));
  }
  assert.equal(rows.filter(r=>r.passed).length,2);
})().catch(e=>{console.error(e);process.exitCode=1;});
