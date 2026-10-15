import { pollIntervals } from '../polling.mjs';
const module = (id, name, description, datasets) => ({ id, name, version: '1.0.0', description, datasets, scopes: [...new Set(datasets.map(d => d.scope).filter(Boolean))] });
const d = (key, route, scope, ttl = 300, paged = false) => ({ key, route, scope, ttl, paged, pollInterval: pollIntervals[key] ?? 0 });
export const catalog = [
    module('pilot', 'Pilot telemetry', 'Live location, current hull, online status and your local flight history.', [
        d('profile', '/characters/{id}', null, 3600), d('location', '/characters/{id}/location', 'esi-location.read_location.v1', 5), d('ship', '/characters/{id}/ship', 'esi-location.read_ship_type.v1', 5), d('online', '/characters/{id}/online', 'esi-location.read_online.v1', 60)
    ]),
    module('training', 'Training & clones', 'Skill queue, trained skills, attributes, implants and jump clones.', [
        d('skills', '/characters/{id}/skills', 'esi-skills.read_skills.v1', 120), d('queue', '/characters/{id}/skillqueue', 'esi-skills.read_skillqueue.v1', 60), d('attributes', '/characters/{id}/attributes', 'esi-skills.read_skills.v1', 300), d('clones', '/characters/{id}/clones', 'esi-clones.read_clones.v1', 300), d('implants', '/characters/{id}/implants', 'esi-clones.read_implants.v1', 300)
    ]),
    module('wallet', 'Wallet & trade', 'Balance, journal, recent transactions and open market orders.', [
        d('wallet', '/characters/{id}/wallet', 'esi-wallet.read_character_wallet.v1', 120), d('journal', '/characters/{id}/wallet/journal', 'esi-wallet.read_character_wallet.v1', 300, true), d('transactions', '/characters/{id}/wallet/transactions', 'esi-wallet.read_character_wallet.v1', 300), d('orders', '/characters/{id}/orders', 'esi-markets.read_character_orders.v1', 300)
    ]),
    module('markets', 'Market intelligence', 'On-demand hub scans, shared alt access, cached order books and regional market reports.', []),
    module('hangar', 'Hangar & fittings', 'Search assets, inspect saved fittings and review contracts.', [
        d('assets', '/characters/{id}/assets', 'esi-assets.read_assets.v1', 3600, true), d('fittings', '/characters/{id}/fittings', 'esi-fittings.read_fittings.v1', 300), d('contracts', '/characters/{id}/contracts', 'esi-contracts.read_character_contracts.v1', 300, true)
    ]),
    module('industry', 'Industry & resources', 'Manufacturing and research jobs, blueprints, mining and planetary colonies.', [
        d('jobs', '/characters/{id}/industry/jobs?include_completed=true', 'esi-industry.read_character_jobs.v1', 300), d('blueprints', '/characters/{id}/blueprints', 'esi-characters.read_blueprints.v1', 3600, true), d('mining', '/characters/{id}/mining', 'esi-industry.read_character_mining.v1', 600, true), d('planets', '/characters/{id}/planets', 'esi-planets.manage_planets.v1', 600)
    ]),
    module('combat', 'Combat record', 'ESI killmails and public zKillboard participation, losses, NPC standings and loyalty points.', [
        d('killmails', '/characters/{id}/killmails/recent', 'esi-killmails.read_killmails.v1', 300, true), d('standings', '/characters/{id}/standings', 'esi-characters.read_standings.v1', 3600), d('loyalty', '/characters/{id}/loyalty/points', 'esi-characters.read_loyalty.v1', 3600)
    ]),
    module('opsec', 'OPSEC context', 'Personal, corporation and alliance standings, sovereignty and space classification.', [
        d('contacts', '/characters/{id}/contacts', 'esi-characters.read_contacts.v1', 300, true),
        { ...d('corporation_contacts', '/corporations/{owner}/contacts', 'esi-corporations.read_contacts.v1', 300, true), owner: 'corporation_id' },
        { ...d('alliance_contacts', '/alliances/{owner}/contacts', 'esi-alliances.read_contacts.v1', 300, true), owner: 'alliance_id' }
    ]),
    module('comms', 'Calendar & notifications', 'Upcoming events, EVE notifications and mail headers. Mail bodies stay out of stream output.', [
        d('calendar', '/characters/{id}/calendar', 'esi-calendar.read_calendar_events.v1', 300), d('notifications', '/characters/{id}/notifications', 'esi-characters.read_notifications.v1', 300), d('mail', '/characters/{id}/mail', 'esi-mail.read_mail.v1', 300)
    ]),
    module('universe', 'Universe', 'Local New Eden atlas, flight history, route planning, sovereignty, structures, standings and activity.', [
        d('status', '/status', null, 60), d('prices', '/markets/prices', null, 3600), d('sovereignty', '/sovereignty/systems', null, 300), d('fw', '/fw/systems', null, 600), d('kills', '/universe/system_kills', null, 600), d('jumps', '/universe/system_jumps', null, 600), d('sovereignty_campaigns', '/sovereignty/campaigns', null, 5), d('incursions', '/incursions', null, 300), d('industry_systems', '/industry/systems', null, 3600)
    ]),
];
// Optional structure visibility resolves authorized asset, market and map locations.
catalog.find(m => m.id === 'hangar').scopes.push('esi-universe.read_structures.v1');
catalog.find(m => m.id === 'markets').scopes.push('esi-markets.structure_markets.v1','esi-universe.read_structures.v1','esi-location.read_location.v1');
catalog.find(m => m.id === 'universe').scopes.push('esi-universe.read_structures.v1', 'esi-fleets.read_fleet.v1', 'esi-ui.write_waypoint.v1', 'esi-search.search_structures.v1');
export const allScopes = [...new Set(catalog.flatMap(m => m.scopes))];
