// Fixed main-document failure plan. Local fixtures, no model, no retry-until-pass.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events');
const {observe,reporter,errorCode,screenshot}=require('./helpers/review-report.cjs');
const out=path.resolve(process.env.BROWSER_ARTIFACTS||'browser-artifacts','navigation-report');
const surfaces=process.env.BASE_URL?['configured']:['root','pages'];
const rows=surfaces.flatMap(surface=>[1440,390].flatMap(width=>['503','abort','healthy'].map(name=>({
 surface,width,name,status:'not_run',phase:'not_started',passed:null,
}))));
const save=reporter(out,rows,{classification:'SYNTHETIC_NAVIGATION_DIAGNOSTICS',source_documents:1,model_calls:0});
let browser,server,suiteError=null;
(async()=>{
 await fs.mkdir(out,{recursive:true});await save();
 let origin;
 if(!process.env.BASE_URL){
  const web=path.resolve(__dirname,'../web');
  server=http.createServer(async(req,res)=>{
   try{
    let name=new URL(req.url,'http://localhost').pathname;
    if(name.startsWith('/finevidence/'))name=name.slice('/finevidence'.length);
    const file=path.resolve(web,name==='/'?'index.html':name.slice(1));
    if(!file.startsWith(web+path.sep))throw Error();
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});res.end(body);
   }catch{res.writeHead(404);res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 for(const row of rows){
  let context,capture;const start=performance.now();row.status='running';
  const phase=async value=>{row.phase=value;await save();};
  try{
   const base=process.env.BASE_URL||(origin+(row.surface==='pages'?'/finevidence/':'/'));
   context=await browser.newContext({viewport:{width:row.width,height:900},acceptDownloads:true});
   let p=await context.newPage();p.setDefaultTimeout(12000);
   capture=observe(p,base,()=>row.phase);let hits=0,modelRequests=0;
   context.on('request',q=>{if(new URL(q.url()).pathname.endsWith('/api/run')&&q.postDataJSON()?.operation==='agent')modelRequests++;});
   await phase('initial-navigation');
   if(row.name!=='healthy')await p.route('**/*',route=>{
    const q=route.request();
    if(q.isNavigationRequest()&&q.frame()===p.mainFrame()&&new URL(q.url()).pathname===new URL(base).pathname){
     hits++;return row.name==='503'?route.fulfill({status:503,contentType:'text/html',body:'SYNTHETIC navigation fault'}):route.abort('connectionclosed');
    }
    return route.continue();
   });
   try{await p.goto(base+'?PRIVATE_DIAGNOSTIC_CANARY');}
   catch(e){if(row.name!=='abort')throw e;row.expected_navigation_rejection=true;}
   row.diagnostics=await capture();
   // Preserve the planned fault separately if an unexpected recovery fails.
   row.initial_diagnostics=row.diagnostics;
   if(row.name!=='healthy'){
    assert.equal(hits,1);
    if(row.name==='abort')assert.equal(row.expected_navigation_rejection,true);
    row.resource_captured=row.diagnostics.resources.some(e=>e.resource==='main_document'&&e.phase==='initial-navigation'&&
     (row.name==='503'?e.event==='http_error'&&e.status===503:e.event==='request_failed'&&e.code==='net::ERR_CONNECTION_CLOSED'));
    row.failure_layout=await screenshot(p,out,{width:row.width,name:row.surface+'-'+row.name});
    await p.close();row.closed_diagnostics=await capture();
    assert.equal(row.closed_diagnostics.unavailable,true);
    assert.deepEqual(row.closed_diagnostics.resources,row.diagnostics.resources);
    // Explicit new navigation is a recovery control, not a hidden model retry.
    await phase('explicit-recovery');p=await context.newPage();p.setDefaultTimeout(12000);
    capture=observe(p,base,()=>row.phase);await p.goto(base);
   }else row.resource_captured=row.diagnostics.resources.length===0;
   await p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
   await phase('source-and-export');await p.focus('#run');await p.keyboard.press('Enter');
   await p.locator('.value').waitFor();assert.equal(await p.locator('.value').textContent(),'30.00%');
   await p.getByRole('checkbox',{name:'已核对这条原文',exact:true}).check();
   const pending=p.waitForEvent('download');await p.click('#export');
   const bytes=await fs.readFile(await (await pending).path()),record=JSON.parse(bytes);
   assert.equal(record.classification,'SYNTHETIC');assert.equal(record.result.calculations[0].display,'30.00%');
   assert.equal(record.sources.length,1);assert.equal(record.sources[0].doc_id,'syn_aurora_2024');
   assert.equal(record.review.checked_citation_ids.length,1);
   row.business_recovery=true;row.source_export=true;row.model_requests=modelRequests;assert.equal(modelRequests,0);
   await fs.writeFile(path.join(out,row.surface+'-'+row.width+'-'+row.name+'-review.json'),bytes);
   await p.screenshot({path:path.join(out,row.surface+'-'+row.width+'-'+row.name+'-recovered.png'),fullPage:true});
   assert.ok(!JSON.stringify(row.diagnostics).includes('PRIVATE_DIAGNOSTIC_CANARY'));
   assert.ok(!JSON.stringify(row.diagnostics).includes(new URL(base).host));
   assert.equal(row.resource_captured,true,'the main-document failure must remain in the redacted report');
   row.passed=true;row.status='passed';await phase('complete');
  }catch(e){
   row.passed=false;row.status='failed';row.error_code=errorCode(e);process.exitCode=1;
   // Snapshot the current page before cleanup, even when goto never completed.
   if(capture)row.diagnostics=await capture();
  }
  finally{
   try{await context?.close();}catch(e){row.cleanup_error=errorCode(e);row.passed=false;row.status='failed';process.exitCode=1;}
   row.seconds=(performance.now()-start)/1000;await save();
  }
 }
})().catch(e=>{suiteError=errorCode(e);process.exitCode=1;}).finally(async()=>{
 try{await browser?.close();}catch(e){suiteError=errorCode(e);process.exitCode=1;}
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await save(true,suiteError);console.log(JSON.stringify({total:rows.length,passed:rows.filter(r=>r.passed).length,suite_error:suiteError}));
});

