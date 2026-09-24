/** One political palette for the complete ownership/group roster, independent
 * of camera, filters and background selection. No browser or Node dependencies. */
export const FACTION_TERRITORY_COLOURS = Object.freeze({
    500001: Object.freeze({ name: 'Caldari State', fill: '#4f88c6', outline: '#9cbbdd' }),
    500004: Object.freeze({ name: 'Gallente Federation', fill: '#3da891', outline: '#92cebf' }),
    500003: Object.freeze({ name: 'Amarr Empire', fill: '#c7a44b', outline: '#e0cd99' }),
    500002: Object.freeze({ name: 'Minmatar Republic', fill: '#b86b4b', outline: '#d8ac99' }),
});
const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hex = rgb => '#' + rgb.map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('');
const rgb = colour => [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16));
function hash(value) {
    // FNV-1a is only the candidate seed. Full hex collision checks enforce uniqueness.
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
    return result >>> 0;
}
function hsl(hue, saturation, lightness) {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation, h = (hue % 360) / 60;
    const x = chroma * (1 - Math.abs(h % 2 - 1)), m = lightness - chroma / 2;
    const channels = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return hex(channels.map(value => (value + m) * 255));
}
function oklab(colour) {
    const [r, g, b] = rgb(colour).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
    const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
    const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
        .0259040371 * l + .7827717662 * m - .808675766 * s];
}
/** OKLab Euclidean distance; a useful separation heuristic, not a guarantee
 * that a dense map is accessible through colour alone. Labels remain essential. */
export function territoryColourDistance(first, second) {
    if (!validHex(first) || !validHex(second)) throw new Error('Territory colours must be six-digit hex values.');
    const a = oklab(first), b = oklab(second);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function luminance(colour) {
    const [r, g, b] = rgb(colour).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    return .2126 * r + .7152 * g + .0722 * b;
}
const backgroundLuminance = luminance('#080f18');
const readableOutline = colour => (luminance(colour) + .05) / (backgroundLuminance + .05) >= 4.5;
function outlineFor(colour) {
    let outline;
    for (let mix = .43; mix <= 1.01; mix += .05) {
        outline = hex(rgb(colour).map(value => value + (255 - value) * Math.min(1, mix)));
        if (readableOutline(outline)) return outline;
    }
    return '#ffffff';
}
function normalized(entity) {
    const key = String(entity?.key || '');
    if (!key) throw new Error('A territory colour needs a stable entity key.');
    return { key, factionId: Number(entity.factionId) || null, preferredColor: validHex(entity.preferredColor) ? entity.preferredColor.toLowerCase() : null,
        priority: Number.isFinite(entity.priority) ? entity.priority : 0 };
}

/** Preferred colours go first; stable entity sorting makes input order irrelevant.
 * The four empire shades are reserved even when their territories are absent.
 * At high entity counts perceptual separation necessarily shrinks; exact fill
 * and outline uniqueness is still guaranteed across all distinct entity keys. */
export function allocateTerritoryColours(entities) {
    const unique = new Map();
    for (const input of entities) {
        const entity = normalized(input), prior = unique.get(entity.key);
        if (!prior || entity.priority > prior.priority || entity.priority === prior.priority && compare(JSON.stringify(entity), JSON.stringify(prior)) < 0) unique.set(entity.key, entity);
    }
    if (unique.size > 16384) throw new Error('The political colour roster exceeds 16,384 entities.');
    const usedFill = new Set(), usedOutline = new Set(), labs = [], result = new Map(), factionKeys = new Map();
    for (const value of Object.values(FACTION_TERRITORY_COLOURS)) { usedFill.add(value.fill); usedOutline.add(value.outline); labs.push(oklab(value.fill)); }
    const ordered = [...unique.values()].sort((a, b) => b.priority - a.priority || Number(!!b.preferredColor) - Number(!!a.preferredColor) || compare(a.key, b.key));
    for (const entity of ordered) {
        const faction = FACTION_TERRITORY_COLOURS[entity.factionId];
        if (!faction) continue;
        if (factionKeys.has(entity.factionId)) throw new Error('A faction must use one canonical territory key.');
        factionKeys.set(entity.factionId, entity.key); result.set(entity.key, Object.freeze({ fill: faction.fill, outline: faction.outline }));
    }
    for (const entity of ordered) {
        if (result.has(entity.key)) continue;
        const seed = hash(entity.key), preferred = entity.preferredColor;
        let fill = preferred && !usedFill.has(preferred) ? preferred : null, best = null, bestDistance = -1;
        if (!fill) {
            for (let attempt = 0; attempt < 48; attempt++) {
                const candidate = hsl((seed % 36000) / 100 + attempt * 137.507764, .42 + ((seed >>> 9) + attempt * 7) % 23 / 100,
                    .44 + ((seed >>> 17) + attempt * 11) % 23 / 100);
                if (usedFill.has(candidate)) continue;
                const lab = oklab(candidate);
                let distance = Infinity;
                for (const other of labs) {
                    const squared = (lab[0] - other[0]) ** 2 + (lab[1] - other[1]) ** 2 + (lab[2] - other[2]) ** 2;
                    if (squared < distance) distance = squared;
                    if (distance <= bestDistance) break;
                }
                if (distance > bestDistance) { bestDistance = distance; best = candidate; }
                // The first well-separated stable candidate wins. Extra entities
                // only disturb colours whose candidates become close neighbours.
                if (distance >= .08 ** 2) break;
            }
            fill = best;
        }
        // A complete 24-bit cycle with an odd step cannot strand an entity on a
        // reused colour, even if all the bounded perceptual candidates collide.
        if (!fill) for (let step = 0; step < 16777216; step++) {
            const candidate = '#' + ((seed + Math.imul(step, 104729)) & 0xffffff).toString(16).padStart(6, '0');
            if (!usedFill.has(candidate)) { fill = candidate; break; }
        }
        let outline = outlineFor(fill);
        if (usedOutline.has(outline)) {
            const base = rgb(outline);
            for (let step = 1; step < 65536; step++) {
                const candidate = hex([base[0], 128 + ((base[1] - 128 + step) & 127), 128 + ((base[2] - 128 + (step >>> 7)) & 127)]);
                if (!usedOutline.has(candidate) && readableOutline(candidate)) { outline = candidate; break; }
            }
        }
        if (usedOutline.has(outline)) for (let step = 0; step < 16777216; step++) {
            const candidate = '#' + ((seed + Math.imul(step, 104729)) & 0xffffff).toString(16).padStart(6, '0');
            if (!usedOutline.has(candidate) && readableOutline(candidate)) { outline = candidate; break; }
        }
        usedFill.add(fill); usedOutline.add(outline); labs.push(oklab(fill)); result.set(entity.key, Object.freeze({ fill, outline }));
    }
    return new Map([...result].sort(([a], [b]) => compare(a, b)));
}

/** Only observed sovereignty is ownership evidence; atlas faction metadata is
 * intentionally not consulted. Owner dots and bloc fills share this one roster. */
export function territoryColourEntities(sovereignty, groups = []) {
    const entities = new Map();
    for (const row of sovereignty || []) {
        const alliance = Number(row?.alliance_id), faction = Number(row?.faction_id), corporation = Number(row?.corporation_id);
        const kind = alliance > 0 ? 'a' : faction > 0 ? 'f' : corporation > 0 ? 'c' : null, id = kind === 'a' ? alliance : kind === 'f' ? faction : corporation;
        if (!kind || !Number.isSafeInteger(id)) continue;
        const key = kind + id;
        entities.set(key, { key, ...(kind === 'f' ? { factionId: faction } : {}) });
    }
    for (const group of groups || []) {
        if (!group?.id || !['configured', 'inferred'].includes(group.source)) continue;
        const key = 'bloc:' + group.id;
        entities.set(key, { key, ...(group.source === 'configured' ? { preferredColor: group.configured_color || group.color, priority: 10 } : {}) });
    }
    return [...entities.values()];
}

/** Configuration validation shares exactly the same reservations as the map. */
export function configuredTerritoryColourConflict(colour, blocs, excludingId = null) {
    if (!validHex(colour)) return 'Choose a six-digit hex colour.';
    const normalizedColour = colour.toLowerCase();
    const faction = Object.values(FACTION_TERRITORY_COLOURS).find(value => value.fill === normalizedColour);
    if (faction) return 'This colour is reserved for the ' + faction.name + '. Choose another colour.';
    const other = (blocs || []).find(bloc => bloc.id !== excludingId && String(bloc.color).toLowerCase() === normalizedColour);
    return other ? 'This colour is already used by ' + (other.name || 'another power bloc') + '. Choose a distinct colour.' : null;
}

export function suggestTerritoryColour(key, blocs = []) {
    const entities = (blocs || []).map((bloc, index) => ({ key: 'reserved:' + index, preferredColor: bloc.color, priority: 10 }));
    const target = 'suggestion:' + key;
    return allocateTerritoryColours([...entities, { key: target }]).get(target).fill;
}
