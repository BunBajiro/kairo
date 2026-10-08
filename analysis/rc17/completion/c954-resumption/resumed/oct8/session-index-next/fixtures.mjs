import assert from 'node:assert/strict';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {EPOCH,DAY,iso,hash,domainDigest,migration,writeJSON,readJSON,configurations,storage} from './common.mjs';

export async function seedFixtures(openStore,directory){
    const manifest={schemaVersion:1,complete:false,cases:[]};
    for(const kind of ['write','cadence'])for(const config of configurations){
        const id=kind+'-'+config.id,root=join(directory,id);await mkdir(root,{recursive:false});
        const store=openStore(root);
        let domain,pages;
        try{
            migration(store,'baseline');
            const put=store.db.prepare('INSERT INTO sessions(id,character_id,label,started,ended,start_context,end_context) VALUES(?,?,?,?,?,?,?)');
            const visit=store.db.prepare('INSERT INTO visits(character_id,system_id,name,at,session_id) VALUES(?,?,?,?,?)');
            const context=JSON.stringify({system:{id:1,name:'Alpha'},alliance:{id:77,name:'Synthetic'}});
            store.db.exec('BEGIN');
            for(let pilot=1;pilot<=config.pilots;pilot++){
                for(let i=0;i<config.archived;i++)put.run(`${pilot}-old-${i}`,pilot,'old',iso(EPOCH-(i+3)*DAY),iso(EPOCH-(i+3)*DAY+3600000),kind==='cadence'?context:'{}','{}');
                if(kind==='cadence')for(const [name,start,end]of [['active',EPOCH-5*DAY,null],['recent1',EPOCH-400000,EPOCH-300000],['recent2',EPOCH-400000,EPOCH-200000],['boundary',EPOCH-2*DAY,EPOCH-DAY],['near-boundary',EPOCH-2*DAY,EPOCH-DAY+60000]]){
                    const session=`${pilot}-${name}`;put.run(session,pilot,name,iso(start),end===null?null:iso(end),context,'{}');
                    const count=name==='active'?1000:2;
                    for(let i=0;i<count;i++)visit.run(pilot,1+i%11,'System '+(1+i%11),iso(start+i*(name==='active'?400000:1000)),session);
                }
            }
            store.db.exec('COMMIT; ANALYZE; PRAGMA wal_checkpoint(TRUNCATE)');
            domain=domainDigest(store);
            const state=await storage(store,root);pages={pageSize:state.pageSize,pageCount:state.pageCount,freelistCount:state.freelistCount};
            assert.equal(domain.tables.sessions.rows,(config.archived+(kind==='cadence'?5:0))*config.pilots);
            assert.equal(domain.tables.visits.rows,kind==='cadence'?1008*config.pilots:0);
        }finally{store.close();}
        const bytes=await readFile(join(root,'kairo.sqlite'));
        manifest.cases.push({id,kind,config,relativeFile:id+'/kairo.sqlite',bytes:bytes.length,sha256:hash(bytes),domain,pages});
    }
    manifest.complete=true;await writeJSON(join(directory,'seeds.json'),manifest);return manifest;
}
export async function copySeed(directory,id,target){
    const manifest=await readJSON(join(directory,'seeds.json'));assert.equal(manifest.complete,true);
    const record=manifest.cases.find(row=>row.id===id);assert.ok(record,'Unknown seed '+id);
    const bytes=await readFile(join(directory,record.relativeFile));assert.equal(bytes.length,record.bytes);assert.equal(hash(bytes),record.sha256);
    await copyFile(join(directory,record.relativeFile),join(target,'kairo.sqlite'));
    assert.equal(hash(await readFile(join(target,'kairo.sqlite'))),record.sha256);
    return record;
}
