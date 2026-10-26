// Known reporting defects: run the actual six-case Python/Chrome restoration suite.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const names = ['normal-restore','single-failure-retry','repeated-failure-retry','edited-scope-revokes-restore','retry-filters-stale-citation','failure-then-reload'];
(async () => {
  const out = path.resolve(process.env.BROWSER_ARTIFACTS || 'browser-artifacts','restore-report');
  await fs.mkdir(out,{recursive:true});
  const rows=[];
  for(const scenario of ['launch','context','initial-ready','replay-ready','verification-ready','kill']) {
    const started=performance.now(), dir=path.join(out,scenario);
    await fs.mkdir(dir,{recursive:true});
    const child=spawn(process.execPath,['--require',path.join(__dirname,'helpers/restore-report-fault.cjs'),path.join(__dirname,'browser-restore.cjs')],{cwd:path.resolve(__dirname,'..'),env:{...process.env,BROWSER_ARTIFACTS:dir,RESTORE_REPORT_FAULT:scenario},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',checkpoint=false,killed=false,timedOut=false;
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    const file=path.join(dir,'restore/result.json');
    const poll=setInterval(async()=>{try {
      const r=JSON.parse(await fs.readFile(file,'utf8'));
      if(r.finished===false && r.total===6 && r.passed===2 && r.rows[2].phase==='replay-ready' && r.rows[2].status==='running') {
        checkpoint=true;
        if(scenario==='kill'&&!killed){killed=true;child.kill('SIGKILL');}
      }
    }catch{}},50);
    // Old runners have no checkpoint. This watchdog records a failed contract,
    // never interprets the timeout as the intended injected failure.
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},scenario==='kill'?15000:120000);
    const [code,signal]=await once(child,'close');clearTimeout(timer);clearInterval(poll);
    await fs.writeFile(path.join(dir,'child.stdout.log'),stdout);await fs.writeFile(path.join(dir,'child.stderr.log'),stderr);
    const row={scenario,passed:false,child_exit:code,signal,checkpoint,seconds:(performance.now()-started)/1000};
    try {
      assert.equal(timedOut,false,'bounded child completed or was killed after a real checkpoint');
      assert.equal(code,scenario==='kill'?null:1);
      const raw=await fs.readFile(file,'utf8'),r=JSON.parse(raw);
      assert.equal(r.schema_version,2);assert.equal(r.total,6);assert.deepEqual(r.rows.map(x=>x.name),names);
      assert.equal(r.model_calls,0);assert.equal(r.classification,'REAL_PYTHON_HTTP_WITH_OFFLINE_NETWORK_FAULTS');
      assert.equal(r.finished,scenario!=='kill');
      if(scenario==='launch') {
        assert.equal(r.suite_error,'HARNESS_ERROR');assert.equal(r.suite_phase,'browser-launch');
        assert.equal(r.passed,0);assert.equal(r.attempted,0);assert.equal(r.not_run,6);
      } else {
        assert.equal(r.rows[0].passed,true);assert.equal(r.rows[1].passed,true);
        const failed=r.rows[2];assert.equal(failed.width,390);
        assert.equal(failed.phase,scenario==='context'?'context-create':scenario==='kill'?'replay-ready':scenario);
        if(scenario==='kill') {
          assert.equal(checkpoint,true);assert.equal(signal,'SIGKILL');assert.equal(r.passed,2);assert.equal(r.not_run,3);assert.equal(failed.status,'running');assert.equal(failed.passed,null);
        } else {
          assert.equal(r.attempted,6);assert.equal(r.passed,5);assert.equal(r.failed,1);assert.equal(r.not_run,0);
          assert.equal(failed.status,'failed');assert.equal(failed.error_code,scenario==='context'?'HARNESS_ERROR':'TIMEOUT');
          assert.equal('error' in failed,false);
          if(scenario!=='context') {
            assert.equal(failed.diagnostics.readiness.run_disabled,true);
            assert.equal(failed.diagnostics.readiness.startup_reload_visible,true);
            assert.equal(failed.diagnostics.readiness.data_retry_visible,false);
            assert.ok(failed.diagnostics.resources.some(x=>x.resource==='review-ledger-panel.mjs'&&x.status===503&&[scenario,scenario.replace('-ready','-navigation')].includes(x.phase)));
            assert.ok(failed.diagnostics.resources.length<=16);
            assert.equal(failed.screenshot.policy,'layout_only');assert.equal(failed.screenshot.saved,true);
            const png=await fs.readFile(path.join(dir,'restore',failed.screenshot.file));assert.equal(png.subarray(1,4).toString(),'PNG');
            if(scenario==='replay-ready')assert.equal(checkpoint,true);
          }
        }
      }
      assert.ok(!raw.includes('PRIVATE_RESTORE_CANARY')&&!stdout.includes('PRIVATE_RESTORE_CANARY')&&!stderr.includes('PRIVATE_RESTORE_CANARY'));
      assert.ok(!raw.includes('http://')&&!raw.includes('/Users/')&&!raw.includes('Synthetic review:'));
      row.passed=true;
    }catch(e){row.error=e.message;}
    rows.push(row);console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_RESTORE_REPORT_CONTRACT',model_calls:0,total:6,passed:rows.filter(r=>r.passed).length,rows},null,2));
  }
  assert.equal(rows.filter(r=>r.passed).length,6);
})().catch(e=>{console.error(e);process.exitCode=1;});
