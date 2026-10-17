// Node owns the global WebSocket used by OBS. GHSA-rfgv-xxqx-mfg5 is fixed
// in bundled Undici 6.28.1 / 7.29.1 / 8.10.2; an npm override cannot patch it.
// Reject before acquiring a profile lease or opening/migrating its database.
function version(value) {
    return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
}
function atLeast(actual, minimum) {
    if (!actual) return false;
    for (let index = 0; index < 3; index++) {
        if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
    }
    return true;
}
export function assertSupportedRuntime(versions = process.versions) {
    const node = version(versions.node), undici = version(versions.undici);
    const patched = undici && atLeast(undici, undici[0] === 6 ? [6, 28, 1] : undici[0] === 7 ? [7, 29, 1] : [8, 10, 2]);
    if (!atLeast(node, [24, 21, 0]) || !patched) {
        throw Object.assign(new Error(`Kairo needs Node.js 24.21.0 or newer with a patched WebSocket runtime. Install the current Node.js 24 LTS from https://nodejs.org/ (found Node ${versions.node || 'unknown'}, Undici ${versions.undici || 'unknown'}).`), {code: 'UNSUPPORTED_NODE'});
    }
}
