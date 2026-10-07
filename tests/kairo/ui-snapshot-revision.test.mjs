import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCore} from '../../server/core.mjs';

test('UI snapshot revisions distinguish same-time writes, auth deletion and restart without altering stored snapshots',async t=>{
    const dir=await mkdtemp(join(tmpdir(),'kairo-ui-snapshot-'));let store=openStore(dir),core;
    t.after(async()=>{await core?.close();store.close();await rm(dir,{recursive:true,force:true});});
    const sample={status:'ready',data:[{item_id:1}],updatedAt:'same-millisecond',expiresAt:'2099-01-01T00:00:00Z'};
    store.saveSnapshot(42,'assets',sample);
    core=await createCore(store,{characters:()=>[]},{health:()=>({})},dir,{noSync:true});
    const first=core.snapshots(42).assets;assert.deepEqual(store.snapshot(42,'assets'),sample);assert.equal(core.snapshots(42).assets.dataRevision,first.dataRevision);
    const historyBefore=store.db.prepare('SELECT COUNT(*) count FROM events').get().count,frames=[];
    const client=Object.assign(new EventEmitter(),{write(frame){frames.push(String(frame));return true;},end(){this.emit('finish');},destroy(){this.emit('close');}});core.uiClients.add(client);
    const resourcesBefore=core.resourceRevisions(42);core.changed({characterId:42,resources:['notes']});
    assert.equal(store.db.prepare('SELECT COUNT(*) count FROM events').get().count,historyBefore,'Read-resource deletion invalidation does not create historical activity');
    assert.notEqual(core.resourceRevisions(42).notes,resourcesBefore.notes);assert.equal(core.resourceRevisions(42).activity,resourcesBefore.activity);
    assert.match(frames.at(-1),/"resources":\["notes"\]/);
    core.publish({characterId:42,type:'goal.updated',module:'goals',summary:'Manual progress'});
    assert.match(frames.at(-1),/"type":"goal.updated"/);assert.match(frames.at(-1),/"resources":\["activity","goals"\]/);core.uiClients.delete(client);
    store.saveSnapshot(42,'assets',{...sample,data:[{item_id:2}]});assert.notEqual(core.snapshots(42).assets.dataRevision,first.dataRevision);
    store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(42);assert.match(core.snapshots(42).assets.dataRevision,/:missing$/);assert.equal(core.snapshots(42).assets.data,null);
    store.saveSnapshot(42,'assets',sample);const prior=core.snapshots(42).assets.dataRevision;
    await core.close();core=null;store.close();store=openStore(dir);assert.notEqual(store.snapshotRevision(42,'assets'),prior);assert.deepEqual(store.snapshot(42,'assets'),sample);
});
