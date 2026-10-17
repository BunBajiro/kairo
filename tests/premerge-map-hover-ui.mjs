// Real compiled Maps hover regressions. Synthetic local maps, real pointer input,
// and independently measured tooltip geometry in both supported browser engines.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {atlasHover} from './premerge-atlas-hover-scenarios.mjs';
const modulePath=process.env.KAIRO_PLAYWRIGHT_MODULE;
if(!modulePath||!isAbsolute(modulePath))throw new Error('Set KAIRO_PLAYWRIGHT_MODULE to the isolated Playwright index.mjs absolute path.');
const engines=await import(pathToFileURL(modulePath).href);
// Keep evidence outside the disposable runtime/profile directory: finally removes
// test state, while KAIRO_BROWSER_OUTPUT (or the sibling default) retains artifacts.
const dir=await mkdtemp(join(tmpdir(),'kairo-premerge-map-hover-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-results';
await mkdir(output,{recursive:true});
const checks=[],errors=[],unexpectedNetwork=[],serverRequests=[],requests=[],maps=[],now=Date.now();
const denyNetwork=async url=>{serverRequests.push(String(url));throw new Error('Unexpected external request: '+url);};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#97ebce"/></svg>';
let app,browser,context,page,meta,csrf,cookie;
function check(label,actual,expected,extra={}){const pass=JSON.stringify(actual)===JSON.stringify(expected);checks.push({...meta,label,pass,actual,expected,...extra});console.log(JSON.stringify(checks.at(-1)));}
async function frame(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function api(path,method='GET',body){const response=await fetch(app.origin+'/api'+path,{method,headers:{'content-type':'application/json',Origin:app.origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'x-kairo-csrf':csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
async function screenshot(name){await page.screenshot({path:join(output,`${meta.engine}-${meta.width}-${meta.scenario}-${name}.png`)});}
async function rects(){return page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {map:box(document.querySelector('.jspace-map-viewport')),hint:box(document.querySelector('.jspace-map-hint')),window:{width:innerWidth,height:innerHeight}};});}
async function hoverCheck(point,label){
 await page.mouse.move(point.x,point.y);await page.locator('.jspace-map-hint').waitFor();await frame();
 const bounds=await rects(),{map,hint}=bounds;
 // Placement is assessed in the visible map's CSS coordinate system, regardless
 // of its page offset, pan or zoom. These are the existing 15px/12px paddings.
 const clamp=(value,min,max)=>Math.max(min,Math.min(Math.max(min,max),value));
 const local={x:point.x-map.x,y:point.y-map.y};
 const preferred=local.x+15+hint.width<=map.width-12?local.x+15:local.x-hint.width-15;
 const wanted={x:map.x+clamp(preferred,12,map.width-hint.width-12),y:map.y+clamp(local.y+12,12,map.height-hint.height-12)};
 check(label+' follows the pointer with the existing padded/clamped placement',Math.abs(hint.x-wanted.x)<=3&&Math.abs(hint.y-wanted.y)<=3,true,{point,bounds,wanted});
 check(label+' stays inside the visible map',hint.x>=map.x+10&&hint.right<=map.right-10&&hint.y>=map.y+10&&hint.bottom<=map.bottom-10,true,{bounds});
 return bounds;
}
async function exposedPoints(selector){return page.locator(selector).evaluate(path=>{const matrix=path.getScreenCTM(),length=path.getTotalLength(),points=[];for(let i=8;i<=92;i+=4){const p=path.getPointAtLength(length*i/100).matrixTransform(matrix);if(p.x>0&&p.y>0&&p.x<innerWidth&&p.y<innerHeight&&document.elementFromPoint(p.x,p.y)===path)points.push({x:p.x,y:p.y,fraction:i/100});}if(points.length<2)throw new Error('Expected two exposed points along the rendered connection: '+JSON.stringify(points));return [points[0],points.at(-1)];});}
async function mapsHover(fixture){
 await page.goto(app.origin+'/#universe-jspace',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Open map '+fixture.name,exact:true}).click();
 await page.locator('.jspace-map-viewport').waitFor();
 await page.getByRole('button',{name:'Fit chain',exact:true}).click();
 await page.waitForTimeout(350);
 const selector=`[data-connection-id="${fixture.edge.id}"] .jspace-edge-hit`,path=page.locator(selector);
 await page.locator('.jspace-map-viewport').evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await frame();
 const points=await exposedPoints(selector),requestStart=requests.length;
 check('Fixture exposes two distinct positions along the same '+fixture.kind+' connection',Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)>25,true,{points});
 const first=await hoverCheck(points[0],'First '+fixture.kind+' segment position');await screenshot('first-position');
 const second=await hoverCheck(points[1],'Second '+fixture.kind+' segment position');await screenshot('second-position');
 check('Same connection tooltip moves while its content stays unchanged',Math.hypot(first.hint.x-second.hint.x,first.hint.y-second.hint.y)>10,true,{first:first.hint,second:second.hint});
 check('Hover explains the actual connection kind',(await page.locator('.jspace-map-hint').innerText()).includes(fixture.kind==='gate'?'Stargate':fixture.kind==='ansiblex'?'Ansiblex':'Confirmed'),true);
 // Count layout/geometry queries made by the application during a same-edge
 // pointer sweep. Test sample discovery and tooltip measurements happen outside.
 await page.evaluate(()=>{window.__hoverGeometry={node:0,path:0};window.__hoverRect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){if(this.matches?.('.jspace-node'))window.__hoverGeometry.node++;if(this.matches?.('.jspace-edge-hit'))window.__hoverGeometry.path++;return window.__hoverRect.apply(this,args);};});
 try{for(let i=0;i<12;i++){const p=points[i%2];await page.mouse.move(p.x,p.y);await frame();}check('Same-edge hover does not measure every system card or SVG path',await page.evaluate(()=>window.__hoverGeometry),{node:0,path:0});}
 finally{await page.evaluate(()=>{Element.prototype.getBoundingClientRect=window.__hoverRect;});}
 check('Pointer inspection adds no map reads or writes',requests.slice(requestStart).filter(request=>request.path.includes('/universe/jspace/maps/')),[]);
 await page.mouse.move(1,1);await frame();check('Leaving the map dismisses pointer context',await page.locator('.jspace-map-hint').count(),0);
 await page.mouse.click(points[0].x,points[0].y);await frame();
 check('Click still selects the correct '+fixture.kind+' connection',await page.locator(`[data-connection-id="${fixture.edge.id}"].is-selected`).count(),1);
 await page.mouse.move(1,1);await frame();check('Selected connection inspection survives pointer leave',await page.locator('[aria-label="Selected map context"]').count(),1);
 await page.getByRole('button',{name:'Close selected map context',exact:true}).click();
 const focus=fixture.kind==='wormhole'?page.locator(`[data-connection-label="${fixture.edge.id}"]`):path;
 await focus.focus();await page.locator('.jspace-map-hint').waitFor();
 check('Keyboard focus retains a readable connection hint',await page.locator('.jspace-map-hint').isVisible(),true);
 await focus.press('Enter');await frame();check('Keyboard Enter selects the correct connection',await page.locator(`[data-connection-id="${fixture.edge.id}"].is-selected`).count(),1);
 await page.locator('.jspace-map-viewport').focus();await page.keyboard.press('Escape');await frame();check('Escape clears map inspection',await page.locator('[aria-label="Selected map context"],.jspace-map-hint').count(),0);
 if(fixture.kind==='wormhole'){
  await page.getByRole('button',{name:'Fit chain',exact:true}).click();await page.waitForTimeout(350);await page.locator('.jspace-map-viewport').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  const label=page.locator(`[data-connection-label="${fixture.edge.id}"]`),box=await label.boundingBox();
  if(box&&box.x>0&&box.y>0&&box.x+box.width<Math.max(meta.width,390)){
   await hoverCheck({x:box.x+box.width*.25,y:box.y+box.height*.3},'Wormhole label pointer');
   await hoverCheck({x:box.x+box.width*.75,y:box.y+box.height*.7},'Moving over the same wormhole label');
  }
 }
 // Real control zoom changes the camera; scrolling changes its client offset.
 await page.mouse.move(1,1);await page.getByRole('button',{name:'Zoom in on chain',exact:true}).click();await page.waitForTimeout(350);
 await page.locator('.jspace-map-viewport').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>window.scrollBy(0,35));await frame();
 const zoomPoints=await exposedPoints(selector);await hoverCheck(zoomPoints[0],'Zoomed connection with page offset');await hoverCheck(zoomPoints[1],'Zoomed connection near opposite map edge');await screenshot('zoomed-offset');
 await page.mouse.move(1,1);await page.locator('.jspace-map-viewport').focus();await page.keyboard.press('Home');await page.waitForTimeout(350);check('Keyboard Home preserves fit control',await path.count(),1);
}
try{
 const store=openStore(join(dir,'data'));
 try{store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Map Hover Alpha','[]','synthetic-unusable-token');store.saveSnapshot(42,'profile',{status:'ready',data:{character_id:42,name:'Map Hover Alpha'},updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});}finally{store.close();}
 const port=Number(process.env.KAIRO_MAP_HOVER_TEST_PORT||18650);
 app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyNetwork,datasets:{fetcher:denyNetwork},universe:{operations:{noSync:true,fetcher:denyNetwork},feeds:{noSync:true,fetcher:denyNetwork}}});
 cookie=(await fetch(app.origin)).headers.get('set-cookie').split(';')[0];
 csrf=(await api('/bootstrap')).csrf;
 const atlas=await api('/universe/static'),jita=atlas.systems.find(system=>system.name==='Jita'),gate=atlas.gates.find(edge=>edge.from_system_id===jita.system_id||edge.to_system_id===jita.system_id),other=gate.from_system_id===jita.system_id?gate.to_system_id:gate.from_system_id;
 for(const kind of ['gate','ansiblex','wormhole']){
  let map=await api('/universe/jspace/maps?character=42','POST',{name:'Hover '+kind,pilot_ids:[42]});
  for(const node of [{system_id:jita.system_id,x:0,y:0},{system_id:other,x:1000,y:550}])map=await api(`/universe/jspace/maps/${map.id}/commands?character=42`,'POST',{revision:map.revision,op:'node.save',node});
  map=await api(`/universe/jspace/maps/${map.id}/commands?character=42`,'POST',{revision:map.revision,op:'connection.save',connection:{kind,from_system_id:jita.system_id,to_system_id:other,from_port:'right',to_port:'left',...(kind==='gate'?{}:{confirmed:true,accessible:true}),...(kind==='wormhole'?{duration_hours:16,mass:'stable',wh_type:'K162'}:{})}});
  maps.push({id:map.id,name:map.name,kind,edge:map.connections[0]});
 }
 for(const engine of (process.env.KAIRO_MAP_HOVER_BROWSERS||'chromium,firefox').split(',')){
  assert.ok(['chromium','firefox'].includes(engine));browser=await engines[engine].launch({headless:true,timeout:20000,...(engine==='chromium'&&process.env.KAIRO_CHROME_PATH?{executablePath:process.env.KAIRO_CHROME_PATH}:{})});
  for(const width of [1600,390])for(const fixture of [...maps,{kind:'atlas'}]){
   meta={engine,version:browser.version(),width,scenario:'maps-'+fixture.kind};context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block',reducedMotion:'reduce'});context.setDefaultTimeout(10000);page=await context.newPage();
   for(const method of ['waitForResponse','waitForRequest','waitForEvent']){const original=page[method].bind(page);page[method]=(...args)=>{const promise=original(...args);promise.catch(()=>{});return promise;};}
   page.on('pageerror',error=>errors.push({...meta,error:error.message}));page.on('request',request=>{const url=new URL(request.url());if(url.origin===app.origin&&url.pathname.startsWith('/api/'))requests.push({...meta,path:url.pathname,method:request.method()});});
   await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===app.origin||url.origin===app.streamOrigin)return route.continue();if(url.origin==='https://images.evetech.net')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});unexpectedNetwork.push({...meta,url:url.href});return route.abort('blockedbyclient');});
   try{if(fixture.kind==='atlas')await atlasHover({page,context,app,check,frame,api,output,meta});else await mapsHover(fixture);}
   catch(error){check('Scenario completes',error.message,'completed');await writeFile(join(output,`${engine}-${width}-${fixture.kind}-failure.json`),JSON.stringify({meta,error:error.stack||String(error),state:await page.evaluate(()=>({url:location.href,body:document.body.innerText.slice(-8000)})).catch(()=>null)},null,2));await screenshot('failure').catch(()=>{});}
   finally{await writeFile(join(output,'checks-partial.json'),JSON.stringify({checks,errors,unexpectedNetwork,serverRequests,requests},null,2));await context.close();context=null;page=null;}
  }
  await browser.close();browser=null;
 }
 check('No uncaught browser errors',errors,[]);check('No unexpected browser requests',unexpectedNetwork,[]);check('No external server requests',serverRequests,[]);
 const ok=checks.every(result=>result.pass);await writeFile(join(output,'checks.json'),JSON.stringify({ok,scope:'Compiled Maps pointer hover for all connection kinds, same-link motion, page offsets and zoom, clipping, dismissal, click selection and keyboard controls in Chrome/Firefox at1600/390',checks,errors,unexpectedNetwork,serverRequests,requests},null,2));assert.equal(ok,true,'Map hover regressions failed; see checks.json.');console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{await writeFile(join(output,'checks-partial.json'),JSON.stringify({checks,errors,unexpectedNetwork,serverRequests,requests},null,2));await context?.close();await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
