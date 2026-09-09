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
export function upgradeProtectionRules(input = {}) {
    const rules = {};
    for (const state of protectionStates) {
        const fallback = state === 'highsec' ? (input.safe ?? input.unknown) : input.unknown;
        rules[state] = structuredClone(Array.isArray(input[state]) ? input[state] : ['lowsec', 'neutral', 'highsec', 'triglavian', 'anoikis'].includes(state) && Array.isArray(fallback) ? fallback : []);
    }
    return rules;
}
