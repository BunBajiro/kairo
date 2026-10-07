// Deterministic operations diagnostic, intentionally contains no elapsed-time assertions.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const [rootArg,outputArg]=process.argv.slice(2),root=resolve(rootArg);
const {createOperationRowsModel,operationRows,createTableModel,searchableRow,compareTableRows}=await import(pathToFileURL(join(root,'components/kairo/derived-models.mjs')));
const result={schemaVersion:1,kind:'diagnostic-counts-not-timing',node:process.version,files:{},fixtures:[]};
for(const file of ['components/kairo/operations.tsx','components/kairo/ui.tsx','components/kairo/model.ts','components/kairo/derived-models.mjs','components/kairo/formatters.mjs'])result.files[file]=createHash('sha256').update(await readFile(join(root,file))).digest('hex');
for(const n of [1000,10000]) {
 const rows=Array.from({length:n},(_,id)=>({job_id:id,product_type_id:id+1,status:'active',runs:id%21})),names=Object.fromEntries(rows.map(r=>[r.product_type_id,'Item '+r.product_type_id]));
 let builds=0,normalized=0,compares=0,oldNormalized=0,oldCompares=0;
 const owner=createOperationRowsModel('jobs',(...args)=>{builds++;return operationRows(...args);}),table=createTableModel({normalize:row=>{normalized++;return searchableRow(row);},compare:(...args)=>{compares++;return compareTableRows(...args);}});
 let last;
 for(let render=0;render<101;render++) {
   const current=owner(rows,names);last=table(current,'item',{key:'runs',asc:true});
   const previous=operationRows(rows,names,'jobs').filter(row=>{oldNormalized++;return searchableRow(row).includes('item');});
   previous.sort((a,b)=>{oldCompares++;return compareTableRows(a,b,'runs',true);});
   assert.deepEqual(last.map(entry=>entry.row),previous);
 }
 assert.equal(builds,1);assert.equal(normalized,n);assert.equal(oldNormalized,n*101);assert.equal(oldCompares,compares*101);
 const previous=owner(rows,names);assert.equal(owner(rows,{...names,999999999:'Unrelated'}),previous);assert.equal(builds,1);
 assert.notEqual(owner(rows,{...names,1:'Renamed'}),previous);assert.equal(builds,2);
 result.fixtures.push({rows:n,repeatedInputs:101,baseline:{derivations:101,derivedRows:n*101,normalizedRows:oldNormalized,comparisons:oldCompares},candidate:{derivations:1,derivedRows:n,normalizedRows:normalized,comparisons:compares},unrelatedNameChangeAdditionalDerivations:0,relevantNameChangeAdditionalDerivations:1,orderedRowSemanticsEqual:true});
}
await writeFile(resolve(outputArg),JSON.stringify(result,null,2)+'\n');
