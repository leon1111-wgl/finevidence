// Authored synthetic correction tasks and fault controls; no financial quality claim.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const TOKEN='synthetic-correction-secret-'+ 'x'.repeat(32);
const names=['record-correction','revoke-correction','malformed-refusal','unknown-refusal','wrong-status','lost-then-refused','committed-refresh-refusal','source-change-refusal','disconnect-refusal'];
const rows=[1440,390].flatMap(width=>names.map(name=>({width,name,passed:null})));
const out=path.join(process.env.BROWSER_ARTIFACTS||'browser-artifacts','review-correction');
let browser;
const save=()=>fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_DEVELOPMENT',source_documents:1,model_calls:0,total:rows.length,passed:rows.filter(r=>r.passed===true).length,failed:rows.filter(r=>r.passed===false).length,not_run:rows.filter(r=>r.passed===null).length,correction_tasks:{passed:rows.filter(r=>r.name.endsWith('-correction')&&r.passed).length,total:4},rows},null,2));
async function server(dir){
 const child=spawn(process.env.PYTHON||'python3',['-u','-c',`import os,signal\nfrom finevidence.server import make_server\ns=make_server(port=0,review_directory=os.environ['TEST_STORE'],reviewer='Synthetic reviewer',review_token=os.environ['TEST_TOKEN'])\ndef stop(*_): raise KeyboardInterrupt()\nsignal.signal(signal.SIGTERM,stop)\nprint(s.server_address[1],flush=True)\ntry:s.serve_forever()\nexcept KeyboardInterrupt:pass\nfinally:s.server_close();s.workspace.close()`],{env:{...process.env,TEST_STORE:dir,TEST_TOKEN:TOKEN},stdio:['ignore','pipe','pipe']});
 child.stderr.resume();
 const port=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(Error('server-start-failed')));child.stdout.once('data',d=>resolve(Number(String(d).trim())));});
 return {url:`http://127.0.0.1:${port}/`,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');})};
}
(async()=>{
 await fs.mkdir(out,{recursive:true});await save();
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const row of rows){
  let ctx,srv,tmp,p;const start=performance.now();
  try{
   tmp=await fs.mkdtemp(path.join(os.tmpdir(),'fe-correction-test-'));srv=await server(path.join(tmp,'private'));
   ctx=await browser.newContext({viewport:{width:row.width,height:1000},acceptDownloads:true});p=await ctx.newPage();p.setDefaultTimeout(6000);
   const errors=[],writes=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/reviews'))writes.push(r.postDataJSON());});
   await p.goto(srv.url);await p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
   await p.locator('#review-ledger > summary').click();await p.fill('#ledger-token',TOKEN);await p.click('#ledger-connect');
   await p.waitForFunction(()=>document.querySelector('#ledger-status').textContent.includes('Synthetic reviewer'));
   await p.setInputFiles('#pdf-file',path.join(__dirname,'fixtures/pdf/text.pdf'));await p.waitForFunction(()=>document.querySelector('#pdf-result').hidden===false);
   await p.locator('#fact-draft > summary').click();
   for(const[k,v]of Object.entries({company:'SYNTHETIC Example',title:'Synthetic report',period:'2024',raw_value:'120',basis:'IFRS',scope:'consolidated'}))await p.fill('#draft-'+k,v);
   await p.selectOption('#draft-currency','USD');await p.selectOption('#draft-scale','1000000');await p.click('#draft-use-page');await p.click('#draft-add');
   await p.getByRole('button',{name:'登记草稿 1 审核意见',exact:true}).click();await p.fill('#ledger-note','Valid synthetic observation');
   const idle=()=>p.waitForFunction(()=>document.querySelector('#review-ledger').getAttribute('aria-busy')==='false');
   const enter=async id=>{await p.focus(id);await p.keyboard.press('Enter');await idle();};
   const state=async()=>{const response=await ctx.request.get(srv.url+'api/reviews',{headers:{Authorization:'Bearer '+TOKEN}});assert.equal(response.status(),200);return (await response.json()).records;};
   const download=async()=>{const event=p.waitForEvent('download');await p.locator('#ledger-records button[data-export]').first().click();return JSON.parse(await fs.readFile(await(await event).path(),'utf8'));};
   let field='#ledger-note',submit='#ledger-submit';
   if(row.name==='revoke-correction'){
    await enter(submit);assert.equal((await state()).length,1);await p.locator('#ledger-records button[data-revoke]').click();field='#ledger-reason';submit='#ledger-confirm-revoke';
   }
   if(row.name.endsWith('-correction')){
    const before=await state(),invalid='Note\u000Bcontrol';await p.fill(field,invalid);
    const response=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/reviews'));
    await enter(submit);assert.equal((await response).status(),422);
    assert.deepEqual(await state(),before);assert.equal(await p.inputValue(field),invalid);
    await p.locator('#review-ledger').screenshot({path:path.join(out,`${row.width}-${row.name}-rejected.png`)});
    assert.equal(await p.locator(field).isEnabled(),true);assert.equal(await p.locator('#ledger-retry').isVisible(),false);
    assert.equal(await p.locator(field).evaluate(n=>n===document.activeElement),true);
    assert.doesNotMatch(await p.locator('#ledger-status').textContent(),/结果待确认/);
    await p.fill(field,'Corrected synthetic observation');await enter(submit);
    const receipt=await download();assert.equal((await state()).length,1);assert.equal(receipt.financial_calculation_eligible,false);
    assert.equal(row.name==='record-correction'?receipt.note:receipt.revocation.reason,'Corrected synthetic observation');
    assert.notEqual(writes.at(-1).request_id,writes.at(-2).request_id);row.request_ids_distinct=true;
   }else if(['source-change-refusal','disconnect-refusal'].includes(row.name)){
    await p.fill(field,'Note\u000Bcontrol');let release,arrived;const gate=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
    await p.route('**/api/reviews',async route=>{if(route.request().method()==='POST'){const response=await route.fetch();arrived();await gate;await route.fulfill({response}).catch(()=>{});}else await route.continue();});
    await p.click(submit);await seen;
    if(row.name==='source-change-refusal')await p.click('#pdf-clear');else await p.click('#ledger-disconnect');
    release();await p.unrouteAll({behavior:'wait'});await idle();
    assert.equal(await p.locator('#ledger-submit').isDisabled(),true);assert.equal((await state()).length,0);
    if(row.name==='source-change-refusal'){assert.equal(await p.locator(field).isEnabled(),true);assert.equal(await p.inputValue(field),'Note\u000Bcontrol');}
    else {assert.match(await p.locator('#ledger-status').textContent(),/已断开/);assert.equal(await p.inputValue(field),'');}
   }else{
    let phase=0;
    await p.route('**/api/reviews',async route=>{
     const post=route.request().method()==='POST';
     if(row.name==='committed-refresh-refusal'){
      if(post){phase++;await route.continue();}else if(phase===1)await route.fulfill({status:422,json:{status:'REVIEW_INVALID'}});else await route.continue();
     }else if(!post)await route.continue();
     else if(row.name==='lost-then-refused'&&phase++===0){await route.fetch();await route.abort('failed');}
     else if(row.name==='malformed-refusal')await route.fulfill({status:422,contentType:'application/json',body:'{'});
     else await route.fulfill({status:row.name==='wrong-status'?503:422,json:{status:row.name==='unknown-refusal'?'UNRECOGNIZED_FAILURE':'REVIEW_INVALID'}});
    });
    await enter(submit);
    if(row.name==='lost-then-refused')await enter('#ledger-retry');
    assert.equal(await p.locator(field).isDisabled(),true);assert.equal(await p.locator('#ledger-retry').isVisible(),true);
    const committed=['lost-then-refused','committed-refresh-refusal'].includes(row.name);assert.equal((await state()).length,committed?1:0);
    await p.unrouteAll({behavior:'wait'});await enter('#ledger-retry');
    assert.equal((await state()).length,1);assert.equal((await download()).note,'Valid synthetic observation');
    assert.equal(new Set(writes.map(w=>w.request_id)).size,1);assert.ok(writes.every(w=>JSON.stringify(w)===JSON.stringify(writes[0])));row.same_request_preserved=true;
   }
   assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await p.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic-correction-secret'))),false);
   await p.locator('#review-ledger').screenshot({path:path.join(out,`${row.width}-${row.name}.png`)});row.passed=true;
  }catch(e){row.passed=false;row.error=e.message;if(p)await p.screenshot({path:path.join(out,`${row.width}-${row.name}-failure.png`),fullPage:true}).catch(()=>{});}
  finally{row.seconds=(performance.now()-start)/1000;if(ctx)await ctx.close();if(srv)await srv.stop();if(tmp)await fs.rm(tmp,{recursive:true,force:true});await save();}
 }
 if(rows.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{process.exitCode=1;process.stderr.write(e.message+'\n');}).finally(async()=>{if(browser)await browser.close();await save();console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,total:rows.length}));});
