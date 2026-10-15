import { readFileSync } from 'node:fs';

const FILE = new URL('./data/universe-wormholes.json', import.meta.url);
let cache;

function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const nested of Object.values(value)) freeze(nested);
        Object.freeze(value);
    }
    return value;
}

/** Load offline reference data once. Static destination classes never create graph edges. */
function load() {
    if (cache) return cache;
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    if (data.metadata?.schema !== 1 || !Array.isArray(data.systems) || !Array.isArray(data.types) ||
        !Array.isArray(data.classes) || !Array.isArray(data.effects) ||
        data.systems.length !== data.metadata.counts?.systems || data.types.length !== data.metadata.counts?.types) {
        throw new Error('The bundled wormhole reference is invalid. Reinstall this Kairo release.');
    }
    const classes = new Map(data.classes.map(row => [row.id, row]));
    const effects = new Map(data.effects.map(row => [row.name, row]));
    const types = new Map(data.types.map(row => {
        if (typeof row.type !== 'string' || !/^[A-Z][0-9]{3}$/.test(row.type) ||
            (row.destinationClassIds !== null && (!Array.isArray(row.destinationClassIds) || row.destinationClassIds.some(id => !classes.has(id)))) ||
            ['maxJumpMassKg', 'totalMassKg', 'lifetimeHours', 'massRegenerationKg'].some(key =>
                row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0))) {
            throw new Error('The bundled wormhole type reference is invalid. Reinstall this Kairo release.');
        }
        const { destinationClassIds, ...type } = row;
        return [row.type, freeze({ ...type, destinationClasses: destinationClassIds?.map(id => {
            const row = classes.get(id);
            return { id, label: row.label, name: row.name };
        }) ?? null })];
    }));
    const references = new Map(data.systems.map(row => {
        const wormholeClass = classes.get(row.classId);
        const effect = row.effectName ? effects.get(row.effectName) : null;
        if (!Number.isSafeInteger(row.systemId) || !wormholeClass ||
            !Array.isArray(row.staticTypes) || row.staticTypes.some(type => !types.has(type)) ||
            !Array.isArray(row.wanderingTypes) || row.wanderingTypes.some(type => !types.has(type)) ||
            (row.effectName && (!effect || !Number.isInteger(row.effectPower) || row.effectPower < 1 || row.effectPower > 6))) {
            throw new Error('The bundled wormhole system reference is invalid. Reinstall this Kairo release.');
        }
        return [row.systemId, freeze({
            classId: row.classId, classLabel: wormholeClass.label, className: wormholeClass.name,
            shattered: row.shattered, frigateOnly: row.frigateOnly, drifter: row.drifter, hub: row.hub,
            statics: row.staticTypes.map(type => types.get(type)), wanderingTypes: row.wanderingTypes,
            effect: effect ? { name: effect.name, power: row.effectPower, modifiers: effect.modifiers.map(modifier => ({
                name: modifier.name, value: modifier.powers[row.effectPower - 1], positive: modifier.positive,
            })) } : null,
            source: 'Wanderer reference · CCP SDE', sourceRevision: data.metadata.revision,
            sdeBuild: data.metadata.sdeBuild, referenceOnly: true,
        })];
    }));
    if (references.size !== data.systems.length || types.size !== data.types.length) {
        throw new Error('The bundled wormhole reference contains duplicate records. Reinstall this Kairo release.');
    }
    const catalogue = freeze({ metadata: data.metadata, classes: data.classes, types: [...types.values()], effects: data.effects });
    cache = { references, types, catalogue };
    return cache;
}

/** Nominal class/type reference, not a discovered connection or a passage guarantee. */
export function getWormholeReference(systemId) {
    return load().references.get(Number(systemId)) ?? null;
}

/** Preserve the official system identity and coordinates, enriching J-space only. */
export function enrichWormholeSystem(system) {
    if (!system || system.space !== 'wormhole') return system;
    const wormhole = getWormholeReference(system.system_id);
    if (!wormhole) return system;
    // CCP supplies current weather identity/power; statics and modifier tables
    // retain the separately attributed Wanderer reference.
    const match = /^Class ([1-6]) (.+) Effects$/.exec(system.effect || '');
    const name = match?.[2] === 'Wolf Rayet' ? 'Wolf-Rayet Star' : match?.[2];
    const weather = match && load().catalogue.effects.find(row => row.name === name);
    const power = match ? Number(match[1]) : null;
    const effect = weather ? {name: weather.name, power, modifiers: weather.modifiers.map(row => ({name: row.name, value: row.powers[power - 1], positive: row.positive}))} : null;
    const officialClass = load().catalogue.classes.find(row => row.id === system.wormhole_class);
    if ((!officialClass || officialClass.id === wormhole.classId) && effect?.name === wormhole.effect?.name && effect?.power === wormhole.effect?.power) return {...system, wormhole};
    return {...system, wormhole: {...wormhole, effect,
        ...(officialClass ? {classId: officialClass.id, classLabel: officialClass.label, className: officialClass.name} : {}),
    }};
}

/** Type lookup retains unknown K162 values as null and genuine zero regeneration as zero. */
export function getWormholeType(type) {
    return typeof type === 'string' ? load().types.get(type.trim().toUpperCase()) ?? null : null;
}

/** Read-only classes, nominal hole types, modifier tables and snapshot provenance. */
export function getWormholeCatalogue() {
    return load().catalogue;
}
