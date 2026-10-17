// Compiled-app regression for Range with an alternate midpoint destination.
// Playwright stays isolated from application dependencies. All runtime state is
// disposable and all external traffic is blocked; the atlas is bundled CCP data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const playwright=await import(pathToFileURL(modulePath).href);
const browsers=(process.env.KAIRO_NAVIGATION_BROWSERS||'chromium,firefox').split(',');
assert.ok(browsers.length&&browsers.every(name=>['chromium','firefox'].includes(name)),'Use chromium and/or firefox.');
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-navigation-'));
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],external=[],serverRequests=[],versions={};
const denyExternal=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,release=()=>{},scenario;

function reachabilityResponse(response){
 return new URL(response.url()).pathname==='/api/universe/navigation/reachability'&&response.request().method()==='POST';
}
async function layout(){
 const bounds=await page.locator('.universe-navigation-tool').evaluate(element=>{
  const rect=element.getBoundingClientRect();
  return {left:rect.left,right:rect.right,width:innerWidth,page:document.documentElement.scrollWidth,content:element.scrollWidth,client:element.clientWidth};
 });
 assert.ok(bounds.left>=-1&&bounds.right<=bounds.width+1&&bounds.page<=bounds.width+1&&bounds.content<=bounds.client+1,'Navigation fits horizontally: '+JSON.stringify(bounds));
 return bounds;
}
async function results(response,fixture){
 const data=await response.json();
 assert.equal(response.status(),200,'The real Range endpoint accepts an alternate destination: '+JSON.stringify(data));
 assert.equal(data.status,'ok');
 assert.deepEqual(response.request().postDataJSON().origins,[{systemId:fixture.origin.system_id,rangeLy:5}]);
 assert.equal(response.request().postDataJSON().destinationId,fixture.destination.system_id);
 assert.ok(data.alternateMidpoints?.length>0,'The real response contains alternate midpoints.');
 for(const mid of data.alternateMidpoints){
  assert.ok(mid.systemId!==fixture.origin.system_id&&mid.systemId!==fixture.destination.system_id,'Midpoints exclude both endpoints.');
  assert.ok(mid.fromDistanceLy>0&&mid.fromDistanceLy<=5&&mid.toDistanceLy>0&&mid.toDistanceLy<=5,'Both midpoint legs fit the selected range.');
 }
 await page.locator('.universe-alternate-mids button').first().waitFor();
 assert.equal(await page.locator('.universe-operation-error').count(),0,'No stale error survives a successful retry.');
 assert.deepEqual(await page.locator('.universe-navigation-metrics strong').allTextContents(),[String(data.unionSystemIds.length),String(data.overlapSystemIds.length)]);
 const names=data.alternateMidpoints.slice(0,16).map(mid=>fixture.names[mid.systemId]);
 assert.deepEqual(await page.locator('.universe-alternate-mids button > span').evaluateAll(elements=>elements.map(element=>element.firstChild.textContent)),names,'Rendered midpoint names match the actual endpoint result.');
 return data;
}

try{
 const port=Number(process.env.KAIRO_NAVIGATION_TEST_PORT||18636);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyExternal,datasets:{fetcher:denyExternal},universe:{operations:{noSync:true,fetcher:denyExternal},feeds:{noSync:true,fetcher:denyExternal}}});
 for(const name of browsers){
  browser=await playwright[name].launch({headless:true,timeout:20000,...(name==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{} )});
  versions[name]=browser.version();
  for(const width of [1600,390]){
   scenario={browser:name,width};
   // Every viewport starts without earlier navigation, local storage or cache.
   context=await browser.newContext({viewport:{width,height:width===390?844:1100},serviceWorkers:'block'});
   context.setDefaultTimeout(10000);
   page=await context.newPage();
   page.on('pageerror',error=>errors.push({...scenario,error:error.message}));
   let holdNext=true,failNext=false,rangeRequests=0;
   const responseGate=new Promise(resolve=>{release=resolve;});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==app.origin&&url.origin!==app.streamOrigin){external.push({...scenario,url:url.href});return route.abort('blockedbyclient');}
    if(url.pathname==='/api/universe/navigation/reachability'&&route.request().method()==='POST'){
     rangeRequests++;
     if(holdNext){holdNext=false;await responseGate;}
     if(failNext){failNext=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic temporary range failure; retry this calculation.'})});}
    }
    return route.continue();
   });
   await page.goto(app.origin+'/#universe',{waitUntil:'domcontentloaded',timeout:15000});
   // Narrow layouts hide this status label; its state still signals readiness.
   await page.locator('.connection-status.online').waitFor({state:'attached'});
   await page.locator('.universe-module canvas').waitFor();
   const fixture=await page.evaluate(async()=>{
    const atlas=await(await fetch('/api/universe/static')).json();
    const origin=atlas.systems.find(system=>system.name==='UALX-3');
    const destination=atlas.systems.filter(system=>system.space==='known'&&system.security<.45&&system.region_id===origin.region_id&&system.system_id!==origin.system_id&&Math.hypot(system.x-origin.x,system.y-origin.y,system.z-origin.z)/9460730472580800<5).sort((a,b)=>a.system_id-b.system_id)[0];
    return {origin,destination,names:Object.fromEntries(atlas.systems.map(system=>[system.system_id,system.name]))};
   });
   assert.ok(fixture.origin&&fixture.destination,'The bundled atlas supplies UALX-3 and a nearby eligible destination.');
   const open=page.getByRole('button',{name:'Open details',exact:true});
   if(await open.isVisible())await open.click();
   await page.getByRole('combobox',{name:'Operations tool',exact:true}).click();
   await page.getByRole('option',{name:'Navigate',exact:true}).click();
   await page.getByRole('button',{name:'Range',exact:true}).click();
   await page.getByLabel('Range origin 1',{exact:true}).fill('UALX-3');
   await page.getByLabel('Alternate midpoint destination',{exact:true}).fill(fixture.destination.name);
   const initial=page.waitForResponse(reachabilityResponse);
   await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();
   await page.getByRole('button',{name:'Calculating…',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Calculating…',exact:true}).isDisabled(),true,'The delayed calculation disables resubmission.');
   assert.equal(await page.locator('.universe-alternate-mids').count(),0,'Cold entry does not display invented or cached midpoint results.');
   release();
   const first=await results(await initial,fixture);
   const bounds=await layout();
   await page.locator('.universe-alternate-mids').scrollIntoViewIfNeeded();
   await page.screenshot({path:join(output,name+'-'+width+'-range-midpoints.png')});

   // Exercise a transient transport failure, then retry the unchanged form
   // against the actual server. Success above and below are never mocked.
   await page.getByRole('button',{name:'Clear range highlights',exact:true}).click();
   assert.equal(await page.locator('.universe-navigation-metrics').count(),0);
   failNext=true;
   const failed=page.waitForResponse(reachabilityResponse);
   await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();
   assert.equal((await failed).status(),503);
   await page.getByRole('alert').filter({hasText:'Synthetic temporary range failure'}).waitFor();
   const retry=page.waitForResponse(reachabilityResponse);
   await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();
   const recovered=await results(await retry,fixture);
   assert.deepEqual(recovered.alternateMidpoints,first.alternateMidpoints,'Retry recovers the same actual midpoint result.');
   const midpoint=fixture.names[recovered.alternateMidpoints[0].systemId];
   await page.locator('.universe-alternate-mids button').first().click();
   await page.locator('.universe-system-title h3').filter({hasText:midpoint}).waitFor();
   assert.equal(await page.locator('.universe-system-title h3').textContent(),midpoint,'Choosing a midpoint opens that system in the inspector.');
   assert.equal(rangeRequests,3,'One initial request, one controlled failure and one successful retry.');
   checks.push({...scenario,version:versions[name],origin:'UALX-3',destination:fixture.destination.name,midpoints:first.alternateMidpoints.length,selected:midpoint,rangeRequests,bounds,delayedResponse:true,recovered:true});
   console.log(JSON.stringify(checks.at(-1)));
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 assert.deepEqual(errors,[],'No uncaught browser exceptions.');
 assert.deepEqual(external,[],'The flow makes no external browser requests.');
 assert.deepEqual(serverRequests,[],'The disposable runtime makes no external requests.');
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:true,scope:'Actual compiled Universe Range UI and local endpoint; fresh desktop/narrow contexts, delayed request and synthetic failure recovery',versions,checks},null,2));
 console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}catch(error){
 release();
 const state=page?await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-7000)})).catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),scenario,versions,checks,errors,external,serverRequests,state},null,2));
 if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});
 throw error;
}finally{
 release();await context?.close();await browser?.close();await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
