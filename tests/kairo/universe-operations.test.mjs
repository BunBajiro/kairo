import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createUniverseOperations } from '../../server/universe-operations.mjs';
import { createIntelParser, gateDistances, parseSignatureClipboard } from '../../server/universe-intel.mjs';

const AT = Date.parse('2026-09-25T12:00:00Z');
const atlas = { systems: [
    { system_id: 30000001, name: 'Alpha' }, { system_id: 30000002, name: 'Alpine' },
    { system_id: 30000003, name: 'Beta' }, { system_id: 30000004, name: 'New Caldari' },
    { system_id: 31000001, name: 'J000001' },
], gates: [{ from_system_id: 30000001, to_system_id: 30000003 }, { from_system_id: 30000003, to_system_id: 30000004 }, { from_system_id: 30000004, to_system_id: 30000001 }] };
const sample = (data, extra = {}) => ({ status: 'ready', data, updatedAt: new Date(AT).toISOString(), expiresAt: new Date(AT + 3600000).toISOString(), ...extra });
async function fixture(t, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-operations-')), store = openStore(directory), events = [];
    let clock = AT, calls = 0;
    const characters = [{ id: 42, name: 'Pilot One', scopes: ['esi-location.read_location.v1', 'esi-fleets.read_fleet.v1'] }, { id: 43, name: 'Pilot Two', scopes: ['esi-location.read_location.v1'] }];
    const auth = { characters: () => characters };
    const esi = { request: async () => { calls++; throw new Error('Unexpected network request'); }, ...options.esi };
    const service = createUniverseOperations(store, auth, esi, { atlas, now: () => clock, publish: event => events.push(event), ...options });
    t.after(async () => { await service.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
    return { directory, store, service, characters, events, setTime: value => { clock = value; }, calls: () => calls };
}

test('intel resolves exact and unique abbreviations, preserves ambiguous names and UTC source time', () => {
    const parse = createIntelParser(atlas);
    const item = parse({ source: 'chat_log', channel: 'Intel', text: '[ 2026.09.25 11:59:12 ] Scout > Alp 2 neuts moving New Caldari and Bet' }, AT);
    assert.deepEqual(item.system_ids, [30000003, 30000004]);
    assert.deepEqual(item.ambiguous_systems, ['alp']);
    assert.equal(item.character_name, 'Scout'); assert.equal(item.kind, 'hostile');
    assert.equal(item.observed_at, '2026-09-25T11:59:12.000Z');
    assert.deepEqual(parse({ text: 'Alpha clear' }, AT).system_ids, [30000001]);
    assert.equal(parse({ text: 'Alpha clear?' }, AT).kind, 'question');
    assert.equal(parse({ text: 'Alpha not clear' }, AT).kind, 'report');
    assert.equal(parse({ text: 'Alpha safe', clear_keywords: ['safe'] }, AT).kind, 'clear');
    assert.equal(parse({ text: 'Alpha is not safe', clear_keywords: ['safe'] }, AT).kind, 'report');
    assert.equal(parse({ text: 'Alpha clear; Beta hostile camp' }, AT).kind, 'hostile');
    assert.equal(parse({ text: 'Alpha clear of hostiles' }, AT).kind, 'clear');
    assert.equal(parse({ text: '[ 2026.09.26 12:00:00 ] Scout > Alpha hostile' }, AT), null);
});

test('game log parser handles malformed input once and keeps combat separate from intel', () => {
    const parse = createIntelParser(atlas);
    assert.equal(parse({ source: 'game_log', text: '[ 2026.09.25 12:00:00 ] malformed event' }, AT), null);
    assert.equal(parse({ source: 'game_log', text: 'An undated decloak line' }, AT), null);
    assert.equal(parse({ source: 'game_log', text: '[ 2026.09.25 12:00:00 ] (notify) Nothing happens' }, AT), null);
    const combat = parse({ source: 'game_log', text: '[ 2026.09.25 12:00:00 ] (combat) <b>Scourge</b> hits you' }, AT);
    assert.equal(combat.kind, 'combat'); assert.equal(combat.text, 'Scourge hits you');
    const decloak = parse({ source: 'game_log', text: '[ 2026.09.25 12:00:00 ] (notify) Your ship was decloaked by a Mobile Observatory' }, AT);
    assert.equal(decloak.kind, 'decloak');
    assert.equal(parse({ source: 'game_log', text: '[ 2026.09.25 12:00:00 ] (notify) Your cloak deactivates due to proximity to a nearby object' }, AT).kind, 'decloak');
});

test('gate distances terminate on cycles, honor depth and keep disconnected space unknown', () => {
    assert.deepEqual([...gateDistances(atlas, [30000001], 1).entries()].sort(), [[30000001, 0], [30000003, 1], [30000004, 1]]);
    assert.equal(gateDistances(atlas, [30000001], 20).has(31000001), false);
});

test('operations reads never fetch; guest manual records stay isolated and logs require a connected pilot', async t => {
    const { service, calls } = await fixture(t);
    service.ingestIntel(0, { text: 'Alpha hostile' });
    assert.equal(service.state(0).intel.length, 1); assert.equal(service.state(42).intel.length, 0);
    assert.deepEqual(service.state(0).pilots, []); assert.equal(calls(), 0);
    assert.throws(() => service.saveConfig(0, { ...service.config(0), logs_enabled: true, log_directory: '/tmp/logs' }), /Connect a pilot/);
    assert.throws(() => service.saveConfig(0, { ...service.config(0), fleet_enabled: true }), /Connect a pilot/);
    assert.throws(() => service.state(99), /connected pilot/);
});

test('alerts use only fresh own location, preserve observation expiry, deduplicate and acknowledge privately', async t => {
    const { service, store, events, setTime } = await fixture(t);
    store.saveSnapshot(42, 'location', sample({ solar_system_id: 30000001 }));
    const cfg = { ...service.config(42), alert_cooldown_seconds: 60 }; service.saveConfig(42, cfg);
    const item = service.ingestIntel(42, { text: '[ 2026.09.25 11:59:00 ] Scout > Beta hostile' });
    assert.equal(item.observed_at, '2026-09-25T11:59:00.000Z');
    assert.equal(item.expires_at, '2026-09-25T12:14:00.000Z');
    const duplicate = service.ingestIntel(42, { text: '[ 2026.09.25 11:59:00 ] Scout > Beta hostile' });
    assert.equal(duplicate.duplicate, true);
    service.ingestIntel(42, { text: 'Beta 2 hostile' });
    assert.equal(service.state(42).alerts.length, 1); assert.equal(events.length, 1);
    assert.equal(events[0].payload.private, true); assert.equal(events[0].payload.text, undefined);
    assert.equal(service.state(42).alerts[0].distance, 1);
    assert.throws(() => service.acknowledge(43, service.state(42).alerts[0].id), /not found/);
    service.acknowledge(42, service.state(42).alerts[0].id);
    assert.ok(service.state(42).alerts[0].acknowledged_at);
    setTime(AT + 16 * 60000);
    assert.equal(service.state(42).intel.every(record => record.expired), true);
    service.ingestIntel(42, { text: '[ 2026.09.25 11:58:00 ] Scout > Alpha hostile' });
    assert.equal(events.length, 1, 'old observations never re-alert');
    store.saveSnapshot(42, 'location', sample({ solar_system_id: 30000001 }, { status: 'stale' }));
    service.ingestIntel(42, { text: 'Alpha 4 hostile' });
    assert.equal(events.length, 1, 'stale location does not prove proximity');
});

test('clear/question/ignored reports do not alert, watches and keywords work without location, and quiet mode wins', async t => {
    const { service, events } = await fixture(t);
    service.saveConfig(42, { ...service.config(42), watched_system_ids: [30000001], alert_keywords: ['tackle'], alert_cooldown_seconds: 0 });
    service.ingestIntel(42, { text: 'Alpha clear' }); service.ingestIntel(42, { text: 'Alpha hostile?' });
    assert.equal(service.ingestIntel(42, { text: 'Alpha status hostile' }).ignored, true); assert.equal(events.length, 0);
    service.ingestIntel(42, { text: 'Alpha hostile' }); service.ingestIntel(42, { text: 'tackle at unknown position' });
    assert.equal(events.length, 2); assert.equal(service.state(42).alerts[0].distance, null);
    service.saveConfig(42, { ...service.config(42), alerts_enabled: false });
    service.ingestIntel(42, { text: 'Alpha 7 hostile' }); assert.equal(events.length, 2);
});

test('manual callers cannot spoof a game-log source and explicit selected systems are validated', async t => {
    const { service } = await fixture(t);
    const report = service.ingestIntel(42, { source: 'game_log', text: 'combat report', system_ids: [30000003] });
    assert.equal(report.source, 'manual'); assert.deepEqual(report.system_ids, [30000003]);
    assert.deepEqual(service.ingestIntel(42, { text: 'Alpha report', system_ids: [30000003] }).system_ids, [30000001, 30000003]);
    assert.throws(() => service.ingestIntel(42, { text: 'report', system_ids: [9999] }), /universe map/);
});

test('scanner import accepts localization, preserves known labels, and only valid complete scans mark missing', async t => {
    const { service } = await fixture(t);
    const line = 'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t2 AU';
    let result = service.importSignatures(42, { system_id: 30000001, text: line });
    assert.equal(result.added, 1);
    service.importSignatures(42, { system_id: 30000001, text: 'ABC-123\tKosmische Signatur\t\t\t0%\t2 AU' });
    assert.equal(service.state(42).signatures[0].name, 'Unstable Wormhole');
    assert.equal(service.state(42).signatures[0].type, 'Wormhole');
    result = service.importSignatures(42, { system_id: 30000001, text: 'malformed', complete_scan: true });
    assert.equal(result.missing, 0); assert.equal(result.ignored, 1);
    service.importSignatures(42, { system_id: 30000001, text: 'DEF-456\tSignature cosmique\tRelic Site\tRuins\t50%\t3 AU' });
    assert.equal(service.state(42).signatures.find(item => item.signature_id === 'ABC-123').missing, false);
    result = service.importSignatures(42, { system_id: 30000001, text: line, complete_scan: true });
    assert.equal(result.missing, 1); assert.equal(service.state(42).signatures.length, 2);
    assert.equal(service.state(43).signatures.length, 0);
    assert.deepEqual(parseSignatureClipboard('ABC-123\tCosmic Anomaly\tCombat\tSite\t100%\t1 AU').rows, []);
});

test('signature preview provides a pure real diff and malformed complete scans never mark missing', async t => {
    const { service, store } = await fixture(t);
    const a = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123', name: 'Known wormhole', type: 'Wormhole' });
    service.saveSignature(42, { system_id: 30000001, signature_id: 'DEF-456', name: 'Relic' });
    const input = { system_id: 30000001, complete_scan: true, text: 'ABC-123\tCosmic Signature\t\t\t0%\t1 AU\nGHI-789\tCosmic Signature\tGas Site\tCloud\t50%\t2 AU' };
    const before = store.db.prepare('SELECT body FROM universe_operations_records ORDER BY id').all();
    const preview = service.previewSignatures(42, input);
    assert.equal(preview.valid, true); assert.equal(preview.added[0].signature_id, 'GHI-789');
    assert.equal(preview.updated[0].id, a.id); assert.equal(preview.updated[0].name, 'Known wormhole');
    assert.deepEqual(preview.updated[0].changes, []); assert.equal(preview.missing[0].signature_id, 'DEF-456');
    assert.deepEqual(store.db.prepare('SELECT body FROM universe_operations_records ORDER BY id').all(), before);
    const broken = { ...input, text: input.text + '\ninvalid row' };
    assert.equal(service.previewSignatures(42, broken).valid, false);
    const result = service.importSignatures(42, broken);
    assert.equal(result.complete_scan_applied, false); assert.equal(result.missing, 0);
    assert.equal(service.state(42).signatures.find(row => row.signature_id === 'DEF-456').missing, false);
});

test('manual signatures and upgrades preserve per-pilot identity and unique slots', async t => {
    const { service } = await fixture(t);
    const first = service.saveUpgrade(42, { system_id: 30000001, slot: 1, name: 'Mining Upgrade', level: 2, online: true });
    const update = service.saveUpgrade(42, { system_id: 30000001, slot: 1, name: 'Mining Upgrade', level: 3, online: false });
    assert.equal(first.id, update.id); assert.equal(service.state(42).upgrades.length, 1);
    assert.throws(() => service.saveUpgrade(43, { ...update, name: 'Stolen edit' }), /not found/);
    service.removeUpgrade(43, update.id); assert.equal(service.state(42).upgrades.length, 1);
    assert.throws(() => service.saveUpgrade(42, { system_id: 30000001, slot: 0, name: 'Bad', level: 2 }), /slot/);
});

test('fleet polls are explicit, bounded, cache-aware and scope-gated', async t => {
    let calls = 0;
    const { service, setTime, characters } = await fixture(t, { esi: {
        request: async path => { calls++; return sample(path.startsWith('/characters/') ? { fleet_id: 123456789012, role: 'fleet_commander' } : [{ character_id: 42, solar_system_id: 30000003, ship_type_id: 587, squad_id: 10, wing_id: 20 }]); },
        names: async () => ({ 42: 'Pilot One', 587: 'Rifter' }),
    } });
    await service.tick(); assert.equal(calls, 0);
    service.saveConfig(42, { ...service.config(42), fleet_enabled: true });
    await service.tick(); assert.equal(calls, 2);
    assert.equal(service.state(42).fleet.status, 'ready'); assert.equal(service.state(42).fleet.members[0].ship_name, 'Rifter');
    assert.equal(service.state(42).fleet.fleet_id, 123456789012);
    await service.refreshFleet(42); assert.equal(calls, 2, 'manual refresh respects the per-pilot cooldown');
    await service.tick(); assert.equal(calls, 2);
    service.saveConfig(43, { ...service.config(43), fleet_enabled: true });
    assert.equal(service.state(43).fleet.status, 'missing_scope');
    setTime(AT + 60001); await service.tick(); assert.equal(calls, 4);
    characters[0].scopes = [];
    assert.equal(service.state(42).fleet.status, 'missing_scope'); assert.deepEqual(service.state(42).fleet.members, []);
});

test('fleet replacement failure never exposes previous fleet members; revoked access clears last-good roster', async t => {
    let mode = 'first';
    const { service, setTime } = await fixture(t, { esi: { request: async path => {
        if (path.startsWith('/characters/')) return sample({ fleet_id: mode === 'second' ? 456 : 123, role: 'fleet_commander' });
        if (mode === 'second') throw new Error('New fleet unavailable');
        if (mode === 'denied') return { ...sample([{ character_id: 42, solar_system_id: 30000003 }]), stale: true, errorStatus: 403, error: 'Denied' };
        if (mode === 'offline') throw new Error('Network unavailable');
        return sample([{ character_id: 42, solar_system_id: 30000003 }]);
    } } });
    service.saveConfig(42, { ...service.config(42), fleet_enabled: true });
    await service.tick(); assert.equal(service.state(42).fleet.members.length, 1);
    mode = 'offline'; setTime(AT + 60001); await service.tick(); assert.equal(service.state(42).fleet.status, 'stale'); assert.equal(service.state(42).fleet.members.length, 1);
    mode = 'second'; setTime(AT + 120002); await service.tick(); assert.equal(service.state(42).fleet.fleet_id, 456); assert.deepEqual(service.state(42).fleet.members, []);
    mode = 'first'; setTime(AT + 180003); await service.tick(); assert.equal(service.state(42).fleet.members.length, 1);
    mode = 'denied'; setTime(AT + 240004); await service.tick(); assert.equal(service.state(42).fleet.status, 'no_access'); assert.deepEqual(service.state(42).fleet.members, []);
});

test('fleet commander role loss removes roster and shutdown waits for in-flight work without publishing', async t => {
    let role = 'fleet_commander', release = null, mode = 'ready';
    const { service, setTime, store } = await fixture(t, { esi: { request: async path => {
        if (mode === 'blocked') await new Promise(resolve => { release = resolve; });
        if (path.startsWith('/characters/')) return sample({ fleet_id: 123456789012, role });
        return sample([{ character_id: 42, solar_system_id: 30000003 }]);
    } } });
    service.saveConfig(42, { ...service.config(42), fleet_enabled: true }); await service.tick();
    role = 'squad_commander'; setTime(AT + 60001); await service.tick();
    assert.equal(service.state(42).fleet.status, 'no_access'); assert.deepEqual(service.state(42).fleet.members, []);
    mode = 'blocked'; setTime(AT + 120002);
    const work = service.tick(); await new Promise(resolve => setImmediate(resolve));
    let closed = false; const closing = service.close().then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
    release(); await work; await closing;
    assert.equal(store.snapshot(42, 'universe_fleet').status, 'no_access');
});

test('log tail binds listener, baselines old lines, captures fresh intel and stops on disable', async t => {
    const { directory, service, setTime } = await fixture(t);
    const logs = join(directory, 'Chatlogs'); await mkdir(logs);
    const file = join(logs, 'Intel_20260925_115900.txt');
    await writeFile(file, 'Channel Name: Intel\nListener: Pilot One\n[ 2026.09.25 11:59:00 ] Scout > Alpha hostile\n', 'utf8');
    service.saveConfig(42, { ...service.config(42), logs_enabled: true, log_directory: logs });
    await service.tick(); assert.equal(service.state(42).intel.length, 0);
    await appendFile(file, '[ 2026.09.25 12:00:01 ] Scout > Beta hostile\n');
    setTime(AT + 3000); await service.tick(); assert.equal(service.state(42).intel.length, 1);
    assert.equal(service.state(42).intel[0].source, 'chat_log');
    assert.equal(service.state(42).intel[0].observed_at, '2026-09-25T12:00:01.000Z');
    service.saveConfig(42, { ...service.config(42), logs_enabled: false });
    await appendFile(file, '[ 2026.09.25 12:00:04 ] Scout > Alpha hostile\n'); setTime(AT + 6000); await service.tick();
    assert.equal(service.state(42).intel.length, 1); assert.equal(service.state(42).logs.status, 'disabled');
});

test('retention is bounded and disabling operations prevents ingests', async t => {
    const { service } = await fixture(t);
    for (let i = 0; i < 505; i++) service.ingestIntel(42, { text: 'Alpha report number ' + i });
    assert.equal(service.state(42).intel.length, 500);
    service.saveConfig(42, { ...service.config(42), enabled: false });
    assert.throws(() => service.ingestIntel(42, { text: 'Alpha report' }), /disabled/);
});

test('opt-in local positions retain their own source, expire, never replace ESI storage, and stay pilot-bound', async t => {
    const { directory, service, store, events, setTime } = await fixture(t);
    const logs = join(directory, 'Chatlogs'); await mkdir(logs);
    const file = join(logs, 'Local_20260925.txt');
    await writeFile(file, 'Channel Name: Local\nListener: Pilot One\n');
    store.saveSnapshot(42, 'location', sample({ solar_system_id: 30000001 }));
    service.saveConfig(42, { ...service.config(42), logs_enabled: true, log_directory: logs, location_source: 'prefer_esi' });
    service.saveConfig(43, { ...service.config(43), logs_enabled: true, log_directory: logs, location_source: 'logs' });
    await service.tick();
    await appendFile(file, '[ 2026.09.25 12:00:01 ] EVE System > Channel changed to Local : Beta\n');
    setTime(AT + 3000); await service.tick();
    assert.equal(service.state(42).location.source, 'esi'); assert.equal(service.state(42).location.system_id, 30000001);
    store.saveSnapshot(42, 'location', sample({ solar_system_id: 30000001 }, { status: 'stale' }));
    assert.equal(service.state(42).location.source, 'chat_log'); assert.equal(service.state(42).location.system_id, 30000003);
    assert.equal(service.state(42).location.expires_at, '2026-09-25T12:05:01.000Z');
    assert.equal(store.snapshot(42, 'location').data.solar_system_id, 30000001);
    assert.equal(service.state(43).location.system_id, null);
    assert.equal(service.state(42).intel.length, 0); assert.equal(events.length, 0);
    await appendFile(file, '[ 2026.09.25 11:59:59 ] EVE System > Channel changed to Local : Alpha\n');
    setTime(AT + 6000); await service.tick(); assert.equal(service.state(42).location.system_id, 30000003, 'older observations do not roll positions back');
    service.saveConfig(42, { ...service.config(42), location_source: 'logs' });
    setTime(AT + 301001); assert.equal(service.state(42).location.status, 'stale');
    service.saveConfig(42, { ...service.config(42), logs_enabled: false });
    assert.equal(service.state(42).location.status, 'disabled'); assert.equal(service.state(42).location.system_id, null);
});

test('decloak categories have independent opt-outs under the master switch', async t => {
    const { directory, service, events, setTime } = await fixture(t);
    const logs = join(directory, 'Gamelogs'); await mkdir(logs); const file = join(logs, 'game.txt');
    await writeFile(file, 'Gamelog\nListener: Pilot One\n');
    service.saveConfig(42, { ...service.config(42), logs_enabled: true, log_directory: logs, alert_decloak_observatory: false, alert_decloak_gate: false, alert_cooldown_seconds: 0 });
    await service.tick();
    await appendFile(file, '[ 2026.09.25 12:00:01 ] (notify) Your cloak deactivates due to a pulse from a Mobile Observatory\n[ 2026.09.25 12:00:01 ] (notify) Your cloak deactivates due to proximity to Stargate\n[ 2026.09.25 12:00:01 ] (notify) Your cloak deactivates due to a pulse from a Dazh Liminality Locus\n');
    setTime(AT + 3000); await service.tick();
    assert.equal(service.state(42).intel.length, 3); assert.equal(events.length, 1);
    assert.equal(service.state(42).alerts[0].decloak_cause, 'other');
    service.saveConfig(42, { ...service.config(42), alert_decloak: false, alert_decloak_observatory: true, alert_decloak_gate: true });
    await appendFile(file, '[ 2026.09.25 12:00:04 ] (notify) Your cloak deactivates due to proximity to a different Stargate\n');
    setTime(AT + 6000); await service.tick(); assert.equal(events.length, 1);
});

test('global module disable stops live state and does not commit an in-flight fleet response', async t => {
    let release;
    const { service, store } = await fixture(t, { esi: { request: async () => {
        await new Promise(resolve => { release = resolve; });
        return sample({ fleet_id: 123456789012, role: 'squad_commander' });
    } } });
    service.saveConfig(42, { ...service.config(42), fleet_enabled: true });
    const flight = service.tick(); await new Promise(resolve => setImmediate(resolve));
    store.set('module:universe', false); const stopping = service.tick();
    assert.equal(service.state(42).config.enabled, false); assert.equal(service.config(42).enabled, true);
    assert.equal(service.state(42).fleet.status, 'disabled'); assert.equal(service.state(42).location.status, 'disabled');
    assert.throws(() => service.ingestIntel(42, { text: 'Alpha hostile' }), /disabled/);
    release(); await flight; await stopping; assert.equal(store.snapshot(42, 'universe_fleet'), null);
});

test('infrastructure import previews without writes, merges privately and exports notes losslessly as JSON', async t => {
    let changes = 0;
    const { service } = await fixture(t, { onChange: () => changes++ });
    const old = service.saveUpgrade(42, { system_id: 30000001, slot: 1, name: 'Old', level: 1, online: false });
    const payload = { upgrades: [{ system_id: 30000001, slot: 1, name: 'New', level: 2, online: true, notes: 'Private note' },
        { system_id: 30000003, slot: 2, name: 'Second', level: 3, online: false, notes: '' }] };
    changes = 0;
    const preview = service.previewUpgrades(42, payload);
    assert.equal(preview.valid, true); assert.equal(preview.added, 1); assert.equal(preview.updated, 1);
    assert.equal(service.state(42).upgrades[0].name, 'Old'); assert.equal(changes, 0);
    const result = service.importUpgrades(42, payload);
    assert.equal(result.added, 1); assert.equal(changes, 1); assert.equal(result.upgrades.find(row => row.slot === 1).id, old.id);
    assert.equal(service.state(43).upgrades.length, 0);
    const exported = service.exportUpgrades(42, { format: 'json', system_id: 30000001 });
    assert.match(exported.text, /Private note/); assert.doesNotMatch(exported.text, /Second/);
    service.importUpgrades(42, { text: 'Alpha\n1\tNew 3\tOnline\n' });
    assert.equal(service.state(42).upgrades.find(row => row.slot === 1).notes, 'Private note', 'SMT interchange has no notes field and cannot erase existing notes');
    assert.throws(() => service.importUpgrades(42, { upgrades: [...payload.upgrades, { ...payload.upgrades[0], slot: -1 }] }), /needs correction/);
    assert.equal(service.state(42).upgrades.length, 2);
});

test('infrastructure import rolls back all rows on a storage failure and emits no change before commit', async t => {
    let changes = 0;
    const { service, store } = await fixture(t, { onChange: () => changes++ });
    service.saveUpgrade(42, { system_id: 30000001, slot: 1, name: 'Original', level: 1, online: true }); changes = 0;
    store.db.exec("CREATE TEMP TRIGGER fail_upgrade BEFORE INSERT ON universe_operations_records WHEN NEW.kind='upgrade' AND json_extract(NEW.body,'$.slot')=2 BEGIN SELECT RAISE(ABORT,'Synthetic write failure'); END");
    assert.throws(() => service.importUpgrades(42, { upgrades: [
        { system_id: 30000001, slot: 1, name: 'Changed', level: 2, online: false },
        { system_id: 30000001, slot: 2, name: 'Second', level: 1, online: true },
    ] }), /Synthetic write failure/);
    assert.equal(service.state(42).upgrades.length, 1); assert.equal(service.state(42).upgrades[0].name, 'Original'); assert.equal(changes, 0);
});

test('scanner normalizes every Wanderer language and includes anomalies only on explicit request', async t => {
    const { service } = await fixture(t);
    const text = [
        'AAA-001\tCosmic Signature\tWormhole\tEnglish name\t100%\t1 AU',
        'BBB-002\tKosmische Signatur (typ)\tWurmloch\tGerman name\t100%\t1 AU',
        'CCC-003\tSignature cosmique (type)\tTrou de ver\tFrench name\t100%\t1 AU',
        'DDD-004\tСкрытый сигнал\tЧервоточина\tРусское имя\t100%\t1 AU',
        'EEE-005\tКосмическая аномалия\tБоевой район\tБоевой район\t100%\t1 AU',
    ].join('\n');
    const partial = parseSignatureClipboard(text);
    assert.equal(partial.rows.length, 4); assert.equal(partial.ignored, 1);
    assert.ok(partial.rows.every(row => row.type === 'Wormhole' && row.kind === 'Cosmic Signature'));
    const all = parseSignatureClipboard(text, { includeAnomalies: true });
    assert.equal(all.rows.length, 5); assert.equal(all.ignored, 0);
    assert.equal(all.rows[3].name, 'Русское имя');
    assert.equal(all.rows[4].kind, 'Cosmic Anomaly'); assert.equal(all.rows[4].type, 'Combat Site');
    service.importSignatures(42, { system_id: 30000001, text, include_anomalies: true });
    const result = service.importSignatures(42, { system_id: 30000001, text: text.split('\n')[0], complete_scan: true });
    assert.equal(result.missing, 3);
    assert.equal(service.state(42).signatures.find(row => row.signature_id === 'EEE-005').missing, false, 'Signature-only complete scans cannot mark omitted anomalies missing');
    const final = service.importSignatures(42, { system_id: 30000001, text: text.split('\n')[0], complete_scan: true, include_anomalies: true });
    assert.equal(final.missing, 4);
});

test('signature deletion restore is pilot and revision scoped, preserves observations, and expires', async t => {
    const { service, setTime } = await fixture(t);
    const original = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123', type: 'Wormhole', wh_type: 'P060', destination_system_id: 31000001, name: 'Scout report', notes: 'Original note' });
    setTime(AT + 10000);
    const deletion = service.removeSignature(42, original.id);
    assert.equal(deletion.removed, true);
    assert.equal(service.state(42).signatures.length, 0);
    assert.equal(service.state(42).deleted_signatures.length, 1);
    assert.equal(service.state(43).deleted_signatures.length, 0);
    const input = { id: original.id, revision: deletion.deleted.revision };
    assert.throws(() => service.restoreSignature(43, input), /no longer available/);
    assert.throws(() => service.restoreSignature(42, { ...input, revision: 'old-token' }), /no longer available/);
    setTime(AT + 20000);
    const restored = service.restoreSignature(42, input);
    assert.equal(restored.id, original.id); assert.equal(restored.first_seen_at, original.first_seen_at);
    assert.equal(restored.last_seen_at, original.last_seen_at); assert.equal(restored.bookmark_index, original.bookmark_index);
    assert.equal(restored.wh_type, 'P060'); assert.equal(restored.destination_system_id, 31000001);
    assert.equal(restored.notes, 'Original note'); assert.equal(restored.restored_at, new Date(AT + 20000).toISOString());
    assert.equal(service.state(42).deleted_signatures.length, 0);
    assert.throws(() => service.restoreSignature(42, input), /no longer available/);
    const next = service.removeSignature(42, original.id);
    assert.notEqual(next.deleted.revision, input.revision);
    assert.throws(() => service.restoreSignature(42, input), /no longer available/);
    setTime(AT + 20000 + 86400000);
    assert.equal(service.state(42).deleted_signatures.length, 0);
    assert.throws(() => service.restoreSignature(42, { id: original.id, revision: next.deleted.revision }), /no longer available/);
});

test('signature restore never overwrites a newer matching scan and trash is capped at 100', async t => {
    const { service, setTime } = await fixture(t);
    const old = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123', name: 'Old observation' });
    const deleted = service.removeSignature(42, old.id).deleted;
    const current = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123', name: 'New observation' });
    assert.notEqual(current.id, old.id);
    assert.throws(() => service.restoreSignature(42, { id: old.id, revision: deleted.revision }), /newer signature/);
    assert.equal(service.state(42).signatures[0].name, 'New observation');
    for (let index = 0; index < 105; index++) {
        setTime(AT + index + 1);
        const value = service.saveSignature(42, { system_id: 30000002, signature_id: 'ZZZ-' + String(index).padStart(3, '0') });
        service.removeSignature(42, value.id);
    }
    assert.equal(service.state(42).deleted_signatures.length, 100);
    assert.throws(() => service.restoreSignature(42, { id: old.id, revision: deleted.revision }), /no longer available/);
});

test('signature metadata survives scanner refresh and bookmark configuration validates tokens', async t => {
    const { service, setTime } = await fixture(t);
    const first = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123', type: 'Wormhole', wh_type: 'C247', destination_system_id: 31000001 });
    const second = service.saveSignature(42, { system_id: 30000001, signature_id: 'DEF-456', type: 'Wormhole' });
    assert.equal(first.bookmark_index, 1); assert.equal(second.bookmark_index, 2);
    setTime(AT + 1000);
    service.importSignatures(42, { system_id: 30000001, text: 'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU' });
    const current = service.state(42).signatures.find(row => row.id === first.id);
    assert.equal(current.wh_type, 'C247'); assert.equal(current.destination_system_id, 31000001);
    assert.equal(current.bookmark_index, 1); assert.equal(current.first_seen_at, first.first_seen_at);
    assert.throws(() => service.saveSignature(42, { ...first, wh_type: 'NOPE' }), /known wormhole type/);
    assert.throws(() => service.saveSignature(42, { ...first, destination_system_id: first.system_id }), /different system/);
    const cfg = { ...service.config(42), bookmark_template: '{sig_letters} {index_letter} {destination} {type}' };
    assert.equal(service.saveConfig(42, cfg).bookmark_template, cfg.bookmark_template);
    assert.notEqual(service.config(43).bookmark_template, cfg.bookmark_template);
    assert.throws(() => service.saveConfig(42, { ...cfg, bookmark_template: '{invented_token}' }), /Unknown bookmark token/);
    assert.throws(() => service.saveConfig(42, { ...cfg, bookmark_template: 'hello\nworld' }), /printable/);
});

test('signature delete transaction rolls back the tombstone if removing the live observation fails', async t => {
    const { service, store } = await fixture(t);
    const first = service.saveSignature(42, { system_id: 30000001, signature_id: 'ABC-123' });
    store.db.exec("CREATE TRIGGER signature_delete_failure BEFORE DELETE ON universe_operations_records WHEN OLD.kind='signature' BEGIN SELECT RAISE(ABORT,'test deletion failure'); END");
    assert.throws(() => service.removeSignature(42, first.id), /test deletion failure/);
    assert.equal(service.state(42).signatures[0].id, first.id);
    assert.equal(service.state(42).deleted_signatures.length, 0);
});

test('bookmark metadata and per-pilot conventions preserve zero indices, manual branches and type provenance', async t => {
    const { service, setTime } = await fixture(t);
    const config={...service.config(42),bookmark_start_at_zero:true,bookmark_return_symbol:'BACK',bookmark_custom_mapping:{mass_verge:'!'}};
    service.saveConfig(42,config);
    const first=service.saveSignature(42,{system_id:30000001,signature_id:'ABC-123',type:'Wormhole',wh_type:'P060',bookmark_chain:'121',bookmark_chain_letters:'A21',temporary_name:'Entrance',is_return_hole:true});
    assert.equal(first.bookmark_index,0);
    setTime(AT+1000);
    const edited=service.saveSignature(42,{id:first.id,notes:'Metadata only'});
    assert.equal(edited.bookmark_index,0); assert.equal(edited.last_seen_at,first.last_seen_at);
    assert.equal(edited.bookmark_chain,'121');assert.equal(edited.bookmark_chain_letters,'A21');assert.equal(edited.temporary_name,'Entrance');assert.equal(edited.is_return_hole,true);
    const next=service.saveSignature(42,{system_id:30000001,signature_id:'DEF-456'});assert.equal(next.bookmark_index,1);
    const override=service.saveSignature(42,{id:first.id,bookmark_index:27});assert.equal(override.bookmark_index,27);
    assert.equal(service.state(42).signatures.find(row=>row.id===first.id).type_reference.type,'P060');
    assert.equal(service.state(42).signatures.find(row=>row.id===first.id).type_reference.totalMassKg,500000000);
    assert.equal(service.config(43).bookmark_start_at_zero,false);assert.deepEqual(service.config(43).bookmark_custom_mapping,{});
    assert.throws(()=>service.saveSignature(42,{id:first.id,bookmark_index:-1}),/bookmark index/);
    assert.throws(()=>service.saveSignature(42,{id:first.id,bookmark_chain:'x'.repeat(65)}),/short printable/);
    assert.throws(()=>service.saveSignature(42,{id:first.id,is_return_hole:'yes'}),/return hole/);
    assert.throws(()=>service.saveConfig(42,{...config,bookmark_custom_mapping:{mass_verge:'x'.repeat(33)}}),/32 printable/);
});
