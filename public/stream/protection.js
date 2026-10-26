// Shared by the local core, dashboard and OBS browser source.
export const spaceStates = ['blue', 'hostile', 'lowsec', 'neutral', 'highsec', 'triglavian', 'anoikis', 'unknown'];
export const protectionStates = [...spaceStates, 'fw', 'manual'];
export const protectionLabels = {
    blue: 'Blue', hostile: 'Hostile', lowsec: 'Low-Sec', neutral: 'Neutral', highsec: 'High-Sec',
    triglavian: 'Triglavian Space', anoikis: 'Anoikis', unknown: 'Unknown', fw: 'Faction Warfare', manual: 'Manual',
};
export const protectionLabel = state => protectionLabels[state === 'safe' ? 'highsec' : state] || 'Unknown';

// Existing Safe actions become High-Sec actions. States previously reported as
// Unknown inherit its rules once, so upgrading cannot silently drop protection.
/**
 * Normalize legacy saved action maps into fresh per-state arrays. Explicit empty
 * arrays remain intentional; missing newly split states inherit Unknown (High-Sec
 * can inherit Safe first). Cloning prevents editing one state's inherited rules
 * from changing another. This helper does not classify space or execute actions.
 * See ../../docs/STREAMING.md for migration and OBS ordering.
 */
export function upgradeProtectionRules(input = {}) {
    const rules = {};
    for (const state of protectionStates) {
        const fallback = state === 'highsec' ? (input.safe ?? input.unknown) : input.unknown;
        rules[state] = structuredClone(Array.isArray(input[state]) ? input[state] : ['lowsec', 'neutral', 'highsec', 'triglavian', 'anoikis'].includes(state) && Array.isArray(fallback) ? fallback : []);
    }
    return rules;
}
