/**
 * Owns EVE SSO for one runtime: verified identities, encrypted token records and
 * connection generations. Consumers use this owner rather than refreshing tokens
 * independently. Scope grants and local security boundaries: docs/AUTH-AND-SECURITY.md.
 */
import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
const DISCOVERY = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
const validEndpoint = value => { const u = new URL(value); if (u.origin !== 'https://login.eveonline.com')
    throw new Error('Unexpected SSO endpoint.'); return u.href; };
/** Create one authorization's secret verifier and public S256 challenge; never log the verifier. */
export function makePKCE() { const verifier = randomBytes(48).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; }
/**
 * Check already signature-verified JWT claims against the configured application.
 * `now` is Unix seconds (unlike stored token expiry in milliseconds). Returns the
 * character identity and actual granted scopes; invalid claims throw. This helper
 * alone does not authenticate an untrusted JWT: validate() verifies its signature first.
 */
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
/**
 * Construct the shared SSO owner using the private dashboard origin for callbacks.
 * Store and Vault remain caller-owned; pending sign-ins and request flights live
 * only in this instance. Returned credentials are private transport inputs, never
 * dashboard/Stream DTOs. The outer runtime must drain its callers before closing Store.
 */
export function createAuth(store, vault, { fetcher = fetch, origin }) {
    let metadata, keys, metaUntil = 0, keyUntil = 0;
    let metadataFlight, keyFlight;
    const pending = new Map(), refreshing = new Map();
    const connectionRevisions = new Map();
    // An opaque in-process generation, not an access-token version. Login and
    // disconnect advance it; ordinary refresh must preserve accepted ownership.
    const connectionRevision = id => connectionRevisions.get(id) || 0;
    const changedConnection = id => connectionRevisions.set(id, connectionRevision(id) + 1);
    const clientId = () => store.get('clientId', '');
    // Discovery and signing keys each own an hour-long successful cache and one
    // shared flight. Failures clear only the flight so later callers can retry.
    async function getMetadata() {
        if (metadata && Date.now() < metaUntil)
            return metadata;
        if (!metadataFlight) {
            metadataFlight = (async () => {
                const r = await fetcher(DISCOVERY, { signal: AbortSignal.timeout(12000) });
                if (!r.ok)
                    throw new Error('EVE SSO discovery is unavailable.');
                const next = await r.json();
                const required = ['authorization_endpoint', 'token_endpoint', 'jwks_uri'];
                if (!next || typeof next !== 'object' || Array.isArray(next) || required.some(key => typeof next[key] !== 'string' || !next[key]))
                    throw new Error('EVE SSO discovery returned incomplete endpoints.');
                required.forEach(key => validEndpoint(next[key]));
                if (next.revocation_endpoint) validEndpoint(next.revocation_endpoint);
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
    /** Verify RS256 and claims; an unknown key permits one shared JWKS rotation fetch. */
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
    /** Read the current local roster without tokens; scopes are grants, not proof of resource access. */
    function characters() { return store.db.prepare('SELECT id,name,scopes,reauth FROM characters ORDER BY name').all().map(c => ({ id: c.id, name: c.name, scopes: JSON.parse(c.scopes), needsReauth: !!c.reauth })); }
    /** Return an SSO redirect URL; bind one-use state to `session` for ten minutes. */
    async function authorize(session, scopes) { if (!/^[\w-]{8,128}$/.test(clientId()))
        throw new Error('Add your EVE application Client ID first.'); const m = await getMetadata(); const pkce = makePKCE(); const state = randomBytes(32).toString('base64url'); for (const [k, v] of pending)
        if (v.expires < Date.now())
            pending.delete(k); pending.set(state, { session, verifier: pkce.verifier, expires: Date.now() + 600000 }); const u = new URL(validEndpoint(m.authorization_endpoint)); u.search = new URLSearchParams({ response_type: 'code', client_id: clientId(), redirect_uri: origin + '/auth/eve/callback', scope: scopes.join(' '), state, code_challenge: pkce.challenge, code_challenge_method: 'S256' }).toString(); return u.href; }
    /**
     * Consume session-bound state before exchanging a code, then persist the verified
     * grant and advance its connection revision. Changed EVE character ownership
     * invalidates snapshots/private HTTP bodies, not retained user/domain history.
     * Any exchange or validation failure rejects; the consumed state is not reusable.
     */
    async function callback(session, state, code) { const p = pending.get(state); if (!p || p.session !== session || p.expires < Date.now() || !code)
        throw new Error('This sign-in has expired. Start again from Kairo.'); pending.delete(state); const t = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: origin + '/auth/eve/callback' }); const identity = await validate(t.access_token); if (!t.refresh_token)
        throw new Error('EVE did not return a refresh token.'); const prior = store.db.prepare('SELECT owner FROM characters WHERE id=?').get(identity.id); if (prior && prior.owner && prior.owner !== identity.owner) {
        store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(identity.id);
        store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run(identity.id + ':%');
    } store.db.prepare('INSERT INTO characters(id,name,scopes,tokens,owner,reauth) VALUES(?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,scopes=excluded.scopes,tokens=excluded.tokens,owner=excluded.owner,reauth=0').run(identity.id, identity.name, JSON.stringify(identity.scopes), vault.encrypt({ ...t, expires: identity.expires }), identity.owner); changedConnection(identity.id); return identity; }
    /**
     * Return a private access token, refreshing within 90 seconds of expiry or when
     * forced after an explicit 401. Share only the current encrypted token record's
     * refresh. Compare-and-update prevents late success/failure from overwriting a
     * new login; invalid_grant marks only its matching connection for reauthorization.
     * Missing/revoked/changed connections reject instead of returning obsolete access.
     */
    async function access(id, force = false) {
        const c = store.db.prepare('SELECT * FROM characters WHERE id=?').get(id);
        if (!c)
            throw new Error('Connect this character first.');
        if (c.reauth)
            throw new Error('Reconnect this character in Connections.');
        const current = refreshing.get(id);
        if (current?.tokens === c.tokens)
            return current.task;
        const t = vault.decrypt(c.tokens);
        if (!force && t.expires > Date.now() + 90000)
            return t.access_token;
        const task = (async () => { try {
            const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
            const identity = await validate(n.access_token);
            if (identity.id !== id || (c.owner && identity.owner !== c.owner))
                throw new Error('Character ownership changed. Reconnect this character.');
            const updated = store.db.prepare('UPDATE characters SET tokens=?,scopes=?,reauth=0 WHERE id=? AND tokens=? AND reauth=0').run(vault.encrypt({ ...n, refresh_token: n.refresh_token || t.refresh_token, expires: identity.expires }), JSON.stringify(identity.scopes), id, c.tokens);
            if (!updated.changes)
                throw new Error('Character connection changed during token refresh.');
            return n.access_token;
        }
        catch (e) {
            if (e.invalidGrant)
                store.db.prepare('UPDATE characters SET reauth=1 WHERE id=? AND tokens=?').run(id, c.tokens);
            throw e;
        }
        finally {
            if (refreshing.get(id)?.task === task)
                refreshing.delete(id);
        } })();
        refreshing.set(id, { tokens: c.tokens, task });
        return task;
    }
    /**
     * End local access immediately, then await best-effort remote revocation. Missing
     * IDs are a no-op; revocation failure is swallowed. Durable history is retained.
     */
    async function disconnect(id) { const row = store.db.prepare('SELECT tokens FROM characters WHERE id=?').get(id); if (row) {
        // Local ownership ends before best-effort network revocation. A fresh
        // login during that await must not be removed by this older operation.
        store.db.prepare('DELETE FROM characters WHERE id=?').run(id);
        changedConnection(id);
        store.db.prepare('DELETE FROM snapshots WHERE character_id=?').run(id);
        store.db.prepare('DELETE FROM cache WHERE key LIKE ?').run(id + ':%');
        try {
            const m = await getMetadata();
            if (m.revocation_endpoint) {
                const t = vault.decrypt(row.tokens);
                await fetcher(validEndpoint(m.revocation_endpoint), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: clientId() }), signal: AbortSignal.timeout(8000) });
            }
        }
        catch { }
    } }
    return { authorize, callback, access, characters, disconnect, connectionRevision };
}
