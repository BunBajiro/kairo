// Final-audit compiled UI probes. Each scenario owns a fresh disposable runtime,
// browser context and SQLite database; no live EVE account or network is used.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {opsecManualDraftIsolation,studioSavedNavigation,studioAcceptedOwnership} from './final-audit-stream-scenarios.mjs';
import {importSettingsNavigationOwnership,importSettingsFailedFirstOwnership} from './final-audit-import-scenarios.mjs';
import {tacticalScenarios,landmarkCategoryScenario} from './final-audit-tactical-scenarios.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-final-audit-ui-'));
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],completed=[];
const scenarios=[['opsec-manual-draft',opsecManualDraftIsolation],['studio-saved-navigation',studioSavedNavigation],['studio-accepted-owner',studioAcceptedOwnership],['imports-navigation',importSettingsNavigationOwnership],['imports-failed-first',importSettingsFailedFirstOwnership],['tactical-ownership',tacticalScenarios],['landmark-category',landmarkCategoryScenario]];
const selected=process.env.KAIRO_FINAL_AUDIT_SCENARIOS?.split(',');
if(selected)for(const name of selected)assert.ok(scenarios.some(([id])=>id===name),'Unknown final-audit scenario: '+name);
const chosen=scenarios.filter(([name])=>!selected||selected.includes(name));
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
let app,browser,context,page,meta;
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function check(label,actual,expected,extra={}){const pass=isDeepStrictEqual(actual,expected);checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));}
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function artifact(name,finished=false){await writeFile(join(output,name),JSON.stringify({ok:finished&&completed.length===chosen.length*4&&checks.every(c=>c.pass),finished,scope:'Compiled OPSEC manual/draft isolation, Studio saved navigation, import settings save ownership and tactical-window ownership. Fresh disposable actual HTTP/SQLite owner per scenario, Chrome/Firefox at 1600/390 widths; no live EVE or OBS.',expectedScenarios:chosen.length*4,completed,checks,errors,unexpectedNetwork,serverRequests},null,2));}
async function stopScenario(){await context?.close();context=null;page=null;await app?.close();app=null;}
try{
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const [scenario,run] of chosen){
   meta={engine,version:browser.version(),width,scenario};
   const dataDir=join(dir,engine+'-'+width+'-'+scenario),store=openStore(dataDir),now=Date.now();
   try{for(const [id,name] of [[42,'Audit Alpha'],[43,'Audit Beta'],[44,'Audit Gamma']]){
    store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,name,'[]','synthetic-unusable-token');
    store.saveSnapshot(id,'profile',{status:'ready',data:{character_id:id,name},updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});
   }}finally{store.close();}
   const denyNetwork=async url=>{serverRequests.push({...meta,url:String(url)});throw new Error('Unexpected external request: '+url);};
   const port=Number(process.env.KAIRO_FINAL_AUDIT_TEST_PORT||18780);
   app=await startKairo({port,streamPort:port+1,dataDir,noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();
   for(const method of ['waitForResponse','waitForRequest','waitForEvent']){const original=page[method].bind(page);page[method]=(...args)=>{const promise=original(...args);promise.catch(()=>{});return promise;};}
   context.on('page',opened=>opened.on('pageerror',error=>errors.push({...meta,error:error.message})));
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');});
   try{await run({page,context,app,check,frame,deferred,output,meta});completed.push({...meta});await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'.png')});}
   catch(error){check('Scenario completes',error.message,'completed');const state=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-7000)})).catch(()=>null);await writeFile(join(output,engine+'-'+width+'-'+scenario+'-failure.json'),JSON.stringify({meta,error:error.stack||String(error),state},null,2));await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-failure.png')}).catch(()=>{});}
   finally{await artifact('checks-partial.json');await stopScenario();}
  }
  await browser.close();browser=null;
 }
 check('Every selected scenario completed',completed.length,chosen.length*4);
 check('No uncaught browser errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 await artifact('checks.json',true);assert.ok(checks.every(c=>c.pass),'Final-audit UI regressions failed; see checks.json.');
}finally{await artifact('checks-partial.json');await stopScenario();await browser?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass).length,completed:completed.length,output}));}
