import test from 'node:test';
import assert from 'node:assert/strict';
import {retainValue,retainSnapshots,retainSnapshot,changeAffectsPilot,changeNeedsState,goalInputRevision,goalSourceKeys,mergeResourceRevisions} from '../../components/kairo/resource-state.mjs';
import {createUIResourceVersions,eventResources} from '../../server/ui-resources.mjs';

test('unchanged snapshot revisions retain large payload identity without reading rows', () => {
    const data = [{item_id:1}], old = {assets:{status:'ready',data,dataRevision:'process:42:assets:1'}};
    const unread = new Proxy([], {ownKeys(){throw new Error('Unchanged payload must not be traversed');},get(){throw new Error('Unchanged payload must not be read');}});
    assert.equal(retainSnapshots(old,{assets:{...old.assets,data:unread}}),old);
    const expired = retainSnapshots(old,{assets:{...old.assets,status:'stale',data:unread}});
    assert.notEqual(expired,old); assert.equal(expired.assets.data,data); assert.equal(expired.assets.status,'stale');
});
test('same timestamp cannot hide corrected data, coverage, source removal or a new process', () => {
    const before = {status:'ready',updatedAt:'same-millisecond',data:[1],dataRevision:'old:42:killmails:1:combat:0',participation:{status:'partial'}};
    for(const after of [{...before,data:[2],dataRevision:'old:42:killmails:1:combat:1'}, {...before,data:[2],dataRevision:'new:42:killmails:1:combat:0'}, {status:'waiting',data:null,dataRevision:'missing'}]) {
        const value=retainSnapshot(before,after);assert.notEqual(value,before);assert.equal(value.data,after.data);
    }
    const coverage=retainSnapshot(before,{...before,data:[1],participation:{status:'ready'}});
    assert.equal(coverage.data,before.data);assert.equal(coverage.participation.status,'ready');
    const unsupported={status:'ready',updatedAt:'same-millisecond',data:[2]};
    assert.equal(retainSnapshot({...unsupported,data:[1]},unsupported).data,unsupported.data);
});
test('unchanged names and Session rows retain references while edits invalidate', () => {
    const names={1:'A'},rows=[{id:'s',label:'Flight',started:'now',ended:null}];
    assert.equal(retainValue(names,{1:'A'}),names);assert.equal(retainValue(rows,structuredClone(rows)),rows);
    assert.notEqual(retainValue(rows,[{...rows[0],label:'Debrief'}]),rows);
});
test('pilot and typed resource routing ignores unrelated state without dropping global recovery', () => {
    assert.equal(changeAffectsPilot({characterId:2},1),false);
    for(const detail of [{characterId:0},{},{characterId:1}])assert.equal(changeAffectsPilot(detail,1),true);
    assert.equal(changeNeedsState({resources:['activity','goals']}),false);
    assert.equal(changeNeedsState({resources:['notes']}),false);
    assert.equal(changeNeedsState({resources:['sessions']}),true);
    assert.equal(changeNeedsState({}),true);
});
test('every automatic Goal source and queue clock boundary invalidates independently of Sessions', () => {
    const initial=Object.fromEntries(goalSourceKeys.map(key=>[key,{status:'ready',data:[],dataRevision:'sample-1'}]));
    const base=goalInputRevision(initial,0);
    for(const key of goalSourceKeys)assert.notEqual(goalInputRevision({...initial,[key]:{...initial[key],dataRevision:'sample-2'}},0),base,key);
    assert.equal(goalInputRevision({...initial,location:{status:'ready',data:{},dataRevision:'location-2'}},0),base);
    const queue={queue:{status:'ready',data:[{finish_date:'2026-01-01T00:00:10Z'}],dataRevision:'queue-1'}};
    assert.notEqual(goalInputRevision(queue,Date.parse('2026-01-01T00:00:09Z')),goalInputRevision(queue,Date.parse('2026-01-01T00:00:10Z')));
    const combat={killmails:{status:'missing_scope',data:[],dataRevision:'combat-1',participation:{status:'ready',expiresAt:'2026-01-01T00:00:10Z'}}};
    assert.notEqual(goalInputRevision(combat,Date.parse('2026-01-01T00:00:09Z')),goalInputRevision(combat,Date.parse('2026-01-01T00:00:10Z')));
});
test('resource versions isolate pilots, preserve global invalidation and reject older same-pilot responses', () => {
    const versions=createUIResourceVersions('process'),one=versions.current(1),two=versions.current(2);
    const changed=versions.changed(1,['goals']);assert.notEqual(changed.goals,one.goals);assert.equal(changed.notes,one.notes);assert.deepEqual(versions.current(2),two);
    const global=versions.changed(0,['goals']);assert.equal(versions.current(1).goals,global.goals);assert.equal(versions.current(2).goals,global.goals);
    const newest=mergeResourceRevisions(one,global,['goals']);assert.equal(mergeResourceRevisions(newest,changed,['goals']),newest);
    assert.notEqual(mergeResourceRevisions(newest,{goals:'restarted:0'},['goals']),newest);
    assert.deepEqual(eventResources({type:'goal.updated'}),['activity','goals']);
    assert.deepEqual(eventResources({type:'note.created'}),['activity','notes']);
    assert.deepEqual(eventResources({type:'session.ended'}),['activity','sessions']);
});


test('snapshot name merges retain unchanged full/partial maps and copy changed names without dropping unrelated IDs', async () => {
    const {mergeResourceNames} = await import('../../components/kairo/resource-state.mjs');
    const before = Object.freeze({'0':'Zero','42':'Pilot','99':'Station'});
    for (const incoming of [undefined,null,{}, {...before}, {'42':'Pilot'}]) assert.equal(mergeResourceNames(before,incoming),before);
    const next = mergeResourceNames(before, Object.freeze({'42':'Renamed','100':'New'}));
    assert.notEqual(next,before);assert.deepEqual(next,{'0':'Zero','42':'Renamed','99':'Station','100':'New'});assert.equal(before['42'],'Pilot');
    const absentUndefined = mergeResourceNames(before, {'new':undefined});
    assert.ok(Object.hasOwn(absentUndefined,'new'));assert.notEqual(absentUndefined,before);
    const special = mergeResourceNames(before, JSON.parse('{"__proto__":"Name","constructor":"Constructor name"}'));
    assert.equal(Object.getPrototypeOf(special),Object.prototype);assert.ok(Object.hasOwn(special,'__proto__'));assert.equal(special.__proto__,'Name');
});

test('snapshot name owner matches spread-and-retain semantics for valid flat maps across event sequences', async () => {
    const {mergeResourceNames} = await import('../../components/kairo/resource-state.mjs');
    let seed = 0x1726;
    const random = size => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % size;};
    for (let sequence = 0; sequence < 64; sequence++) {
        let previous = Object.freeze(Object.fromEntries(Array.from({length: 24}, (_, index) => [String(index + 1), `Pilot ${index}`])));
        for (let event = 0; event < 32; event++) {
            const incoming = event % 4 === 0 ? {...previous} : {};
            const edits = random(12);
            for (let edit = 0; edit < edits; edit++) {
                const id = String(random(36) + 1);
                incoming[id] = event % 3 ? (previous[id] || `New ${id}`) : `Renamed ${id} ${event}`;
            }
            const before = JSON.stringify(previous), received = JSON.stringify(incoming);
            Object.freeze(incoming);
            const expected = retainValue(previous, {...previous, ...incoming});
            const actual = mergeResourceNames(previous, incoming);
            assert.deepEqual(actual, expected);
            assert.equal(actual === previous, expected === previous);
            assert.equal(JSON.stringify(previous), before);
            assert.equal(JSON.stringify(incoming), received);
            previous = Object.freeze(actual);
        }
    }
});

test('snapshot name owner uses own enumerable keys and preserves spread prototype behavior', async () => {
    const {mergeResourceNames} = await import('../../components/kairo/resource-state.mjs');
    const previous = Object.freeze({'42':'Pilot'});
    const inherited = Object.create({'42':'Inherited rename','99':'Inherited addition'});
    Object.defineProperty(inherited, '100', {value:'Hidden name', enumerable:false});
    assert.equal(mergeResourceNames(previous, inherited), previous);
    inherited['43'] = 'New pilot';
    assert.deepEqual(mergeResourceNames(previous, inherited), retainValue(previous, {...previous, ...inherited}));
    const shadowed = Object.create({'42':'Pilot'});
    const next = mergeResourceNames(shadowed, {'42':'Pilot'});
    assert.notEqual(next, shadowed); assert.ok(Object.hasOwn(next, '42'));
    assert.equal(Object.getPrototypeOf(next), Object.prototype);
    const nullPrototype = Object.freeze(Object.assign(Object.create(null), {'42':'Pilot'}));
    assert.equal(mergeResourceNames(previous, nullPrototype), previous);
});

test('unchanged snapshot names do not copy or enumerate the retained full map', async () => {
    const {mergeResourceNames} = await import('../../components/kairo/resource-state.mjs');
    const previous = new Proxy({'42':'Pilot','99':'Station'}, {ownKeys(){throw new Error('Unchanged retained names must not be copied or enumerated');}});
    assert.equal(mergeResourceNames(previous, {'42':'Pilot','99':'Station'}), previous);
    assert.equal(mergeResourceNames(previous, {'42':'Pilot'}), previous);
});
