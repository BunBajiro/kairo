import { createUniverse } from './universe.mjs';
import { registerUniverseHistory } from './universe-history.mjs';
import { getUniverseSystem } from './universe-static.mjs';
import { normalizeSovereignty, sovereigntyStructures } from './universe-sovereignty.mjs';
import { catalog } from './modules/catalog.mjs';
import { createBus } from './bus.mjs';
import { createRegistry } from './registry.mjs';
import { createStream } from './stream.mjs';
import { createProtectionTracker } from './opsec.mjs';
import {rememberSystem} from './places.mjs';
import {bindingProjection} from './projections.mjs';
import {createOBS} from './obs.mjs';
import {createCombat} from './combat.mjs';
import {createSessionCombat} from './session-combat.mjs';
import {reconcileSessionLoyalty} from './session-details.mjs';
import {createMarkets} from './markets.mjs';
import {createGoals} from './goals.mjs';
import {refreshDeadline, snapshotFresh, pollingValues, pollingBatches, validatePolling} from './polling.mjs';
export async function createCore(store, auth, esi, moduleDir, options={}) {
    const bus = createBus(), uiClients = new Set();
    let stopped = false;
    const syncing = new Map(), datasetSync = new Map(), nextRun = new Map(), requested = new Set(), namesMap = store.get('names', {});
    const protectionKeys = new Set(['location', 'fw', 'sovereignty', 'profile', 'contacts', 'corporation_contacts', 'alliance_contacts']);
    const datasets = new Map(catalog.flatMap(module => module.datasets.map(dataset => [dataset.key, {module, dataset}])));
    let polling = pollingValues(store.get('esi:polling', {}));
    const protection = createProtectionTracker();
    function send(type, data) { for (const c of uiClients) {
        if (c.destroyed || c.writableLength > 1000000) {
            c.destroy();
            uiClients.delete(c);
        }
        else
            c.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n');
    } }
    function publish(e) { const at = e.at || new Date().toISOString(); const result = store.db.prepare('INSERT OR IGNORE INTO events(character_id,type,module,summary,payload,at,dedupe) VALUES(?,?,?,?,?,?,?)').run(e.characterId || null, e.type, e.module || 'core', e.summary || e.type, JSON.stringify(e.payload || {}), at, e.dedupe || null); if (result.changes) {
        bus.emit({ ...e, at });
        send('changed', { characterId: e.characterId });
    } }
    const universe = createUniverse(store, auth, esi, {...options.universe, noSync: options.noSync,
        publish, onChange: characterId => send('universe', {characterId: characterId || 0})});
    const stopUniverseHistory = registerUniverseHistory({store, bus, esi, publish});
    const registry = await createRegistry(moduleDir, { store, db: store.db, bus, esi, publish });
    const stream=createStream(store,bus,publish);
    const obs=createOBS(store,options.vault,{...options.obs,onChange:status=>send('obs',status)});
    const goals=createGoals(store,auth,publish);
    const markets=createMarkets(store,auth,esi,{autoUpgrade:!options.noSync,...options.markets,refreshCharacter:async(id,keys)=>{
        const c=auth.characters().find(c=>c.id===id);if(!c||c.needsReauth)return;
        const tasks=[];for(const m of catalog)if(enabled(m))for(const d of m.datasets)if(keys.includes(d.key)&&(!d.scope||c.scopes.includes(d.scope))){requested.add(id+':'+d.key);tasks.push(syncDataset(c,m,d));}
        await Promise.allSettled(tasks);
    }});
    const combat=createCombat(store,auth,esi,{publish,resolveNames,fetcher:options.combatFetcher,onChange:id=>{
        goals.refresh(id,'killmails');updateBindings();
        send('snapshot',{characterId:id,key:'killmails',snapshot:combatSnapshot(id),names:namesMap});
    }});
    const sessionCombat=createSessionCombat(store,auth,esi,combat,{resolveNames,feedFetcher:options.sessionFeedFetcher,onChange:id=>send('changed',{characterId:id})});
    function combatSnapshot(id){const s=store.snapshot(id,'killmails')||{status:'waiting',data:null},records=combat.recent(id);return {...s,data:records.length?records:s.data,participation:combat.coverage(id)};}
    const enabled = m => store.get('module:' + m.id, true);
    const moduleList = () => [...catalog, ...registry.modules].map(m => ({ id: m.id, name: m.name, description: m.description, scopes: m.scopes || [], datasets: (m.datasets || []).map(d => d.key), enabled: enabled(m), version: m.version }));
    function rememberNames(names) {
        let changed = false;
        for (const [id, name] of Object.entries(names)) {
            if (Number.isSafeInteger(Number(id)) && Number(id) > 0 && typeof name === 'string' && name && namesMap[id] !== name) {
                namesMap[id] = name; changed = true;
            }
        }
        if (changed) store.set('names', namesMap);
    }
    async function resolveNames(data, priority = false) { const ids = []; function walk(x) { if (Array.isArray(x)) {
        x.forEach(walk);
    }
    else if (x && typeof x === 'object') {
        for (const [k, v] of Object.entries(x)) {
            if (/^(type_id|skill_id|ship_type_id|solar_system_id|system_id|corporation_id|alliance_id|faction_id|product_type_id|blueprint_type_id|from_id|issuer_id|issuer_corporation_id|client_id)$/.test(k) && typeof v === 'number' && !namesMap[v])
                ids.push(v);
            else if (typeof v === 'object')
                walk(v);
        }
    } } walk(data); if (ids.length) {
        rememberNames(await esi.names(ids, { priority }));
    } }
    async function enrich(key, data, id) {
        if (key === 'sovereignty') return normalizeSovereignty(data);
        if (key === 'location' && data.solar_system_id) {
            // Instanced space may not expose system details. Keep the observed ID
            // so documented Abyssal / Anoikis ID ranges can still be classified.
            const local = getUniverseSystem(data.solar_system_id,{celestials:false});
            if (local) {
                const constellation = local.constellation, region = local.region;
                const system = {...local, security_status: local.security, position: {x:local.x,y:local.y,z:local.z}};
                rememberSystem(store, system, constellation, region);
                rememberNames({[system.system_id]:system.name,[system.constellation_id]:constellation?.name,[system.region_id]:region?.name});
                return {...data, system, constellation, region};
            }
            let system;
            try { system = await esi.request('/universe/systems/' + data.solar_system_id, { ttl: 86400, priority: true }); }
            catch (error) {
                if (data.solar_system_id >= 31000000 && data.solar_system_id <= 32999999) return data;
                throw error;
            }
            let constellation, region;
            try {
                const c = await esi.request('/universe/constellations/' + system.data.constellation_id, { ttl: 86400, priority: true });
                constellation = c.data;
                region = (await esi.request('/universe/regions/' + constellation.region_id, { ttl: 86400, priority: true })).data;
            }
            catch { }
            system.data.system_id=data.solar_system_id;rememberSystem(store,system.data,constellation,region);
            rememberNames({ [data.solar_system_id]: system.data.name, [system.data.constellation_id]: constellation?.name, [constellation?.region_id]: region?.name });
            return { ...data, system: system.data, constellation, region };
        }
        if (key === 'profile') {
            let corporation, alliance;
            try {
                corporation = (await esi.request('/corporations/' + data.corporation_id, { ttl: 3600 })).data;
                if (data.alliance_id)
                    alliance = (await esi.request('/alliances/' + data.alliance_id, { ttl: 3600 })).data;
            }
            catch { }
            rememberNames({ [data.corporation_id]: corporation?.name, [data.alliance_id]: alliance?.name });
            return { ...data, corporation, alliance };
        }
        if (key === 'assets') {
            const entries = new Map(data.map(a => [a.item_id, a]));
            const rootLocation = a => { let location = a.location_id; const seen = new Set(); while (entries.has(location) && !seen.has(location)) {
                seen.add(location);
                location = entries.get(location).location_id;
            } return location; };
            const locations = [...new Set(data.map(rootLocation))];
            const canReadStructures = auth.characters().find(c => c.id === id)?.scopes.includes('esi-universe.read_structures.v1');
            rememberNames(await esi.names(locations.filter(x => x < 2147483647 && !namesMap[x])));
            for (const location of locations) {
                if (namesMap[location])
                    continue;
                try {
                    if (location >= 60000000 && location < 64000000) {
                        const r = await esi.request('/universe/stations/' + location, { ttl: 86400 });
                        rememberNames({ [location]: r.data.name });
                    }
                    else if (location >= 1000000000000 && canReadStructures) {
                        const r = await esi.request('/universe/structures/' + location, { characterId: id, ttl: 3600 });
                        rememberNames({ [location]: r.data.name });
                    }
                }
                catch { }
            }
            return data.map(a => ({ ...a, root_location_id: rootLocation(a), location_name: namesMap[rootLocation(a)] || String(rootLocation(a)) }));
        }
        if (key === 'killmails') {
            await combat.ingest(id,data,'esi');
            return combat.recent(id);
        }
        if (key === 'planets') {
            const planets = [];
            for (const p of data) {
                try {
                    const detail = await esi.request('/characters/' + id + '/planets/' + p.planet_id, { characterId: id, ttl: 600 });
                    planets.push({ ...p, details: detail.data });
                }
                catch {
                    planets.push(p);
                }
            }
            return planets;
        }
        return data;
    }
    function syncDataset(character, m, d) {
        if (stopped) return;
        const key = (character?.id || 0) + ':' + d.key;
        if (datasetSync.has(key)) return datasetSync.get(key);
        const task = runDataset(character, m, d).finally(() => {
            datasetSync.delete(key);
            if (!stopped && protectionKeys.has(d.key)) refreshOPSEC();
        });
        datasetSync.set(key, task);
        return task;
    }
    async function runDataset(character, m, d) {
        const id = character?.id || 0;
        if (!enabled(m) || character?.needsReauth)
            return;
        const metadata = store.snapshotMetadata(id, d.key);
        if (d.scope && !character?.scopes.includes(d.scope)) {
            if (metadata?.status !== 'missing_scope' || metadata.scope !== d.scope)
                store.saveSnapshot(id, d.key, { status: 'missing_scope', data: null, scope: d.scope });
            return;
        }
        const key = id + ':' + d.key;
        let ownerId;
        if (d.owner) {
            const pilot = catalog.find(m => m.id === 'pilot');
            await syncDataset(character, pilot, pilot.datasets.find(d => d.key === 'profile'));
            const profile = store.snapshot(id, 'profile');
            if (!enabled(pilot) || profile?.status !== 'ready') {
                store.saveSnapshot(id, d.key, { status: 'waiting', data: null, error: 'Waiting for current corporation and alliance membership.' });
                return;
            }
            ownerId = profile.data?.[d.owner];
            if (!ownerId) {
                store.saveSnapshot(id, d.key, { status: 'not_applicable', data: [], ownerId: null });
                return;
            }
            if (metadata?.ownerId !== ownerId) { nextRun.delete(key); requested.add(key); }
        }
        const forced = requested.delete(key);
        // Restore schedules from durable samples after a restart. Scope and
        // organization checks above must always precede reuse.
        let scheduled = nextRun.get(key) ?? (metadata?.status === 'ready' ? Date.parse(metadata.refreshAt) : Date.parse(metadata?.retryAt));
        if (protectionEvidence(d.key, id) && metadata?.status === 'ready') scheduled = Math.min(scheduled, Date.parse(metadata.expiresAt));
        if (!forced && scheduled > Date.now())
            return;
        const prior = store.snapshot(id, d.key);
        nextRun.set(key, Date.now() + 60000);
        try {
            const options = { characterId: d.scope ? id : 0, ttl: d.ttl, priority: protectionKeys.has(d.key) };
            const r = await (d.paged ? esi.paged : esi.request)(d.route.replaceAll('{id}', id).replaceAll('{owner}', ownerId), options);
            const data = await enrich(d.key, r.data, id);
            if (d.key === 'sovereignty') await resolveNames(data.map(s => ({ alliance_id: s.alliance_id, corporation_id: s.corporation_id, faction_id: s.faction_id })), true);
            else if (!['prices', 'kills', 'jumps', 'fw', 'contacts', 'corporation_contacts', 'alliance_contacts', 'industry_systems'].includes(d.key))
                await resolveNames(data, protectionKeys.has(d.key));
            const snapshot = { ...r, data, status: r.stale ? 'stale' : 'ready', ...(d.owner ? { ownerId } : {}) };
            snapshot.sourceModifiedAt = r.headers?.['last-modified'] || null;
            if (!r.stale) snapshot.refreshAt = new Date(refreshDeadline(pollingPolicy(d, id), r, d.key === 'queue' ? data : store.snapshot(id, 'queue')?.data)).toISOString();
            delete snapshot.headers;
            store.saveSnapshot(id, d.key, snapshot);
            if (d.key === 'kills') universe.feeds.observeNpc();
            if (d.key === 'sovereignty' && Array.isArray(r.data?.solar_systems))
                store.saveSnapshot(0, 'sovereignty_structures', {...snapshot, data: sovereigntyStructures(data), derivedFrom: 'sovereignty'});
            if (d.key === 'location' && !r.stale && store.get('module:universe', true)) universe.observeSelectedLocation(id);
            if(d.key==='location' && !r.stale && store.get('module:universe',true)) universe.observeTravel(id, prior, snapshot);
            if(d.key==='loyalty'&&!r.stale)reconcileSessionLoyalty(store,id);
            goals.refresh(id,d.key);
            nextRun.set(key, r.stale ? retryDeadline(d, r.retryAt) : Math.max(Date.now() + 3000, Date.parse(snapshot.refreshAt)));
            if (!r.stale) {
                if (d.key === 'queue') {
                    const skillSample = store.snapshot(id, 'skills');
                    if (skillSample?.status === 'ready') {
                        const skills = catalog.find(m => m.id === 'training').datasets.find(d => d.key === 'skills');
                        const due = refreshDeadline(pollingPolicy(skills, id), skillSample, data);
                        if (due < Date.parse(skillSample.refreshAt || skillSample.expiresAt)) {
                            store.saveSnapshot(id, 'skills', { ...skillSample, refreshAt: new Date(due).toISOString() });
                            nextRun.set(id + ':skills', due);
                        }
                    }
                }
                // Dock/undock and login are useful hints that the hull changed.
                // Run independently so a slow ship endpoint never stalls OPSEC.
                if ((d.key === 'location' && prior?.data && ['station_id', 'structure_id'].some(k => data[k] !== prior.data[k])) ||
                    (d.key === 'online' && data.online && prior?.data?.online === false)) {
                    requested.add(id + ':ship');
                    const pilot = catalog.find(m => m.id === 'pilot');
                    syncDataset(character, pilot, pilot.datasets.find(d => d.key === 'ship'))?.catch(() => {});
                }
                bus.emit({ type: 'data.' + d.key, characterId: id, payload: { current: data, previous: prior?.data } });
            }
        }
        catch (e) {
            const retained = d.owner && prior?.ownerId !== ownerId ? null : prior;
            const retryAt = new Date(retryDeadline(d, e.retryAt)).toISOString();
            store.saveSnapshot(id, d.key, { ...retained, data: retained?.data ?? null, status: retained?.data != null ? 'stale' : 'error', error: e.message, errorStatus: e.status, retryAt, ...(d.owner ? { ownerId } : {}) });
            if (d.key === 'sovereignty') {
                const hubs=store.snapshot(0,'sovereignty_structures');
                if(hubs?.derivedFrom==='sovereignty') store.saveSnapshot(0,'sovereignty_structures',{...hubs,status:'stale',error:e.message,errorStatus:e.status,retryAt});
            }
            nextRun.set(key, Date.parse(retryAt));
        }
        send('snapshot', { characterId: id, key: d.key, snapshot: d.key==='killmails'?combatSnapshot(id):store.snapshot(id, d.key), names: namesMap });
    }
    function retryDeadline(dataset, retryAt) {
        return Math.max(Date.now() + (dataset.key === 'location' ? 3000 : 60000), Date.parse(retryAt) || 0);
    }
    function protectionEvidence(key, id) {
        const protectedId = protectedCharacter().id;
        return key !== 'location' && protectionKeys.has(key) && !!protectedId && (id === 0 || id === protectedId);
    }
    function pollingPolicy(dataset, id) {
        return { ...dataset, pollInterval: protectionEvidence(dataset.key, id) ? 0 : polling[dataset.key] ?? dataset.pollInterval };
    }
    function pollingSettings() {
        return { intervals: { ...polling }, groups: catalog.filter(m => m.datasets.length).map(m => ({
            id: m.id, name: m.name, enabled: enabled(m), shared: m.id === 'universe',
            batches: m.datasets.map(d => ({ key: d.key, ...pollingBatches[d.key], recommended: d.pollInterval,
                protection: protectionKeys.has(d.key) && d.key !== 'location', paged: d.paged })),
        })) };
    }
    function savePolling(input) {
        const next = validatePolling(input);
        store.set('esi:polling', next); polling = next;
        // Change deadlines from original observations, not from Save time.
        // Failed samples remain failed and server retry deadlines stay intact.
        for (const m of catalog) for (const d of m.datasets) {
            for (const id of m.id === 'universe' ? [0] : auth.characters().map(c => c.id)) {
                const sample = store.snapshot(id, d.key);
                if (sample?.status !== 'ready' || !Number.isFinite(Date.parse(sample.updatedAt))) continue;
                const due = refreshDeadline(pollingPolicy(d, id), sample, d.key === 'queue' ? sample.data : store.snapshot(id, 'queue')?.data);
                store.saveSnapshot(id, d.key, { ...sample, refreshAt: new Date(due).toISOString() });
                nextRun.set(id + ':' + d.key, due);
            }
        }
        refreshOPSEC(); updateBindings(); send('changed', {});
        return pollingSettings();
    }
    async function sync(id) { if (stopped || syncing.has(id))
        return; const character = auth.characters().find(c => c.id === id); if (id && !character)
        return; const task = (async () => { const modules = id ? catalog.filter(m => m.id !== 'universe') : catalog.filter(m => m.id === 'universe'); const tasks = modules.filter(enabled).flatMap(m => m.datasets.map(d => () => syncDataset(character, m, d))); for (let i = 0; i < tasks.length; i += 3) {
        if (stopped)
            break;
        await Promise.allSettled(tasks.slice(i, i + 3).map(f => f()));
    } refreshOPSEC(); updateBindings(); })().finally(() => syncing.delete(id)); syncing.set(id, task); return task; }
    function snapshots(id, expire = true) { const data = {}; for (const m of catalog)
        for (const d of m.datasets) {
            const char = m.id === 'universe' ? 0 : id;
            data[d.key] = enabled(m) ? store.snapshot(char, d.key) || { status: 'waiting', data: null } : { status: 'disabled', data: null };
            if(d.key==='killmails'&&enabled(m))data[d.key]=combatSnapshot(id);
            if (expire && data[d.key].status === 'ready' && !snapshotFresh(data[d.key]))
                data[d.key] = { ...data[d.key], status: 'stale' };
        } return data; }
    function protectedCharacter() { const chars = auth.characters(); return { chars, id: store.get('opsec', {}).characterId || chars[0]?.id || 0 }; }
    function refreshOPSEC() {
        const settings = store.get('opsec', { manual: false, allowHighsec: false, blueAlliances: [], hostileAlliances: [] });
        const { chars, id } = protectedCharacter(), character = chars.find(c => c.id === id), s = {};
        for (const key of protectionKeys) {
            const {module} = datasets.get(key);
            s[key] = enabled(module) ? store.snapshot(module.id === 'universe' ? 0 : id, key) || {status:'waiting', data:null} : {status:'disabled', data:null};
        }
        const next = { ...protection({ manual: settings.manual, location: s.location, system: s.location?.data?.system, constellation: s.location?.data?.constellation, region: s.location?.data?.region, fw: s.fw, sovereignty: s.sovereignty, contacts: s.contacts, corporation_contacts: s.corporation_contacts, alliance_contacts: s.alliance_contacts, profile: s.profile, settings, characterId: id, available: !!character && !character.needsReauth && character.scopes.includes('esi-location.read_location.v1') }), characterId: id };
        const previous = stream.getOPSEC();
        next.standingSources = ['contacts', 'corporation_contacts', 'alliance_contacts'].map(key => ({ key, status: s[key]?.status || 'waiting', updatedAt: s[key]?.updatedAt, expiresAt: s[key]?.expiresAt, error: s[key]?.error, scope: catalog.find(m => m.id === 'opsec').datasets.find(d => d.key === key).scope, count: Array.isArray(s[key]?.data) ? s[key].data.filter(c => c.contact_type === 'alliance').length : 0 }));
        stream.setOPSEC(next); obs.setState(next.state);
        if (previous.state !== next.state || previous.reason !== next.reason || previous.characterId !== id || !!previous.pending !== !!next.pending || JSON.stringify(previous.standingSources) !== JSON.stringify(next.standingSources)) send('opsec', next);
    }
    function syncProtection() {
        const { chars, id } = protectedCharacter(), character = chars.find(c => c.id === id);
        if (stopped) return Promise.resolve();
        const tasks = [];
        for (const key of protectionKeys) {
            const m = catalog.find(m => m.datasets.some(d => d.key === key));
            if (m.id !== 'universe' && (!character || character.needsReauth)) continue;
            tasks.push(syncDataset(m.id === 'universe' ? undefined : character, m, m.datasets.find(d => d.key === key)));
        }
        return Promise.allSettled(tasks);
    }
    function updateBindings(){stream.setBindings(Object.fromEntries(stream.config().elements.map(e=>[e.id,bindingProjection(store,auth,e)])));}
    function refreshPolitics() {
        if (!store.get('module:universe', true)) return;
        try { universe.refreshPolitics(); } catch (error) { console.warn('Universe relationship refresh deferred:', error.message); }
    }
    const ticker = setInterval(() => { if (!options.noSync) { universe.tick().catch(error => console.warn('Universe collection deferred:', error.message)); refreshPolitics(); syncProtection(); sync(0); for (const c of auth.characters())
        if (!c.needsReauth){
            sync(c.id);combat.syncPublic(c.id);sessionCombat.syncRecent(c.id);
        } } refreshOPSEC(); }, 3000);
    ticker.unref();
    const heartbeat = setInterval(() => { for (const c of [...uiClients, ...stream.clients]) {
        if (c.destroyed || c.writableLength > 1000000)
            c.destroy();
        else
            c.write(': heartbeat\n\n');
    } updateBindings(); }, 10000);
    heartbeat.unref();
    refreshOPSEC();updateBindings();
    if (!options.noSync) refreshPolitics();
    return { bus, registry, universe, stream, obs, combat, sessionCombat, goals, markets, uiClients, moduleList, snapshots, sync, syncProtection, publish, pollingSettings, savePolling, names: () => namesMap, rememberNames, resolveNames, refreshOPSEC, updateBindings, toggle(id, value) { if (catalog.some(m => m.id === id)) {
            store.set('module:' + id, value);
        }
        else
            registry.toggle(id, value); if (id === 'universe') universe.tick().catch(() => {}); refreshOPSEC(); updateBindings(); send('changed', {}); }, requestSync(id) {
            for (const m of catalog) if ((m.id === 'universe') === (id === 0)) for (const d of m.datasets) requested.add(id + ':' + d.key);
            esi.clearAccessFailures?.(id);
            syncProtection(); return Promise.allSettled([sync(id), ...(!options.noSync && id ? [combat.syncPublic(id)] : [])]);
        }, health: () => ({ syncing: [...syncing.keys()], esi: esi.health() }), async close() { stopped = true; clearInterval(ticker); clearInterval(heartbeat); registry.close();stopUniverseHistory();stream.close();await universe.close();await markets.close();await sessionCombat.close();await combat.close();await obs.close(); for (const c of uiClients)
            c.end(); await Promise.allSettled([...syncing.values(), ...datasetSync.values()]); } };
}
