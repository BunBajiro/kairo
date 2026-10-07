// Exact asset bytes and gzip potential; browser-observed initial requests are
// recorded separately because a static import graph is not execution evidence.
import assert from 'node:assert/strict';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join, dirname, posix} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const [baselineArg,candidateArg,outputArg]=process.argv.slice(2),roots={baseline:resolve(baselineArg),candidate:resolve(candidateArg)},output=resolve(outputArg);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const required=['package.json','package-lock.json','vite.config.ts','next.config.ts','postcss.config.mjs','scripts/build-verified.sh','scripts/sites-env.sh'];
const config={};
for(const file of required){const a=await readFile(join(roots.baseline,file)),b=await readFile(join(roots.candidate,file));assert.deepEqual(a,b,'Matched build input '+file);config[file]=hash(a);}
const require=createRequire(join(roots.candidate,'package.json')),ts=require('typescript');
async function inventory(root){
 const dir=join(root,'dist/client'),html=await readFile(join(dir,'index.html'),'utf8'),files=[];
 async function walk(relative=''){for(const entry of await readdir(join(dir,relative),{withFileTypes:true})){const path=posix.join(relative,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(js|css)$/.test(path)){const bytes=await readFile(join(dir,path));files.push({path,bytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length,sha256:hash(bytes)});}}}
 await walk();files.sort((a,b)=>a.path.localeCompare(b.path));
 const roots=[...new Set([...html.matchAll(/\b(?:src|href)="\/?([^"?]+\.js)"/g)].map(match=>match[1]))],seen=new Set();
 async function follow(path){if(seen.has(path))return;seen.add(path);const code=await readFile(join(dir,path),'utf8'),ast=ts.createSourceFile(path,code,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
  for(const statement of ast.statements){if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))||!statement.moduleSpecifier||!ts.isStringLiteral(statement.moduleSpecifier))continue;const specifier=statement.moduleSpecifier.text;if(specifier.startsWith('.'))await follow(posix.normalize(posix.join(posix.dirname(path),specifier)));}}
 assert.ok(roots.length,'HTML must expose at least one script/modulepreload entry');for(const entry of roots)await follow(entry);
 const summarize=rows=>({files:rows.length,bytes:rows.reduce((n,row)=>n+row.bytes,0),gzipBytes:rows.reduce((n,row)=>n+row.gzipBytes,0)});
 const initial=files.filter(file=>seen.has(file.path));assert.equal(initial.length,seen.size,'Every initial static chunk inventoried');
 return {files,entryRoots:roots,initialStaticClosure:initial.map(file=>file.path),initial:summarize(initial),allJavaScript:summarize(files.filter(file=>file.path.endsWith('.js'))),allCss:summarize(files.filter(file=>file.path.endsWith('.css')))};
}
const baseline=await inventory(roots.baseline),candidate=await inventory(roots.candidate);
const delta=Object.fromEntries(['initial','allJavaScript','allCss'].map(key=>[key,Object.fromEntries(['files','bytes','gzipBytes'].map(metric=>[metric,candidate[key][metric]-baseline[key][metric]]))]));
const result={schemaVersion:1,createdAt:new Date().toISOString(),roots,matchedConfiguration:config,compression:'gzip level9 per emitted file; potential compressed bytes, not measured HTTP wire bytes',baseline,candidate,delta};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,baseline:baseline.initial,candidate:candidate.initial,delta}));
