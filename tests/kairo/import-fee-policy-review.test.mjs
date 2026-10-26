import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../server/store.mjs';
import {createMarkets, JITA} from '../../server/markets.mjs';
import {saveHistory, DAY} from '../../server/market-history.mjs';
import {DEFAULT_IMPORT_SETTINGS, tradingRates, scenario, undercut} from '../../server/import-math.mjs';

// CCP made the six-percentage-point skill discount permanent on 2021-07-27:
// https://www.eveonline.com/news/view/the-grand-heist-now-live
// The current broker/tax formula and relisting equation are published at:
// https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax
// https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders
// Expected cash amounts below are independent policy examples, not calculated
// from the returned fee rate; no network or live market state enters these tests.
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6,
    `${label}: expected ${expected}, received ${actual}`);
const npcRates = level => tradingRates({accounting:5, brokerRelations:5,
    advancedBrokerRelations:level, faction:10, corporation:10});
const lot = rates => ({levels:[{price:1000000, volume:100}], quantity:100,
    price:2000000, duration:7, volume:5, daily:100, rates,
    settings:{...DEFAULT_IMPORT_SETTINGS, minProfit:0}, strategy:'profiteering'});

test('trained Advanced Broker Relations discounts actual NPC repricing costs at every level', async t => {
    // 200m sale value, 1% broker: reserve falls 120k ISK per skill level.
    for (const [level, expected] of [1000000, 880000, 760000, 640000, 520000, 400000].entries()) {
        await t.test('level ' + level, () => {
            const quoted = scenario(lot(npcRates(level)));
            near(quoted.relistReserve, expected, 'one downward/same-price repricing reserve');
            near(quoted.salesTax, 6750000, 'seller sales tax');
            near(quoted.brokerFee, 2000000, 'initial broker fee');
            near(quoted.upfront, 102000000, 'initial capital excludes future repricing');
            near(quoted.net, 91250000 - expected, 'full-sale net return');
        });
    }
});

test('maximum relist training reaches the first non-loss-making tick under the current NPC fee policy', () => {
    const input = lot(npcRates(5)), quoted = scenario(input);
    assert.equal(quoted.breakEven, 1048000);
    assert.ok(scenario({...input, price:1048000}).net >= 0);
    assert.ok(scenario({...input, price:undercut(1048000)}).net < 0);
});

test('structure relisting uses the same trained discount without reducing its entered broker rate', () => {
    const rates = tradingRates({accounting:5, brokerRelations:5, advancedBrokerRelations:5,
        faction:10, corporation:10, kind:'structure', structureBroker:2.5});
    const quoted = scenario(lot(rates));
    near(quoted.brokerFee, 5000000, 'entered total structure broker fee');
    near(quoted.relistReserve, 1000000, '80% discount on structure repricing');
    near(quoted.net, 87250000, 'structure full-sale net');
});

test('fee minima and a zero-repricing plan retain their established meaning', () => {
    const input = lot(npcRates(5));
    const small = scenario({...input, levels:[{price:100, volume:20}], quantity:20, price:250});
    assert.equal(small.brokerFee, 100);
    assert.equal(small.relistReserve, 100);
    for (const level of [0, 5]) {
        const quoted = scenario({...lot(npcRates(level)), settings:{...input.settings, relistCount:0}});
        assert.equal(quoted.relistReserve, 0);
        near(quoted.net, 91250000, 'no-repricing net');
    }
});

test('real import quotes and saved plans apply the current trained fee while retained snapshots remain historical', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'kairo-fee-policy-')), store = openStore(dir);
    const now = Date.parse('2026-10-17T12:00:00.000Z'), iso = at => new Date(at).toISOString();
    const hub = 60008494, id = 1403, scopes = ['esi-skills.read_skills.v1',
        'esi-characters.read_standings.v1', 'esi-markets.read_character_orders.v1'];
    const auth = {characters:() => [{id:42, name:'Fee policy trader', scopes}]};
    let requests = 0;
    const markets = createMarkets(store, auth, {request() { requests++; throw new Error('Quote must remain local.'); }},
        {now:() => now, historySource:'esi'});
    t.after(async () => { await markets.close(); store.close(); await rm(dir, {recursive:true, force:true}); });
    const sample = data => ({status:'ready', updatedAt:iso(now), expiresAt:iso(now + DAY), data});
    store.saveSnapshot(42, 'skills', sample({skills:[
        {skill_id:16622, active_skill_level:5}, {skill_id:3446, active_skill_level:5},
        {skill_id:16597, active_skill_level:5}]}));
    store.saveSnapshot(42, 'standings', sample([{from_id:500003, from_type:'faction', standing:10},
        {from_id:1000084, from_type:'npc_corp', standing:10}]));
    store.saveSnapshot(42, 'orders', sample([]));
    store.set('market:owner:' + hub, {corporationId:1000084, factionId:500003,
        corporationName:'Fixture owner', expires:now + DAY});
    markets.imports.saveSettings(hub, {...DEFAULT_IMPORT_SETTINGS, characterId:42, minProfit:0});
    store.db.prepare('INSERT INTO market_types(type_id,name) VALUES(?,?)').run(id, 'Fixture import module');
    for (const [location, price, quantity] of [[JITA, 1000000, 100], [hub, 3000000, 5]]) {
        store.db.prepare('INSERT INTO market_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(location,
            id, 500000, price, price, quantity, 0, 1, 0, iso(now), iso(now + DAY), 'fixture');
        store.db.prepare('INSERT INTO market_orders VALUES(?,?,?,?,?,?,?,?,?,?)').run(location,
            id, id, 0, price, quantity, 1, 'station', iso(now - DAY), 90);
    }
    saveHistory(store, 10000043, id, Array.from({length:30}, (_, day) => ({
        date:iso(now - (day + 1) * DAY).slice(0, 10), average:1800000, lowest:1600000,
        highest:2000000, volume:500, order_count:20})), iso(now), iso(now + DAY), 'ESI', now);
    const line = {typeId:id, strategy:'profiteering', quantity:100, price:2000000, duration:7};
    // Retained plans are quotes, not live projections: the fee correction must
    // leave an older saved snapshot byte-for-byte intact until explicit resave.
    const historical = {id:'legacy-fee-plan', name:'Prior saved quote', hubId:hub,
        lines:[{typeId:id, relistReserve:500000}], totals:{relistReserve:500000},
        feeProfile:{rates:{relistDiscount:.75}}};
    const body = JSON.stringify(historical);
    store.db.prepare('INSERT INTO market_import_plans VALUES(?,?,?,?)').run(historical.id, hub, iso(now - DAY), body);
    const quoted = await markets.imports.quote(hub, line);
    near(quoted.relistReserve, 400000, 'real service quote reserve');
    const saved = await markets.imports.savePlan(hub, {name:'Current fee plan', lines:[line]});
    near(saved.totals.relistReserve, 400000, 'saved plan reserve');
    near(saved.totals.net, 90850000, 'saved plan net');
    near(saved.feeProfile.rates.relistDiscount, .8, 'saved fee profile');
    assert.equal(store.db.prepare('SELECT body FROM market_import_plans WHERE id=?').get(historical.id).body, body);
    assert.equal(markets.imports.getPlan(hub, historical.id).totals.relistReserve, 500000);
    assert.equal(requests, 0, 'Quotes/saves do not add market or character requests');
});
