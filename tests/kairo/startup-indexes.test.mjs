import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {createMarketCategories} from '../../server/market-categories.mjs';
import {createIntelParser} from '../../server/universe-intel.mjs';
import {datasetFile} from '../../server/dataset-paths.mjs';
import {getUniverseStatic} from '../../server/universe-static.mjs';

const catalog = () => ({source: 'fixture', build: 123, groups: [
    {id: 4, parentId: 0, name: 'Ships', types: []},
    {id: 5, parentId: 4, name: 'Frigates', types: [587]},
], volumes: {587: 2500}});

test('default market consumers share a lazy immutable facade and fresh result objects', async t => {
    const token = randomUUID(), url = new URL(`../../server/market-categories.mjs?lazy=${token}`, import.meta.url).href;
    const reads = [];
    globalThis[Symbol.for(token)] = (path, encoding) => { reads.push({path, encoding}); return JSON.stringify(catalog()); };
    t.after(() => { delete globalThis[Symbol.for(token)]; });
    const hooks = registerHooks({
        resolve(specifier, context, next) {
            if (context.parentURL === url && specifier === 'node:fs') return {url: `kairo-taxonomy:${token}`, shortCircuit: true};
            return next(specifier, context);
        },
        load(url, context, next) {
            if (url === `kairo-taxonomy:${token}`) return {format: 'module', source: `export const readFileSync = (...args) => globalThis[Symbol.for(${JSON.stringify(token)})](...args);`, shortCircuit: true};
            return next(url, context);
        },
    });
    let create;
    try { ({createMarketCategories: create} = await import(url)); }
    finally { hooks.deregister(); }
    const first = create(), second = create();
    assert.strictEqual(first, second);
    assert.equal(Object.isFrozen(first), true);
    assert.deepEqual(reads, [], 'importing and acquiring consumers must not load taxonomy data');
    assert.equal(second.known, '[587]');
    assert.deepEqual(reads, [{path: datasetFile('market-categories.json'), encoding: 'utf8'}]);
    assert.throws(() => { first.type = () => null; }, TypeError);
    const view = first.overview([{type_id: 587}]), type = second.type(587);
    view.groups[0].name = 'Mutated'; view.groups.length = 0; type.path[0].name = 'Changed'; type.path.length = 0;
    assert.equal(second.overview([{type_id: 587}]).groups[0].name, 'Ships');
    assert.deepEqual(first.type(587), {path: [{id: 5, name: 'Frigates'}, {id: 4, name: 'Ships'}], root: 4, volume: 2500});
    assert.equal(first.ids(4), '[587]'); assert.equal(second.ids(5), '[587]');
    assert.equal(reads.length, 1, 'every default operation uses the same completed index');
});

test('explicit market catalogs are independent snapshots and validate before use', () => {
    const original = catalog(), first = createMarketCategories(original);
    original.groups[1].name = 'Changed'; original.groups[1].types.push(588); original.volumes[587] = 99;
    const second = createMarketCategories(original);
    assert.equal(first.type(587).path[0].name, 'Frigates');
    assert.equal(first.type(587).volume, 2500); assert.equal(first.ids(4), '[587]');
    assert.equal(second.type(587).path[0].name, 'Changed');
    assert.equal(second.type(587).volume, 99); assert.equal(second.ids(4), '[587,588]');
    const cyclic = catalog(); cyclic.groups[0].parentId = 5;
    assert.throws(() => createMarketCategories(cyclic), /Cyclic/);
    const orphan = catalog(); orphan.groups[1].parentId = 999;
    assert.throws(() => createMarketCategories(orphan), /Missing parent/);
    const duplicate = catalog(); duplicate.groups[0].types.push(587);
    assert.throws(() => createMarketCategories(duplicate), /Duplicate/);
});

const AT = Date.parse('2026-10-03T00:00:00Z');
const references = (parse, text) => {
    const {system_ids, ambiguous_systems} = parse({text}, AT);
    return {system_ids, ambiguous_systems};
};

test('shared immutable atlas names preserve exact Intel lookup and mutable atlas isolation', () => {
    const atlas = getUniverseStatic(), lookup = atlas.bySystemName;
    assert.strictEqual(lookup, getUniverseStatic().bySystemName);
    assert.equal(lookup.set, undefined); assert.equal(lookup.delete, undefined); assert.equal(lookup.clear, undefined);
    assert.ok(Object.isFrozen(lookup));
    const shared = createIntelParser(atlas), independent = createIntelParser({systems: atlas.systems});
    for (const system of atlas.systems) {
        assert.strictEqual(lookup.get(system.name.toLowerCase()), system);
        assert.deepEqual(references(shared, system.name), references(independent, system.name));
    }
    const custom = {systems: [{name: 'Original', system_id: 1}]};
    const before = createIntelParser(custom);
    custom.systems[0].system_id = 99;
    assert.deepEqual(references(before, 'Original Orig'), {system_ids:[1], ambiguous_systems:[]});
    custom.systems = [{name: 'Changed', system_id: 2}];
    const after = createIntelParser(custom);
    assert.deepEqual(references(before, 'Original'), {system_ids:[1], ambiguous_systems:[]});
    assert.deepEqual(references(after, 'Original'), {system_ids:[], ambiguous_systems:[]});
    assert.deepEqual(references(after, 'Changed'), {system_ids:[2], ambiguous_systems:[]});
});

test('intel abbreviations retain exact precedence, longest multiword matches and duplicate ambiguity', () => {
    const names = ['Alp', 'Alpha', 'Alpine', 'New', 'New Caldari', 'New Caldari Prime', 'New Canaan', 'Beta', "O'Connell", 'Étoile', 'XY', 'J123456', 'J123456'];
    const parse = createIntelParser({systems: names.map((name, i) => ({name, system_id: i + 1}))});
    assert.deepEqual(references(parse, 'Alp'), {system_ids: [1], ambiguous_systems: []});
    assert.deepEqual(references(parse, 'Alph'), {system_ids: [2], ambiguous_systems: []});
    assert.deepEqual(references(parse, 'New Caldari Prime and New Caldari; New Canaan'), {system_ids: [5, 6, 7], ambiguous_systems: []});
    assert.deepEqual(references(parse, 'Alpi Bet Éto O’Con XY J123'), {system_ids: [3, 8, 10, 11], ambiguous_systems: ['j123']});
    assert.deepEqual(references(parse, "O'Con J123456"), {system_ids: [9, 13], ambiguous_systems: []});
    assert.deepEqual(references(parse, 'Al Be something-unmatched'), {system_ids: [], ambiguous_systems: []});
    const withoutExact = createIntelParser({systems: [{name: 'New Caldari', system_id: 1}, {name: 'New Canaan', system_id: 2}]});
    assert.deepEqual(references(withoutExact, 'New Cal'), {system_ids: [], ambiguous_systems: ['new']});
});

test('intel matches all bundled exact names and supported prefixes without changing ambiguity', () => {
    const atlas = JSON.parse(gunzipSync(readFileSync(new URL('../../server/data/universe.json.gz', import.meta.url))));
    const parse = createIntelParser(atlas), exact = new Map(), prefixes = new Map();
    // Build expected results using the previous eager abbreviation rule. This
    // oracle remains independent of the runtime's bounded candidate buckets.
    for (const system of atlas.systems) {
        const name = system.name.toLowerCase(); exact.set(name, system.system_id);
        for (let size = 3; size < name.length; size++) {
            const prefix = name.slice(0, size);
            if (!/^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u.test(prefix)) continue;
            if (!prefixes.has(prefix)) prefixes.set(prefix, []);
            prefixes.get(prefix).push(system.system_id);
        }
    }
    for (const [name, id] of exact) assert.deepEqual(references(parse, name), {system_ids: [id], ambiguous_systems: []}, name);
    for (const [prefix, candidates] of prefixes) {
        const id = exact.get(prefix);
        const expected = id ? {system_ids: [id], ambiguous_systems: []}
            : candidates.length === 1 ? {system_ids: candidates, ambiguous_systems: []}
            : {system_ids: [], ambiguous_systems: [prefix]};
        assert.deepEqual(references(parse, prefix), expected, prefix);
    }
});
