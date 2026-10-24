import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as turn} from 'node:timers/promises';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';
import {catalog, allScopes} from '../../server/modules/catalog.mjs';
import {LOCATION_MAX_AGE} from '../../server/opsec.mjs';

async function fixture(t, request) {
    const dir=await mkdtemp(join(tmpdir(),'kairo-idle-protection-')), store=openStore(dir), epoch=Date.now();
    let now=epoch, calls=0;
    t.mock.method(Date,'now',()=>now);
    const characters=[{id:42,scopes:[...allScopes]}];
    const sample=data=>({status:'ready',data,updatedAt:new Date(epoch).toISOString(),expiresAt:new Date(epoch+600000).toISOString(),refreshAt:new Date(epoch+600000).toISOString()});
    for(const module of catalog){
        const enabled=['pilot','universe','opsec'].includes(module.id);
        store.set('module:'+module.id,enabled);
        if(enabled)for(const dataset of module.datasets)store.saveSnapshot(module.id==='universe'?0:42,dataset.key,sample([]));
    }
    store.saveSnapshot(42,'location',sample({solar_system_id:1,system:{security_status:-.5}}));
    store.saveSnapshot(42,'profile',sample({corporation_id:5,alliance_id:77}));
    store.saveSnapshot(42,'corporation_contacts',{...sample([]),ownerId:5});
    store.saveSnapshot(42,'alliance_contacts',{...sample([]),ownerId:77});
    store.saveSnapshot(0,'sovereignty',sample([{system_id:1,alliance_id:77},{system_id:2,alliance_id:88}]));
    store.set('opsec',{characterId:42,blueAlliances:[77],hostileAlliances:[88]});
    const fetch=async(path,options)=>{
        calls++;
        if(!request)throw new Error('A scheduled protection sample must not make a request');
        return request(path,options,sample);
    };
    const core=await createCore(store,{characters:()=>characters},{request:fetch,paged:fetch,names:async()=>({}),health:()=>({})},dir,{noSync:true});
    t.after(async()=>{await core.close();store.close();await rm(dir,{recursive:true,force:true});});
    return {core,store,characters,sample,epoch,at:elapsed=>{now=epoch+elapsed;},calls:()=>calls};
}

test('cached protection batches retain current output without one projection per cached dataset',async t=>{
    const h=await fixture(t);
    const set=h.core.stream.setOPSEC;let projections=0;
    h.core.stream.setOPSEC=value=>{projections++;return set(value);};
    const results=await h.core.syncProtection();
    assert.equal(results.length,7);
    assert.ok(results.every(result=>result.status==='fulfilled'));
    assert.equal(projections,1,'The completed batch evaluates protection once when no evidence changed.');
    assert.equal(h.core.stream.getOPSEC().state,'blue');
    assert.equal(h.calls(),0);
});

test('protection batches revoke unavailable scope and disabled modules despite future schedules',async t=>{
    const h=await fixture(t);
    h.characters[0].scopes=h.characters[0].scopes.filter(scope=>scope!=='esi-location.read_location.v1');
    await h.core.syncProtection();
    assert.equal(h.store.snapshot(42,'location').status,'missing_scope');
    assert.equal(h.core.stream.getOPSEC().state,'unknown');
    h.characters[0].scopes=[...allScopes];
    h.store.saveSnapshot(42,'location',h.sample({solar_system_id:1,system:{security_status:-.5}}));
    await h.core.syncProtection();
    assert.equal(h.core.stream.getOPSEC().state,'blue');
    h.core.toggle('universe',false);
    assert.equal(h.core.stream.getOPSEC().state,'unknown');
    await h.core.syncProtection();
    assert.equal(h.core.stream.getOPSEC().hidden,true);
    assert.equal(h.calls(),0);
});

test('awaiting a cached protection batch still expires jump continuity during retry backoff',async t=>{
    const h=await fixture(t);
    h.store.saveSnapshot(42,'location',{...h.store.snapshot(42,'location'),status:'stale',errorStatus:503,retryAt:new Date(h.epoch+120000).toISOString()});
    h.at(LOCATION_MAX_AGE-1);await h.core.syncProtection();
    assert.equal(h.core.stream.getOPSEC().state,'blue');
    assert.equal(h.core.stream.getOPSEC().pending,true);
    h.at(LOCATION_MAX_AGE);await h.core.syncProtection();
    assert.equal(h.core.stream.getOPSEC().state,'unknown');
    assert.equal(h.core.stream.getOPSEC().hidden,true);
    assert.equal(h.calls(),0);
});

test('a changed location updates protection before a slow peer dataset completes',async t=>{
    let release;
    const blocked=new Promise(resolve=>{release=resolve;});
    const h=await fixture(t,async(path,options,sample)=>{
        if(path==='/sovereignty/systems'){await blocked;return sample({solar_systems:[{solar_system_id:1,claim:{alliance:{alliance_id:77}}},{solar_system_id:2,claim:{alliance:{alliance_id:88}}}]});}
        if(path.endsWith('/location'))return sample({solar_system_id:2});
        if(path==='/universe/systems/2')return sample({name:'Destination',security_status:-.5});
        return sample({});
    });
    for(const [id,key] of [[42,'location'],[0,'sovereignty']])h.store.saveSnapshot(id,key,{...h.store.snapshot(id,key),refreshAt:new Date(h.epoch-1).toISOString()});
    let completed=false;
    const pending=h.core.syncProtection().then(()=>{completed=true;});
    try{
        await turn();
        assert.equal(completed,false);
        assert.equal(h.store.snapshot(42,'location').data.solar_system_id,2);
        assert.equal(h.core.stream.getOPSEC().state,'hostile');
    }finally{release();await pending;}
});
