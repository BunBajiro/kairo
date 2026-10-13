import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAnsiblexImport, exportAnsiblexSMT} from '../../server/universe-ansiblex.mjs';
import {getUniverseStatic} from '../../server/universe-static.mjs';
const systems = [{system_id:1,name:'A-A',region_name:'North'},{system_id:2,name:'B B',region_name:'South'},{system_id:3,name:'C-C',region_name:'South'}];
test('the user supplied SMT list imports all 22 endpoint lines as 11 reciprocal bridges',()=>{
 const text=readFileSync(new URL('../fixtures/smt-user-ansiblex.txt',import.meta.url),'utf8');
 const result=parseAnsiblexImport(text,getUniverseStatic().systems);
 assert.deepEqual(result.issues,[]); assert.equal(result.stats.entries,22); assert.equal(result.stats.reciprocalPairs,11);
 assert.equal(result.links.length,11); assert.ok(result.links.every(l=>!l.directional&&l.structure_id===null&&l.reverse_structure_id===null&&!l.accessible));
 const again=parseAnsiblexImport(exportAnsiblexSMT(result.links,getUniverseStatic().systems).text,getUniverseStatic().systems);
 const endpoints=r=>r.links.flatMap(l=>[[l.from_system_id,l.to_system_id].join(':'),[l.to_system_id,l.from_system_id].join(':')]).sort();
 assert.deepEqual(endpoints(again),endpoints(result));
});
test('SMT text and chat preserve directional endpoint structure IDs and never synthesize a reverse',()=>{
 const result=parseAnsiblexImport('\uFEFF# Bridges\r\n1000000000001 A-A --> B B\r\n1000000000002 B B --> A-A\r\n<url=showinfo:35841//1000000000003>B B » C-C - Bridge Name</url>',systems);
 assert.equal(result.valid,true); assert.equal(result.links.length,2);
 assert.equal(result.links[0].structure_id,1000000000001);assert.equal(result.links[0].reverse_structure_id,1000000000002);
 assert.equal(result.links[1].directional,true);assert.equal(result.links[1].structure_id,1000000000003);
 const round=parseAnsiblexImport(exportAnsiblexSMT(result.links,systems).text,systems);
 assert.deepEqual(round.links.map(({import_format,...l})=>l),result.links.map(({import_format,...l})=>l));
});
test('unknown systems, malformed lines, and conflicting endpoint IDs are visible errors',()=>{
 const result=parseAnsiblexImport('1 A-A --> Missing\nnot a bridge\n1000000000001 A-A --> B B\n1000000000002 A-A --> B B',systems);
 assert.equal(result.valid,false);assert.equal(result.issues.length,3);assert.equal(result.entries.length,4);
 assert.match(result.issues[0].message,/Unknown system/);assert.match(result.issues[2].message,/Conflicting/);
});
test('CSV labels, quoted fields, prior structure columns, JSON and tabs remain compatible',()=>{
 for(const text of ['from,to,label\nA-A,B B,"Home, bridge"','A-A\tB B\tHome, bridge']) {
  const parsed=parseAnsiblexImport(text,systems);assert.equal(parsed.valid,true);assert.equal(parsed.links[0].label,'Home, bridge');
 }
 const prior=parseAnsiblexImport('from_system_id,to_system_id,structure_id,label\n1,2,1000000000001,Home',systems);
 assert.equal(prior.links[0].structure_id,1000000000001);
 assert.equal(parseAnsiblexImport({links:[{from:1,to:2,structure_id:0,directional:true}]},systems).links[0].directional,true);
});
test('the rc4 from_system/to_system CSV header remains directly importable',()=>{
 const parsed=parseAnsiblexImport('from_system,to_system,label\nJita,Perimeter,Imported bridge one\nAmarr,Jita,Imported bridge two',getUniverseStatic().systems);
 assert.equal(parsed.valid,true);assert.deepEqual(parsed.issues,[]);assert.equal(parsed.entries.length,2);assert.equal(parsed.links.length,2);assert.deepEqual(parsed.links.map(row=>row.label),['Imported bridge one','Imported bridge two']);
});
test('JSON retains independent endpoint owners, capitals, access and enabled directions',()=>{
 const result=parseAnsiblexImport({accessible:true,links:[{from:1,to:2,accessible:true,reverse_accessible:false,owner_alliance_id:10,reverse_owner_alliance_id:20,capital_system_id:1,reverse_capital_system_id:3}]},systems);
 assert.equal(result.links[0].reverse_accessible,false);assert.equal(result.links[0].reverse_owner_alliance_id,20);assert.equal(result.links[0].reverse_capital_system_id,3);
 const directed=parseAnsiblexImport({links:[{from:1,to:2,directional:true,enabled:true},{from:2,to:1,directional:true,enabled:false}]},systems);
 assert.equal(directed.links.length,2);assert.ok(directed.links.every(l=>l.directional));assert.deepEqual(directed.links.map(l=>l.enabled),[true,false]);
});
test('import ownership defaults preserve explicit endpoint owners and their independent capitals',()=>{
 const defaults={owner_alliance_id:10,capital_system_id:1};
 const parsed=parseAnsiblexImport({...defaults,links:[{from:1,to:2,owner_alliance_id:20,capital_system_id:3,reverse_owner_alliance_id:30}]},systems);
 assert.equal(parsed.valid,true);assert.equal(parsed.links[0].owner_alliance_id,20);assert.equal(parsed.links[0].capital_system_id,3);
 assert.equal(parsed.links[0].reverse_owner_alliance_id,30);assert.equal(parsed.links[0].reverse_capital_system_id,null);
 const unknownCapital=parseAnsiblexImport({...defaults,links:[{from:1,to:2,owner_alliance_id:20}]},systems);
 assert.equal(unknownCapital.links[0].owner_alliance_id,20);assert.equal(unknownCapital.links[0].capital_system_id,undefined);
 assert.equal(parseAnsiblexImport({...defaults,capital_system_id:'missing',text:'0 A-A --> B B'},systems).valid,false);
});
