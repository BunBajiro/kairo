// Fourth-pass compiled shared UI ownership and native OBS protocol regressions.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {goalCreateOwnership} from './premerge-goal-create-scenarios.mjs';
import {obsChoiceName} from './premerge-obs-choice-scenarios.mjs';
import {sessionDialogOwnership} from './premerge-session-dialog-scenarios.mjs';
import {clientIdNavigationOwnership,pollingNavigationOwnership} from './premerge-core-settings-scenarios.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-pass4-shared-'));
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
let app,browser,context,page,meta;
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function check(label,actual,expected,extra={}){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));}
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function artifact(name){await writeFile(join(output,name),JSON.stringify({ok:checks.length>0&&checks.every(c=>c.pass),scope:'Actual compiled Goals create/editor ownership, OBS scene/audio/filter names, Session dialog/replay cancellation and ClientID/polling saves across navigation; Chrome/Firefox at desktop/narrow widths, real local HTTP and disposable SQLite.',checks,errors,unexpectedNetwork,serverRequests},null,2));}
try{
 const store=openStore(join(dir,'data'));
 try{store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Fourth-pass Shared Alpha','[]','synthetic-unusable-token');store.saveSnapshot(42,'profile',{status:'ready',data:{character_id:42,name:'Fourth-pass Shared Alpha'},updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});}finally{store.close();}
 const port=Number(process.env.KAIRO_PASS4_SHARED_TEST_PORT||18670);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const [scenario,run] of [['goal-create-ownership',goalCreateOwnership],['obs-choice-name',obsChoiceName],['session-dialog-ownership',sessionDialogOwnership],['client-id-navigation',clientIdNavigationOwnership],['polling-navigation',pollingNavigationOwnership]]){
   meta={engine,version:browser.version(),width,scenario};
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();
   for(const method of ['waitForResponse','waitForRequest','waitForEvent']){const original=page[method].bind(page);page[method]=(...args)=>{const promise=original(...args);promise.catch(()=>{});return promise;};}
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');});
   try{await run({page,context,app,check,frame,deferred});await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'.png')});}
   catch(error){check('Scenario completes',error.message,'completed');const state=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-7000)})).catch(()=>null);await writeFile(join(output,engine+'-'+width+'-'+scenario+'-failure.json'),JSON.stringify({meta,error:error.stack||String(error),state},null,2));await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-failure.png')}).catch(()=>{});}
   finally{await artifact('checks-partial.json');await context.close();context=null;page=null;}
  }
  await browser.close();browser=null;
 }
 check('No uncaught browser errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 await artifact('checks.json');assert.ok(checks.every(c=>c.pass),'Fourth-pass shared UI regressions failed; see checks.json.');
}finally{await artifact('checks-partial.json');await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass).length,output}));}
