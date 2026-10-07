// Uninstrumented renderer metrics, real HTTP/SSE. Run under the shared flock.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {chromeProcess} from '../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const [repoArg,outArg,manifest]=process.argv.slice(2),repo=resolve(repoArg),output=resolve(outArg),source=await loadSourceManifest(manifest,repo);
const {startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs'))),{defaultStream}=await import(pathToFileURL(join(repo,'server/stream.mjs')));
const dir=await mkdtemp(join(tmpdir(),'kairo-populated-ui-')),requests=[],errors=[],external=[];
const result={startedAt:new Date().toISOString(),source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixture:{elements:32,clocks:4,wallet:4,static:24,dragSteps:40,drags:3},samples:[],complete:false,errors,external,limitations:['Synthetic populated 32-element layout and local HTTP/SSE; no real OBS/ESI or GPU/whole-browser CPU claim.','Uninstrumented production application; CDP counters include action/wait time and observed request events only.','Native 6-second administrative idle windows cover old 3s/4s polling but not the new 30s fallback; exact longer-window correctness is separate.','Compare ABBA fresh processes/browsers under shared exclusive lock; these are descriptive samples, not significance tests.']};
let app,chrome,page;
const ready=data=>({status:'ready',data,updatedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z'});
async function metrics(){return Object.fromEntries((await page.call('Performance.getMetrics')).metrics.map(v=>[v.name,v.value]));}
async function phase(label,action){const m0=await metrics(),r0=requests.length,t0=performance.now();await action();const m1=await metrics();result.samples.push({label,windowMs:performance.now()-t0,taskMs:(m1.TaskDuration-m0.TaskDuration)*1000,scriptMs:(m1.ScriptDuration-m0.ScriptDuration)*1000,layoutMs:(m1.LayoutDuration-m0.LayoutDuration)*1000,recalcMs:(m1.RecalcStyleDuration-m0.RecalcStyleDuration)*1000,heapBefore:m0.JSHeapUsedSize,heapAfter:m1.JSHeapUsedSize,requests:requests.slice(r0)});}
async function setup(url){page=await chrome.page();page.on(e=>{if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);if(e.method==='Network.requestWillBeSent'&&/\/api\//.test(e.params.request.url))requests.push({method:e.params.request.method,path:new URL(e.params.request.url).pathname});});for(const m of ['Page.enable','Runtime.enable','Network.enable','Performance.enable'])await page.call(m);await page.call('Network.setBlockedURLs',{urls:['https://*']});await page.call('Emulation.setDeviceMetricsOverride',{width:1800,height:1100,deviceScaleFactor:1,mobile:false});await page.call('Page.navigate',{url});}
async function route(name,selector){await page.click(`document.querySelector('[data-route="${name}"]')`);await page.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);await delay(650);}
function snapshot(value){const row=ready(value);app.store.saveSnapshot(42,'wallet',row);for(const client of app.core.uiClients)client.write('event: snapshot\ndata: '+JSON.stringify({characterId:42,key:'wallet',snapshot:row,names:{}})+'\n\n');app.core.updateBindings();}
try{
 const deny=async url=>{external.push(String(url));throw Error('External traffic disabled');};app=await startKairo({port:18732,streamPort:18733,dataDir:join(dir,'data'),noSync:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(42,'Populated UI Pilot','[]','synthetic-unusable-token');app.store.saveSnapshot(42,'wallet',ready(1000));
 const layout=defaultStream();layout.elements=Array.from({length:32},(_,i)=>({id:'element-'+i,name:'Element '+i,kind:i<4?'clock':'text',binding:i>=4&&i<8?'wallet.balance':'none',characterId:42,text:'Static '+i,label:'Fixture '+i,x:40+(i%4)*450,y:30+Math.floor(i/4)*125,width:400,height:100,fontSize:24,color:'#97ebce',opacity:.7,visible:true,appearance:'frame'}));app.core.stream.save(layout);app.core.updateBindings();
 chrome=await chromeProcess();result.browser=chrome.version;await setup(app.origin+'/#studio');await page.waitFor(`document.querySelectorAll('.canvas-element').length===32&&document.querySelector('[aria-label="Position Element 4"] .widget-value')?.textContent==='1,000 ISK'`);await delay(800);
 await phase('studio-idle-native-6s',()=>delay(6000));
 await phase('studio-three-drags',async()=>{for(let n=0;n<3;n++){const p=await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Position Element 4"]'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});for(let i=1;i<=40;i++)await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+i,y:p.y+i/3,buttons:1});await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+40,y:p.y+40/3,button:'left',clickCount:1});await delay(700);}});
 assert.equal(app.core.stream.config().elements[4].x,40,'Unsaved geometry never changes persisted output');
 await phase('studio-ten-source-updates',async()=>{for(let i=0;i<10;i++){snapshot(2000+i);await delay(400);}await page.waitFor(`document.querySelector('[aria-label="Position Element 4"] .widget-value')?.textContent==='2,009 ISK'`);});
 await route('markets','.market-hubs');await phase('markets-idle-native-6s',()=>delay(6000));
 app.store.db.prepare('INSERT INTO market_jobs(id,body) VALUES(?,?)').run('cost-job',JSON.stringify({id:'cost-job',status:'running',hubId:60003760,mode:'quick',books:[],detail:'Cost running',historyDone:0,historyTotal:0,pages:0}));
 // Remount gives both variants the same immediate initial running job read.
 await route('opsec','.obs-controls');await route('markets','.market-hubs');await page.waitFor(`document.querySelector('.market-job')?.textContent.includes('Cost running')`);await phase('markets-running-native-6s',()=>delay(6000));
 await route('opsec','.obs-controls');await phase('obs-idle-native-6s',()=>delay(6000));
 await chrome.closePage(page);await setup(app.streamOrigin+'/stream');await page.waitFor(`document.querySelectorAll('#stage .element').length===32`);await delay(650);
 await phase('source-idle-native-6s',()=>delay(6000));
 await phase('source-ten-binding-updates',async()=>{for(let i=0;i<10;i++){snapshot(3000+i);await delay(100);}await page.waitFor(`document.querySelector('[data-id="element-4"] .content')?.textContent==='3,009 ISK'`);});
 result.finalGeometry=await page.evaluate(`({left:document.querySelector('[data-id="element-4"]').style.left,count:document.querySelectorAll('#stage .element').length})`);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await verifySource(source);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{await chrome?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:result.complete,output,failure:result.failure}));}
