// Untimed DOM event attribution only. Does not alter application handlers or compiled bytes.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {chromeProcess} from './chrome-strict.mjs';
import {loadSourceManifest,verifySource} from '../../../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const [repoArg,outArg,manifest,moveButton]=process.argv.slice(2);
assert.ok(['omitted','left'].includes(moveButton));
const repo=resolve(repoArg),output=resolve(outArg),source=await loadSourceManifest(manifest,repo);
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const {defaultStream}=await import(pathToFileURL(join(repo,'server/stream.mjs')));
const {defaultOBS,sanitizeOBS}=await import(pathToFileURL(join(repo,'server/obs.mjs')));
const dir=await mkdtemp(join(tmpdir(),'kairo-studio-pointer-diagnostic-'));
const requests=[],errors=[],external=[],checks=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const result={schemaVersion:1,startedAt:new Date().toISOString(),kind:'untimed-pointer-attribution',moveButton,complete:false,releaseReady:false,
 source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:hash(await readFile(new URL(import.meta.url))),
 fixture:{elements:32,clocks:4,wallet:4,static:24},checks,errors,external,requests,commands:[],
 limitations:['External native DOM event observers alter scheduling; no ordinary-cost conclusion. CDP command order has no added per-step round trips.',
 'Same saved 32-element fixture, viewport and 6-second idle precede first drag; fresh process for each variant/button mode.',
 'Record mismatched geometry without discarding the arm; complete denotes completed diagnostic, not semantic acceptance.',
 'No app handler hooks, source modifications, virtual clock, profiler, forced GC or provider requests.']};
let app,chrome,page;
const ready=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z'});
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const check=(name,details={})=>checks.push({name,passed:true,...details});
async function setup(){
    page=await chrome.page();
    const owned=new Map();
    page.on(e=>{
        if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);
        if(e.method==='Network.requestWillBeSent'&&/\/api\//.test(e.params.request.url)){
            const row={method:e.params.request.method,path:new URL(e.params.request.url).pathname};
            requests.push(row);owned.set(e.params.requestId,row);
        }
        if(e.method==='Network.responseReceived'&&owned.has(e.params.requestId))owned.get(e.params.requestId).status=e.params.response.status;
        if(e.method==='Network.loadingFinished'&&owned.has(e.params.requestId))owned.get(e.params.requestId).encodedDataLength=e.params.encodedDataLength;
    });
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Performance.enable'])await page.call(method);
    await page.call('Network.setBlockedURLs',{urls:['https://*']});
    await page.call('Emulation.setDeviceMetricsOverride',{width:1800,height:1100,deviceScaleFactor:1,mobile:false});
}
function seedAdministrative(){
    const db=app.store.db,at='2026-10-08T00:00:00.000Z',expires='2099-01-01T00:00:00.000Z';
    const hubPut=db.prepare('INSERT INTO market_hubs(id,name,station_name,kind,system_id,system_name,region_id,region_name) VALUES(?,?,?,?,?,?,?,?)');
    for(let i=0;i<8;i++)hubPut.run(70000000+i,'Fixture hub '+i,'Fixture station '+i,'station',30000142,'Jita',10000002,'The Forge');
    const hubs=db.prepare('SELECT id,name FROM market_hubs ORDER BY id').all();
    assert.equal(hubs.length,12);
    const typePut=db.prepare('INSERT INTO market_types(type_id,name,group_name,volume) VALUES(?,?,?,?)');
    for(let i=0;i<240;i++)typePut.run(2000000+i,'Fixture commodity '+String(i).padStart(3,'0'),'Fixture',1);
    app.store.set('market:quick',Array.from({length:60},(_,i)=>2000000+i));
    const itemPut=db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    for(const hub of hubs){
        const scan={jobId:'saved-'+hub.id,at,observed:at,characterName:'Synthetic public book',mode:'quick'};
        db.prepare('UPDATE market_hubs SET last_scan=? WHERE id=?').run(JSON.stringify(scan),hub.id);
        for(let i=0;i<240;i++)itemPut.run(hub.id,2000000+i,100+i,110+i,110+i,1000,1000,2,2,at,expires,scan.jobId);
    }
    const books=hubs.map(h=>({hubId:h.id,name:h.name,items:240}));
    for(let i=0;i<8;i++)db.prepare('INSERT INTO market_jobs(id,body) VALUES(?,?)').run('saved-job-'+i,JSON.stringify({id:'saved-job-'+i,status:'complete',hubId:60003760,mode:'quick',books,detail:'Completed populated fixture '+i,historyDone:240,historyTotal:240,pages:12,startedAt:at,endedAt:at}));
    const obs=defaultOBS();obs.collection='Synthetic collection';
    for(const state of Object.keys(obs.rules))obs.rules[state]=Array.from({length:24},(_,i)=>({id:state+'-'+i,kind:i%2?'audio':'source',sceneName:'Fixture scene',sourceName:'Fixture source '+i,sceneItemId:i,group:false,enabled:false}));
    app.store.set('obs',sanitizeOBS(obs));
    app.store.set('obs.space-categories-v3',true);
    const overview=app.core.markets.overview(),obsValue={config:app.core.obs.config(),status:app.core.obs.status()};
    result.fixture.observed={hubs:overview.hubs.length,items:db.prepare('SELECT COUNT(*) n FROM market_items').get().n,quickTypes:overview.quick.length,jobs:overview.jobs.length,obsStates:Object.keys(obsValue.config.rules).length,obsTotalActions:Object.values(obsValue.config.rules).reduce((sum,list)=>sum+list.length,0),marketsJsonBytes:bytes(overview),obsJsonBytes:bytes(obsValue),obsStatusJsonBytes:bytes(obsValue.status)};
    check('Populated saved fixture',result.fixture.observed);
}

const installObserver=`(()=>{
 const element=document.querySelector('[aria-label="Position Element 4"]'),stage=document.querySelector('.canvas-checker');
 const describe=e=>!e?null:{tag:e.tagName||e.nodeName,id:e.id||'',className:typeof e.className==='string'?e.className:'',ariaLabel:e.getAttribute?.('aria-label')||''};
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom}};
 const style=e=>{const s=getComputedStyle(e);return Object.fromEntries(['position','left','top','width','height','transform','zoom','pointerEvents','touchAction','overflow','zIndex'].map(k=>[k,s[k]]))};
 const geometry=(x,y,pointerId)=>{
   const r=rect(element),s=rect(stage),hit=Number.isFinite(x)&&Number.isFinite(y)?document.elementFromPoint(x,y):null;
   return{element:rect(element),stage:s,draftX:Math.round(parseFloat(element.style.left)*19.2),draftY:Math.round(parseFloat(element.style.top)*10.8),
     inline:{left:element.style.left,top:element.style.top,width:element.style.width,height:element.style.height},selected:element.classList.contains('selected'),
     elementStyle:style(element),stageStyle:style(stage),hit:describe(hit),hitWithinElement:!!hit&&element.contains(hit),hitWithinStage:!!hit&&stage.contains(hit),
     elementContainsPoint:Number.isFinite(x)&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom,
     connected:element.isConnected,hasPointerCapture:pointerId===undefined?null:element.hasPointerCapture(pointerId),
     active:describe(document.activeElement),scrollX,scrollY,devicePixelRatio,
     inspector:Array.from(document.querySelectorAll('.inspector .property-grid input')).slice(0,4).map(e=>e.value)};
 };
 const events=[],listeners=[];window.__studioPointerDiagnostic={events,geometry,elementIdentity:element};
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mousemove','mouseup']){
   for(const capture of [true,false]){
     const listener=event=>{const row={index:events.length,type:event.type,listenerPhase:capture?'document-capture':'document-bubble',eventPhase:event.eventPhase,
       isTrusted:event.isTrusted,timeStamp:event.timeStamp,button:event.button,buttons:event.buttons,pointerId:event.pointerId,pointerType:event.pointerType,
       clientX:event.clientX,clientY:event.clientY,target:describe(event.target),defaultPrevented:event.defaultPrevented,
       geometry:geometry(event.clientX,event.clientY,event.pointerId)};events.push(row);
       if(!capture&&event.type!=='pointermove'&&event.type!=='mousemove')queueMicrotask(()=>events.push({type:event.type,listenerPhase:'after-bubble-microtask',geometry:geometry(event.clientX,event.clientY,event.pointerId)}));
     };document.addEventListener(name,listener,capture);listeners.push([name,listener,capture]);
   }
 }
 window.__studioPointerDiagnostic.stop=()=>listeners.forEach(([name,fn,capture])=>document.removeEventListener(name,fn,capture));
 return{initial:geometry(),element:describe(element)};
})()`;
async function diagnostic(){
 await page.call('Page.navigate',{url:app.origin+'/#studio'});
 await page.waitFor("document.querySelectorAll('.canvas-element').length===32&&document.querySelector('[aria-label=\"Position Element 4\"] .widget-value')?.textContent==='1,000 ISK'");
 await delay(800);await delay(6000);
 result.observer=await page.evaluate(installObserver);
 const before=await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Position Element 4"]'),r=e.getBoundingClientRect(),s=document.querySelector('.canvas-checker').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,draftX:Math.round(parseFloat(e.style.left)*19.2),draftY:Math.round(parseFloat(e.style.top)*10.8),stageWidth:s.width,stageHeight:s.height}})()`);
 result.before=before;
 result.initialHit=await page.evaluate(`window.__studioPointerDiagnostic.geometry(${before.x},${before.y})`);
 const command=async(params,label)=>{
   result.commands.push({label,method:'Input.dispatchMouseEvent',params});await page.call('Input.dispatchMouseEvent',params);
 };
 await command({type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1},'press');
 for(let i=1;i<=40;i++)await command({type:'mouseMoved',x:before.x+i,y:before.y+i/3,buttons:1,...(moveButton==='left'?{button:'left'}:{})},'move-'+i);
 await command({type:'mouseReleased',x:before.x+40,y:before.y+40/3,button:'left',clickCount:1},'release');
 await delay(700);
 result.after=await page.evaluate(`window.__studioPointerDiagnostic.geometry(${before.x+40},${before.y+40/3},1)`);
 result.expected={x:Math.max(0,Math.min(1520,Math.round((before.draftX+40/before.stageWidth*1920)/4)*4)),y:Math.max(0,Math.min(980,Math.round((before.draftY+(40/3)/before.stageHeight*1080)/4)*4))};
 result.geometryMatchesExpected=result.after.draftX===result.expected.x&&result.after.draftY===result.expected.y;
 result.stageSizeStable=result.after.stage.width===before.stageWidth&&result.after.stage.height===before.stageHeight;
 result.events=await page.evaluate('window.__studioPointerDiagnostic.events');
 result.sameDOMElement=await page.evaluate(`window.__studioPointerDiagnostic.elementIdentity===document.querySelector('[aria-label="Position Element 4"]')`);
 result.saved=app.core.stream.config().elements[4];
 result.savedGeometryUnchanged=result.saved.x===40&&result.saved.y===155;
 await page.evaluate('window.__studioPointerDiagnostic.stop()');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(result.savedGeometryUnchanged,true);
}
try{
    const deny=async url=>{external.push(String(url));throw Error('External traffic disabled');};
    app=await startKairo({port:18732,streamPort:18733,dataDir:join(dir,'data'),noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
    app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Populated UI Pilot','[]','synthetic-unusable-token');
    app.store.saveSnapshot(42,'wallet',ready(1000));seedAdministrative();
    const layout=defaultStream();
    layout.elements=Array.from({length:32},(_,i)=>({id:'element-'+i,name:'Element '+i,kind:i<4?'clock':'text',binding:i>=4&&i<8?'wallet.balance':'none',characterId:42,text:'Static '+i,label:'Fixture '+i,x:40+(i%4)*450,y:30+Math.floor(i/4)*125,width:400,height:100,fontSize:24,color:'#97ebce',opacity:.7,visible:true,appearance:'frame'}));
    app.core.stream.save(layout);app.core.updateBindings();

 chrome=await chromeProcess();result.browser=chrome.version;await setup();await diagnostic();
 await verifySource(source);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
 const cleanup=[];
 for(const [name,close]of [['chrome',()=>chrome?.close()],['app',()=>app?.close()],['temporary-data',()=>rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})]]){
  try{const receipt=await close();cleanup.push({name,complete:true,...(receipt||{})});}catch(error){cleanup.push({name,complete:false,error:error.stack});result.complete=false;process.exitCode=1;}
 }
 result.cleanup=cleanup;result.cleanupVerified=cleanup.every(r=>r.complete)&&cleanup.find(r=>r.name==='chrome')?.processExitVerified===true;
 if(!result.cleanupVerified){result.complete=false;process.exitCode=1;}
 result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({complete:result.complete,output,geometryMatchesExpected:result.geometryMatchesExpected,failure:result.failure,cleanupVerified:result.cleanupVerified}));
}
