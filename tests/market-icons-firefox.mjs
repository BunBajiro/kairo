// Browser-specific cold-category regression. Playwright is installed separately
// by CI; it is deliberately not an application dependency.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startKairo} from '../server/index.mjs';
import {seedMarketIcons} from './helpers/market-icon-fixture.mjs';

const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const {firefox}=await import(pathToFileURL(modulePath).href);
const dir=await mkdtemp(join(tmpdir(),'kairo-market-icons-firefox-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const now=Date.now(),checks=[],snapshots=[],errors=[],violations=[],requests=[],serverRequests=[],unexpectedNetwork=[];
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#203c49"/><path d="M4 16 16 4 28 16 16 28Z" fill="#97ebce"/></svg>';
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
let app,browser,context,page,releaseImages=()=>{};

async function snapshot(label,width){
 const state=await page.locator('.market-catalogue .item-name img').evaluateAll(images=>({scrollY,viewport:{width:innerWidth,height:innerHeight},rows:images.map(i=>{
  const r=i.getBoundingClientRect(),s=getComputedStyle(i);
  return {src:i.src,width:r.width,height:r.height,top:r.top,bottom:r.bottom,naturalWidth:i.naturalWidth,complete:i.complete,loading:i.loading,visibility:s.visibility,display:s.display,flexShrink:s.flexShrink,inViewport:r.bottom>0&&r.top<innerHeight};
 })}));
 const row={label,width,...state,typeRequests:requests.filter(r=>r.width===width&&r.url.includes('/types/'))};
 snapshots.push(row);console.log(JSON.stringify(row));return row;
}
async function measure(label,width,count,{release=false}={}){
 await page.waitForFunction(n=>document.querySelectorAll('.market-catalogue .item-name img').length===n,count,{timeout:10000});
 const initial=await snapshot(label+' before image wait',width);
 for(const row of initial.rows){if(row.width<29||row.height<29)violations.push(label+' '+width+': unloaded icon has no stable box: '+row.width+'×'+row.height);}
 if(release)releaseImages();
 let loadError=null;
 try{await page.waitForFunction(()=>Array.from(document.querySelectorAll('.market-catalogue .item-name img')).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:5000});}
 catch(error){loadError=error.message;}
 const result=await snapshot(label+' after image wait',width);
 // No scrollIntoView, viewport change or image-src mutation occurs in measure.
 // Retain failures until the All items comparison has also been captured.
 const failures=[];
 if(loadError)failures.push('Images did not decode without additional scrolling');
 for(const row of result.rows){
  if(!row.complete||row.naturalWidth<=0)failures.push('Image is not decoded: '+row.src);
  if(row.width<29||row.height<29)failures.push('Icon is compressed: '+row.width+'×'+row.height);
  if(row.visibility!=='visible'||row.display==='none')failures.push('Icon is hidden');
 }
 checks.push({label,width,pass:failures.length===0,failures,loadError,rows:result.rows});
 violations.push(...failures.map(f=>label+' '+width+': '+f));
 await page.screenshot({path:join(output,'firefox-'+width+'-'+label.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.png')});
}

try{
 await seedMarketIcons(join(dir,'data'),{now,denyNetwork});
 app=await startKairo({port:18632,streamPort:18633,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,markets:{now:()=>now,historySource:'esi',historyFetcher:denyNetwork},datasets:{fetcher:denyNetwork}});
 browser=await firefox.launch({headless:true,timeout:20000});
 console.log(JSON.stringify({browser:'firefox',version:browser.version()}));
 for(const width of [1600]){
  // An isolated context has no previous icon cache or page state.
  context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block'});
  context.setDefaultTimeout(10000);page=await context.newPage();
  page.on('pageerror',error=>errors.push({width,error:error.message}));
  let held=true;const imageGate=new Promise(resolve=>{releaseImages=()=>{held=false;resolve();};});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();
   if(url.origin==='https://images.evetech.net'){
    requests.push({width,url:url.href});
    if(held&&url.pathname.startsWith('/types/'))await imageGate;
    return route.fulfill({status:200,contentType:'image/svg+xml',headers:{'Cache-Control':'no-store'},body:image});
   }
   unexpectedNetwork.push({width,url:url.href});return route.abort('blockedbyclient');
  });
  await page.goto(app.origin+'/#markets',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.connection-status.online').waitFor();
  await page.locator('.market-hub').filter({has:page.locator('strong',{hasText:'Amarr'})}).click();
  await page.waitForFunction(()=>document.querySelector('.market-hub.active strong')?.textContent==='Amarr');
  // Disclosure buttons only: selecting a parent would load both fixture icons
  // and incorrectly turn this into a warm-cache leaf test.
  await page.getByRole('button',{name:'Expand Ship Equipment',exact:true}).click();
  await page.getByRole('button',{name:'Expand Propulsion',exact:true}).click();
  await page.getByRole('button',{name:'Expand Propulsion Upgrades',exact:true}).click();
  assert.equal(requests.some(r=>r.width===width&&r.url.includes('/types/')),false,'No icons were requested before directly selecting the leaf');
  const leaf=page.locator('.market-category-select').filter({hasText:'Inertial Stabilizers'});
  await leaf.click();
  await measure('Direct leaf before All items',width,1,{release:true});
  assert.match(await page.locator('.market-catalogue .item-name img').getAttribute('src'),/\/types\/1403\/icon/);
  await page.locator('.market-category-all').first().click();
  await measure('All items after direct leaf',width,2);
  await leaf.click();
  await measure('Leaf after All items',width,1);
  await context.close();context=null;page=null;
 }
 assert.deepEqual(errors,[],'No uncaught Firefox exceptions');
 assert.deepEqual(unexpectedNetwork,[],'No unhandled browser external requests');
 assert.deepEqual(serverRequests,[],'Cached market views issue no external server requests');
 assert.deepEqual(violations,[],'Firefox icons load visibly when entering a category before All items');
 await writeFile(join(output,'checks.json'),JSON.stringify({ok:true,browser:'firefox',version:browser.version(),scope:'Actual compiled market category views; synthetic SQLite and intercepted image transport',checks,snapshots,requests},null,2));
 console.log(JSON.stringify({ok:true,browser:'firefox',checks:checks.length,output}));
}catch(error){
 releaseImages();
 const state=page?await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-6000)})).catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),checks,snapshots,requests,errors,violations,unexpectedNetwork,serverRequests,state},null,2));
 if(page)await page.screenshot({path:join(output,'firefox-failure.png')}).catch(()=>{});
 throw error;
}finally{
 releaseImages();await context?.close();await browser?.close();await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
