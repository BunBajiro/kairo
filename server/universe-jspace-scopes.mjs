/** Map membership selectors shared by manual Maps and source-chain adoption.
 * Geography and observed ownership are separate evidence; inferred coalitions,
 * private annotations and historical visits never define an ownership scope. */
const FIELDS = ['system_ids', 'constellation_ids', 'region_ids', 'alliance_ids', 'corporation_ids', 'power_bloc_ids'];
const MAX_SELECTIONS = 2000;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const configuredBlocs = config => (Array.isArray(config?.blocs) ? config.blocs : []).filter(row =>
    typeof row?.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && !/^(inferred|alliance)-/.test(row.id));
const systemFor = (atlas, id) => atlas?.bySystemId?.get(id) || atlas?.systems?.find(row => row.system_id === id);
const unique = rows => [...new Set(rows)];

/** Empty scope means the whole universe. Selections within and between groups are ORed. */
export function hasJSpaceScope(scope) {
    return !!scope && FIELDS.some(key => Array.isArray(scope[key]) && scope[key].length > 0);
}

/** Return sorted/deduplicated groups or null for unrestricted scope. Validate
 * at most 2,000 selections per group against the atlas/configuration; unknown
 * keys, J-Space area groups and inferred bloc IDs throw. Owner IDs need positive
 * integer shape, not presence in the currently observed sovereignty snapshot. */
export function validateJSpaceScope(input, {atlas, politicsConfig} = {}) {
    if (input == null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Map scope must contain lists of selected systems, areas or owners.');
    if (Object.keys(input).some(key => !FIELDS.includes(key))) throw new Error('Choose a supported map scope group.');
    const systems = new Set((atlas?.systems || []).map(row => row.system_id));
    const known = (atlas?.systems || []).filter(row => row.space === 'known');
    const constellations = new Set(known.map(row => row.constellation_id).filter(positiveId));
    const regions = new Set(known.map(row => row.region_id).filter(positiveId));
    const blocs = new Set(configuredBlocs(politicsConfig).map(row => row.id));
    const output = {};
    for (const key of FIELDS) {
        const values = input[key] ?? [];
        if (!Array.isArray(values) || values.length > MAX_SELECTIONS) throw new Error('Choose at most 2,000 entries in each scope group.');
        if (key === 'power_bloc_ids') {
            if (values.some(value => typeof value !== 'string' || !blocs.has(value))) throw new Error('Choose a configured power bloc. Inferred coalitions cannot define a map scope.');
            output[key] = unique(values).sort();
            continue;
        }
        if (values.some(value => !positiveId(value))) throw new Error('Scope IDs must be positive whole numbers.');
        if (key === 'system_ids' && values.some(value => !systems.has(value))) throw new Error('Choose a system from the Universe atlas.');
        if (key === 'constellation_ids' && values.some(value => !constellations.has(value))) throw new Error('Choose a K-Space constellation. J-Space organisational areas are not map scopes.');
        if (key === 'region_ids' && values.some(value => !regions.has(value))) throw new Error('Choose a K-Space region. J-Space organisational areas are not map scopes.');
        output[key] = unique(values).sort((a, b) => a - b);
    }
    return hasJSpaceScope(output) ? output : null;
}

/** Ownership scopes use current, complete sovereignty only; missing evidence never matches. */
export function matchesJSpaceScope(scope, systemId, {atlas, sovereignty = [], sovereigntyReady = false, sovereigntyBySystemId, politicsConfig} = {}) {
    const system = positiveId(systemId) ? systemFor(atlas, systemId) : null;
    if (!system) return false;
    if (!hasJSpaceScope(scope)) return true;
    if (scope.system_ids?.includes(systemId)) return true;
    if (system.space !== 'known') return false;
    if (scope.constellation_ids?.includes(system.constellation_id) || scope.region_ids?.includes(system.region_id)) return true;
    if (sovereigntyReady !== true) return false;
    const owner = sovereigntyBySystemId?.get(systemId) || (Array.isArray(sovereignty) ? sovereignty.find(row => (row.system_id ?? row.solar_system_id) === systemId) : null);
    if (!owner) return false;
    if (positiveId(owner.alliance_id) && scope.alliance_ids?.includes(owner.alliance_id)) return true;
    if (positiveId(owner.corporation_id) && scope.corporation_ids?.includes(owner.corporation_id)) return true;
    // A faction ID, station owner or manually assigned J-Space dominion is not sovereign corporation evidence.
    return positiveId(owner.alliance_id) && configuredBlocs(politicsConfig).some(bloc =>
        scope.power_bloc_ids?.includes(bloc.id) && Array.isArray(bloc.alliance_ids) && bloc.alliance_ids.includes(owner.alliance_id));
}

/** Selector labels come from the bundled atlas and existing names cache; no lookups or inferred memberships. */
export function jspaceScopeOptions({atlas, politicsConfig, sovereignty = [], sovereigntyReady = false, names = {}} = {}) {
    const systems = atlas?.systems || [], known = systems.filter(row => row.space === 'known');
    const regionIds = new Set(known.map(row => row.region_id)), constellationIds = new Set(known.map(row => row.constellation_id));
    const blocs = configuredBlocs(politicsConfig);
    const sorted = rows => rows.sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
    const entities = (ids, label) => sorted(unique(ids.filter(positiveId)).map(id => ({id, name:typeof names[id] === 'string' && names[id] ? names[id] : `${label} ${id}`})));
    return {
        systems:sorted(systems.map(row => ({id:row.system_id, name:row.name, space:row.space}))),
        constellations:sorted((atlas?.constellations || []).filter(row => constellationIds.has(row.constellation_id)).map(row => ({id:row.constellation_id, name:row.name, region_id:row.region_id}))),
        regions:sorted((atlas?.regions || []).filter(row => regionIds.has(row.region_id)).map(row => ({id:row.region_id, name:row.name}))),
        alliances:entities([...sovereignty.map(row => row.alliance_id), ...blocs.flatMap(row => row.alliance_ids || [])], 'Alliance'),
        corporations:entities(sovereignty.map(row => row.corporation_id), 'Corporation'),
        power_blocs:sorted(blocs.map(row => ({id:row.id, name:row.name}))),
        sovereignty_ready:sovereigntyReady === true,
    };
}
