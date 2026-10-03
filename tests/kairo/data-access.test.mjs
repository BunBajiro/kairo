import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {allScopes,catalog} from '../../server/modules/catalog.mjs';
import {changeSession,sessionReport} from '../../server/history.mjs';

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

test('cached routine datasets do not repeatedly load protection pilot identity',async t=>{
    const {store,dir}=await fixture(t),now=Date.now();
    const modules=new Set(['training','wallet','hangar','industry','combat','comms']);
    const sample={status:'ready',data:[],updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),refreshAt:new Date(now+600000).toISOString()};
    let expectedChecks=0,identityReads=0,metadataReads=0;
    for(const module of catalog){
        store.set('module:'+module.id,modules.has(module.id));
        if(modules.has(module.id))for(const dataset of module.datasets){store.saveSnapshot(42,dataset.key,sample);expectedChecks++;}
    }
    const auth={characters:()=>{identityReads++;return [{id:42,scopes:allScopes}];}};
    const core=await createCore(store,auth,{health:()=>({}),request:()=>{throw new Error('Fresh routine data must not make a request');}},dir,{noSync:true});
    const metadata=store.snapshotMetadata;
    try{
        store.snapshotMetadata=(...args)=>{metadataReads++;return metadata(...args);};
        identityReads=0;
        await core.sync(42);
        assert.equal(metadataReads,expectedChecks,'Every routine dataset still checks its current scheduling metadata.');
        assert.equal(identityReads,2,'Only sync admission and its final protection refresh require current pilot identity.');
    }finally{store.snapshotMetadata=metadata;await core.close();}
});

test('Sessions keep pilot travel and hull history with Universe disabled and stop when Pilot is disabled',async t=>{
    const {store,dir}=await fixture(t),nameRequests=[];
    // No plugin modules are loaded from this empty directory: the history
    // subscription must belong to core, independent of the old Journey module.
    const core=await createCore(store,{characters:()=>[{id:42,scopes:allScopes}]},{
        health:()=>({}),names:async ids=>{nameRequests.push(ids);return {587:'Rifter'};},
    },dir,{noSync:true});
    try{
        core.toggle('universe',false);
        store.set('module:journey',false);
        assert.equal(core.moduleList().some(module=>module.id==='journey'),false);
        const now=Date.now();
        store.saveSnapshot(42,'ship',{status:'ready',data:{ship_id:100,ship_type_id:588},updatedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString()});
        const session=changeSession(store,core.publish,42,{action:'start',label:'Map-independent flight'});
        const observe=()=>{
            core.bus.emit({type:'data.location',characterId:42,payload:{previous:{solar_system_id:30002187},current:{solar_system_id:30000142,system:{name:'Jita'}}}});
            core.bus.emit({type:'data.ship',characterId:42,payload:{previous:{ship_id:100,ship_type_id:588},current:{ship_id:101,ship_type_id:587}}});
        };
        observe();
        await new Promise(resolve=>setImmediate(resolve));
        const report=sessionReport(store,session.id,42);
        assert.equal(report.visits.length,1);
        assert.equal(report.visits[0].system_id,30000142);
        assert.equal(report.visits[0].ship_type_id,588);
        assert.equal(report.stats.shipChanges,1);
        assert.ok(report.events.some(event=>event.type==='location.changed'));
        assert.deepEqual(nameRequests,[],'An optional hull name must not delay activity past a session boundary.');

        core.toggle('pilot',false);
        observe();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(store.db.prepare('SELECT COUNT(*) n FROM visits WHERE character_id=42').get().n,1);
        assert.equal(store.db.prepare("SELECT COUNT(*) n FROM events WHERE character_id=42 AND type='ship.changed'").get().n,1);
        assert.deepEqual(nameRequests,[],'Disabled Pilot must gate subscriptions before optional enrichment.');
    }finally{await core.close();}
});
