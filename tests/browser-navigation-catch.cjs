// Run the unmodified fixed plan with unexpected navigation failures, once each.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {reporter,errorCode}=require('./helpers/review-report.cjs');
const out=path.resolve(process.env.BROWSER_ARTIFACTS||'browser-artifacts','navigation-catch');
const rows=['healthy','recovery'].map(name=>({name,status:'not_run',passed:null}));
const save=reporter(out,rows,{classification:'SYNTHETIC_RUNNER_NAVIGATION_FAILURE',model_calls:0,source_documents:1});
let suiteError=null;
(async()=>{
 await fs.mkdir(out,{recursive:true});await save();
 for(const row of rows){
  const started=performance.now(),dir=path.join(out,row.name);row.status='running';await save();
  try{
   await fs.mkdir(dir,{recursive:true});
   const env={...process.env,BROWSER_ARTIFACTS:dir,NAVIGATION_RUNNER_FAULT:row.name};
   // This negative test must use its own bounded local server and 12-row plan.
   delete env.BASE_URL;
   const child=spawn(process.execPath,['--require',path.join(__dirname,'helpers/navigation-runner-fault.cjs'),path.join(__dirname,'browser-navigation-report.cjs')],{
    cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe'],
   });
   let stdout='',stderr='',timedOut=false,killTimer;
   child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
   const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);},120000);
   let code,signal;
   try{[code,signal]=await once(child,'close');}finally{clearTimeout(timer);clearTimeout(killTimer);}
   row.child_exit=code;row.signal=signal;
   await fs.writeFile(path.join(dir,'child.stdout.log'),stdout);await fs.writeFile(path.join(dir,'child.stderr.log'),stderr);
   assert.equal(timedOut,false);assert.equal(code,1);assert.equal(signal,null);
   const raw=await fs.readFile(path.join(dir,'navigation-report/result.json'),'utf8'),report=JSON.parse(raw);
   row.child_total=report.total;row.child_passed=report.passed;
   assert.equal(report.finished,true);assert.equal(report.suite_error,null);
   assert.equal(report.total,12);assert.equal(report.attempted,12);assert.equal(report.not_run,0);
   assert.equal(report.failed,1);assert.equal(report.passed,11);
   const plan=['root','pages'].flatMap(surface=>[1440,390].flatMap(width=>['503','abort','healthy'].map(name=>[surface,width,name])));
   assert.deepEqual(report.rows.map(r=>[r.surface,r.width,r.name]),plan);
   const failure=report.rows.find(r=>r.status==='failed'),phase=row.name==='healthy'?'initial-navigation':'explicit-recovery';
   assert.deepEqual([failure.surface,failure.width,failure.name],['root',1440,row.name==='healthy'?'healthy':'503']);
   assert.equal(failure.phase,phase);assert.equal(failure.error_code,'HARNESS_ERROR');
   const injected=JSON.parse(await fs.readFile(path.join(dir,'injection.json'),'utf8'));
   const context=row.name==='healthy'?3:1,page=row.name==='healthy'?1:2;
   assert.equal(injected.events.filter(e=>e.event==='injected_connectionclosed').length,1);
   assert.ok(injected.events.some(e=>e.context===context&&e.page===page&&e.event==='requestfailed'&&e.code==='net::ERR_CONNECTION_CLOSED'));
   const resources=failure.diagnostics?.resources||[];
   row.current_failure_captured=resources.some(e=>e.resource==='main_document'&&e.event==='request_failed'&&e.code==='net::ERR_CONNECTION_CLOSED'&&e.phase===phase);
   assert.equal(row.current_failure_captured,true);
   assert.ok(resources.length<=16);
   if(row.name==='recovery'){
    assert.ok(failure.initial_diagnostics.resources.some(e=>e.resource==='main_document'&&e.status===503&&e.phase==='initial-navigation'));
    assert.deepEqual(failure.closed_diagnostics.resources,failure.initial_diagnostics.resources);
    assert.equal(failure.closed_diagnostics.unavailable,true);
    assert.ok(!resources.some(e=>e.phase==='initial-navigation'));
   }
   for(const r of report.rows.filter(r=>r.passed)){
    assert.equal(r.business_recovery,true);assert.equal(r.source_export,true);assert.equal(r.model_requests,0);
   }
   for(const text of [raw,stdout,stderr,JSON.stringify(injected)]){
    assert.ok(!text.includes('PRIVATE_DIAGNOSTIC_CANARY')&&!text.includes('http://')&&!text.includes('/Users/'));
   }
   row.passed=true;row.status='passed';
  }catch(e){row.passed=false;row.status='failed';row.error_code=errorCode(e);process.exitCode=1;}
  finally{row.seconds=(performance.now()-started)/1000;await save();console.log(JSON.stringify(row));}
 }
})().catch(e=>{suiteError=errorCode(e);process.exitCode=1;}).finally(async()=>{await save(true,suiteError);});
