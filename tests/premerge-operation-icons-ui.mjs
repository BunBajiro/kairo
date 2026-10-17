// Standalone compiled Assets/Wallet/Industry icon regression in both engines.
// Synthetic snapshots omit derived icon variants: Core must supply them. Image
// transport validates provider resource choices; no live EVE account is exercised.
// See docs/VALIDATION.md for evidence scope and remaining environment checks.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';
import {seedOperationIcons} from './helpers/operation-icon-fixture.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-operation-icons-'));
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const checks=[],requests=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now();
const expectedVariants=new Map([[27917,'bp'],[1403,'icon'],[1,'icon']]);
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#203c49"/><path d="M4 16 16 4 28 16 16 28Z" fill="#97ebce"/></svg>';
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,meta;
function check(label,actual,expected){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected});console.log(JSON.stringify(checks.at(-1)));}
async function inspect(label){
 const selector='[role=tabpanel][data-state=active] .item-name img';
 await page.waitForFunction(selector=>document.querySelectorAll(selector).length===3,selector);
 const rows=[];
 for(let n=0;n<3;n++){
  const icon=page.locator(selector).nth(n);await icon.locator('..').scrollIntoViewIfNeeded();
  const element=await icon.elementHandle();await page.waitForFunction(i=>window.__typeImageEvents.has(i),element);
  rows.push(await icon.evaluate(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {src:i.src,event:window.__typeImageEvents.get(i),complete:i.complete,naturalWidth:i.naturalWidth,width:r.width,height:r.height,visibility:s.visibility,display:s.display,loading:i.loading,text:i.parentElement.textContent};}));
  await element.dispose();
 }
 check(label+' keeps blueprint, ordinary product and unknown identity',rows.map(r=>Number(new URL(r.src).pathname.split('/')[2])).sort((a,b)=>a-b),[1,1403,27917]);
 for(const row of rows){
  const id=Number(new URL(row.src).pathname.split('/')[2]);
  check(label+' '+id+' selects its resource',row.src,'https://images.evetech.net/types/'+id+'/'+expectedVariants.get(id)+'?size=32');
  check(label+' '+id+' keeps lazy stable image geometry',{stableBox:row.width>=29&&row.height>=29,lazy:row.loading==='lazy',text:row.text.length>0},{stableBox:true,lazy:true,text:true});
  check(label+' '+id+' handles provider outcome',id===1?{error:row.event==='error',hidden:row.visibility==='hidden'}:{loaded:row.event==='load'&&row.complete&&row.naturalWidth>0,visible:row.visibility==='visible'&&row.display!=='none'},id===1?{error:true,hidden:true}:{loaded:true,visible:true});
 }
 await page.screenshot({path:join(output,meta.engine+'-'+meta.width+'-'+label.toLowerCase().replaceAll(' ','-')+'.png')});
}
try{
 seedOperationIcons(join(dir,'data'),now);
 app=await startKairo({port:18652,streamPort:18653,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390]){
   meta={engine,version:browser.version(),width};
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);
   await context.addInitScript(()=>{window.__typeImageEvents=new WeakMap();for(const event of ['load','error'])document.addEventListener(event,e=>{if(e.target instanceof HTMLImageElement)window.__typeImageEvents.set(e.target,event);},true);});
   page=await context.newPage();page.on('pageerror',error=>errors.push({...meta,error:error.message}));const scenarioRequests=[];
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net'){
     const match=url.pathname.match(/^\/types\/(\d+)\/([^/]+)$/);
     if(match){
      const id=Number(match[1]),status=id===1?404:expectedVariants.get(id)===match[2]&&url.search==='?size=32'?200:400;
      const record={...meta,url:url.href,status};requests.push(record);scenarioRequests.push(record);
      return route.fulfill({status,contentType:status===200?'image/svg+xml':'text/plain',headers:{'Cache-Control':'no-store'},body:status===200?image:status===404?'unavailable synthetic legacy type':'bad category or variation'});
     }
     if(url.pathname.startsWith('/characters/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    }
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   try{
    await page.goto(app.origin+'/#assets',{waitUntil:'domcontentloaded',timeout:15000});
    await page.locator('.connection-status.online').waitFor({state:'attached'});
    await page.getByRole('heading',{name:'Asset inventory',exact:true}).waitFor();await inspect('Cold asset inventory');
    await page.goto(app.origin+'/#wallet',{waitUntil:'domcontentloaded'});
    await page.getByRole('tab',{name:'Transactions',exact:true}).click();await inspect('Wallet transactions');
    await page.getByRole('tab',{name:'Market orders',exact:true}).click();await inspect('Wallet orders');
    await page.goto(app.origin+'/#industry',{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Manufacturing & research',exact:true}).waitFor();await inspect('Industry jobs');
    check('Existing missing-type handling adds no fallback or metadata request',scenarioRequests.every(r=>{const u=new URL(r.url),id=Number(u.pathname.split('/')[2]);return r.status===(id===1?404:200);}),true);
    check('Four operation views keep image work bounded',scenarioRequests.length<=12,true);
   }catch(error){errors.push({...meta,error:error.stack||String(error)});await page.screenshot({path:join(output,engine+'-'+width+'-failure.png')}).catch(()=>{});}
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 check('Cached operation views make no external server requests',serverRequests,[]);
 check('No provider metadata or unexpected browser requests',unexpectedNetwork,[]);
 check('Four browser and viewport workflows complete',errors,[]);
 assert.ok(checks.length>0&&checks.every(c=>c.pass),'Operation icon contract checks failed');
}finally{
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:checks.length>0&&checks.every(c=>c.pass)&&errors.length===0,scope:'Compiled Assets, Wallet transactions/orders and Industry jobs with pre-fix SQLite samples and actual Core projections. Blueprint transport matches observed bp variation; unknown ID is a synthetic unavailable-resource negative control. No live-provider availability claim.',checks,requests,errors,unexpectedNetwork,serverRequests},null,2));
 await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass).length,errors:errors.length,output}));
}
