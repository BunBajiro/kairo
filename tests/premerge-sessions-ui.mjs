// PBR-5: compiled report UI, real SQLite reports and a late published killmail.
// Runs Chrome/Blink and Firefox/Gecko through isolated Playwright tooling.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href);
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-sessions-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],external=[],serverRequests=[],store=openStore(join(dir,'data'));
store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Pagination pilot','[]','synthetic-test-token');
store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(43,'Zeta other pilot','[]','synthetic-test-token');
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page;
function check(label,actual,expected,meta){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({label,pass,actual,expected,...meta});console.log(JSON.stringify(checks.at(-1)));assert.ok(pass,label);}
function seed(id,index){
 const start=Date.now()-(index+1)*3600000,at=ms=>new Date(start+ms).toISOString(),label='Pagination '+id;
 store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)')
  .run(id,42,label,at(0),at(600000),JSON.stringify({capturedAt:at(0)}),'{}');
 const insert=store.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)');
 for(let i=1;i<=200;i++)insert.run(42,'session.note','sessions','Recorded note '+i,'{}',at(i*1000));
 return {id,label,late:()=>insert.run(42,'killmail.kill','combat','Delayed published killmail','{}',at(500))};
}
try{
 app=await startKairo({port:18636,streamPort:18637,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork}});
 let scenario=0;
 for(const engine of (process.env.KAIRO_SESSIONS_BROWSERS||'chromium,firefox').split(',')){
  assert.ok(['chromium','firefox'].includes(engine));
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390]){
   const meta={engine,version:browser.version(),width},fixture=seed(engine+'-'+width,scenario++);
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(12000);page=await context.newPage();
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>'});
    external.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   await page.goto(app.origin+'/#sessions',{waitUntil:'domcontentloaded',timeout:15000});
   await page.locator('.connection-status.online').waitFor({state:'attached'});
   const boundary=await page.evaluate(async id=>{
    const base='/api/sessions/'+id+'?character=42';
    const invalid=['eventCursor=-1','eventCursor=1.5','eventCursor=NaN','eventCursor=9007199254740991','eventEnd=invalid','eventEnd=2999-01-01T00%3A00%3A00Z'];
    const statuses=await Promise.all(invalid.map(query=>fetch(base+'&'+query).then(response=>response.status)));
    statuses.push(await fetch('/api/sessions/'+id+'?character=43&eventCursor=0').then(response=>response.status));
    return statuses;
   },fixture.id);
   check('HTTP rejects invalid snapshot fields and wrong-pilot reads',boundary,[400,400,400,400,400,400,400],meta);
   await page.locator('.session-card').filter({hasText:fixture.label}).click();
   await page.locator('.session-detail-card[data-card=timeline]').click();
   await page.waitForFunction(()=>document.querySelectorAll('.report-events article').length===100);
   check('Initial timeline uses one report page',await page.locator('.report-events article').count(),100,meta);
   fixture.late();
   const more=()=>page.getByRole('button',{name:'Load more session events',exact:true});
   await more().click();
   await page.waitForFunction(()=>document.querySelectorAll('.report-events article').length===200);
   check('Late insert does not shift the existing snapshot',{displayed:await page.locator('.report-events article').count(),loadMore:await more().count(),status:await page.locator('.session-detail-card[data-card=timeline] .session-card-status').textContent()},{displayed:200,loadMore:0,status:'200 of 200 events shown'},meta);
   check('Pagination adds no new notices',await page.locator('[data-sonner-toast]').count(),0,meta);
   await page.locator('.session-summary-heading').getByRole('button',{name:'Refresh',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.report-events article').length===100&&document.querySelector('.report-events article strong')?.textContent==='Delayed published killmail');
   check('Existing Refresh acquires the delayed event',await page.locator('.report-events article strong').first().textContent(),'Delayed published killmail',meta);
   await more().click();
   await page.waitForFunction(()=>document.querySelectorAll('.report-events article').length===200);
   await more().click();
   await page.waitForFunction(()=>document.querySelectorAll('.report-events article').length===201);
   const labels=await page.locator('.report-events article strong').allTextContents();
   check('All events remain reachable without duplicates',{displayed:labels.length,unique:new Set(labels).size,loadMore:await more().count()},{displayed:201,unique:201,loadMore:0},meta);
   check('Report count agrees with completed timeline',await page.locator('.session-detail-card[data-card=timeline] .session-card-status').textContent(),'201 of 201 events shown',meta);
   check('Report stays within desktop or narrow viewport',await page.evaluate(()=>{const dialog=document.querySelector('.session-report-dialog'),r=dialog.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&dialog.scrollWidth<=dialog.clientWidth+1;}),true,meta);
   await page.locator('.session-detail-card[data-card=timeline]').scrollIntoViewIfNeeded();
   await page.screenshot({path:join(output,engine+'-'+width+'-complete-timeline.png')});
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 assert.deepEqual(errors,[],'No browser errors');assert.deepEqual(external,[],'No unhandled browser requests');assert.deepEqual(serverRequests,[],'No server external requests');
}catch(error){
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),errors,external,serverRequests},null,2));
 if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;
}finally{
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:checks.length>0&&checks.every(check=>check.pass)&&errors.length===0,scope:'Compiled Session report UI with synthetic SQLite and delayed event insertion; no live EVE validation',checks,errors,external,serverRequests},null,2));
 await context?.close();await browser?.close();await app?.close();store.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({checks:checks.length,failed:checks.filter(check=>!check.pass).length,output}));
}
