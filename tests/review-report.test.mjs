import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readdir} from 'node:fs/promises';
const {observe,errorCode}=createRequire(import.meta.url)('./helpers/review-report.cjs');
test('every shipped first-party module failure is captured without its URL or query', async()=>{
 const p=new EventEmitter();p.evaluate=async()=>({});
 const capture=observe(p,'http://127.0.0.1:8765');
 for(const name of (await readdir(new URL('../web/',import.meta.url))).filter(n=>n.endsWith('.mjs'))){
  p.emit('response',{url:()=>`http://127.0.0.1:8765/assets/${'a'.repeat(64)}/${name}?PRIVATE_CANARY`,status:()=>503});
  assert.deepEqual((await capture()).resources.at(-1),{resource:name,event:'http_error',status:503});
 }
 assert.ok(!JSON.stringify(await capture()).includes('PRIVATE_CANARY'));
});
test('review diagnostics only retain bounded known resources and safe network codes', async()=>{
 const p=new EventEmitter();p.evaluate=async()=>({run_present:true,run_disabled:false});
 const capture=observe(p,'http://127.0.0.1:8765');
 for(const url of ['https://outside.test/api/reviews','http://127.0.0.1:8765/private/CANARY','not a URL'])p.emit('response',{url:()=>url,status:()=>503});
 for(let i=0;i<20;i++)p.emit('response',{url:()=>`http://127.0.0.1:8765/assets/${'a'.repeat(64)}/pdf-preview-panel.mjs?CANARY`,status:()=>503});
 p.emit('requestfailed',{url:()=> 'http://127.0.0.1:8765/runtime.json?CANARY',failure:()=>({errorText:'CANARY raw private message'})});
 p.emit('requestfailed',{url:()=> 'http://127.0.0.1:8765/api/reviews',failure:()=>({errorText:'net::ERR_SOCKET_NOT_CONNECTED'})});
 for(let i=0;i<1001;i++)p.emit('pageerror',new Error('CANARY'));
 const d=await capture();assert.equal(d.resources.length,16);assert.equal(d.page_errors,1000);
 assert.deepEqual(d.resources.at(-2),{resource:'runtime.json',event:'request_failed',code:'OTHER_NETWORK_ERROR'});
 assert.deepEqual(d.resources.at(-1),{resource:'api/reviews',event:'request_failed',code:'net::ERR_SOCKET_NOT_CONNECTED'});
 assert.ok(!JSON.stringify(d).includes('CANARY'));assert.ok(!JSON.stringify(d).includes('http://') && !JSON.stringify(d).includes('https://'));
});
test('closed page and private errors produce explicit unavailable state and fixed codes',async()=>{
 const p=new EventEmitter();p.evaluate=async()=>{throw Error('CANARY')};
 assert.deepEqual(await observe(p,'http://127.0.0.1:8765')(),{schema_version:2,readiness:null,resources:[],page_errors:0,unavailable:true});
 assert.equal(errorCode(new Error('CANARY')),'HARNESS_ERROR');
 assert.equal(errorCode({name:'TimeoutError',message:'CANARY'}),'TIMEOUT');
 assert.equal(errorCode({code:'ERR_ASSERTION',message:'CANARY'}),'ASSERTION_FAILED');
});
