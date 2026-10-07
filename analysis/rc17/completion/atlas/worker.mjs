// Fresh-process backend diagnostic. Timings, collected heap and counters are
// separate runs; no counter wrappers are installed in a timing/heap child.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {digest,distribution,AT} from '../startup/fixture.mjs';
const [rootArg,manifestPath,lane,mode]=process.argv.slice(2);
assert.ok(rootArg&&manifestPath&&['atlas','format'].includes(lane)&&['timing','heap','counters'].includes(mode));
if(mode==='heap')assert.equal(typeof globalThis.gc,'function');
const root=resolve(rootArg),directory=await mkdtemp(join(tmpdir(),'kairo-atlas-conditional-'));
process.env.KAIRO_DATA_DIR=directory;process.env.KAIRO_SDE_DIRECTORY=join(root,'server/data');
let attempts=0,store,universe;
const deny=async()=>{attempts++;throw Error('External network forbidden in conditional index lane');};globalThis.fetch=deny;
const moduleAt=name=>import(pathToFileURL(join(root,'server',name)).href);
const report={schemaVersion:1,lane,mode,complete:false,timings:{},heap:{},counters:{},semantic:{},forcedGC:mode==='heap',instrumentedCounters:mode==='counters',productionAcceptance:false};
const measure=async(name,work)=>{const start=performance.now(),value=await work();if(mode==='timing')report.timings[name]=performance.now()-start;return value;};
async function heap(name){if(mode!=='heap')return;for(let i=0;i<3;i++){globalThis.gc();await new Promise(setImmediate);}report.heap[name]=process.memoryUsage();}
async function maps(name,work){if(mode!=='counters')return work();const Native=Map,created=[];globalThis.Map=class extends Native{constructor(...args){super(...args);created.push(this);}};try{const value=await work();report.counters[name]={maps:created.length,entries:created.reduce((sum,map)=>sum+map.size,0),sizes:created.map(map=>map.size),fullAtlasMaps:created.filter(map=>map.size===8490).length};return value;}finally{globalThis.Map=Native;}}
async function warm(name,work,count=80){let last;const samples=[];for(let i=0;i<count;i++){const start=performance.now();last=work();if(mode==='timing')samples.push(performance.now()-start);await new Promise(setImmediate);}if(mode==='timing')report.timings[name]=distribution(samples);return last;}
const auth={characters:()=>[{id:42,name:'Diagnostic pilot',scopes:[]}]};
try{
 if(lane==='atlas'){
    const {openStore}=await moduleAt('store.mjs');store=openStore(directory);
    await heap('beforeImport');
    const modules=await measure('coldUniverseImportMs',async()=>Promise.all([moduleAt('universe.mjs'),moduleAt('universe-static.mjs')]));
    const [{createUniverse},{getUniverseStatic}]=modules;await heap('afterImport');
    const atlas=await measure('topologyLoadMs',()=>maps('topology',()=>getUniverseStatic()));await heap('afterTopology');
    universe=await measure('universeConstructionMs',()=>maps('universeConstruction',()=>createUniverse(store,auth,{request:deny,names:deny},{now:()=>AT,noSync:true,feeds:{fetcher:deny,noSync:true},operations:{fetcher:deny,noSync:true}})));await heap('afterUniverse');
    const input={text:'Jita 3 hostile ships moving to New Caldari'};
    const intel=await measure('firstIntelUseMs',()=>universe.operations.ingestIntel(42,input));
    const itinerary={originId:'Jita',stops:[{id:'amarr',systemId:'Amarr'},{id:'new-caldari',systemId:'New Caldari'}]};
    const nav=await measure('firstNavigationUseMs',()=>universe.navigation.saveItinerary(42,itinerary));await heap('afterFirstUse');
    const intelFields=value=>({system_ids:value.system_ids,ambiguous_systems:value.ambiguous_systems,kind:value.kind,text:value.text,observed_at:value.observed_at});
    const navFields=value=>({originId:value.itinerary.originId,stops:value.itinerary.stops,kind:value.itinerary.kind});
    report.semantic.intel=digest(intelFields(intel));report.semantic.navigation=digest(navFields(nav));
    assert.equal(digest(intelFields(await warm('warmIntelUseMs',()=>universe.operations.ingestIntel(42,input)))),report.semantic.intel);
    assert.equal(digest(navFields(await warm('warmNavigationUseMs',()=>universe.navigation.saveItinerary(42,itinerary)))),report.semantic.navigation);
    report.fixture={systems:atlas.systems.length,gates:atlas.gates.length,atlasSha256:digest(await readFile(join(root,'server/data/universe.json.gz')))};
    report.semantic.topology=digest({systems:atlas.systems,gates:atlas.gates});
    if(mode==='timing')report.timings.coldImportTopologyUniverseFirstUseMs=report.timings.coldUniverseImportMs+report.timings.topologyLoadMs+report.timings.universeConstructionMs+report.timings.firstIntelUseMs+report.timings.firstNavigationUseMs;
    // Mutation/privacy assertions happen outside all measured phases.
    assert.equal(Object.isFrozen(atlas),true);assert.equal(Object.isFrozen(atlas.systems),true);assert.equal(typeof atlas.bySystemId.set,'undefined');
    if(atlas.bySystemName){assert.equal(typeof atlas.bySystemName.set,'undefined');assert.equal(atlas.bySystemName.get('jita'),atlas.bySystemId.get(30000142));}
    assert.equal(universe.navigation.state(0).itinerary.stops.length,0);
    const {createIntelParser}=await moduleAt('universe-intel.mjs');
    const custom={systems:[{system_id:1,name:'Alp'},{system_id:2,name:'Alpha'},{system_id:3,name:'Alpine'},{system_id:4,name:'New Caldari'},{system_id:5,name:'New Caldari Prime'},{system_id:6,name:'Alp'}]};
    const parse=createIntelParser(custom),refs=value=>({system_ids:value.system_ids,ambiguous_systems:value.ambiguous_systems});
    assert.deepEqual(refs(parse({text:'Alp New Caldari Prime Alph'},AT)),{system_ids:[2,5,6],ambiguous_systems:[]});
    assert.deepEqual(refs(parse({text:'Al'},AT)),{system_ids:[],ambiguous_systems:[]});
    report.semantic.injectedParser=digest(refs(parse({text:'Alp New Caldari Prime Alph'},AT)));
    await universe.close();universe=null;store.close();store=null;await heap('afterClose');
 }else{
    const Original=Intl.NumberFormat;let formatterConstructors=0;
    if(mode==='counters')Intl.NumberFormat=new Proxy(Original,{construct(target,args){formatterConstructors++;return Reflect.construct(target,args,target);}});
    const fixtureStore={get:(_key,fallback)=>fallback,snapshot:(_id,key)=>({status:'ready',data:key==='wallet'?1234567.89:null,updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()}),db:{prepare:()=>({get:()=>({id:'goal',character_id:42,title:'Fixture objective',progress:1234567.89,target:2345678.91,done:0})})}};
    await heap('beforeImport');const {bindingProjection}=await measure('coldProjectionImportMs',()=>moduleAt('projections.mjs'));await heap('afterImport');report.counters.formattersAfterImport=formatterConstructors;
    const wallet={binding:'wallet.balance',characterId:42},goal={binding:'goal.progress',characterId:42,sourceId:'goal',bindingDisplay:'both'};
    const first=await measure('firstFormattedWalletMs',()=>bindingProjection(fixtureStore,auth,wallet));await heap('afterFirstFormat');report.counters.formattersAfterFirst=formatterConstructors;
    const firstGoal=await measure('firstFormattedGoalMs',()=>bindingProjection(fixtureStore,auth,goal));
    const workload=()=>({wallet:bindingProjection(fixtureStore,auth,wallet),goal:bindingProjection(fixtureStore,auth,goal)});
    const warmed=await warm('warmWalletGoalPairMs',workload,100);await heap('afterWarm');report.counters.formattersAfterWarm=formatterConstructors;
    assert.equal(first.text,'1,234,567.89 ISK');assert.equal(firstGoal.detail,'1,234,567.89 / 2,345,678.91');
    report.semantic.formatted=digest({wallet:first,goal:firstGoal});assert.equal(digest(warmed),report.semantic.formatted);
    if(mode==='timing')report.timings.coldImportFirstFormattedPairMs=report.timings.coldProjectionImportMs+report.timings.firstFormattedWalletMs+report.timings.firstFormattedGoalMs;
    if(mode==='counters')Intl.NumberFormat=Original;
 }
 assert.equal(attempts,0);report.complete=true;
}finally{await universe?.close();store?.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
const {loadSourceManifest}=await import('../../harness/source-manifest.mjs');const manifest=await loadSourceManifest(manifestPath,root);
report.source={commit:manifest.sourceCommit,fingerprint:manifest.fingerprint,manifestSha256:digest(await readFile(manifestPath)),dirty:manifest.dirty};report.endVerified=true;report.networkAttempts=attempts;
report.environment={node:process.version,cpu:cpus()[0]?.model,platform:process.platform,arch:process.arch};console.log(JSON.stringify(report));
