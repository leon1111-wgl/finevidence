// Known FE-022 names; one synthetic PDF repeated at two viewports. No human quality score.
const {chromium}=require('playwright'); const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const os=require('node:os');
const repo=path.join(__dirname,'..'),out=path.join(process.env.BROWSER_ARTIFACTS||'browser-artifacts','review-filename');
let root;
const save=()=>fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_DEVELOPMENT',source_documents:1,model_calls:0,total:rows.length,passed:rows.filter(r=>r.passed===true).length,failed:rows.filter(r=>r.passed===false).length,not_run:rows.filter(r=>r.passed===null).length,rows},null,2));
const token='synthetic-audit-secret-never-a-real-credential';
const rows=[1440,390].flatMap(width=>[['ordinary','audit.pdf'],['LF','audit\nreport.pdf'],['TAB','audit\treport.pdf'],['backslash','audit\\report.pdf'],['invalid-note','audit.pdf']].map(([name,file])=>({width,name,file,passed:null})));
(async()=>{await fs.mkdir(out,{recursive:true});root=await fs.mkdtemp(path.join(os.tmpdir(),'fe-filename-'));await save();
const code=`import os,signal\nfrom finevidence.server import make_server\ns=make_server(port=0,review_directory=os.environ['TEST_STORE'],reviewer='Independent synthetic reviewer',review_token=os.environ['TEST_TOKEN'])\nprint(s.server_address[1],flush=True)\nsignal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))\ntry:s.serve_forever()\nexcept KeyboardInterrupt:pass\nfinally:s.server_close();s.workspace.close()`;
const child=spawn('python3',['-u','-c',code],{cwd:repo,env:{...process.env,TEST_STORE:path.join(root,'private-browser'),TEST_TOKEN:token},stdio:['ignore','pipe','pipe']});let serr='';child.stderr.on('data',d=>serr+=d);
const port=await new Promise((resolve,reject)=>{child.stdout.once('data',d=>resolve(Number(String(d).trim())));child.once('exit',()=>reject(Error('server failed')))});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {for(const r of rows){const start=performance.now();const c=await browser.newContext({viewport:{width:r.width,height:1000},acceptDownloads:true});const p=await c.newPage();p.setDefaultTimeout(6000);const requests=[],errors=[];r.phase='startup';p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(`http://127.0.0.1:${port}/`);await p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
 r.phase='workflow';await p.locator('#review-ledger > summary').click();await p.fill('#ledger-token',token);await p.click('#ledger-connect');await p.waitForFunction(()=>document.querySelector('#ledger-status').textContent.includes('Independent synthetic reviewer'));
 const before=await p.locator('#ledger-records li').count();
 await p.setInputFiles('#pdf-file',{name:r.file,mimeType:'application/pdf',buffer:await fs.readFile(path.join(repo,'tests/fixtures/pdf/text.pdf'))});
 await p.waitForFunction(()=>document.querySelector('#pdf-result').hidden===false);await p.locator('#fact-draft > summary').click();
 for(const[k,v]of Object.entries({company:'Synthetic audit',title:'Audit report',period:'2024',raw_value:'120',basis:'IFRS',scope:'consolidated'}))await p.fill('#draft-'+k,v);
 await p.selectOption('#draft-currency','USD');await p.selectOption('#draft-scale','1000000');await p.click('#draft-use-page');await p.click('#draft-add');
 const dl=p.waitForEvent('download');await p.click('#draft-download');const downloaded=JSON.parse(await fs.readFile(await(await dl).path(),'utf8'));assert.equal(downloaded.drafts[0].provenance.file_name,r.file);await fs.writeFile(path.join(out,`${r.width}-${r.name}-draft.json`),JSON.stringify(downloaded,null,2));
 await p.getByRole('button',{name:'登记草稿 1 审核意见',exact:true}).click();await p.fill('#ledger-note',r.name==='invalid-note'?'Note\u000Bcontrol':'Independent synthetic observation');
 p.on('request',req=>{if(req.method()==='POST')requests.push(req.postDataJSON())});
 const resp=p.waitForResponse(res=>res.request().method()==='POST'&&res.url().endsWith('/api/reviews'));await p.focus('#ledger-submit');await p.keyboard.press('Enter');const response=await resp;r.http=response.status();r.response=await response.json();
 await p.waitForFunction(()=>document.querySelector('#review-ledger').getAttribute('aria-busy')==='false');
 r.status=await p.locator('#ledger-status').textContent();r.note_disabled=await p.locator('#ledger-note').isDisabled();r.retry_visible=await p.locator('#ledger-retry').isVisible();r.records_delta=(await p.locator('#ledger-records li').count())-before;
 if(r.http===422 && r.retry_visible){const response2=p.waitForResponse(res=>res.request().method()==='POST'&&res.url().endsWith('/api/reviews'));await p.click('#ledger-retry');r.retry_http=(await response2).status();await p.waitForFunction(()=>document.querySelector('#review-ledger').getAttribute('aria-busy')==='false');r.same_request=JSON.stringify(requests[0])===JSON.stringify(requests[1]);}
 r.no_horizontal_overflow=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 r.secret_persisted=await p.evaluate(t=>Object.values(localStorage).some(v=>v.includes(t)),token);r.page_errors=errors;
 await p.locator('#review-ledger').screenshot({path:path.join(out,`${r.width}-${r.name}.png`)});
 // Expected: browser-produced draft can be recorded, or definite invalid note stays editable.
 r.passed=r.name==='invalid-note'?(r.http===422&&!r.note_disabled):(r.http===200&&r.records_delta===1);
 assert.equal(r.passed,true);
 assert.equal(r.no_horizontal_overflow,true);assert.equal(r.secret_persisted,false);assert.deepEqual(errors,[]);
 if(r.http===200){
  const exportEvent=p.waitForEvent('download');await p.locator('#ledger-records button[data-export]').first().click();
  const receipt=JSON.parse(await fs.readFile(await(await exportEvent).path(),'utf8'));
  assert.deepEqual(receipt.draft,downloaded.drafts[0]);assert.equal(receipt.financial_calculation_eligible,false);
  await fs.writeFile(path.join(out,`${r.width}-${r.name}-receipt.json`),JSON.stringify(receipt,null,2));
 }
 r.phase='complete';
}catch(e){r.passed=false;r.error=e.stack;await p.screenshot({path:path.join(out,`${r.width}-${r.name}-failure.png`)}).catch(()=>{});}
finally{r.seconds=(performance.now()-start)/1000;await c.close();await save();console.log(r.width,r.name,r.http,r.passed,r.error||'');}
}}finally{await browser.close();await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});await fs.rm(root,{recursive:true,force:true});await fs.writeFile(path.join(out,'server.log'),serr);}
if(rows.some(r=>r.passed!==true))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
