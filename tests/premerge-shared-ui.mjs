// Compiled shared UI regressions through real HTTP and deterministic response gates.
// Synthetic disposable notes/pilots; never a live EVE account or user database.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {savePlaceNote} from '../server/places.mjs';
import {studioSaveDraft,opsecSaveDraft} from './premerge-runtime-edit-scenarios.mjs';
import {importSettingsDraft} from './premerge-market-edit-scenarios.mjs';
import {importPlanOwnership} from './premerge-market-plan-scenarios.mjs';
import {appearanceWriteOrder} from './premerge-appearance-scenarios.mjs';
import {connectionClientDraft} from './premerge-connection-edit-scenarios.mjs';
import {studioCapacity} from './premerge-studio-capacity-scenario.mjs';
import {goalProgressOrder} from './premerge-goal-progress-scenarios.mjs';
import {importAnalysisErrorOwnership} from './premerge-market-load-scenarios.mjs';
import {sessionReportErrorOwnership,deniedStorageReplay} from './premerge-session-edit-scenarios.mjs';
const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href);
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-shared-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now(),systemId=30004807;
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
const sample=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});
let app,browser,context,page,meta,held=null,failRead=false;
const activeGates=new Set();
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function check(label,actual,expected,extra={}){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));}
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function discardNote(panel){const button=panel.getByRole('button',{name:'Discard edits',exact:true});await button.evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest'}));await page.mouse.move(0,0);await button.click();}
function noteResponse(response){const url=new URL(response.url());return url.pathname==='/api/places/system/'+systemId;}
const stored=()=>app.store.db.prepare("SELECT body FROM place_notes WHERE kind='system' AND entity_id=?").get(systemId)?.body;
async function deniedSessionStorage(route){
 await context.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Synthetic session storage access denied','SecurityError');}});});
 const crashed=page.waitForEvent('pageerror').catch(()=>null);
 await page.goto(app.origin+'/#'+route,{waitUntil:'domcontentloaded',timeout:15000});
 const canvas=page.locator(route==='universe-jspace'?'.jspace-workspace':'.universe-module canvas');
 await Promise.race([canvas.waitFor().catch(()=>null),crashed]);await frame();
 const available=await page.evaluate(async()=>{const [boot,atlas]=await Promise.all([fetch('/api/bootstrap').then(r=>r.json()),fetch('/api/universe/static').then(r=>r.json())]);return {pilots:boot.characters.map(p=>p.id),systems:atlas.systems.length>0};});
 check('Denied session preference storage leaves actual server data available',available,{pilots:[42],systems:true});
 check('Unavailable session preferences do not crash '+route,await canvas.count()>0,true);
 check('Unavailable session preferences preserve the selected pilot',(await page.getByRole('combobox',{name:'Active character',exact:true}).allTextContents()).join('').trim(),'Shared UI Alpha');
}
async function noteDiscard(){
 const original='Recorded approach and docking notes',newer='Newer saved approach after discard started',final='Final verified approach';
 savePlaceNote(app.store,'system',systemId,{name:'UALX-3',body:original,tags:['logistics'],status:'home'});
 await context.addInitScript(()=>sessionStorage.setItem('kairo-system-lookup','UALX-3'));
 await page.goto(app.origin+'/#universe-kspace',{waitUntil:'domcontentloaded',timeout:15000});
 await page.locator('.connection-status.online').waitFor({state:'attached'});
 await page.locator('.universe-module canvas').waitFor();
 const open=page.getByRole('button',{name:'Open details',exact:true});if(await open.isVisible())await open.click();
 await page.locator('.universe-system-title h3').filter({hasText:'UALX-3'}).waitFor();
 await page.getByText('Private field notes',{exact:true}).click();
 const panel=page.locator('.place-notes'),editor=panel.locator('textarea'),save=panel.getByRole('button',{name:'Save details',exact:true});
 await page.waitForFunction(()=>document.querySelector('.place-notes textarea')?.value==='Recorded approach and docking notes');
 check('Cold note editor loads the actual saved system note',await editor.inputValue(),original);
 await editor.fill('An intentionally discarded draft');
 const gate={seen:deferred(),release:deferred(),done:deferred()};held=gate;activeGates.add(gate);
 await discardNote(panel);
 await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('Discard did not reach its response gate.');})]);
 assert.equal(gate.body.body,original,'The held read captured the real existing note.');
 check('Discard owns the editor until the saved note arrives',await editor.isDisabled(),true);
 check('Save cannot race an outstanding discard',await save.isDisabled(),true);
 check('Scope controls cannot switch during discard',await panel.locator('.place-scope-tabs button').evaluateAll(nodes=>nodes.every(node=>node.disabled)),true);
 // Continue on the old implementation to expose the user-visible corruption,
 // while the corrected implementation prevents this overlapping interaction.
 if(await editor.isEnabled()){
  await editor.fill(newer);const saved=page.waitForResponse(response=>noteResponse(response)&&response.request().method()==='PUT');
  await save.click();assert.equal((await saved).status(),200);await frame();assert.equal(stored(),newer);
 }
 const expected=stored(),finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname==='/api/places/system/'+systemId&&request.method()==='GET'});
 gate.release.resolve();await gate.done.promise;await finished;await frame();
 check('Delayed discard cannot replace a newer persisted note with stale text',await editor.inputValue(),expected,{persisted:stored()});
 check('Discard completion restores an editable form',await editor.isEnabled(),true);
 await editor.fill(final);const saved=page.waitForResponse(response=>noteResponse(response)&&response.request().method()==='PUT');await save.click();assert.equal((await saved).status(),200);await frame();
 check('Saving after discard persists the current text',stored(),final);
 check('Saving after discard retains the current editor text',await editor.inputValue(),final);
 check('A successful save marks the current draft clean',await save.isDisabled(),true);
 await editor.fill('Keep this draft after the failed discard');failRead=true;
 const failed=page.waitForResponse(response=>noteResponse(response)&&response.request().method()==='GET');await discardNote(panel);assert.equal((await failed).status(),503);await frame();
 check('Failed discard preserves the unsaved draft',await editor.inputValue(),'Keep this draft after the failed discard');
 check('Failed discard releases the editor',await editor.isEnabled(),true);
 check('Failed discard keeps the draft saveable',await save.isEnabled(),true);
 const retry=page.waitForResponse(response=>noteResponse(response)&&response.request().method()==='GET');await discardNote(panel);assert.equal((await retry).status(),200);await frame();
 check('Retrying discard recovers the actual saved note',await editor.inputValue(),final);
 check('Retrying discard marks the note clean',await save.isDisabled(),true);
}
try{
 const store=openStore(join(dir,'data'));
 try{store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Shared UI Alpha','[]','synthetic-unusable-token');store.saveSnapshot(42,'profile',sample({character_id:42,name:'Shared UI Alpha'}));}finally{store.close();}
 const port=Number(process.env.KAIRO_SHARED_TEST_PORT||18640);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
 for(const engine of (process.env.KAIRO_SHARED_BROWSERS||'chromium,firefox').split(',')){
  assert.ok(['chromium','firefox'].includes(engine));browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const [scenario,run] of [['note-discard',noteDiscard],['atlas-storage',()=>deniedSessionStorage('universe-kspace')],['maps-storage',()=>deniedSessionStorage('universe-jspace')],['studio-save-draft',studioSaveDraft],['opsec-save-draft',opsecSaveDraft],['import-settings-draft',importSettingsDraft],['import-plan-ownership',importPlanOwnership],['appearance-write-order',appearanceWriteOrder],['session-report-error',sessionReportErrorOwnership],['storage-replay',deniedStorageReplay],['connection-client-draft',connectionClientDraft],['studio-capacity',studioCapacity],['goal-progress-order',goalProgressOrder],['import-analysis-error',importAnalysisErrorOwnership]]){
   if(process.env.KAIRO_SHARED_SCENARIOS&&!process.env.KAIRO_SHARED_SCENARIOS.split(',').includes(scenario))continue;
   meta={engine,version:browser.version(),width,scenario};held=null;failRead=false;
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();
   // Attach rejection handlers immediately: an action can time out before its
   // paired response waiter. Awaiting the original promise still reports it.
   for(const method of ['waitForResponse','waitForRequest','waitForEvent']){const original=page[method].bind(page);page[method]=(...args)=>{const promise=original(...args);promise.catch(()=>{});return promise;};}
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin&&url.pathname==='/api/places/system/'+systemId&&route.request().method()==='GET'){
     if(failRead){failRead=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic note read failure'})});}
     if(held){const gate=held;held=null;try{const response=await route.fetch();gate.body=await response.json();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}catch(error){errors.push({...meta,error:String(error)});gate.seen.resolve();await route.abort().catch(()=>{});}finally{gate.done.resolve();activeGates.delete(gate);}return;}
    }
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   try{await run({page,context,app,check,frame,deferred});await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'.png')});}
   catch(error){check('Scenario completes',error.message,'completed');const state=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-7000)})).catch(()=>null);await writeFile(join(output,engine+'-'+width+'-'+scenario+'-failure.json'),JSON.stringify({meta,error:error.stack||String(error),state},null,2));await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-failure.png')}).catch(()=>{});}
   finally{for(const gate of activeGates)gate.release.resolve();await writeFile(join(output,'checks-partial.json'),JSON.stringify({checks,errors,unexpectedNetwork,serverRequests},null,2));await context.close();context=null;page=null;}
  }
  await browser.close();browser=null;
 }
 check('No uncaught browser errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 const ok=checks.every(result=>result.pass);await writeFile(join(output,'checks.json'),JSON.stringify({ok,scope:'Compiled Atlas field-note editor and actual local HTTP persistence; delayed discard, overlapping edit/save, failure/retry, denied session preferences and Studio/OPSEC/import save ownership, appearance write ordering and Session report/replay ownership in Chrome/Firefox desktop/narrow',checks,errors,unexpectedNetwork,serverRequests},null,2));assert.equal(ok,true,'Shared UI regressions failed; see checks.json.');console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{await writeFile(join(output,'checks-partial.json'),JSON.stringify({checks,errors,unexpectedNetwork,serverRequests},null,2));for(const gate of activeGates)gate.release.resolve();await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
