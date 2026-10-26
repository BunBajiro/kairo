/**
 * Pure broadcast protection classification plus a caller-owned continuity tracker.
 * Missing required evidence requires covers; only verified High-Sec with explicit
 * release policy can hide them. No network reads occur here. See ../docs/STREAMING.md.
 */
import { protectionLabel } from '../public/stream/protection.js';
export const LOCATION_MAX_AGE = 30000;
const REFRESH_GRACE = 30000;
const lifetimes = { fw: 600000, sovereignty: 300000, profile: 3600000, contacts: 300000, corporation_contacts: 300000, alliance_contacts: 300000 };
function deadline(snapshot, key, now) {
    const updated = Date.parse(snapshot?.updatedAt);
    if (!Number.isFinite(updated) || updated > now + 1000) return 0;
    if (key === 'location') return updated + LOCATION_MAX_AGE;
    const expires = snapshot.expiresAt === undefined ? updated + lifetimes[key] : Date.parse(snapshot.expiresAt);
    return Number.isFinite(expires) ? expires + REFRESH_GRACE : 0;
}
const unavailable = reason => ({ state: 'unknown', hidden: true, reason, unavailable: true });
const range = (id, first, last) => Number.isSafeInteger(id) && id >= first && id <= last;
/** Return a recognized special-space category, or null to continue ordinary classification. */
export function specialSpace(systemId, regionId) {
    // CCP's documented inclusive ID ranges; Pochven retains known-space IDs.
    if (regionId === 10000070 || range(systemId, 32000000, 32999999) || range(regionId, 12000000, 12999999)) return 'triglavian';
    if (range(systemId, 31000000, 31999999) || range(regionId, 11000000, 11999999)) return 'anoikis';
    return null;
}
/**
 * Classify caller-provided snapshots at epoch-ms now. hidden means covers are
 * required, not that OBS has confirmed pixels are hidden. Verified categories
 * carry validUntil as their earliest evidence deadline. Priority: manual, special space, FW, sovereignty
 * policy/contacts, then security; an explicit neutral contact still wins precedence.
 */
export function classifyOPSEC(input) {
    const { manual, location, system, constellation, region, fw, sovereignty, profile, settings = {}, now = Date.now() } = input;
    const ready = key => input[key]?.status === 'ready' && !input[key]?.truncated && now < deadline(input[key], key, now);
    const classified = (state, reason, keys, extra = {}) => ({ state, hidden: state !== 'highsec' || settings.allowHighsec !== true, reason, validUntil: Math.min(...keys.map(key => deadline(input[key], key, now))), ...extra });
    if (manual) return { state: 'manual', hidden: true, reason: 'Manual protection is engaged.' };
    if (!ready('location') || !Number.isSafeInteger(location.data?.solar_system_id) || location.data.solar_system_id <= 0)
        return unavailable('Current location is unavailable or stale.');
    const id = location.data.solar_system_id;
    const special = specialSpace(id, constellation?.region_id ?? region?.region_id ?? system?.region_id);
    if (special) return classified(special, special === 'anoikis' ? 'Anoikis wormhole space.' : range(id, 32000000, 32999999) ? 'Triglavian space · Abyssal Deadspace.' : 'Triglavian space · Pochven.', ['location']);
    if (system?.constellation_id && !(constellation?.region_id ?? region?.region_id ?? system?.region_id)) return unavailable('Region context is unavailable.');
    // Do not mistake unsupported instanced space for neutral null-sec.
    if (id >= 31000000) return unavailable('This space does not have a verified classification.');
    if (!ready('fw') || !Array.isArray(fw.data)) return unavailable('Faction warfare context is unavailable.');
    if (fw.data.some(x => x.solar_system_id === id)) return classified('fw', 'Faction warfare protection is engaged.', ['location', 'fw']);
    if (!ready('sovereignty') || !Array.isArray(sovereignty.data)) return unavailable('Sovereignty context is unavailable.');
    const keys = ['location', 'fw', 'sovereignty'];
    const alliance = sovereignty.data.find(x => x.system_id === id)?.alliance_id;
    if (alliance) {
        if ((settings.blueAlliances || []).includes(alliance)) return classified('blue', 'Friendly sovereignty · explicit blue policy.', keys, { standingSource: 'policy' });
        if ((settings.hostileAlliances || []).includes(alliance)) return classified('hostile', 'Hostile sovereignty · explicit hostile policy.', keys, { standingSource: 'policy' });
        if (ready('profile') && alliance === profile.data?.alliance_id) return classified('blue', 'Friendly sovereignty · your own alliance.', [...keys, 'profile'], { standingSource: 'own_alliance' });
        const sources = [['contacts', 'personal'], ['corporation_contacts', 'corporation'], ['alliance_contacts', 'alliance']];
        const readable = [], pending = [];
        for (const [key, source] of sources) {
            const snapshot = input[key];
            const owner = key === 'corporation_contacts' ? profile?.data?.corporation_id : profile?.data?.alliance_id;
            const validOwner = key === 'contacts' || ready('profile') && owner && snapshot?.ownerId === owner;
            if (!validOwner || !ready(key) || !Array.isArray(snapshot.data)) {
                if (snapshot && !['missing_scope', 'disabled', 'not_applicable'].includes(snapshot.status)) pending.push(source);
                continue;
            }
            readable.push(key);
            const match = snapshot.data.find(x => x.contact_type === 'alliance' && x.contact_id === alliance);
            if (!match || !Number.isFinite(match.standing)) continue;
            const standing = match.standing, state = standing > 0 ? 'blue' : standing < 0 ? 'hostile' : 'neutral';
            const level = standing >= 10 ? 'Excellent' : standing > 0 ? 'Good' : standing <= -10 ? 'Terrible' : standing < 0 ? 'Bad' : 'Neutral';
            return classified(state, level + ' standing (' + (standing > 0 ? '+' : '') + standing + ') · ' + source + ' contacts.', [...keys, key, ...(key === 'contacts' ? [] : ['profile'])], { standing, standingSource: source });
        }
        if (pending.length) return unavailable('Waiting for current ' + pending.join(', ') + ' standings.');
        if (!readable.length) return unavailable('Connect contact scopes to classify this sovereignty holder.');
        return classified('neutral', 'No standing for this sovereignty holder in the available contact lists.', [...keys, ...readable], { standing: 0, standingSource: 'none' });
    }
    // ESI provides true security. EVE displays one decimal, but positive values
    // close to zero remain low-sec (0.1), never neutral null-sec.
    const security = system?.security_status;
    if (!Number.isFinite(security) || security < -1 || security > 1) return unavailable('System security is unavailable.');
    const displaySecurity = Math.max(security > 0 ? .1 : -1, Math.round(security * 10) / 10);
    if (displaySecurity >= .5) return classified('highsec', 'High-security space · ' + (settings.allowHighsec ? 'covers may be hidden by your policy.' : 'covers retained by your policy.'), keys);
    if (security > 0) return classified('lowsec', 'Low-security space (0.1–0.4).', keys);
    return classified('neutral', 'Null-security space without an alliance sovereignty standing.', keys, { standingSource: 'none' });
}

/**
 * Return a stateful classifier for one protection owner. A policy/pilot change
 * clears continuity. Only previously covered verified states survive transient
 * gaps up to their ORIGINAL deadline; release and explicit access failures never do.
 */
export function createProtectionTracker() {
    let previous, policy;
    return input => {
        const now = input.now ?? Date.now(), nextPolicy = JSON.stringify([input.characterId, input.settings]);
        if (policy !== nextPolicy) previous = undefined;
        policy = nextPolicy;
        const blocked = input.available === false || ['location', 'fw', 'sovereignty'].some(key =>
            ['disabled', 'missing_scope', 'disconnected'].includes(input[key]?.status) || [401, 403].includes(input[key]?.errorStatus));
        const next = input.manual ? classifyOPSEC(input) : blocked ? unavailable('Protection data needs an enabled module and connected character access.') : classifyOPSEC(input);
        if (!blocked && next.unavailable && previous && now < previous.validUntil) {
            return { ...previous, pending: true, reason: 'Location or system context is updating. Retaining ' + protectionLabel(previous.state) + ' protection while the destination is verified.' };
        }
        previous = next.hidden && !['unknown', 'manual'].includes(next.state) ? next : undefined;
        return next;
    };
}
