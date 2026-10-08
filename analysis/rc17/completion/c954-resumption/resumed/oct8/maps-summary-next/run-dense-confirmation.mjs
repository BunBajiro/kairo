import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,open,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {freezeSources} from './freeze-sources.mjs';
import {verifySource} from '../../../../../harness/source-manifest.mjs';

const self=fileURLToPath(import.meta.url),here=dirname(self);
if(process.env.KAIRO_M9_MATCHED_LOCK_HELD!=='1'){
    const child=spawn('flock',['-x','/tmp/kairo-performance.lock','flock','-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,self,...process.argv.slice(2)],
        {stdio:'inherit',env:{...process.env,KAIRO_M9_MATCHED_LOCK_HELD:'1'}});
    process.exit(await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',code=>done(code??1));}));
}
assert.equal(process.argv.length,3,'Supply a new output directory');
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const original=resolve(here,'../../../../../harness/maps-scaling.mjs'),diagnostic=join(here,'dense-diagnostics.mjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=[self,original,diagnostic,join(here,'TARGETED-DENSE-PLAN.md'),join(here,'freeze-sources.mjs'),
    join(here,'prototype-files.json'),join(here,'prototype.patch'),resolve(here,'../../../../../harness/source-manifest.mjs')];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(file))])));
const pinned=await hashes();
const schedule=[['A1','baseline',false],['B1','candidate',false],['B2','candidate',true],['A2','baseline',true],
    ['B3','candidate',true],['A3','baseline',true],['A4','baseline',false],['B4','candidate',false]];
const result={schemaVersion:1,complete:false,releaseReady:false,startedAt:new Date().toISOString(),harnessHashes:pinned,schedule,children:[]};
const save=()=>writeFile(join(output,'progress.json'),JSON.stringify(result,null,2)+'\n');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
let sources;
async function child(label,role,reverse,mode='timings'){
    const folder=join(output,label);await mkdir(folder);
    const logPath=join(output,label+'.log'),log=await open(logPath,'wx');
    const file=mode==='timings'?original:diagnostic,args=[file,mode,...(reverse?['--reverse']:[]),'--filter=dense'];
    const receipt={label,role,mode,reverse,command:[process.execPath,...args],startedAt:new Date().toISOString()};
    await save();
    try{const processChild=spawn(process.execPath,args,{stdio:['ignore',log.fd,log.fd],env:{...process.env,
        KAIRO_MAPS_CANDIDATE_LOCK_HELD:'1',KAIRO_SOURCE_MANIFEST:join(output,role+'-source.json'),
        KAIRO_BENCH_SOURCE_ROOT:sources[role].root,KAIRO_BENCH_OUTPUT:folder}});
        receipt.exitCode=await new Promise((done,fail)=>{processChild.once('error',fail);processChild.once('exit',code=>done(code??1));});
    }finally{await log.close();receipt.endedAt=new Date().toISOString();receipt.logSha256=hash(await readFile(logPath));result.children.push(receipt);await save();}
    assert.equal(receipt.exitCode,0,label+' failed; retain this attempt');assert.deepEqual(await hashes(),pinned);
    const report=await json(join(folder,`maps-${mode}${reverse?'-reverse':''}-dense.json`));
    assert.ok(report.sourceAndHarnessStableDuringRun);assert.equal(report.results.length,6);
    if(mode==='timings')assert.ok(report.results.every(row=>row.samples.length===7));
    process.stdout.write(JSON.stringify({child:label,complete:true})+'\n');return report;
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try{
    sources=await freezeSources(output);const arms={};
    for(const [label,role,reverse] of schedule)arms[label]=await child(label,role,reverse);
    const cases=arms.A1.results.map(row=>row.name),rows=[];
    for(const name of cases)for(const metric of ['wallMs','serializeMs']){
        const perProcess=Object.fromEntries(schedule.map(([label])=>{
            const row=arms[label].results.find(value=>value.name===name);assert.ok(row);
            assert.deepEqual(row.fixture,arms.A1.results.find(value=>value.name===name).fixture);
            assert.deepEqual(row.correctness,arms.A1.results.find(value=>value.name===name).correctness);
            return[label,{medianMs:median(row.samples.map(value=>value[metric])),rangeMs:[Math.min(...row.samples.map(value=>value[metric])),Math.max(...row.samples.map(value=>value[metric]))]}];
        }));
        const paired=[1,2,3,4].map(index=>{
            const baseline=perProcess['A'+index].medianMs,candidate=perProcess['B'+index].medianMs,deltaMs=candidate-baseline,deltaPercent=deltaMs/baseline*100;
            return{pair:index,baselineMedianMs:baseline,candidateMedianMs:candidate,deltaMs,deltaPercent,over10PercentAnd1Ms:deltaMs>1&&deltaPercent>10};
        });
        rows.push({name,metric,perProcess,paired,materialAdversePairs:paired.filter(row=>row.over10PercentAnd1Ms).length});
    }
    result.confirmation={originalAttempt:'../matched-attempt1',fixedProcesses:8,cases:6,samplesPerCasePerProcess:7,rows};
    const diagnostics={};for(const role of ['baseline','candidate'])diagnostics[role]=await child('diagnostics-'+role,role,false,'diagnostics');
    result.diagnostics=cases.map(name=>{
        const [a,b]=['baseline','candidate'].map(role=>diagnostics[role].results.find(row=>row.name===name));
        assert.deepEqual(a.fixture,b.fixture);assert.equal(a.outputSha256,b.outputSha256);assert.equal(a.outputBytes,b.outputBytes);
        assert.equal(a.totals.changes,0);assert.equal(b.totals.changes,0);
        return{name,outputSha256:a.outputSha256,baseline:{totals:a.totals,json:a.json},candidate:{totals:b.totals,json:b.json}};
    });
    for(const source of Object.values(sources))await verifySource(source);assert.deepEqual(await hashes(),pinned);
    const artifacts=[];
    async function inventory(relative=''){for(const entry of await readdir(join(output,relative),{withFileTypes:true})){
        const path=join(relative,entry.name);if(entry.isDirectory())await inventory(path);
        else if(entry.isFile()&&path!=='progress.json'){const bytes=await readFile(join(output,path));artifacts.push({path,bytes:bytes.length,sha256:hash(bytes)});}
    }}
    await inventory();result.artifacts=artifacts.sort((a,b)=>a.path.localeCompare(b.path));result.sourceAndHarnessVerified=true;result.complete=true;
}catch(error){result.failure=error.stack;throw error;}
finally{result.endedAt=new Date().toISOString();await writeFile(join(output,result.complete?'completed.json':'failed.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});await save();}
