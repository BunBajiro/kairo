// Browser acceptance checks for the compiled Universe module. Synthetic local
// data only; Node 24 and Chrome's DevTools protocol, without browser dependencies.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openStore} from '../server/store.mjs';
import {startKairo} from '../server/index.mjs';
import {projectKnownSystems} from '../components/kairo/universe-map-math.mjs';

const chrome=process.env.KAIRO_CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
if(!chrome)throw new Error('Chrome is required for the browser smoke test. Set KAIRO_CHROME_PATH.');
const dir=await mkdtemp(join(tmpdir(),'kairo-universe-ui-')),output=process.env.KAIRO_BROWSER_OUTPUT||dir+'-screenshots';
await mkdir(output,{recursive:true});
let app,proc,ws;const pending=new Map(),errors=[],checks=[],renderChecks=[],typeChecks=[],contrastChecks=[],motionChecks=[],mapLayouts=[],paletteChecks=[],territoryChecks=[];let sequence=0;
const empireColours={500001:'#4f88c6',500004:'#3da891',500003:'#c7a44b',500002:'#b86b4b'};
const externalCalls=[];
const appOptions={port:Number(process.env.KAIRO_UNIVERSE_TEST_PORT||18590),streamPort:Number(process.env.KAIRO_UNIVERSE_TEST_PORT||18590)+1,dataDir:join(dir,'data'),noSync:true,fetcher:async url=>{externalCalls.push(String(url));throw new Error('External ESI access is disabled in this synthetic browser test');}};
function call(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){let r;try{r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});}catch(error){throw new Error(error.message+'; expression: '+expression.slice(0,500));}if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
async function waitFor(expression){for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Condition not met: '+expression);}
async function clickElement(expression){
 await waitFor('!!('+expression+')');
 const point=await evaluate(`(async()=>{
  const e=(${expression});e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  let previous,stable=0;
  for(let frame=0;frame<180;frame++){
   await new Promise(requestAnimationFrame);
   const r=e.getBoundingClientRect(),point={x:r.x+r.width/2,y:r.y+r.height/2},hit=document.elementFromPoint(point.x,point.y);
   const ready=e.isConnected&&!e.disabled&&r.width>0&&r.height>0&&e.contains(hit);
   stable=ready&&previous&&Math.abs(point.x-previous.x)<.25&&Math.abs(point.y-previous.y)<.25?stable+1:0;
   if(stable>=3)return point;previous=point;
  }
  throw new Error('Click target did not become stable and unobstructed');
 })()`);
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
}
const element=selector=>'document.querySelector('+JSON.stringify(selector)+')';
async function click(selector){await clickElement(element(selector));}
async function button(text,scope='.universe-module'){await clickElement(`Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(e=>e.textContent.trim()===${JSON.stringify(text)})`);}
async function fill(selector,text){await click(selector);await call('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65});await call('Input.insertText',{text});}
async function choose(label,text){
 await click('[aria-label='+JSON.stringify(label)+']');
 await clickElement(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`);
}
async function preset(name){
 const open=await evaluate("!!document.querySelector('[aria-label=\"Map view\"]')");
 if(!open)await button('Layers & views');
 await choose('Map view',name);
 if(!open)await click('[aria-label="Close layers"]');
}
async function space(name){await clickElement(`Array.from(document.querySelectorAll('[aria-label="Universe space"] [role="tab"]')).find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(name)})`);}
async function screenshot(name){await evaluate('document.fonts.ready');await delay(500);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
async function api(path,method='GET',body){
 return evaluate(`(async()=>{const boot=await(await fetch('/api/bootstrap')).json();const response=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'content-type':'application/json','x-kairo-csrf':boot.csrf},${body===undefined?'':'body:'+JSON.stringify(JSON.stringify(body))+','}});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data));return data;})()`);
}
async function viewport(width,height=1050){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);}
async function key(key,code,windowsVirtualKeyCode,text=''){
 await call('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode,text,unmodifiedText:text});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
}
async function search(name){await fill('[aria-label="Find a solar system"]',name);await key('Enter','Enter',13,'\r');await waitFor(`document.querySelector('.universe-system-title h3')?.textContent===${JSON.stringify(name)}`);}
async function canvasHash(){return evaluate(`(()=>{const bytes=document.querySelector('.universe-module canvas').toDataURL();let hash=2166136261;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes.charCodeAt(i),16777619);return hash>>>0;})()`);}
async function disclosure(label){await clickElement(`Array.from(document.querySelectorAll('.universe-disclosure summary')).find(e=>e.textContent.startsWith(${JSON.stringify(label)}))`);}
async function checkLabel(label,scope='.universe-module'){await clickElement(`Array.from(document.querySelectorAll(${JSON.stringify(scope+' label')})).find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input[type=checkbox]')`);}
const connection=label=>`Array.from(document.querySelectorAll('.universe-connection-card')).find(e=>e.querySelector(':scope > p')?.textContent===${JSON.stringify(label)})`;
async function layout(label,selector='.universe-module'){
 const bounds=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,page:document.documentElement.scrollWidth,content:e.scrollWidth,client:e.clientWidth};})()`);
 assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.page<=bounds.width+1&&bounds.content<=bounds.client+1,label+': Universe fits horizontally '+JSON.stringify(bounds));
 checks.push(label);
}
async function readability(label,selectors){
 const sizes=await evaluate(`(()=>{const selectors=${JSON.stringify(selectors)};return selectors.map(([selector,minimum])=>{const elements=Array.from(document.querySelectorAll(selector));return {selector,minimum,count:elements.length,sizes:elements.map(e=>parseFloat(getComputedStyle(e).fontSize))};});})()`);
 for(const item of sizes){assert.ok(item.count,label+': expected readable content '+item.selector);assert.ok(item.sizes.every(size=>size>=item.minimum),label+': text size '+JSON.stringify(item));}
 typeChecks.push({label,sizes});
}
async function contrast(label,selectors){
 const results=await evaluate(`(()=>{
  const context=document.createElement('canvas').getContext('2d');context.canvas.width=1;context.canvas.height=1;
  const rgba=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data).map((v,i)=>i===3?v/255:v);};
  const composite=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3])).concat(1);
  const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  return ${JSON.stringify(selectors)}.flatMap(selector=>Array.from(document.querySelectorAll(selector)).filter(e=>e.getClientRects().length).map(element=>{
   let background=[255,255,255,1];const lineage=[];for(let e=element;e;e=e.parentElement)lineage.unshift(e);
   for(const e of lineage)background=composite(rgba(getComputedStyle(e).backgroundColor),background);
   const foreground=composite(rgba(getComputedStyle(element).color),background),a=luminance(foreground),b=luminance(background);
   return {selector,text:element.textContent.trim().slice(0,70),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  }));
 })()`);
 assert.ok(results.length,label+': expected readable text');
 for(const item of results)assert.ok(item.ratio>=4.5,label+': text meets 4.5:1 contrast against composed solid background '+JSON.stringify(item));
 contrastChecks.push({label,results});
}
async function mapFirstLayout(label){
 await evaluate("window.scrollTo({top:0,behavior:'instant'})");await delay(100);
 const value=await evaluate("(()=>{const map=document.querySelector('.universe-module canvas').getBoundingClientRect();return {top:map.top,bottom:map.bottom,width:map.width,height:map.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()");
 assert.ok(value.top>=0&&value.top<=400,label+': map begins within the first400 desktop pixels '+JSON.stringify(value));
 assert.ok(value.height>=450&&value.width>=700,label+': map remains the dominant useful workspace '+JSON.stringify(value));
 mapLayouts.push({label,...value});checks.push(label+' puts the map within the first400px');
}
async function navigationMotion(){
 await click('[aria-label="Fit map"]');await delay(900);
 await evaluate(`(()=>{window.__motion={draws:0,points:[]};window.__motionOriginals={clearRect:CanvasRenderingContext2D.prototype.clearRect,fillText:CanvasRenderingContext2D.prototype.fillText};CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('.universe-module'))window.__motion.draws++;return window.__motionOriginals.clearRect.apply(this,args);};CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(this.canvas.closest('.universe-module')&&text==='Jita')window.__motion.points.push({x,y,at:performance.now()});return window.__motionOriginals.fillText.call(this,text,x,y,...args);};})()`);
 const reset=()=>evaluate('window.__motion={draws:0,points:[]}');
 const capture=async(label,minimum=3,maximum=Infinity)=>{
  await delay(1100);const sample=await evaluate('window.__motion'),positions=new Set(sample.points.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size,spanMs=sample.points.length?sample.points.at(-1).at-sample.points[0].at:0;
  assert.ok(positions>=minimum&&positions<=maximum,label+': expected camera positions '+JSON.stringify({positions,draws:sample.draws}));
  if(minimum>=3)assert.ok(spanMs>=150,label+': intermediate positions are painted over time, not synchronous snaps');
  const before=sample.draws;await delay(250);assert.equal(await evaluate('window.__motion.draws'),before,label+': animation ends without a continuing canvas loop');
  motionChecks.push({label,positions,samples:sample.points.length,spanMs,draws:sample.draws});
 };
 try{
  await click('[aria-label="Zoom in"]');await capture('Smooth button zoom');
  await reset();await click('[aria-label="Focus selected system"]');await capture('Smooth selected-system focus');
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(50);
  await reset();await click('[aria-label="Zoom in"]');await capture('Reduced-motion zoom',1,2);
  assert.equal(await evaluate("document.querySelector('.universe-module').getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect.getTiming().duration>0).length"),0,'Reduced motion disables decorative and acquisition animations');
  await call('Emulation.setEmulatedMedia',{features:[]});await delay(50);
  await reset();await click('[aria-label="Zoom out"]');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))");
  await delay(100);const hiddenDraws=await evaluate('window.__motion.draws');await delay(400);
  assert.equal(await evaluate('window.__motion.draws'),hiddenDraws,'A simulated hidden page cancels the active camera animation');
  await evaluate("delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))");await delay(150);
  motionChecks.push({label:'Simulated hidden-page camera pause',drawsDuringHidden:0});
 }finally{
  await evaluate("delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));for(const [name,original] of Object.entries(window.__motionOriginals))CanvasRenderingContext2D.prototype[name]=original");
  await call('Emulation.setEmulatedMedia',{features:[]});
 }
 await click('[aria-label="Fit map"]');await delay(900);
 checks.push('Finite smooth zoom/focus, reduced motion and simulated hidden-page cancellation');
}
async function pointerNavigation(){
 // This public/no-pilot scenario has one selected system, so its eight-pixel
 // ring is a stable geographic probe independent of label collision placement.
 await click('[aria-label="Focus selected system"]');await delay(900);
 await evaluate(`(()=>{window.__navigation={points:[],draws:0};window.__navigationOriginals={arc:CanvasRenderingContext2D.prototype.arc,clearRect:CanvasRenderingContext2D.prototype.clearRect};CanvasRenderingContext2D.prototype.arc=function(x,y,r,...args){if(this.canvas.closest('.universe-module')&&r===8)window.__navigation.points.push({x,y,at:performance.now()});return window.__navigationOriginals.arc.call(this,x,y,r,...args);};CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('.universe-module'))window.__navigation.draws++;return window.__navigationOriginals.clearRect.apply(this,args);};})()`);
 const reset=()=>evaluate('window.__navigation={points:[],draws:0}');
 const settle=async(label)=>{
  await delay(1100);const value=await evaluate('window.__navigation');await delay(200);
  assert.equal(await evaluate('window.__navigation.draws'),value.draws,label+': no continuing redraw after the gesture settles');return value;
 };
 const zoom=()=>evaluate("parseFloat(document.querySelector('[aria-label=\"Zoom in\"]').previousElementSibling.textContent)");
 try{
  await click('[aria-label="Focus selected system"]');await delay(900);
  const ring=await evaluate('window.__navigation.points.at(-1)');assert.ok(ring,'Selected-system ring is available for the anchor measurement');
  const bounds=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  const anchor={x:bounds.x+ring.x,y:bounds.y+ring.y};await reset();const beforeZoom=await zoom();
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',...anchor,deltaX:0,deltaY:-80});
  const wheel=await settle('Anchored wheel zoom'),drift=Math.max(...wheel.points.map(p=>Math.hypot(p.x-ring.x,p.y-ring.y)));
  assert.ok(await zoom()>beforeZoom,'Wheel input magnifies the map');assert.ok(wheel.points.length>=3&&drift<2,'The geographic point beneath the wheel stays anchored during easing: '+drift);
  motionChecks.push({label:'Wheel geographic anchor',samples:wheel.points.length,maxDriftPixels:drift});

  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await reset();const pinchBefore=await zoom();
  const touch=spread=>[{x:anchor.x-spread,y:anchor.y,id:1},{x:anchor.x+spread,y:anchor.y,id:2}];
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(45)});
  for(const spread of [55,70,85]){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(spread)});await delay(30);}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle('Touch pinch');
  const pinchAfter=await zoom();assert.ok(pinchAfter>pinchBefore*1.4,'A real two-touch gesture changes map scale');
  motionChecks.push({label:'Two-touch pinch zoom',zoomBefore:pinchBefore,zoomAfter:pinchAfter});await call('Emulation.setTouchEmulationEnabled',{enabled:false});

  const drag=async()=>{
   const start={x:bounds.x+bounds.width*.48,y:bounds.y+bounds.height*.5};
   await call('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
   for(const offset of [20,40,60]){await delay(25);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+offset,y:start.y+offset*.35,button:'left',buttons:1});}
   await reset();await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x+60,y:start.y+21,button:'left',clickCount:1});
  };
  await drag();const coast=await settle('Drag coast'),positions=new Set(coast.points.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size;
  assert.ok(positions>=3,'Releasing a moving drag produces finite intermediate coast positions');
  motionChecks.push({label:'Finite drag coast',positions,samples:coast.points.length,spanMs:coast.points.at(-1).at-coast.points[0].at,draws:coast.draws});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(50);await drag();
  const reduced=await settle('Reduced-motion drag');assert.ok(new Set(reduced.points.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size<=1,'Reduced motion removes coast after release');
  motionChecks.push({label:'Reduced-motion drag coast',positions:new Set(reduced.points.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size,draws:reduced.draws});
 }finally{
  await evaluate("for(const [name,original] of Object.entries(window.__navigationOriginals))CanvasRenderingContext2D.prototype[name]=original");
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setEmulatedMedia',{features:[]});
 }
 await click('[aria-label="Fit map"]');await delay(900);checks.push('Anchored wheel, real touch pinch and finite drag inertia with reduced-motion override');
}
async function territoryInspection(state){
 const staticAtlas=await api('/universe/static'),byId=new Map(staticAtlas.systems.map(s=>[s.system_id,s])),group=state.politics.groups.find(g=>g.source==='configured'),colour=group.color;
 const owned=state.systems.filter(s=>s.power_bloc?.source==='configured'&&s.power_bloc?.group_id===group.id).map(s=>s.system_id),ownedIds=new Set(owned);
 const observed=state.systems.filter(s=>byId.get(s.system_id)?.space==='known'&&(s.sovereignty?.alliance_id||s.sovereignty?.faction_id||s.sovereignty?.corporation_id)).length;
 const regions=new Map();for(const id of owned){const s=byId.get(id);regions.set(s.region_name,(regions.get(s.region_name)||0)+1);}
 await preset('Geopolitics');await click('[aria-label="Fit map"]');await delay(900);
 // Reuse actual browser-rendered vector paths to find a quiet interior point.
 // This does not inject application state or bypass map hit-testing.
 await evaluate(`(()=>{window.__territoryPaint={paths:[],points:[]};window.__territoryOriginals={};for(const method of ['clearRect','fill','arc']){const original=CanvasRenderingContext2D.prototype[method];window.__territoryOriginals[method]=original;CanvasRenderingContext2D.prototype[method]=function(...args){if(this.canvas.closest('.universe-module')){if(method==='clearRect')window.__territoryPaint={paths:[],points:[]};if(method==='fill'&&args[0] instanceof Path2D){const t=this.getTransform();window.__territoryPaint.paths.push({path:args[0],fill:this.fillStyle,matrix:[t.a,t.b,t.c,t.d,t.e,t.f]});}if(method==='arc'&&args[2]<=8)window.__territoryPaint.points.push({x:args[0],y:args[1]});}return original.apply(this,args);};}})()`);
 try{
  await click('[aria-label="Fit map"]');await delay(900);let hit;
  for(let attempt=0;attempt<4&&!hit;attempt++){
   hit=await evaluate(`(()=>{const canvas=document.querySelector('.universe-module canvas'),r=canvas.getBoundingClientRect(),context=canvas.getContext('2d'),paths=window.__territoryPaint.paths.filter(p=>p.fill===${JSON.stringify(colour)}),points=window.__territoryPaint.points;context.save();let found=null;for(const path of paths){context.setTransform(...path.matrix);for(let y=35;y<r.height-35&&!found;y+=6)for(let x=35;x<r.width-35;x+=6){if(document.elementFromPoint(r.left+x,r.top+y)!==canvas||points.some(p=>Math.hypot(p.x-x,p.y-y)<15))continue;if(context.isPointInPath(path.path,x,y)&&context.isPointInPath(path.path,x+2,y)&&context.isPointInPath(path.path,x-2,y)&&context.isPointInPath(path.path,x,y+2)&&context.isPointInPath(path.path,x,y-2)){found={x:r.left+x,y:r.top+y,localX:x,localY:y};break;}}if(found)break;}context.restore();return found;})()`);
   if(!hit){await click('[aria-label="Zoom in"]');await delay(750);}
  }
  assert.ok(hit,'A real territory interior can be selected away from system hit targets');
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x,y:hit.y});
  await waitFor(`document.querySelector('.universe-territory-hud')?.textContent.includes(${JSON.stringify(group.name)})`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
  await waitFor(`document.querySelector('.universe-bloc-focus h3')?.textContent===${JSON.stringify(group.name)}`);
  assert.ok(await evaluate("!!document.querySelector('.universe-territory-hud[data-selected=\"true\"]') && !!document.querySelector('[aria-label=\"Frame selected territory\"]')"),'Clicking the actual polygon creates an actionable territory spotlight');
  const share=await evaluate("({value:Number(document.querySelector('[aria-label=\"Share of observed owned systems\"]').getAttribute('aria-valuenow')),label:document.querySelector('[aria-label=\"Share of observed owned systems\"]').getAttribute('aria-valuetext'),regions:Array.from(document.querySelectorAll('.universe-territory-region')).map(e=>({name:e.querySelector('strong').textContent,count:Number(e.querySelector(':scope > span > span').textContent.replace(/[^0-9]/g,''))}))})");
  assert.ok(Math.abs(share.value-owned.length/observed*100)<.001,'Share counts observed owned systems against the full roster');assert.ok(share.label.includes(observed.toLocaleString('en-GB')+' observed owned systems'));
  assert.deepEqual(Object.fromEntries(share.regions.map(r=>[r.name,r.count])),Object.fromEntries(regions),'Regional distribution accounts for all holdings, including collapsed additional regions');
  assert.ok(await evaluate("document.querySelector('.universe-territory-frontiers').textContent.includes('Physical gate connections, not diplomatic relationships.')"));
  await click('.universe-frontier-gates summary');
  const endpoints=await evaluate("Array.from(document.querySelector('.universe-frontier-connection').querySelectorAll('button')).map(e=>e.textContent)");
  const endpointIds=endpoints.map(name=>staticAtlas.systems.find(s=>s.name===name).system_id);
  assert.ok(ownedIds.has(endpointIds[0])&&!ownedIds.has(endpointIds[1]),'The frontier is oriented from this territory to its neighbour');
  assert.ok(staticAtlas.gates.some(g=>g.from_system_id===endpointIds[0]&&g.to_system_id===endpointIds[1]||g.from_system_id===endpointIds[1]&&g.to_system_id===endpointIds[0]),'Frontier endpoints are an actual physical stargate pair');
  await click('[aria-label='+JSON.stringify('Inspect frontier system '+endpoints[0])+']');await waitFor(`document.querySelector('.universe-system-title h3')?.textContent===${JSON.stringify(endpoints[0])}`);
  await click('.universe-member-link');await waitFor("!!document.querySelector('.universe-bloc-selection')");
  const exploredRegion=await evaluate("document.querySelector('.universe-territory-region strong').textContent");await click('.universe-territory-region');await delay(900);
  assert.equal(await evaluate("document.querySelector('.universe-bloc-focus h3').textContent"),group.name,'Exploring regional holdings retains the territorial context');
  await button('Layers & views');assert.ok(await evaluate(`document.querySelector('[aria-label="Map region"]').textContent.includes(${JSON.stringify(exploredRegion)})`),'Regional holdings action frames that region');await click('[aria-label="Close layers"]');
  await button('Frame territory','.universe-bloc-selection');await delay(900);
  const frame=await evaluate(`(()=>{const e=document.querySelector('.universe-module canvas'),r=e.getBoundingClientRect();return {matrix:window.__territoryPaint.paths.find(p=>p.fill===${JSON.stringify(colour)})?.matrix,width:r.width,height:r.height};})()`);
  assert.ok(frame.matrix,'Framed territory still has its vector geometry');
  const projected=projectKnownSystems(staticAtlas.systems).filter(p=>ownedIds.has(p.system.system_id)).map(p=>({x:p.x*frame.matrix[0]+frame.matrix[4],y:p.y*frame.matrix[3]+frame.matrix[5]}));
  const extent={minX:Math.min(...projected.map(p=>p.x)),maxX:Math.max(...projected.map(p=>p.x)),minY:Math.min(...projected.map(p=>p.y)),maxY:Math.max(...projected.map(p=>p.y))};
  assert.ok(extent.minX>=20&&extent.minY>=20&&extent.maxX<=frame.width-20&&extent.maxY<=frame.height-20,'Frame territory includes every owned system with padding: '+JSON.stringify({...extent,...frame}));
  await disclosure('Evidence & coverage');assert.ok(await evaluate("document.querySelector('.universe-evidence-coverage').textContent.includes('not map area') && document.querySelector('.universe-evidence-coverage').textContent.includes('Unclaimed or unobserved')"));
  await evaluate("document.querySelector('#universe-details-dock').scrollTop=0");
  await screenshot('universe-territory-intelligence');
  territoryChecks.push({label:'Real polygon selection and territorial intelligence',key:'bloc:'+group.id,ownedSystems:owned.length,observedSystems:observed,regions:regions.size,frontierEndpoints:endpoints,frame:extent});
  await button('Clear spotlight','.universe-territory-actions');await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await waitFor("!document.querySelector('.universe-bloc-selection')");
  assert.equal(await evaluate("!!document.querySelector('.universe-territory-hud')"),false,'Clearing the spotlight removes its map HUD');
  await button('Owners','.universe-bloc-filters');const owners=await evaluate("Array.from(document.querySelectorAll('.universe-bloc-row strong')).map(e=>e.textContent)");
  assert.ok(owners.includes('Synthetic independent alliance')&&owners.includes('Synthetic opponent'),'Independent and unassigned owners are directly explorable');
  await button('Factions','.universe-bloc-filters');assert.equal(await evaluate("document.querySelectorAll('.universe-bloc-row').length"),4,'All four empires are directly explorable');
  await button('All','.universe-bloc-filters');
 }finally{await evaluate("for(const [name,original] of Object.entries(window.__territoryOriginals))CanvasRenderingContext2D.prototype[name]=original");}
 await search('UALX-3');await click('[aria-label="Fit map"]');await delay(900);checks.push('Actual territory hover/click, spotlight, complete framing, regional shares and physical frontier inspection');
}
async function overviewNavigation(){
 if(!await evaluate("!!document.querySelector('[aria-label=\"Navigate overview map\"]')"))await click('[aria-label="Toggle overview map"]');
 await click('[aria-label="Zoom in"]');await click('[aria-label="Zoom in"]');await delay(750);
 const before=await evaluate("(()=>{const e=document.querySelector('.universe-overview-viewport');return {x:Number(e.getAttribute('x')),y:Number(e.getAttribute('y')),width:Number(e.getAttribute('width')),height:Number(e.getAttribute('height'))};})()");
 const target=await evaluate("(()=>{const r=document.querySelector('[aria-label=\"Navigate overview map\"]').getBoundingClientRect();return {x:r.left+r.width*.3,y:r.top+r.height*.35};})()");
 const prior=await canvasHash();await call('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});await delay(900);
 const after=await evaluate("(()=>{const e=document.querySelector('.universe-overview-viewport');return {x:Number(e.getAttribute('x')),y:Number(e.getAttribute('y')),width:Number(e.getAttribute('width')),height:Number(e.getAttribute('height'))};})()");
 assert.ok(Math.hypot(after.x-before.x,after.y-before.y)>1,'Clicking the overview relocates the camera viewport');assert.notEqual(await canvasHash(),prior,'Overview navigation changes the actual map');
 assert.ok(await evaluate("/Projected distance: [0-9.]+ ly/i.test(document.querySelector('.universe-map-scale').getAttribute('aria-label'))"),'K-space carries a numeric projected distance scale');
 await click('[aria-label="Navigate overview map"]');await delay(900);const keyBefore=await canvasHash();await key('ArrowRight','ArrowRight',39);await delay(900);assert.notEqual(await canvasHash(),keyBefore,'Overview navigation works from the keyboard');
 motionChecks.push({label:'Overview click navigation',before,after});
 await click('[aria-label="Fit map"]');await delay(900);checks.push('Clickable and keyboard overview navigation with projected K-space scale');
}
async function searchAtlasContexts(){
 await click('[aria-label="Fit map"]');await key('/','Slash',191,'/');
 assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"),'Find a solar system','Slash focuses the unified atlas search outside editable fields');
 await fill('[aria-label="Find a solar system"]','The Forge');
 await waitFor("document.querySelector('[aria-label=\"Universe search results\"] [role=option] strong')?.textContent==='The Forge'");
 await key('ArrowDown','ArrowDown',40);await key('ArrowUp','ArrowUp',38);
 assert.ok(await evaluate("(()=>{const input=document.querySelector('[aria-label=\"Find a solar system\"]');return document.getElementById(input.getAttribute('aria-activedescendant'))?.getAttribute('role')==='option';})()"),'Search exposes the active result to assistive technology');
 await key('Enter','Enter',13,'\r');await waitFor("document.querySelector('.universe-overview-heading h3')?.textContent==='The Forge'");
 await fill('[aria-label="Find a solar system"]','Test Expedition Bloc');await key('Enter','Enter',13,'\r');
 await waitFor("document.querySelector('.universe-bloc-focus h3')?.textContent==='Test Expedition Bloc'");
 await button('Frame territory','.universe-bloc-selection');await delay(900);
 await button('Layers & views');assert.ok(await evaluate("document.querySelector('[aria-label=\"Map region\"]').textContent.includes('All regions')"),'Framing a whole territory clears a conflicting region scope');await click('[aria-label="Close layers"]');
 const camera=()=>evaluate("(()=>{const e=document.querySelector('.universe-overview-viewport');return ['x','y','width','height'].map(k=>Number(e.getAttribute(k)));})()");
 const firstFrame=await camera();await click('[aria-label="Zoom in"]');await delay(750);await button('Frame territory','.universe-bloc-selection');await delay(900);const repeatedFrame=await camera();
 assert.ok(firstFrame.every((n,i)=>Math.abs(n-repeatedFrame[i])<.5),'Repeated territory framing restores the same bounds after manual zoom');
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});
 assert.ok(await evaluate("!!document.querySelector('[aria-label=\"Frame selected territory\"]')"),'The same territory can be framed repeatedly while retaining its spotlight');
 await button('Clear spotlight','.universe-bloc-selection');
 await fill('[aria-label="Find a solar system"]','Caldari State');await key('Escape','Escape',27);
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Find a solar system\"]').value"),'');assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Universe search results\"]')"),false,'Escape dismisses search without selecting a result');
 await search('UALX-3');await click('[aria-label="Fit map"]');await delay(900);
 checks.push('Unified system, region and territory keyboard search, scope reset and repeat territory frame');
}
async function defaultMapWorkspace(label){
 await delay(1100);
 const geometry=()=>evaluate("(()=>{const e=document.querySelector('.universe-module canvas'),r=e.getBoundingClientRect(),v=document.querySelector('.universe-overview-viewport');return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom,viewportHeight:innerHeight,camera:v?Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(v.getAttribute(k))])):null};})()");
 const before=await geometry();
 assert.ok(await evaluate("document.querySelector('.universe-module').classList.contains('is-atlas-workspace')"),'The immersive atlas is the default workspace');
 assert.ok(before.bottom<=before.viewportHeight&&before.height>=Math.min(450,before.viewportHeight*.42),label+': default map occupies the remaining viewport without page scrolling: '+JSON.stringify(before));
 await evaluate("void(window.__workspaceCanvas=document.querySelector('.universe-module canvas'))");
 await click('[aria-label="Collapse details"]');await delay(900);const collapsed=await geometry();
 assert.equal(await evaluate("document.querySelector('#universe-details-dock').hidden"),true,'Collapsing details removes the dock from the layout');
 assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"),'Open details','Keyboard focus stays on the dock toggle');
 await screenshot('universe-default-map-collapsed-'+label);
 await click('[aria-label="Open details"]');await delay(900);const reopened=await geometry();
 assert.equal(await evaluate("document.querySelector('.universe-module canvas')===window.__workspaceCanvas"),true,'Dock toggling keeps the same map canvas mounted');
 for(const dimension of ['left','top','width','height'])assert.ok(Math.abs(reopened[dimension]-before[dimension])<1,label+': reopening details restores the map layout');
 if(before.camera&&reopened.camera)for(const k of ['x','y','width','height'])assert.ok(Math.abs(reopened.camera[k]-before.camera[k])<.5,label+': dock toggling preserves camera '+k);
 await button('Layers & views');await waitFor("!!document.querySelector('#universe-layer-popover')");const layered=await geometry();
 assert.ok(Math.abs(layered.top-before.top)<1&&Math.abs(layered.height-before.height)<1,'Layer controls overlay the map without pushing it down');
 await key('Escape','Escape',27);await waitFor("!document.querySelector('#universe-layer-popover')");
 assert.equal(await evaluate("document.activeElement?.getAttribute('aria-controls')"),'universe-layer-popover','Escape restores layer-toggle focus');
 if(label==='mobile')await click('[aria-label="Collapse details"]');
 await click('.universe-map-footnote > button');await waitFor("!!document.querySelector('#universe-source-drawer')");const sourced=await geometry();
 assert.ok(Math.abs(sourced.top-before.top)<1&&Math.abs(sourced.height-before.height)<1,'Data sources overlay the map without displacing it');
 await key('Escape','Escape',27);await waitFor("!document.querySelector('#universe-source-drawer')");
 assert.equal(await evaluate("document.activeElement===document.querySelector('.universe-map-footnote > button')"),true,'Escape restores data-source-toggle focus');
 await button('Atlas','.universe-tabs');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',nativeVirtualKeyCode:9,windowsVirtualKeyCode:9,modifiers:8,text:'\t',unmodifiedText:'\t'});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',nativeVirtualKeyCode:9,windowsVirtualKeyCode:9,modifiers:8});await delay(50);
 assert.equal(await evaluate("!!document.activeElement?.closest('.universe-module')"),false,'Shift-Tab from the first atlas control returns to the application shell');
 mapLayouts.push({label:'Default map workspace '+label,before,collapsed,reopened});checks.push('Default immersive map, stable collapsible dock and overlay controls '+label);
}
function politicalPalette(state,label){
 const colours=state.politics.territory_colours,entries=Object.entries(colours);
 assert.ok(entries.length>=9,label+': full owner, empire and bloc roster has a shared palette');
 for(const channel of ['fill','outline'])assert.equal(new Set(entries.map(([,paint])=>paint[channel])).size,entries.length,label+': every distinct territory has a unique '+channel);
 for(const [id,fill] of Object.entries(empireColours)){
  assert.equal(colours['f'+id]?.fill,fill,label+': canonical empire colour '+id);
  const territory=state.systems.find(system=>system.sovereignty?.faction_id===Number(id));
  assert.ok(territory,label+': empire fixture is in the active map state');
  assert.equal(territory.sovereignty.color,fill,label+': rendered ownership uses canonical empire colour');
 }
 for(const group of state.politics.groups){assert.equal(group.color,colours['bloc:'+group.id].fill);assert.equal(group.outline,colours['bloc:'+group.id].outline);}
 paletteChecks.push({label,colours});
}
async function minimumZoom(label){
 await click('[aria-label="Fit map"]');await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(900);
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true,label+': fit is the minimum zoom');
 const fitted=await canvasHash();
 const point=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width*.57,y:r.y+r.height*.41};})()");
 for(let i=0;i<5;i++)await call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:200});
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(750);
 assert.equal(await canvasHash(),fitted,label+': repeated wheel zoom cannot recede beyond padded space bounds');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
 checks.push(label+' bounded minimum zoom');
}
async function vectorRendering(state,source='inferred'){
 // Browser-only instrumentation verifies the visible territory redraw uses
 // geometry, not a magnified bitmap or per-system radial halo texture.
 await evaluate(`(()=>{window.__mapPaint={raster:0,radial:0,vectorFills:0,vectorStrokes:0,fillColours:{}};window.__paintOriginals={};for(const name of ['drawImage','createRadialGradient','fill','stroke']){const original=CanvasRenderingContext2D.prototype[name];window.__paintOriginals[name]=original;CanvasRenderingContext2D.prototype[name]=function(...args){if(this.canvas.closest('.universe-module')){if(name==='drawImage')window.__mapPaint.raster++;if(name==='createRadialGradient')window.__mapPaint.radial++;if(args[0] instanceof Path2D){window.__mapPaint[name==='fill'?'vectorFills':'vectorStrokes']++;if(name==='fill')window.__mapPaint.fillColours[this.fillStyle]=true;}}return original.apply(this,args);};}})()`);
 try{
  await click('[aria-label="Fit map"]');await waitFor('window.__mapPaint.vectorStrokes>0');await delay(900);
  await evaluate("document.querySelector('.universe-canvas-shell').scrollIntoView({block:'center'})");await screenshot('universe-vector-borders-fit-'+source);
  await click('[aria-label="Zoom in"]');await click('[aria-label="Zoom in"]');await delay(750);
  await evaluate("document.querySelector('.universe-canvas-shell').scrollIntoView({block:'center'})");await screenshot('universe-vector-borders-zoom-'+source);
  const paints=await evaluate('window.__mapPaint');
  assert.equal(paints.raster,0,'Territory is not enlarged from a raster influence texture');
  assert.equal(paints.radial,0,'Ordinary map systems do not generate radial glow fields');
  assert.ok(paints.vectorFills>0&&paints.vectorStrokes>0,'Territories redraw as filled and stroked vector paths: '+JSON.stringify(paints));
  for(const colour of Object.values(empireColours))assert.ok(paints.fillColours[colour],'Canvas territory paths paint the canonical empire colour '+colour);
  const expectedTerritories=new Map();
  for(const system of state.systems){
   const sov=system.sovereignty,bloc=system.power_bloc;if(!sov)continue;
   const key=['configured','inferred'].includes(bloc?.source)?'bloc:'+bloc.group_id:sov.alliance_id?'a'+sov.alliance_id:sov.faction_id?'f'+sov.faction_id:sov.corporation_id?'c'+sov.corporation_id:null;
   if(key)expectedTerritories.set(key,state.politics.territory_colours[key].fill);
  }
  for(const [key,colour] of expectedTerritories)assert.ok(paints.fillColours[colour],source+': actual territory rendering uses the resolved '+key+' colour '+colour);
  renderChecks.push({source,...paints,expectedTerritories:Object.fromEntries(expectedTerritories)});
 }finally{await evaluate("for(const [name,original] of Object.entries(window.__paintOriginals))CanvasRenderingContext2D.prototype[name]=original");}
 checks.push('Territory redraw uses vector borders without scaled bitmap influence or system glow');
}
async function idleMetrics(){
 await call('Performance.enable');await delay(300);
 // Instrument only this disposable browser after interacting. This is never
 // compiled into the app, and distinguishes event-driven draws from a loop.
 await evaluate(`(()=>{window.__universeDraws=0;window.__originalClear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('.universe-module'))window.__universeDraws++;return window.__originalClear.apply(this,args);};})()`);
 const before=Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value])),start=Date.now();
 await delay(3000);
 const after=Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const draws=await evaluate('window.__universeDraws');
 await evaluate('CanvasRenderingContext2D.prototype.clearRect=window.__originalClear');
 const result={windowMs:Date.now()-start,canvasDraws:draws,taskMs:1000*(after.TaskDuration-before.TaskDuration),layoutMs:1000*(after.LayoutDuration-before.LayoutDuration),layouts:after.LayoutCount-before.LayoutCount};
 assert.equal(draws,0,'A settled idle map must not redraw: '+JSON.stringify(result));
 return result;
}
async function startBrowser(){
 proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+join(dir,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 const browserURL=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+log.slice(-1000))),20000);proc.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+log.slice(-1000)));});});
 const endpoint=new URL(browserURL),target=await(await fetch('http://'+endpoint.host+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(new Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 await call('Page.enable');await call('Runtime.enable');await viewport(1600);
}

try{
 app=await startKairo(appOptions);
 await startBrowser();
 await call('Page.navigate',{url:app.origin+'/#universe'});
 // Acceptance scenarios follow the same public controls a pilot uses.
 await waitFor("!!document.querySelector('.universe-module canvas') && !!document.querySelector('.connection-status.online')");
 const atlas=await evaluate("(async()=>{const a=await(await fetch('/api/universe/static')).json(),origin=a.systems.find(s=>s.name==='UALX-3'),nearby=a.systems.find(s=>s.space==='known'&&s.security<.45&&s.system_id!==origin.system_id&&Math.hypot(s.x-origin.x,s.y-origin.y,s.z-origin.z)/9460730472580800<5);return {systems:a.systems.length,known:a.systems.filter(s=>s.space==='known').length,gates:a.gates.length,territory:a.systems.filter(s=>s.space==='known'&&s.security<.45).sort((a,b)=>a.map_x-b.map_x).map(s=>({system_id:s.system_id,map_x:s.map_x,map_y:s.map_y})),systemsByName:Object.fromEntries(a.systems.filter(s=>['Jita','Amarr','Perimeter','Dodixie','Penirgman','Rens','Hek','UALX-3','C-J6MT'].includes(s.name)).map(s=>[s.name,s.system_id])),wormhole:a.systems.find(s=>s.space==='wormhole'&&s.name.startsWith('J')&&s.wormhole_class<=6),nearby};})()");
 assert.ok(atlas.systems>8000&&atlas.known>5000&&atlas.gates>6000,'Full bundled universe is available without EVE authentication');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes(atlas.known.toLocaleString('en-US')+' systems'));
 assert.equal((await api('/bootstrap')).characters.length,0);
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Universe space\"] [role=tab] strong')).map(e=>e.textContent)"),['K-Space','J-Space']);
 await minimumZoom('Known space');
 await space('J-Space');await waitFor("document.querySelector('.universe-module')?.classList.contains('is-jspace')");
 assert.ok(await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label').startsWith('Wormhole space')"));
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Territory view\"]')"),null,'J-space has its own discovery controls');
 assert.equal(await evaluate("!!document.querySelector('.universe-map-scale-bar')"),false,'Schematic J-space does not claim a physical distance scale');
 assert.ok(await evaluate("document.querySelector('.universe-map-scale').textContent.includes('no scale')"));
 await screenshot('universe-jspace-empty');await space('K-Space');
 await readability('Public atlas', [['.universe-tabs button',16],['.universe-space-switch strong',16],['[aria-label="Find a solar system"]',16],['.universe-map-footnote',14]]);
 await mapFirstLayout('Desktop public atlas');await screenshot('universe-map-first-desktop');
 await contrast('Atlas controls',['.universe-tabs button','.universe-space-switch strong','.universe-map-footnote']);
 checks.push('Distinct K-space and J-space tabs with a dedicated wormhole discovery context');
 await layout('Public atlas desktop');await screenshot('universe-public-atlas');
 await defaultMapWorkspace('desktop');
 await search('Jita');
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-metric-grid strong')).map(e=>e.textContent)"),['—','—','—','—'],'Unavailable public feeds must not look like zero activity');
 await disclosure('Celestials & NPC stations');await waitFor("document.querySelectorAll('.universe-celestial-group').length===4");
 await clickElement("Array.from(document.querySelectorAll('.universe-celestial-group summary')).find(e=>e.textContent.startsWith('Planets'))");
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.universe-celestial-list strong')).some(e=>e.textContent.startsWith('Jita'))"),'Static celestial names render in the inspector');
 await clickElement("Array.from(document.querySelectorAll('.universe-celestial-group summary')).find(e=>e.textContent.startsWith('NPC stations'))");
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.universe-celestial-list strong')).some(e=>e.textContent.includes('Caldari Navy Assembly Plant'))"),'Jita NPC station names render from bundled detail data');
 await disclosure('Celestials & NPC stations');
 await navigationMotion();
 await pointerNavigation();
 await overviewNavigation();
 await click('[aria-label="Zoom in"]');await delay(100);const zoomed=await canvasHash();
 const point=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+90,y:point.y+50,button:'left',buttons:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+90,y:point.y+50,button:'left',clickCount:1});
 await delay(100);assert.notEqual(await canvasHash(),zoomed,'Pointer drag moves the rendered map');
 const panned=await canvasHash();await call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-100});await delay(100);assert.notEqual(await canvasHash(),panned,'Wheel zoom changes the rendered map');
 await click('[aria-label="Fit map"]');await preset('Activity');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Ship kills'));
 await button('Layers & views');await choose('Territory background','Security status');await choose('System indicators','Gate traffic');
 await fill('[aria-label="Saved view name"]','Public travel view');await button('Save','.universe-layer-panel');
 await waitFor("document.querySelector('.universe-saved-views')?.textContent.includes('Public travel view')");
 assert.equal((await api('/universe?character=0')).views[0].config.indicator,'jumps');
 await preset('Geopolitics');await preset('Public travel view');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Security status background. Gate jumps'));
 await click('[aria-label="Delete view Public travel view"]');await waitFor("!document.querySelector('.universe-saved-views')?.textContent.includes('Public travel view')");
 await click('[aria-label="Close layers"]');
 checks.push('Public search, pointer pan/wheel zoom, presets and saved view create/load/delete');

 // Reload with disconnected synthetic tokens and locally cached intelligence.
 // No ESI authentication or real player data is involved.
 await call('Page.navigate',{url:'about:blank'});await app.close();app=null;
 const db=openStore(join(dir,'data')),now=Date.now(),ready=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()});
 try{
  for(const [id,name] of [[42,'Atlas Alpha'],[43,'Atlas Beta']]){
   db.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,name,'[]','synthetic-unusable-token');
   db.saveSnapshot(id,'profile',ready({name,character_id:id,alliance_id:88,corporation_id:99}));
   db.saveSnapshot(id,'location',ready({solar_system_id:atlas.systemsByName['UALX-3']}));
   db.saveSnapshot(id,'contacts',ready([{contact_id:77,contact_type:'alliance',standing:id===42?5:-10}]));
   db.saveSnapshot(id,'corporation_contacts',{status:'missing_scope',data:null});db.saveSnapshot(id,'alliance_contacts',{status:'missing_scope',data:null});
   db.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(id,atlas.systemsByName[id===42?'Jita':'Amarr'],id===42?'Jita':'Amarr',new Date(now).toISOString());
  }
  db.set('names',{77:'Synthetic sovereignty alliance',78:'Synthetic independent alliance',79:'Synthetic fallback one',80:'Synthetic fallback two',88:'Synthetic pilot alliance',99:'Synthetic corporation',999:'Synthetic opponent',500001:'Caldari State',500004:'Gallente Federation',500003:'Amarr Empire',500002:'Minmatar Republic'});
  const owners=new Map(atlas.territory.map((system,index)=>[system.system_id,77+Math.min(3,Math.floor(index/atlas.territory.length*4))]));
  for(const [name,alliance] of [['UALX-3',77],['C-J6MT',78],['Jita',79],['Amarr',80],['Hek',999]])owners.set(atlas.systemsByName[name],alliance);
  const empires=[['Perimeter',500001],['Dodixie',500004],['Penirgman',500003],['Rens',500002]];
  for(const [name] of empires)owners.delete(atlas.systemsByName[name]);
  db.saveSnapshot(0,'sovereignty',ready([...owners].map(([system_id,alliance_id])=>({system_id,alliance_id})).concat(empires.map(([name,faction_id])=>({system_id:atlas.systemsByName[name],faction_id})))));
  db.saveSnapshot(0,'kills',{status:'error',error:'Synthetic ESI feed unavailable',data:null,updatedAt:new Date(now).toISOString()});
  db.saveSnapshot(0,'jumps',ready([{system_id:atlas.systemsByName['UALX-3'],ship_jumps:123}]));
  let killmailId=7000;
  for(const members of [[77,78],[79,80]])for(const days of [15,7,1]){
   const at=new Date(now-days*86400000).toISOString(),raw={killmail_id:++killmailId,killmail_time:at,solar_system_id:atlas.systemsByName['UALX-3'],victim:{alliance_id:999,ship_type_id:587},attackers:members.map(alliance_id=>({alliance_id}))};
   db.db.prepare('INSERT INTO combat_records VALUES(?,?,?,?,?,?)').run(42,killmailId,'kill',at,JSON.stringify(raw),'esi');
  }
  const started=new Date(now-3600000).toISOString(),ended=new Date(now-1800000).toISOString();
  db.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)').run('universe-browser-replay',42,'Universe replay fixture',started,ended,JSON.stringify({capturedAt:started,system:{id:atlas.systemsByName.Jita,name:'Jita'}}),JSON.stringify({capturedAt:ended,system:{id:atlas.systemsByName.Jita,name:'Jita'}}));
  for(const [name,offset] of [['Jita',1],['Perimeter',10],['Jita',20]])db.db.prepare('INSERT INTO visits(character_id,system_id,name,at) VALUES(?,?,?,?)').run(42,atlas.systemsByName[name],name,new Date(now-3600000+offset*60000).toISOString());
  db.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,'ship.changed','journey','Synthetic ship change',JSON.stringify({ship_type_id:587,solar_system_id:atlas.systemsByName.Perimeter}),new Date(now-3600000+12*60000).toISOString());
  for(const [type,module,summary,offset] of [['location.changed','journey','Entered system: Perimeter',10],['system.entered','journey','Entered system: Jita',11],['opsec.policy_changed','opsec','Synthetic OpSec policy change',12],['policy.changed','opsec','Synthetic OpSec module activity',13]])
   db.db.prepare('INSERT INTO events(character_id,type,module,summary,payload,at) VALUES(?,?,?,?,?,?)').run(42,type,module,summary,JSON.stringify({solar_system_id:atlas.systemsByName.Perimeter}),new Date(now-3600000+offset*60000).toISOString());
 }finally{db.close();}
 app=await startKairo(appOptions);await call('Page.navigate',{url:app.origin+'/#universe'});await waitFor("document.querySelector('[aria-label=\"Active character\"]')?.textContent.includes('Atlas Alpha') && !!document.querySelector('.universe-module canvas')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('good standing')");
 const inferred=await api('/universe/politics','POST');
 assert.deepEqual(inferred.groups.filter(g=>g.source==='inferred').map(g=>g.alliance_ids).sort((a,b)=>a[0]-b[0]),[[77,78],[79,80]],'Repeated local cooperation supports separate inferred groups');
 await button('Refresh','.universe-heading');await waitFor("!!document.querySelector('.universe-membership.inferred')");
 const inferredMap=await api('/universe?character=42');politicalPalette(inferredMap,'Inferred political map');
 await vectorRendering(inferredMap);
 assert.ok(await evaluate("document.querySelector('.universe-owner').textContent.includes('Synthetic sovereignty alliance')"));
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-metric-grid strong')).map(e=>e.textContent)"),['—','—','—','123']);
 await preset('My standings');
 await button('Layers & views');await choose('Standing filter','Good & excellent');
 await waitFor("document.querySelector('.universe-module canvas').getAttribute('aria-label').includes('Pilot standings')");
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes(atlas.known.toLocaleString('en-US')+' systems'),'Standing filtering retains the entire ownership partition');
 await fill('[aria-label="Saved view name"]','Alpha private view');await button('Save','.universe-layer-panel');
 await waitFor("document.querySelector('.universe-saved-views')?.textContent.includes('Alpha private view')");
 await choose('Standing filter','All standings');await click('[aria-label="Close layers"]');
 await disclosure('Pins & reminders');await fill('[aria-label="Pin label"]','Alpha moon watch');await fill('[aria-label="Pin note"]','Synthetic private note');await button('Add map pin');
 await waitFor("document.querySelector('.universe-pin-item')?.textContent.includes('Alpha moon watch')");
 await choose('Active character','Atlas Beta');await waitFor("!document.querySelector('.universe-system-title')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('terrible standing')");
 const beta=await api('/universe?character=43');assert.equal(beta.pins.length,0);assert.equal(beta.views.length,0);assert.equal(beta.journey.systems[0].name,'Amarr');
 await button('Layers & views');assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Delete view Alpha private view\"]')"),false);await click('[aria-label="Close layers"]');
 await choose('Active character','Atlas Alpha');await search('UALX-3');await waitFor("document.querySelector('.universe-standing')?.textContent.includes('good standing')");
 const alpha=await api('/universe?character=42');assert.equal(alpha.pins[0].label,'Alpha moon watch');assert.equal(alpha.views[0].name,'Alpha private view');assert.equal(alpha.journey.systems[0].name,'Jita');
 await screenshot('universe-pilot-standings');checks.push('Pilot standings, unavailable ESI, private view/pin and visit isolation');

 // Configure through Settings, then verify the resolved political map. Manual
 // membership and explicit independence override only those alliances; another
 // supported group continues using inference.
 await button('Blocs','.universe-inspector-tabs');await click('[aria-label="Configure Universe power blocs"]');
 await waitFor("!!document.querySelector('.power-bloc-settings') && !!document.querySelector('[aria-label=\"Create power bloc\"]')");
 await button('Create your first power bloc','.power-bloc-settings');await fill('[aria-label="Power bloc name"]','Test Expedition Bloc');
 await click('[aria-label="Use colour #91b2f6"]');
 for(const id of ['77','78']){await fill('[aria-label="Find alliance by name or ID"]',id);await button('Find & add','.power-bloc-settings');await waitFor(`document.querySelector('.power-bloc-members')?.textContent.includes(${JSON.stringify(id)})`);}
 await click('[aria-label="Create power bloc"]');
 assert.equal(await evaluate("document.querySelector('[aria-label^=\"Use colour #91b2f6\"]').disabled"),true,'A new configured bloc cannot reuse the first bloc colour');
 assert.notEqual(await evaluate("document.querySelector('#power-bloc-colour').value"),'#91b2f6','New blocs receive an unused initial colour');
 await click('[aria-label="Delete new power bloc"]');await button('Delete from draft','[role=alertdialog]');
 await waitFor("document.querySelector('[aria-label=\"Power bloc name\"]')?.value==='Test Expedition Bloc'");
 await click('.power-bloc-independent');await fill('[aria-label="Find alliance by name or ID"]','78');await button('Find & add','.power-bloc-settings');
 await waitFor("!!document.querySelector('[role=alertdialog]')");await button('Move alliance','[role=alertdialog]');
 await waitFor("document.querySelector('.power-bloc-members')?.textContent.includes('Synthetic independent alliance')");
 await button('Save changes','.power-bloc-settings');await waitFor("document.querySelector('.power-bloc-savebar strong')?.textContent==='Universe settings are saved'");
 const savedPolitics=await api('/universe/politics/config');
 assert.equal(savedPolitics.inference_enabled,true);assert.equal(savedPolitics.blocs[0].name,'Test Expedition Bloc');assert.equal(savedPolitics.blocs[0].color,'#91b2f6');assert.deepEqual(savedPolitics.blocs[0].alliance_ids,[77]);assert.deepEqual(savedPolitics.independent_alliance_ids,[78]);
 await api('/universe/politics','POST');
 await layout('Power bloc settings desktop','.power-bloc-settings');await screenshot('universe-power-bloc-settings');
 await viewport(390,844);await layout('Power bloc settings 390','.power-bloc-settings');
 await readability('Power bloc settings 390',[['.power-bloc-intro p',16],['.power-bloc-fallback p',16],['.power-bloc-member strong',16]]);
 await contrast('Power bloc settings',['.power-bloc-intro p','.power-bloc-member strong']);
 await screenshot('universe-power-bloc-settings-mobile');await viewport(1600);
 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Universe')");
 await waitFor("!!document.querySelector('.universe-module canvas')");
 await search('UALX-3');await waitFor("document.querySelector('.universe-membership.configured')?.textContent.includes('Test Expedition Bloc')");
 assert.ok(await evaluate("document.querySelector('.universe-owner').textContent.includes('Synthetic sovereignty alliance')"),'Configured bloc does not replace actual sovereign ownership');
 assert.ok(await evaluate("document.querySelector('.universe-standing').textContent.includes('good standing')"),'Configured bloc does not replace the pilot standing');
 const configured=await api('/universe?character=42');
 politicalPalette(configured,'Configured and inferred political map');
 await vectorRendering(configured,'configured');
 assert.equal(configured.systems.find(s=>s.system_id===atlas.systemsByName['UALX-3']).power_bloc.source,'configured');
 assert.equal(configured.systems.find(s=>s.system_id===atlas.systemsByName['C-J6MT']).power_bloc.source,'independent');
 assert.deepEqual(configured.politics.groups.filter(g=>g.source==='inferred').map(g=>g.alliance_ids),[[79,80]],'Configuring one group preserves inferred fallback elsewhere');
 await screenshot('universe-configured-membership');
 await search('C-J6MT');await waitFor("document.querySelector('.universe-membership.independent')?.textContent.includes('Independent alliance')");
 await search('Jita');await waitFor("!!document.querySelector('.universe-membership.inferred')");
 await click('.universe-member-link');await waitFor("!!document.querySelector('.universe-bloc-focus.inferred')");
 assert.ok(await evaluate("/estimated?.*may not/i.test(document.querySelector('.universe-inference-note').textContent)"),'Inferred group carries a visible uncertainty explanation');
 assert.ok(await evaluate("document.querySelector('.universe-bloc-members').textContent.includes('Synthetic fallback one') && document.querySelector('.universe-bloc-members').textContent.includes('Synthetic fallback two')"),'Inferred members resolve to readable alliance names');
 await readability('Political explorer',[['.universe-bloc-members strong',16],['.universe-inference-note',16],['.universe-source-badge',14]]);
 await contrast('Political explorer',['.universe-bloc-members strong','.universe-inference-note']);
 await screenshot('universe-inferred-membership');
 await click('[aria-label="Configure Universe power blocs"]');await waitFor("document.querySelector('[aria-label=\"Power bloc name\"]')?.value==='Test Expedition Bloc'");
 assert.ok(await evaluate("document.querySelector('.power-bloc-members').textContent.includes('Synthetic sovereignty alliance')"),'Saved settings re-open with exact memberships');
 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Universe')");await waitFor("!!document.querySelector('.universe-module canvas')");
 checks.push('Power bloc create/name/colour, explicit membership move to independent, save/reopen, source labels and per-alliance fallback');

 await territoryInspection(configured);
 await searchAtlasContexts();

 await search('Jita');await click('[aria-label="Set route origin"]');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Route origin\"]').value"),'Jita');
 await search('Amarr');await click('[aria-label="Set route destination"]');
 assert.deepEqual(await evaluate("['Route origin','Route destination'].map(label=>document.querySelector('[aria-label=\"'+label+'\"]').value)"),['Jita','Amarr'],'Selected-system route actions preserve the other endpoint');
 await button('Calculate route');
 await waitFor("document.querySelector('.universe-route-result .eyebrow')?.textContent==='CALCULATED ROUTE'");
 const route=await evaluate("Array.from(document.querySelectorAll('.universe-route-result ol strong')).map(e=>e.textContent)");
 assert.equal(route[0],'Jita');assert.equal(route.at(-1),'Amarr');assert.ok(route.length>2,'Route uses multiple actual stargates');
 assert.ok(await evaluate("document.querySelector('.universe-canvas-shell').textContent.includes('Planned route')"),'Calculated route is passed to the map');
 await delay(900);const beforeRouteFit=await canvasHash();await click('[aria-label="Fit route"]');await delay(900);assert.notEqual(await canvasHash(),beforeRouteFit,'Fit route reframes the drawn route');
 await screenshot('universe-gate-route');
 await button('Jump range','.universe-inspector-tabs');
 assert.ok(atlas.nearby,'Static data supplies an actual nullsec target within range');
 await fill('[list="universe-system-jump-origin"]','UALX-3');await fill('[list="universe-system-jump-destination"]',atlas.nearby.name);await button('Calculate jump route');
 await waitFor("document.querySelector('.universe-route-result .eyebrow')?.textContent==='CALCULATED ROUTE'");
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.universe-route-result ol strong')).map(e=>e.textContent)"),['UALX-3',atlas.nearby.name]);
 assert.ok(await evaluate("document.querySelector('.universe-range-stat strong').textContent.endsWith(' LY')"));
 checks.push('Jita–Amarr local gate route and actual 3D jump-drive route');

 await clickElement("Array.from(document.querySelectorAll('.universe-tabs button')).find(e=>e.textContent.startsWith('Connections & pins'))");
 await button('Ansiblex','.universe-connection-form');
 await fill('[list="universe-system-connection-origin"]','UALX-3');await fill('[list="universe-system-connection-destination"]','C-J6MT');
 await fill('input[placeholder="Alliance bridge"]','Manual test bridge');await checkLabel('I have access to these bridges');await button('Save connection');
 await waitFor('!!('+connection('Manual test bridge')+')');
 assert.ok(await evaluate('('+connection('Manual test bridge')+').textContent.includes("ACTIVE")'));
 await clickElement('('+connection('Manual test bridge')+').querySelector("input[type=checkbox]")');
 await waitFor('('+connection('Manual test bridge')+').textContent.includes("DISABLED")');
 assert.equal((await api('/universe?character=42')).links.find(l=>l.label==='Manual test bridge').enabled,false);
 await clickElement('('+connection('Manual test bridge')+').querySelector("input[type=checkbox]")');await waitFor('('+connection('Manual test bridge')+').textContent.includes("ACTIVE")');
 await button('Import','.universe-connection-form');
 await fill('input[placeholder="Alliance bridges · September"]','Synthetic bridge network');
 await fill('[aria-label="Bridge import data"]','from_system,to_system,label\nJita,Perimeter,Imported bridge one\nAmarr,Jita,Imported bridge two');await button('Import bridge list');
 await waitFor("document.querySelector('.universe-import-list')?.textContent.includes('Synthetic bridge network')");
 assert.equal((await api('/universe?character=42')).link_lists.length,1);
 await click('.universe-import-list input[type=checkbox]');
 await waitFor('('+connection('Imported bridge one')+').textContent.includes("DISABLED")');
 assert.ok((await api('/universe?character=42')).links.filter(l=>l.source==='import').every(l=>l.active===false));
 await click('.universe-import-list input[type=checkbox]');await waitFor('('+connection('Imported bridge one')+').textContent.includes("ACTIVE")');
 await screenshot('universe-connections');await click('[aria-label="Delete imported list Synthetic bridge network"]');
 await waitFor("!document.querySelector('.universe-import-list')");assert.equal((await api('/universe?character=42')).links.filter(l=>l.source==='import').length,0);
 await click('[aria-label="Delete connection Manual test bridge"]');await waitFor('!('+connection('Manual test bridge')+')');
 checks.push('Manual Ansiblex add/toggle/delete and CSV bridge-list import/toggle/delete');

 // An observed, unconfirmed passage cannot enter routes until explicitly
 // confirmed. Expiry preserves the discovered destination and its private pin.
 const wormhole=await api('/universe/links?character=42','POST',{kind:'wormhole',label:'Unconfirmed passage',from_system_id:atlas.systemsByName['Jita'],to_system_id:atlas.wormhole.system_id,confirmed:false,accessible:true,duration_hours:16});
 await api('/universe/pins?character=42','POST',{system_id:atlas.wormhole.system_id,label:'Persistent J-space discovery',body:'Remains after the passage expires'});
 await button('Refresh','.universe-heading');await waitFor('!!('+connection('Unconfirmed passage')+')');
 assert.ok(await evaluate('('+connection('Unconfirmed passage')+').textContent.includes("UNCONFIRMED")'));
 await clickElement(`Array.from((${connection('Unconfirmed passage')}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Confirm')`);
 await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("ACTIVE")');
 await clickElement(`Array.from((${connection('Unconfirmed passage')}).querySelectorAll('button')).find(e=>e.textContent.trim()==='Edit')`);
  await choose('Lifetime for '+wormhole.id,'4 hours from now');
  await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("4.0h remaining")');
 const revised=(await api('/universe?character=42')).links.find(l=>l.id===wormhole.id);assert.ok(Math.abs(Date.parse(revised.expires_at)-Date.now()-4*3600000)<15000);
 await choose('Lifetime for '+wormhole.id,'Expire now');await waitFor('('+connection('Unconfirmed passage')+').textContent.includes("EXPIRED")');
 const expired=await api('/universe?character=42');assert.equal(expired.links.find(l=>l.id===wormhole.id).active,false);assert.ok(expired.pins.some(p=>p.system_id===atlas.wormhole.system_id));
 await button('Atlas','.universe-tabs');await space('J-Space');
 assert.ok((await evaluate("document.querySelector('.universe-module canvas').getAttribute('aria-label')")).includes('Wormhole space interactive map showing 1 systems'));
 await minimumZoom('Discovered J-space');
 await screenshot('universe-expired-discovery');checks.push('Wormhole confirmation, lifetime editing, expiry and retained discoveries');

 await button('Journey','.universe-tabs');await waitFor("!!document.querySelector('.route-stop')");
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.universe-module button')).some(e=>e.textContent.trim()==='Sessions')"),false,'Sessions has its own page, outside Universe');
 assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).filter(e=>e.textContent.trim()==='Sessions').length"),1);
 await button('Atlas','.universe-tabs');await preset('Geopolitics');await search('UALX-3');await click('[aria-label="Fit map"]');
 for(const width of [1600,1024,820,390]){
  await viewport(width,width===390?844:1050);await layout('Atlas '+width);
  await readability('Atlas '+width,[['.universe-tabs button',16],['.universe-system-title h3',22],['.universe-owner strong',16],['.universe-membership p',14],['.universe-breadcrumb',14],['[aria-label="Find a solar system"]',16]]);
  if(width===1600){await mapFirstLayout('Desktop pilot atlas');await contrast('System inspector',['.universe-owner strong','.universe-membership p','.universe-breadcrumb']);}
  await evaluate("document.querySelector('.universe-module').scrollIntoView({block:'start'})");await screenshot('universe-atlas-'+width);
  if(width===390)await defaultMapWorkspace('mobile');
 }
 await button('Layers & views');await layout('Layers 390');await screenshot('universe-mobile-layers');await click('[aria-label="Close layers"]');
 await clickElement("Array.from(document.querySelectorAll('.universe-tabs button')).find(e=>e.textContent.startsWith('Connections & pins'))");await layout('Connections 390');await screenshot('universe-mobile-connections');
 await button('Atlas','.universe-tabs');await viewport(1600);await click('[aria-label="Fit map"]');await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});

 await clickElement("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(e=>e.textContent.trim()==='Sessions')");
 await waitFor("!!document.querySelector('.session-card')");
 await clickElement("Array.from(document.querySelectorAll('.session-card')).find(e=>e.textContent.includes('Universe replay fixture'))");
 await button('Show on Map','.session-v2');
 await waitFor("document.querySelector('.session-replay h3')?.textContent==='Universe replay fixture'");
 await waitFor("!!document.querySelector('.universe-module canvas') && !!document.querySelector('[aria-label=\"Play session replay\"]')");
 assert.equal(await evaluate("document.querySelector('.session-replay-status strong').textContent"),'Jita');
 assert.equal(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').max"),'1800000');
 assert.equal(await evaluate("document.querySelector('.universe-map-layer-plaque').textContent.trim().toLowerCase()"),'session replay','The map explicitly identifies its recorded replay context');
 assert.ok(await evaluate("document.querySelector('.universe-map-footnote').textContent.includes('Current sovereignty and activity are hidden')"),'Replay separates historical observations from current geopolitical data');
 assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Play session replay\"]')"),true,'Replay opens paused');
 const replayViewport=await evaluate("(()=>{const map=document.querySelector('.universe-module canvas').getBoundingClientRect(),play=document.querySelector('[aria-label=\"Play session replay\"]').getBoundingClientRect();return {width:innerWidth,height:innerHeight,centre:{x:map.x+map.width/2,y:map.y+map.height/2},play:{top:play.top,bottom:play.bottom,left:play.left,right:play.right}};})()");
 assert.ok(replayViewport.centre.x>0&&replayViewport.centre.x<replayViewport.width&&replayViewport.centre.y>0&&replayViewport.centre.y<replayViewport.height-50&&replayViewport.play.top>=0&&replayViewport.play.bottom<=replayViewport.height&&replayViewport.play.left>=0&&replayViewport.play.right<=replayViewport.width,'Desktop replay keeps the followed pilot/map centre and playback controls visible together: '+JSON.stringify(replayViewport));
 await layout('Session replay desktop');await screenshot('universe-session-replay');
 // Seek near the next observation using the actual timeline track, then play
 // across it. Record drawn label positions inside this disposable browser to
 // verify the camera uses intermediate positions rather than teleporting.
 const track=await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Session replay time\"]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width*.328,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...track,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...track,button:'left',clickCount:1});
 const seekTime=await evaluate("Number(document.querySelector('[aria-label=\"Session replay time\"]').value)");assert.ok(seekTime>500000&&seekTime<600000,'Timeline scrubs to the selected point');
 await evaluate("(()=>{window.__replayPositions=[];window.__replayEventDraws=0;window.__originalText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(this.canvas.closest('.universe-module')){if(text==='Perimeter')window.__replayPositions.push({x,y,at:performance.now()});if(text==='Synthetic ship change')window.__replayEventDraws++;}return window.__originalText.call(this,text,x,y,...args);};})()");
 await click('[aria-label="Play session replay"]');await waitFor("document.querySelector('.session-replay-status strong')?.textContent==='Perimeter'");await delay(900);await click('[aria-label="Pause session replay"]');
 const camera=await evaluate("window.__replayPositions");
 assert.ok(new Set(camera.map(p=>p.x.toFixed(2)+':'+p.y.toFixed(2))).size>=3,'Following the next recorded system paints intermediate camera positions');
 assert.ok(await evaluate("document.querySelector('.session-replay button[aria-pressed]')?.getAttribute('aria-pressed')==='true'"));
 const pausedTime=await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value");await delay(250);assert.equal(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value"),pausedTime,'Pause freezes the timeline');
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(100);
 const replayZoomBefore=await evaluate("parseFloat(document.querySelector('[aria-label=\"Zoom in\"]').previousElementSibling.textContent)"),replayImageBefore=await canvasHash();
 await click('[aria-label="Zoom in"]');await delay(900);
 await waitFor("document.querySelector('.session-replay button[aria-pressed]')?.textContent.includes('Resume follow')");
 const replayZoomAfter=await evaluate("parseFloat(document.querySelector('[aria-label=\"Zoom in\"]').previousElementSibling.textContent)");
 assert.ok(Math.abs(replayZoomAfter-replayZoomBefore*1.4)<.2,'Manual replay zoom finishes its intended zoom after stopping follow');
 assert.notEqual(await canvasHash(),replayImageBefore,'Manual replay zoom changes the rendered view');
 await button('Resume follow','.session-replay');await delay(900);
 const replayCanvas=await evaluate("(()=>{const e=document.querySelector('.universe-module canvas');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...replayCanvas,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:replayCanvas.x+75,y:replayCanvas.y+40,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:replayCanvas.x+75,y:replayCanvas.y+40,button:'left',clickCount:1});
 await waitFor("document.querySelector('.session-replay button[aria-pressed]')?.textContent.includes('Resume follow')");await button('Resume follow','.session-replay');
 // Keyboard seeking exercises the range input without application hooks.
 await click('[aria-label="Session replay time"]');await key('Home','Home',36);
 await key('ArrowRight','ArrowRight',39);
 assert.ok(Number(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value"))<=1000);
 await click('[aria-label="Next recorded event"]');
 assert.equal(Number(await evaluate("document.querySelector('[aria-label=\"Session replay time\"]').value")),12*60000,'Next event skips routine movement and OpSec activity to the meaningful event');
 await waitFor("document.querySelector('.session-replay-events')?.textContent.includes('Synthetic ship change')");
 assert.ok(await evaluate("document.querySelector('.session-replay-event strong')?.textContent.includes('Synthetic ship change')"),'Meaningful events render as prominent visual cards');
 assert.ok(await evaluate("!!document.querySelector('.session-replay-event-icon svg')"),'Replay activity has a recognisable event icon');
 await readability('Session event cards',[['.session-replay-event strong',16],['.session-replay-event-meta',14],['.session-replay-play',16],['.session-replay-options button',16]]);
 await contrast('Replay event',['.session-replay-event strong','.session-replay-event-meta time']);
 await waitFor('window.__replayEventDraws>0');
 await screenshot('universe-session-replay-event');
 await evaluate('CanvasRenderingContext2D.prototype.fillText=window.__originalText');
 await click('[aria-label="Session replay time"]');await key('End','End',35);
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.session-replay-event')).some(e=>/Entered system|Synthetic OpSec/.test(e.textContent))"),false,'Travel and OpSec changes are omitted from all replay event cards');
 const replayData=await api('/sessions/universe-browser-replay/replay?character=42');
 assert.ok(replayData.visits.length>=3&&replayData.travel.length>=2,'Routine-event suppression preserves movement history');
 assert.ok(replayData.events.every(event=>!['location.changed','system.entered'].includes(event.type)&&!event.type.startsWith('opsec.')&&event.module!=='opsec'));
 await viewport(390,844);await layout('Session replay 390');await readability('Mobile replay',[['.session-replay-event strong',16],['.session-replay-event-meta',14],['.session-replay-play',16],['.session-replay-options button',16]]);await evaluate("document.querySelector('.session-replay').scrollIntoView({block:'start'})");await screenshot('universe-session-replay-mobile');
 await click('[aria-label="Close session replay"]');await waitFor("!document.querySelector('.session-replay')");
 assert.notEqual(await evaluate("document.querySelector('.universe-map-layer-plaque').textContent.trim().toLowerCase()"),'session replay','Exiting replay restores the normal atlas');
 await viewport(1600);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10});await delay(1100);
 checks.push('Session Show on Map, timeline/play/pause, smooth follow, manual pan, event popup and clean exit');

 const metrics=await idleMetrics();
 assert.deepEqual(errors,[],'No uncaught browser errors');
 assert.deepEqual(externalCalls,[],'No external ESI or login requests from synthetic fixtures');
 await writeFile(join(output,'universe-checks.json'),JSON.stringify({checks,metrics,renderChecks,typeChecks,contrastChecks,motionChecks,mapLayouts,paletteChecks,territoryChecks,atlas:{systems:atlas.systems,known:atlas.known,gates:atlas.gates},routeHops:route.length-1},null,2));
 await rm(join(output,'failure.json'),{force:true});await rm(join(output,'universe-failure.png'),{force:true});
 console.log(JSON.stringify({ok:true,checks,metrics,screenshots:output}));
}catch(error){
 console.error('Universe browser check failed:',error.stack||error.message);
 const state=ws?.readyState===1?await evaluate("({url:location.href,focus:{tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,100),aria:document.activeElement?.getAttribute('aria-label')},tabs:Array.from(document.querySelectorAll('[role=tab]')).map(t=>({text:t.textContent,selected:t.getAttribute('aria-selected')})),body:document.body.innerText.slice(-16000)})").catch(()=>null):null;
 await writeFile(join(output,'failure.json'),JSON.stringify({error:error.stack||error.message,errors,checks,motionChecks,mapLayouts,territoryChecks,state},null,2));
 if(ws?.readyState===1)await screenshot('universe-failure').catch(()=>{});throw error;
}finally{
 ws?.close();
 if(proc&&proc.exitCode===null&&proc.signalCode===null){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await Promise.race([exited,delay(1000)]);}}
 await app?.close();
 await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(error=>console.warn('Temporary browser cleanup:',error.message));
}
