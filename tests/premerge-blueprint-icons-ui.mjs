// The transport fixture implements the observed CCP variation contract, rather
// than accepting every URL. Exercise actual compiled owners without editing src.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';
import {seedMarketBlueprints,BLUEPRINT_ITEMS} from './helpers/market-blueprint-fixture.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href),dir=await mkdtemp(join(tmpdir(),'kairo-blueprint-icons-'));
const output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';await mkdir(output,{recursive:true});
const checks=[],requests=[],errors=[],unexpectedNetwork=[],serverRequests=[],now=Date.now();
const variants=new Map([...BLUEPRINT_ITEMS.map(({id})=>[id,'bp']),[1403,'icon'],[519,'icon']]);
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#203c49"/><path d="M4 16 16 4 28 16 16 28Z" fill="#97ebce"/></svg>';
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,meta;
function check(label,actual,expected){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected});console.log(JSON.stringify(checks.at(-1)));}
const category=(name,scope=page)=>scope.locator('.market-category-select').filter({has:page.locator('span').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
const tab=name=>page.locator('.markets-module > [data-slot=tabs] > [role=tablist]').getByRole('tab',{name,exact:true}).click();
async function icons(selector,ids,label){
 await page.waitForFunction(({selector,count})=>document.querySelectorAll(selector).length===count,{selector,count:ids.length});
 const rows=[];
 for(let n=0;n<ids.length;n++){
  const icon=page.locator(selector).nth(n);
  await icon.locator('..').scrollIntoViewIfNeeded();
  const element=await icon.elementHandle();
  await page.waitForFunction(i=>window.__typeImageEvents.has(i),element);
  rows.push(await icon.evaluate(i=>{const r=i.getBoundingClientRect(),s=getComputedStyle(i);return {src:i.src,event:window.__typeImageEvents.get(i),complete:i.complete,naturalWidth:i.naturalWidth,width:r.width,height:r.height,visibility:s.visibility,display:s.display,loading:i.loading};}));
  await element.dispose();
 }
 const expectedIds=[...ids].sort((a,b)=>a-b),actualIds=rows.map(r=>Number(new URL(r.src).pathname.split('/')[2])).sort((a,b)=>a-b);
 check(label+' contains the intended real items',actualIds,expectedIds);
 for(const row of rows){
  const id=Number(new URL(row.src).pathname.split('/')[2]);
  check(label+' type '+id+' uses its available resource',row.src,'https://images.evetech.net/types/'+id+'/'+variants.get(id)+'?size=32');
  check(label+' type '+id+' decodes and remains visible',{loaded:row.event==='load'&&row.complete&&row.naturalWidth>0,visible:row.visibility==='visible'&&row.display!=='none',stableBox:row.width>=29&&row.height>=29,lazy:row.loading==='lazy'},{loaded:true,visible:true,stableBox:true,lazy:true});
 }
 return rows;
}
try{
 await seedMarketBlueprints(join(dir,'data'),{now,denyNetwork});
 app=await startKairo({port:18650,streamPort:18651,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 for(const engine of ['chromium','firefox']){
  browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390]){
   meta={engine,version:browser.version(),width};
   context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});context.setDefaultTimeout(10000);
   await context.addInitScript(()=>{window.__typeImageEvents=new WeakMap();for(const event of ['load','error'])document.addEventListener(event,e=>{if(e.target instanceof HTMLImageElement)window.__typeImageEvents.set(e.target,event);},true);});
   page=await context.newPage();page.on('pageerror',error=>errors.push({...meta,error:error.message}));
   const scenarioRequests=[];
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
    if(url.origin==='https://images.evetech.net'){
     const match=url.pathname.match(/^\/types\/(\d+)\/([^/]+)$/);
     if(match){
      const status=variants.get(Number(match[1]))===match[2]&&url.search==='?size=32'?200:400;
      const record={...meta,url:url.href,status};requests.push(record);scenarioRequests.push(record);
      return route.fulfill({status,contentType:status===200?'image/svg+xml':'text/plain',headers:{'Cache-Control':'no-store'},body:status===200?image:'bad category or variation'});
     }
     if(url.pathname.startsWith('/characters/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    }
    unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');
   });
   try{
    await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
    await page.locator('.connection-status.online').waitFor({state:'attached'});
    await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
    await page.getByRole('button',{name:'Expand Blueprints & Reactions',exact:true}).click();
    const branch=category('Blueprints & Reactions').locator('xpath=ancestor::li[1]');
    await branch.getByRole('button',{name:'Expand Ammunition & Charges',exact:true}).click();
    check('Cold blueprint leaf has no earlier type requests',scenarioRequests.length,0);
    await category('Bombs',branch).click();
    await icons('.market-catalogue .item-name img',[27917,27925],'Cold blueprint Bombs before All items');
    await page.locator('.market-item-button').filter({hasText:'Shrapnel Bomb Blueprint'}).click();
    await icons('.market-item-heading .item-name img',[27925],'Selected blueprint detail');
    await page.screenshot({path:join(output,engine+'-'+width+'-blueprint-bombs.png')});
    await category('Drones',branch).click();
    await icons('.market-catalogue .item-name img',[2204],'Blueprint Drones category');
    // Blueprint ancestry also contains a Ship Equipment branch; select the
    // ordinary root's two cached fixtures rather than an ambiguous label.
    await page.getByRole('button',{name:'Ship Equipment 2',exact:true}).click();
    await icons('.market-catalogue .item-name img',[1403,519],'Ordinary category control');
    await page.locator('.market-item-button').filter({has:page.locator('img[src*="/types/1403/"]')}).click();
    await icons('.market-item-heading .item-name img',[1403],'Ordinary selected detail control');
    await page.locator('.market-category-all').first().click();
    await icons('.market-catalogue .item-name img',[1403,519,27917,27925,2204],'Mixed All items');
    await category('Bombs',branch).click();
    await icons('.market-catalogue .item-name img',[27917,27925],'Blueprint category after All items');
    await tab('Hub report');
    await icons('.market-report .item-name img',[1403,519,27917,27925,2204],'Hub report');
    await tab('Import Analyser');
    await icons('.import-card .item-name img',[1403,519],'Ordinary import cards');
    await page.locator('.import-category-tabs').getByRole('tab',{name:/Blueprints & Skills/}).click();
    await icons('.import-card .item-name img',[27917,27925,2204],'Blueprint import cards');
    await page.locator('.import-card-open').filter({hasText:'Shrapnel Bomb Blueprint'}).click();
    await page.locator('.import-detail-dialog').getByRole('button',{name:/Add (anchoring|profiteering) option to plan/}).click();
    await page.locator('.import-detail-dialog').waitFor({state:'detached'});
    await icons('.import-plan .item-name img',[27925],'Draft manifest');
    await page.getByRole('button',{name:'Review & save plan',exact:true}).click();
    await icons('.import-plan-dialog .item-name img',[27925],'Review manifest');
    await page.locator('.import-plan-dialog').getByLabel('Plan name',{exact:true}).fill(engine+' '+width+' blueprint shipment');
    await page.getByRole('button',{name:'Save import plan',exact:true}).click();
    await page.getByRole('button',{name:'Use as draft',exact:true}).waitFor();
    await icons('.import-plan-dialog .item-name img',[27925],'Saved manifest');
    await page.locator('.import-plan-dialog').getByRole('button',{name:'Close',exact:true}).click();
    await page.locator('.import-plan-dialog').waitFor({state:'detached'});
    await page.locator('.import-saved-plans button').filter({hasText:engine+' '+width+' blueprint shipment'}).click();
    await icons('.import-plan-dialog .item-name img',[27925],'Reopened saved manifest');
    await page.screenshot({path:join(output,engine+'-'+width+'-blueprint-manifest.png')});
    check('All type requests use an available variation',scenarioRequests.filter(r=>r.status!==200),[]);
    check('Image work stays bounded without fallback or metadata requests',scenarioRequests.length<=40,true);
   }catch(error){errors.push({...meta,error:error.stack||String(error)});await page.screenshot({path:join(output,engine+'-'+width+'-failure.png')}).catch(()=>{});}
   await context.close();context=null;page=null;
  }
  await browser.close();browser=null;
 }
 check('Cached views make no external server requests',serverRequests,[]);
 check('No provider metadata or unexpected browser requests',unexpectedNetwork,[]);
 check('All four browser/viewport workflows complete without exceptions',errors,[]);
 assert.ok(checks.length>0&&checks.every(c=>c.pass),'Blueprint image contract checks failed');
}finally{
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:checks.length>0&&checks.every(c=>c.pass)&&errors.length===0,scope:'Compiled Markets/import UI with real cached SQLite; intercepted transport matches observed blueprint bp and ordinary icon availability. No live provider availability claim.',checks,requests,errors,unexpectedNetwork,serverRequests},null,2));
 await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(JSON.stringify({checks:checks.length,failed:checks.filter(c=>!c.pass).length,errors:errors.length,output}));
}
