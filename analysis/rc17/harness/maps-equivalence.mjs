// Untimed companion for the frozen Maps comparison: object-key order is not semantics.
// Fixture and assertMap bodies are copied unchanged from maps-scaling.mjs; arrays retain order.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadSourceManifest,verifySource} from './source-manifest.mjs';
const args=process.argv.slice(2),lockFile='/tmp/kairo-rc16-benchmark.lock';
if (process.env.KAIRO_MAPS_EQUIVALENCE_LOCK_HELD!=='1') {
 const result=spawnSync('flock',['-n',lockFile,process.execPath,fileURLToPath(import.meta.url),...args],{stdio:'inherit',env:{...process.env,KAIRO_MAPS_EQUIVALENCE_LOCK_HELD:'1'}});
 if(result.error)throw result.error;process.exit(result.status??1);
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function differences(a,b,path='$',out=[]) {
 if(Object.is(a,b))return out;
 if(Array.isArray(a)&&Array.isArray(b)){
  if(a.length!==b.length)out.push({path,issue:'array-length',baseline:a.length,candidate:b.length});
  for(let i=0;i<Math.max(a.length,b.length);i++)differences(a[i],b[i],path+'['+i+']',out);
 }else if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
   if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key))out.push({path:path+'.'+key,issue:'missing-key',baselinePresent:Object.hasOwn(a,key),candidatePresent:Object.hasOwn(b,key)});
   else differences(a[key],b[key],path+'.'+key,out);
  }
 }else out.push({path,issue:'value',baseline:a,candidate:b});
 return out;
}
function keyOrderChanges(a,b,path='$',out=[]){
 if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++)keyOrderChanges(a[i],b[i],path+'['+i+']',out);}
 else if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  const left=Object.keys(a),right=Object.keys(b);if(JSON.stringify(left)!==JSON.stringify(right))out.push({path,baseline:left,candidate:right});
  for(const key of left)if(Object.hasOwn(b,key))keyOrderChanges(a[key],b[key],path+'.'+key,out);
 }
 return out;
}
if(args[0]!=='--worker'){
 const [baselineRoot,baselineManifest,candidateRoot,candidateManifest,out]=args;
 assert(baselineRoot&&baselineManifest&&candidateRoot&&candidateManifest&&out,'Use <baseline-root> <baseline-manifest> <candidate-root> <candidate-manifest> <output-directory>');
 const output=resolve(out);await mkdir(output,{recursive:true});
 for(const [role,root,manifest] of [['baseline',baselineRoot,baselineManifest],['candidate',candidateRoot,candidateManifest]]){
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--worker',root,manifest,join(output,role+'.json')],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;assert.equal(result.status,0,role+' semantic worker failed');
 }
 const baseline=JSON.parse(await readFile(join(output,'baseline.json'),'utf8')),candidate=JSON.parse(await readFile(join(output,'candidate.json'),'utf8'));
 const fieldDifferences=differences(baseline.value,candidate.value),propertyOrderChanges=keyOrderChanges(baseline.value,candidate.value);
 const result={recordedAt:new Date().toISOString(),kind:'untimed-full-selected-map-equivalence',arrayOrderPreserved:true,fieldDifferences,propertyOrderChanges,
  baseline:{rawSha256:baseline.rawSha256,canonicalSha256:baseline.canonicalSha256,outputBytes:baseline.outputBytes,sourceCommit:baseline.sourceCommit,sourceFingerprint:baseline.sourceFingerprint},
  candidate:{rawSha256:candidate.rawSha256,canonicalSha256:candidate.canonicalSha256,outputBytes:candidate.outputBytes,sourceCommit:candidate.sourceCommit,sourceFingerprint:candidate.sourceFingerprint},
  equalIgnoringObjectKeyOrder:fieldDifferences.length===0,harnessSha256:hash(await readFile(fileURLToPath(import.meta.url))),fixtureSourceSha256:hash(await readFile(new URL('./maps-scaling.mjs',import.meta.url)))};
 await writeFile(join(output,'comparison.json'),JSON.stringify(result,null,2)+'\n');
 assert.deepEqual(candidate.value,baseline.value,'Full selected map must retain values and array ordering');
 assert.equal(candidate.canonicalSha256,baseline.canonicalSha256);
 console.log(JSON.stringify({...result,propertyOrderChanges:propertyOrderChanges.map(row=>row.path)}));
 process.exit(0);
}
const [,root,manifestPath,output]=args,sourceRoot=resolve(root),sourceManifest=await loadSourceManifest(manifestPath,sourceRoot);
const sourceModule=relative=>import(pathToFileURL(join(sourceRoot,relative)).href);
const [{openStore},{createUniverse},{getUniverseStatic}]=await Promise.all([sourceModule('server/store.mjs'),sourceModule('server/universe.mjs'),sourceModule('server/universe-static.mjs')]);
const AT=Date.parse('2026-09-30T09:00:00Z'),stamp=new Date(AT).toISOString(),expiry=new Date(AT+16*3600000).toISOString();
const PILOT=42,REVISION=7,ACTIVE_MAP='map-00';
const atlas=getUniverseStatic(),wormholes=atlas.systems.filter(s=>s.space==='wormhole');
let networkAttempts=0;const blockNetwork=async()=>{networkAttempts++;throw new Error('External IO is forbidden in the Maps equivalence probe');};globalThis.fetch=blockNetwork;
const spec = (mapId, nodes, links, signatures, bound = false) => ({ mapId, nodes, links, signatures, bound });
const mapId = n => 'map-' + String(n).padStart(2, '0');
const signaturesFor = s => Array.from({ length: s.signatures }, (_,i) => ({
    id: `${s.mapId}-sig-${String(i).padStart(4,'0')}`, map_id: s.mapId, system_id: wormholes[i % s.nodes].system_id,
    signature_id: 'AAA-' + String(i).padStart(3, '0'), kind: 'Cosmic Signature', group: 'Cosmic Signature', type: s.bound ? 'Wormhole' : 'Data Site',
    name: 'Synthetic signature ' + i, wh_type: null, destination_system_id: null, missing: false, first_seen_at: stamp, last_seen_at: stamp, updated_at: stamp,
    notes: '', bookmark_index: i + 1, bookmark_chain: '', bookmark_chain_letters: '', temporary_name: '', is_return_hole: false,
}));
function expectedEdge(s, index) {
    const from = index % s.nodes, to = (from + 1 + Math.floor(index / s.nodes)) % s.nodes;
    assert.notEqual(from, to, 'Synthetic endpoints must differ');
    return { id: `${s.mapId}-edge-${String(index).padStart(4,'0')}`, linkId: `${s.mapId}-link-${String(index).padStart(4,'0')}`,
        from: wormholes[from].system_id, to: wormholes[to].system_id,
        fromSignature: s.bound ? `${s.mapId}-sig-${String(from).padStart(4,'0')}` : null,
        toSignature: s.bound ? `${s.mapId}-sig-${String(to).padStart(4,'0')}` : null };
}
function validateSpec(s) {
    assert(s.nodes > 1 && s.nodes <= 600 && s.links <= 1000 && s.signatures <= 1000, 'Fixture must fit supported per-map limits');
    assert(!s.bound || s.signatures === s.nodes, 'Bound fixture has one signature per node');
}
async function fixture(specs) {
    assert(specs.length >= 1 && specs.length <= 24, 'Private maps must remain within supported limit');
    specs.forEach(validateSpec);
    const dir = await mkdtemp(join(tmpdir(), 'kairo-followup-maps-')), store = openStore(dir);
    const auth = { characters: () => [{ id: PILOT, name: 'Synthetic pilot', scopes: [] }] };
    const service = createUniverse(store, auth, { request: blockNetwork, names: blockNetwork }, {
        staticData: atlas, now: () => AT, noSync: true, feeds: { fetcher: blockNetwork },
    });
    const put = store.db.prepare('INSERT INTO universe_records VALUES(?,?,?,?,?)');
    const putOps = store.db.prepare('INSERT INTO universe_operations_records VALUES(?,?,?,?,?)');
    let canonicalBytes = 0, mapDocumentBytes = 0, signatureBytes = 0;
    store.db.exec('BEGIN');
    try {
        for (const s of specs) {
            const map = { id: s.mapId, name: 'Synthetic map ' + s.mapId, description: '', scope: null, scope_version: 2, revision: REVISION,
                created_at: stamp, updated_at: stamp, nodes: wormholes.slice(0,s.nodes).map((system,index) => ({ system_id: system.system_id,
                    x: (index % 50) * 340, y: Math.floor(index / 50) * 190, locked: false, alias: '', label: '', description: '',
                    role: '', status: 'unknown', tags: [], effective_owner: null, prune_grace_at: stamp })),
                connections: [], passages: [], observations: [], comments: [], pings: [], activity: [], pilots: [] };
            for (const signature of signaturesFor(s)) {
                const body = JSON.stringify(signature); signatureBytes += Buffer.byteLength(body);
                putOps.run(PILOT, 'signature:map:' + s.mapId, signature.id, body, stamp);
            }
            for (let index=0; index<s.links; index++) {
                const e = expectedEdge(s,index), link = { id: e.linkId, map_id: s.mapId, kind: 'wormhole', from_system_id: e.from, to_system_id: e.to,
                    from_signature_record_id: e.fromSignature, to_signature_record_id: e.toSignature,
                    enabled: true, confirmed: true, accessible: true, reverse_accessible: true, directional: false, life_status: 'stable',
                    life_band: 'under_day', life_observed_at: stamp, mass: 'stable', expires_at: expiry, updated_at: stamp };
                const body = JSON.stringify(link); canonicalBytes += Buffer.byteLength(body);
                put.run(PILOT, 'link', e.linkId, body, stamp);
                map.connections.push({ id: e.id, link_id: e.linkId, kind: 'wormhole', from_system_id: e.from, to_system_id: e.to });
            }
            const body = JSON.stringify(map), bytes = Buffer.byteLength(body); assert(bytes <= 4_000_000, 'Document must fit supported size');
            mapDocumentBytes += bytes; put.run(PILOT,'jspace_map',s.mapId,body,stamp);
        }
        store.db.exec('COMMIT');
    } catch(error) { store.db.exec('ROLLBACK'); await service.close(); store.close(); await rm(dir,{recursive:true,force:true}); throw error; }
    service.jspace.setActivePilot(PILOT); // creates the normal empty source map before measured reads
    const totals = specs.reduce((a,s) => ({ maps:a.maps+1, nodes:a.nodes+s.nodes, links:a.links+s.links, signatures:a.signatures+s.signatures }),
        { maps:0,nodes:0,links:0,signatures:0 });
    return { service, store, expected:specs, totals:{ ...totals, canonicalBytes, mapDocumentBytes, signatureBytes },
        async close() { await service.close(); store.close(); await rm(dir,{recursive:true,force:true}); } };
}

function assertMap(map, s) {
    assert.equal(map.id,s.mapId); assert.equal(map.revision,REVISION); assert.equal(map.read_only,false);
    assert.equal(map.nodes.length,s.nodes); assert.equal(map.connections.length,s.links);
    assert.equal(map.signatures.length,s.signatures); assert.equal(map.operations.signatures.length,s.signatures);
    assert.equal(map.operations.map_id,s.mapId); assert.equal(map.operations.character_id,PILOT);
    assert.equal(map.operations.location.status,'missing_scope');
    assert.equal(new Set(map.nodes.map(n=>n.system_id)).size,s.nodes);
    for (const [index, node] of map.nodes.entries()) {
        assert.equal(node.system_id, wormholes[index].system_id);
        assert.equal(node.x, (index % 50) * 340); assert.equal(node.y, Math.floor(index / 50) * 190);
    }
    assert.equal(new Set(map.connections.map(e=>e.id)).size,s.links);
    assert.equal(new Set(map.connections.map(e=>e.link_id)).size,s.links);
    assert.equal(new Set(map.signatures.map(sig=>sig.id)).size,s.signatures);
    const bindings = new Map();
    for (const [index,e] of map.connections.entries()) {
        const expected = expectedEdge(s,index);
        assert.equal(e.id,expected.id); assert.equal(e.link_id,expected.linkId);
        assert.equal(e.from_system_id,expected.from); assert.equal(e.to_system_id,expected.to);
        assert.equal(e.active,true); assert.equal(e.expired,false); assert.equal(e.confirmed,true); assert.equal(e.accessible,true);
        assert.equal(e.expires_at,expiry); assert.equal(e.from_signature_id,expected.fromSignature); assert.equal(e.to_signature_id,expected.toSignature);
        for (const sig of [expected.fromSignature,expected.toSignature]) if(sig) {
            if(!bindings.has(sig))bindings.set(sig,[]);bindings.get(sig).push(e.id);
        }
    }
    for(const signature of map.signatures) {
        assert.equal(signature.stale,false); assert.equal(signature.age_ms,0);
        assert.deepEqual(signature.connection_ids,bindings.get(signature.id)||[]);
    }
}

const fixedMap=spec(ACTIVE_MAP,100,99,100,true),f=await fixture([fixedMap]);
let value;
try{value=f.service.jspace.map(PILOT,ACTIVE_MAP);assertMap(value,fixedMap);}finally{await f.close();}
assert.equal(networkAttempts,0);
const after=await verifySource(sourceManifest),encoded=JSON.stringify(value);
await writeFile(output,JSON.stringify({recordedAt:new Date().toISOString(),sourceCommit:sourceManifest.sourceCommit,sourceFingerprint:sourceManifest.fingerprint,
 sourceVerifiedBeforeAndAfter:after.fingerprint===sourceManifest.fingerprint,networkAttempts,rawSha256:hash(encoded),canonicalSha256:hash(JSON.stringify(canonical(value))),outputBytes:Buffer.byteLength(encoded),value},null,2)+'\n');
