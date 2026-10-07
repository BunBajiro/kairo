import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSourceManifest} from '../../harness/source-manifest.mjs';
import {digest} from '../startup/fixture.mjs';
const [configPath,outputArg]=process.argv.slice(2),config=JSON.parse(await readFile(configPath)),output=resolve(outputArg),here=dirname(fileURLToPath(import.meta.url));await mkdir(output,{recursive:true});
const hashes={};for(const path of ['lazy-layout-worker.mjs','lazy-layout-runner.mjs','../startup/fixture.mjs','../../harness/source-manifest.mjs'])hashes[path]=digest(await readFile(join(here,path)));
const report={complete:false,productionAcceptance:false,startedAt:new Date().toISOString(),hashes,results:[]},semantic=new Map();
try{for(const mode of ['timing','heap'])for(const first of ['physical','schematic'])for(let cycle=1;cycle<=(mode==='timing'?3:1);cycle++)for(const [position,kind]of ['baseline','trial','trial','baseline'].entries()){
 const manifest=await loadSourceManifest(config[kind]);const name=`${mode}-${first}-${cycle}-${position+1}-${kind}.json`,child=spawnSync(process.execPath,[...(mode==='heap'?['--expose-gc']:[]),join(here,'lazy-layout-worker.mjs'),config[kind],kind,first,mode],{encoding:'utf8',timeout:60000});await writeFile(join(output,name),child.stdout||'');if(child.stderr)await writeFile(join(output,name+'.stderr.log'),child.stderr);assert.equal(child.status,0,child.stderr);const value=JSON.parse(child.stdout);assert.equal(value.complete,true);assert.equal(value.source.fingerprint,manifest.fingerprint);for(const [key,hash]of Object.entries(value.semantic)){if(semantic.has(key))assert.equal(hash,semantic.get(key));semantic.set(key,hash);}report.results.push({name,sha256:digest(child.stdout),...value});await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2));process.stderr.write(name+' complete\n');
 }for(const [path,hash]of Object.entries(hashes))assert.equal(digest(await readFile(join(here,path))),hash);report.complete=true;report.endedAt=new Date().toISOString();await writeFile(join(output,'completed.json'),JSON.stringify(report,null,2),{flag:'wx'});
}catch(error){report.failure=error.stack;throw error;}finally{await writeFile(join(output,'progress.json'),JSON.stringify(report,null,2));}
