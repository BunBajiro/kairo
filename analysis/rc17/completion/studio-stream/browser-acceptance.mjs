// Diagnostic acceptance only: real compiled Studio, renderer DOM, local HTTP/SSE.
// Not a timing benchmark; observation hooks intentionally count writes/requests.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../rc16/historical/tests/performance/chrome.mjs';
import {captureSource,verifySource} from '../../harness/source-manifest.mjs';
import {digest} from '../startup/fixture.mjs';

const repo=resolve(process.env.KAIRO_BENCH_REPO||'/workspace/scratch/a2f3334402fc/kairo-rc17-completion');
const output=resolve(process.env.KAIRO_BROWSER_OUTPUT||'analysis/rc17/completion/studio-stream/browser-result');
const port=Number(process.env.KAIRO_BROWSER_PORT||18920);
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const {defaultStream}=await import(pathToFileURL(join(repo,'server/stream.mjs')));
await mkdir(output,{recursive:true});const dir=await mkdtemp(join(tmpdir(),'kairo-studio-acceptance-'));
const source=await captureSource(repo);assert.ok(source.builtFiles.length,'Build current source before running this compiled-browser lane');
await writeFile(join(output,'source-manifest.json'),JSON.stringify(source,null,2));
assert.ok(process.env.KAIRO_BUILD_RECEIPT,'Set KAIRO_BUILD_RECEIPT for the exact frozen source/build');
const receiptBytes=await readFile(process.env.KAIRO_BUILD_RECEIPT),buildReceipt=JSON.parse(receiptBytes);assert.equal(buildReceipt.sourceFingerprint,source.fingerprint);assert.equal(buildReceipt.exitCode,0);assert.ok(buildReceipt.buildCommand&&buildReceipt.completedAt&&/^[a-f0-9]{64}$/.test(buildReceipt.logSha256));if(buildReceipt.buildLog)assert.equal(digest(await readFile(buildReceipt.buildLog)),buildReceipt.logSha256);await writeFile(join(output,'build-receipt.json'),receiptBytes);
const harnessHashes={};for(const path of ['./browser-acceptance.mjs','../../../rc16/historical/tests/performance/chrome.mjs','../startup/fixture.mjs','../../harness/source-manifest.mjs'])harnessHashes[path]=digest(await readFile(new URL(path,import.meta.url)));
const checks=[],errors=[],external=[],result={startedAt:new Date().toISOString(),sourceCommit:source.sourceCommit,sourceFingerprint:source.fingerprint,sourceDirty:source.dirty,buildReceiptSha256:digest(receiptBytes),harnessHashes,complete:false,checks,errors,external};
let app,chrome,studio,stream,failure;
const denyExternal=async url=>{external.push(String(url));throw new Error('External request denied');};
const canvas=id=>'[aria-label="Position '+id+'"]';
const find=selector=>'document.querySelector('+JSON.stringify(selector)+')';
const button=text=>'Array.from(document.querySelectorAll("button")).find(e=>e.textContent.trim()==='+JSON.stringify(text)+')';
async function count(){return studio.evaluate('window.__studio.preview');}
async function settled(){await delay(550);}
async function click(selector){await studio.click(find(selector));}
async function choice(label,text){await click('[aria-label="'+label+'"]');await studio.click('Array.from(document.querySelectorAll("[role=option]")).find(e=>e.textContent.trim()==='+JSON.stringify(text)+')');}
async function api(path,method='GET',body){return studio.evaluate(`(async()=>{const boot=await fetch('/api/bootstrap').then(r=>r.json());const r=await fetch('/api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Kairo-CSRF':boot.csrf},body:${body===undefined?'undefined':JSON.stringify(JSON.stringify(body))}});if(!r.ok)throw Error(await r.text());return r.json();})()`);}
async function text(id){return studio.evaluate(find(canvas(id)+' .widget-value')+'?.textContent');}
async function screenshot(page,name){const shot=await page.call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));}
const element=(id,kind,x,y,part={})=>({id,kind,name:id,text:id,label:'',x,y,width:360,height:120,fontSize:24,color:'#97ebce',opacity:.7,visible:true,appearance:'frame',binding:'none',...part});
const sample=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
// Drive the real protection classifier with approved, fresh fixture inputs. A
// direct stream.setOPSEC override is overwritten by Core's protection ticker.
function protection(manual){
    app.store.set('opsec',{manual,allowHighsec:true,characterId:42,blueAlliances:[],hostileAlliances:[]});
    app.store.saveSnapshot(42,'location',sample({solar_system_id:30000142,system:{security_status:.9,constellation_id:20000020,region_id:10000002},constellation:{region_id:10000002}}));
    app.store.saveSnapshot(0,'fw',sample([]));app.store.saveSnapshot(0,'sovereignty',sample([]));
    app.core.refreshOPSEC();assert.equal(app.core.stream.getOPSEC().state,manual?'manual':'highsec');assert.equal(app.core.stream.getOPSEC().hidden,manual);
}

async function setup(page,url,script){
    page.on(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
    await page.call('Page.enable');await page.call('Runtime.enable');await page.call('Network.enable');
    await page.call('Network.setBlockedURLs',{urls:['https://*']});
    await page.call('Emulation.setDeviceMetricsOverride',{width:1800,height:1100,deviceScaleFactor:1,mobile:false});
    if(script)await page.call('Page.addScriptToEvaluateOnNewDocument',{source:script});
    await page.call('Page.navigate',{url});
}
try{
    app=await startKairo({port,streamPort:port+1,dataDir:join(dir,'data'),noSync:true,fetcher:denyExternal,universe:{operations:{noSync:true,fetcher:denyExternal},feeds:{noSync:true,fetcher:denyExternal}}});
    for(const id of [42,43])app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(id,'Review pilot '+id,JSON.stringify(id===42?['esi-location.read_location.v1']:[]),'{}');
    app.store.saveSnapshot(42,'wallet',sample(1000));app.store.saveSnapshot(43,'wallet',sample(2000));
    app.store.db.prepare('INSERT INTO goals VALUES(?,?,?,?,?,?,?,?)').run('goal43',43,'Other pilot objective',100,25,'manual',0,new Date().toISOString());
    app.store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,NULL)').run('session43',43,'Other pilot flight',new Date(Date.now()-65000).toISOString());
    const layout=defaultStream();layout.elements=[
        element('Wallet','text',40,40,{binding:'wallet.balance',characterId:42}),
        element('Goal','goal',440,40,{binding:'goal.progress',characterId:43,sourceId:'goal43'}),
        element('Session','text',840,40,{binding:'session.elapsed',characterId:43}),
        element('Clock','clock',40,250),element('Countdown','countdown',440,250,{endsAt:Date.now()+60000}),
        element('Cover','opsec',1260,600,{width:520,height:320,opacity:1}),
        ...Array.from({length:12},(_,i)=>element('Static '+i,'text',40+(i%4)*400,450+Math.floor(i/4)*150,{width:340,height:100})),
    ];
    app.core.stream.save(layout);app.core.updateBindings();protection(false);
    chrome=await chromeProcess();result.chrome=chrome.version;studio=await chrome.page();
    await setup(studio,app.origin+'/#studio',`(()=>{const native=window.fetch;window.__studio={preview:0,inflight:0,maxInflight:0};window.fetch=async function(input,init){if(String(input).includes('/stream/preview')&&init?.method==='POST'){window.__studio.preview++;window.__studio.inflight++;window.__studio.maxInflight=Math.max(window.__studio.maxInflight,window.__studio.inflight);try{const r=await native.call(this,input,init);if(window.__holdPreview&&!window.__previewHeld){window.__previewHeld=true;await new Promise(resolve=>window.__releasePreview=resolve);}return r;}finally{window.__studio.inflight--;}}return native.call(this,input,init);};})()`);
    await studio.waitFor(find(canvas('Wallet')+' .widget-value')+"?.textContent==='1,000 ISK'");await settled();
    const initial=await count();assert.ok(initial>=1);assert.equal(await text('Goal'),'Other pilot objective');assert.match(await text('Session'),/^0h 1m/);
    checks.push('Compiled Studio mounted with selected-pilot Wallet and nonselected Goal/Session bindings');

    const before=await studio.evaluate(`(()=>{const node=${find(canvas('Wallet'))},r=node.getBoundingClientRect(),s=document.querySelector('.canvas-checker').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,left:parseFloat(node.style.left)*19.2,top:parseFloat(node.style.top)*10.8,width:s.width,height:s.height};})()`);
    await studio.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1});
    for(let i=1;i<=8;i++)await studio.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+i*3,y:before.y+i*2,button:'left',buttons:1});
    await studio.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+27,y:before.y+19,button:'left',clickCount:1});await settled();
    const moved=await studio.evaluate(`(()=>{const n=${find(canvas('Wallet'))};return {x:parseFloat(n.style.left)*19.2,y:parseFloat(n.style.top)*10.8};})()`);
    assert.ok(Math.abs(moved.x-Math.round((before.left+27/before.width*1920)/4)*4)<.01);assert.ok(Math.abs(moved.y-Math.round((before.top+19/before.height*1080)/4)*4)<.01);
    assert.equal(await count(),initial,'Drag-only performs zero binding POSTs');assert.equal(app.core.stream.config().elements.find(e=>e.id==='Wallet').x,40,'Unsaved drag does not modify persisted live output');
    await studio.evaluate(find(canvas('Wallet'))+'.focus()');await studio.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await studio.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await settled();
    const keyboard=await studio.evaluate('parseFloat('+find(canvas('Wallet'))+'.style.left)*19.2');assert.ok(Math.abs(keyboard-moved.x-4)<.01);assert.equal(await count(),initial);
    checks.push('Pointer-up grid position and keyboard adjustment persist in the draft with zero binding POSTs');

    await studio.evaluate('window.__holdPreview=true');await studio.click(button('Refresh linked sources'));await studio.waitFor('window.__previewHeld');
    await choice('Widget source character','Review pilot 43');await settled();assert.equal(await studio.evaluate('window.__studio.maxInflight'),1);
    await studio.evaluate('window.__holdPreview=false;window.__releasePreview()');await studio.waitFor(find(canvas('Wallet')+' .widget-value')+"?.textContent==='2,000 ISK'");
    assert.equal(await studio.evaluate('window.__studio.maxInflight'),1);checks.push('A held previous-pilot preview is discarded; newest binding response wins with one transport in flight');
    const manualBefore=await count();await api('/goals/goal43?character=43','PUT',{progress:55});
    await studio.waitFor(find(canvas('Goal')+' .widget-detail')+"?.textContent.includes('55 / 100')");assert.ok(await count()>manualBefore);assert.equal(app.core.stream.config().elements.find(e=>e.id==='Wallet').characterId,42);
    checks.push('A real manual Goal mutation for a nonselected pilot invalidates Studio without saving its draft');
    const timeBefore=await text('Clock'),sessionBefore=await text('Session'),countdownBefore=await text('Countdown'),postsBefore=await count();await delay(1200);
    assert.notEqual(await text('Clock'),timeBefore);assert.notEqual(await text('Session'),sessionBefore);assert.notEqual(await text('Countdown'),countdownBefore);assert.equal(await count(),postsBefore);
    checks.push('Clock, countdown and nonselected Session timer advance without preview traffic');
    await studio.click(button('Save changes'));await studio.waitFor("document.querySelector('.studio-toolbar')?.textContent.includes('Layout saved')");assert.equal(app.core.stream.config().elements.find(e=>e.id==='Wallet').characterId,43);assert.ok(Math.abs(app.core.stream.config().elements.find(e=>e.id==='Wallet').x-keyboard)<.01);
    await studio.click(button('Live output'));await studio.waitFor("!!document.querySelector('iframe[title=\"Saved OBS stream output\"]')");assert.equal(await studio.evaluate("document.querySelector('iframe[title=\"Saved OBS stream output\"]').src"),app.streamOrigin+'/stream');
    checks.push('Explicit Save publishes the latest draft and Live output still opens the persisted source');await screenshot(studio,'studio');
    // The live iframe shares the stream origin/localStorage. Close that verified
    // consumer before fault-injecting storage denial in the standalone source;
    // otherwise it correctly persists newer geometry on the other tab's behalf.
    await studio.click(button('Edit'));await studio.waitFor("!document.querySelector('iframe[title=\"Saved OBS stream output\"]')");

    protection(false);
    stream=await chrome.page();await setup(stream,app.streamOrigin+'/stream',`(()=>{window.__render={text:0,storage:0,denied:0};const NativeDate=Date;window.__now=NativeDate.now();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};const text=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');Object.defineProperty(Node.prototype,'textContent',{...text,set(value){window.__render.text++;return text.set.call(this,value);}});const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.__denyStorage){window.__render.denied++;throw new DOMException('Quota exceeded','QuotaExceededError');}const result=set.call(this,key,value);if(key==='kairo-safe-layout')window.__render.storage++;return result;};})()`);
    await stream.waitFor(`document.querySelectorAll('#stage .element').length===${layout.elements.length-1}`);await delay(400);
    const steady=await stream.evaluate('({...window.__render})');await delay(600);assert.deepEqual(await stream.evaluate('({...window.__render})'),steady,'Frozen same-second display creates no text/storage writes');
    await stream.evaluate('window.__now+=1000');await delay(300);const second=await stream.evaluate('({...window.__render})');assert.equal(second.text-steady.text,3,'Clock, countdown and elapsed Session each write once');assert.equal(second.storage,steady.storage);
    app.store.saveSnapshot(43,'wallet',sample(3000));app.core.updateBindings();await stream.waitFor("document.querySelector('[data-id=Wallet] .content')?.textContent==='3,000 ISK'");assert.equal(await stream.evaluate('window.__render.storage'),steady.storage,'Volatile binding values do not rewrite recovery geometry');
    checks.push('Real renderer DOM: unchanged quarter-second clock ticks do zero writes; three genuine second texts write once; volatile Wallet projection does not persist');

    const saved=app.core.stream.config();saved.elements=saved.elements.map(e=>e.id==='Cover'?{...e,x:777,width:888}:e);app.core.stream.save(saved);await stream.waitFor("JSON.parse(localStorage.getItem('kairo-safe-layout')).elements.find(e=>e.id==='Cover').x===777");
    assert.equal(await stream.evaluate('window.__render.storage'),steady.storage+1);
    protection(true);await stream.waitFor("document.querySelector('[data-id=Cover]')?.dataset.context==='manual'");assert.equal(await stream.evaluate("document.querySelector('[data-id=Cover]').style.width"),'888px');
    await stream.evaluate('window.__denyStorage=true');const changed=app.core.stream.config();changed.elements=changed.elements.map(e=>e.id==='Cover'?{...e,x:999,width:900}:e);app.core.stream.save(changed);await stream.waitFor("document.querySelector('[data-id=Cover]')?.style.left==='999px'");assert.ok(await stream.evaluate('window.__render.denied')>0);
    protection(false);await stream.waitFor("!document.querySelector('[data-id=Cover]')");for(const client of app.core.stream.clients)client.destroy();
    await stream.waitFor("document.querySelector('[data-id=Cover]')?.dataset.context==='unknown'");assert.equal(await stream.evaluate("document.querySelector('[data-id=Cover]').style.left"),'999px');
    checks.push('Latest cover geometry and immediate protection survive storage denial; actual SSE disconnect restores UNKNOWN with the latest in-memory geometry');
    await stream.waitFor("!document.querySelector('[data-id=Cover]')");checks.push('Verified reconnect releases fail-closed protection');
    await stream.call('Network.setBlockedURLs',{urls:['https://*',app.streamOrigin+'/events']});await stream.call('Page.reload');await stream.waitFor("document.querySelector('[data-id=Cover]')?.dataset.context==='unknown'");assert.equal(await stream.evaluate("document.querySelector('[data-id=Cover]').style.left"),'777px','Reload recovers last successful persisted geometry when storage was denied later');
    checks.push('Offline reload restores the last successfully persisted cover fail-closed');await screenshot(stream,'stream-fail-closed');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await verifySource(source);for(const [path,hash]of Object.entries(harnessHashes))assert.equal(digest(await readFile(new URL(path,import.meta.url))),hash);result.sourceVerified=true;result.compiledSourceVerified=true;result.complete=true;
}catch(error){failure=error;result.failure=error.stack;try{if(studio)await screenshot(studio,'failure');result.pageText=await studio?.evaluate('document.body.innerText');}catch{}}
finally{
    try{await chrome?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.cleanupVerified=true;}catch(error){failure??=error;result.cleanupFailure=error.stack;result.complete=false;}
    result.endedAt=new Date().toISOString();await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:result.complete,checks,failure:result.failure,output},null,2));
}
if(failure)throw failure;
