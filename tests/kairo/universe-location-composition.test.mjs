import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../../server/store.mjs';
import { createUniverse } from '../../server/universe.mjs';

const AT = Date.parse('2026-09-25T12:00:00Z'), A = 30000001, B = 30000002;
const atlas = { systems: [{ system_id: A, name: 'Alpha', space: 'known', security: 0.5 }, { system_id: B, name: 'Beta', space: 'known', security: 0.5 }], gates: [{ from_system_id: A, to_system_id: B }], regions: [], constellations: [] };
const sample = (system, time = AT, extra = {}) => ({ status: 'ready', data: { solar_system_id: system }, updatedAt: new Date(time).toISOString(), expiresAt: new Date(time + 60000).toISOString(), ...extra });
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-location-composition-')), store = openStore(dir); let time = AT;
    const auth = { characters: () => [{ id: 42, name: 'Pilot One', scopes: ['esi-location.read_location.v1'] }] };
    const service = createUniverse(store, auth, {}, { staticData: atlas, now: () => time, noSync: true });
    t.after(async () => { await service.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
    return { dir, store, service, clock: value => { time = value; } };
}

test('logs-only waiting and disabled positions never fall back to the ESI map position or advance stops', async t => {
    const { service, store } = await fixture(t);
    store.saveSnapshot(42, 'location', sample(B));
    service.navigation.saveItinerary(42, { originId: A, stops: [{ id: 'beta', systemId: B }] });
    service.operations.saveConfig(42, { ...service.operations.config(42), location_source: 'logs' });
    assert.equal(service.state(42).location.system_id, null);
    assert.equal(service.state(42).location.status, 'disabled');
    service.observeSelectedLocation(42);
    assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, []);
    service.operations.saveConfig(42, { ...service.operations.config(42), logs_enabled: true, log_directory: '/not-a-log-folder' });
    assert.equal(service.state(42).location.status, 'waiting'); assert.equal(service.state(42).location.source, 'chat_log');
    service.observeSelectedLocation(42); assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, []);
    service.operations.saveConfig(42, { ...service.operations.config(42), enabled: false });
    assert.equal(service.state(42).location.system_id, null); assert.equal(service.state(42).location.status, 'disabled');
    assert.equal(store.snapshot(42, 'location').data.solar_system_id, B);
});

test('new bound Local observations advance navigation from the selected log source without overwriting ESI', async t => {
    const { dir, service, store, clock } = await fixture(t), logs = join(dir, 'Chatlogs');
    await mkdir(logs); const file = join(logs, 'Local.txt'); await writeFile(file, 'Channel Name: Local\nListener: Pilot One\n');
    store.saveSnapshot(42, 'location', sample(A));
    service.operations.saveConfig(42, { ...service.operations.config(42), logs_enabled: true, log_directory: logs, location_source: 'logs' });
    service.navigation.saveItinerary(42, { originId: A, followLocation: true, stops: [{ id: 'beta', systemId: B }, { id: 'alpha', systemId: A }] });
    await service.tick();
    await appendFile(file, '[ 2026.09.25 12:00:01 ] EVE System > Channel changed to Local : Beta\n');
    clock(AT + 3000); await service.tick();
    assert.equal(service.state(42).location.system_id, B); assert.equal(service.state(42).location.source, 'chat_log');
    assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, ['beta']);
    service.observeSelectedLocation(42);
    assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, ['beta'], 'fresh ESI at Alpha cannot consume a stop while logs are selected');
    assert.equal(store.snapshot(42, 'location').data.solar_system_id, A);
    assert.equal(service.state(42).sources.location.status, 'ready'); assert.deepEqual(service.state(42).operations.intel, []);
    clock(AT + 301001); service.observeSelectedLocation(42);
    assert.equal(service.state(42).location.status, 'stale'); assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, ['beta']);
});

test('prefer-ESI advances from fresh ESI, then fresh logs only after ESI becomes stale', async t => {
    const { service, store, clock } = await fixture(t);
    service.operations.saveConfig(42, { ...service.operations.config(42), logs_enabled: true, log_directory: '/not-a-log-folder', location_source: 'prefer_esi' });
    store.saveSnapshot(42, 'location', sample(B));
    store.saveSnapshot(42, 'universe_log_location', { ...sample(A), data: { system_id: A } });
    service.navigation.saveItinerary(42, { originId: A, stops: [{ id: 'beta', systemId: B }, { id: 'alpha', systemId: A }] });
    service.observeSelectedLocation(42); assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, ['beta']);
    assert.equal(service.state(42).location.source, 'esi');
    store.saveSnapshot(42, 'location', sample(B, AT, { status: 'stale' }));
    service.observeSelectedLocation(42); assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, ['beta', 'alpha']);
    assert.equal(service.state(42).location.source, 'chat_log');
    service.navigation.saveItinerary(42, { resetProgress: true }); clock(AT + 61000); service.observeSelectedLocation(42);
    assert.deepEqual(service.navigation.state(42).itinerary.progress.completedStopIds, []);
});
