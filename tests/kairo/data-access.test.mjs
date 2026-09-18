import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {allScopes} from '../../server/modules/catalog.mjs';

async function fixture(t){
    const dir=await mkdtemp(join(tmpdir(),'kairo-data-access-')),store=openStore(dir);
    t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
    return {dir,store};
}

test('scheduling metadata stays current across writes, deletion and rollback without exposing payloads',async t=>{
    const {store}=await fixture(t),sample={status:'ready',data:[{item_id:123}],ownerId:77,refreshAt:'2026-09-18T12:00:00Z'};
    store.saveSnapshot(42,'assets',sample);
    assert.equal(store.snapshotMetadata(42,'assets').refreshAt,sample.refreshAt);
    assert.equal('data' in store.snapshotMetadata(42,'assets'),false);
    store.db.exec('BEGIN');
    store.saveSnapshot(42,'assets',{...sample,status:'stale'});
    assert.equal(store.snapshotMetadata(42,'assets').status,'stale');
    store.db.exec('ROLLBACK');
    assert.equal(store.snapshotMetadata(42,'assets').status,'ready');
    const copy=store.snapshot(42,'assets');copy.data[0].item_id=999;
    assert.equal(store.snapshot(42,'assets').data[0].item_id,123);
    store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(42);
    assert.equal(store.snapshotMetadata(42,'assets'),null);
});

test('protection projects only its evidence and still responds immediately to disabled modules',async t=>{
    const {store,dir}=await fixture(t),now=Date.now();
    const sample=data=>({status:'ready',data,updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()});
    store.saveSnapshot(42,'location',sample({solar_system_id:30000001,system:{security_status:1}}));
    for(const key of ['fw','sovereignty'])store.saveSnapshot(0,key,sample([]));
    store.set('opsec',{allowHighsec:true});
    const core=await createCore(store,{characters:()=>[{id:42,scopes:allScopes}]},{health:()=>({})},dir,{noSync:true});
    try{
        const read=store.snapshot;
        store.snapshot=(id,key)=>{assert.ok(['location','fw','sovereignty','profile','contacts','corporation_contacts','alliance_contacts'].includes(key),key);return read(id,key);};
        core.refreshOPSEC();assert.equal(core.stream.getOPSEC().state,'highsec');
        store.set('module:pilot',false);core.refreshOPSEC();
        assert.equal(core.stream.getOPSEC().state,'unknown');assert.equal(core.stream.getOPSEC().hidden,true);
        store.snapshot=read;
    }finally{await core.close();}
});
