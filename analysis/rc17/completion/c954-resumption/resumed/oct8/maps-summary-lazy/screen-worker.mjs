// External bounded screen. No application source or timing-path instrumentation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir,cpus} from 'node:os';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
import {loadSourceManifest,verifySource} from '../../../../../harness/source-manifest.mjs';
import {BASE_COMMIT,AT,STAMP,EXPIRY,configs,hash,modules,connect,authoritative,storage,seedFixture}
    from '../maps-summary-next/persistence-fixtures.mjs';

assert.equal(process.env.KAIRO_M9_MATCHED_LOCK_HELD,'1','The parent owns both benchmark locks');
const [baselinePath,armPath,outputPath,seedDirectory,mode,harnessPath]=process.argv.slice(2);
assert.ok(['seed-only','measure'].includes(mode)&&harnessPath);
const output=resolve(outputPath),seeds=resolve(seedDirectory);
const baseline=await loadSourceManifest(baselinePath),arm=await loadSourceManifest(armPath);
assert.equal(baseline.sourceCommit,BASE_COMMIT);assert.equal(arm.sourceCommit,BASE_COMMIT);assert.equal(baseline.dirty,false);
const candidate=arm.fingerprint!==baseline.fingerprint;
const harness=JSON.parse(await readFile(harnessPath,'utf8'));
assert.equal(harness.schemaVersion,1);
async function verifyHarness(){for(const file of harness.files){const bytes=await readFile(file.path);assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256,'Harness drift: '+file.path);}}
await verifyHarness();const harnessFingerprint=hash(JSON.stringify(harness.files));
const order=['plain-1','plain-24','wide-1','wide-24','dense-notes-1','dense-notes-8','primitive-fallback-8','wide-source-1'];
const selected=order.map(id=>{const config=configs.find(row=>row.id===id);assert.ok(config);return config;});
let external=0;
const denied=()=>{external++;throw Error('External IO is forbidden in the lazy M9 screen');};
const deny=async()=>denied();globalThis.fetch=deny;
http.request=http.get=https.request=https.get=net.connect=net.createConnection=tls.connect=denied;
net.Socket.prototype.connect=denied;syncBuiltinESMExports();
const result={schemaVersion:1,complete:false,sourceVerified:false,mode,source:{commit:arm.sourceCommit,fingerprint:arm.fingerprint},
    baseline:{commit:baseline.sourceCommit,fingerprint:baseline.fingerprint},harnessFingerprint,startedAt:new Date().toISOString(),
    environment:{node:process.version,cpu:cpus()[0]?.model,platform:process.platform},performanceAcceptance:false,cases:[],
    limitations:['Bounded eight-shape screen only; four fresh ABBA processes with one copy per shape, not a full matrix.',
        'Cold construction/first summary starts with no derivative schema. Modules, fixture copies and source guards are outside timings; OS page cache is not forced cold.',
        'All summary/detail/application mutation calls in measured workers are timed. Assertions, hashes, SQL argument preparation and storage/schema observations are outside timings.',
        'No forced GC, JSON/SQL instrumentation, retained JS cache, profile, VACUUM, browser or HTTP timings.',
        'maxRSS is process cumulative high water, including prior shapes and untimed hashing; it is not retained-memory or phase-specific peak evidence.',
        'Exact raw authority/output hashes are retained. Cross-arm parity changes only generated v4 UUID spelling after verifying zero UUIDs in immutable seeds.',
        'A metadata table with no rows/bodies after construction demonstrates no persistent eager body backfill; source inspection/focused tests, not this timing screen, establish absence of discarded decode work.',
        'Background tracking, contention, full matrices and real-user cadence remain separate gates. No assumed production read/write ratio or adoption follows from this screen.']};
function measured(call){
    const memoryBefore=process.memoryUsage(),maxRSSBeforeKiB=process.resourceUsage().maxRSS,cpu=process.cpuUsage(),start=performance.now();
    const value=call(),elapsedMs=performance.now()-start,used=process.cpuUsage(cpu);
    return {value,metrics:{elapsedMs,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,memoryBefore,memoryAfter:process.memoryUsage(),maxRSSBeforeKiB,maxRSSAfterKiB:process.resourceUsage().maxRSS}};
}
function normalizedOutput(value){
    const ids=new Map(),text=JSON.stringify(value),normalized=text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,id=>{if(!ids.has(id))ids.set(id,'generated-uuid-'+ids.size);return ids.get(id);});
    return {exactSha256:hash(text),uuidNormalizedSha256:hash(normalized),normalizedUUIDs:ids.size,bytes:Buffer.byteLength(text)};
}
const comparableAuthority=value=>{const {sha256,...other}=value;return value.normalizedUUIDs?other:value;};
const comparableOutput=value=>{const {exactSha256,...other}=value;return value.normalizedUUIDs?other:value;};
const totalChanges=db=>Number(db.prepare('SELECT total_changes() AS n').get().n);
async function snapshot(run){
    const db=run.store.db,base=await storage(db,run.directory);
    const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name LIKE 'universe_jspace_summary_inputs_%' ORDER BY type,name").all();
    const states=base.derivatives.map(({name})=>({name,rows:db.prepare(`SELECT state,format_version,count(*) AS count,COALESCE(sum(length(CAST(body AS BLOB))),0) AS bodyBytes FROM "${name}" GROUP BY state,format_version ORDER BY state,format_version`).all(),
        generations:db.prepare(`SELECT CAST(min(generation) AS TEXT) AS first,CAST(max(generation) AS TEXT) AS last FROM "${name}"`).get()}));
    return {...base,schema,states};
}
async function phase(run,name,count,call,check){
    run.entry.incompletePhase=name;
    const before=await snapshot(run),changesBefore=totalChanges(run.store.db);
    const observed=measured(call);
    const databaseChanges=totalChanges(run.store.db)-changesBefore;
    check?.(observed.value,databaseChanges);
    const record={name,count,...observed.metrics,databaseChanges,storageBefore:before,storageAfter:await snapshot(run),authoritative:authoritative(run.store.db),output:normalizedOutput(observed.value)};
    run.entry.phases.push(record);delete run.entry.incompletePhase;return observed.value;
}
async function close(run){
    const errors=[];
    try{await run.service?.close();}catch(error){errors.push(error);}finally{run.service=null;}
    try{run.store?.close();}catch(error){errors.push(error);}finally{run.store=null;}
    if(errors.length)throw new AggregateError(errors,'Screen fixture close failed');
}
function parity(entry){return {id:entry.id,fixture:entry.fixture,firstOpenAuthoritative:entry.firstOpen.authoritative,
    phases:entry.phases.map(row=>({name:row.name,count:row.count,authoritative:comparableAuthority(row.authoritative),output:comparableOutput(row.output)})),
    apiMutationSkip:entry.apiMutationSkip??null};}
const scratch=mode==='measure'?await mkdtemp(join(tmpdir(),'kairo-m9-lazy-screen-')):null;
if(scratch)result.temporaryDirectory=scratch;
try{
    const api=await modules(mode==='seed-only'?baseline:arm);
    for(const config of selected){
        const seed=join(seeds,config.id);
        if(mode==='measure')await readFile(join(seed,'fixture.json'),'utf8');
        const fixture=await seedFixture(mode==='seed-only'?api:null,baseline,seed,config,harnessFingerprint,deny);
        assert.equal(fixture.authoritative.normalizedUUIDs,0);
        if(mode==='seed-only'){result.cases.push({id:config.id,config,fixture});continue;}
        const entry={id:config.id,config,fixture:{databaseSha256:fixture.databaseSha256,inputSha256:fixture.inputSha256,authoritative:fixture.authoritative},phases:[]};result.cases.push(entry);
        const directory=join(scratch,config.id);await mkdir(directory);await copyFile(join(seed,'kairo.sqlite'),join(directory,'kairo.sqlite'));
        assert.equal(hash(await readFile(join(directory,'kairo.sqlite'))),fixture.databaseSha256);
        const run={directory,entry,clock:{value:AT},store:null,service:null};
        let caseFailure;
        try{
            const first=measured(()=>connect(api,directory,run.clock,deny));Object.assign(run,first.value);
            result.environment.sqlite ||= run.store.db.prepare('SELECT sqlite_version() AS version').get().version;
            const initial=authoritative(run.store.db);assert.deepEqual(initial,fixture.authoritative);
            entry.firstOpen={...first.metrics,authoritative:initial,storage:await snapshot(run)};
            assert.equal(entry.firstOpen.storage.derivatives.length,candidate?1:0);
            for(const table of entry.firstOpen.storage.derivatives){assert.equal(table.rows,0);assert.equal(table.bodyBytes,0);}
            entry.noPersistentEagerBackfill=true;
            const summary=()=>run.service.jspace.summaries(42),detail=()=>run.service.jspace.map(42,'map-0');
            const verifySummary=value=>assert.equal(value.maps.length,config.maps);
            await phase(run,'first-summary-empty-cache',1,summary,value=>assert.deepEqual(value,fixture.summary));
            assert.deepEqual(authoritative(run.store.db),fixture.authoritative,'First summary must preserve authoritative documents');
            const afterFirst=await snapshot(run);
            if(candidate){
                assert.equal(afterFirst.derivatives[0].rows,config.maps+1);
                const states=afterFirst.states[0].rows;
                assert.equal(states.filter(row=>row.state===0).reduce((n,row)=>n+row.count,0),0);
                assert.equal(states.filter(row=>row.state===2).reduce((n,row)=>n+row.count,0),config.flavor==='primitive-fallback'?config.maps:0);
            }
            for(let index=0;index<5;index++)await phase(run,'steady-summary-'+(index+1),1,summary,(value,changes)=>{assert.deepEqual(value,fixture.summary);assert.equal(changes,0,'Every warm steady summary must be write-free');});
            assert.deepEqual(authoritative(run.store.db),fixture.authoritative,'Five steady summaries must preserve authoritative documents');
            const db=run.store.db,raw=db.prepare("SELECT body FROM universe_records WHERE character_id=42 AND kind='jspace_map' AND id=?");
            const update=db.prepare("UPDATE universe_records SET body=?,updated_at=? WHERE character_id=42 AND kind='jspace_map' AND id=?");
            let sequence=0;
            function changes(count,source=false){const values=new Map(),rows=[];
                for(let i=0;i<count;i++){const id=source?'tracking-source-42':`map-${i%config.maps}`;
                    const value=values.get(id)??JSON.parse(raw.get(id).body);value.description='Changed lazy screen body '+(++sequence);value.revision++;
                    values.set(id,value);const body=JSON.stringify(value);rows.push({id,body});}
                return {rows,receipt:{written:rows.map(({id,body})=>({id,bytes:Buffer.byteLength(body),sha256:hash(body)}))}};
            }
            function apply(batch){for(const row of batch.rows)update.run(row.body,STAMP,row.id);return batch.receipt;}
            function verifyWritten(batch){for(const [id,body]of new Map(batch.rows.map(row=>[row.id,row.body])))assert.equal(raw.get(id).body,body);}
            let batch=changes(1);
            await phase(run,'raw-changed-write-alone',1,()=>apply(batch),()=>verifyWritten(batch));
            await phase(run,'raw-write-first-summary',1,summary,verifySummary);
            batch=changes(1);
            await phase(run,'raw-write-plus-first-summary-1-to-1',1,()=>({write:apply(batch),summary:summary()}),value=>{verifyWritten(batch);verifySummary(value.summary);});
            batch=changes(8);
            await phase(run,'burst-eight-changed-writes',8,()=>apply(batch),()=>verifyWritten(batch));
            await phase(run,'burst-first-summary',1,summary,verifySummary);
            batch=changes(1,true);
            await phase(run,'populated-source-write-plus-first-summary',1,()=>({write:apply(batch),summary:summary()}),value=>{verifyWritten(batch);verifySummary(value.summary);});

            if(config.flavor==='primitive-fallback')entry.apiMutationSkip='Primitive legacy comments are supported for read/fallback checks, not normalized as an API-edit fixture.';
            else{
                const rawMap=()=>JSON.parse(raw.get('map-0').body);
                const systemId=rawMap().nodes[0].system_id;
                const command=input=>run.service.jspace.command(42,'map-0',input);
                let input={revision:rawMap().revision,op:'node.save',node:{system_id:systemId,x:91,y:27}};
                await phase(run,'api-node-save-response',1,()=>command(input),value=>assert.equal(value.nodes[0].x,91));
                await phase(run,'api-node-immediate-summary',1,summary,verifySummary);
                await phase(run,'api-node-selected-detail',1,detail,value=>assert.equal(value.nodes[0].x,91));
                input={revision:rawMap().revision,op:'node.save',node:{system_id:systemId,x:193,y:57}};
                await phase(run,'api-node-response-summary-detail-combined',1,()=>({response:command(input),summary:summary(),selected:detail()}),value=>{assert.equal(value.response.nodes[0].x,193);assert.equal(value.selected.nodes[0].x,193);verifySummary(value.summary);});
                input={revision:rawMap().revision,op:'undo'};
                await phase(run,'api-node-undo-summary-detail-combined',1,()=>({response:command(input),summary:summary(),selected:detail()}),value=>{assert.equal(value.response.nodes[0].x,91);assert.equal(value.selected.nodes[0].x,91);verifySummary(value.summary);});
                const count=rawMap().comments.length;
                input={revision:rawMap().revision,op:'comment.add',comment:{body:'Measured lazy-screen comment',system_id:systemId}};
                await phase(run,'api-comment-add-response',1,()=>command(input),value=>assert.equal(value.comments.length,count+1));
                await phase(run,'api-comment-immediate-summary',1,summary,verifySummary);
                await phase(run,'api-comment-selected-detail',1,detail,value=>assert.equal(value.comments.length,count+1));
                input={revision:rawMap().revision,op:'undo'};
                await phase(run,'api-comment-undo-response',1,()=>command(input),value=>assert.equal(value.comments.length,count));
                input={revision:rawMap().revision,op:'comment.add',comment:{body:'Measured combined lazy-screen comment',system_id:systemId}};
                await phase(run,'api-comment-response-summary-detail-combined',1,()=>({response:command(input),summary:summary(),selected:detail()}),value=>{assert.equal(value.response.comments.length,count+1);assert.equal(value.selected.comments.length,count+1);verifySummary(value.summary);});
            }
            if(config.id==='plain-1'){
                const firstMap=JSON.parse(raw.get('map-0').body),document={format:'kairo-jspace',version:1,map:{name:'Lazy screen import',nodes:firstMap.nodes.slice(0,2),connections:[],comments:[],passages:[],observations:[],archived_nodes:[],signatures:[],scope:null}};
                const imported=await phase(run,'api-two-node-import-summary-detail-combined',1,()=>{const response=run.service.jspace.importMap(42,{document});return {response,summary:summary(),selected:run.service.jspace.map(42,response.id)};},value=>{assert.equal(value.response.nodes.length,2);assert.equal(value.selected.nodes.length,2);assert.equal(value.summary.maps.length,2);});
                await phase(run,'api-import-remove-plus-summary',1,()=>({response:run.service.jspace.remove(42,imported.response.id,{revision:imported.response.revision}),summary:summary()}),value=>{assert.equal(raw.get(imported.response.id),undefined);verifySummary(value.summary);});
            }
            run.clock.value=Date.parse(EXPIRY);
            await phase(run,'canonical-expiry-first-summary',1,summary,value=>{verifySummary(value);assert.ok(value.maps.every(row=>row.connection_count===0));assert.equal(value.source_map.connection_count,0);assert.equal(db.prepare("SELECT count(*) AS n FROM universe_records WHERE kind='link'").get().n,0);});
            const expiry=await phase(run,'post-expiry-generation-fill-summary',1,summary,verifySummary);
            await phase(run,'post-expiry-steady-summary',1,summary,(value,changes)=>{assert.deepEqual(value,expiry);assert.equal(changes,0);});
            const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)');
            await phase(run,'equivalent-final-checkpoint',1,()=>checkpoint.get(),value=>assert.equal(Number(value.busy),0));
            entry.finalStorage=await snapshot(run);entry.parity=parity(entry);
        }catch(error){caseFailure=error;throw error;}
        finally{try{await close(run);}catch(error){entry.cleanupFailure=error.stack;if(!caseFailure)throw error;}}
        assert.equal(hash(await readFile(join(seed,'kairo.sqlite'))),fixture.databaseSha256,'Immutable seed changed');
        await writeFile(output,JSON.stringify(result,null,2)+'\n');
        process.stdout.write(JSON.stringify({case:config.id,complete:true})+'\n');
    }
    assert.equal(external,0);await verifySource(baseline);await verifySource(arm);await verifyHarness();
    result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
    if(result.complete&&scratch){try{await rm(scratch,{recursive:true,force:true});result.temporaryDirectoryRemoved=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;process.exitCode=1;}}
    result.external=external;result.endedAt=new Date().toISOString();await writeFile(output,JSON.stringify(result,null,2)+'\n');
}
