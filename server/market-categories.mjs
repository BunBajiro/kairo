import {readFileSync} from 'node:fs';
import {datasetFile} from './dataset-paths.mjs';
let bundledIndex;
function defaultIndex(){return bundledIndex ||= indexCategories(JSON.parse(readFileSync(datasetFile('market-categories.json'),'utf8')));}
// Default consumers share one process-selected dataset and index. Importing Core
// does no taxonomy IO; the first market operation prepares it exactly once.
const bundled=Object.freeze({
 ids:category=>defaultIndex().ids(category),
 get known(){return defaultIndex().known;},
 overview:items=>defaultIndex().overview(items),
 type:id=>defaultIndex().type(id),
});

// CCP market groups are separate from inventory groups. Keep their full ancestry
// and type assignments, so existing order books need no re-scan or per-item ESI call.
export function createMarketCategories(catalog){
 if(catalog===undefined)return bundled;
 // Explicit catalogs have separate ownership; mutation by their caller cannot
 // change a prepared index or any default consumer.
 return indexCategories({...catalog,groups:catalog.groups.map(g=>({...g,types:[...g.types]})),volumes:{...catalog.volumes}});
}
function indexCategories(catalog){
 const groups=new Map(catalog.groups.map(g=>[g.id,g])),owner=new Map(),ancestors=new Map(),branches=new Map();
 for(const g of groups.values()){
  const path=[],seen=new Set();let node=g;
  while(node){if(seen.has(node.id))throw new Error('Cyclic market category data.');seen.add(node.id);path.push(node.id);if(node.parentId&&!groups.has(node.parentId))throw new Error('Missing parent market category.');node=groups.get(node.parentId);}
  ancestors.set(g.id,path);
  for(const id of g.types){if(owner.has(id))throw new Error('Duplicate market type assignment.');owner.set(id,g.id);}
 }
 const known=JSON.stringify([...owner.keys()]);
 function ids(category){const id=Number(category);if(!Number.isSafeInteger(id)||!groups.has(id))throw new Error('Choose an existing market category.');if(!branches.has(id)){const types=[];for(const [typeId,groupId] of owner)if(ancestors.get(groupId).includes(id))types.push(typeId);branches.set(id,JSON.stringify(types));}return branches.get(id);}
 function overview(items){const counts=new Map();let unknown=0;for(const row of items){const group=owner.get(row.type_id);if(!group){unknown++;continue;}for(const id of ancestors.get(group))counts.set(id,(counts.get(id)||0)+1);}
  return {source:catalog.source,build:catalog.build,groups:[...groups.values()].map(g=>({id:g.id,parentId:g.parentId,name:g.name,count:counts.get(g.id)||0})),total:items.length,unknown};
 }
 function type(id){const path=(ancestors.get(owner.get(id))||[]).map(id=>groups.get(id));return {path:path.map(g=>({id:g.id,name:g.name})),root:path.at(-1)?.id||0,volume:catalog.volumes?.[id]??null};}
 return {ids,known,overview,type};
}
