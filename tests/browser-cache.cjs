// Real HTTP cache, no Playwright routing (routing disables the browser cache).
// Historical HTML/app bytes remain in git; they are not rewritten as a test double.
const {chromium} = require('playwright');
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..'), web = path.join(root, 'web');
  const out = path.join(process.env.BROWSER_ARTIFACTS || 'browser-artifacts', 'cache');
  await fs.mkdir(out, {recursive:true});
  const versions = ['ec0e6a2b8d9d605df81330f6e91b53ee23acf18f', '0428af872daf9fe9a59085a4b3581b7798891492'];
  const historical = Object.fromEntries(versions.map(sha => [sha, Object.fromEntries(
    ['index.html','app.mjs', ...(sha===versions[1]?['bootstrap.mjs']:[])].map(name =>
      [name, execFileSync('git', ['show', `${sha}:web/${name}`], {cwd:root})]))]));
  const rows = [1440,390].flatMap(width => [
    ...versions.flatMap(sha => ['cached-old-app-new-html','old-html-new-app'].map(name => ({width,sha,name,passed:null}))),
    {width,sha:versions[0],name:'legacy-manifest-failure',passed:null},
    {width,sha:versions[0],name:'legacy-manifest-invalid',passed:null},
    {width,sha:versions[0],name:'legacy-late-graph',passed:null},
    {width,sha:versions[1],name:'missing-version-reload',passed:null},
    {width,sha:versions[1],name:'old-html-fresh-bootstrap',passed:null},
  ]);
  let phase='current', active, fail=false, requests=[], held=[];
  const server=http.createServer(async(req,res) => {
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    requests.push({name,phase});
    try {
      if(name.includes('..')) throw new Error();
      if(fail && active.name==='missing-version-reload' && name.includes('/workbench.mjs')) throw new Error();
      if(fail && active.name==='legacy-manifest-failure' && name==='manifest.json') throw new Error();
      if(fail && active.name==='legacy-manifest-invalid' && name==='manifest.json') {
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end('{"asset_version":"https://invalid.example/x"}'); return;
      }
      const old = phase==='old' || (phase==='mixed' && (name==='index.html' || (name==='bootstrap.mjs' && active.name!=='old-html-fresh-bootstrap')));
      const raw = (old && historical[active.sha][name]) || await fs.readFile(path.join(web,name));
      if(fail && active.name==='legacy-late-graph' && name.includes('/workbench.mjs')) await new Promise(resolve=>held.push(resolve));
      const type=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':name.endsWith('.json')?'application/json':'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'max-age=600'}).end(raw);
    } catch {res.writeHead(404,{'Cache-Control':'no-store'}).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/`;
  let browser;
  const save=async()=>{await fs.writeFile(path.join(out,'result.tmp'),JSON.stringify({classification:'SYNTHETIC_RELEASE_CACHE_REGRESSION',total:rows.length,passed:rows.filter(r=>r.passed===true).length,failed:rows.filter(r=>r.passed===false).length,not_run:rows.filter(r=>r.passed===null).length,paid_calls:0,rows},null,2));await fs.rename(path.join(out,'result.tmp'),path.join(out,'result.json'));};
  await save();
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    for(const row of rows) {
    active=row;requests=[];held=[];fail=false;const began=performance.now();
    const context=await browser.newContext({viewport:{width:row.width,height:1000},acceptDownloads:true});
    const p=await context.newPage();p.setDefaultTimeout(3500);
    const ready=()=>p.waitForFunction(()=>!document.querySelector('#run').disabled && !document.querySelector('.shell').inert,null,{timeout:12000});
    try {
      if(row.name==='cached-old-app-new-html') {
        phase='old';await p.goto(base);await ready();await p.click('#run');await p.waitForSelector('.value');
        assert.equal(await p.locator('.value').textContent(),'30.00%');
        await p.fill('#notes','cache continuity');await p.locator('.evidence-row').first().click();
        await p.getByRole('checkbox',{name:'已核对这条原文'}).check();
        row.old_app_requests=requests.filter(r=>r.name==='app.mjs').length;
        phase='current';await p.goto(base+'?release=new');await ready();
        await p.waitForFunction(()=>document.querySelector('#notes').value==='cache continuity');
        assert.equal(requests.filter(r=>r.name==='app.mjs').length,row.old_app_requests,'new document must avoid the cached unversioned app');
        const dl=p.waitForEvent('download');await p.click('#export');
        const saved=JSON.parse(await fs.readFile(await(await dl).path(),'utf8'));
        assert.equal(saved.review.notes,'cache continuity');assert.equal(saved.review.checked_citation_ids.length,1);
        assert.equal(saved.result.calculations[0].display,'30.00%');
      } else {
        phase=row.name==='missing-version-reload'?'current':'mixed';
        fail=!['old-html-new-app','old-html-fresh-bootstrap'].includes(row.name);await p.goto(base,{waitUntil:'commit'});
        if(fail) {
          await p.waitForFunction(()=>document.querySelector('#startup-status')?.getAttribute('role')==='alert',null,{timeout:10000});
          assert.equal(await p.locator('.shell').evaluate(n=>n.inert),true);
          assert.equal(await p.locator('#run').isDisabled(),true);
          assert.doesNotMatch(await p.locator('#status').textContent(), /正在校验|资料校验完成/, 'failed startup must not show conflicting loading/ready state');
          assert.equal(requests.filter(r=>r.name.endsWith('bundle.json')).length,0);
          if(row.name==='legacy-late-graph') {
            held.forEach(fn=>fn());
            await p.evaluate(()=>import('./app.mjs').then(()=>null));
            assert.equal(await p.locator('#run').isDisabled(),true,'late module must not start');
          }
          await p.screenshot({path:path.join(out,`${row.width}-${row.name}-failure.png`)});
          fail=false;phase='current';await p.focus('#startup-reload');
          await Promise.all([p.waitForNavigation(),p.keyboard.press('Enter')]);
        }
        await ready();await p.click('#run');await p.waitForSelector('.value');
        assert.equal(await p.locator('.value').textContent(),'30.00%');
      }
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(requests.some(r=>r.name.startsWith('api/')),false);
      // Actual lazy parser + Worker must also load from the release graph.
      await p.click('#pdf-demo');await p.waitForFunction(()=>!document.querySelector('#pdf-download').disabled,null,{timeout:15000});
      const modules=requests.filter(r=>r.name.endsWith('.mjs')).map(r=>r.name);
      const worker=requests.find(r=>r.name.includes('/vendor/pdf.worker.min.mjs'));
      assert.ok(worker, 'real PDF Worker requested from a release directory');
      const prefixes=new Set(modules.filter(n=>n.startsWith('assets/')).map(n=>n.split('/')[1]));
      assert.equal(prefixes.size,1,'a single published module graph');
      row.passed=true;
    } catch(e) {row.passed=false;row.error=e.message.slice(0,1000);}
    finally {held.forEach(fn=>fn());row.elapsed_ms=Math.round(performance.now()-began);row.requests=requests;
      await p.screenshot({path:path.join(out,`${row.width}-${row.sha.slice(0,7)}-${row.name}.png`),fullPage:true}).catch(()=>{});
      await context.close();await save();console.log(JSON.stringify({...row,requests:undefined}));}
  }} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(rows.some(r=>r.passed!==true))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
