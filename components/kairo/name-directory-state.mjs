import {mergeResourceNames, retainValue} from './resource-state.mjs';

// One dashboard owns the latest authoritative directory. HTTP reads capture an
// event/connection fence; a later names event or reconnect makes that read stale.
// The first names event on a connection establishes its process epoch. Counters
// are ordered only within that epoch, never across process restart/reset.
/**
 * Return the private global directory reconciler (not a per-pilot cache). Capture
 * before HTTP; pass that fence to fromState on completion. Versioned state/events
 * replace the whole directory, while legacy snapshots merge partial names.
 *
 * Publication methods return a replacement map or null for no accepted change;
 * revision is undefined after legacy input. connect/disconnect report whether they
 * invalidate pending state evidence. See ../../docs/API-REFERENCE.md for SSE epochs.
 */
export function createNameDirectoryState() {
    let current = null, connection = 0, events = 0, awaitingBootstrap = true, legacy = false, opened = false, disconnected = false;
    function packet(value) {
        const revision = value?.namesRevision, names = value?.names;
        if (typeof revision !== 'string' || !names || typeof names !== 'object' || Array.isArray(names)) return null;
        const split = revision.lastIndexOf(':'), epoch = revision.slice(0, split), version = Number(revision.slice(split + 1));
        if (split < 1 || !Number.isSafeInteger(version) || version < 0 || String(version) !== revision.slice(split + 1)) return null;
        return {revision, epoch, version, names};
    }
    function install(next) {
        if (!legacy && current?.revision === next.revision) return null;
        current = next; legacy = false; return next.names;
    }
    return {
        connect() {
            // The first open adds no newer names evidence. Keep an initial
            // legacy HTTP read valid until a names event actually arrives.
            const invalidate = opened || disconnected;
            if (invalidate) { connection++; events++; }
            opened = true; disconnected = false; awaitingBootstrap = true;
            return invalidate;
        },
        disconnect() {
            if (disconnected) return false;
            disconnected = true; connection++; events++; awaitingBootstrap = true;
            return true;
        },
        capture: () => ({connection, events}),
        fromState(value, observed) {
            if (!observed || observed.connection !== connection || observed.events !== events) return null;
            // Unversioned full HTTP state remains authoritative for older
            // servers and declared external fixtures. The same read fence applies.
            if (value?.namesRevision === undefined) {
                const names = value?.names;
                if (!names || typeof names !== 'object' || Array.isArray(names)) return null;
                const previous = current?.names || {}, next = retainValue(previous, names);
                current = {...current, names: next}; legacy = true;
                return next === previous ? null : next;
            }
            const next = packet(value); if (!next) return null;
            if (current?.epoch) {
                if (next.epoch !== current.epoch && !awaitingBootstrap) return null;
                if (next.epoch === current.epoch && next.version < current.version) return null;
            }
            return install(next);
        },
        fromEvent(value) {
            if (disconnected) return null;
            const next = packet(value); if (!next) return null;
            if (!awaitingBootstrap && current?.epoch && next.epoch !== current.epoch) return null;
            awaitingBootstrap = false; events++;
            if (current?.epoch === next.epoch && next.version < current.version) return null;
            return install(next);
        },
        fromLegacySnapshot(names) {
            if (!names || typeof names !== 'object' || Array.isArray(names)) return null;
            events++; legacy = true;
            const previous = current?.names || {}, next = mergeResourceNames(previous, names);
            current = {...current, names: next};
            return next === previous ? null : next;
        },
        revision: () => legacy ? undefined : current?.revision,
    };
}
