import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {assertLock,blockNetwork,loadSourceManifest,verifySource,verifyHarness,validateSourceRole,writeJSON,
    measure,storage,fileSizes,domainDigest,migration,configurations,EPOCH,iso,limitations} from './common.mjs';
import {seedFixtures,copySeed} from './fixtures.mjs';

assertLock();blockNetwork();
const [manifestPath,variant,output,seedDirectory,mode,caseId,harnessPath]=process.argv.slice(2);
assert.ok(['baseline','candidate'].includes(variant));assert.ok(['seed-only','write'].includes(mode));
const here=dirname(fileURLToPath(import.meta.url)),source=await loadSourceManifest(manifestPath);
await validateSourceRole(source,variant,here);await verifyHarness(harnessPath);
const {openStore}=await import(pathToFileURL(join(source.root,'server/store.mjs')));
const result={schemaVersion:1,complete:false,sourceVerified:false,kind:mode,variant,sourceFingerprint:source.fingerprint,
    sourceCommit:source.sourceCommit,node:process.version,startedAt:new Date().toISOString(),limitations};
let store,directory;
try{
    if(mode==='seed-only'){
        assert.equal(variant,'baseline');result.seeds=await seedFixtures(openStore,seedDirectory);
    }else{
        const config=configurations.find(row=>row.id===caseId);assert.ok(config);result.config=config;result.id='write-'+caseId;
        directory=await mkdtemp(join(tmpdir(),'kairo-s3-write-'));result.temporaryDirectory=directory;
        const seed=await copySeed(seedDirectory,result.id,directory);
        result.storage={beforeFirstOpen:{...await fileSizes(directory),...seed.pages}};
        const opened=measure(()=>openStore(directory));store=opened.value;
        result.firstOpen=opened.measurement;result.migration=migration(store,variant);
        result.storage.afterFirstOpen=await storage(store,directory);
        const firstDomain=domainDigest(store);assert.deepEqual(firstDomain,seed.domain);
        const checkpoint=measure(()=>store.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all());
        assert.equal(checkpoint.value[0].busy,0);result.firstCheckpoint=checkpoint.measurement;
        result.storage.afterFirstCheckpoint=await storage(store,directory);store.close();store=null;
        const reopened=measure(()=>openStore(directory));store=reopened.value;result.ordinaryReopen=reopened.measurement;
        assert.deepEqual(domainDigest(store),seed.domain);migration(store,variant);
        result.storage.beforeWrites=await storage(store,directory);
        const put=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended) VALUES(?,?,?,?,?)');
        const end=store.db.prepare('UPDATE sessions SET ended=? WHERE id=?');
        const rows=[];for(let pilot=1;pilot<=config.pilots;pilot++)for(let i=0;i<500;i++)rows.push({id:`${pilot}-new-${i}`,pilot,started:iso(EPOCH+i*1000),ended:iso(EPOCH+i*1000+1000)});
        result.insert=measure(()=>{store.db.exec('BEGIN');for(const row of rows)put.run(row.id,row.pilot,'New',row.started,null);store.db.exec('COMMIT');}).measurement;
        result.storage.afterInsert=await storage(store,directory);
        const inserted=domainDigest(store);assert.equal(inserted.tables.sessions.rows,(config.archived+500)*config.pilots);
        for(const row of rows){const actual=store.db.prepare('SELECT * FROM sessions WHERE id=?').get(row.id);assert.equal(actual.character_id,row.pilot);assert.equal(actual.started,row.started);assert.equal(actual.ended,null);}
        result.endUpdate=measure(()=>{store.db.exec('BEGIN');for(const row of rows)end.run(row.ended,row.id);store.db.exec('COMMIT');}).measurement;
        result.storage.afterEndUpdate=await storage(store,directory);
        const ended=domainDigest(store);
        for(const row of rows){const actual=store.db.prepare('SELECT * FROM sessions WHERE id=?').get(row.id);assert.equal(actual.character_id,row.pilot);assert.equal(actual.started,row.started);assert.equal(actual.ended,row.ended);}
        const finalCheckpoint=measure(()=>store.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all());
        assert.equal(finalCheckpoint.value[0].busy,0);result.finalCheckpoint=finalCheckpoint.measurement;
        result.storage.afterFinalCheckpoint=await storage(store,directory);
        store.close();store=null;store=openStore(directory);migration(store,variant);
        assert.deepEqual(domainDigest(store),ended,'Final rows must survive close/reopen');
        result.storage.afterVerificationReopen=await storage(store,directory);
        result.parity={fixture:{id:seed.id,bytes:seed.bytes,sha256:seed.sha256},firstDomain,inserted,ended,insertedRows:rows.length,endedRows:rows.length,
            normalization:'Only the expected S3 migration record is excluded from full application-table digests; its presence/index are separately asserted. No Session values or UUIDs normalized.'};
        store.close();store=null;
    }
    await verifySource(source);await verifyHarness(harnessPath);result.sourceVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;process.exitCode=1;}
finally{
    try{store?.close();}catch(error){result.closeFailure=error.stack;result.complete=false;process.exitCode=1;}
    if(result.complete&&directory){try{await rm(directory,{recursive:true,force:true});result.temporaryDirectoryRemoved=true;}catch(error){result.cleanupFailure=error.stack;result.complete=false;process.exitCode=1;}}
    result.endedAt=new Date().toISOString();await writeJSON(output,result);
    process.stdout.write(JSON.stringify({kind:mode,id:result.id,complete:result.complete,output})+'\n');
}
