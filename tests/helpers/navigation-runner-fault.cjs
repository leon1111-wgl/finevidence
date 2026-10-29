// Inject one real transport failure into the fixed 12-row navigation runner.
// Page routes keep priority over this context route for the intended fault cases.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const mode=process.env.NAVIGATION_RUNNER_FAULT;
if(!['healthy','recovery'].includes(mode))throw Error('invalid fault mode');
const receipt=path.join(process.env.BROWSER_ARTIFACTS,'injection.json');
const events=[];
fs.mkdirSync(path.dirname(receipt),{recursive:true});
const save=()=>fs.writeFileSync(receipt,JSON.stringify({mode,events},null,2));
save();
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);let contextIndex=0;
 browser.newContext=async(...args)=>{
  const context=await newContext(...args),index=++contextIndex;
  const newPage=context.newPage.bind(context),pageIndexes=new WeakMap();let pageIndex=0,fired=false;
  context.newPage=async(...args)=>{
   const page=await newPage(...args),number=++pageIndex;pageIndexes.set(page,number);
   page.on('requestfailed',request=>{
    try{
     if(request.isNavigationRequest()&&request.frame()===page.mainFrame()){
      const code=request.failure()?.errorText==='net::ERR_CONNECTION_CLOSED'?'net::ERR_CONNECTION_CLOSED':'OTHER_NETWORK_ERROR';
      events.push({context:index,page:number,event:'requestfailed',code});save();
     }
    }catch{}
   });
   return page;
  };
  await context.route('**/*',route=>{
   const request=route.request();let target=false;
   try{
    const page=request.frame().page();
    target=request.isNavigationRequest()&&request.frame()===page.mainFrame()&&
     (mode==='healthy'?index===3&&pageIndexes.get(page)===1:index===1&&pageIndexes.get(page)===2);
   }catch{}
   if(target&&!fired){fired=true;events.push({context:index,page:mode==='healthy'?1:2,event:'injected_connectionclosed'});save();return route.abort('connectionclosed');}
   return route.continue();
  });
  return context;
 };
 return browser;
};
