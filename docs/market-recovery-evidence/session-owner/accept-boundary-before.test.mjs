import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createESI } from '../../server/esi.mjs';
import { createCombat } from '../../server/combat.mjs';
import { createSessionCombat } from '../../server/session-combat.mjs';
import { changeSession, sessionReport } from '../../server/history.mjs';

const epoch = Date.parse('2026-10-21T12:00:00Z'), hash = 'a'.repeat(40);

for (const mode of ['existing', 'new pilot', 'replacement', 'stop', 'disconnect']) {
    test(`live feed retains current Session ownership after ${mode} during a pending packet`, async t => {
        t.mock.timers.enable({ apis: ['Date'], now: epoch });
        const dir = await mkdtemp(join(tmpdir(), 'kairo-session-feed-owner-')), store = openStore(dir);
        let connected = [{ id: 42 }, { id: 43 }];
        const auth = { characters: () => connected };
        const publish = event => store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
            .run(event.characterId, event.type, event.module, event.summary, JSON.stringify(event.payload), event.at, event.dedupe || null);
        const packetReady = Promise.withResolvers(), release = Promise.withResolvers(), paths = [], esiPaths = [];
        let body;
        const esi = createESI(store, auth, { fetcher: async url => {
            esiPaths.push(new URL(url).pathname);
            return Response.json(body, { headers: { 'Cache-Control': 'max-age=300' } });
        } });
        const combat = createCombat(store, auth, esi, { publish, spacingMs: 0 });
        const collector = createSessionCombat(store, auth, esi, combat, {
            feedOptions: { spacingMs: 0, maxItems: 1 },
            feedFetcher: async url => {
                const path = new URL(url).pathname.split('/').at(-1); paths.push(path);
                if (path === 'sequence.json') return Response.json({ sequence: 100 });
                if (path === '100.json') {
                    packetReady.resolve(); await release.promise;
                    return Response.json({ killmail_id: 900, hash, sequence_id: 100, esi: body });
                }
                return new Response(null, { status: 404 });
            },
        });
        t.after(async () => { release.resolve(); await collector.close(); await combat.close(); await esi.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
        const first = changeSession(store, publish, 42, { action: 'start', label: 'Already flying' });
        const pending = collector.syncLive(); await packetReady.promise;
        t.mock.timers.tick(1000);
        const pilot = mode === 'new pilot' ? 43 : 42;
        if (mode === 'replacement' || mode === 'stop') changeSession(store, publish, 42, { action: 'end' });
        if (mode === 'disconnect') connected = [];
        const current = mode === 'new pilot' || mode === 'replacement' ? changeSession(store, publish, pilot, { action: 'start', label: 'New flight' }) : first;
        const changed = collector.sessionChanged(current.id, pilot);
        t.mock.timers.tick(1000);
        body = { killmail_id: 900, killmail_time: new Date().toISOString(), solar_system_id: 30000142,
            victim: { character_id: 99, ship_type_id: 587 }, attackers: [{ character_id: pilot }] };
        t.mock.timers.tick(1);
        release.resolve(); await Promise.all([pending, changed]);
        t.mock.timers.tick(120000);
        await collector.syncLive();
        const row = store.db.prepare('SELECT * FROM combat_records WHERE character_id=? AND killmail_id=?').get(pilot, 900);
        t.diagnostic(JSON.stringify({ pilot, paths, esiPaths, cursor: store.get('session:live-feed').nextSequence,
            retained: !!row, reportKills: sessionReport(store, current.id, pilot).stats.kills }));
        if (mode === 'stop' || mode === 'disconnect') {
            assert.equal(row, undefined); assert.equal(esiPaths.length, 0);
            assert.equal(store.get('session:live-feed').nextSequence, 100);
            assert.deepEqual(paths, ['sequence.json', '100.json']);
            assert.equal(sessionReport(store, first.id, 42).stats.kills, 0);
            return;
        }
        assert.ok(row, 'A packet relevant to the newly started live Session must be retained before its shared cursor advances past it');
        assert.equal(sessionReport(store, current.id, pilot).stats.kills, 1);
        assert.equal(store.get('session:live-feed').nextSequence, 101);
        assert.equal(esiPaths.length, 1, 'ESI verification is shared with the real personal Combat owner');
        assert.deepEqual(paths, ['sequence.json', '100.json', '101.json'], 'Owner changes must not duplicate feed transport');
        if (mode === 'replacement') assert.equal(sessionReport(store, first.id, 42).stats.kills, 0, 'The ended predecessor cannot claim successor activity');
    });
}

test('a Session joining during ESI verification retains its buffered alliance candidate before cursor acknowledgement', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: epoch });
    const dir = await mkdtemp(join(tmpdir(), 'kairo-session-feed-accept-')), store = openStore(dir);
    const auth = { characters: () => [{ id: 42 }, { id: 43 }] }, paths = [], esiPaths = [], publicPaths = [];
    const publish = event => store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)')
        .run(event.characterId, event.type, event.module, event.summary, JSON.stringify(event.payload), event.at, event.dedupe || null);
    for (const [pilot, alliance] of [[42, 91], [43, 92]]) {
        const fresh = data => ({ status: 'ready', data, updatedAt: new Date().toISOString(), expiresAt: new Date(epoch + 3600000).toISOString() });
        store.saveSnapshot(pilot, 'profile', fresh({ alliance_id: alliance }));
        store.saveSnapshot(pilot, 'location', fresh({ solar_system_id: 30000142 }));
    }
    const body = { killmail_id: 900, killmail_time: new Date(epoch + 1000).toISOString(), solar_system_id: 30000142,
        victim: { character_id: 99, ship_type_id: 587 }, attackers: [{ character_id: 42, alliance_id: 91 }, { character_id: 99, alliance_id: 92 }] };
    const later = { ...body, killmail_id: 901, killmail_time: new Date(epoch + 4000).toISOString(), attackers: [{ character_id: 43, alliance_id: 92 }] };
    const accepting = Promise.withResolvers(), release = Promise.withResolvers();
    const esi = createESI(store, auth, { fetcher: async url => {
        const path = new URL(url).pathname; esiPaths.push(path);
        if (path.includes('/900/')) { accepting.resolve(); await release.promise; }
        return Response.json(path.includes('/900/') ? body : later, { headers: { 'Cache-Control': 'max-age=300' } });
    } });
    const combat = createCombat(store, auth, esi, { publish, spacingMs: 0, fetcher: async url => { publicPaths.push(String(url)); return Response.json([]); } });
    const collector = createSessionCombat(store, auth, esi, combat, { feedOptions: { spacingMs: 0, maxItems: 1 }, feedFetcher: async url => {
        const path = new URL(url).pathname.split('/').at(-1); paths.push(path);
        return Response.json(path === 'sequence.json' ? { sequence: 100 } : { killmail_id: path === '100.json' ? 900 : 901, hash, sequence_id: path === '100.json' ? 100 : 101, esi: path === '100.json' ? body : later });
    } });
    t.after(async () => { release.resolve(); await collector.close(); await combat.close(); await esi.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    const first = changeSession(store, publish, 42, { action: 'start' });
    t.mock.timers.tick(2000); const pending = collector.syncLive(); await accepting.promise;
    t.mock.timers.tick(1000); const current = changeSession(store, publish, 43, { action: 'start' }), changed = collector.sessionChanged(current.id, 43);
    t.mock.timers.tick(2000); release.resolve(); await Promise.all([pending, changed]);
    const candidates = store.db.prepare('SELECT alliance_id FROM alliance_combat_records WHERE killmail_id=900 ORDER BY alliance_id').all().map(row => row.alliance_id);
    t.diagnostic(JSON.stringify({ candidates, paths, esiPaths, cursor: store.get('session:live-feed').nextSequence }));
    assert.deepEqual(candidates, [91, 92], 'A newly eligible alliance must retain this buffered candidate before the shared cursor advances');
    assert.equal(store.get('session:live-feed').nextSequence, 101);
    assert.equal(sessionReport(store, first.id, 42).stats.kills, 1);
    assert.equal(sessionReport(store, current.id, 43).stats.kills, 0, 'A pre-start candidate is not personal participation');
    assert.equal(sessionReport(store, current.id, 43).allianceCombat.kills, 0, 'A buffered candidate alone cannot qualify a quiet visit');
    t.mock.timers.tick(120000); await collector.syncLive();
    assert.equal(sessionReport(store, current.id, 43).allianceCombat.kills, 2, 'A later in-visit engagement qualifies the retained buffer');
    assert.equal(sessionReport(store, current.id, 43).stats.kills, 1);
    assert.deepEqual(paths, ['sequence.json', '100.json', '101.json'], 'Lifecycle refresh must not refetch an already available packet');
    assert.equal(esiPaths.length, 2, 'Each distinct killmail is verified once over HTTP, including personal ingestion');
    assert.equal(publicPaths.length, 1, 'The explicit new Session history check remains independent and empty');
});
