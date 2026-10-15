import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationRowsModel, operationRows, priceMap, assetReferenceTotal, walletGraph, createTableModel, searchableRow, compareTableRows, tablePage} from '../../components/kairo/derived-models.mjs';

const oldTable = (rows, query, sort) => {
  const result = rows.filter(r => !query || Object.values(r).filter(v => typeof v !== 'object').join(' ').toLowerCase().includes(query.toLowerCase()));
  if (sort) result.sort((a,b) => {const av = a[sort.key] ?? '', bv = b[sort.key] ?? ''; return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * (sort.asc ? 1 : -1);});
  return result;
};
test('operation models retain rows across unrelated resources and names, and replace relevant pilot/name inputs', () => {
  let builds = 0;
  const owner = createOperationRowsModel('mining', (...args) => {builds++; return operationRows(...args);});
  const input = [{date:'2026-10-01',type_id:10,solar_system_id:20,quantity:40}];
  const names = {10:'Veldspar',20:'Jita'};
  const first = owner(input, names);
  for (let i=0;i<100;i++) assert.equal(owner(input,names),first);
  assert.equal(owner(input,{...names,30:'Unrelated new item'}),first);
  assert.equal(builds,1);
  const renamed = owner(input,{...names,10:'Dense Veldspar'});
  assert.notEqual(renamed,first); assert.equal(renamed[0].name,'Dense Veldspar'); assert.equal(builds,2);
  const pilot = owner([{...input[0],quantity:11}],names);
  assert.equal(pilot[0].quantity,11); assert.equal(builds,3); assert.equal(input[0].name,undefined);
  const empty = owner([],names); assert.deepEqual(empty,[]); assert.equal(builds,4);
});
test('journal models do not depend on names and inactive model owners perform no derivation', () => {
  let journalBuilds=0, jobsBuilds=0;
  const journal=createOperationRowsModel('journal',(...args)=>{journalBuilds++;return operationRows(...args);});
  const jobs=createOperationRowsModel('jobs',(...args)=>{jobsBuilds++;return operationRows(...args);});
  const input=[{id:1,ref_type:'market_transaction',amount:50}];
  const first=journal(input,{});
  for(let i=0;i<100;i++) assert.equal(journal(input,{[i]:String(i)}),first);
  assert.equal(journalBuilds,1); assert.equal(jobsBuilds,0);
  assert.equal(jobs([{job_id:2,blueprint_type_id:8}],{8:'Blueprint'})[0].name,'Blueprint');
  assert.equal(jobsBuilds,1);
});
test('all operation row labels and fallback semantics match original mappings',()=>{
  const names={1:'One',2:'Two'};
  const fixtures={
    skills:[[{skill_id:1}],{skill_id:1,name:'One'}], implants:[[1],{id:1,name:'One'}],
    notifications:[[{type:'skill_training'}],{type:'skill_training',name:'Skill Training'}],
    journal:[[{ref_type:'market_transaction'}],{ref_type:'market_transaction',name:'Market Transaction'}],
    transactions:[[{type_id:1}],{type_id:1,name:'One'}], orders:[[{type_id:99}],{type_id:99,name:'99'}],
    blueprints:[[{type_id:0}],{type_id:0,name:'—'}], loyalty:[[{corporation_id:2}],{corporation_id:2,name:'Two'}],
    standings:[[{from_id:1}],{from_id:1,name:'One'}], fittings:[[{ship_type_id:2}],{ship_type_id:2,hull:'Two'}],
    jobs:[[{product_type_id:0,blueprint_type_id:2}],{product_type_id:0,blueprint_type_id:2,name:'Two'}],
    planets:[[{solar_system_id:1}],{solar_system_id:1,system:'One'}],
    mining:[[{type_id:1,solar_system_id:2}],{type_id:1,solar_system_id:2,name:'One',system:'Two'}],
  };
  for(const [kind,[input,expected]] of Object.entries(fixtures)) assert.deepEqual(operationRows(input,names,kind),[expected],kind);
});
test('asset totals preserve unpriced, zero, duplicate price and location semantics without deriving hidden rows',()=>{
  const prices=priceMap([{type_id:1,average_price:10},{type_id:1,average_price:12},{type_id:2,average_price:0}]);
  const assets=[{item_id:1,type_id:1,quantity:3,root_location_id:6,location_id:5},{item_id:2,type_id:2,quantity:2,location_id:5,location_name:'Container'},{item_id:3,type_id:3,quantity:9,location_id:0}];
  const names={1:'Ship',5:'Station',6:'Root'};
  const rows=operationRows(assets,names,'assets',prices);
  assert.deepEqual(rows.map(r=>[r.name,r.estimate,r.location]),[['Ship',36,'Root'],['2',0,'Container'],['3',null,'—']]);
  assert.equal(assetReferenceTotal(assets,prices),rows.reduce((sum,row)=>sum+(row.estimate||0),0));
  const owner=createOperationRowsModel('assets'); const first=owner(assets,names,prices);
  assert.equal(owner(assets,{...names,5:'Invisible name because explicit/root location wins'},prices),first);
  assert.notEqual(owner(assets,{...names,6:'Renamed root'},prices),first);
});
test('table results preserve exact legacy search/sort order for mixed/null/nested values and stable ties',()=>{
  const rows=[{id:0,value:10,text:'ALPHA',nested:{secret:'hidden'}},{id:1,value:'2',text:'beta'},{id:2,value:null,text:'Alpha',flag:false},{id:3,value:-1,text:'beta'},{id:4,value:10,text:'equal'}, {id:5,value:undefined,text:'',nested:['hidden']}];
  const owner=createTableModel();
  for(const query of ['', 'ALPHA','beta','hidden','false','10','  ','absent']) for(const sort of [null,{key:'value',asc:true},{key:'value',asc:false},{key:'text',asc:true},{key:'unknown',asc:false}]) {
    assert.deepEqual(owner(rows,query,sort).map(x=>x.row),oldTable(rows,query,sort),JSON.stringify({query,sort}));
  }
  assert.deepEqual(rows.map(r=>r.id),[0,1,2,3,4,5]);
});
test('table normalization and ordering are bounded by inputs rather than page/render count',()=>{
  let normalized=0,compared=0;
  const owner=createTableModel({normalize:row=>{normalized++;return searchableRow(row);},compare:(...args)=>{compared++;return compareTableRows(...args);}});
  const rows=Array.from({length:10000},(_,id)=>({id,name:`Item ${10000-id}`,quantity:id%21}));
  owner(rows); assert.equal(normalized,0); assert.equal(compared,0);
  const first=owner(rows,'item',{key:'quantity',asc:true}), firstComparisons=compared;
  assert.equal(normalized,10000); assert.ok(firstComparisons>0);
  for(let i=0;i<100;i++) assert.equal(owner(rows,'ITEM',{key:'quantity',asc:true}),first);
  assert.equal(normalized,10000); assert.equal(compared,firstComparisons);
  owner(rows,'item 1',{key:'quantity',asc:true}); assert.equal(normalized,10000);
  owner(rows.slice(0,4),'item',{key:'quantity',asc:true}); assert.equal(normalized,10004);
});
test('row identities survive filtering, sorting, pagination and a zero id; page clamps after shrink',()=>{
  const rows=[{id:0,value:2},{transaction_id:18,value:1},{skill_id:5,value:3},{date:'2026-10-01',type_id:1,solar_system_id:2,value:4},{value:0}];
  const owner=createTableModel(), initial=new Map(owner(rows).map(x=>[x.row,x.key]));
  for(const item of owner(rows,'',{key:'value',asc:true})) assert.equal(item.key,initial.get(item.row));
  assert.equal(initial.get(rows[0]),'id:0'); assert.equal(initial.get(rows[4]),'row:4');
  assert.deepEqual(tablePage(91,3),{pages:4,page:3,start:90,end:120});
  assert.deepEqual(tablePage(31,3),{pages:2,page:1,start:30,end:60});
  assert.deepEqual(tablePage(0,3),{pages:1,page:0,start:0,end:30});
});
test('wallet graph retains the bounded 80 balance entries and their reverse/date semantics',()=>{
  const rows=Array.from({length:100},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString(),balance:i})); rows.splice(2,0,{date:'2026-01-01',amount:1});
  const expected=rows.filter(x=>typeof x.balance==='number').slice(0,80).reverse().map(x=>({date:new Date(x.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}),value:x.balance}));
  assert.deepEqual(walletGraph(rows),expected); assert.equal(walletGraph(rows).length,80);
});
