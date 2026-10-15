import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createCombat} from '../../server/combat.mjs';
import {createUniversePolitics} from '../../server/universe-politics.mjs';

async function fixture(t, {inference = true} = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-combat-records-')), store = openStore(directory);
    const auth = {characters: () => [{id: 42}]}, hash = 'a'.repeat(40), calls = [];
    const raw = {killmail_id: 991, killmail_time: new Date(Date.now() - 60000).toISOString(), solar_system_id: 30000142,
        victim: {character_id: 99, ship_type_id: 587, alliance_id: 990001}, attackers: [{character_id: 42, alliance_id: 990002}]};
    // Use the real UPDATE triggers for enabled and disabled ownership policies.
    createUniversePolitics(store, auth);
    store.set('module:universe', inference);
    const combat = createCombat(store, auth, {request: async path => { calls.push(path); return {data: {...raw,killmail_id:Number(path.split('/')[2])}}; }}, {
        publish: event => store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
            .run(event.characterId, event.type, event.module, event.summary, JSON.stringify(event.payload), event.at, event.dedupe),
    });
    t.after(async () => { await combat.close(); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {store, combat, calls, ref: value => ({killmail_id: 991, killmail_hash: hash, ...(value === undefined ? {} : {zkb: {totalValue: value}})}),
        row: () => store.db.prepare('SELECT rowid,* FROM combat_records WHERE character_id=42 AND killmail_id=991').get(),
        queued: () => store.db.prepare('SELECT COUNT(*) n FROM universe_politics_queue').get().n,
        clearQueue: () => store.db.exec('DELETE FROM universe_politics_queue'),
        writes: () => store.db.prepare('SELECT total_changes() n').get().n,
    };
}

test('identical valued references are write-free and missing events repair without requeueing politics', async t => {
    const h = await fixture(t);
    await h.combat.ingest(42, [h.ref(100)], 'zkillboard');
    const original = h.row(); assert.equal(h.queued(), 1); h.clearQueue();
    const before = h.writes();
    for (let count = 0; count < 5; count++) await h.combat.ingest(42, [h.ref(100)], 'zkillboard');
    assert.equal(h.writes(), before); assert.equal(h.queued(), 0); assert.deepEqual(h.row(), original); assert.equal(h.calls.length, 1);
    h.store.db.prepare('DELETE FROM events WHERE dedupe=?').run('killmail:42:991');
    const repair = h.writes();
    await h.combat.ingest(42, [h.ref(100)], 'zkillboard');
    assert.equal(h.writes() - repair, 1, 'Only the missing semantic event should be inserted.');
    assert.equal(h.queued(), 0); assert.deepEqual(h.row(), original);
    assert.equal(h.store.db.prepare("SELECT COUNT(*) n FROM events WHERE dedupe='killmail:42:991'").get().n, 1);
    const source = h.writes();
    await h.combat.ingest(42, [h.ref()], 'esi');
    assert.equal(h.row().source, 'esi'); assert.equal(h.queued(), 1); assert.ok(h.writes() > source);
    assert.equal(JSON.parse(h.row().body).zkb.totalValue, 100);
    assert.equal(h.row().rowid, original.rowid); assert.equal(h.calls.length, 1);
});

test('corrected valuations update once while ESI provenance and semantic identity stay intact', async t => {
    const h = await fixture(t);
    await h.combat.ingest(42, [h.ref(100)], 'esi');
    const event = h.store.db.prepare("SELECT * FROM events WHERE dedupe='killmail:42:991'").get(), original = h.row(); h.clearQueue();
    await h.combat.ingest(42, [h.ref(0)], 'zkillboard');
    assert.equal(h.queued(), 1); assert.equal(JSON.parse(h.row().body).zkb.totalValue, 0);
    assert.equal(h.row().source, 'esi'); assert.equal(h.row().rowid, original.rowid);
    assert.deepEqual(h.store.db.prepare('SELECT * FROM events WHERE id=?').get(event.id), event);
    h.clearQueue(); const before = h.writes();
    for (const value of [0, undefined, -1, null]) await h.combat.ingest(42, [h.ref(value)], 'zkillboard');
    assert.equal(h.writes(), before); assert.equal(h.queued(), 0);
    assert.equal(h.row().source, 'esi'); assert.equal(JSON.parse(h.row().body).zkb.totalValue, 0); assert.equal(h.calls.length, 1);
});


test('disabled inference records one replay marker and identical combat remains write-free', async t => {
    const h = await fixture(t,{inference:false});
    await h.combat.ingest(42,[h.ref(100)],'esi');
    assert.equal(h.queued(),0); assert.deepEqual(h.store.get('universe:politics:rescan'),{pending:true});
    const before=h.writes();
    for(let count=0;count<5;count++)await h.combat.ingest(42,[h.ref(100)],'esi');
    assert.equal(h.writes(),before);assert.equal(h.queued(),0);
    await h.combat.ingest(42,[h.ref(200)],'zkillboard');
    assert.equal(JSON.parse(h.row().body).zkb.totalValue,200);assert.equal(h.queued(),0);
    assert.deepEqual(h.store.get('universe:politics:rescan'),{pending:true});
});


test('an identical 200-reference page is write-free; missing-event repair and a corrected valuation stay isolated',async t=>{
    const h=await fixture(t),refs=Array.from({length:200},(_,i)=>({...h.ref(100),killmail_id:i+1}));
    assert.equal((await h.combat.ingest(42,refs,'esi')).pending,100);
    assert.equal((await h.combat.ingest(42,refs,'esi')).pending,0);
    assert.equal(h.store.db.prepare('SELECT COUNT(*) n FROM combat_records').get().n,200);
    assert.equal(h.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,200);
    assert.equal(h.calls.length,200);h.clearQueue();let before=h.writes();
    await h.combat.ingest(42,refs,'esi');assert.equal(h.writes(),before);assert.equal(h.queued(),0);
    h.store.db.prepare('DELETE FROM events WHERE dedupe=?').run('killmail:42:101');before=h.writes();
    await h.combat.ingest(42,refs,'esi');assert.equal(h.writes()-before,1);assert.equal(h.queued(),0);
    const corrected=refs.map(r=>r.killmail_id===101?{...r,zkb:{totalValue:250}}:r);
    await h.combat.ingest(42,corrected,'zkillboard');assert.equal(h.queued(),1);
    assert.equal(JSON.parse(h.store.db.prepare('SELECT body FROM combat_records WHERE killmail_id=101').get().body).zkb.totalValue,250);
    assert.equal(h.store.db.prepare('SELECT COUNT(*) n FROM events').get().n,200);assert.equal(h.calls.length,200);
});
