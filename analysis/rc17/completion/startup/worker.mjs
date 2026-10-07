// Fresh-process external attribution. Never imported by the application.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir, cpus} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {AT, JITA, MARKET_ITEMS, TYPE_IDS, digest, seedMarket, taxonomyOperation, intelWorkload, distribution} from './fixture.mjs';

const [rootArg, manifestPath, lane, mode] = process.argv.slice(2);
assert.ok(rootArg && manifestPath && ['core', 'taxonomy', 'intel', 'indexes'].includes(lane));
assert.ok(['timing', 'heap', 'counters'].includes(mode));
assert.equal(lane === 'indexes', mode === 'counters');
if (mode === 'heap') assert.equal(typeof globalThis.gc, 'function', 'Heap diagnostics need --expose-gc');
const root = resolve(rootArg), directory = await mkdtemp(join(tmpdir(), 'kairo-startup-ablation-'));
process.env.KAIRO_DATA_DIR = directory;
process.env.KAIRO_SDE_DIRECTORY = join(root, 'server/data');
let networkAttempts = 0, core, store;
const denied = async () => { networkAttempts++; throw Error('External network forbidden in startup attribution'); };
globalThis.fetch = denied;
const moduleAt = name => import(pathToFileURL(join(root, 'server', name)).href);
const report = {schemaVersion: 1, lane, mode, forcedGC: mode === 'heap', instrumentedCounters: mode === 'counters',
    performanceClaim: false, timings: {}, heap: {}, semantic: {}, networkAttempts: 0, complete: false};
const measure = async (name, work) => {
    const before = performance.now(), value = await work();
    report.timings[name] = performance.now() - before;
    return value;
};
const sync = work => { const before = performance.now(), value = work(); return {value, elapsedMs: performance.now() - before}; };
async function heap(name) {
    for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(setImmediate); }
    report.heap[name] = process.memoryUsage();
}
async function warm(work, count = 80) {
    const samples = []; let last;
    for (let i = 0; i < count; i++) {
        const result = sync(work); samples.push(result.elapsedMs); last = result.value;
        await new Promise(setImmediate);
    }
    // Hash only the final result after timing: repeated serialization would add
    // allocation/GC pressure that is not part of this component workload.
    return {distribution: distribution(samples), digest: digest(last)};
}
function recordMaps(work) {
    const NativeMap = globalThis.Map, maps = [];
    globalThis.Map = class extends NativeMap { constructor(...args) { super(...args); maps.push(this); } };
    try { const value = work(); return {value, maps}; }
    finally { globalThis.Map = NativeMap; }
}
try {
    if (lane === 'core') {
        // Storage is fixture setup, kept outside the cold Core import interval.
        const {openStore} = await moduleAt('store.mjs'); store = openStore(directory);
        if (mode === 'heap') await heap('beforeImport');
        const {createCore} = mode === 'timing' ? await measure('coldCoreImportMs', () => moduleAt('core.mjs')) : await moduleAt('core.mjs');
        if (mode === 'heap') await heap('afterImport');
        const construct = () => createCore(store, {characters: () => []}, {request: denied, names: denied, health: () => ({})}, join(root, 'server/modules'), {
            noSync: true, combatFetcher: denied, sessionFeedFetcher: denied, markets: {historyFetcher: denied}, universe: {feeds: {fetcher: denied}},
        });
        core = mode === 'timing' ? await measure('coreConstructionMs', construct) : await construct();
        // Keep the common noSync lifecycle in both builds. RC16 does not expose
        // quiesce(), so an optional call would make background cadence unequal.
        if (mode === 'heap') await heap('afterConstruction');
        seedMarket(store);
        if (mode === 'heap') await heap('beforeFirstMarketUse');
        let first;
        if (mode === 'timing') {
            const result = sync(() => core.markets.categories(JITA));
            report.timings.firstMarketCategoriesMs = result.elapsedMs; first = result.value;
            const warmed = await warm(() => core.markets.categories(JITA));
            report.timings.warmMarketCategoriesMs = warmed.distribution;
            assert.equal(warmed.digest, digest(first));
            report.timings.coldImportConstructionFirstMarketMs = report.timings.coldCoreImportMs + report.timings.coreConstructionMs + result.elapsedMs;
        } else { first = core.markets.categories(JITA); await heap('afterFirstMarketUse'); }
        report.semantic.marketCategories = digest(first); assert.equal(first.total, MARKET_ITEMS.length); first = null;
        if (mode === 'heap') { await core.close(); core = null; store.close(); store = null; await heap('afterClose'); }
    } else if (lane === 'taxonomy') {
        if (mode === 'heap') await heap('beforeImport');
        const {createMarketCategories} = mode === 'timing' ? await measure('coldTaxonomyImportMs', () => moduleAt('market-categories.mjs')) : await moduleAt('market-categories.mjs');
        if (mode === 'heap') await heap('afterImport');
        let firstIndex, secondIndex;
        if (mode === 'timing') {
            const acquisition = sync(() => [createMarketCategories(), createMarketCategories()]);
            [firstIndex, secondIndex] = acquisition.value; report.timings.twoConsumersMs = acquisition.elapsedMs;
        } else { firstIndex = createMarketCategories(); secondIndex = createMarketCategories(); await heap('afterTwoConsumers'); }
        report.sharedDefaultFacade = firstIndex === secondIndex;
        let first;
        if (mode === 'timing') {
            const operation = sync(() => taxonomyOperation(firstIndex)); first = operation.value;
            report.timings.firstTaxonomyOperationMs = operation.elapsedMs;
            const warmed = await warm(() => taxonomyOperation(secondIndex));
            report.timings.warmTaxonomyOperationMs = warmed.distribution; assert.equal(warmed.digest, digest(first));
            report.timings.coldImportAcquireFirstTaxonomyMs = report.timings.coldTaxonomyImportMs + report.timings.twoConsumersMs + operation.elapsedMs;
        } else { first = taxonomyOperation(firstIndex); await heap('afterFirstOperation'); }
        report.semantic.taxonomy = digest(first); report.fixture = {marketItems: MARKET_ITEMS.length, typeIds: TYPE_IDS}; first = null;
        assert.equal(digest(taxonomyOperation(secondIndex)), report.semantic.taxonomy);
        if (mode === 'heap') { await heap('afterBothUsed'); firstIndex = null; secondIndex = null; await heap('afterConsumersReleased'); }
    } else if (lane === 'intel') {
        const atlasBytes = await readFile(join(root, 'server/data/universe.json.gz'));
        const atlas = JSON.parse(gunzipSync(atlasBytes)), inputs = intelWorkload(atlas);
        report.fixture = {systems: atlas.systems.length, queries: inputs.length, queryDigest: digest(inputs), atlasDigest: digest(atlasBytes)};
        if (mode === 'heap') await heap('beforeImport');
        const {createIntelParser} = mode === 'timing' ? await measure('coldIntelImportMs', () => moduleAt('universe-intel.mjs')) : await moduleAt('universe-intel.mjs');
        if (mode === 'heap') await heap('beforeConstruction');
        let parse;
        if (mode === 'timing') { const result = sync(() => createIntelParser(atlas)); parse = result.value; report.timings.intelConstructionMs = result.elapsedMs; }
        else { parse = createIntelParser(atlas); await heap('afterConstruction'); }
        const workload = () => inputs.map(input => parse(input, AT));
        let first;
        if (mode === 'timing') {
            const initial = sync(workload); first = initial.value; report.timings.firstIntelWorkloadMs = initial.elapsedMs;
            const warmed = await warm(workload);
            report.timings.warmIntelWorkloadMs = warmed.distribution;
            report.timings.warmIntelPerMessageMs = distribution(warmed.distribution.samples.map(value => value / inputs.length));
            assert.equal(warmed.digest, digest(first));
            report.timings.coldImportConstructFirstIntelMs = report.timings.coldIntelImportMs + report.timings.intelConstructionMs + initial.elapsedMs;
        } else { first = workload(); await heap('afterFirstWorkload'); }
        report.semantic.intel = digest(first); first = null;
        if (mode === 'heap') { parse = null; await heap('afterParserReleased'); }
    } else {
        const {createMarketCategories} = await moduleAt('market-categories.mjs');
        const a = recordMaps(() => createMarketCategories()), b = recordMaps(() => createMarketCategories());
        const first = recordMaps(() => taxonomyOperation(a.value));
        const second = recordMaps(() => taxonomyOperation(b.value));
        report.taxonomy = {sharedFacade: a.value === b.value,
            acquisitions: [a.maps.length, b.maps.length], firstOperationMaps: first.maps.length, secondOperationMaps: second.maps.length,
            firstConsumerMapsAfterUse: a.maps.map(map => map.size), secondConsumerMapsAfterUse: b.maps.map(map => map.size),
            firstOperationMapSizes: first.maps.map(map => map.size), secondOperationMapSizes: second.maps.map(map => map.size)};
        report.semantic.taxonomy = digest(first.value); assert.equal(report.semantic.taxonomy, digest(second.value));
        const bytes = await readFile(join(root, 'server/data/universe.json.gz')), atlas = JSON.parse(gunzipSync(bytes));
        const {createIntelParser} = await moduleAt('universe-intel.mjs'), construction = recordMaps(() => createIntelParser(atlas));
        assert.equal(construction.maps.length, 2, 'Intel must retain exact and abbreviation indexes only');
        const [exact, prefixes] = construction.maps;
        report.intel = {systems: atlas.systems.length, exactKeys: exact.size, prefixOrBucketKeys: prefixes.size,
            candidateReferences: [...prefixes.values()].reduce((sum, values) => sum + values.length, 0),
            largestCandidates: Math.max(...[...prefixes.values()].map(values => values.length))};
        const inputs = intelWorkload(atlas); report.semantic.intel = digest(inputs.map(input => construction.value(input, AT)));
    }
    assert.equal(networkAttempts, 0);
    report.complete = true;
} finally {
    await core?.close(); store?.close();
    await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
// Provenance IO happens after every measured phase, including forced-GC samples.
const {loadSourceManifest} = await import('../../harness/source-manifest.mjs');
const source = await loadSourceManifest(manifestPath, root);
report.source = {commit: source.sourceCommit, fingerprint: source.fingerprint, manifestSha256: digest(await readFile(manifestPath)), dirty: source.dirty};
report.environment = {node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length};
report.endVerified = true; report.networkAttempts = networkAttempts;
console.log(JSON.stringify(report));
