// External synthetic workloads; no installed user's data is read.
import {createHash} from 'node:crypto';
export const AT = Date.parse('2026-10-03T00:00:00Z');
export const JITA = 60003760;
export const MARKET_ITEMS = Array.from({length: 512}, (_, i) => ({type_id: 34 + i * 13}));
export const TYPE_IDS = [34, 35, 36, 37, 38, 39, 40, 222, 587, 620, 2488, 3300, 11295, 11399, 16275, 17888, 28646, 29668, 30303, 44992, 999999999];
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function seedMarket(store) {
    const at = new Date(AT).toISOString();
    const insert = store.db.prepare('INSERT OR REPLACE INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    store.db.exec('BEGIN IMMEDIATE');
    try {
        for (const row of MARKET_ITEMS) insert.run(JITA, row.type_id, 90, 100, 100, 1000, 500, 10, 5, at, at, 'startup-fixture');
        store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
export const taxonomyOperation = index => ({overview: index.overview(MARKET_ITEMS), types: TYPE_IDS.map(id => index.type(id))});
export function intelWorkload(atlas) {
    const names = atlas.systems.map(system => system.name).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const inputs = [
        {text: 'UALX-3 5 neuts on gate'}, {text: '1DQ1-A hostile camp'}, {text: 'New Caldari clear'},
        {text: 'Jita clear?'}, {text: 'Amarr not clear'}, {text: 'Thera hostile'},
        {text: 'Turnur clear of hostiles'}, {text: 'J123 2 neuts'},
        {source: 'chat_log', channel: 'Intel', text: '[ 2026.10.03 00:00:00 ] Scout > UALX-3 5 neuts moving to C-J6MT'},
        {source: 'game_log', text: '[ 2026.10.03 00:00:00 ] (combat) Scourge hits you in Jita'},
        {source: 'game_log', text: '[ 2026.10.03 00:00:00 ] (notify) Your ship was decloaked by a Mobile Observatory'},
        {source: 'manual', text: 'Unknown-system alpha ?'},
    ];
    for (let i = 0; i < 48; i++) {
        const name = names[Math.floor(i * names.length / 48)];
        inputs.push({text: `${name} ${i % 3 === 0 ? 'clear' : i % 3 === 1 ? '3 hostile ships' : 'camp?'}`});
    }
    for (let i = 0; i < 24; i++) {
        const name = names[Math.floor((i + .5) * names.length / 24)];
        inputs.push({text: `${name.slice(0, 3 + i % 3)} 2 neuts`});
    }
    return inputs;
}
export function distribution(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const at = quantile => sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
    return {count: samples.length, min: sorted[0], p50: at(.5), p95: at(.95), max: sorted.at(-1), samples};
}
