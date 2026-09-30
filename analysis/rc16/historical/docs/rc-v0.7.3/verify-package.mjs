// Run against an extracted RC, without its development dependencies.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
const [rootPath,output]=process.argv.slice(2),root=resolve(rootPath);
const {startKairo}=await import(pathToFileURL(join(root,'server/index.mjs')).href);
const port=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const dir=await mkdtemp(join(tmpdir(),'kairo-packaged-rc-'));let app,networkAttempts=0;
try{
    const first=await port();let second=await port();while(second===first)second=await port();
    const blocked=async()=>{networkAttempts++;throw new Error('No external requests in package smoke check');};
    app=await startKairo({port:first,streamPort:second,dataDir:dir,noSync:true,fetcher:blocked,combatFetcher:blocked,sessionFeedFetcher:blocked,markets:{historyFetcher:blocked}});
    const page=await fetch(app.origin);assert.equal(page.status,200);const html=await page.text(),cookie=page.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
    const bootstrap=await fetch(app.origin+'/api/bootstrap',{headers:{cookie}});assert.equal(bootstrap.status,200);
    const boot=await bootstrap.json();assert.equal(boot.version,'0.7.3-rc.1');assert.equal(boot.localOnly,true);
    const assets=[...new Set([...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)].map(m=>m[1]))];
    assert.ok(assets.some(p=>p.endsWith('.js')));assert.ok(assets.some(p=>p.endsWith('.css')));
    for(const asset of assets){const response=await fetch(new URL(asset,app.origin));assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);}
    const state=await fetch(app.origin+'/api/state',{headers:{cookie}});assert.equal(state.status,200);await state.json();
    const stream=await fetch(app.streamOrigin+'/stream');assert.equal(stream.status,200);await stream.text();
    const privateResponse=await fetch(app.streamOrigin+'/api/bootstrap');assert.equal(privateResponse.status,404);await privateResponse.text();
    assert.equal(networkAttempts,0);
    const result={passed:true,version:boot.version,compiledAssets:assets.length,authenticatedState:true,stream:true,privateApiAbsentOnStreamPort:true,networkAttempts};
    await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await app?.close();await rm(dir,{recursive:true,force:true});}
