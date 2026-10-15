// Saved-setting ownership through the compiled UI and real disposable SQLite.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to an isolated absolute Playwright path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-pass4-universe-settings-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const checks=[],errors=[],external=[],serverRequests=[],versions={},gates=new Set();
const deny=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request');};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#97ebce"/></svg>';
let app,browser,context,page,meta,held=null,failNext=null,requests=[];
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function check(label,actual,expected){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected});console.log(JSON.stringify(checks.at(-1)));}
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const matches=(response,path,method)=>new URL(response.url()).pathname===path&&response.request().method()===method;
function hold(path,method='POST'){const gate={path,method,seen:deferred(),release:deferred(),done:deferred()};held=gate;gates.add(gate);return gate;}
async function seen(gate){await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Save did not reach response gate');})]);assert.equal(gate.error,undefined,'Response gate failed: '+gate.error);}
async function release(gate){const finished=page.waitForEvent('requestfinished',{predicate:r=>new URL(r.url()).pathname===gate.path&&r.method()===gate.method});gate.release.resolve();await gate.done.promise;await finished;await frame();gates.delete(gate);}
async function waitSave(path,method,click,status=200){const response=page.waitForResponse(r=>matches(r,path,method));await click();const r=await response;assert.equal(r.status(),status);await r.finished();await frame();return r;}
async function mapSettings(){
 const name=`Settings ${meta.engine} ${meta.width}`,map=app.core.universe.jspace.create(42,{name}),path=`/api/universe/jspace/maps/${map.id}/commands`,stored=()=>app.core.universe.jspace.map(42,map.id);
 await page.goto(app.origin+'/#universe-jspace',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open map '+name,exact:true}).click();await page.locator('.jspace-map-viewport').waitFor();
 const open=async()=>{await page.getByRole('button',{name:'Map settings and export',exact:true}).click();await page.getByLabel('J-Space map name',{exact:true}).waitFor();};
 const save=()=>page.getByRole('button',{name:'Save map details',exact:true}).click();
 await open();await page.getByLabel('J-Space map name',{exact:true}).fill('Submitted map name');let gate=hold(path);await save();await seen(gate);
 await page.getByLabel('J-Space map name',{exact:true}).fill('Newer map draft');await release(gate);
 check('Delayed map Save persists its accepted submitted name',stored().name,'Submitted map name');
 check('A newer map-details draft keeps its editor open',await page.getByLabel('J-Space map name',{exact:true}).count(),1);
 check('A newer map-details name survives the earlier acknowledgement',await page.getByLabel('J-Space map name',{exact:true}).count()?await page.getByLabel('J-Space map name',{exact:true}).inputValue():null,'Newer map draft');
 await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-map-late-save.png`)});
 if(!await page.getByLabel('J-Space map name',{exact:true}).count()){await open();await page.getByLabel('J-Space map name',{exact:true}).fill('Newer map draft');}
 await waitSave(path,'POST',save);check('Saving the preserved draft updates the same actual map',stored().name,'Newer map draft');check('Ordinary successful map Save closes its own editor',await page.getByLabel('J-Space map name',{exact:true}).count(),0);
 await open();await page.getByLabel('J-Space map description',{exact:true}).fill('Accepted before closing');gate=hold(path);await save();await seen(gate);
 await page.getByRole('button',{name:'Close Map settings',exact:true}).click();await page.getByRole('button',{name:'Map pilots',exact:true}).click();await page.getByRole('dialog',{name:'Map pilots',exact:true}).waitFor();await release(gate);
 check('Closing a pending editor retains the accepted durable save',stored().description,'Accepted before closing');check('A late map acknowledgement cannot close the subsequently opened pilots panel',await page.getByRole('dialog',{name:'Map pilots',exact:true}).count(),1);
 await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-map-new-panel.png`)});
 if(await page.getByRole('dialog',{name:'Map pilots',exact:true}).count())await page.getByRole('button',{name:'Close Map pilots',exact:true}).click();
 await open();await page.getByLabel('J-Space map name',{exact:true}).fill('Retried map details');failNext={path,method:'POST'};await waitSave(path,'POST',save,503);
 check('Current map Save failure retains the unsaved name',await page.getByLabel('J-Space map name',{exact:true}).inputValue(),'Retried map details');check('Current map Save failure is visible',await page.getByRole('alert').filter({hasText:'Synthetic setting save failure'}).count(),1);check('Failed map Save leaves durable name intact',stored().name,'Newer map draft');
 await waitSave(path,'POST',save);check('Retry persists the same map with current details',stored().name,'Retried map details');check('Retry clears the current map Save error',await page.getByRole('alert').filter({hasText:'Synthetic setting save failure'}).count(),0);
 check('Five explicit map Saves make five command requests',requests.filter(r=>r.path===path&&r.method==='POST').length,5);
}
async function operationalSettings(){
 const ops='/api/universe/operations/config',feeds='/api/universe/feeds/config',stored=()=>app.core.universe.operations.config(42);
 await context.addInitScript(()=>sessionStorage.setItem('kairo-universe-settings-tab','sources'));
 await page.goto(app.origin+'/#universe-settings',{waitUntil:'domcontentloaded'});await page.getByRole('form',{name:'Universe operational settings',exact:true}).waitFor();
 const save=()=>page.getByRole('button',{name:'Save operational settings',exact:true}).click(),saved=()=>page.getByRole('status').filter({hasText:'Settings saved'});
 await page.getByLabel('Danger range in jumps',{exact:true}).fill('6');const gate=hold(ops,'PUT');await save();await seen(gate);await page.getByLabel('Danger range in jumps',{exact:true}).fill('7');const feedResponse=page.waitForResponse(r=>matches(r,feeds,'PUT'));await release(gate);assert.equal((await feedResponse).status(),200);await frame();
 check('Operational Save stores the accepted submitted danger range',stored().danger_jumps,6);check('Operational Save preserves the newer editable draft',await page.getByLabel('Danger range in jumps',{exact:true}).inputValue(),'7');check('An old acknowledgement cannot label a newer operational draft saved',await saved().count(),0);
 await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-operational-late-save.png`)});
 await waitSave(feeds,'PUT',save);check('Current operational Save persists the newer draft',stored().danger_jumps,7);check('Current operational Save acknowledges its unchanged draft',await saved().count(),1);
 await page.getByLabel('Collect public combat reports').check();check('Changing public combat collection clears the saved acknowledgement',await saved().count(),0);
 await page.getByText('Keywords & watched systems',{exact:true}).click();await page.getByLabel('Watched system IDs',{exact:true}).fill('30000142');
 failNext={path:ops,method:'PUT'};await waitSave(ops,'PUT',save,503);check('Current operational failure remains visible',await page.getByRole('alert').filter({hasText:'Synthetic setting save failure'}).count(),1);check('Failed operational write preserves the unsaved watched systems',await page.getByLabel('Watched system IDs',{exact:true}).inputValue(),'30000142');
 await waitSave(feeds,'PUT',save);check('Operational retry persists current watched systems',stored().watched_system_ids,[30000142]);check('Operational retry persists public combat collection',app.core.universe.feeds.config().combat_enabled,true);check('Operational retry clears its current error',await page.getByRole('alert').filter({hasText:'Synthetic setting save failure'}).count(),0);
 await page.getByLabel('Watched system IDs',{exact:true}).fill('30000142, 30000144');check('Editing watched systems clears a prior saved acknowledgement',await saved().count(),0);
 check('Four explicit operational Saves make four operations and three feed writes',requests.filter(r=>r.method==='PUT'&&[ops,feeds].includes(r.path)).map(r=>r.path===ops?'operations':'feeds'),['operations','feeds','operations','feeds','operations','operations','feeds']);
}
try{
 const dataDir=join(dir,'data'),store=openStore(dataDir);try{store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Universe Settings Pilot','[]','synthetic-unusable-token');}finally{store.close();}
 const port=Number(process.env.KAIRO_PASS4_UNIVERSE_SETTINGS_PORT||18658);app=await startKairo({port,streamPort:port+1,dataDir,noSync:true,fetcher:deny,datasets:{fetcher:deny},universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 for(const engine of ['chromium','firefox']){browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});versions[engine]=browser.version();
  for(const width of [1600,390])for(const scenario of ['map-settings','operational-settings']){meta={engine,width,scenario};requests=[];held=null;failNext=null;
   if(scenario==='operational-settings'){app.core.universe.operations.saveConfig(42,{...app.core.universe.operations.config(42),danger_jumps:5,watched_system_ids:[]});app.core.universe.feeds.saveConfig({combat_enabled:false,combat_window_minutes:60});}
   context=await browser.newContext({viewport:{width,height:width===390?844:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.hostname==='images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});if(url.origin!==app.origin&&url.origin!==app.streamOrigin){external.push({...meta,url:url.href});return route.abort('blockedbyclient');}
    if(url.pathname.startsWith('/api/universe/')&&['POST','PUT','DELETE'].includes(request.method()))requests.push({path:url.pathname,method:request.method()});
    if(held?.path===url.pathname&&held.method===request.method()){const gate=held;held=null;try{const response=await route.fetch();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}catch(error){gate.error=String(error);gate.seen.resolve();await route.abort().catch(()=>{});}finally{gate.done.resolve();}return;}
    if(failNext?.path===url.pathname&&failNext.method===request.method()){failNext=null;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic setting save failure'})});}return route.continue();
   });
   try{await(scenario==='map-settings'?mapSettings():operationalSettings());}catch(error){check('Scenario completes actual-owner controls',String(error.stack||error),null);await page.screenshot({path:join(output,`${engine}-${width}-${scenario}-harness-failure.png`)}).catch(()=>{});}finally{for(const gate of gates)gate.release.resolve();gates.clear();await context.close();context=null;page=null;}
  }await browser.close();browser=null;
 }
 meta={scenario:'global'};check('No uncaught application errors',errors,[]);check('No unexpected external browser requests',external,[]);check('No external runtime requests',serverRequests,[]);const failed=checks.filter(row=>!row.pass);await writeFile(join(output,'checks.json'),JSON.stringify({ok:!failed.length,versions,checks,errors,external,serverRequests},null,2));console.log(JSON.stringify({ok:!failed.length,checks:checks.length,failed:failed.length,output}));assert.equal(failed.length,0,'Universe setting ownership checks failed; see checks.json.');
}finally{for(const gate of gates)gate.release.resolve();await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
