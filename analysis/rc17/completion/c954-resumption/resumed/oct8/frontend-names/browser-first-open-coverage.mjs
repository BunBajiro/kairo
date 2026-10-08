// Run only after a fresh build/source manifest, through the coordinator's exclusive runtime slot.
// node browser-acceptance.mjs <app-root> <output.json> <source-manifest.json> [--timing] [--baseline]
// KAIRO_MODELS_LOCKED=1 KAIRO_CHROME_PATH=... KAIRO_MODEL_ROWS=10000
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromeProcess} from '../../../../../../rc16/historical/tests/performance/chrome.mjs';
import {loadSourceManifest,verifySource} from '../../../../../harness/source-manifest.mjs';
const [rootArg,outputArg,manifestArg]=process.argv.slice(2),repo=resolve(rootArg),output=resolve(outputArg),timing=process.argv.includes('--timing'),baseline=process.argv.includes('--baseline');
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1','Coordinator must grant the exclusive runtime slot');assert.equal(timing,true,'Coverage uses unwrapped model/formatter functions');
const source=await loadSourceManifest(manifestArg,repo);assert.ok(source.builtFiles.length,'A production build is required');
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs')));
const count=Number(process.env.KAIRO_MODEL_ROWS||10000);assert.ok(Number.isInteger(count)&&count>=100&&count<=20000);
const at='2026-10-07T09:00:00.000Z',ready=data=>({status:'ready',data,updatedAt:at,expiresAt:'2099-01-01T00:00:00.000Z'}),pad=i=>String(i).padStart(5,'0');
const fixtures=new Map(),names={};
for(const pilot of [42,43]) {
 const prefix=pilot===42?'Asset':'Second Asset',base=pilot*100000;
 const assets=Array.from({length:count},(_,i)=>({item_id:base+i,type_id:base+i,quantity:i+1,location_id:60003760,location_name:'Fixture station',location_flag:'Hangar'}));
 const journal=Array.from({length:count},(_,i)=>({id:base+i,ref_type:'market_transaction',date:at,amount:i%2?-i:i,balance:100000+i,description:'Fixture transaction '+pad(i)}));
 const jobs=Array.from({length:count},(_,i)=>({job_id:base+i,product_type_id:base+i,status:'active',activity_id:1,runs:1,end_date:'2099-01-01T00:00:00.000Z',cost:50}));
 for(let i=0;i<count;i++)names[base+i]=prefix+' '+pad(i);
 fixtures.set(pilot,{assets,journal,jobs,prices:assets.map(r=>({type_id:r.type_id,average_price:2})),transactions:assets.map(r=>({transaction_id:r.item_id,type_id:r.type_id,date:at,quantity:1,unit_price:2,is_buy:true})),orders:assets.map(r=>({order_id:r.item_id,type_id:r.type_id,price:2,volume_remain:1,volume_total:2,location_id:60003760,issued:at})),mining:assets.map(r=>({date:at,type_id:r.type_id,solar_system_id:30000142,quantity:1})),blueprints:assets.map(r=>({...r,quantity:-1,material_efficiency:10,time_efficiency:20,runs:-1})),planets:[{planet_id:1,solar_system_id:30000142,planet_type:'temperate',upgrade_level:4,num_pins:1,last_update:at,details:{pins:[]}}],fittings:[{fitting_id:1,name:'Fixture fit',ship_type_id:base,description:'Expanded details persist',items:[{type_id:base+1,quantity:1}]}]});
}
const dir=await mkdtemp(join(tmpdir(),'kairo-models-ui-')),dataDir=join(dir,'data');
const result={schemaVersion:1,startedAt:new Date().toISOString(),source:{commit:source.sourceCommit,fingerprint:source.fingerprint,dirty:source.dirty},harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),mode:'precise-coverage-diagnostic',baseline,fixture:{pilots:2,rowsPerLargeDataset:count,digest:createHash('sha256').update(JSON.stringify([...fixtures])).digest('hex')},checks:[],samples:[],counts:[],errors:[],external:[],requests:[],complete:false,limitations:['Synthetic populated connected pilots; no real ESI traffic.','Diagnostic counters wrap Array.map/Object.values/Intl constructors by fixture row shape; they count operations, not React commits. Counter mode is never used for CPU comparisons.','Timing mode contains no row/formatter instrumentation. Compare fresh baseline/candidate browsers in ABBA order, same fixture/build configuration.','Renderer CDP task/script/style/layout duration excludes browser/GPU/worker CPU.','No browser virtualization or archive-history performance conclusion; archive belongs to its separate acceptance lane.']};
let app,browser,page;
const seed=openStore(dataDir);
for(const [pilot,fixture]of fixtures) {seed.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot,pilot===42?'Model Pilot':'Second Model Pilot','[]','synthetic-unusable-token');seed.saveSnapshot(pilot,'profile',ready({character_id:pilot,name:pilot===42?'Model Pilot':'Second Model Pilot'}));for(const[key,rows]of Object.entries(fixture))seed.saveSnapshot(pilot,key,ready(rows));seed.saveSnapshot(pilot,'wallet',ready(100000));seed.saveSnapshot(pilot,'skills',ready({total_sp:10000,skills:fixture.assets.map(a=>({skill_id:a.type_id,active_skill_level:4,trained_skill_level:5,skillpoints_in_skill:1000}))}));}
seed.set('names',names);seed.saveSnapshot(0,'prices',ready([...fixtures.values()].flatMap(f=>f.prices)));seed.close();
const instrumentation=`(()=>{const s=window.__modelCounts={map:{},searchRows:0,numberFormat:0,dateFormat:0};const map=Array.prototype.map,values=Object.values;function kind(r){if(!r||typeof r!=='object')return null;if('average_price'in r)return 'prices';if('ref_type'in r&&!('name'in r))return 'journal';if('job_id'in r&&!('name'in r))return 'jobs';if('skill_id'in r&&!('name'in r))return 'skills';if('transaction_id'in r&&!('name'in r))return 'transactions';if('order_id'in r&&!('name'in r))return 'orders';if('item_id'in r&&!('name'in r)&&'location_flag'in r)return 'assets';if('solar_system_id'in r&&'type_id'in r&&!('name'in r))return 'mining';return null;}Array.prototype.map=function(...args){const k=kind(this[0]);if(k){const x=s.map[k]||={calls:0,rows:0};x.calls++;x.rows+=this.length;}return map.apply(this,args);};Object.values=function(r){if(r&&('item_id'in r||'ref_type'in r||'job_id'in r))s.searchRows++;return values(r);};for(const [name,key]of [['NumberFormat','numberFormat'],['DateTimeFormat','dateFormat']])Intl[name]=new Proxy(Intl[name],{construct(target,args,newTarget){s[key]++;return Reflect.construct(target,args,newTarget);}});})()`;
const getCounts=()=>page.evaluate('structuredClone(window.__modelCounts)');
async function phase(label,action){const before=timing?null:await getCounts(),first=timing?await metrics():null,start=performance.now();await action();if(timing){const last=await metrics();result.samples.push({label,windowMs:performance.now()-start,taskMs:(last.TaskDuration-first.TaskDuration)*1000,scriptMs:(last.ScriptDuration-first.ScriptDuration)*1000,layoutMs:(last.LayoutDuration-first.LayoutDuration)*1000,recalcMs:(last.RecalcStyleDuration-first.RecalcStyleDuration)*1000,heapBefore:first.JSHeapUsedSize,heapAfter:last.JSHeapUsedSize});}else{const after=await getCounts(),delta={};for(const key of new Set([...Object.keys(before.map),...Object.keys(after.map)]))delta[key]={calls:(after.map[key]?.calls||0)-(before.map[key]?.calls||0),rows:(after.map[key]?.rows||0)-(before.map[key]?.rows||0)};result.counts.push({label,map:delta,searchRows:after.searchRows-before.searchRows,numberFormat:after.numberFormat-before.numberFormat,dateFormat:after.dateFormat-before.dateFormat});}return result.counts.at(-1);}
async function metrics(){return Object.fromEntries((await page.call('Performance.getMetrics')).metrics.map(row=>[row.name,row.value]));}
async function route(name){await page.click(`document.querySelector('[data-route="${name}"]')`);await page.waitFor(`location.hash===${JSON.stringify('#'+name)}&&!!document.querySelector('[role="tab"]')`);await delay(120);}
async function tab(label){await page.click(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent===${JSON.stringify(label)})`);await page.waitFor(`[...document.querySelectorAll('[role="tab"]')].some(e=>e.textContent===${JSON.stringify(label)}&&e.getAttribute('aria-selected')==='true')`);await delay(100);}
async function search(value){await page.evaluate(`(()=>{const e=document.querySelector('[aria-label="Filter records"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(120);}
function snapshot(pilot,key,data,status='ready'){app.store.saveSnapshot(pilot,key,{...ready(data),status});const snapshot=app.core.snapshots(pilot,false)[key];const body=JSON.stringify({characterId:pilot,key,snapshot,names:app.core.names()});for(const client of app.core.uiClients)client.write('event: snapshot\ndata: '+body+'\n\n');}
function changed(pilot=42){for(const client of app.core.uiClients)client.write('event: changed\ndata: '+JSON.stringify({characterId:pilot})+'\n\n');}
function check(label,ok){result.checks.push({label,passed:!!ok});assert.ok(ok,label);}
try {
 const deny=async url=>{result.external.push(String(url));throw Error('External traffic disabled by fixture');};app=await startKairo({port:18730,streamPort:18731,dataDir,noSync:true,deferDatasetStart:true,fetcher:deny,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});
 browser=await chromeProcess();page=await browser.page();result.browser=browser.version;
 page.on(event=>{if(event.method==='Runtime.exceptionThrown')result.errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);if(event.method==='Network.requestWillBeSent'&&event.params.request.url.includes('/api/'))result.requests.push({method:event.params.request.method,url:event.params.request.url});});
 for(const method of ['Page.enable','Runtime.enable','Network.enable','Performance.enable'])await page.call(method);
 await page.call('Network.setBlockedURLs',{urls:['https://*','http://images.evetech.net/*','http://web.ccpgamescdn.com/*']});await page.call('Emulation.setDeviceMetricsOverride',{width:1600,height:1050,deviceScaleFactor:1,mobile:false});
 if(!timing)await page.call('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation});
 await page.call('Profiler.enable');await page.call('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
 await page.call('Page.navigate',{url:app.origin+'/#overview'});await page.waitFor('!!document.querySelector(".connection-status.online")');await delay(200);
 if(!timing)result.coldOverviewCounts=await getCounts();
 await phase('assets-first-open',()=>route('assets'));await page.waitFor('document.querySelectorAll("tbody tr").length===30');
 const coverage=await page.call('Profiler.takePreciseCoverage');await page.call('Profiler.stopPreciseCoverage');
 const mappings=[];
 for(const file of source.builtFiles.filter(file=>/dist\/client\/assets\/page-.*\.js$/.test(file.path))){
  const bytes=await readFile(join(repo,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);const code=bytes.toString('utf8');
  const pattern=/function (\w+)\((\w+),(\w+)\)\{if\(!\3\)return \2;for\(let (\w+) of Object.keys\(\3\)\)if\(!Object.hasOwn\(\2,\4\)\|\|!Object.is\(\2\[\4\],\3\[\4\]\)\)return\{\.\.\.\2,\.\.\.\3\};return \2\}/g;
  for(const match of code.matchAll(pattern)){const script=coverage.result.find(row=>row.url.endsWith('/'+file.path.split('/').at(-1)));assert.ok(script,'Measured page asset must be present in coverage');const fn=script.functions.find(fn=>fn.functionName===match[1]&&fn.ranges.some(range=>range.startOffset>=match.index&&range.startOffset<match.index+match[0].length));assert.ok(fn,'Find exact compiled helper range');mappings.push({asset:file.path,assetSha256:file.sha256,symbol:match[1],sourceStart:match.index,sourceEnd:match.index+match[0].length,compiledBody:match[0],coverage:fn});await writeFile(output+'.page-coverage.json',JSON.stringify(script,null,2)+'\n',{flag:'wx'});}
 }
 assert.equal(mappings.length,1);result.nameOwnerCoverage=mappings[0];check('name merge helper has no calls through initial Overview and first Assets open',mappings[0].coverage.ranges.every(range=>range.count===0));
 result.limitations.push('Precise coverage instruments V8 execution; diagnostic phase timing values must not be compared as ordinary performance.');
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);await verifySource(source);result.sourceVerified=true;result.complete=true;
} catch(error){result.failure=error.stack;if(page)result.failureState=await page.evaluate('({url:location.href,body:document.body.innerText.slice(-12000)})').catch(()=>null);throw error;}
finally {result.endedAt=new Date().toISOString();await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');await browser?.close();await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
