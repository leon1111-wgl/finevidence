// FE-028: real module/data faults must identify distinct recovery controls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {observe,errorCode} = require('./helpers/review-report.cjs');
const expected = {
  healthy: [false,false,false],
  'runtime.json': [false,false,true],
  'workbench.mjs': [true,true,false],
  'source-catalog.mjs': [true,true,false],
};
const fields = ['startup_panel_visible','startup_reload_visible','data_retry_visible'];
(async()=>{
 const out=path.resolve(process.env.BROWSER_ARTIFACTS || 'browser-artifacts','review-diagnostics');
 await fs.mkdir(out,{recursive:true});
 const rows=[],boundaries=[];
 const save=()=>fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_DIAGNOSTIC_CONFORMANCE',model_calls:0,total:8,passed:rows.filter(r=>r.passed).length,boundary_total:12,boundary_passed:boundaries.filter(r=>r.passed).length,rows,boundaries},null,2));
 const web=path.resolve(__dirname,'../web');
 const server=http.createServer(async(req,res)=>{
  try{
   const name=new URL(req.url,'http://localhost').pathname;
   const file=path.resolve(web,name==='/'?'index.html':decodeURIComponent(name.slice(1)));
   if(!file.startsWith(web+path.sep))throw Error();
   const data=await fs.readFile(file);
   res.writeHead(200,{'Content-Type':{'.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'}[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });
 let browser;
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  for(const width of [1440,390]){
   for(const [scenario,want] of Object.entries(expected)){
    const ctx=await browser.newContext({viewport:{width,height:1000}});
    const row={width,scenario,passed:false};const start=performance.now();
    try{
     const p=await ctx.newPage();p.setDefaultTimeout(6000);let hits=0;
     if(scenario!=='healthy')await ctx.route('**/'+scenario,r=>{hits++;return r.fulfill({status:503,contentType:'text/javascript',body:'PRIVATE_DIAGNOSTIC_CANARY'});});
     const capture=observe(p,base);await p.goto(base);
     if(scenario==='healthy')await p.waitForFunction(()=>document.querySelector('#run')?.disabled===false);
     else if(scenario==='runtime.json')await p.locator('#retry').waitFor({state:'visible'});
     else await p.waitForFunction(()=>document.querySelector('#startup-status')?.textContent.includes('STARTUP_LOAD_FAILED'));
     row.diagnostics=await capture();row.hits=hits;
     assert.equal(row.diagnostics.schema_version,2);
     assert.equal('startup_retry_visible' in row.diagnostics.readiness,false);
     assert.deepEqual(fields.map(k=>row.diagnostics.readiness[k]),want);
     if(scenario!=='healthy'){
      assert.equal(hits,1);
      assert.ok(row.diagnostics.resources.some(r=>r.resource===scenario&&r.status===503));
     }
     assert.ok(!JSON.stringify(row.diagnostics).includes('PRIVATE_DIAGNOSTIC_CANARY'));
     row.passed=true;
    }catch(e){row.error_code=errorCode(e);}
    finally{await ctx.close();row.seconds=(performance.now()-start)/1000;rows.push(row);await save();}
   }
   const ctx=await browser.newContext({viewport:{width,height:1000}});
   try{
    const p=await ctx.newPage();const capture=observe(p,base);
    // Literal negative controls exercise missing nodes and ancestor hiding.
    for(const [name,attr,want] of [['visible','',true],['ancestor-hidden','hidden',false],['ancestor-display','style="display:none"',false],['ancestor-visibility','style="visibility:hidden"',false],['self-hidden','',false],['missing','',false]]){
     const row={width,name,passed:false};
     try{
      await p.setContent(name==='missing'?'<body></body>':`<section ${attr}><div id="startup" ${name==='self-hidden'?'hidden':''}><a id="startup-reload" href="#">reload</a></div><button id="retry" ${name==='self-hidden'?'hidden':''}>retry</button><button id="ledger-retry" ${name==='self-hidden'?'hidden':''}>retry</button></section>`);
      row.diagnostics=await capture();
      assert.deepEqual([...fields,'ledger_retry_visible'].map(k=>row.diagnostics.readiness[k]),[want,want,want,want]);row.passed=true;
     }catch(e){row.error_code=errorCode(e);}
     boundaries.push(row);await save();
    }
   }finally{await ctx.close();}
  }
 }finally{
  try{await browser?.close();}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));await save();}
 }
 console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,total:8,boundary_passed:boundaries.filter(r=>r.passed).length,boundary_total:12}));
 assert.equal(rows.filter(r=>r.passed).length,8);assert.equal(boundaries.filter(r=>r.passed).length,12);
})().catch(e=>{console.error(errorCode(e));process.exitCode=1;});
