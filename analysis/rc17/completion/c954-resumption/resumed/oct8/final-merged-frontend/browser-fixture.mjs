// Shared declared synthetic fixture. No source mutation and no real ESI traffic.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export async function createProtocolFixture(repo, count=10000) {
const {openStore}=await import(pathToFileURL(join(repo,'server/store.mjs'))),{startKairo}=await import(pathToFileURL(join(repo,'server/index.mjs'))),{catalog,allScopes}=await import(pathToFileURL(join(repo,'server/modules/catalog.mjs')));
const at='2026-10-07T09:00:00.000Z',future='2099-01-01T00:00:00.000Z',ready=data=>({status:'ready',data,updatedAt:at,expiresAt:future,refreshAt:future}),pad=i=>String(i).padStart(5,'0');
const fixtures=new Map(),names={};
for(const pilot of [42,43]) {
 const prefix=pilot===42?'Asset':'Second Asset',base=pilot*100000;
 const assets=Array.from({length:count},(_,i)=>({item_id:base+i,type_id:base+i,quantity:i+1,location_id:60003760,location_name:'Fixture station',location_flag:'Hangar'}));
 const journal=Array.from({length:count},(_,i)=>({id:base+i,ref_type:'market_transaction',date:at,amount:i%2?-i:i,balance:100000+i,description:'Fixture transaction '+pad(i)}));
 const jobs=Array.from({length:count},(_,i)=>({job_id:base+i,product_type_id:base+i,status:'active',activity_id:1,runs:1,end_date:'2099-01-01T00:00:00.000Z',cost:50}));
 for(let i=0;i<count;i++)names[base+i]=prefix+' '+pad(i);
 fixtures.set(pilot,{assets,journal,jobs,prices:assets.map(r=>({type_id:r.type_id,average_price:2})),transactions:assets.map(r=>({transaction_id:r.item_id,type_id:r.type_id,date:at,quantity:1,unit_price:2,is_buy:true})),orders:assets.map(r=>({order_id:r.item_id,type_id:r.type_id,price:2,volume_remain:1,volume_total:2,location_id:60003760,issued:at})),mining:assets.map(r=>({date:at,type_id:r.type_id,solar_system_id:30000142,quantity:1})),blueprints:assets.map(r=>({...r,quantity:-1,material_efficiency:10,time_efficiency:20,runs:-1})),planets:[{planet_id:1,solar_system_id:30000142,planet_type:'temperate',upgrade_level:4,num_pins:1,last_update:at,details:{pins:[]}}],fittings:[{fitting_id:1,name:'Fixture fit',ship_type_id:base,description:'Expanded details persist',items:[{type_id:base+1,quantity:1}]}]});
}

const dir=await mkdtemp(join(tmpdir(),'kairo-protocol-ui-')),dataDir=join(dir,'data'),originalNow=Date.now;
let serverNow=Date.parse(at),app,originalAccess; const provider=[],unexpected=[],clockLedger=[],restartLedger=[]; const walletValues=new Map([[42,100000],[43,100000]]);
const seed=openStore(dataDir);
for(const module of catalog)seed.set('module:'+module.id,['pilot','training','wallet','hangar','industry','universe'].includes(module.id));
for(const [pilot,fixture] of fixtures) {
 seed.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)').run(pilot,pilot===42?'Model Pilot':'Second Model Pilot',JSON.stringify(allScopes),'synthetic-unusable-token');
 for(const module of catalog)for(const dataset of module.datasets)seed.saveSnapshot(module.id==='universe'?0:pilot,dataset.key,ready([]));
 seed.saveSnapshot(pilot,'profile',ready({character_id:pilot,name:pilot===42?'Model Pilot':'Second Model Pilot',corporation_id:98000000+pilot}));
 for(const [key,data] of Object.entries(fixture))seed.saveSnapshot(pilot,key,ready(data));
 seed.saveSnapshot(pilot,'wallet',{...ready(100000),expiresAt:at,refreshAt:at});
 seed.saveSnapshot(pilot,'skills',ready({total_sp:10000,skills:fixture.assets.map(a=>({skill_id:a.type_id,active_skill_level:4,trained_skill_level:5,skillpoints_in_skill:1000}))}));
}
seed.set('names',names);seed.saveSnapshot(0,'prices',ready([...fixtures.values()].flatMap(f=>f.prices)));seed.close();
const deny=async url=>{unexpected.push(String(url));throw Error('External traffic disabled by fixture: '+url);};
const fetcher=async(url,init)=>{
 const u=new URL(String(url)),match=/^\/characters\/(42|43)\/wallet$/.exec(u.pathname);
 if(u.hostname!=='esi.evetech.net'||!match||u.search||init.method!=='GET')return deny(url);
 const pilot=Number(match[1]);assert.equal(init.headers.Authorization,'Bearer synthetic-protocol-'+pilot);
 provider.push({path:u.pathname,pilot,serverNow,value:walletValues.get(pilot)});
 return new Response(JSON.stringify(walletValues.get(pilot)),{headers:{'content-type':'application/json',date:new Date(serverNow).toUTCString(),expires:new Date(serverNow+1000).toUTCString()}});
};
async function start(initialSessions){
 Date.now=()=>serverNow;
 app=await startKairo({port:18740,streamPort:18741,dataDir,initialSessions,noSync:true,deferDatasetStart:true,fetcher,universe:{operations:{noSync:true,fetcher:deny},feeds:{noSync:true,fetcher:deny}}});app.core.quiesce();
 originalAccess=app.auth.access;app.auth.access=async id=>{assert.ok([42,43].includes(id));return 'synthetic-protocol-'+id;};
}
try{await start();}catch(error){Date.now=originalNow;await app?.close();await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});throw error;}
const stable=new Map([42,43].map(id=>[id,Object.fromEntries(Object.entries(app.core.snapshots(id,false)).filter(([key])=>key!=='wallet').map(([key,value])=>[key,value.dataRevision]))]));
async function wallet(pilot,value){
 const previous=app.store.snapshot(pilot,'wallet'),before=app.core.snapshots(pilot,false).wallet.dataRevision,calls=provider.length;
 serverNow=Math.max(serverNow+3001,Date.parse(previous.refreshAt||'')+1||0,Date.parse(previous.expiresAt||'')+1||0);walletValues.set(pilot,value);
 await app.core.sync(pilot);
 const after=app.core.snapshots(pilot,false),sample=app.store.snapshot(pilot,'wallet');
 assert.equal(sample.status,'ready');assert.equal(sample.data,value);assert.notEqual(after.wallet.dataRevision,before);assert.equal(provider.length-calls,1);
 assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([key])=>key!=='wallet').map(([key,row])=>[key,row.dataRevision])),stable.get(pilot),'Non-Wallet snapshots must retain their data revisions');
 clockLedger.push({pilot,value,serverNow,updatedAt:sample.updatedAt,expiresAt:sample.expiresAt,refreshAt:sample.refreshAt,revisionCounter:after.wallet.dataRevision.split(':').slice(1).join(':')});
}
return {get app(){return app;},fixtures,names,provider,unexpected,clockLedger,restartLedger,wallet,ready,
 fixture:{pilots:2,rowsPerLargeDataset:count,namesJsonBytes:Buffer.byteLength(JSON.stringify(names)),namesSha256:createHash('sha256').update(JSON.stringify(names)).digest('hex'),dataSha256:createHash('sha256').update(JSON.stringify([...fixtures])).digest('hex')},
 async restart(namesAfter){const initialSessions=app.exportSessions();restartLedger.push({serverNow,sessionCount:initialSessions.length,contract:'Production exportSessions/initialSessions handoff preserves the synthetic browser session across a managed restart.'});app.auth.access=originalAccess;await app.close();const store=openStore(dataDir);store.set('names',namesAfter);store.close();await start(initialSessions);},
 async close(){try{if(app){app.auth.access=originalAccess;await app.close();}}finally{Date.now=originalNow;await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
};
}
