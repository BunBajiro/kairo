// Ordinary browser counters on unmodified compiled application bytes.
// Versioned v2: explicit-left move input supported by pointer-diagnostic-v1; failed v1 retained.
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
const [repoArg,outArg,manifest,mode='ordinary']=process.argv.slice(2);
assert.ok(['ordinary','native-recovery'].includes(mode));
const repo=resolve(repoArg),output=resolve(outArg),source=await loadSourceManifest(manifest,repo);
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const {defaultStream}=await import(pathToFileURL(join(repo,'server/stream.mjs')));
const {defaultOBS,sanitizeOBS}=await import(pathToFileURL(join(repo,'server/obs.mjs')));
const dir=await mkdtemp(join(tmpdir(),'kairo-admin-studio-next-'));
const requests=[],errors=[],external=[],checks=[];
const result={schemaVersion:2,inputRevision:'explicit-left-v2',startedAt:new Date().toISOString(),mode,complete:false,releaseReady:false,
    source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},
    harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    fixture:{elements:32,clocks:4,wallet:4,static:24,dragSteps:40,drags:3,hubs:12,itemsPerHub:240,quickTypes:60,jobs:8,obsActionsPerState:24},
    samples:[],checks,errors,external,
    limitations:[
        'Synthetic populated saved data, actual local HTTP/SSE and compiled UI; no actual ESI, OBS WebSocket, GPU or whole-browser CPU claim.',
        'Ordinary CDP renderer counters include actions/waits; no profiler, virtual clock, application hooks or forced GC.',
        'New-target first-use wall time ends at functional readiness. Counter deltas span initial navigation; any reset is recorded and cannot be interpreted as negative work.',
        'Six-second windows expose legacy 3s/4s polling. Separate candidate-only native-recovery mode observes each 30s deadline over 35s.',
        'Heap endpoints are ordinary uncollected observations, not retained-memory measurements.',
        'Markets running intentionally refreshes every 2s rather than legacy 4s; extra running reads alone are not a regression.',
        'Four fresh ABBA processes are descriptive observations, not significance tests or worst-case cardinality coverage.'
    ]};
let app,chrome,page;
const ready=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z'});
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const check=(name,details={})=>checks.push({name,passed:true,...details});
const count=(rows,path,method='GET')=>rows.filter(r=>r.path===path&&r.method===method).length;

async function metrics(){return Object.fromEntries((await page.call('Performance.getMetrics')).metrics.map(v=>[v.name,v.value]));}
async function phase(label,action){
    const before=await metrics(),r0=requests.length,t0=performance.now();
    await action();
    const after=await metrics();
    const counters={taskMs:'TaskDuration',scriptMs:'ScriptDuration',layoutMs:'LayoutDuration',recalcMs:'RecalcStyleDuration'};
    const sample={label,windowMs:performance.now()-t0,heapBefore:before.JSHeapUsedSize,heapAfter:after.JSHeapUsedSize,requests:requests.slice(r0),countersBefore:before,countersAfter:after};
    for(const [key,counter]of Object.entries(counters))sample[key]=(after[counter]-before[counter])*1000;
    sample.counterReset=Object.keys(counters).some(key=>sample[key]<-0.000001);
    result.samples.push(sample);
    return sample;
}
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
async function route(name,selector){
    await page.click(`document.querySelector('[data-route="${name}"]')`);
    await page.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    await delay(650);
}
function snapshot(value){
    app.store.saveSnapshot(42,'wallet',ready(value));
    // Use the current Core envelope, including current dataRevision metadata.
    const frame='event: snapshot\ndata: '+JSON.stringify({characterId:42,key:'wallet',snapshot:app.core.snapshots(42).wallet,names:{}})+'\n\n';
    for(const client of app.core.uiClients)client.write(frame);
    app.core.updateBindings();
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
async function validateMarket(){
    assert.equal(await page.evaluate("document.querySelectorAll('.market-hub').length"),12);
    assert.equal(await page.evaluate("Array.from(document.querySelectorAll('.market-hub')).every(e=>e.textContent.includes('240 cached items'))"),true);
    check('All 12 cached hub cards visible');
}
async function validateOBS(){
    assert.equal(await page.evaluate("document.querySelectorAll('.obs-action').length"),24);
    check('24 saved actions rendered for selected protection state');
}
async function recovery(){
    await page.call('Page.navigate',{url:app.origin+'/#markets'});
    await page.waitFor("document.querySelectorAll('.market-hub').length===12&&!!document.querySelector('.connection-status.online')");
    await delay(800);await validateMarket();
    let row=await phase('markets-native-recovery-35s',()=>delay(35000));
    assert.equal(count(row.requests,'/api/markets'),1);check('Native visible idle Markets 30s fallback',{windowMs:row.windowMs,reads:1});
    await route('opsec','.obs-controls');await validateOBS();
    row=await phase('obs-native-recovery-35s',()=>delay(35000));
    assert.equal(count(row.requests,'/api/obs'),0);assert.equal(count(row.requests,'/api/obs/status'),1);
    check('Native OBS 30s status-only fallback',{windowMs:row.windowMs,fullReads:0,statusReads:1});
}
async function ordinary(){
    await phase('studio-first-use',async()=>{
        await page.call('Page.navigate',{url:app.origin+'/#studio'});
        await page.waitFor("document.querySelectorAll('.canvas-element').length===32&&document.querySelector('[aria-label=\"Position Element 4\"] .widget-value')?.textContent==='1,000 ISK'");
    });
    await delay(800);
    await phase('studio-idle-native-6s',()=>delay(6000));
    const draft=[];
    await phase('studio-three-drags',async()=>{
        for(let n=0;n<3;n++){
            const before=await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Position Element 4"]'),r=e.getBoundingClientRect(),s=document.querySelector('.canvas-checker').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,draftX:Math.round(parseFloat(e.style.left)*19.2),draftY:Math.round(parseFloat(e.style.top)*10.8),stageWidth:s.width,stageHeight:s.height}})()`);
            await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',buttons:1,clickCount:1});
            for(let i=1;i<=40;i++)await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+i,y:before.y+i/3,button:'left',buttons:1});
            await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+40,y:before.y+40/3,button:'left',clickCount:1});
            await delay(700);
            const after=await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Position Element 4"]'),s=document.querySelector('.canvas-checker').getBoundingClientRect();return{x:Math.round(parseFloat(e.style.left)*19.2),y:Math.round(parseFloat(e.style.top)*10.8),stageWidth:s.width,stageHeight:s.height}})()`);
            assert.equal(after.stageWidth,before.stageWidth);assert.equal(after.stageHeight,before.stageHeight);
            const expected={x:Math.max(0,Math.min(1520,Math.round((before.draftX+40/after.stageWidth*1920)/4)*4)),y:Math.max(0,Math.min(980,Math.round((before.draftY+(40/3)/after.stageHeight*1080)/4)*4))};
            assert.deepEqual({x:after.x,y:after.y},expected);draft.push({before,after,expected});
        }
    });
    assert.equal(app.core.stream.config().elements[4].x,40);assert.equal(app.core.stream.config().elements[4].y,155);
    check('Three drags end at exact grid/clamp draft coordinates; saved output unchanged',{draft});
    await phase('studio-ten-source-updates',async()=>{
        for(let i=0;i<10;i++){snapshot(2000+i);await delay(400);}
        await page.waitFor("document.querySelector('[aria-label=\"Position Element 4\"] .widget-value')?.textContent==='2,009 ISK'");
    });
    await phase('markets-first-route',()=>route('markets','.market-hubs'));await validateMarket();
    await phase('markets-idle-native-6s',()=>delay(6000));
    const running={id:'cost-job',status:'running',hubId:60003760,mode:'quick',books:app.core.markets.overview().jobs[0].books,detail:'Cost running',historyDone:120,historyTotal:240,pages:12};
    app.store.db.prepare('INSERT INTO market_jobs(id,body) VALUES(?,?)').run('cost-job',JSON.stringify(running));
    // Both variants get the same immediate initial read of the running job.
    await route('opsec','.obs-controls');await route('markets','.market-hubs');
    await page.waitFor("document.querySelector('.market-job')?.textContent.includes('Cost running')");
    await phase('markets-running-native-6s',()=>delay(6000));
    await phase('obs-populated-route',()=>route('opsec','.obs-controls'));await validateOBS();
    await phase('obs-idle-native-6s',()=>delay(6000));
    await chrome.closePage(page);await setup();
    await phase('source-first-use',async()=>{
        await page.call('Page.navigate',{url:app.streamOrigin+'/stream'});
        await page.waitFor("document.querySelectorAll('#stage .element').length===32&&document.querySelector('[data-id=\"element-4\"] .content')?.textContent==='2,009 ISK'");
    });
    await delay(650);
    await phase('source-idle-native-6s',()=>delay(6000));
    await phase('source-ten-binding-updates',async()=>{
        for(let i=0;i<10;i++){snapshot(3000+i);await delay(100);}
        await page.waitFor("document.querySelector('[data-id=\"element-4\"] .content')?.textContent==='3,009 ISK'");
    });
    result.finalOutput=await page.evaluate(`(()=>{const e=document.querySelector('[data-id="element-4"]');return{left:e.style.left,top:e.style.top,count:document.querySelectorAll('#stage .element').length,bound:e.querySelector('.content').textContent,staticText:document.querySelector('[data-id="element-8"] .content').textContent}})()`);
    assert.equal(result.finalOutput.count,32);assert.equal(result.finalOutput.bound,'3,009 ISK');assert.equal(result.finalOutput.staticText,'Static 8');
    assert.equal(result.finalOutput.left,'40px');assert.equal(result.finalOutput.top,'155px');
    check('Browser source retains saved geometry, all elements and latest bound/static text',result.finalOutput);
}
try{
    const deny=async url=>{external.push(String(url));throw Error('External traffic disabled');};
    app=await startKairo({port:18732,streamPort:18733,dataDir:join(dir,'data'),noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
    app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Populated UI Pilot','[]','synthetic-unusable-token');
    app.store.saveSnapshot(42,'wallet',ready(1000));seedAdministrative();
    const layout=defaultStream();
    layout.elements=Array.from({length:32},(_,i)=>({id:'element-'+i,name:'Element '+i,kind:i<4?'clock':'text',binding:i>=4&&i<8?'wallet.balance':'none',characterId:42,text:'Static '+i,label:'Fixture '+i,x:40+(i%4)*450,y:30+Math.floor(i/4)*125,width:400,height:100,fontSize:24,color:'#97ebce',opacity:.7,visible:true,appearance:'frame'}));
    app.core.stream.save(layout);app.core.updateBindings();
    chrome=await chromeProcess();result.browser=chrome.version;await setup();
    if(mode==='native-recovery')await recovery();else await ordinary();
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await verifySource(source);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
    const cleanup=[];
    for(const [name,close]of [['chrome',()=>chrome?.close()],['app',()=>app?.close()],['temporary-data',()=>rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})]]){
        try{const receipt=await close();cleanup.push({name,complete:true,...(receipt||{})});}catch(error){cleanup.push({name,complete:false,error:error.stack});result.complete=false;process.exitCode=1;}
    }
    result.cleanup=cleanup;result.cleanupVerified=cleanup.every(r=>r.complete)&&cleanup.find(r=>r.name==='chrome')?.processExitVerified===true;if(!result.cleanupVerified){result.complete=false;process.exitCode=1;}result.endedAt=new Date().toISOString();
    await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({complete:result.complete,mode,output,failure:result.failure,cleanupVerified:result.cleanupVerified}));
}
