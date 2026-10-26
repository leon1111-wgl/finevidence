const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const errorCode = error => error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'HARNESS_ERROR';
const known = new Set(['runtime.json','manifest.json','bundle.json','app.mjs','bootstrap.mjs','workbench.mjs','engine.mjs','state.mjs','handoff.mjs','replay.mjs','pdf-panel.mjs','pdf-intake.mjs','pdf-preview-panel.mjs','pdf-preview.mjs','fact-draft-panel.mjs','review-ledger-panel.mjs','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','api/reviews','api/reviews/revoke']);
const failureCodes = new Set(['net::ERR_FAILED','net::ERR_ABORTED','net::ERR_SOCKET_NOT_CONNECTED','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_CLOSED','net::ERR_TIMED_OUT','net::ERR_INTERNET_DISCONNECTED']);
function observe(page, origin) {
  const resources=[];let pageErrors=0;
  function record(url, event, details) {
    try {
      const u=new URL(url),name=u.pathname.replace(/^\/assets\/[a-f0-9]{64}\//,'/').slice(1);
      if(u.origin!==origin || !known.has(name))return;
      resources.push({resource:name,event,...details});if(resources.length>16)resources.shift();
    }catch{}
  }
  page.on('response',r=>{if(r.status()>=400)record(r.url(),'http_error',{status:r.status()});});
  page.on('requestfailed',r=>{const code=r.failure()?.errorText;record(r.url(),'request_failed',{code:failureCodes.has(code)?code:'OTHER_NETWORK_ERROR'});});
  page.on('pageerror',()=>{pageErrors=Math.min(pageErrors+1,1000);});
  return async () => {
    let timer;
    try {
      const readiness=await Promise.race([page.evaluate(()=>{
        const run=document.querySelector('#run'),ledger=document.querySelector('#review-ledger');
        return {run_present:Boolean(run),run_disabled:run?run.disabled:null,
          startup_retry_visible:document.querySelector('#retry')?.hidden===false,
          ledger_busy:ledger?.getAttribute('aria-busy')==='true',
          ledger_retry_visible:document.querySelector('#ledger-retry')?.hidden===false,
          ledger_alert:document.querySelector('#ledger-status')?.getAttribute('role')==='alert',
          records:Math.min(document.querySelectorAll('#ledger-records li').length,1000)};
      }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),1500);})]);
      return {readiness,resources:[...resources],page_errors:pageErrors};
    }catch{return {readiness:null,resources:[...resources],page_errors:pageErrors,unavailable:true};}
    finally{clearTimeout(timer);}
  };
}
// Capture real layout only. No source text, input value, raster or embedded page.
async function screenshot(page,out,row) {
  const file=`${row.width}-${row.name}-failure-layout.png`;
  try {await page.screenshot({path:path.join(out,file),fullPage:true,timeout:1500,animations:'disabled',mask:[page.locator('xpath=//body//*[text()[normalize-space()]]'),page.locator('input, textarea, select, img, svg, canvas, video, iframe, object, embed')],maskColor:'#d1d5db'});return {policy:'layout_only',saved:true,file};}
  catch{return {policy:'layout_only',saved:false};}
}
function reporter(out, rows) {
  const runId=randomUUID();
  return async (finished=false,suiteError=null)=>{
    const target=path.join(out,'result.json');
    await fs.writeFile(target+'.tmp',JSON.stringify({schema_version:1,run_id:runId,classification:'SYNTHETIC_DEVELOPMENT',source_documents:1,model_calls:0,finished,suite_error:suiteError,total:rows.length,
      attempted:rows.filter(r=>r.status!=='not_run').length,passed:rows.filter(r=>r.passed===true).length,failed:rows.filter(r=>r.passed===false).length,not_run:rows.filter(r=>r.status==='not_run').length,rows},null,2));
    await fs.rename(target+'.tmp',target);
  };
}
module.exports={errorCode,observe,screenshot,reporter};
