/** Text-only bookmark conventions. Live conditions come from an exact linked observation. */
export const BOOKMARK_DEFAULT = '{sig} {type} {dest_type}';
export const BOOKMARK_TOKENS = Object.freeze(['sig', 'sig_letters', 'system', 'class', 'type', 'name', 'description', 'index', 'index_letter', 'chain_index', 'chain_index_letters', 'dest_type', 'dest_class_index', 'destination', 'direction', 'spawn_type', 'size', 'mass', 'time_status', 'mass_status', 'temporary_name']);
export const BOOKMARK_MAPPINGS = Object.freeze([
    ['time_1h', '1 hour', '1H'], ['time_4h', '4 hours', '4H'], ['time_4h30m', '4½ hours', '4.5H'], ['time_16h', '16 hours', '16H'], ['time_24h', '24 hours', ''], ['time_48h', '48 hours', ''], ['time_eol', 'End of life', 'EOL'], ['time_expired', 'Expired', 'Expired'], ['time_collapsed', 'Collapsed', 'Closed'],
    ['mass_normal', 'Stable mass', ''], ['mass_half', 'Reduced mass', 'Destab'], ['mass_verge', 'Critical mass', 'Crit'],
    ['direction_outgoing', 'Outgoing', 'Out'], ['direction_incoming', 'Incoming', 'In'],
    ['spawn_static', 'Static type', 'Static'], ['spawn_wandering', 'Wandering type', 'Wandering'], ['spawn_k162', 'Incoming type', 'K162'],
    ['size_small', 'Small', 'S'], ['size_medium', 'Medium', 'M'], ['size_large', 'Large', ''], ['size_freight', 'Freighter', 'XL'], ['size_capital', 'Capital', 'C'], ['size_k162_unknown', 'Unknown incoming size', ''],
    ...[1,2,3,4,5,6,13].map(value => ['class_c' + value, 'Class ' + value, 'C' + value]),
    ['class_c1c2c3', 'Class 1 / 2 / 3', 'C1/C2/C3'], ['class_c4c5', 'Class 4 / 5', 'C4/C5'],
    ['class_hs', 'High-sec', 'HS'], ['class_ls', 'Low-sec', 'LS'], ['class_ns', 'Null-sec', 'NS'], ['class_thera', 'Thera', 'Thera'], ['class_pochven', 'Pochven', 'Pochven'], ['class_drifter', 'Drifter', 'Drifter'],
].map(([key,label,value]) => Object.freeze({key,label,value})));
const mappingDefaults = Object.fromEntries(BOOKMARK_MAPPINGS.map(row => [row.key, row.value]));
const printable = value => typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value);
/** Validate 1–240 printable characters and supported balanced tokens; return the original text or throw. */
export function validateBookmarkTemplate(value) {
    if (!printable(value) || !value.trim() || value.length > 240) throw new Error('Use a bookmark template of 1–240 printable characters.');
    for (const match of value.matchAll(/\{([^{}]*)\}/g)) if (!BOOKMARK_TOKENS.includes(match[1])) throw new Error('Unknown bookmark token {' + match[1] + '}.');
    if (/[{}]/.test(value.replace(/\{[^{}]*\}/g, ''))) throw new Error('Close every bookmark token with a matching brace.');
    return value;
}
/** Accept only known labels, each at most 32 printable characters; return a fresh partial mapping or throw. */
export function validateBookmarkMapping(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > BOOKMARK_MAPPINGS.length) throw new Error('Use a valid bookmark label mapping.');
    const result = {};
    for (const [key, label] of Object.entries(value)) {
        if (!Object.hasOwn(mappingDefaults, key) || !printable(label) || label.length > 32) throw new Error('Choose a known bookmark label and at most 32 printable characters.');
        result[key] = label;
    }
    return result;
}
function letters(value, startAtZero = false) {
    let index = Number.isSafeInteger(value) && value >= 0 ? value + (startAtZero ? 1 : 0) : 0, result = '';
    while (index) { index--; result = String.fromCharCode(65 + index % 26) + result; index = Math.floor(index / 26); }
    return result;
}
function destinationLabel(destination) {
    if (destination?.wormhole?.classLabel) return destination.wormhole.classLabel;
    if (destination?.space_class === 25) return 'Pochven';
    if (destination?.space === 'known' && Number.isFinite(destination.security)) return destination.security >= .45 ? 'HS' : destination.security > 0 ? 'LS' : 'NS';
    return '';
}
function typeFor(signature, system) {
    return signature.type_reference || system?.wormhole?.statics?.find(row => row.type === signature.wh_type) || null;
}
function destinationFor(signature, system, destination) {
    const labels = typeFor(signature, system)?.destinationClasses?.map(row => ({'High-sec':'HS','Low-sec':'LS','Null-sec':'NS'}[row.label] || row.label));
    return destinationLabel(destination) || labels?.join('/') || '';
}
/**
 * Produce at most 240 characters of plain bookmark text; never create an EVE
 * bookmark or route. Template/mapping errors throw. Nominal type mass is formatted
 * in billions of kg, while live mass/lifetime labels require the caller's exact
 * linked connection. `options.now` is Unix ms and defaults to Date.now(). Missing
 * evidence produces blank tokens rather than a guessed condition; explicit chain
 * labels stay user-owned.
 */
export function formatSignatureBookmark(template, signature, system, destination, options = {}) {
    validateBookmarkTemplate(template);
    const mapping = {...mappingDefaults, ...validateBookmarkMapping(options.mapping || {})};
    const hole = signature.wh_type || '', type = typeFor(signature, system), connection = options.connection;
    const rawDest = destinationFor(signature, system, destination), destKey = 'class_' + rawDest.toLowerCase().replace(/[^a-z0-9]/g, '');
    const index = signature.bookmark_index ?? '', returnHole = signature.is_return_hole === true;
    const returnSymbol = printable(options.returnSymbol) ? options.returnSymbol.slice(0,32) : '↩';
    const chain = signature.bookmark_chain || String(index), chainLetters = signature.bookmark_chain_letters || letters(index, options.startAtZero === true);
    let classIndex = '';
    if (rawDest && options.signatures && options.systems) {
        const peers = options.signatures.filter(row => row.system_id === signature.system_id && row.type === 'Wormhole' && !row.missing && destinationFor(row, system, options.systems.get(row.destination_system_id)) === rawDest).sort((a,b) => a.signature_id.localeCompare(b.signature_id));
        const position = peers.findIndex(row => row.id === signature.id);
        if (peers.length > 1 && position >= 0) classIndex = letters(position + 1).toLowerCase();
    }
    let size = connection?.max_ship_size || '';
    const jumpMass = type?.maxJumpMassKg;
    if (!size && Number.isFinite(jumpMass) && jumpMass > 0) size = jumpMass <= 5000000 ? 'small' : jumpMass <= 62000000 ? 'medium' : jumpMass <= 375000000 ? 'large' : jumpMass <= 1000000000 ? 'xlarge' : 'capital';
    const sizeKey = {small:'size_small',medium:'size_medium',large:'size_large',xlarge:'size_freight',capital:'size_capital'}[size];
    let time = '', clock = options.now ?? Date.now();
    if (connection?.life_status === 'collapsed') time = mapping.time_collapsed;
    else if (connection && Number.isFinite(Date.parse(connection.expires_at))) {
        const hours = (Date.parse(connection.expires_at) - clock) / 3600000;
        if (hours <= 0) time = mapping.time_expired;
        else if (connection.life_status === 'eol' || connection.life_status === 'critical') time = mapping.time_eol;
        else time = mapping[hours <= 1 ? 'time_1h' : hours <= 4 ? 'time_4h' : hours <= 4.5 ? 'time_4h30m' : hours <= 16 ? 'time_16h' : hours <= 24 ? 'time_24h' : 'time_48h'];
    } else if (connection?.life_status === 'eol' || connection?.life_status === 'critical') time = mapping.time_eol;
    const massKey = {stable:'mass_normal', reduced:'mass_half', critical:'mass_verge'}[connection?.mass];
    const staticType = system?.wormhole?.statics?.some(row => row.type === hole);
    const knownWandering = system?.wormhole?.wanderingTypes?.includes(hole);
    const values = {
        sig: signature.signature_id || '', sig_letters: (signature.signature_id || '').split('-')[0],
        system: system?.name || '', class: system?.wormhole?.classLabel || '', type: hole || signature.type || '',
        name: signature.name || '', description: signature.notes || '', temporary_name: signature.temporary_name || '',
        index: returnHole ? returnSymbol : index, index_letter: returnHole ? returnSymbol : letters(index, options.startAtZero === true),
        chain_index: returnHole ? returnSymbol : chain, chain_index_letters: returnHole ? returnSymbol : chainLetters,
        dest_type: Object.hasOwn(mapping, destKey) ? mapping[destKey] : rawDest, dest_class_index: classIndex,
        destination: destination?.name || '', direction: hole ? hole === 'K162' ? mapping.direction_incoming : mapping.direction_outgoing : '',
        spawn_type: hole === 'K162' ? mapping.spawn_k162 : staticType ? mapping.spawn_static : knownWandering ? mapping.spawn_wandering : '',
        size: sizeKey ? mapping[sizeKey] : hole === 'K162' ? mapping.size_k162_unknown : '',
        mass: Number.isFinite(type?.totalMassKg) ? String(Number((type.totalMassKg / 1e9).toFixed(2))) : '',
        time_status: time, mass_status: massKey ? mapping[massKey] : '',
    };
    return template.replace(/\{([^{}]*)\}/g, (_, token) => String(values[token] ?? '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}
