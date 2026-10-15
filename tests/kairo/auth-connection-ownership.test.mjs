import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuth } from '../../server/auth.mjs';
import { openStore } from '../../server/store.mjs';
import { openVault } from '../../server/vault.mjs';

const clientId = 'kairo-auth-ownership-tests';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'ownership', alg: 'RS256' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function token(label, scopes = ['esi-location.read_location.v1']) {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ iss: 'https://login.eveonline.com', aud: ['EVE Online', clientId],
        sub: 'CHARACTER:EVE:101', owner: 'owner-101', name: 'Pilot 101', scp: scopes,
        exp: Math.floor(Date.now() / 1000) + 1200, jti: label })).toString('base64url');
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), pair.privateKey).toString('base64url')}`;
}
async function fixture(t) {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-auth-ownership-'));
    const store = openStore(dir), vault = openVault(dir);
    t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
    store.set('clientId', clientId);
    store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0)').run(
        101, 'Pilot 101', '[]', vault.encrypt({ access_token: 'expired', refresh_token: 'old-refresh', expires: 0 }), 'owner-101');
    const refreshStarted = Promise.withResolvers(), refreshGate = Promise.withResolvers();
    const revokeStarted = Promise.withResolvers(), revokeGate = Promise.withResolvers();
    const current = token('new-login', ['esi-wallet.read_character_wallet.v1']);
    const calls = [];
    const responses = { newRefresh: async () => json({ access_token: token('new-refresh-result'), refresh_token: 'rotated-new-refresh' }) };
    const auth = createAuth(store, vault, { origin: 'http://127.0.0.1:4380', fetcher: async (url, options) => {
        const path = new URL(url).pathname;
        if (path.endsWith('oauth-authorization-server')) return json({
            authorization_endpoint: 'https://login.eveonline.com/authorize', token_endpoint: 'https://login.eveonline.com/token',
            jwks_uri: 'https://login.eveonline.com/keys', revocation_endpoint: 'https://login.eveonline.com/revoke' });
        if (path === '/keys') return json({ keys: [jwk] });
        const body = Object.fromEntries(options.body); calls.push({ path, ...body });
        if (path === '/revoke') { revokeStarted.resolve(); await revokeGate.promise; return json({}); }
        assert.equal(path, '/token');
        if (body.grant_type === 'authorization_code') return json({ access_token: current, refresh_token: 'new-refresh' });
        assert.equal(body.grant_type, 'refresh_token');
        if (body.refresh_token === 'old-refresh') { refreshStarted.resolve(); return refreshGate.promise; }
        return responses.newRefresh();
    } });
    const login = async () => {
        const url = new URL(await auth.authorize('session', []));
        await auth.callback('session', url.searchParams.get('state'), 'code');
    };
    const row = () => store.db.prepare('SELECT * FROM characters WHERE id=101').get();
    return { auth, login, row, vault, current, calls, responses, refreshStarted, refreshGate, revokeStarted, revokeGate };
}

for (const outcome of ['success', 'invalid_grant']) {
    test(`a superseded refresh ${outcome} cannot alter a new SSO connection`, async t => {
        const f = await fixture(t);
        const pending = f.auth.access(101).then(value => ({ value }), error => ({ error }));
        await f.refreshStarted.promise;
        await f.login();
        f.refreshGate.resolve(outcome === 'success' ? json({ access_token: token('obsolete'), refresh_token: 'obsolete-refresh' }) : json({ error: 'invalid_grant' }, 400));
        const result = await pending;
        assert.equal(f.vault.decrypt(f.row().tokens).access_token, f.current, 'The freshly signed-in token is authoritative');
        assert.equal(f.row().reauth, 0, 'An obsolete grant failure cannot revoke the new connection');
        assert.deepEqual(JSON.parse(f.row().scopes), ['esi-wallet.read_character_wallet.v1']);
        assert.ok(result.error, 'Obsolete access must reject rather than dispatch with an old grant');
        assert.equal(await f.auth.access(101), f.current);
        assert.equal(f.calls.filter(c => c.grant_type === 'refresh_token').length, 1);
    });
}

test('access after a new login does not join a refresh owned by the old connection', async t => {
    const f = await fixture(t);
    const pending = f.auth.access(101).catch(error => error);
    await f.refreshStarted.promise;
    await f.login();
    const access = f.auth.access(101);
    f.refreshGate.resolve(json({ access_token: token('obsolete'), refresh_token: 'obsolete-refresh' }));
    assert.equal(await access, f.current);
    await pending;
});

test('disconnect removes local access promptly and cannot delete a login completed during revocation', async t => {
    const f = await fixture(t);
    const disconnect = f.auth.disconnect(101);
    await f.revokeStarted.promise;
    // Settle revocation even if the baseline assertion fails, before the store closes.
    t.after(() => f.revokeGate.resolve());
    try {
        assert.deepEqual(f.auth.characters(), [], 'Revocation network delay must not keep the pilot locally connected');
        await assert.rejects(f.auth.access(101), /Connect this character first/);
        await f.login();
    } finally { f.revokeGate.resolve(); await disconnect; }
    assert.equal(await f.auth.access(101), f.current);
    assert.equal(f.calls.filter(c => c.path === '/revoke').length, 1);
    assert.equal(f.calls.find(c => c.path === '/revoke').token, 'old-refresh');
});

test('settling an obsolete refresh does not clear the replacement connection flight', async t => {
    const f = await fixture(t), started = Promise.withResolvers(), gate = Promise.withResolvers();
    const old = f.auth.access(101).catch(error => error);
    await f.refreshStarted.promise;
    await f.login();
    f.responses.newRefresh = async () => { started.resolve(); return gate.promise; };
    const current = f.auth.access(101, true);
    await started.promise;
    f.refreshGate.resolve(json({ access_token: token('obsolete') }));
    assert.ok(await old instanceof Error);
    const joined = f.auth.access(101, true);
    const renewed = token('latest');
    gate.resolve(json({ access_token: renewed, refresh_token: 'latest-refresh' }));
    assert.deepEqual(await Promise.all([current, joined]), [renewed, renewed]);
    assert.equal(f.calls.filter(c => c.grant_type === 'refresh_token' && c.refresh_token === 'new-refresh').length, 1);
    assert.equal(await f.auth.access(101), renewed);
});

test('a refresh settling after disconnect cannot publish or return disconnected access', async t => {
    const f = await fixture(t);
    const pending = f.auth.access(101).catch(error => error);
    await f.refreshStarted.promise;
    const disconnect = f.auth.disconnect(101);
    await f.revokeStarted.promise;
    f.refreshGate.resolve(json({ access_token: token('obsolete') }));
    try {
        assert.ok(await pending instanceof Error);
        assert.equal(f.row(), undefined);
        await assert.rejects(f.auth.access(101), /Connect this character first/);
    } finally { f.revokeGate.resolve(); await disconnect; }
});
