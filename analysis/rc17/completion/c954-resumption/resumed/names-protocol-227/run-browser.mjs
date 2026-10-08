// Root grants each phase. Invoke under flock /tmp/kairo-performance.lock with KAIRO_MODELS_LOCKED=1.
// node run-browser.mjs <build|diagnostics|abba> <new-output-dir> [completed-build-dir]
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {captureSource,verifySource,loadSourceManifest} from '../../../../harness/source-manifest.mjs';
assert.equal(process.env.KAIRO_MODELS_LOCKED,'1');
const [mode,outArg,buildArg]=process.argv.slice(2);assert.ok(['build','diagnostics','abba'].includes(mode)&&outArg);
const here=dirname(fileURLToPath(import.meta.url)),out=resolve(outArg),base='/workspace/scratch/a2f3334402fc',roots=Object.fromEntries(['baseline','candidate'].map(arm=>[arm,resolve(base,'kairo-names-227-'+arm)]));
const expectedCommit='22773cc7cb6e83ac51e412565ba65c101613536a',hash=data=>createHash('sha256').update(data).digest('hex');
await mkdir(out,{recursive:false});
const paths=['run-browser.mjs','browser-fixture.mjs','browser-protocol.mjs','browser-races.mjs','../../../../harness/source-manifest.mjs','../../../../../rc16/historical/tests/performance/chrome.mjs'];
const harnesses=Object.fromEntries(await Promise.all(paths.map(async name=>[name,hash(await readFile(resolve(here,name)))])));
const receipt={mode,startedAt:new Date().toISOString(),node:process.version,expectedCommit,harnesses,complete:false,sourceVerified:false,runs:[],releaseReady:false};
const save=()=>writeFile(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
async function command(args,cwd,log){await new Promise((accept,reject)=>{const child=spawn(args[0],args.slice(1),{cwd,env:process.env,stdio:['ignore','pipe','pipe']});let body='';child.stdout.on('data',b=>body+=b);child.stderr.on('data',b=>body+=b);child.on('error',reject);child.on('close',async code=>{await writeFile(log,body,{flag:'wx'});receipt.runs.push({args,cwd,exitCode:code,log:log.slice(out.length+1),logSha256:hash(body)});await save();code===0?accept():reject(Error('Exit '+code+': '+args.join(' ')));});});}
async function frozen(arm,source){const expected=JSON.parse(await readFile(resolve(here,arm+'-source.json')));assert.deepEqual(Object.fromEntries(source.files.map(({path,...row})=>[path,row])),expected.files,arm+' differs from reviewed proposal');}
let manifests={};
try{
 if(mode==='build')for(const [arm,root]of Object.entries(roots)){
  const initial=await captureSource(root,{expectedCommit,requireClean:false});await frozen(arm,initial);assert.equal(initial.builtFiles.length,0,'First build requires an empty compiled output; preserve a failed build before preparing a retry');
  await writeFile(resolve(out,arm+'-initial-source.json'),JSON.stringify(initial,null,2)+'\n');
  for(const args of [['npm','run','check:kairo'],['npm','run','build']])await command(args,root,resolve(out,arm+'-'+args.at(-1).replace(':','-')+'.log'));
  const built=await captureSource(root,{expectedCommit,requireClean:false});await frozen(arm,built);assert.deepEqual(built.files,initial.files);assert.ok(built.builtFiles.length);
  manifests[arm]=built;await writeFile(resolve(out,arm+'-source.json'),JSON.stringify(built,null,2)+'\n');
 }
 else{
  assert.ok(buildArg,'A completed build evidence directory is required');const build=resolve(buildArg),builtReceipt=JSON.parse(await readFile(resolve(build,'receipt.json')));assert.equal(builtReceipt.complete,true);assert.equal(builtReceipt.mode,'build');
  for(const [arm,root]of Object.entries(roots)){manifests[arm]=await loadSourceManifest(resolve(build,arm+'-source.json'),root);await frozen(arm,manifests[arm]);}
  const runs=mode==='diagnostics'?['baseline','candidate'].flatMap(arm=>[['protocol',arm,'browser-protocol.mjs'],['races',arm,'browser-races.mjs']]):['baseline','candidate','candidate','baseline'].map((arm,index)=>[String(index+1),arm,'browser-protocol.mjs']);
  const packets=[];
  for(const [label,arm,worker]of runs){
   const name=label+'-'+arm+'.json',target=resolve(out,name),args=[process.execPath,resolve(here,worker),roots[arm],target,resolve(build,arm+'-source.json'),...(mode==='abba'?['--timing']:[])];
   console.log('START',name);await command(args,roots[arm],target+'.log');const bytes=await readFile(target),packet=JSON.parse(bytes);
   assert.equal(packet.complete,true);assert.equal(packet.sourceVerified,true);assert.equal(packet.harnessSha256,harnesses[worker]);assert.equal(packet.fixtureHarnessSha256,harnesses['browser-fixture.mjs']);assert.deepEqual(packet.errors,[]);assert.deepEqual(packet.unexpected,[]);assert.ok(packet.checks.every(row=>row.passed));
   receipt.runs.at(-1).result={name,sha256:hash(bytes),checks:packet.checks.length};packets.push({worker,packet});await save();console.log('END',name);
  }
  const ordinary=packets.filter(row=>row.worker==='browser-protocol.mjs').map(row=>row.packet);for(const packet of ordinary.slice(1)){assert.deepEqual(packet.fixture,ordinary[0].fixture);assert.deepEqual(packet.clockLedger,ordinary[0].clockLedger);assert.deepEqual(packet.provider,ordinary[0].provider);}receipt.fixtureAndProviderParity=true;
 }
 for(const manifest of Object.values(manifests))await verifySource(manifest);
 for(const [name,digest]of Object.entries(harnesses))assert.equal(hash(await readFile(resolve(here,name))),digest);
 receipt.sourceVerified=true;receipt.complete=true;
}catch(error){receipt.failure=error.stack;throw error;}
finally{receipt.endedAt=new Date().toISOString();await save();}
