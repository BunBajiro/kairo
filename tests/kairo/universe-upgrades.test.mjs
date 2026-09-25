import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getUniverseStatic} from '../../server/universe-static.mjs';
import {parseUpgradeImport,exportUpgrades} from '../../server/universe-upgrades.mjs';
const atlas=getUniverseStatic(),system=name=>atlas.systems.find(row=>row.name===name).system_id;
test('the unmodified SMT example imports every system, including numeric system names, and round-trips',async()=>{
 const text=await readFile(new URL('../fixtures/smt-infrastructure-upgrades.txt',import.meta.url),'utf8'),preview=parseUpgradeImport(text,atlas);
 assert.equal(preview.valid,true);assert.equal(preview.upgrades.length,21);assert.equal(preview.stats.systems,7);
 assert.equal(preview.upgrades.filter(row=>row.system_id===system('8KR9-5')).length,4);assert.equal(preview.upgrades.filter(row=>row.system_id===system('1-NJLK')).length,3);
 assert.equal(preview.upgrades.find(row=>row.name==='Supercapital Construction Facilities').level,0);assert.equal(preview.upgrades.find(row=>row.name==='Supercapital Construction Facilities').online,false);
 const exported=exportUpgrades(preview.upgrades,atlas);assert.equal(exported.issues.length,0);assert.match(exported.text,/1\tSupercapital Construction Facilities\tOffline/);
 const again=parseUpgradeImport(exported.text,atlas);assert.equal(again.valid,true);assert.deepEqual([...again.upgrades].sort(order),[...preview.upgrades].sort(order));
});
const order=(a,b)=>a.system_id-b.system_id||a.slot-b.slot;
test('headers, comments, whitespace, unlevelled slots and case-insensitive status are accepted',()=>{
 const result=parseUpgradeImport('\uFEFF# Observation\r\nSovereignty Hub Jita\r\n1\tCynosural Navigation\tONLINE\r\n2  Major Threat Detection Array  3  offline\r\n',atlas);
 assert.equal(result.valid,true);assert.deepEqual(result.upgrades.map(({slot,level,online})=>({slot,level,online})),[{slot:1,level:0,online:true},{slot:2,level:3,online:false}]);
});
test('unknown headers, duplicate slots, malformed states and ranges return line diagnostics and invalidate the whole batch',()=>{
 const result=parseUpgradeImport('Jita\n1 Good 2 Online\n1 Duplicate Offline\nNotASystem\n2 Another Online\nAmarr\n1 Bad Active\n101 TooHigh Online\n2 BadLevel 6 Offline',atlas);
 assert.equal(result.valid,false);assert.equal(result.upgrades.length,1);assert.deepEqual(result.issues.map(row=>row.line),[3,4,5,7,8,9]);assert.ok(result.issues.every(row=>row.severity==='error'));
});
test('JSON preserves notes and observed state, while SMT warns about notes it cannot represent',()=>{
 const row={system_id:system('Jita'),slot:1,name:'Observed upgrade',level:0,online:false,notes:'Observer note\nSecond line'};
 const json=exportUpgrades([row],atlas,{format:'json'});assert.deepEqual(parseUpgradeImport(json.text,atlas).upgrades,[row]);
 assert.equal(exportUpgrades([row],atlas).warnings.length,1);assert.equal(parseUpgradeImport({upgrades:[{...row,online:'false'}]},atlas).valid,false);
});
test('oversized batches and duplicate JSON slots cannot become importable partial results',()=>{
 const row={system_id:system('Jita'),slot:1,name:'Upgrade',level:1,online:true};
 const big=parseUpgradeImport({upgrades:Array(1001).fill(row)},atlas);assert.equal(big.valid,false);assert.ok(big.issues.some(item=>item.message.includes('1,000')));
 assert.equal(exportUpgrades([row,row],atlas).text,'');assert.equal(parseUpgradeImport('',atlas).valid,false);
});
