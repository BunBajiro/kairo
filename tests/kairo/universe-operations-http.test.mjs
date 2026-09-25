import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startKairo } from '../../server/index.mjs';

// HTTP integration only: parser, scheduler, provider and graph algorithms have
// their own service tests. These scenarios exercise the local security boundary
// and the exact state consumed by the browser, using synthetic private records.
test('Universe operations HTTP: authenticated state, private observations and public-output isolation', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-universe-operations-http-'));
    let now = Date.UTC(2026, 8, 25, 12);
    const networkCalls = [];
    const denyNetwork = async url => { networkCalls.push(String(url)); throw new Error('Unexpected provider request from a local-record scenario.'); };
    const app = await startKairo({ port: 19286, streamPort: 19287, dataDir: dir, noSync: true, fetcher: denyNetwork,
        universe: { now: () => now, operations: { noSync: true, fetcher: denyNetwork }, feeds: { noSync: true, fetcher: denyNetwork } } });
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    for (const id of [42, 43]) app.store.db.prepare('INSERT INTO characters(id,name,scopes,tokens) VALUES(?,?,?,?)')
        .run(id, 'Operations pilot ' + id, '[]', '{}');
    const page = await fetch(app.origin), cookie = page.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', { headers: { Cookie: cookie } }).then(response => response.json());
    const headers = { Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf };
    const request = (path, method = 'GET', body) => fetch(app.origin + '/api/universe' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const read = async (path, method = 'GET', body, expected = 200) => {
        const response = await request(path, method, body), value = await response.json();
        assert.equal(response.status, expected, JSON.stringify(value)); return value;
    };
    const state = character => read('/operations?character=' + character);
    const atlas = await read('/static'), jita = atlas.systems.find(system => system.name === 'Jita').system_id;
    const privateText = 'Synthetic private tactical report';
    let intelId, signatureId, upgradeId, alertId;

    await t.test('all operational surfaces require a local session and mutations require CSRF', async () => {
        for (const path of ['/operations', '/operations/config', '/log-directories', '/feeds', '/feeds/config', '/navigation']) {
            assert.equal((await fetch(app.origin + '/api/universe' + path)).status, 401, path);
        }
        for (const [path, method] of [
            ['/operations/config', 'PUT'], ['/intel', 'POST'], ['/signatures/import', 'POST'], ['/signatures', 'POST'],
            ['/upgrades', 'POST'], ['/signatures/preview', 'POST'], ['/upgrades/preview', 'POST'], ['/upgrades/import', 'POST'], ['/operations/refresh', 'POST'], ['/feeds/config', 'PUT'], ['/feeds/import', 'POST'],
            ['/navigation/itinerary', 'PUT'], ['/navigation/waypoints', 'POST'],
        ]) {
            const denied = await fetch(app.origin + '/api/universe' + path + '?character=42', {
                method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
            });
            assert.equal(denied.status, 403, path);
        }
        assert.deepEqual((await state(42)).intel, []);
        assert.deepEqual(networkCalls, []);
    });

    await t.test('manual intel reaches only the selected pilot and keeps its observed time', async () => {
        const config = await read('/operations/config?character=42');
        await read('/operations/config?character=42', 'PUT', { ...config, enabled: true, watched_system_ids: [jita], intel_expiry_minutes: 15 });
        const observedAt = new Date(now - 60000).toISOString();
        await read('/intel?character=42', 'POST', { text: 'Jita hostile · ' + privateText, channel: 'Synthetic tactical channel', observed_at: observedAt });
        const mine = await state(42), report = mine.intel.find(item => item.text.includes(privateText));
        assert.ok(report); intelId = report.id;
        assert.equal(report.observed_at, observedAt);
        assert.ok(report.system_ids.includes(jita));
        assert.equal(report.kind, 'hostile');
        assert.deepEqual((await state(43)).intel, []);
        assert.deepEqual((await state(0)).intel, []);
        // Idempotent deletion is allowed, but the selected pilot is always part
        // of the database key and cannot remove the owner's matching ID.
        await read('/intel/' + intelId + '?character=43', 'DELETE');
        assert.ok((await state(42)).intel.some(item => item.id === intelId));
        const alert = mine.alerts.find(item => item.intel_id === intelId);
        assert.ok(alert, 'A fresh report for an explicitly watched system creates an alert'); alertId = alert.id;
        await read('/alerts/' + alertId + '/ack?character=43', 'POST', {}, 400);
        assert.equal((await state(42)).alerts.find(item => item.id === alertId).acknowledged_at, null);
        await read('/alerts/' + alertId + '/ack?character=42', 'POST', {});
        assert.equal((await state(42)).alerts.find(item => item.id === alertId).acknowledged_at, new Date(now).toISOString());
        const universe = await read('?character=42');
        assert.ok(universe.operations.intel.some(item => item.id === intelId));
        assert.deepEqual((await read('?character=43')).operations.intel, []);
        assert.deepEqual(networkCalls, []);
    });

    await t.test('scanner and infrastructure records have the same pilot boundary', async () => {
        const preview = await read('/signatures/preview?character=42', 'POST', {
            system_id: jita, text: 'ABC-123\tCosmic Signature\tWormhole\tSynthetic entrance\t100.0%\t1.2 AU',
        });
        assert.equal(preview.valid, true); assert.equal(preview.added[0].signature_id, 'ABC-123');
        assert.deepEqual((await state(42)).signatures, [], 'Scanner preview describes additions without saving them');
        await read('/signatures/import?character=42', 'POST', {
            system_id: jita, text: 'ABC-123\tCosmic Signature\tWormhole\tSynthetic entrance\t100.0%\t1.2 AU',
        });
        const signature = (await state(42)).signatures.find(item => item.signature_id === 'ABC-123');
        assert.ok(signature); signatureId = signature.id;
        assert.equal(signature.system_id, jita); assert.equal(signature.name, 'Synthetic entrance');
        await read('/signatures?character=42', 'POST', { ...signature, notes: 'Private signature annotation' });
        assert.equal((await state(42)).signatures.find(item => item.id === signatureId).notes, 'Private signature annotation');
        assert.deepEqual((await state(43)).signatures, []);
        await read('/signatures/' + signatureId + '?character=43', 'DELETE');
        assert.ok((await state(42)).signatures.some(item => item.id === signatureId));
        await read('/upgrades?character=42', 'POST', { system_id: jita, slot: 1, name: 'Synthetic infrastructure', level: 2, online: true, notes: 'Private infrastructure note' });
        const upgrade = (await state(42)).upgrades.find(item => item.name === 'Synthetic infrastructure');
        assert.ok(upgrade); upgradeId = upgrade.id;
        assert.deepEqual((await state(43)).upgrades, []);
        await read('/upgrades/' + upgradeId + '?character=43', 'DELETE');
        assert.ok((await state(42)).upgrades.some(item => item.id === upgradeId));
        await read('/signatures?character=43', 'POST', { ...signature, notes: 'Cannot overwrite another pilot' }, 400);
    });

    await t.test('scanner diagnostics and infrastructure SMT previews are read-only, atomic and private', async () => {
        const before = await state(42);
        const invalidScan = await read('/signatures/preview?character=42', 'POST', { system_id: jita, text: 'Not scanner data', complete_scan: true });
        assert.equal(invalidScan.valid, false); assert.deepEqual(invalidScan.missing, []);
        assert.deepEqual((await state(42)).signatures, before.signatures);
        const text = 'Jita\n1\tSynthetic infrastructure 2\tOnline\n\nUALX-3\n2\tSynthetic SMT array 3\tOffline\n';
        const preview = await read('/upgrades/preview?character=42', 'POST', { text, format: 'smt' });
        assert.equal(preview.valid, true); assert.equal(preview.added, 1); assert.equal(preview.updated, 1);
        assert.deepEqual((await state(42)).upgrades, before.upgrades);
        const invalid = await read('/upgrades/preview?character=42', 'POST', { text: text + 'Missing-System\n3 Bad entry Online\n' });
        assert.equal(invalid.valid, false); assert.ok(invalid.issues.length);
        await read('/upgrades/import?character=42', 'POST', { text: text + 'Missing-System\n3 Bad entry Online\n' }, 400);
        assert.deepEqual((await state(42)).upgrades, before.upgrades);
        await read('/upgrades/import?character=42', 'POST', { text, format: 'smt' });
        const records = (await state(42)).upgrades;
        assert.equal(records.length, 2); assert.equal(records.find(item => item.id === upgradeId).notes, 'Private infrastructure note', 'SMT imports cannot erase Kairo notes absent from the text format');
        const smtResponse = await request('/upgrades/export?character=42&format=smt'); assert.equal(smtResponse.status, 200);
        const smt = await smtResponse.text(); assert.match(smt, /Synthetic SMT array 3\s+Offline/);
        const roundtrip = await read('/upgrades/preview?character=42', 'POST', { text: smt });
        assert.equal(roundtrip.valid, true); assert.equal(roundtrip.updated, 2); assert.equal(roundtrip.added, 0);
        const jsonResponse = await request('/upgrades/export?character=42&format=json'); assert.equal(jsonResponse.status, 200);
        const exported = await jsonResponse.json(); assert.equal(exported.upgrades.find(item => item.system_id === jita).notes, 'Private infrastructure note');
        const other = await request('/upgrades/export?character=43&format=json'); assert.deepEqual((await other.json()).upgrades, []);
        assert.deepEqual((await state(43)).upgrades, []);
        await read('/upgrades/' + records.find(item => item.id !== upgradeId).id + '?character=42', 'DELETE');
    });

    await t.test('invalid identity, timestamps and settings cannot change saved observations', async () => {
        for (const character of ['999999', '-1', '1.5', 'not-a-pilot']) {
            await read('/operations?character=' + character, 'GET', undefined, 400);
            await read('/intel?character=' + character, 'POST', { text: 'Jita hostile' }, 400);
        }
        const before = await state(42);
        await read('/intel?character=42', 'POST', { text: 'Bad system', system_ids: [999999999] }, 400);
        await read('/operations/config?character=42', 'PUT', { ...before.config, logs_enabled: true, log_directory: '../not-absolute' }, 400);
        await read('/operations/config?character=0', 'PUT', { fleet_enabled: true }, 400);
        await read('/intel?character=42', 'POST', { text: 'Jita future report', observed_at: new Date(now + 3600000).toISOString() });
        const after = await state(42);
        assert.deepEqual(after.config, before.config); assert.deepEqual(after.intel, before.intel);
        assert.deepEqual(networkCalls, []);
    });

    await t.test('expiry is explicit and disabled collection cannot fetch fleet data', async () => {
        now += 16 * 60000;
        const expired = await state(42);
        assert.equal(expired.intel.find(item => item.id === intelId).expired, true, 'Old observations remain available with an expired label');
        const cfg = expired.config;
        await read('/operations/config?character=42', 'PUT', { ...cfg, enabled: false, fleet_enabled: true });
        await read('/operations/refresh?character=42', 'POST', {});
        assert.equal((await state(42)).fleet.status, 'disabled');
        await read('/intel?character=42', 'POST', { text: 'Jita blocked while operations disabled' }, 400);
        await read('/operations/config?character=42', 'PUT', { ...cfg, fleet_enabled: true });
        await read('/operations/refresh?character=42', 'POST', {});
        const noScope = await state(42);
        assert.equal(noScope.fleet.status, 'missing_scope'); assert.deepEqual(noScope.fleet.members, []);
        assert.equal(noScope.intel.length, 1);
        assert.deepEqual(networkCalls, []);
    });

    await t.test('SMT preview is read-only and exact import/export preserves unknown structures', async () => {
        const text = await readFile(new URL('../fixtures/smt-user-ansiblex.txt', import.meta.url), 'utf8');
        const preview = await read('/links/preview?character=42', 'POST', { text });
        assert.equal(preview.valid, true); assert.equal(preview.stats.directedEndpoints, 22); assert.equal(preview.stats.reciprocalPairs, 11);
        assert.equal((await read('?character=42')).link_lists.length, 0);
        const imported = await read('/link-lists?character=42', 'POST', { name: 'Exact supplied SMT network', text });
        assert.equal(imported.imported, 11);
        const before = await read('?character=42'), connections = before.links.filter(item => item.list_id === imported.id);
        assert.equal(connections.length, 11);
        assert.ok(connections.every(item => item.structure_id === null && item.reverse_structure_id === null && item.accessible === false));
        assert.deepEqual((await read('?character=43')).link_lists, []);
        const invalid = await read('/links/preview?character=42', 'POST', { text: text + '\n0 Missing-System --> Jita\n' });
        assert.equal(invalid.valid, false); assert.ok(invalid.issues.some(issue => issue.line > 22));
        await read('/link-lists?character=42', 'POST', { id: imported.id, name: 'Must not overwrite', text: text + '\n0 Missing-System --> Jita\n' }, 400);
        const after = await read('?character=42'); assert.deepEqual(after.links, before.links); assert.deepEqual(after.link_lists, before.link_lists);
        const exported = await request('/link-lists/' + imported.id + '/export?character=42');
        assert.equal(exported.status, 200);
        const directions = source => source.split(/\r?\n/).map(line => line.trim()).filter(line => /^0\s/.test(line)).map(line => line.replace(/\s+/g, ' ')).sort();
        assert.deepEqual(directions(await exported.text()), directions(text));
        assert.equal((await request('/link-lists/' + imported.id + '/export?character=43')).status, 400);
        await read('/link-lists/' + imported.id + '?character=42', 'DELETE');
        assert.deepEqual(networkCalls, []);
    });

    await t.test('reported wormhole expiry is preserved unless the user explicitly changes its remaining lifetime', async () => {
        const target = atlas.systems.find(system => system.space === 'wormhole' && system.name.startsWith('J')).system_id;
        const expiry = new Date(now + 2 * 3600000).toISOString();
        const link = await read('/links?character=42', 'POST', { kind: 'wormhole', from_system_id: jita, to_system_id: target,
            label: 'Synthetic dated public report', confirmed: true, accessible: true, expires_at: expiry });
        assert.equal(link.expires_at, expiry);
        const ordinary = await read('/links?character=42', 'POST', { ...link, mass: 'reduced' });
        assert.equal(ordinary.expires_at, expiry, 'Editing an unrelated field does not extend a reported lifetime');
        const changed = await read('/links?character=42', 'POST', { ...ordinary, duration_hours: 4 });
        assert.equal(Date.parse(changed.expires_at), now + 4 * 3600000, 'Explicit duration overrides the old expiry carried in a complete editor record');
        const expired = await read('/links?character=42', 'POST', { ...changed, duration_hours: 0 });
        assert.ok(Date.parse(expired.expires_at) <= now);
        const stillExpired = await read('/links?character=42', 'POST', { ...expired, mass: 'critical' });
        assert.equal(stillExpired.expires_at, expired.expires_at, 'Editing expired evidence never revives the connection');
        await read('/links?character=42', 'POST', { ...stillExpired, duration_hours: 7 }, 400);
        assert.equal((await read('?character=42')).links.find(row => row.id === link.id).active, false);
        await read('/links/' + link.id + '?character=42', 'DELETE');
    });

    await t.test('ordered itineraries reject stale edits and never send without explicit permission', async () => {
        const amarr = atlas.systems.find(system => system.name === 'Amarr').system_id, rens = atlas.systems.find(system => system.name === 'Rens').system_id;
        const saved = await read('/navigation/itinerary?character=42', 'PUT', {
            originId: jita, kind: 'gate', revision: 0, stops: [{ id: 'amarr', systemId: amarr }, { id: 'rens', systemId: rens }],
            preferences: { useAnsiblex: false, useWormholes: false, mode: 'shortest' },
        });
        assert.equal(saved.itinerary.revision, 1);
        assert.deepEqual((await read('/navigation?character=43')).itinerary.stops, []);
        const planned = await read('/navigation/plan?character=42', 'POST', { revision: 1 });
        const plan = planned.plan || planned;
        assert.equal(plan.status, 'ok'); assert.equal(plan.systemIds[0], jita); assert.equal(plan.systemIds.at(-1), rens);
        assert.ok(plan.systemIds.includes(amarr)); assert.ok(plan.edges.every(edge => edge.kind === 'gate'));
        await read('/navigation/itinerary?character=42', 'PUT', { revision: 0, stops: [] }, 409);
        await read('/navigation/reorder?character=42', 'POST', { revision: 1, stopIds: ['amarr'] }, 400);
        const reordered = await read('/navigation/reorder?character=42', 'POST', { revision: 1, stopIds: ['rens', 'amarr'] });
        assert.deepEqual(reordered.itinerary.stops.map(stop => stop.id), ['rens', 'amarr']);
        assert.equal(reordered.plan, null, 'Changing ordered stops invalidates the previous route');
        await read('/navigation/waypoints?character=42', 'POST', {}, 400);
        await read('/navigation/waypoints?character=42', 'POST', { replace: false, revision: reordered.itinerary.revision }, 400);
        assert.equal((await read('/navigation?character=42')).exportStatus, null);
        assert.deepEqual(networkCalls, []);
        await read('/navigation/stops/rens?character=42', 'DELETE');
        assert.deepEqual((await read('/navigation?character=42')).itinerary.stops.map(stop => stop.id), ['amarr']);
        await read('/navigation/itinerary?character=42', 'DELETE');
    });

    await t.test('manual storms and campaigns retain source provenance and expiry without provider requests', async () => {
        const nullsec = atlas.systems.find(system => system.name === 'UALX-3').system_id;
        const items = [{ id: 'synthetic', system_id: nullsec, name: 'Synthetic shared storm', type: 'Electric', observed_at: new Date(now).toISOString(), expires_at: new Date(now + 3600000).toISOString() }];
        await read('/feeds/import?character=42', 'POST', { kind: 'storms', items });
        let feeds = await read('/feeds?character=43');
        const storm = feeds.storms.find(item => item.id === 'manual:synthetic');
        assert.equal(storm.source, 'manual'); assert.equal(storm.stale, false); assert.ok(storm.strong_system_ids.includes(nullsec));
        await read('/feeds/import', 'POST', { kind: 'storms', items: [{ ...items[0], system_id: jita }] }, 400);
        assert.deepEqual((await read('/feeds')).storms, feeds.storms, 'Invalid replacement preserves the previous storm observations');
        app.store.saveSnapshot(0, 'sovereignty_campaigns', { status: 'ready', updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), data: [
            { campaign_id: 88, solar_system_id: nullsec, constellation_id: 20000001, structure_id: 100000000001, defender_id: 99000001, event_type: 'ihub_defense', start_time: new Date(now + 60000).toISOString(), attackers_score: 0.2, defender_score: 0.8 },
        ] });
        feeds = await read('/feeds');
        assert.equal(feeds.campaigns[0].status, 'scheduled'); assert.equal(feeds.sources.campaigns.status, 'ready');
        now += 3600001;
        feeds = await read('/feeds');
        assert.equal(feeds.storms.find(item => item.id === storm.id).stale, true);
        assert.equal(feeds.sources.campaigns.status, 'stale'); assert.equal(feeds.campaigns[0].status, 'active');
        assert.equal(feeds.sources.combat.status, 'disabled'); assert.deepEqual(feeds.combat, []);
        assert.deepEqual(networkCalls, []);
    });

    await t.test('composed navigation preserves public hub geometry, ship limits, mass and expiry', async () => {
        const thera = atlas.systems.find(system => system.name === 'Thera').system_id;
        const destination = atlas.systems.find(system => system.name === 'UALX-3').system_id;
        const observed = new Date(now).toISOString(), expires = new Date(now + 3600000).toISOString();
        const reports = [jita, destination].map((system, index) => ({ id: 'thera:composed-' + index, source: 'thera',
            from_system_id: thera, to_system_id: system, reported: true, completed: true, stale: false,
            max_ship_size: 'large', wh_type: 'N110', expires_at: expires }));
        app.store.set('universe:feeds:wormhole_types', { status: 'ready', updated_at: observed, expires_at: expires,
            data: [{ identifier: 'N110', max_jump_mass_kg: 100000000, max_stable_mass_kg: 1000000000, nominal_lifetime_minutes: 1440 }] });
        const seed = rows => app.store.set('universe:feeds:thera', { status: 'ready', data: rows, updated_at: observed, expires_at: expires });
        seed(reports);
        const plan = async preferences => {
            await read('/navigation/itinerary?character=42', 'PUT', { originId: jita, kind: 'gate', stops: [{ systemId: destination }],
                preferences: { mode: 'shortest', useThera: true, useTurnur: false, useAnsiblex: false, useWormholes: true, ...preferences } });
            return read('/navigation/plan?character=42', 'POST', {});
        };
        const allowed = await plan({ shipSize: 'large', shipClass: 'battleship', shipMassKg: 90000000 });
        assert.equal(allowed.status, 'ok'); assert.deepEqual(allowed.systemIds, [jita, thera, destination]);
        assert.equal(allowed.edges.length, 2); assert.ok(allowed.edges.every(edge => edge.kind === 'wormhole'));
        assert.deepEqual(allowed.edges.map(edge => [edge.from_system_id, edge.to_system_id]), [[jita, thera], [thera, destination]], 'Public hub travel keeps both physical endpoints and never draws a fictitious direct connection');
        const capital = await plan({ shipSize: 'capital', shipClass: 'capital', shipMassKg: 90000000 });
        assert.equal(capital.systemIds.includes(thera), false); assert.ok(capital.excluded.some(row => /Thera excludes capital/.test(row.reason)));
        seed(reports.map(row => ({ ...row, max_ship_size: 'xlarge' })));
        const massAllowed = await plan({ shipSize: 'large', shipClass: 'battleship', shipMassKg: 90000000 });
        assert.deepEqual(massAllowed.systemIds, [jita, thera, destination], 'Fresh XL nominal limits require shipMassKg to survive the composed route-context boundary');
        const tooHeavy = await plan({ shipSize: 'large', shipClass: 'battleship', shipMassKg: 110000000 });
        assert.equal(tooHeavy.systemIds.includes(thera), false); assert.ok(tooHeavy.excluded.some(row => /Ship mass exceeds/.test(row.reason)));
        seed(reports.map(row => ({ ...row, expires_at: new Date(now - 1).toISOString() })));
        const expired = await plan({ shipSize: 'large', shipClass: 'battleship', shipMassKg: 90000000 });
        assert.equal(expired.systemIds.includes(thera), false); assert.ok(expired.edges.every(edge => edge.kind === 'gate'));
        assert.deepEqual((await read('?character=42')).links, []);
        assert.deepEqual(networkCalls, []);
        await read('/navigation/itinerary?character=42', 'DELETE');
    });

    await t.test('public output has no operational APIs or private observation content', async () => {
        const forged = await fetch(app.origin + '/api/stream', { method: 'PUT', headers, body: JSON.stringify({
            elements: [{ id: 'private-universe-binding', kind: 'panel', visible: true, binding: 'universe.operations', characterId: 42, text: '' }],
            rules: [{ event: 'universe.operational_alert', enabled: true, message: '{summary}' }],
        }) });
        assert.equal(forged.status, 200);
        const normalized = await forged.json();
        assert.equal(normalized.elements[0].binding, 'none', 'Private operational state is not an eligible broadcast binding');
        assert.equal(normalized.rules.some(rule => rule.event === 'universe.operational_alert'), false, 'Private operational alerts cannot become public notification rules');
        for (const path of ['/operations', '/operations/config', '/intel', '/signatures', '/upgrades', '/log-directories', '/feeds', '/navigation']) {
            assert.equal((await fetch(app.streamOrigin + '/api/universe' + path)).status, 404, path);
        }
        assert.equal((await fetch(app.streamOrigin + '/api/universe/intel', { method: 'POST', headers, body: '{}' })).status, 405);
        const publicState = await fetch(app.streamOrigin + '/state').then(response => response.text());
        for (const secret of [privateText, 'Synthetic tactical channel', 'Synthetic entrance', 'Private signature annotation', 'Private infrastructure note', 'Operations pilot 42']) {
            assert.equal(publicState.includes(secret), false, secret);
        }
        assert.deepEqual(networkCalls, []);
    });

    await t.test('owners can remove manual records without changing another pilot', async () => {
        await read('/intel/' + intelId + '?character=42', 'DELETE');
        await read('/signatures/' + signatureId + '?character=42', 'DELETE');
        await read('/upgrades/' + upgradeId + '?character=42', 'DELETE');
        const mine = await state(42);
        assert.deepEqual(mine.intel, []); assert.deepEqual(mine.signatures, []); assert.deepEqual(mine.upgrades, []);
        assert.deepEqual((await state(43)).intel, []);
    });
});

test('Universe public-source HTTP refresh retains stale evidence and obeys backoff and collection controls', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-universe-feeds-http-'));
    let now = Date.UTC(2026, 8, 25, 12), failing = false, payload = [];
    const calls = [], unexpected = [];
    const app = await startKairo({ port: 19288, streamPort: 19289, dataDir: dir, noSync: true,
        fetcher: async url => { unexpected.push(String(url)); throw new Error('Unexpected ESI request.'); },
        universe: { now: () => now, feeds: { noSync: true, fetcher: async url => {
            calls.push(String(url)); assert.equal(String(url), 'https://api.eve-scout.com/v2/public/signatures?system_name=Thera');
            return failing ? Response.json({ error: 'Synthetic provider outage' }, { status: 503, headers: { 'Retry-After': '60' } })
                : Response.json(payload, { headers: { 'Cache-Control': 'public, max-age=300', ETag: 'synthetic-thera' } });
        } } } });
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    const page = await fetch(app.origin), cookie = page.headers.get('set-cookie').split(';')[0];
    const boot = await fetch(app.origin + '/api/bootstrap', { headers: { Cookie: cookie } }).then(response => response.json());
    const read = async (path, method = 'GET', body) => {
        const response = await fetch(app.origin + '/api/universe' + path, { method,
            headers: { Cookie: cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Kairo-CSRF': boot.csrf },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
    };
    const atlas = await read('/static'), named = name => atlas.systems.find(system => system.name === name).system_id;
    payload = [{ id: 'http-fixture', signature_type: 'wormhole', out_system_id: named('Thera'), in_system_id: named('Jita'),
        out_signature: 'THR-123', in_signature: 'JIT-123', completed: true, max_ship_size: 'large', expires_at: new Date(now + 4 * 3600000).toISOString() }];
    const initial = await read('/feeds');
    assert.equal(initial.sources.thera.status, 'waiting'); assert.equal(initial.sources.combat.status, 'disabled');
    assert.deepEqual(calls, [], 'Read-only source state never starts provider collection');
    const fresh = await read('/feeds/refresh', 'POST', { source: 'thera' });
    assert.equal(fresh.sources.thera.status, 'ready'); assert.equal(fresh.connections.length, 1);
    assert.equal(fresh.connections[0].max_ship_size, 'large'); assert.equal(fresh.connections[0].stale, false);
    assert.deepEqual((await read('')).feeds.connections, fresh.connections, 'The atlas consumes the same normalized public reports');
    assert.deepEqual((await read('')).links, [], 'A public report is not silently promoted to a trusted private connection');
    assert.equal(calls.length, 1);
    now += 6 * 60000; failing = true;
    const stale = await read('/feeds/refresh', 'POST', { source: 'thera' });
    assert.equal(stale.sources.thera.status, 'stale'); assert.equal(stale.connections.length, 1); assert.equal(stale.connections[0].stale, true);
    assert.ok(stale.sources.thera.retry_at); assert.match(stale.sources.thera.error, /503/);
    await read('/feeds/refresh', 'POST', { source: 'thera' }); assert.equal(calls.length, 2, 'Manual refresh honors provider backoff');
    app.store.set('module:universe', false);
    now += 120000;
    const disabled = await read('/feeds/refresh', 'POST', { source: 'thera' });
    assert.equal(disabled.sources.thera.status, 'disabled'); assert.deepEqual(disabled.connections, []); assert.equal(calls.length, 2);
    assert.deepEqual(unexpected, []);
});
