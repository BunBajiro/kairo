import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
const DISCOVERY = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
const validEndpoint = value => { const u = new URL(value); if (u.origin !== 'https://login.eveonline.com')
    throw new Error('Unexpected SSO endpoint.'); return u.href; };
export function makePKCE() { const verifier = randomBytes(48).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; }
export function validateClaims(claims, clientId, now = Date.now() / 1000) {
    if (!['https://login.eveonline.com/', 'https://login.eveonline.com', 'login.eveonline.com'].includes(claims.iss))
        throw new Error('Invalid SSO issuer.');
    if (!Array.isArray(claims.aud) || !claims.aud.includes('EVE Online') || !claims.aud.includes(clientId))
        throw new Error('Invalid SSO audience.');
    if (!Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now + 30))
        throw new Error('Expired or not-yet-valid SSO token.');
    if (!/^CHARACTER:EVE:\d+$/.test(claims.sub))
        throw new Error('Invalid character identity.');
    return { id: Number(claims.sub.split(':')[2]), name: String(claims.name || 'Capsuleer'), scopes: Array.isArray(claims.scp) ? claims.scp : typeof claims.scp === 'string' ? claims.scp.split(' ') : [], owner: claims.owner || null };
}
export function createAuth(store, vault, { fetcher = fetch, origin }) {
    let metadata, keys, metaUntil = 0, keyUntil = 0;
    let metadataFlight, keyFlight;
    const pending = new Map(), refreshing = new Map();
    const clientId = () => store.get('clientId', '');
    async function getMetadata() {
        if (metadata && Date.now() < metaUntil)
            return metadata;
        if (!metadataFlight) {
            metadataFlight = (async () => {
                const r = await fetcher(DISCOVERY, { signal: AbortSignal.timeout(12000) });
                if (!r.ok)
                    throw new Error('EVE SSO discovery is unavailable.');
                const next = await r.json();
                ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint'].forEach(k => { if (next[k])
                    validEndpoint(next[k]); });
                metadata = next;
                metaUntil = Date.now() + 3600000;
                return metadata;
            })().finally(() => { metadataFlight = undefined; });
        }
        return metadataFlight;
    }
    async function getKeys(m, force = false) {
        if (!force && keys && Date.now() <= keyUntil)
            return keys;
        if (!keyFlight) {
            keyFlight = (async () => {
                const r = await fetcher(validEndpoint(m.jwks_uri), { signal: AbortSignal.timeout(12000) });
                if (!r.ok)
                    throw new Error('Unable to verify EVE identity.');
                const next = (await r.json()).keys;
                if (!Array.isArray(next))
                    throw new Error('Unable to verify EVE identity.');
                keys = next;
                keyUntil = Date.now() + 3600000;
                return keys;
            })().finally(() => { keyFlight = undefined; });
        }
        return keyFlight;
    }
    async function validate(token) {
        const parts = String(token).split('.');
        if (parts.length !== 3)
            throw new Error('Invalid SSO token.');
        const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
        if (header.alg !== 'RS256')
            throw new Error('Unexpected SSO signing algorithm.');
        const m = await getMetadata();
        let key;
        for (let i = 0; i < 2; i++) {
            const available = await getKeys(m, i === 1);
            key = available.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256'));
            if (key)
                break;
        }
        if (!key || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url')))
            throw new Error('Invalid SSO signature.');
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
        return { ...validateClaims(claims, clientId()), expires: claims.exp * 1000 };
    }
    async function tokenRequest(body) { const m = await getMetadata(); const r = await fetcher(validEndpoint(m.token_endpoint), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, client_id: clientId() }), signal: AbortSignal.timeout(15000) }); if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const err = new Error(e.error === 'invalid_grant' ? 'EVE access expired or was revoked. Reconnect this character.' : 'EVE SSO could not complete the token request.');
        err.invalidGrant = e.error === 'invalid_grant';
        throw err;
    } return r.json(); }
    function characters() { return store.db.prepare('SELECT id,name,scopes,reauth FROM characters ORDER BY name').all().map(c => ({ id: c.id, name: c.name, scopes: JSON.parse(c.scopes), needsReauth: !!c.reauth })); }
    async function authorize(session, scopes) { if (!/^[\w-]{8,128}$/.test(clientId()))
        throw new Error('Add your EVE application Client ID first.'); const m = await getMetadata(); const pkce = makePKCE(); const state = randomBytes(32).toString('base64url'); for (const [k, v] of pending)
        if (v.expires < Date.now())
            pending.delete(k); pending.set(state, { session, verifier: pkce.verifier, expires: Date.now() + 600000 }); const u = new URL(validEndpoint(m.authorization_endpoint)); u.search = new URLSearchParams({ response_type: 'code', client_id: clientId(), redirect_uri: origin + '/auth/eve/callback', scope: scopes.join(' '), state, code_challenge: pkce.challenge, code_challenge_method: 'S256' }).toString(); return u.href; }
    async function callback(session, state, code) { const p = pending.get(state); if (!p || p.session !== session || p.expires < Date.now() || !code)
        throw new Error('This sign-in has expired. Start again from Kairo.'); pending.delete(state); const t = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: origin + '/auth/eve/callback' }); const identity = await validate(t.access_token); if (!t.refresh_token)
        throw new Error('EVE did not return a refresh token.'); const prior = store.db.prepare('SELECT owner FROM characters WHERE id=?').get(identity.id); if (prior && prior.owner && prior.owner !== identity.owner) {
        store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(identity.id);
        store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run(identity.id + ':%');
    } store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,scopes=excluded.scopes,tokens=excluded.tokens,owner=excluded.owner,reauth=0').run(identity.id, identity.name, JSON.stringify(identity.scopes), vault.encrypt({ ...t, expires: identity.expires }), identity.owner); return identity; }
    async function access(id, force = false) {
        if (refreshing.has(id))
            return refreshing.get(id);
        const c = store.db.prepare('SELECT * FROM characters WHERE id=?').get(id);
        if (!c)
            throw new Error('Connect this character first.');
        if (c.reauth)
            throw new Error('Reconnect this character in Connections.');
        const t = vault.decrypt(c.tokens);
        if (!force && t.expires > Date.now() + 90000)
            return t.access_token;
        const task = (async () => { try {
            const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
            const identity = await validate(n.access_token);
            if (identity.id !== id || (c.owner && identity.owner !== c.owner))
                throw new Error('Character ownership changed. Reconnect this character.');
            store.db.prepare('UPDATE characters SET tokens=?,scopes=?,reauth=0 WHERE id=?').run(vault.encrypt({ ...n, refresh_token: n.refresh_token || t.refresh_token, expires: identity.expires }), JSON.stringify(identity.scopes), id);
            return n.access_token;
        }
        catch (e) {
            if (e.invalidGrant)
                store.db.prepare('UPDATE characters SET reauth=1 WHERE id=?').run(id);
            throw e;
        }
        finally {
            refreshing.delete(id);
        } })();
        refreshing.set(id, task);
        return task;
    }
    async function disconnect(id) { const row = store.db.prepare('SELECT tokens FROM characters WHERE id=?').get(id); if (row) {
        try {
            const m = await getMetadata();
            if (m.revocation_endpoint) {
                const t = vault.decrypt(row.tokens);
                await fetcher(validEndpoint(m.revocation_endpoint), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: clientId() }), signal: AbortSignal.timeout(8000) });
            }
        }
        catch { }
        store.db.prepare('DELETE FROM characters WHERE id=?').run(id);
        store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(id);
        store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run(id + ':%');
    } }
    return { authorize, callback, access, characters, disconnect };
}
