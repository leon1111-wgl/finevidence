// Real screenshot pixels under a restrictive CSP, not an options-only assertion.
const {chromium}=require('playwright');
const {screenshot}=require('./helpers/review-report.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.env.BROWSER_ARTIFACTS||'browser-artifacts','review-redaction');await fs.mkdir(out,{recursive:true});
 const b=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const rows=[1440,390].map(width=>({width,passed:false,status:'not_run'}));
 try{
  for(const row of rows){
   const width=row.width;row.status='running';
   const ctx=await b.newContext({viewport:{width,height:1000}});const p=await ctx.newPage();
   try{
    await p.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'none\'"><div><span>PRIVATE_REVIEW_REPORT_CANARY</span></div><input value="PRIVATE_TOKEN_CANARY"><textarea>PRIVATE_NOTE_CANARY</textarea><canvas width="100" height="100"></canvas><svg width="100" height="100"><rect width="100" height="100" fill="red"/></svg>');
    await p.evaluate(()=>{const c=document.querySelector('canvas');c.getContext('2d').fillRect(0,0,100,100);});
    const points=[];
    for(const selector of ['span','input','textarea','canvas','svg']){const r=await p.locator(selector).boundingBox();points.push({selector,x:Math.floor(r.x+r.width/2),y:Math.floor(r.y+r.height/2)});}
    const result=await screenshot(p,out,{width,name:'privacy'});assert.equal(result.saved,true);
    const bytes=await fs.readFile(path.join(out,result.file));
    // Decode in a separate blank page; the application page's CSP remains active.
    const decoder=await ctx.newPage();
    const pixels=await decoder.evaluate(async({data,points})=>{
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
      return points.map(p=>({selector:p.selector,rgba:[...g.getImageData(p.x,p.y,1,1).data]}));
    },{data:bytes.toString('base64'),points});
    for(const pixel of pixels)assert.deepEqual(pixel.rgba,[209,213,219,255],pixel.selector+' must contain the mask color');
    Object.assign(row,{passed:true,status:'passed',masked_regions:pixels.length});
   }catch(e){row.status='failed';row.error=e.message;}finally{await ctx.close();}
  }
 }finally{await b.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify({classification:'SYNTHETIC_SCREENSHOT_PRIVACY',model_calls:0,total:2,passed:rows.filter(r=>r.passed).length,rows},null,2));}
 console.log(JSON.stringify({passed:rows.filter(r=>r.passed).length,total:2}));assert.equal(rows.filter(r=>r.passed).length,2);
})().catch(e=>{console.error(e);process.exitCode=1;});
