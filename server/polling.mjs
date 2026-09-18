// Application polling policy, in seconds. HTTP cache expiry remains a hard
// lower bound. Zero keeps the ESI cadence for protection evidence.
export const pollIntervals = Object.freeze({
    profile: 0, location: 5, ship: 60, online: 60,
    skills: 600, queue: 60, attributes: 3600, clones: 900, implants: 900,
    wallet: 120, journal: 300, transactions: 300, orders: 1200,
    assets: 3600, fittings: 1800, contracts: 600,
    jobs: 300, blueprints: 3600, mining: 600, planets: 1800,
    killmails: 300, standings: 3600, loyalty: 3600,
    contacts: 0, corporation_contacts: 0, alliance_contacts: 0,
    calendar: 900, notifications: 600, mail: 300,
    status: 60, prices: 3600, sovereignty: 0, fw: 0, kills: 3600, jumps: 3600, sovereignty_structures: 600, incursions: 300, industry_systems: 3600,
});

const b = (label, choices, description) => ({ label, choices, description });
export const pollingBatches = Object.freeze({
    profile: b('Pilot & membership', [0, 3600, 21600, 86400], 'Your character profile, corporation and alliance. Supplies pilot details and the membership behind standing checks.'),
    location: b('Location & system context', [5, 10, 15], 'Tracks systems, docking and undocking for Universe and OPSEC. Slower checks can miss short visits. Kept below the 30-second protection freshness limit.'),
    ship: b('Current ship', [30, 60, 120, 300, 600], 'Updates your hull, ship-change events and linked stream widgets. Docking, undocking and logging in can bring a check forward.'),
    online: b('Online status', [60, 120, 300, 600], 'Checks whether your pilot is online and updates login statistics. Also helps detect when to check your ship again.'),
    skills: b('Trained skills', [60, 300, 600, 1800, 3600], 'Refreshes trained levels and skill points for pilot details, session reports and skill goals. A known completion can bring a check forward.'),
    queue: b('Skill queue', [60, 120, 300, 600, 900], 'Picks up reordered, added, removed and paused skills. Powers training countdowns and skill goals. Regular checks continue regardless of the current skill’s finish time.'),
    attributes: b('Attributes', [300, 900, 1800, 3600, 21600], 'Updates intelligence, perception and other attributes after remaps or changes to your character.'),
    clones: b('Jump clones', [120, 300, 900, 1800, 3600], 'Refreshes clone locations, names and installed implants in the pilot page.'),
    implants: b('Active implants', [120, 300, 900, 1800, 3600], 'Updates implants in your current clone after installing implants or changing clones.'),
    wallet: b('Wallet balance', [120, 300, 600, 1800], 'Updates your ISK balance, wallet goals, session balance samples and wallet stream widgets.'),
    journal: b('Wallet journal', [300, 600, 1800, 3600], 'Collects wallet entries across every page. Feeds income goals, activity and session income and expense totals.'),
    transactions: b('Market transactions', [300, 600, 1800, 3600], 'Refreshes recent item purchases and sales shown in Wallet & trade.'),
    orders: b('Your market orders', [1200, 1800, 3600, 7200], 'Refreshes your open buy and sell orders. This is your character’s order list; trade-hub books are scanned separately.'),
    assets: b('Assets & locations', [3600, 7200, 21600, 43200], 'Collects every asset page and resolves storage locations. Powers hangar search, item quantities and collection goals.'),
    fittings: b('Saved fittings', [300, 900, 1800, 3600, 21600], 'Refreshes your saved ship fittings. Frequent checks are useful while actively editing fits.'),
    contracts: b('Contracts', [300, 600, 1800, 3600], 'Collects your character’s contract list, including status changes, across all available pages.'),
    jobs: b('Industry jobs', [300, 600, 1800, 3600], 'Refreshes manufacturing and research jobs. Feeds completion events, session reports, manufacturing goals and industry widgets.'),
    blueprints: b('Blueprints', [3600, 7200, 21600, 43200], 'Collects your blueprint inventory, research levels and remaining runs across all pages.'),
    mining: b('Mining ledger', [600, 1800, 3600, 21600], 'Refreshes EVE’s daily mining totals by item and system. Mining goals follow newly reported quantities.'),
    planets: b('Planetary colonies', [600, 1800, 3600, 21600], 'Refreshes your colony list and the detailed pins and routes for each planet. A batch includes one detail request per colony.'),
    killmails: b('ESI killmail references', [300, 600, 1800, 3600], 'Collects your ESI killmail pages and verifies new records. Feeds combat history, session reports, goals and toasts. Public participation collection has its own cache.'),
    standings: b('NPC standings', [3600, 7200, 21600, 86400], 'Refreshes NPC faction, corporation and agent standings in your combat record. OPSEC uses the separate contact lists.'),
    loyalty: b('Loyalty points', [3600, 7200, 21600, 86400], 'Updates your loyalty-point balances with NPC corporations.'),
    contacts: b('Personal contacts', [0, 300, 600, 1800, 3600], 'Collects your personal standings across all contact pages so OPSEC can classify friendly, hostile and neutral sovereignty.'),
    corporation_contacts: b('Corporation contacts', [0, 300, 600, 1800, 3600], 'Collects contact standings for your current corporation when your character has access. Supplies another source of OPSEC standings.'),
    alliance_contacts: b('Alliance contacts', [0, 300, 600, 1800, 3600], 'Collects contact standings for your current alliance when available. Includes Good and Excellent standing for Blue space.'),
    calendar: b('Calendar', [60, 300, 900, 1800, 3600], 'Refreshes upcoming calendar entries and your event responses on the pilot page.'),
    notifications: b('EVE notifications', [600, 1800, 3600, 7200], 'Refreshes the in-game notification inbox shown in Kairo. Stream toasts follow their source modules’ events.'),
    mail: b('Mail headers', [60, 300, 600, 1800, 3600], 'Updates mail subjects, senders and read status. Mail bodies are not fetched or sent to the stream.'),
    status: b('Tranquility status', [30, 60, 120, 300, 600], 'Updates the server’s availability and online player count. Shared across every pilot.'),
    prices: b('Market price estimates', [3600, 7200, 21600, 86400], 'Refreshes public reference prices used for estimates. Live hub orders and regional history belong to manual market scans.'),
    sovereignty: b('Sovereignty & holder names', [0, 300, 600, 1800, 3600], 'Refreshes system sovereignty and resolves holder names for System intelligence and OPSEC. One shared collection serves all pilots.'),
    fw: b('Faction warfare context', [0, 1800, 3600, 7200], 'Refreshes warzone systems used by System intelligence and the faction-warfare protection override. Shared across pilots.'),
    kills: b('System kill statistics', [3600, 7200, 21600], 'Refreshes public ship, pod and NPC kill counts in System intelligence. ESI reports a cached window, rather than live combat.'),
    sovereignty_structures: b('Sovereignty structures', [300, 600, 1800, 3600], 'Refreshes public sovereignty structures and vulnerability windows for Universe. This is not a complete list of player structures.'),
    incursions: b('Incursions', [300, 600, 1800, 3600], 'Refreshes public incursion systems, influence and staging information for Universe.'),
    industry_systems: b('Industry cost indices', [3600, 7200, 21600], 'Refreshes shared system industry cost indices. Your own mining activity uses the separate mining ledger.'),
    jumps: b('System traffic', [3600, 7200, 21600], 'Refreshes public gate-jump counts for System intelligence. Your own travel history uses the separate location checks.'),
});

export function pollingValues(saved = {}) {
    return Object.fromEntries(Object.entries(pollIntervals).map(([key, recommended]) => [key,
        pollingBatches[key].choices.includes(saved?.[key]) ? saved[key] : recommended]));
}

export function validatePolling(input) {
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Provide polling intervals by data batch.');
    for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(pollingBatches, key) || !pollingBatches[key].choices.includes(value))
            throw new Error('Choose one of the supported polling intervals for ' + key + '.');
    }
    return pollingValues(input);
}

export function refreshDeadline(dataset, sample, queue, now = Date.now()) {
    const observed = Date.parse(sample.updatedAt);
    let due = (Number.isFinite(observed) ? observed : now) + (dataset.pollInterval || 0) * 1000;
    // Check near known training completions, including ones that fell while
    // Kairo was closed. Never infer new observation times from cache reads.
    if (['skills', 'queue'].includes(dataset.key) && Array.isArray(queue)) {
        for (const skill of queue) {
            const finish = Date.parse(skill.finish_date);
            if (finish > observed) due = Math.min(due, finish + 1000);
        }
    }
    return Math.max(Number.isFinite(Date.parse(sample.expiresAt)) ? Date.parse(sample.expiresAt) : now, due);
}

// A scheduled local sample stays usable between polls. ESI expiry and the
// original observation time are retained separately for OPSEC and provenance.
export function snapshotFresh(sample, now = Date.now()) {
    const until = sample?.refreshAt ?? sample?.expiresAt;
    return sample?.status === 'ready' && (!until || Date.parse(until) > now);
}
