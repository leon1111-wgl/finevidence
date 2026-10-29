import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {observe}=createRequire(import.meta.url)('./helpers/review-report.cjs');
function fixture(base='https://example.test/finevidence/') {
 const p=new EventEmitter(),frame={};p.mainFrame=()=>frame;p.evaluate=async()=>({});
 return {p,frame,capture:observe(p,base,()=> 'initial-navigation'),
  request:(url,options={})=>({url:()=>url,isNavigationRequest:()=>options.navigation!==false,
   frame:()=>options.frame||frame,failure:()=>({errorText:options.error||'net::ERR_CONNECTION_CLOSED'})})};
}
test('main-document failures retain a fixed identity at root and deployment directory',async()=>{
 for(const base of ['https://example.test/','https://example.test/finevidence/','https://example.test/finevidence']){
  const f=fixture(base);
  f.p.emit('requestfailed',f.request(base+'?PRIVATE_CANARY#PRIVATE_FRAGMENT'));
  assert.deepEqual((await f.capture()).resources,[{resource:'main_document',event:'request_failed',code:'net::ERR_CONNECTION_CLOSED',phase:'initial-navigation'}]);
 }
});
test('main-document HTTP failure is distinct from network failure',async()=>{
 const f=fixture(),req=f.request('https://example.test/finevidence/?PRIVATE_CANARY');
 f.p.emit('response',{url:req.url,status:()=>503,request:()=>req});
 assert.deepEqual((await f.capture()).resources,[{resource:'main_document',event:'http_error',status:503,phase:'initial-navigation'}]);
});
test('subframes, fetches, unrelated destinations and missing frame identity are excluded',async()=>{
 const f=fixture(),url='https://example.test/finevidence/';
 for(const options of [{navigation:false},{frame:{}}]) f.p.emit('requestfailed',f.request(url,options));
 for(const url of ['https://outside.test/finevidence/','https://example.test/finevidence-other/','https://example.test/finevidence/private','https://example.test/finevidence//','https://example.test/finevidence/%69ndex.html']){
  f.p.emit('requestfailed',f.request(url));
 }
 const req=f.request(url);req.frame=()=>{throw Error('PRIVATE_CANARY')};f.p.emit('requestfailed',req);
 f.p.emit('requestfailed',{url:()=>url,failure:()=>({errorText:'PRIVATE_CANARY'})});
 assert.deepEqual((await f.capture()).resources,[]);
});
test('captured navigation evidence survives a destroyed document and remains bounded',async()=>{
 const f=fixture();f.p.evaluate=async()=>{throw Error('PRIVATE_CANARY')};
 for(let i=0;i<20;i++)f.p.emit('requestfailed',f.request('https://example.test/finevidence/?PRIVATE_CANARY'));
 const d=await f.capture();assert.equal(d.unavailable,true);assert.equal(d.resources.length,16);
 assert.ok(d.resources.every(e=>e.resource==='main_document'&&e.code==='net::ERR_CONNECTION_CLOSED'));
 assert.ok(!JSON.stringify(d).includes('PRIVATE_CANARY')&&!JSON.stringify(d).includes('example.test'));
});
test('unknown navigation error text is normalized without copying private content',async()=>{
 const f=fixture();f.p.emit('requestfailed',f.request('https://example.test/finevidence/',{error:'PRIVATE_CANARY raw error'}));
 assert.deepEqual((await f.capture()).resources,[{resource:'main_document',event:'request_failed',code:'OTHER_NETWORK_ERROR',phase:'initial-navigation'}]);
});
test('healthy navigation produces no failure event',async()=>{
 const f=fixture(),req=f.request('https://example.test/finevidence/');
 f.p.emit('response',{url:req.url,status:()=>200,request:()=>req});
 assert.deepEqual((await f.capture()).resources,[]);
});

