// Synthetic local operators. HTTP/Chrome behavior, not human financial correctness.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {errorCode,observe,screenshot,reporter}=require('./helpers/review-report.cjs');
const TOKEN='synthetic-browser-review-secret-'+ 'x'.repeat(32);
const names=['lifecycle-restart-revoke','lost-response-retry','auth-and-keyboard','source-change','revoke-lost-response','loading-disconnect','disabled-surface'];
const rows=[1440,390].flatMap(width=>names.map(name=>({width,name,passed:null,status:'not_run',phase:'not_started'})));
const out=path.join(process.env.BROWSER_ARTIFACTS||'browser-artifacts','review-ledger');
let browser,suiteError=null;
const save=reporter(out,rows);
async function server(dir,port=0,enabled=true){
 const code=`import os,signal\nfrom finevidence.server import make_server\ns=make_server(port=int(os.environ['TEST_PORT']),**({'review_directory':os.environ['TEST_STORE'],'reviewer':'Synthetic reviewer','review_token':os.environ['TEST_TOKEN']} if os.environ['TEST_ENABLED']=='1' else {}))\ndef stop(*_): raise KeyboardInterrupt()\nsignal.signal(signal.SIGTERM,stop)\nprint(s.server_address[1],flush=True)\ntry:s.serve_forever()\nexcept KeyboardInterrupt:pass\nfinally:s.server_close();s.workspace.close()`;
 const child=spawn(process.env.PYTHON||'python3',['-u','-c',code],{env:{...process.env,TEST_PORT:String(port),TEST_STORE:dir,TEST_TOKEN:TOKEN,TEST_ENABLED:enabled?'1':'0'},stdio:['ignore','pipe','pipe']});
 child.stderr.resume();
 const actual=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(Error('server-start-failed')));child.stdout.once('data',d=>resolve(Number(String(d).trim())));});
 return {port:actual,url:`http://127.0.0.1:${actual}/`,stop:()=>new Promise(resolve=>{if(child.exitCode!==null || child.signalCode!==null)return resolve();child.once('exit',()=>resolve());child.kill('SIGTERM');})};
}
(async()=>{
 await fs.mkdir(out,{recursive:true});await save();
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const row of rows){
  let ctx,srv,tmp,p,capture;const start=performance.now();
  const phase=async value=>{row.phase=value;await save();};
  row.status='running';await phase('server-start');
  try{
   tmp=await fs.mkdtemp(path.join(os.tmpdir(),'fe-ledger-test-'));
   srv=await server(path.join(tmp,'private'),0,row.name!=='disabled-surface');
   ctx=await browser.newContext({viewport:{width:row.width,height:1000},acceptDownloads:true});
   p=await ctx.newPage();p.setDefaultTimeout(6000);capture=observe(p,new URL(srv.url).origin);
   const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));
   p.on('request',r=>{if(r.method()==='POST')writes.push({url:new URL(r.url()).pathname,body:r.postDataJSON()});});
   const ready=async()=>p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
   await phase('initial-ready');await p.goto(srv.url);await ready();
   await phase('ledger-availability');
   await p.locator('#review-ledger > summary').click();
   if(row.name==='disabled-surface'){
     assert.equal(await p.locator('#ledger-connect').isVisible(),false);
     assert.match(await p.locator('#ledger-availability').textContent(),/本地服务/);
     assert.equal(writes.length,0);
   }else{
    const connect=async(token=TOKEN)=>{await phase('connect');await p.fill('#ledger-token',token);await p.click('#ledger-connect');};
    const connected=async()=>p.waitForFunction(()=>document.querySelector('#ledger-status').textContent.includes('Synthetic reviewer'));
    const fillDraft=async()=>{
      await phase('prepare-draft');
      await p.setInputFiles('#pdf-file',path.join(__dirname,'fixtures/pdf/text.pdf'));
      await p.waitForFunction(()=>document.querySelector('#pdf-result').hidden===false);
      await p.locator('#fact-draft > summary').click();
      for(const[k,v]of Object.entries({company:'SYNTHETIC Example',title:'Synthetic report',period:'2024',raw_value:'120',basis:'IFRS',scope:'consolidated'}))await p.fill('#draft-'+k,v);
      await p.selectOption('#draft-currency','USD');await p.selectOption('#draft-scale','1000000');
      await p.click('#draft-use-page');await p.click('#draft-add');
      await p.getByRole('button',{name:'登记草稿 1 审核意见',exact:true}).click();
      await p.fill('#ledger-note','<script>not executable</script> Check the period');
    };
    const download=async()=>{await phase('export');const event=p.waitForEvent('download');await p.locator('#ledger-records button[data-export]').first().click();return JSON.parse(await fs.readFile(await(await event).path(),'utf8'));};
    if(row.name==='auth-and-keyboard'){
      await connect('wrong-secret');await p.waitForFunction(()=>document.querySelector('#ledger-status').getAttribute('role')==='alert');
      assert.equal(await p.locator('#ledger-records li').count(),0);
      await phase('keyboard-connect');await p.fill('#ledger-token',TOKEN);await p.focus('#ledger-connect');await p.keyboard.press('Enter');await connected();
      await fillDraft();await phase('keyboard-save');await p.focus('#ledger-submit');await p.keyboard.press('Enter');
      await p.waitForSelector('#ledger-records li');
      await phase('disconnect');await p.click('#ledger-disconnect');assert.equal(await p.locator('#ledger-records li').count(),0);
      assert.equal(await p.inputValue('#ledger-token'),'');
    }else if(row.name==='loading-disconnect'){
      let release,arrived;
      const gate=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
      await p.route('**/api/reviews',async route=>{arrived();await gate;await route.continue().catch(()=>{});});
      await connect();await phase('loading-disconnect');await seen;
      assert.equal(await p.locator('#review-ledger').getAttribute('aria-busy'),'true');
      await p.locator('#review-ledger').screenshot({path:path.join(out,`${row.width}-loading.png`)});
      await p.click('#ledger-disconnect');release();
      await p.unroute('**/api/reviews');
      assert.equal(await p.locator('#ledger-records li').count(),0);
      assert.match(await p.locator('#ledger-status').textContent(),/已断开/);
      await connect();await connected();
    }else{
      await connect();await connected();assert.equal(await p.locator('#ledger-records li').count(),0);
      await fillDraft();
      if(row.name==='source-change'){
        await phase('source-change');await p.click('#pdf-clear');assert.equal(await p.locator('#ledger-submit').isDisabled(),true);
        assert.equal(writes.length,0);
      }else{
        if(row.name==='lost-response-retry'){
          await p.route('**/api/reviews',async route=>{if(route.request().method()==='POST'){await route.fetch();await route.abort('failed');}else await route.continue();});
        }
        await phase('review-save');await p.click('#ledger-submit');
        if(row.name==='lost-response-retry'){
          await phase('save-retry');await p.waitForFunction(()=>document.querySelector('#ledger-retry').hidden===false);
          await p.screenshot({path:path.join(out,`${row.width}-error-retry.png`),fullPage:true});
          await p.unroute('**/api/reviews');await p.click('#ledger-retry');
        }
        await p.waitForSelector('#ledger-records li');assert.equal(await p.locator('#ledger-records li').count(),1);
        const receipt=await download();assert.equal(receipt.financial_calculation_eligible,false);
        assert.equal(receipt.draft.review_status,'pending_human_review');assert.equal(receipt.reviewer,'Synthetic reviewer');
        assert.equal(receipt.draft.raw_value,'120');assert.equal(receipt.draft.normalized_value,'120000000');
        assert.equal(receipt.note,'<script>not executable</script> Check the period');
        if(row.name==='lost-response-retry'){
          assert.equal(writes.length,2);assert.equal(writes[0].body.request_id,writes[1].body.request_id);
        }else{
          await phase('server-restart');const port=srv.port;await srv.stop();srv=await server(path.join(tmp,'private'),port);
          await phase('reload-ready');await p.reload();await ready();await p.locator('#review-ledger > summary').click();
          assert.equal(await p.inputValue('#ledger-token'),'');assert.equal(await p.locator('#ledger-records li').count(),0);
          await connect();await connected();assert.equal((await download()).record_id,receipt.record_id);
          await phase('revoke-prepare');await p.locator('#ledger-records button[data-revoke]').first().click();
          await p.fill('#ledger-reason','Synthetic test: wrong period');
          if(row.name==='revoke-lost-response') await p.route('**/api/reviews/revoke',async route=>{await route.fetch();await route.abort('failed');});
          await phase('revoke-confirm');await p.focus('#ledger-confirm-revoke');await p.keyboard.press('Enter');
          if(row.name==='revoke-lost-response'){
            await phase('revoke-retry');await p.waitForFunction(()=>document.querySelector('#ledger-retry').hidden===false);
            await p.unroute('**/api/reviews/revoke');await p.click('#ledger-retry');
          }
          await p.waitForFunction(()=>document.querySelector('#ledger-records').textContent.includes('已撤回'));
          const revoked=await download();assert.equal(revoked.state,'revoked');assert.deepEqual(revoked.draft,receipt.draft);
          assert.equal(revoked.note,receipt.note);assert.equal(revoked.revocation.reason,'Synthetic test: wrong period');
          assert.equal(await p.locator('#ledger-records button[data-revoke]').count(),0);
        }
        assert.equal(await p.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic-browser-review-secret'))),false);
      }
    }
   }
   await phase('final-assertions');assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await p.screenshot({path:path.join(out,`${row.width}-${row.name}.png`),fullPage:true});
   await p.locator('#review-ledger').screenshot({path:path.join(out,`${row.width}-${row.name}-panel.png`)});
   row.passed=true;row.status='passed';row.phase='complete';
  }catch(e){
    row.passed=false;row.status='failed';row.error_code=errorCode(e);
    if(capture)row.diagnostics=await capture();
    if(p)row.screenshot=await screenshot(p,out,row);
    await save();
  }finally{
    row.seconds=(performance.now()-start)/1000;
    for(const cleanup of [()=>ctx?.close(),()=>srv?.stop(),()=>tmp&&fs.rm(tmp,{recursive:true,force:true})]){
      try{await cleanup();}catch(e){row.cleanup_error=errorCode(e);if(row.passed){row.phase='cleanup';row.passed=false;row.status='failed';}}
    }
    await save();
  }
 }
 if(rows.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{suiteError=errorCode(e);process.exitCode=1;process.stderr.write(suiteError+'\n');}).finally(async()=>{
 try{if(browser)await browser.close();}catch(e){suiteError=errorCode(e);process.exitCode=1;}
 try{await save(true,suiteError);}catch{process.exitCode=1;process.stderr.write('REPORT_WRITE_FAILED\n');}
 console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,total:rows.length}));
});
