// Diagnostic-only copy of the frozen mixed workload. All timings are perturbed diagnostics.
// No production source is modified; writes, backpressure and continuity controls are unchanged.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
if(process.env.KAIRO_MIXED_LOCKED!=='1')throw Error('Run via mixed-run.mjs, which acquires the checkpoint flock.');
const root=process.env.KAIRO_PERF_APP_ROOT;
assert.ok(root,'KAIRO_PERF_APP_ROOT required');
const {seedFixture}=await import('../../../harness/legacy/fixture.mjs');
const {startMeter}=await import('../../../harness/legacy/metrics.mjs');
const {openStore}=await import(root+'/server/store.mjs');
const {openVault}=await import(root+'/server/vault.mjs');
const {startKairo}=await import(root+'/server/index.mjs');
const {getUniverseStatic,getUniverseSystem}=await import(root+'/server/universe-static.mjs');
const {catalog}=await import(root+'/server/modules/catalog.mjs');
const dir=await mkdtemp(join(tmpdir(),'kairo-mixed-')),dataDir=join(dir,'data');
const iso=n=>new Date(n).toISOString(), DAY=86400000, HIGH=30000142;
const atlas=getUniverseStatic(),LOW=atlas.systems.find(s=>s.space==='known'&&s.region_id!==10000070&&s.security<-.2).system_id;
let app,startedAt=0,meter,sampler,forbiddenAttempts=0,inflight=0,maximumInflight=0,seq=0;
let bindingUpdates=0,unchangedBindings=0,lastBindings=null;
const sseTrace=[],sseTraceLimit=2000;let sseTraceDropped=0,sseClientSeq=0;
function recordSSE(clientId,kind,response,extra={}){const row={at:Date.now(),clientId,kind,queuedBytes:response.writableLength,needDrain:response.writableNeedDrain,destroyed:response.destroyed,writableEnded:response.writableEnded,socketBytesWritten:response.socket?.bytesWritten??null,...extra};if(sseTrace.length<sseTraceLimit)sseTrace.push(row);else sseTraceDropped++;}
function observeDashboardClients(clients){
  const originalAdd=clients.add,seen=new WeakSet();
  clients.add=function(response){
    if(!seen.has(response)){
      seen.add(response);const clientId=++sseClientSeq,originalWrite=response.write,originalDestroy=response.destroy;
      recordSSE(clientId,'add',response);
      response.write=function(...args){
        const chunk=args[0],prefix=typeof chunk==='string'?chunk.slice(0,1024):Buffer.from(chunk).subarray(0,1024).toString('utf8');
        // Snapshot routing metadata precedes the large data array. Do not parse/copy full payloads.
        const metadata={frameBytes:typeof chunk==='string'?Buffer.byteLength(chunk,typeof args[1]==='string'?args[1]:'utf8'):chunk.byteLength,eventKind:prefix.match(/^event: ([^\n]+)/)?.[1]??'heartbeat',snapshotKey:prefix.match(/\"key\":\"([^\"]+)\"/)?.[1]??null,characterId:Number(prefix.match(/\"characterId\":(\d+)/)?.[1])||null};
        recordSSE(clientId,'write-before',this,metadata);
        try{const accepted=Reflect.apply(originalWrite,this,args);recordSSE(clientId,'write-after',this,{...metadata,accepted});return accepted;}catch(error){recordSSE(clientId,'write-error',this,{...metadata,error:error.stack});throw error;}
      };
      response.destroy=function(...args){recordSSE(clientId,'destroy',this,{stack:new Error('Diagnostic ServerResponse.destroy call').stack,error:args[0]?.stack??args[0]?.message??null});return Reflect.apply(originalDestroy,this,args);};
      response.on('drain',()=>recordSSE(clientId,'drain',response));
      response.on('close',()=>recordSSE(clientId,'close',response));
    }
    return Reflect.apply(originalAdd,this,[response]);
  };
}
const transport=[],locations=[],protection=[],samples=[],busEvents=[],unexpected=[],routes=new Map();
const phase=at=>!startedAt?'fresh-highsec':at-startedAt<2000?'fresh-highsec':at-startedAt<8000?'fresh-hostile':at-startedAt<14000?'fresh-highsec':at-startedAt<20000?'unavailable':'recovered-highsec';
const deny=async url=>{forbiddenAttempts++;throw Error('Forbidden external request: '+String(url));};
globalThis.fetch=deny;
const response=(body,status=200,ttl=1)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'max-age='+ttl,'X-Pages':'1'}});
async function fakeFetch(url,options={}){
  const u=new URL(url),p=u.pathname.replace(/\/$/,''),requestAt=Date.now(),observedPhase=phase(requestAt),row={seq:++seq,host:u.hostname,path:p,requestAt,phase:observedPhase};
  transport.push(row);inflight++;maximumInflight=Math.max(maximumInflight,inflight);
  try{
    if(u.hostname==='r2z2.zkillboard.com'){await delay(20);row.status=p.endsWith('/sequence.json')?200:404;return response(row.status===200?{sequence:1000000}:null,row.status);}
    if(u.hostname==='zkillboard.com'){await delay(20);row.status=200;return response([],200,3600);}
    if(u.hostname!=='esi.evetech.net')return await deny(url);
    const location=p.match(/^\/characters\/(42|43)\/location$/);
    if(location){
      await delay(50);row.characterId=Number(location[1]);row.status=row.characterId===42&&observedPhase==='unavailable'?503:200;
      row.systemId=row.characterId===42&&observedPhase==='fresh-hostile'?LOW:HIGH;
      return response(row.status===200?{solar_system_id:row.systemId}:{error:'Synthetic ESI outage'},row.status,1);
    }
    if(p==='/universe/names'){await delay(20);row.status=200;return response(JSON.parse(options.body||'[]').map(id=>({id,name:'Synthetic name '+id,category:'inventory_type'})),200,86400);}
    if(routes.has(p)){await delay(p.endsWith('/assets')?250:20);row.status=200;return response(routes.get(p),200,3600);}
    unexpected.push(p);return await deny(url);
  }finally{row.responseAt=Date.now();row.elapsedMs=row.responseAt-requestAt;inflight--;}
}
function current(){const s=app.store.snapshot(42,'location'),op=app.core.stream.getOPSEC();return {at:Date.now(),selectedPilot:42,locationStatus:s?.status,systemId:s?.data?.solar_system_id,updatedAt:s?.updatedAt,expiresAt:s?.expiresAt,refreshAt:s?.refreshAt,locationAgeMs:Date.now()-Date.parse(s?.updatedAt),errorStatus:s?.errorStatus,opsec:op.state,hidden:op.hidden,validUntil:op.validUntil,pending:!!op.pending};}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function initialise(){
  await seedFixture(dataDir,'stress');const store=openStore(dataDir),vault=openVault(dataDir),now=Date.now();
  store.db.prepare('DELETE FROM snapshots WHERE character_id IN (44,45)').run();store.db.prepare('DELETE FROM characters WHERE id IN (44,45)').run();
  store.db.prepare("UPDATE sessions SET ended=NULL WHERE id='benchmark-session'").run();
  store.set('session:combat:benchmark-session',{status:'ready',retryAt:iso(now+DAY),ended:null});
  store.set('universe:feeds:storms',{...store.get('universe:feeds:storms'),data:{storms:[],points:[]}});
  store.set('opsec',{characterId:42,manual:false,allowHighsec:true,blueAlliances:[],hostileAlliances:[99000001]});
  const snap=data=>({status:'ready',data,updatedAt:iso(now),expiresAt:iso(now+DAY),refreshAt:iso(now+DAY)});
  store.saveSnapshot(0,'sovereignty',snap([{system_id:LOW,alliance_id:99000001}]));
  const local=getUniverseSystem(HIGH,{celestials:false});
  for(const id of [42,43]){
    store.db.prepare('UPDATE characters SET tokens=? WHERE id=?').run(vault.encrypt({access_token:'synthetic-mixed-'+id,expires:now+DAY}),id);
    store.saveSnapshot(id,'location',{...snap({solar_system_id:HIGH,system:{...local,security_status:local.security},constellation:local.constellation,region:local.region}),expiresAt:iso(now+1000),refreshAt:iso(now+1000)});
    const assets=store.snapshot(id,'assets');store.saveSnapshot(id,'assets',{...assets,expiresAt:iso(now+1000),refreshAt:iso(now+1000)});
    for(const m of catalog)for(const d of m.datasets){const s=store.snapshot(m.id==='universe'?0:id,d.key);if(s?.data!=null)routes.set(d.route.replaceAll('{id}',id).replaceAll('{owner}',d.owner==='corporation_id'?88:77),s.data);}
  }
  const names=store.get('names',{});names[99000001]='Synthetic hostile';names[60008494]='Synthetic hangar';store.set('names',names);store.close();
  const first=await port();let second=await port();while(first===second)second=await port();
  app=await startKairo({port:first,streamPort:second,dataDir,fetcher:fakeFetch,combatFetcher:fakeFetch,sessionFeedFetcher:fakeFetch,markets:{historyFetcher:deny},universe:{feeds:{fetcher:deny}},datasets:{fetcher:deny},deferDatasetStart:true});
  observeDashboardClients(app.core.uiClients);
  const oldBindings=app.core.stream.setBindings;app.core.stream.setBindings=next=>{const encoded=JSON.stringify(next);bindingUpdates++;if(encoded===lastBindings)unchangedBindings++;lastBindings=encoded;return oldBindings(next);};
  const oldSave=app.store.saveSnapshot;app.store.saveSnapshot=(id,key,value)=>{const result=oldSave(id,key,value);if(key==='location')locations.push({at:Date.now(),characterId:id,status:value.status,systemId:value.data?.solar_system_id,updatedAt:value.updatedAt,expiresAt:value.expiresAt,errorStatus:value.errorStatus});return result;};
  const oldOPSEC=app.core.stream.setOPSEC;app.core.stream.setOPSEC=next=>{const s=app.store.snapshot(42,'location');protection.push({at:Date.now(),state:next.state,hidden:next.hidden,validUntil:next.validUntil,pending:!!next.pending,sourceStatus:s?.status,sourceSystemId:s?.data?.solar_system_id,sourceUpdatedAt:s?.updatedAt,sourceAgeMs:Date.now()-Date.parse(s?.updatedAt)});return oldOPSEC(next);};
  app.core.bus.on('*',e=>{if(['data.location','opsec.changed','location.changed'].includes(e.type))busEvents.push({at:Date.now(),type:e.type,characterId:e.characterId,systemId:e.payload?.current?.solar_system_id||e.payload?.system_id,state:e.payload?.state});});
  const wormholes=atlas.systems.filter(s=>s.space==='wormhole').slice(0,100),stamp=iso(Date.now());
  const put=app.store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');
  for(let i=0;i<8;i++){const map={id:'mixed-map-'+i,name:'Synthetic mixed map '+i,description:'',scope:null,scope_version:2,revision:1,created_at:stamp,updated_at:stamp,nodes:wormholes.map((s,n)=>({system_id:s.system_id,x:n*100,y:0,locked:false,alias:'',role:'',status:'unknown',tags:[]})),connections:[],passages:[],observations:[],comments:[],pings:[],activity:[],pilots:[]};put.run(42,'jspace_map',map.id,JSON.stringify(map),stamp);}
  const stops=[30002187,30002659,30002510,30002053];app.core.universe.navigation.saveItinerary(42,{originId:HIGH,followLocation:false,stops:Array.from({length:50},(_,i)=>({id:'mixed-stop-'+i,systemId:stops[i%stops.length]}))});
  const bindings=['none','session.elapsed','session.report','wallet.balance','wallet.balance','session.report','session.elapsed','pilot.ship','none','none'];
  const cfg=app.core.stream.config();cfg.elements=bindings.map((binding,i)=>({id:'mixed-widget-'+i,kind:i===0?'opsec':i===8?'clock':'text',name:'Synthetic widget',text:'Mixed workload',label:'Synthetic',visible:true,x:i*20,y:i*20,width:350,height:100,fontSize:24,opacity:.7,color:'#97ebce',binding,characterId:42}));app.core.stream.save(cfg);app.core.updateBindings();
  return {origin:app.origin,streamOrigin:app.streamOrigin,HIGH,LOW,fixture:{pilots:2,assetsPerPilot:20000,events:50000,visits:2000,activeSessions:1,maps:8,nodesPerMap:100,navigationStops:50,streamWidgets:10,bindings,legacyBackfill:'held fresh; live R2Z2 cursor enabled',externalTransport:'fully synthetic'}};
}
async function close(){clearInterval(sampler);if(app){await app.close();app=null;}await rm(dir,{recursive:true,force:true,maxRetries:4});}
process.on('disconnect',()=>close().finally(()=>process.exit()));
process.on('message',async m=>{try{let result;
  if(m.action==='init')result=await initialise();
  else if(m.action==='begin'){startedAt=Date.now();bindingUpdates=0;unchangedBindings=0;meter=startMeter();sampler=setInterval(()=>samples.push(current()),100);result={startedAt,initial:current()};}
  else if(m.action==='finish'){clearInterval(sampler);result={startedAt,endedAt:Date.now(),meter:meter(),diagnosticOnly:true,sseTrace,sseTraceDropped,transport,locations,protection,samples,busEvents,forbiddenAttempts,unexpected,maximumInflight,inflight,bindingUpdates,unchangedBindings,final:current(),activeSessions:app.store.db.prepare('SELECT COUNT(*) n FROM sessions WHERE ended IS NULL').get().n,coreHealth:app.core.health(),sseClients:{dashboard:app.core.uiClients.size,stream:app.core.stream.clients.size}};meter=null;}
  else if(m.action==='close'){const t=performance.now();await close();result={closeMs:performance.now()-t,inflight,forbiddenAttempts,sseTraceDropped};process.send({id:m.id,result});process.disconnect();return;}
  else throw Error('Unknown action '+m.action);
  process.send({id:m.id,result});
}catch(e){process.send({id:m.id,error:e.stack});}});
