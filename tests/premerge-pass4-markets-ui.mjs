// Real compiled Markets failure/retry ownership with actual cached responses.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';
import {seedMarketIcons} from './helpers/market-icon-fixture.mjs';
import {marketSettingsOwnership} from './premerge-pass4-market-settings.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-market-retry-'));
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const now=Date.now(),checks=[],requests=[],errors=[],unexpectedNetwork=[],serverRequests=[];
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,meta;
function check(label,actual,expected){const row={...meta,label,pass:JSON.stringify(actual)===JSON.stringify(expected),actual,expected};checks.push(row);console.log(JSON.stringify(row));}
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const hub=name=>page.locator('.market-hub').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})});
const equipment=()=>page.locator('.market-category-select').filter({has:page.locator('span',{hasText:/^Ship Equipment$/})});
const rowIds=()=>page.locator('.market-catalogue .item-name img').evaluateAll(images=>images.map(i=>Number(new URL(i.src).pathname.split('/')[2])).sort((a,b)=>a-b));
async function loaded(scenario){
 if(scenario==='browse')await page.waitForFunction(()=>document.querySelectorAll('.market-catalogue .item-name img').length===2);
 else await equipment().waitFor();
}
async function concurrentRetries(){
 const counts={categories:0,browse:0},responses=[],message=key=>'Concurrent '+key+' transport failure';let overviews=0;
 const handler=async route=>{
  const u=new URL(route.request().url()),key=u.pathname.split('/').at(-1);
  if(u.pathname==='/api/markets')overviews++;
  if(!Object.hasOwn(counts,key)||u.searchParams.get('hub')!=='60008494')return route.fallback();
  counts[key]++;const response=await route.fetch();responses.push({key,status:response.status()});
  if(counts[key]===1||(key==='categories'&&counts[key]===2))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:message(key)})});
  return route.fulfill({response});
 };
 const response=(key,status)=>page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/markets/'+key&&u.searchParams.get('hub')==='60008494'&&r.status()===status;});
 await page.route(app.origin+'/api/markets{,/**}',handler);
 try{
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});await page.locator('.connection-status.online').waitFor({state:'attached'});
  const categories=response('categories',503);await hub('Amarr').click();await categories;
  const browse=response('browse',503);await page.getByRole('textbox',{name:'Search cached market items',exact:true}).fill('a');await browse;await frame();
  const error=page.locator('.markets-module > .inline-error');
  check('Concurrent failures each issue one real current request',{...counts},{categories:1,browse:1});
  const overview=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/markets'&&r.status()===200);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await overview;await frame();
  check('A healthy overview does not erase a failed category owner',await error.filter({hasText:message('categories')}).count(),1);
  const before=overviews,currentFailure=response('categories',503);await error.getByRole('button',{name:'Retry',exact:true}).click();await currentFailure;await frame();
  check('A failed targeted Retry retains its current failure',await error.filter({hasText:message('categories')}).count(),1);
  check('Retrying categories leaves the failed browse owner unrequested',{...counts},{categories:2,browse:1});
  const categoryRecovery=response('categories',200);await error.getByRole('button',{name:'Retry',exact:true}).click();await categoryRecovery;await equipment().waitFor();await frame();
  check('Category recovery exposes the other current failed owner',await error.filter({hasText:message('browse')}).count(),1);
  check('Category recovery only requests its own resource',{...counts},{categories:3,browse:1});
  const browseRecovery=response('browse',200);await error.getByRole('button',{name:'Retry',exact:true}).click();await browseRecovery;await loaded('browse');await frame();
  check('Both independently recovered resources retain the real cached rows',await rowIds(),[519,1403]);
  check('All recovered owners clear their own errors',await error.count(),0);
  check('Concurrent recovery uses exactly three explicit resource retries',{...counts},{categories:3,browse:2});
  check('Resource retries add no overview request',overviews-before,0);
  check('All intercepted concurrent responses came from healthy real owners',responses.map(r=>r.status),[200,200,200,200,200]);
 }finally{await page.unroute(app.origin+'/api/markets{,/**}',handler);}
}
try{
 await seedMarketIcons(join(dir,'data'),{now,denyNetwork});
 app=await startKairo({port:18652,streamPort:18653,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const scenario of ['browse','categories','settings','concurrent']){
   meta={engine,version:browser.version(),width,scenario};
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);
   page=await context.newPage();page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   for(const name of ['waitForResponse','waitForRequest','waitForEvent']){const wait=page[name].bind(page);page[name]=(...args)=>{const promise=wait(...args);promise.catch(()=>{});return promise;};}
   const resource='/api/markets/'+scenario,message='Current '+scenario+' transport failure';let resourceCount=0,overviewCount=0,failedResponse;
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin||url.origin===app.streamOrigin){
     if(url.pathname==='/api/markets')overviewCount++;
     if(url.pathname===resource&&url.searchParams.get('hub')==='60008494'){
      resourceCount++;requests.push({...meta,url:url.href,ordinal:resourceCount});
      if(resourceCount===1){
       const response=await route.fetch();failedResponse={status:response.status(),body:await response.json()};
       return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:message})});
      }
     }
     return route.continue();
    }
    if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   try{
    if(scenario==='concurrent'){
     await concurrentRetries();await page.screenshot({path:join(output,engine+'-'+width+'-concurrent-retry.png')});
    }else if(scenario==='settings'){
     await marketSettingsOwnership({page,app,check,frame});
     await page.screenshot({path:join(output,engine+'-'+width+'-settings-retry.png')});
    }else{
    await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
    await page.locator('.connection-status.online').waitFor({state:'attached'});
    await hub('Amarr').click();
    if(scenario==='browse'){await equipment().click();}
    const error=page.locator('.markets-module > .inline-error');await error.filter({hasText:message}).waitFor();
    check('Failure replaces a healthy real cached service response',failedResponse?.status,200);
    check('The failed resource contained the seeded items',scenario==='browse'?failedResponse?.body.rows.length:failedResponse?.body.total,2);
    check('Current failure is visible and offers Retry',await error.getByRole('button',{name:'Retry',exact:true}).count(),1);
    check('Initial current resource was requested exactly once',resourceCount,1);
    const priorOverview=overviewCount;
    const responsePromise=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===resource&&u.searchParams.get('hub')==='60008494'&&r.status()===200;},{timeout:3000}).catch(()=>null);
    await error.getByRole('button',{name:'Retry',exact:true}).click();
    const response=await responsePromise;if(response)await loaded(scenario);await frame();
    check('Visible Retry reissues the actual failed resource',resourceCount,2);
    check('Visible Retry restores current cached content',scenario==='browse'?await rowIds():await equipment().count(),scenario==='browse'?[519,1403]:1);
    check('A successful Retry clears the current error',await error.count(),0);
    check('Retry performs at most one overview refresh',overviewCount-priorOverview<=1,true);
    await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-retry.png')});
    // Real navigation is an independent recovery control, and lets the failing
    // baseline complete its remaining assertions without mutating React state.
    const beforeNavigation=resourceCount,jitaResponse=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/markets/categories'&&u.searchParams.get('hub')==='60003760'&&r.status()===200;});
    await hub('Jita').click();await jitaResponse;
    const amarrResponse=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname===resource&&u.searchParams.get('hub')==='60008494'&&r.status()===200;});
    await hub('Amarr').click();await amarrResponse;await loaded(scenario);
    check('Normal hub navigation loads the current resource once',resourceCount-beforeNavigation,1);
    if(scenario==='categories'){await equipment().click();await page.waitForFunction(()=>document.querySelectorAll('.market-catalogue .item-name img').length===2);}
    check('Normal category navigation preserves real cached rows',await rowIds(),[519,1403]);
    await page.locator('.market-catalogue .market-item-button').filter({has:page.locator('img[src*="/types/1403/"]')}).click();
    await page.locator('.market-item-heading .item-name img').waitFor();
    check('The recovered selected item uses the correct cached identity',await page.locator('.market-item-heading .item-name img').getAttribute('src'),'https://images.evetech.net/types/1403/icon?size=32');
    check('Recovery navigation leaves no current error',await error.count(),0);
    }
   }catch(error){errors.push({...meta,error:error.stack||String(error)});await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-failure.png')}).catch(()=>{});}
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 check('No uncaught browser or workflow errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 assert.ok(checks.length>0&&checks.every(row=>row.pass),'Markets Retry owner checks failed');
}finally{
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:checks.length>0&&checks.every(row=>row.pass)&&errors.length===0,scope:'Actual compiled Markets, real SQLite, one current transport failure per resource; visible Retry and independent navigation recovery in both engines/widths.',checks,requests,errors,unexpectedNetwork,serverRequests},null,2));
 await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({checks:checks.length,failed:checks.filter(row=>!row.pass).length,errors:errors.length,output}));
}
