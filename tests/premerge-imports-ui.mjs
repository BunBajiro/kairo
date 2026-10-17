// Real compiled import planning UI, SQLite quotes and delayed HTTP completion.
// Playwright is installed independently of the application's dependencies.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';
import {seedMarketIcons} from './helpers/market-icon-fixture.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href);
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-imports-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
let app,browser,context,page,held=null;const activeGates=new Set();
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function check(label,actual,expected,meta){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({label,pass,actual,expected,...meta});console.log(JSON.stringify(checks.at(-1)));}
const detail=()=>page.locator('.import-detail-dialog');
const quantity=()=>detail().getByLabel('Import quantity',{exact:true});
const recalculate=()=>detail().getByRole('button',{name:'Recalculate',exact:true});
const add=()=>detail().getByRole('button',{name:/Add (anchoring|profiteering) option to plan/});
async function closeDetail(){await detail().getByRole('button',{name:'Close',exact:true}).click();await detail().waitFor({state:'detached'});}
async function openCard(index=0){await page.locator('.import-card-open').nth(index).click();await quantity().waitFor();}
async function beginQuote(value,{fail=false}={}){
 const gate={seen:deferred(),release:deferred(),done:deferred(),fail};held=gate;activeGates.add(gate);
 await quantity().fill(String(value));await recalculate().click();await gate.seen.promise;
 return gate;
}
async function releaseQuote(gate){
 const finished=page.waitForEvent('requestfinished',{predicate:request=>request.url().endsWith('/api/markets/imports/quote')&&request.method()==='POST'});
 gate.release.resolve();await gate.done.promise;await finished;
 // Fetch completion schedules React's update; allow it to commit before
 // checking that an obsolete completion has left the current dialog intact.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function quoteState(){return {quantity:await quantity().inputValue(),summary:await detail().locator('.import-quote-summary').allTextContents(),fills:await detail().locator('.import-purchase-fills').allTextContents(),add:await add().allTextContents()};}

try{
 await seedMarketIcons(join(dir,'data'),{now,denyNetwork});
 app=await startKairo({port:18634,streamPort:18635,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 for(const engine of (process.env.KAIRO_IMPORTS_BROWSERS||'chromium,firefox').split(',')){
  assert.ok(['chromium','firefox'].includes(engine),'Only supported required browser engines');
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  const version=browser.version();
  for(const width of [1600,390]){
   const meta={engine,version,width};
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});
   context.setDefaultTimeout(10000);page=await context.newPage();
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===app.origin&&url.pathname==='/api/markets/imports/quote'&&request.method()==='POST'&&held){
     const gate=held;held=null;gate.input=request.postDataJSON();
     try{
      // Compute the real server response first; delay only its arrival in the UI.
      const response=await route.fetch();gate.body=await response.json();assert.equal(response.status(),200);
      gate.seen.resolve();await gate.release.promise;
      await route.fulfill(gate.fail?{status:400,contentType:'application/json',body:JSON.stringify({error:'Obsolete quote failure'})}:{response});
     }catch(error){errors.push({...meta,error:error.stack||String(error)});gate.seen.resolve();await route.abort().catch(()=>{});}
     finally{gate.done.resolve();activeGates.delete(gate);}
     return;
    }
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
   await page.locator('.connection-status.online').waitFor({state:'attached'});
   await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
   await page.locator('.markets-module > [data-slot=tabs] > [role=tablist]').getByRole('tab',{name:'Import Analyser',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.import-card-open').length===2);

   await openCard();
   const edited=await beginQuote(11);await quantity().fill('12');await releaseQuote(edited);
   check('Editing quantity invalidates a pending quote',await quoteState(),{quantity:'12',summary:[],fills:[],add:[]},meta);
   await closeDetail();

   await openCard();
   const switched=await beginQuote(11);
   await detail().getByRole('tab',{name:'Anchoring Price',exact:true}).click();
   const chosen=await quoteState();await releaseQuote(switched);
   check('Changing strategy preserves its chosen quote',await quoteState(),chosen,meta);
   await closeDetail();

   await openCard();
   const replaced=await beginQuote(11);await closeDetail();await openCard(1);
   const second=await quoteState();await releaseQuote(replaced);
   check('Another item cannot receive a previous item quote',await quoteState(),second,{...meta,previousTypeId:replaced.input.typeId});
   await add().click();await detail().waitFor({state:'detached'});
   check('Added plan uses the current item quantity',await page.locator('.import-plan tbody tr td').nth(1).innerText(),Number(second.quantity).toLocaleString('en-GB',{maximumFractionDigits:1}),meta);

   await openCard();
   const reopened=await beginQuote(11);await closeDetail();await openCard();
   const fresh=await quoteState();await releaseQuote(reopened);
   check('Reopening the same item starts a new quote lifetime',await quoteState(),fresh,meta);
   await closeDetail();

   await openCard();
   const failed=await beginQuote(11,{fail:true});await quantity().fill('12');await releaseQuote(failed);
   check('An obsolete failure cannot overwrite the edited form',await detail().locator('.inline-error').allTextContents(),[],meta);
   const current=await beginQuote(12);await releaseQuote(current);
   check('Current successful quote remains usable',await add().count(),1,meta);
   check('Current quote has the requested purchase quantity',await detail().locator('.import-purchase-fills > span').allTextContents(),['12 × 1,000,000 ISK'],meta);
   await page.screenshot({path:join(output,engine+'-'+width+'-current-quote.png')});
   const currentFailure=await beginQuote(12,{fail:true});await releaseQuote(currentFailure);
   check('A current failed quote still reports its error',await detail().locator('.inline-error').allTextContents(),['Obsolete quote failure'],meta);
   await closeDetail();
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 assert.deepEqual(errors,[],'No uncaught browser or interception errors');
 assert.deepEqual(unexpectedNetwork,[],'No unhandled browser external requests');
 assert.deepEqual(serverRequests,[],'Cached import planning makes no server external requests');
 assert.equal(checks.filter(c=>!c.pass).length,0,'Import quote ownership regressions: '+checks.filter(c=>!c.pass).map(c=>`${c.engine}/${c.width}: ${c.label}`).join('; '));
}catch(error){
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),errors,unexpectedNetwork,serverRequests},null,2));
 if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});
 throw error;
}finally{
 for(const gate of activeGates)gate.release.resolve();
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:checks.length>0&&checks.every(c=>c.pass)&&errors.length===0,scope:'Compiled import UI with synthetic SQLite, real quote responses and delayed delivery; no live EVE validation',checks,errors,unexpectedNetwork,serverRequests},null,2));
 await context?.close();await browser?.close();await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass).length,output}));
}
