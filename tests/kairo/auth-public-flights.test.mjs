import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { createAuth } from '../../server/auth.mjs';
import { openStore } from '../../server/store.mjs';
import { openVault } from '../../server/vault.mjs';

const clientId = 'kairo-public-flight-tests';
const discovery = {
    authorization_endpoint: 'https://login.eveonline.com/v2/oauth/authorize',
    token_endpoint: 'https://login.eveonline.com/v2/oauth/token',
    jwks_uri: 'https://login.eveonline.com/oauth/jwks',
    revocation_endpoint: 'https://login.eveonline.com/v2/oauth/revoke',
};
const signingKeys = ['original', 'rotated'].map(kid => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return { ...pair, jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' } };
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const deferred = () => Promise.withResolvers();
function signedToken(id, signingKey = signingKeys[0], overrides = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: signingKey.jwk.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: 'https://login.eveonline.com', aud: ['EVE Online', clientId],
        sub: `CHARACTER:EVE:${id}`, owner: `owner-${id}`, name: `Pilot ${id}`,
        scp: ['esi-location.read_location.v1'], exp: Math.floor(Date.now() / 1000) + 1200,
        ...overrides,
    })).toString('base64url');
    return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signingKey.privateKey).toString('base64url')}`;
}
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-auth-flights-'));
    const store = openStore(dir), vault = openVault(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    store.set('clientId', clientId);
    for (const id of [101, 202]) {
        store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)').run(
            id, `Pilot ${id}`, '[]', vault.encrypt({ access_token: 'expired', refresh_token: `refresh-${id}`, expires: 0 }), `owner-${id}`);
    }
    const calls = { discovery: 0, keys: 0, tokens: [], signals: [] };
    const responses = {
        discovery: async () => json(discovery),
        keys: async () => json({ keys: [signingKeys[0].jwk] }),
        token: async id => json({ access_token: signedToken(id), refresh_token: `refresh-${id}`, expires_in: 1200 }),
    };
    const fetcher = async (url, options) => {
        const path = new URL(url).pathname;
        calls.signals.push(options.signal);
        assert.ok(options.signal instanceof AbortSignal);
        if (path === '/.well-known/oauth-authorization-server') {
            calls.discovery++;
            return responses.discovery(options);
        }
        if (path === '/oauth/jwks') {
            calls.keys++;
            return responses.keys(options);
        }
        assert.equal(path, '/v2/oauth/token', 'No unexpected or cross-origin provider endpoint');
        assert.equal(new URL(url).origin, 'https://login.eveonline.com');
        assert.equal(options.method, 'POST');
        const body = Object.fromEntries(options.body);
        calls.tokens.push(body);
        assert.equal(body.client_id, clientId);
        assert.equal(body.grant_type, 'refresh_token');
        return responses.token(Number(body.refresh_token.split('-')[1]), options);
    };
    const create = () => createAuth(store, vault, { origin: 'http://127.0.0.1:4380', fetcher });
    return { auth: create(), create, calls, responses, store, vault };
}

test('two cold pilots share discovery and JWKS while their refresh POSTs stay separate', async t => {
    const f = await fixture(t);
    const metadataGate = deferred(), keyGate = deferred(), metadataStarted = deferred(), keysStarted = deferred();
    f.responses.discovery = async () => { metadataStarted.resolve(); await metadataGate.promise; return json(discovery); };
    f.responses.keys = async () => { keysStarted.resolve(); await keyGate.promise; return json({ keys: [signingKeys[0].jwk] }); };
    const requests = Promise.all([f.auth.access(101), f.auth.access(202), f.auth.access(101)]);
    await metadataStarted.promise;
    await setImmediate();
    assert.equal(f.calls.discovery, 1);
    assert.equal(f.calls.tokens.length, 0);
    metadataGate.resolve();
    await keysStarted.promise;
    await setImmediate();
    assert.equal(f.calls.keys, 1);
    assert.deepEqual(f.calls.tokens.map(row => row.refresh_token).sort(), ['refresh-101', 'refresh-202']);
    keyGate.resolve();
    const [first, second, duplicate] = await requests;
    assert.equal(first, duplicate);
    assert.notEqual(first, second);
    await Promise.all([f.auth.access(101, true), f.auth.access(202, true)]);
    assert.equal(f.calls.discovery, 1, 'Warm metadata remains cached');
    assert.equal(f.calls.keys, 1, 'Warm signing keys remain cached');
    assert.equal(f.calls.tokens.length, 4, 'Only the same pilot coalesces its refresh POST');
});

test('public flights and caches belong to one Auth instance', async t => {
    const f = await fixture(t), other = f.create(), gate = deferred();
    f.responses.discovery = async () => { await gate.promise; return json(discovery); };
    f.responses.keys = async () => { await setImmediate(); return json({ keys: [signingKeys[0].jwk] }); };
    const requests = Promise.all([f.auth.access(101), other.access(202)]);
    await setImmediate();
    assert.equal(f.calls.discovery, 2);
    gate.resolve();
    await requests;
    assert.equal(f.calls.keys, 2);
});

test('one-hour expiration refreshes both public domains once for concurrent pilots', async t => {
    const f = await fixture(t);
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    await Promise.all([f.auth.access(101), f.auth.access(202)]);
    now += 3599999;
    await Promise.all([f.auth.access(101, true), f.auth.access(202, true)]);
    assert.equal(f.calls.discovery, 1);
    assert.equal(f.calls.keys, 1);
    now += 2;
    f.responses.discovery = async () => { await setImmediate(); return json(discovery); };
    f.responses.keys = async () => { await setImmediate(); return json({ keys: [signingKeys[0].jwk] }); };
    await Promise.all([f.auth.access(101, true), f.auth.access(202, true)]);
    assert.equal(f.calls.discovery, 2);
    assert.equal(f.calls.keys, 2);
});

test('concurrent unknown signing keys share the rotation fetch and still verify signatures', async t => {
    const f = await fixture(t);
    await Promise.all([f.auth.access(101), f.auth.access(202)]);
    f.responses.token = async id => json({ access_token: signedToken(id, signingKeys[1]) });
    const gate = deferred(), started = deferred();
    f.responses.keys = async () => { started.resolve(); await gate.promise; return json({ keys: [signingKeys[1].jwk] }); };
    const requests = Promise.all([f.auth.access(101, true), f.auth.access(202, true)]);
    await started.promise;
    await setImmediate();
    assert.equal(f.calls.keys, 2, 'One rotation request after the original cold request');
    gate.resolve();
    await requests;
    f.responses.token = async id => {
        const parts = signedToken(id, signingKeys[1]).split('.');
        parts[1] = Buffer.from(JSON.stringify({ sub: `CHARACTER:EVE:${id}` })).toString('base64url');
        return json({ access_token: parts.join('.') });
    };
    await assert.rejects(f.auth.access(101, true), /Invalid SSO signature/);
    assert.equal(f.calls.keys, 2, 'An invalid signature does not replay key or token requests');
});

test('an unknown key on a cold cache permits exactly one shared rotation retry', async t => {
    const f = await fixture(t);
    f.responses.token = async id => json({ access_token: signedToken(id, signingKeys[1]) });
    f.responses.keys = async () => { await setImmediate(); return json({ keys: [signingKeys[0].jwk] }); };
    const results = await Promise.allSettled([f.auth.access(101), f.auth.access(202)]);
    assert.ok(results.every(row => row.status === 'rejected' && /Invalid SSO signature/.test(row.reason.message)));
    assert.equal(f.calls.keys, 2, 'Cold lookup plus the existing one rotation retry');
    assert.equal(f.calls.tokens.length, 2, 'Key lookup never replays token POSTs');
    f.responses.keys = async () => { await setImmediate(); return json({ keys: [signingKeys[1].jwk] }); };
    await Promise.all([f.auth.access(101), f.auth.access(202)]);
    assert.equal(f.calls.keys, 3, 'Failed validation does not poison the next rotation flight');
});

test('a failed rotation keeps trusted warm keys usable and permits the next rotation attempt', async t => {
    const f = await fixture(t);
    await Promise.all([f.auth.access(101), f.auth.access(202)]);
    f.responses.token = async id => json({ access_token: signedToken(id, signingKeys[id === 101 ? 1 : 0]) });
    const started = deferred(), gate = deferred();
    f.responses.keys = async () => { started.resolve(); await gate.promise; return json({}, 503); };
    const failed = assert.rejects(f.auth.access(101, true), /Unable to verify EVE identity/);
    await started.promise;
    assert.equal((await f.auth.access(202, true)).split('.').length, 3, 'A trusted warm key is not blocked by another key rotation');
    gate.resolve();
    await failed;
    assert.equal(f.calls.keys, 2);
    await f.auth.access(202, true);
    assert.equal(f.calls.keys, 2, 'Failed rotation does not discard the still-fresh trusted key set');
    f.responses.keys = async () => json({ keys: [signingKeys[1].jwk] });
    await f.auth.access(101, true);
    assert.equal(f.calls.keys, 3);
});

test('discovery failures are shared but never poison the next attempt', async t => {
    for (const [name, fail, error] of [
        ['HTTP', () => json({}, 503), /SSO discovery is unavailable/],
        ['JSON', () => new Response('{'), /JSON|Unexpected/],
        ['endpoint origin', () => json({ ...discovery, token_endpoint: 'https://unexpected.invalid/token' }), /Unexpected SSO endpoint/],
        ['transport', () => { throw new Error('Transport failed'); }, /Transport failed/],
    ]) {
        await t.test(name, async t => {
            const f = await fixture(t), gate = deferred();
            f.responses.discovery = async () => { await gate.promise; return fail(); };
            const results = Promise.allSettled([f.auth.access(101), f.auth.access(202)]);
            await setImmediate();
            assert.equal(f.calls.discovery, 1);
            gate.resolve();
            for (const result of await results) {
                assert.equal(result.status, 'rejected');
                assert.match(result.reason.message, error);
            }
            assert.equal(f.calls.tokens.length, 0);
            f.responses.discovery = async () => json(discovery);
            await Promise.all([f.auth.access(101), f.auth.access(202)]);
            assert.equal(f.calls.discovery, 2);
            assert.equal(f.calls.tokens.length, 2);
        });
    }
});

test('JWKS failures are shared, are not cached, and permit a later refresh', async t => {
    for (const [name, fail] of [
        ['HTTP', () => json({}, 503)],
        ['JSON', () => new Response('{')],
        ['malformed keys', () => json({ keys: {} })],
        ['transport', () => { throw new Error('Key transport failed'); }],
    ]) {
        await t.test(name, async t => {
            const f = await fixture(t);
            f.responses.keys = async () => { await setImmediate(); return fail(); };
            const results = await Promise.allSettled([f.auth.access(101), f.auth.access(202)]);
            assert.ok(results.every(result => result.status === 'rejected'));
            assert.equal(f.calls.discovery, 1);
            assert.equal(f.calls.keys, 1);
            assert.equal(f.calls.tokens.length, 2);
            f.responses.keys = async () => json({ keys: [signingKeys[0].jwk] });
            await Promise.all([f.auth.access(101), f.auth.access(202)]);
            assert.equal(f.calls.discovery, 1);
            assert.equal(f.calls.keys, 2);
            assert.equal(f.calls.tokens.length, 4);
        });
    }
});

test('a public request timeout reaches all waiters and its flight clears for retry', async t => {
    const f = await fixture(t), signals = [];
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
        const controller = new AbortController();
        signals.push({ milliseconds, controller });
        return controller.signal;
    });
    f.responses.discovery = ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const results = Promise.allSettled([f.auth.access(101), f.auth.access(202)]);
    await setImmediate();
    assert.deepEqual(signals.map(row => row.milliseconds), [12000]);
    signals[0].controller.abort(new DOMException('SSO timed out', 'TimeoutError'));
    for (const result of await results) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.name, 'TimeoutError');
    }
    f.responses.discovery = async () => json(discovery);
    await Promise.all([f.auth.access(101), f.auth.access(202)]);
    assert.equal(f.calls.discovery, 2);
    assert.deepEqual(signals.slice(1).map(row => row.milliseconds).sort(), [12000, 12000, 15000, 15000]);
});

test('one pilot failing a token refresh does not cancel or mark another pilot for reauthorization', async t => {
    const f = await fixture(t);
    f.responses.token = async id => id === 101 ? json({ error: 'invalid_grant' }, 400) : json({ access_token: signedToken(id) });
    const results = await Promise.allSettled([f.auth.access(101), f.auth.access(202)]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[0].reason.invalidGrant, true);
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(f.store.db.prepare('SELECT reauth FROM characters WHERE id=101').get().reauth, 1);
    assert.equal(f.store.db.prepare('SELECT reauth FROM characters WHERE id=202').get().reauth, 0);
    assert.equal(f.calls.discovery, 1);
    assert.equal(f.calls.tokens.length, 2);
    assert.equal(f.calls.keys, 1);
});
