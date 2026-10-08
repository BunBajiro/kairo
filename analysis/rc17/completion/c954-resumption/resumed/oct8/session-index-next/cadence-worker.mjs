import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {assertLock,blockNetwork,loadSourceManifest,verifySource,verifyHarness,validateSourceRole,writeJSON,storage,
    domainDigest,migration,configurations,EPOCH,DAY,iso,hashValue,limitations} from './common.mjs';
import {copySeed} from './fixtures.mjs';

assertLock();blockNetwork();
const [manifestPath,variant,output,seedDirectory,mode,caseId,harnessPath]=process.argv.slice(2);
assert.ok(['baseline','candidate'].includes(variant));assert.ok(['diagnostic','cadence'].includes(mode));
const diagnostic=mode==='diagnostic',config=configurations.find(row=>row.id===caseId);assert.ok(config);
if(!diagnostic)assert.ok(['100-1','10000-4'].includes(caseId),'Only declared ordinary endpoint shapes');
const here=dirname(fileURLToPath(import.meta.url)),source=await loadSourceManifest(manifestPath);
await validateSourceRole(source,variant,here);await verifyHarness(harnessPath);
const {openStore}=await import(pathToFileURL(join(source.root,'server/store.mjs')));
const {createSessionCombat,SESSION_COMBAT_RECENT_SQL}=await import(pathToFileURL(join(source.root,'server/session-combat.mjs')));
const directory=await mkdtemp(join(tmpdir(),'kairo-s3-cadence-'));
const counts={ticks:0,syncRecentCalls:0,historyProviderCalls:0,liveProviderCalls:0,verificationCalls:0};
const sqlCounts=diagnostic?{eligibilityQueries:0,returnedEligibleIds:0,sessionReads:0,routeQueries:0,routeRows:0}:null;
const result={schemaVersion:1,complete:false,sourceVerified:false,kind:mode,id:mode+'-'+caseId,config,variant,
    sourceCommit:source.sourceCommit,sourceFingerprint:source.fingerprint,node:process.version,startedAt:new Date().toISOString(),temporaryDirectory:directory,
    counts,sqlCounts,actualTickOffsetsMs:[],tickWorkMs:[],eligibleIds:diagnostic?[]:null,
    scope:'Actual createSessionCombat syncRecent, awaited sequentially by pilot per tick. Core instead launches without awaiting. This is not a whole-Core concurrency/idle/startup measurement.',
    schedule:{ticks:41,cadenceMs:3000,outerEndpointMs:120000,tickAnchor:'first actual sampled tick offset + 3000 * tick ordinal',finalDeadline:'max(outer endpoint, first actual live nextCheckAt offset)'},
    limitations:[...limitations,'Diagnostic SQL wrappers and eligible-ID retention never run in ordinary mode.',
        'Provider adapters are immediate synthetic local responses. Their small ordered call receipts are workload controls present equally in both arms; external/provider latency is excluded.',
        'The injected domain clock samples actual monotonic elapsed time at each tick and stays fixed during that tick; Date.now and host timers remain real.',
        'Only two process observations per arm at each ordinary endpoint. Ticks are not independent process replications; no interior ordinary cadence case is claimed.']};
let store,collector,clock=EPOCH,loop;
const history=[],live=[];
const eligible=(pilot,offset)=>[`${pilot}-active`,`${pilot}-recent1`,`${pilot}-recent2`,...(offset<60000?[`${pilot}-near-boundary`]:[])];
const queryArgs=(pilot,at)=>variant==='candidate'?[pilot,pilot,iso(at-DAY)]:[pilot,iso(at-DAY)];
try{
    const seed=await copySeed(seedDirectory,'cadence-'+caseId,directory);store=openStore(directory);migration(store,variant);
    assert.deepEqual(domainDigest(store),seed.domain);
    result.queryPlan=store.db.prepare('EXPLAIN QUERY PLAN '+SESSION_COMBAT_RECENT_SQL).all(...queryArgs(1,EPOCH));
    for(const offset of [0,1,59999,60000,120000])for(let pilot=1;pilot<=config.pilots;pilot++)
        assert.deepEqual(store.db.prepare(SESSION_COMBAT_RECENT_SQL).all(...queryArgs(pilot,EPOCH+offset)).map(row=>row.id),eligible(pilot,offset));
    if(variant==='candidate'){
        const plan=result.queryPlan.map(row=>row.detail).join('\n');
        assert.match(plan,/idx_sessions_character_ended \(character_id=\? AND ended=\?\)/);
        assert.match(plan,/idx_sessions_character_ended \(character_id=\? AND ended>\?\)/);
    }
    let observedStore=store;
    if(diagnostic){
        const db=new Proxy(store.db,{get(target,key){
            if(key!=='prepare'){const value=target[key];return typeof value==='function'?value.bind(target):value;}
            return sql=>{const statement=target.prepare(sql);return new Proxy(statement,{get(stmt,method){const value=stmt[method];if(typeof value!=='function')return value;
                return (...args)=>{const rows=value.apply(stmt,args);
                    if(method==='all'&&sql===SESSION_COMBAT_RECENT_SQL){sqlCounts.eligibilityQueries++;sqlCounts.returnedEligibleIds+=rows.length;const ids=rows.map(row=>row.id);assert.deepEqual(ids,eligible(args[0],clock-EPOCH));result.eligibleIds.push({offset:clock-EPOCH,pilot:args[0],ids});}
                    if(method==='get'&&/SELECT \* FROM sessions WHERE id=/.test(sql))sqlCounts.sessionReads++;
                    if(method==='all'&&/FROM visits/.test(sql)){sqlCounts.routeQueries++;sqlCounts.routeRows+=rows.length;}
                    return rows;
                };
            }});};
        }});observedStore={...store,db};
    }
    collector=createSessionCombat(observedStore,{characters:()=>Array.from({length:config.pilots},(_,i)=>({id:i+1}))},
        {request:async()=>{counts.verificationCalls++;throw Error('Unexpected ESI verification');}},
        {publicPage:async(pilot,path)=>{counts.historyProviderCalls++;history.push({pilot,path});return {refs:[],expiresAt:iso(EPOCH+3600000)};},ingest:async()=>{throw Error('Unexpected personal ingest');}},
        {now:()=>clock,feedOptions:{spacingMs:0},feedFetcher:async url=>{counts.liveProviderCalls++;const path=url.replace('https://r2z2.zkillboard.com/ephemeral/','');
            assert.equal(url,'https://r2z2.zkillboard.com/ephemeral/'+path);const status=path==='sequence.json'?200:404;live.push({path,status});
            assert.ok(path==='sequence.json'||path==='100.json','Unexpected live cursor');return status===200?Response.json({sequence:100}):new Response('',{status});}});
    const memoryBefore=process.memoryUsage(),maxRSSBefore=process.resourceUsage().maxRSS;
    if(!diagnostic){loop=monitorEventLoopDelay({resolution:10});loop.enable();}
    const cpu=process.cpuUsage(),start=performance.now();let firstDueOffset;
    for(let index=0;index<41;index++){
        const planned=index*3000,target=index===40?Math.max(planned,firstDueOffset):planned+(index?result.actualTickOffsetsMs[0]:0);
        if(!diagnostic)while(performance.now()<start+target)await delay(Math.max(1,start+target-performance.now()));
        clock=EPOCH+(diagnostic?target:Math.ceil(performance.now()-start));
        counts.ticks++;result.actualTickOffsetsMs.push(clock-EPOCH);
        const tickStart=diagnostic?null:performance.now();
        for(let pilot=1;pilot<=config.pilots;pilot++){counts.syncRecentCalls++;await collector.syncRecent(pilot);}
        if(!diagnostic)result.tickWorkMs.push(performance.now()-tickStart);
        if(index===0){
            const initial=store.get('session:live-feed',null);assert.equal(initial?.status,'ready');
            firstDueOffset=Date.parse(initial.nextCheckAt)-EPOCH;
            assert.equal(firstDueOffset,result.actualTickOffsetsMs[0]+120000);
            result.schedule.firstTickOffsetMs=result.actualTickOffsetsMs[0];result.schedule.firstLiveDueOffsetMs=firstDueOffset;
        }
        if(!diagnostic&&index%10===0)process.stdout.write(JSON.stringify({tick:index,offsetMs:clock-EPOCH})+'\n');
    }
    if(!diagnostic){
        loop.disable();result.measurement={elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),memoryBefore,memoryAfter:process.memoryUsage(),maxRSSBeforeKiB:maxRSSBefore,maxRSSAfterKiB:process.resourceUsage().maxRSS,
            eventLoop:{p50Ms:loop.percentile(50)/1e6,p95Ms:loop.percentile(95)/1e6,maxMs:loop.max/1e6}};
        assert.equal(result.tickWorkMs.length,41);assert.ok(result.measurement.elapsedMs>=120000);
        result.tickLatenessMs=result.actualTickOffsetsMs.map((offset,i)=>offset-(i===40?Math.max(120000,firstDueOffset):i*3000+result.actualTickOffsetsMs[0]));
    }
    await collector.close();collector=null;
    assert.equal(counts.ticks,41);assert.equal(counts.syncRecentCalls,41*config.pilots);assert.equal(counts.verificationCalls,0);
    assert.equal(counts.historyProviderCalls,17*config.pilots);assert.equal(counts.liveProviderCalls,3);
    assert.deepEqual(live,[{path:'sequence.json',status:200},{path:'100.json',status:404},{path:'100.json',status:404}]);
    const expectedHistory=[];for(let pilot=1;pilot<=config.pilots;pilot++)for(let system=1;system<=11;system++)
        for(let repetition=0;repetition<(system<=2?4:1);repetition++)expectedHistory.push({pilot,path:`allianceID/77/solarSystemID/${system}/year/2026/month/10/`});
    const ordered=rows=>rows.map(row=>JSON.stringify(row)).sort();assert.deepEqual(ordered(history),ordered(expectedHistory));
    if(diagnostic)assert.deepEqual(sqlCounts,{eligibilityQueries:41*config.pilots,returnedEligibleIds:143*config.pilots,sessionReads:143*config.pilots,routeQueries:7*config.pilots,routeRows:4006*config.pilots});
    // This guard also rejects a heavily delayed ordinary schedule that silently
    // drops a near-cutoff tick; it does not relabel a changed workload as parity.
    assert.equal(result.actualTickOffsetsMs.filter(offset=>offset<60000).length,20);
    assert.ok(result.actualTickOffsetsMs[40]>=firstDueOffset);
    const liveState=store.get('session:live-feed',null),states=store.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'session:combat:%' ORDER BY key").all().map(row=>({key:row.key,value:JSON.parse(row.value)}));
    assert.equal(states.length,4*config.pilots);assert.equal(liveState.nextSequence,100);assert.equal(liveState.status,'ready');assert.equal(liveState.error,null);assert.equal(liveState.failures,0);assert.equal(liveState.processed,0);
    const first=EPOCH+result.actualTickOffsetsMs[0],last=EPOCH+result.actualTickOffsetsMs[40];
    assert.equal(liveState.lastAdvanceAt,iso(first));assert.equal(liveState.checkedAt,iso(last));assert.equal(liveState.nextCheckAt,iso(last+120000));assert.equal(liveState.notBefore,iso(last+6000));
    const normalizedLive={...liveState,lastAdvanceAt:'tick:0',checkedAt:'tick:40',nextCheckAt:'tick:40+120000',notBefore:'tick:40+6000'};
    const normalizedStates=states.map(row=>{
        const active=row.key.endsWith('-active'),tick=active?1:0,value=row.value;
        assert.equal(value.status,'ready');assert.equal(value.error,undefined);assert.equal(value.progress,null);assert.equal(value.limitReached,false);
        assert.equal(value.updatedAt,iso(EPOCH+result.actualTickOffsetsMs[tick]));assert.equal(value.retryAt,iso(EPOCH+3600000));
        assert.equal(value.pages,active?11:2);assert.equal(value.systems,active?11:2);assert.equal(value.checkedGroups,active?11:2);
        return {key:row.key,value:{...value,updatedAt:'tick:'+tick}};
    });
    const normalizedSettings=new Map(normalizedStates.map(row=>[row.key,JSON.stringify(row.value)]));normalizedSettings.set('session:live-feed',JSON.stringify(normalizedLive));
    result.liveState=liveState;result.sessionStates=states;result.providerSequence={history,live};result.rawDomain=domainDigest(store);
    const normalizedDomain=domainDigest(store,row=>normalizedSettings.get(row.key)??row.value);
    result.parity={fixture:{id:seed.id,bytes:seed.bytes,sha256:seed.sha256},counts,history,live,normalizedLive,normalizedStates,normalizedDomain,
        expectedEligibilityOracleSha256:hashValue(Array.from({length:41},(_,i)=>Array.from({length:config.pilots},(_,p)=>eligible(p+1,i*3000)))),
        normalization:'Only validated session updatedAt and live lastAdvanceAt/checkedAt/nextCheckAt/notBefore encode tick ordinals; all other application values remain exact. S3 migration record is separately validated and excluded. No UUID normalization.'};
    result.storage=await storage(store,directory);store.close();store=null;
    await verifySource(source);await verifyHarness(harnessPath);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
    loop?.disable();result.closeFailures=[];
    for(const [owner,close]of [['collector',()=>collector?.close()],['store',()=>store?.close()]]){
        try{await close();}catch(error){result.closeFailures.push({owner,error:error.stack});result.complete=false;process.exitCode=1;}
    }
    if(result.complete){try{await rm(directory,{recursive:true,force:true});result.temporaryDirectoryRemoved=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;process.exitCode=1;}}
    result.endedAt=new Date().toISOString();await writeJSON(output,result);
    process.stdout.write(JSON.stringify({kind:mode,id:result.id,complete:result.complete,output})+'\n');
}
