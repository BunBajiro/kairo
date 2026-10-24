import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJSpaceScope, hasJSpaceScope, matchesJSpaceScope, jspaceScopeOptions} from '../../server/universe-jspace-scopes.mjs';

const atlas = {
    systems:[
        {system_id:1,name:'Alpha',space:'known',constellation_id:10,region_id:100},
        {system_id:2,name:'Beta',space:'known',constellation_id:20,region_id:100},
        {system_id:3,name:'Gamma',space:'known',constellation_id:30,region_id:200,faction_id:500},
        {system_id:4,name:'J000001',space:'wormhole',constellation_id:40,region_id:300},
    ],
    constellations:[{constellation_id:10,name:'Ten',region_id:100},{constellation_id:20,name:'Twenty',region_id:100},{constellation_id:30,name:'Thirty',region_id:200},{constellation_id:40,name:'J organisation',region_id:300}],
    regions:[{region_id:100,name:'North'},{region_id:200,name:'South'},{region_id:300,name:'J organisation'}],
};
const politicsConfig = {blocs:[{id:'home',name:'Home bloc',alliance_ids:[900]},{id:'far',name:'Far bloc',alliance_ids:[901]}],inference_enabled:true};
const context = {atlas,politicsConfig,sovereigntyReady:true,sovereignty:[{system_id:1,alliance_id:900},{system_id:2,alliance_id:901},{system_id:3,corporation_id:800,faction_id:500}]};
const validate = value => validateJSpaceScope(value,context);
const matching = (scope,extra={}) => atlas.systems.filter(row=>matchesJSpaceScope(scope,row.system_id,{...context,...extra})).map(row=>row.system_id);

test('empty scope is global and populated scope normalises IDs without mutating input',()=>{
    for(const input of [null,undefined,{}, {system_ids:[],alliance_ids:[]}]) assert.equal(validate(input),null);
    assert.equal(hasJSpaceScope(null),false);assert.deepEqual(matching(null),[1,2,3,4]);assert.equal(matchesJSpaceScope(null,999,context),false);
    const input={system_ids:[4,1,4],alliance_ids:[901,900,901]},before=JSON.stringify(input),scope=validate(input);
    assert.deepEqual(scope,{system_ids:[1,4],constellation_ids:[],region_ids:[],alliance_ids:[900,901],corporation_ids:[],power_bloc_ids:[]});
    assert.equal(JSON.stringify(input),before);assert.equal(hasJSpaceScope(scope),true);
});

test('scope validation rejects unknown systems, J-Space organisational areas and unconfigured or inferred blocs',()=>{
    assert.throws(()=>validate({system_ids:[999]}),/Universe atlas/);
    assert.throws(()=>validate({constellation_ids:[40]}),/K-Space constellation/);assert.throws(()=>validate({region_ids:[300]}),/K-Space region/);
    for(const id of ['missing','inferred-one','alliance-900']) assert.throws(()=>validate({power_bloc_ids:[id]}),/configured power bloc/);
    assert.deepEqual(validate({system_ids:[4]}).system_ids,[4],'Explicit wormhole home anchors remain valid');
    for(const input of [[],42,{system_ids:'1'},{alliance_ids:['900']},{corporation_ids:[-1]},{alliance_ids:[NaN]},{system_ids:new Array(2001).fill(1)},{faction_ids:[500]}]) assert.throws(()=>validate(input));
});

test('all scope groups combine by OR and geography remains independent of sovereignty freshness',()=>{
    assert.deepEqual(matching(validate({constellation_ids:[10]})),[1]);assert.deepEqual(matching(validate({region_ids:[100]})),[1,2]);
    assert.deepEqual(matching(validate({system_ids:[4],constellation_ids:[10],corporation_ids:[800]})),[1,3,4]);
    assert.deepEqual(matching(validate({system_ids:[4],region_ids:[100],alliance_ids:[901]}),{sovereigntyReady:false}),[1,2,4]);
});

test('ownership matches only verified current sovereignty, never faction ownership or J-Space assigned dominion',()=>{
    assert.deepEqual(matching(validate({alliance_ids:[900]})),[1]);assert.deepEqual(matching(validate({corporation_ids:[800]})),[3]);
    assert.deepEqual(matching(validate({corporation_ids:[500]})),[],'Faction ownership cannot be treated as corporation ownership');
    assert.deepEqual(matching(validate({alliance_ids:[900],corporation_ids:[800]}),{sovereigntyReady:false}),[]);
    assert.deepEqual(matching(validate({alliance_ids:[900]}),{sovereignty:[]}),[]);
    assert.deepEqual(matching(validate({alliance_ids:[900]}),{sovereignty:[{system_id:4,alliance_id:900}]}),[]);
    assert.deepEqual(matching(validate({corporation_ids:[800]}),{sovereigntyBySystemId:new Map([[2,{corporation_id:800}]]),sovereignty:[]}),[2]);
});

test('configured bloc membership updates dynamically and never falls back to inferred coalitions',()=>{
    const scope=validate({power_bloc_ids:['home']});assert.deepEqual(matching(scope),[1]);
    assert.deepEqual(matching(scope,{politicsConfig:{blocs:[{id:'home',name:'Home bloc',alliance_ids:[901]}]}}),[2]);
    assert.deepEqual(matching(scope,{politicsConfig:{blocs:[],groups:[{id:'home',alliance_ids:[900,901]}]}}),[]);
    assert.deepEqual(matching(scope,{sovereigntyReady:false}),[]);
    assert.throws(()=>validateJSpaceScope({power_bloc_ids:['inferred-one']},{atlas,politicsConfig:{blocs:[{id:'inferred-one',alliance_ids:[900]}]}}),/configured power bloc/);
});

test('scope options expose K-Space areas, named cached owners and only configured power blocs',()=>{
    const options=jspaceScopeOptions({...context,names:{900:'Known alliance',800:'Known NPC corporation'}});
    assert.deepEqual(options.systems.map(row=>row.id),[1,2,3,4]);assert.deepEqual(options.regions.map(row=>row.id),[100,200]);
    assert.ok(!options.constellations.some(row=>row.id===40));assert.equal(options.alliances.find(row=>row.id===900).name,'Known alliance');
    assert.equal(options.alliances.find(row=>row.id===901).name,'Alliance 901');assert.equal(options.corporations[0].name,'Known NPC corporation');
    assert.deepEqual(options.power_blocs.map(row=>row.id),['far','home']);assert.equal(options.sovereignty_ready,true);
});
