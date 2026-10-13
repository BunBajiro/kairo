import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationCatalogue,findNearestDestinations,DESTINATION_CATEGORIES} from '../../server/universe-destinations.mjs';
import {planRoute} from '../../server/universe-routing.mjs';
import {getUniverseStatic} from '../../server/universe-static.mjs';

const now=Date.parse('2026-09-25T18:00:00Z'),future=new Date(now+3600000).toISOString();
const system=(id,security=.8,more={})=>({system_id:id,name:'System '+id,security,space:'known',standing:0,...more});
const gate=(from,to)=>({from_system_id:from,to_system_id:to});
const hole=(from,to,more={})=>({id:'hole:'+from+':'+to,kind:'wormhole',...gate(from,to),enabled:true,active:true,confirmed:true,accessible:true,expires_at:future,max_ship_size:'large',mass:'stable',...more});
const origin=system(1,-1,{space:'wormhole'});
const reference={source:'Fixture',categories:{blue_loot:{generatedAt:'2026-01-01T00:00:00Z',systems:[{systemId:4,stations:[{stationId:600001,name:'Reference station'}]}]}}};

test('nearest destinations use one confirmed chain and return navigable routes ranked by production graph costs',()=>{
    const input={systems:[origin,system(2,-.2),system(3,.2),system(4),system(5)],gates:[gate(2,3),gate(3,4),gate(2,5)],connections:[hole(1,2)],preferences:{useWormholes:true,shipSize:'small'},originId:1,category:'highsec',now};
    const result=findNearestDestinations(input);assert.equal(result.status,'ok');assert.deepEqual(result.results.map(row=>row.systemId),[5,4]);
    for(const row of result.results){const route=planRoute({...input,destinationId:row.systemId});assert.deepEqual(row.route.systemIds,route.systemIds);assert.equal(row.cost,route.cost);assert.equal(row.hops,route.hops);}
    assert.ok(result.visitedSystems<=input.systems.length);
});

test('unconfirmed, closed, inactive, expired, and unsupported-size links never create destination routes',()=>{
    const input={systems:[origin,system(4)],gates:[],preferences:{useWormholes:true,shipSize:'large'},originId:1,category:'highsec',now};
    for(const patch of [{confirmed:false},{active:false},{list_enabled:false},{life_status:'collapsed'},{expires_at:null},{expires_at:new Date(now).toISOString()},{max_ship_size:'small'},{accessible:false},{enabled:false}]){
        const result=findNearestDestinations({...input,connections:[hole(1,4,patch)]});assert.equal(result.status,'no_route',JSON.stringify(patch));assert.ok(result.excluded.length);
    }
    assert.equal(findNearestDestinations({...input,connections:[hole(1,4)]}).status,'ok');
});

test('critical and end-of-life route inclusions are explicit and do not bypass actual expiry',()=>{
    const input={systems:[origin,system(4)],originId:1,category:'highsec',now,preferences:{useWormholes:true,shipSize:'small'}};
    for(const [patch,flag] of [[{mass:'critical'},'includeCritical'],[{life_status:'eol'},'includeEol'],[{life_status:'critical'},'includeEol']]){
        assert.equal(findNearestDestinations({...input,connections:[hole(1,4,patch)]}).status,'no_route');
        assert.equal(findNearestDestinations({...input,connections:[hole(1,4,patch)],preferences:{...input.preferences,[flag]:true}}).status,'ok');
        assert.equal(findNearestDestinations({...input,connections:[hole(1,4,{...patch,expires_at:new Date(now-1).toISOString()})],preferences:{...input.preferences,[flag]:true}}).status,'no_route');
    }
});

test('critical lifetime and critical mass require their own independent opt-ins',()=>{
    const input={systems:[origin,system(4)],originId:1,category:'highsec',now,preferences:{useWormholes:true,shipSize:'small'}};
    const criticalLife=hole(1,4,{life_status:'critical'});
    const excluded=findNearestDestinations({...input,connections:[criticalLife],preferences:{...input.preferences,includeCritical:true}});
    assert.equal(excluded.status,'no_route');assert.ok(excluded.excluded.some(row=>row.reason==='End-of-life connection is excluded'));
    const both=hole(1,4,{life_status:'critical',mass:'critical'});
    assert.equal(findNearestDestinations({...input,connections:[both],preferences:{...input.preferences,includeEol:true}}).status,'no_route');
    const preferences={...input.preferences,includeCritical:true,includeEol:true};
    const allowed=findNearestDestinations({...input,connections:[both],preferences});
    assert.equal(allowed.status,'ok');assert.deepEqual(allowed.results[0].route.systemIds,planRoute({...input,connections:[both],preferences,destinationId:4}).systemIds);
    const expired=hole(1,4,{life_status:'critical',mass:'critical',expires_at:new Date(now).toISOString()});
    assert.equal(findNearestDestinations({...input,connections:[expired],preferences}).status,'no_route');
    assert.equal(planRoute({...input,connections:[expired],preferences,destinationId:4}).status,'no_route');
});

test('a user-confirmed private observation retains public attribution without requiring public shortcut opt-in',()=>{
    const input={systems:[origin,system(4)],originId:1,category:'highsec',now,preferences:{useWormholes:true,shipSize:'small'},connections:[hole(1,4,{reported_source:'thera',report_id:'original:1'})]};
    assert.equal(findNearestDestinations(input).status,'ok');
    assert.equal(findNearestDestinations({...input,connections:[{...input.connections[0],confirmed:false}]}).status,'no_route');
});

test('public shortcuts require source freshness, actual hub, completed report, explicit opt-in and vessel eligibility',()=>{
    const systems=[origin,system(12,-1,{space:'wormhole',name:'Thera'}),system(4)],report={id:'thera:1',source:'thera',...gate(12,4),reported:true,completed:true,expires_at:future,max_ship_size:'large'};
    const feeds={sources:{thera:{status:'ready'}},connections:[report]},input={systems,originId:1,category:'highsec',now,connections:[hole(1,12)],preferences:{useWormholes:true,shipSize:'small'},feeds};
    assert.equal(findNearestDestinations(input).status,'no_route');
    assert.equal(findNearestDestinations({...input,preferences:{...input.preferences,useThera:true}}).status,'ok');
    for(const patch of [{stale:true},{completed:false},{reported:false},{from_system_id:1},{expires_at:'invalid'}])assert.equal(findNearestDestinations({...input,preferences:{...input.preferences,useThera:true},feeds:{...feeds,connections:[{...report,...patch}]}}).status,'no_route');
    assert.equal(findNearestDestinations({...input,preferences:{...input.preferences,useThera:true},feeds:{...feeds,sources:{thera:{status:'stale'}}}}).status,'no_route');
    assert.equal(findNearestDestinations({...input,preferences:{useWormholes:true,useThera:true,shipSize:'capital',shipClass:'capital'}}).status,'no_route');
    assert.equal(findNearestDestinations({...input,feeds:{...feeds,connections:[]},connections:[hole(1,4,{...report,from_system_id:1,confirmed:true,accessible:true,route_eligible:true})],preferences:{...input.preferences,useThera:true}}).status,'no_route');
});

test('Thera entrance search can reach a current entrance without silently enabling transit through it',()=>{
    const input={systems:[system(1),system(4),system(12,-1,{space:'wormhole',name:'Thera'})],gates:[gate(1,4)],originId:1,category:'thera',now,preferences:{shipSize:'small'},feeds:{sources:{thera:{status:'ready'}},connections:[{id:'thera:1',source:'thera',...gate(12,4),reported:true,completed:true,expires_at:future,max_ship_size:'large'}]}};
    const result=findNearestDestinations(input);assert.deepEqual(result.results.map(row=>row.systemId),[4]);assert.equal(result.results[0].route.edges[0].kind,'gate');assert.equal(result.results[0].route.expiresAt,future);
});

test('public destination shortcuts work independently of the confirmed-chain toggle',()=>{
    for(const [source,name,preference] of [['thera','Thera','useThera'],['turnur','Turnur','useTurnur']]){
        const hub=system(12,-1,{space:source==='thera'?'wormhole':'known',name});
        const input={systems:[hub,system(4),system(5)],originId:12,category:'highsec',now,connections:[hole(12,5)],
            preferences:{useWormholes:false,[preference]:true,shipSize:'small'},feeds:{sources:{[source]:{status:'ready'}},connections:[
                {id:source+':1',source,...gate(12,4),reported:true,completed:true,expires_at:future,max_ship_size:'large'}]}};
        const result=findNearestDestinations(input);
        assert.equal(result.status,'ok');assert.deepEqual(result.results.map(row=>row.systemId),[4]);
        assert.equal(findNearestDestinations({...input,preferences:{...input.preferences,[preference]:false}}).status,'no_route');
    }
});

test('reference station search preserves real station data and destination-security filtering',()=>{
    const input={systems:[origin,system(4,.2)],connections:[hole(1,4)],originId:1,category:'blue_loot',now,preferences:{useWormholes:true,shipSize:'small'},reference};
    assert.equal(findNearestDestinations({...input,security:'high'}).status,'no_route');
    const result=findNearestDestinations({...input,security:'low'});assert.equal(result.results[0].stations[0].name,'Reference station');assert.equal(result.reference.referenceOnly,true);assert.ok(result.warnings.some(text=>text.includes('Current NPC orders')));
});

test('security boundary agrees with production routing and wormhole/unknown security is never a high/low exit',()=>{
    const systems=[origin,system(2,.449),system(3,.45),system(4,null),system(5,.8,{space:'wormhole'}),system(6,.9,{security_known:false})],gates=systems.slice(1).map(row=>gate(1,row.system_id));
    assert.deepEqual(findNearestDestinations({systems,gates,originId:1,category:'highsec',now}).results.map(row=>row.systemId),[3]);
    assert.deepEqual(findNearestDestinations({systems,gates,originId:1,category:'lowsec',now}).results.map(row=>row.systemId),[2]);
});

test('weighted preference, system exclusions and one-way links are respected',()=>{
    const input={systems:[origin,system(2,-.5),system(3,.8,{standing:10}),system(4)],gates:[gate(2,4),gate(3,4)],connections:[hole(1,2),hole(1,3)],originId:1,category:'blue_loot',reference,now,preferences:{useWormholes:true,shipSize:'small',mode:'safer'}};
    const result=findNearestDestinations(input).results[0];assert.deepEqual(result.route.systemIds,[1,3,4]);assert.equal(result.cost,planRoute({...input,destinationId:4}).cost);
    assert.deepEqual(findNearestDestinations({...input,preferences:{...input.preferences,avoidSystemIds:[3]}}).results[0].route.systemIds,[1,2,4]);
    assert.equal(findNearestDestinations({...input,connections:[hole(2,1,{directional:true})]}).status,'no_route');
});

test('bounded search, validation and origin-is-destination semantics remain predictable',()=>{
    const input={systems:[system(1),system(2),system(3)],gates:[gate(1,2),gate(2,3)],originId:1,category:'highsec',limit:1,now};
    const result=findNearestDestinations(input);assert.equal(result.results.length,1);assert.deepEqual(result.results[0].route.systemIds,[1]);assert.equal(result.results[0].hops,0);assert.equal(result.visitedSystems,1);
    for(const patch of [{limit:11},{limit:0},{category:'made_up'},{security:'nullsec'},{originId:99},{preferences:{useThera:'true'}},{preferences:{shipMassKg:-1}},{preferences:{shipSize:'titan'}},{preferences:{mode:'magic'}},{preferences:{avoidSystemIds:'2'}}])assert.throws(()=>findNearestDestinations({...input,...patch}));
});

test('bundled destinations have pinned provenance, only real atlas systems and the principal Jita station',()=>{
    const data=destinationCatalogue(),atlas=getUniverseStatic(),ids=new Set(atlas.systems.map(row=>row.system_id));
    assert.equal(data.sourceRevision,'6c5d43936e88f1d2acabc4d45fc82cbb67d4a08a');assert.equal(Object.keys(data.inputHashes).length,4);assert.equal(DESTINATION_CATEGORIES.length,8);
    assert.equal(Object.values(data.categories).reduce((sum,row)=>sum+row.systems.length,0),243);
    for(const category of Object.values(data.categories))for(const row of category.systems){assert.ok(ids.has(row.systemId));assert.ok(row.stations.length);for(const station of row.stations){assert.ok(Number.isSafeInteger(station.stationId));assert.ok(station.name);}}
    assert.equal(data.categories.trade_hubs.systems.find(row=>row.systemId===30000142).stations[0].stationId,60003760);
    data.categories.trade_hubs.systems.length=0;assert.equal(destinationCatalogue().categories.trade_hubs.systems.length,5);
});
