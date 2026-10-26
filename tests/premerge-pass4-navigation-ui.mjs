// Actual compiled navigation drafts and real local HTTP owners. Transport gates
// delay only selected responses; successful routes/ranges come from Kairo.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-pass4-navigation-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpected=[],serverRequests=[],versions={},gates=new Set();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,meta,held=null,failNext=null,requests=[];
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function check(label,actual,expected,extra={}){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));}
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const pathOf=request=>new URL(request.url()).pathname;
const responseFor=path=>response=>new URL(response.url()).pathname==='/api/universe/navigation/'+path&&response.request().method()==='POST';
// A gate controls selected response delivery, not route/range computation. Await
// both delivery and a render opportunity before inspecting the current draft.
// All gates are released in finally so an assertion cannot strand runtime close.
async function gateSeen(gate){await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Navigation response did not reach its gate.');})]);}
async function release(gate){const done=page.waitForEvent('requestfinished',{predicate:request=>pathOf(request)===gate.path&&request.method()==='POST'});gate.release.resolve();await gate.done.promise;await done;await frame();gates.delete(gate);}
async function openTool(tool){
 await page.goto(app.origin+'/#universe-kspace',{waitUntil:'domcontentloaded',timeout:15000});
 await page.locator('.connection-status.online').waitFor({state:'attached'});await page.locator('.universe-module canvas').waitFor();
 const open=page.getByRole('button',{name:'Open details',exact:true});if(await open.isVisible())await open.click();
 await page.getByRole('combobox',{name:'Operations tool',exact:true}).click();await page.getByRole('option',{name:'Navigate',exact:true}).click();
 await page.getByRole('button',{name:tool,exact:true}).click();
}
async function routeDraft(){
 await openTool('Gate route');
 const from=page.getByLabel('Route origin',{exact:true}),to=page.getByLabel('Route destination',{exact:true});
 await from.fill('Jita');await to.fill('Perimeter');
 const gate={path:'/api/universe/navigation/plan',seen:deferred(),release:deferred(),done:deferred(),status:503};held=gate;gates.add(gate);
 await page.getByRole('button',{name:'Calculate route',exact:true}).click();await gateSeen(gate);
 check('A pending route retains editable destination intent',await to.isEditable(),true);
 await to.fill('New Caldari');await frame();await release(gate);
 check('Obsolete route failure cannot mark an edited draft as failed',await page.locator('.universe-operation-error').count(),0);
 check('Delayed failure preserves the newer destination',await to.inputValue(),'New Caldari');
 check('Completing the invalidated route releases Calculate',await page.getByRole('button',{name:'Calculate route',exact:true}).isEnabled(),true);
 await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-route-obsolete-error.png`)});
 // A failure for the unchanged current draft must still remain visible.
 await to.fill('Perimeter');failNext='/api/universe/navigation/plan';
 const failed=page.waitForResponse(responseFor('plan'));await page.getByRole('button',{name:'Calculate route',exact:true}).click();assert.equal((await failed).status(),503);await frame();
 check('A current route failure remains visible',await page.getByRole('alert').filter({hasText:'Synthetic navigation transport failure'}).count(),1);
 const success=page.waitForResponse(responseFor('plan'));await page.getByRole('button',{name:'Calculate route',exact:true}).click();const response=await success,body=await response.json();assert.equal(response.status(),200);assert.equal(body.status??body.plan?.status,'ok');
 await page.locator('.universe-route-briefing').waitFor();await frame();
 const plan=body.plan||body;
 check('Route retry clears the current transport failure',await page.locator('.universe-operation-error').count(),0);
 check('Route retry presents the actual route endpoints',await page.locator('.universe-navigation-route strong').allTextContents(),['Jita','Perimeter']);
 check('Retry stores the acknowledged destination',app.core.universe.navigation.state(0).plan.systemIds,plan.systemIds);
 check('Three route attempts make exactly three itinerary writes and three plan requests',requests.filter(row=>['/api/universe/navigation/itinerary','/api/universe/navigation/plan'].includes(row.path)).map(row=>row.method+':'+row.path.split('/').at(-1)),['PUT:itinerary','POST:plan','PUT:itinerary','POST:plan','PUT:itinerary','POST:plan']);
}
async function rangeDraft(){
 await openTool('Range');
 const origin=page.getByLabel('Range origin 1',{exact:true}),radius=page.getByLabel('Range radius 1',{exact:true});
 await origin.fill('UALX-3');await radius.fill('5');
 const gate={path:'/api/universe/navigation/reachability',seen:deferred(),release:deferred(),done:deferred(),status:200};held=gate;gates.add(gate);
 await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();await gateSeen(gate);
 check('The delayed Range response belongs to the original radius',gate.request.origins[0].rangeLy,5);
 await radius.fill('2');await frame();await release(gate);
 check('Old Range success does not publish metrics over an edited radius',await page.locator('.universe-navigation-metrics').count(),0);
 check('The pending Range result preserves the current radius',await radius.inputValue(),'2');
 check('The obsolete Range result does not expose Clear range highlights',await page.getByRole('button',{name:'Clear range highlights',exact:true}).count(),0);
 await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-range-obsolete-success.png`)});
 // Let the baseline continue after its expected mismatch for healthy controls.
 const clear=page.getByRole('button',{name:'Clear range highlights',exact:true});if(await clear.count())await clear.click();
 const retry=page.waitForResponse(responseFor('reachability'));await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();const result=await retry,body=await result.json();assert.equal(result.status(),200);assert.equal(body.status,'ok');
 await page.locator('.universe-navigation-metrics').waitFor();await frame();
 check('Current Range retry uses the edited radius',result.request().postDataJSON().origins[0].rangeLy,2);
 check('Current Range metrics match the actual owner response',await page.locator('.universe-navigation-metrics strong').allTextContents(),[String(body.unionSystemIds.length),String(body.overlapSystemIds.length)]);
 failNext='/api/universe/navigation/reachability';const failed=page.waitForResponse(responseFor('reachability'));await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();assert.equal((await failed).status(),503);await frame();
 check('A current Range failure remains visible',await page.getByRole('alert').filter({hasText:'Synthetic navigation transport failure'}).count(),1);
 const recovered=page.waitForResponse(responseFor('reachability'));await page.getByRole('button',{name:'Show reachable systems',exact:true}).click();const current=await recovered,currentBody=await current.json();assert.equal(current.status(),200);await frame();
 check('Range recovery clears the current failure',await page.locator('.universe-operation-error').count(),0);
 check('Range recovery retains the actual current metrics',await page.locator('.universe-navigation-metrics strong').allTextContents(),[String(currentBody.unionSystemIds.length),String(currentBody.overlapSystemIds.length)]);
 check('Four explicit Range attempts make four requests',requests.filter(row=>row.path==='/api/universe/navigation/reachability').length,4);
}
try{
 const port=Number(process.env.KAIRO_PASS4_NAVIGATION_TEST_PORT||18656);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});versions[engine]=browser.version();
  for(const width of [1600,390])for(const scenario of ['route-draft','range-draft']){
   meta={engine,width,scenario};requests=[];held=null;failNext=null;app.core.universe.navigation.clearItinerary(0);
   context=await browser.newContext({viewport:{width,height:width===390?844:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin!==app.origin&&url.origin!==app.streamOrigin){unexpected.push({...meta,url:url.href});return route.abort('blockedbyclient');}
    if(url.pathname.startsWith('/api/universe/navigation/')&&['POST','PUT','DELETE'].includes(request.method()))requests.push({path:url.pathname,method:request.method()});
    const gate=held?.path===url.pathname&&request.method()==='POST'?held:null;
    if(gate){held=null;gate.request=request.postDataJSON();let original;if(gate.status===200)original=await route.fetch();gate.seen.resolve();await gate.release.promise;
     try{if(original)await route.fulfill({response:original});else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic navigation transport failure'})});}finally{gate.done.resolve();}return;
    }
    if(failNext===url.pathname&&request.method()==='POST'){failNext=null;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic navigation transport failure'})});}
    return route.continue();
   });
   try{await(scenario==='route-draft'?routeDraft():rangeDraft());}
   catch(error){check('Scenario completes its actual-owner controls',String(error.stack||error),null);await page.screenshot({path:join(output,`${engine}-${width}-${scenario}-harness-failure.png`)}).catch(()=>{});}
   finally{for(const gate of gates)gate.release.resolve();gates.clear();await context.close();context=null;page=null;}
  }
  await browser.close();browser=null;
 }
 meta={scenario:'global'};check('No uncaught application exceptions',errors,[]);check('No external browser requests',unexpected,[]);check('No external runtime requests',serverRequests,[]);
 const failed=checks.filter(row=>!row.pass);await writeFile(join(output,'checks.json'),JSON.stringify({ok:!failed.length,versions,checks,errors,unexpected,serverRequests,scope:'Compiled route/range draft ownership; current failure/retry and exact explicit request counts in Chrome/Firefox at 1600/390'},null,2));
 console.log(JSON.stringify({ok:!failed.length,checks:checks.length,failed:failed.length,output}));assert.equal(failed.length,0,'Navigation draft ownership checks failed; see checks.json.');
}finally{for(const gate of gates)gate.release.resolve();await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
