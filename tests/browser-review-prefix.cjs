// FE-028: same real module faults at root and a Pages-like deployment directory.
// Known synthetic cases, no retry of failing rows, no model or user PDF.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events');
const {observe,reporter,errorCode}=require('./helpers/review-report.cjs');
const out=path.resolve(process.env.BROWSER_ARTIFACTS||'browser-artifacts','review-prefix');
const surfaces=process.env.BASE_URL?['configured']:['root','pages'];
const rows=surfaces.flatMap(surface=>[1440,390].flatMap(width=>['503','abort','healthy'].map(name=>({
 surface,width,name,status:'not_run',phase:'not_started',passed:null,
}))));
const save=reporter(out,rows,{classification:'SYNTHETIC_DEPLOYMENT_DIAGNOSTICS',source_documents:1,model_calls:0});
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
  let context;const start=performance.now();
  row.status='running';const phase=async x=>{row.phase=x;await save();};
  try{
   const base=process.env.BASE_URL||(origin+(row.surface==='pages'?'/finevidence/':'/'));
   await phase('initial-navigation');
   context=await browser.newContext({viewport:{width:row.width,height:900},acceptDownloads:true});
   const p=await context.newPage();p.setDefaultTimeout(12000);
   const capture=observe(p,base,()=>row.phase);let hits=0;
   if(row.name!=='healthy')await p.route('**/workbench.mjs',r=>{
    hits++;return row.name==='503'?r.fulfill({status:503,contentType:'text/javascript',body:'PRIVATE_DIAGNOSTIC_CANARY'}):r.abort('failed');
   });
   await p.goto(base);
   if(row.name!=='healthy'){
    await phase('failed-startup');
    await p.waitForFunction(()=>document.querySelector('#startup-status')?.getAttribute('role')==='alert');
    assert.match(await p.locator('#startup-status').textContent(),/STARTUP_LOAD_FAILED/);
    row.diagnostics=await capture();assert.equal(hits,1);
    row.resource_captured=row.diagnostics.resources.some(e=>e.resource==='workbench.mjs'&&
     (row.name==='503'?e.event==='http_error'&&e.status===503:e.event==='request_failed'&&e.code==='net::ERR_FAILED'));
    assert.equal(row.diagnostics.readiness.startup_reload_visible,true);
    assert.equal(await p.locator('#run').isDisabled(),true);
    await p.screenshot({path:path.join(out,row.surface+'-'+row.width+'-'+row.name+'-error.png')});
    await p.unroute('**/workbench.mjs');await phase('keyboard-recovery');
    await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'startup-reload');
    await Promise.all([p.waitForNavigation(),p.keyboard.press('Enter')]);
   }
   await p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
   if(row.name==='healthy'){row.diagnostics=await capture();row.resource_captured=row.diagnostics.resources.length===0;}
   await phase('source-and-export');
   await p.click('#run');await p.locator('.value').waitFor();assert.equal(await p.locator('.value').textContent(),'30.00%');
   await p.locator('.evidence-row').first().click();
   const pending=p.waitForEvent('download');await p.click('#export');
   const bytes=await fs.readFile(await (await pending).path()),record=JSON.parse(bytes);
   assert.equal(record.classification,'SYNTHETIC');assert.equal(record.result.calculations[0].display,'30.00%');
   assert.equal(record.sources.length,1);assert.equal(record.sources[0].doc_id,'syn_aurora_2024');
   row.business_recovery=true;row.source_export=true;
   await fs.writeFile(path.join(out,row.surface+'-'+row.width+'-'+row.name+'-review.json'),bytes);
   assert.ok(!JSON.stringify(row.diagnostics).includes('PRIVATE_DIAGNOSTIC_CANARY'));
   assert.ok(!JSON.stringify(row.diagnostics).includes(new URL(base).host));
   assert.equal(row.resource_captured,true,'capture must retain the known failure within the deployment directory');
   row.passed=true;row.status='passed';await phase('complete');
  }catch(e){row.passed=false;row.status='failed';row.error_code=errorCode(e);process.exitCode=1;}
  finally{
   try{await context?.close();}catch(e){row.cleanup_error=errorCode(e);row.passed=false;row.status='failed';process.exitCode=1;}
   row.seconds=(performance.now()-start)/1000;await save();
  }
 }
})().catch(e=>{suiteError=errorCode(e);process.exitCode=1;}).finally(async()=>{
 try{await browser?.close();}catch(e){suiteError=errorCode(e);process.exitCode=1;}
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await save(true,suiteError);
 console.log(JSON.stringify({total:rows.length,passed:rows.filter(r=>r.passed).length,suite_error:suiteError}));
});
