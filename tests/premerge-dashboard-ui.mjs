// Compiled dashboard regressions: actual local HTTP/SSE and synthetic pilots.
// No real credentials, ESI requests or browser persistence are used.
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
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-dashboard-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="230"><rect width="320" height="230" fill="#213b47"/><path d="M20 150 160 35 300 150 160 205Z" fill="#97ebce"/></svg>';
const sample=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});
let app,browser,context,page,meta,held=null;
const activeGates=new Set();
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function check(label,actual,expected,extra={}){
 const pass=JSON.stringify(actual)===JSON.stringify(expected);
 checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));
}
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function ready(route){
 await page.goto(app.origin+'/#'+route,{waitUntil:'domcontentloaded',timeout:15000});
 await page.locator('.connection-status.online').waitFor({state:'attached'});
 await page.locator('.page-transition').waitFor();
}
async function imageState(){
 return page.locator('.ship-focus > img').evaluate(element=>({src:element.getAttribute('src'),decoded:element.complete&&element.naturalWidth>0,opacity:getComputedStyle(element).opacity,display:getComputedStyle(element).display}));
}
async function hullRecovery(){
 app.store.saveSnapshot(42,'ship',sample({ship_type_id:587,ship_name:'First hull'}));
 let failed=0,successful=0;
 await context.route('https://images.evetech.net/types/*/render?*',async route=>{
  if(new URL(route.request().url()).pathname==='/types/587/render'){failed++;return route.abort('failed');}
  successful++;return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
 });
 await ready('overview');
 await page.waitForFunction(()=>document.querySelector('.ship-focus > img')?.style.opacity==='0');
 const before=await imageState();
 check('Initial hull image transport failure is observed',failed,1);
 check('Failed hull has no decoded pixels',before.decoded,false);
 // Change real stored telemetry and use the dashboard's normal invalidation.
 app.store.saveSnapshot(42,'ship',sample({ship_type_id:621,ship_name:'Recovered hull'}));
 app.core.changed({characterId:42,resources:['state']});
 await page.waitForFunction(()=>{const image=document.querySelector('.ship-focus > img');return image?.getAttribute('src')?.includes('/types/621/render')&&image.complete&&image.naturalWidth>0;});
 const after=await imageState();
 check('A successfully loaded replacement hull is visible',after.opacity,'1',{before,after});
 check('Replacement uses the new ship telemetry',await page.locator('.ship-caption h3').textContent(),'Caracal');
 await page.getByRole('combobox',{name:'Active character',exact:true}).click();
 await page.getByRole('option',{name:'Dashboard Beta',exact:true}).click();
 await page.waitForFunction(()=>{const image=document.querySelector('.ship-focus > img');return image?.getAttribute('src')?.includes('/types/602/render')&&image.complete&&image.naturalWidth>0;});
 const switched=await imageState();
 check('Pilot switching renders only the selected pilot hull',await page.locator('.ship-caption h3').textContent(),'Kestrel',{switched});
 check('Image failure does not leak into another pilot',switched.opacity,'1');
 check('Both replacement images actually loaded',successful,2);
}
async function deniedStorage(){
 await context.addInitScript(()=>{
  Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Synthetic local storage access denied','SecurityError');}});
 });
 await ready('overview');
 const healthy=await page.evaluate(async()=>{const boot=await(await fetch('/api/bootstrap')).json();return boot.characters.map(pilot=>pilot.id);});
 check('Storage scenario uses a healthy core with connected pilots',healthy,[42,43]);
 check('Unavailable saved-pilot preference falls back to the first pilot',(await page.getByRole('combobox',{name:'Active character',exact:true}).textContent()).trim(),'Dashboard Alpha');
 check('Storage denial does not substitute guest data for connected pilot',await page.locator('.ship-caption h3').textContent(),'Caracal');
}
async function bootstrapRace(){
 app.core.toggle('wallet',true);app.core.toggle('industry',true);
 await ready('modules');
 const wallet=page.getByRole('switch',{name:'Enable Wallet & trade',exact:true});
 const industry=page.getByRole('switch',{name:'Enable Industry & resources',exact:true});
 assert.equal(await wallet.getAttribute('aria-checked'),'true');
 assert.equal(await industry.getAttribute('aria-checked'),'true');
 const gate={seen:deferred(),release:deferred(),done:deferred()};held=gate;activeGates.add(gate);
 await wallet.click();
 await Promise.race([gate.seen.promise,page.waitForTimeout(10000).then(()=>{throw new Error('First module reload did not reach the response gate.');})]);
 assert.ok(gate.body,'The first reload captured a real bootstrap response.');
 assert.equal(gate.body.modules.find(module=>module.id==='wallet').enabled,false);
 assert.equal(gate.body.modules.find(module=>module.id==='industry').enabled,true);
 await industry.click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Enable Industry & resources"]')?.getAttribute('aria-checked')==='false');
 const finished=page.waitForEvent('requestfinished',{predicate:request=>new URL(request.url()).pathname==='/api/bootstrap'});
 gate.release.resolve();await gate.done.promise;await finished;await frame();
 const current=await page.evaluate(async()=>{const boot=await(await fetch('/api/bootstrap')).json();return Object.fromEntries(boot.modules.filter(module=>['wallet','industry'].includes(module.id)).map(module=>[module.id,module.enabled]));});
 check('Both module mutations persist on the real server',current,{wallet:false,industry:false});
 check('An older bootstrap cannot undo a newer displayed module setting',{wallet:await wallet.getAttribute('aria-checked'),industry:await industry.getAttribute('aria-checked')},{wallet:'false',industry:'false'});
}

try{
 const store=openStore(join(dir,'data'));
 try{
  for(const [id,name,type] of [[42,'Dashboard Alpha',621],[43,'Dashboard Beta',602]]){
   store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,name,'[]','synthetic-unusable-token');
   store.saveSnapshot(id,'profile',sample({character_id:id,name}));
   store.saveSnapshot(id,'ship',sample({ship_type_id:type,ship_name:name+' hull'}));
  }
  store.set('names',{587:'Rifter',621:'Caracal',602:'Kestrel'});
 }finally{store.close();}
 const port=Number(process.env.KAIRO_DASHBOARD_TEST_PORT||18638);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
 for(const engine of (process.env.KAIRO_DASHBOARD_BROWSERS||'chromium,firefox').split(',')){
  assert.ok(['chromium','firefox'].includes(engine),'Only supported required browser engines');
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const [scenario,run] of [['hull-recovery',hullRecovery],['denied-storage',deniedStorage],['bootstrap-race',bootstrapRace]]){
   meta={engine,version:browser.version(),width,scenario};held=null;
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);page=await context.newPage();
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin&&url.pathname==='/api/bootstrap'&&held){
     const gate=held;held=null;
     try{const response=await route.fetch();gate.body=await response.json();assert.equal(response.status(),200);gate.seen.resolve();await gate.release.promise;await route.fulfill({response});}
     catch(error){errors.push({...meta,error:String(error)});gate.seen.resolve();await route.abort().catch(()=>{});}
     finally{gate.done.resolve();activeGates.delete(gate);}
     return;
    }
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   try{await run();await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'.png')});}
   catch(error){
    check('Scenario completes',error.message,'completed');
    const state=await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-7000)})).catch(()=>null);
    await writeFile(join(output,engine+'-'+width+'-'+scenario+'-failure.json'),JSON.stringify({meta,error:error.stack||String(error),state},null,2));
    await page.screenshot({path:join(output,engine+'-'+width+'-'+scenario+'-failure.png')}).catch(()=>{});
   }finally{
    for(const gate of activeGates)gate.release.resolve();
    await context.close();context=null;page=null;
   }
  }
  await browser.close();browser=null;
 }
 check('No uncaught browser errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 const ok=checks.every(result=>result.pass);
 await writeFile(join(output,'checks.json'),JSON.stringify({ok,scope:'Actual compiled dashboard and local HTTP/SSE; synthetic pilots, image transport, denied preference storage and delayed bootstrap arrival',checks,errors,unexpectedNetwork,serverRequests},null,2));
 assert.equal(ok,true,'Dashboard regressions failed; see checks.json.');
 console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{
 for(const gate of activeGates)gate.release.resolve();
 await context?.close();await browser?.close();await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
