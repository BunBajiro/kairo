import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createUniverseFeeds} from '../../server/universe-feeds.mjs';

const AT = Date.parse('2026-10-21T12:00:00Z'), THERA = 31000005, ALPHA = 30000001, BETA = 30000002;
const atlas = {systems: [{system_id: THERA, name: 'Thera', space: 'wormhole', security: -1},
    {system_id: ALPHA, name: 'Alpha', space: 'known', security: -.1},
    {system_id: BETA, name: 'Beta', space: 'known', security: -.1}], gates: []};
const report = (id, destination) => ({id, signature_type: 'wormhole', out_system_id: THERA,
    in_system_id: destination, completed: true, expires_at: new Date(AT + 3600000).toISOString(),
    updated_at: new Date(AT).toISOString(), out_signature: 'AAA-111', in_signature: 'BBB-222'});
const response = (data, etag) => Response.json(data, {headers: {'Cache-Control': 'max-age=300', ...(etag ? {ETag: etag} : {})}});
async function fixture(t, fetcher) {
    const directory = await mkdtemp(join(tmpdir(), 'kairo-feed-validator-')), store = openStore(directory);
    let clock = AT;
    const calls = [], service = createUniverseFeeds(store, {}, {atlas, now: () => clock, noSync: true,
        points: {items: [], metadata: {}}, fetcher: (url, options) => {
            calls.push({url, etag: options.headers['If-None-Match']}); return fetcher(calls.length, options);
        }});
    t.after(async () => { await service.close(); store.close(); await rm(directory, {recursive: true, force: true}); });
    return {store, service, calls, expire: () => {clock += 300001;}};
}

test('a replacement public feed body without ETag cannot reuse the previous representation validator', async t => {
    const original = [report('original', ALPHA)], replacement = [report('replacement', BETA)];
    const f = await fixture(t, async (attempt, options) => {
        if (attempt === 1) return response(original, '"original"');
        if (attempt === 2) return response(replacement);
        // The provider has returned to the original representation. A validator
        // for that representation permits304; an unconditional read returns it.
        return options.headers['If-None-Match'] === '"original"'
            ? new Response(null, {status: 304}) : response(original, '"original"');
    });
    await f.service.refresh('thera');
    f.expire(); await f.service.refresh('thera');
    assert.deepEqual(f.service.state().connections.map(row => row.to_system_id), [BETA]);
    f.expire(); await f.service.refresh('thera');
    assert.equal(f.calls.length, 3);
    assert.deepEqual({sentValidator: f.calls[2].etag, destinations: f.service.state().connections.map(row => row.to_system_id)},
        {sentValidator: undefined, destinations: [ALPHA]}, 'The current provider representation must replace the different cached body');
    assert.equal(f.service.state().sources.thera.status, 'ready');
});

test('a public304 keeps the matching ETag and reuses its original complete representation', async t => {
    const f = await fixture(t, async attempt => attempt === 1 ? response([report('original', ALPHA)], '"original"') : new Response(null, {status: 304}));
    await f.service.refresh('thera');
    for (let refresh = 0; refresh < 2; refresh++) {f.expire(); await f.service.refresh('thera');}
    assert.deepEqual(f.calls.map(call => call.etag), [undefined, '"original"', '"original"']);
    assert.deepEqual(f.service.state().connections.map(row => row.to_system_id), [ALPHA]);
    await f.service.refresh('thera');
    assert.equal(f.calls.length, 3, 'The unchanged representation still observes normal cache freshness');
});
