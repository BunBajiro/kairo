import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join, extname, dirname, sep } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.mjs';
import { openVault } from './vault.mjs';
import { createAuth } from './auth.mjs';
import { createESI } from './esi.mjs';
import { createCore } from './core.mjs';
import { allScopes, catalog } from './modules/catalog.mjs';
import {sanitizeConfig} from './stream.mjs';
import {bindingProjection,toastContexts} from './projections.mjs';
import {changeSession,sessionReport} from './history.mjs';
import {sessionReplay} from './session-replay.mjs';
import {getSystem,journeyData,savePlaceNote,setJourneyConnection} from './places.mjs';
import {listGoals,goalSourceOptions,lookupGoalType} from './goals.mjs';
import {createDatasetService} from './datasets.mjs';
import {activeDatasetDirectory, defaultDataDirectory} from './dataset-paths.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function validHost(host, port) { return host === `127.0.0.1:${port}` || host === `localhost:${port}`; }
export function safeEqual(a, b) { return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export async function startKairo(options = {}) {
    const port = options.port ?? Number(process.env.KAIRO_PORT || 4380);
    const streamPort = options.streamPort ?? Number(process.env.KAIRO_STREAM_PORT || port + 1);
    if (!Number.isInteger(port) || !Number.isInteger(streamPort) || port < 1024 || port > 65535 || streamPort < 1024 || streamPort > 65535 || port === streamPort)
        throw new Error('Choose two different local ports between 1024 and 65535.');
    const origin = `http://127.0.0.1:${port}`, streamOrigin = `http://127.0.0.1:${streamPort}`;
    const dir = options.dataDir || defaultDataDirectory();
    const store = openStore(dir), vault = openVault(dir), auth = createAuth(store, vault, { origin, fetcher: options.fetcher }), esi = createESI(store, auth, { fetcher: options.fetcher });
    const core = await createCore(store, auth, esi, join(root, 'server', 'modules'),{vault,noSync:options.noSync,obs:options.obs,markets:options.markets,combatFetcher:options.combatFetcher||options.fetcher,sessionFeedFetcher:options.sessionFeedFetcher,universe:options.universe});
    const sessions = new Map((options.initialSessions || []).filter(([key, value]) => typeof key === 'string' && typeof value?.csrf === 'string' && value.expires > Date.now()));
    let stopping = false, applyingDataset = false, closing, restartTimer;
    const requests = new Set();
    const datasetRecovery = options.datasetRecovery || null;
    function announce(type, value) {
        const event = `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
        for (const client of core.uiClients) {
            if (client.destroyed || client.writableLength > 1000000) client.destroy();
            else client.write(event);
        }
    }
    function cancelDatasetRestart(message) {
        applyingDataset = false; clearTimeout(restartTimer); restartTimer = null;
        void datasets.activationFailed(message).catch(() => {});
        announce('dataset-restart-cancelled', {message: String(message || 'The update could not be activated. Your current dataset is still in use.')});
    }
    let datasets;
    try {
    datasets = createDatasetService({...(options.datasets || {}), dataDir: dir,
        activeDirectory: activeDatasetDirectory, automatic: !options.noSync,
        onChange: status => announce('datasets', {...status, managedRestart: !!options.onDatasetsReady}),
        onReady: ready => {
            if (!options.onDatasetsReady || stopping) return;
            applyingDataset = true;
            announce('dataset-restarting', {build: ready.manifest?.build, startedAt: new Date().toISOString()});
            restartTimer = setTimeout(() => {
                restartTimer = null;
                Promise.resolve().then(() => options.onDatasetsReady(ready)).catch(error => cancelDatasetRestart(error.message));
            }, 300);
        },
    });
    await datasets.ready;
    } catch (error) {
        await datasets?.close().catch(() => {});
        await core.close(); store.close();
        throw error;
    }
    const datasetStatus = () => ({...datasets.status(), managedRestart: !!options.onDatasetsReady});
    const datasetRevision = datasets.status().datasets.filter(row => row.automatic).map(row => row.build).join(':');
    let universeAtlasResponse;
    async function universeDetail(characterId, systemId) {
        const owner=store.snapshot(0,'sovereignty')?.data?.find(row=>row.system_id===systemId);
        if(owner && store.get('module:universe',true)) await core.resolveNames({alliance_id:owner.alliance_id,corporation_id:owner.corporation_id,faction_id:owner.faction_id});
        return {...await core.universe.detail(characterId,systemId),names:core.names()};
    }
    const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    function session(req) { const key = (req.headers.cookie || '').split('; ').find(c => c.startsWith('kairo_session='))?.split('=')[1]; const s = sessions.get(key); if (!s || s.expires < Date.now()) {
        sessions.delete(key);
        return null;
    } s.expires = Date.now() + 86400000; return { ...s, key }; }
    function establish(res) { for (const [key, s] of sessions)
        if (s.expires < Date.now())
            sessions.delete(key); const key = randomBytes(32).toString('base64url'); sessions.set(key, { csrf: randomBytes(32).toString('base64url'), expires: Date.now() + 86400000 }); res.setHeader('Set-Cookie', `kairo_session=${key}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`); }
    async function body(req, maximum = 150000) { if (!req.headers['content-type']?.startsWith('application/json'))
        throw new Error('JSON is required.'); let size = 0, out = ''; for await (const part of req) {
        size += part.length;
        if (size > maximum)
            throw new Error('Request is too large.');
        out += part;
    } return JSON.parse(out || '{}'); }
    const isOwn = req => (!req.headers.origin || req.headers.origin === origin) && req.headers['sec-fetch-site'] !== 'cross-site';
    const pageHeaders = res => { res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.evetech.net https://web.ccpgamescdn.com; connect-src 'self'; font-src 'self' data:; frame-src ${streamOrigin}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.eveonline.com`); };
    const checkedChar = url => { const id = Number(url.searchParams.get('character') || 0); if (!Number.isSafeInteger(id) || id < 0) throw new Error('Choose a valid character.'); if (id && !auth.characters().some(c => c.id === id))
        throw new Error('This character is not connected.'); return id; };
    async function api(req, res, url, s) {
        const path = url.pathname.slice(4);
        const read = req.method === 'GET';
        if (!read) {
            if (!isOwn(req) || !safeEqual(req.headers['x-kairo-csrf'], s.csrf))
                return json(res, 403, { error: 'This change requires your Kairo session.' });
        }
        if (path === '/bootstrap' && read)
            return json(res, 200, { csrf: s.csrf, configured: !!store.get('clientId', ''), clientId: store.get('clientId', ''), characters: auth.characters(), modules: core.moduleList(), settings: { opsec: store.get('opsec', { manual: false, allowHighsec: false, blueAlliances: [], hostileAlliances: [] }), theme: store.get('theme', 'mint') }, stream: core.stream.config(), streamOrigin, version: '0.8.0-rc.16', datasetRevision, datasetRecovery, vault: vault.kind, localOnly: true, pages: core.registry.pages() });
        if (path === '/datasets' && read) return json(res, 200, datasetStatus());
        if (path === '/datasets/check' && req.method === 'POST') {
            void datasets.check({install: false}).catch(() => {});
            return json(res, 202, datasetStatus());
        }
        if (path === '/datasets/install' && req.method === 'POST') {
            void datasets.install().catch(() => {});
            return json(res, 202, datasetStatus());
        }
        if (path === '/state' && read) {
            const id = checkedChar(url);
            return json(res, 200, { data: core.snapshots(id), names: core.names(), health: core.health(), opsec: core.stream.getOPSEC(), sessions: store.db.prepare('SELECT * FROM sessions WHERE character_id=? ORDER BY started DESC LIMIT 20').all(id) });
        }
        if (path === '/events' && read) {
            if (applyingDataset) {res.setHeader('Retry-After', '2'); return json(res, 503, {error: 'Applying a dataset update.'});}
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
            res.write(': connected\n\n');
            res.write(`event: dataset-revision\ndata: ${JSON.stringify({revision: datasetRevision, recovery: datasetRecovery})}\n\n`);
            res.write(`event: datasets\ndata: ${JSON.stringify(datasetStatus())}\n\n`);
            core.uiClients.add(res);
            res.on('close', () => core.uiClients.delete(res));
            return;
        }
        if (path === '/sync' && req.method === 'POST') {
            const b = await body(req);
            const id = Number(b.character || 0);
            if (id && !auth.characters().some(c => c.id === id))
                return json(res, 400, { error: 'Character not connected.' });
            core.requestSync(id);
            core.requestSync(0);
            return json(res, 202, { ok: true });
        }
        if(path==='/markets'&&read)return json(res,200,core.markets.overview());
        if(path==='/markets/hubs'&&req.method==='POST')return json(res,200,await core.markets.addHub(await body(req)));
        if(path==='/markets/defaults'&&req.method==='POST')return json(res,200,core.markets.restoreDefaults());
        if(/^\/markets\/hubs\/\d+$/.test(path)&&req.method==='DELETE')return json(res,200,core.markets.removeHub(Number(path.split('/')[3])));
        if(path==='/markets/discover'&&req.method==='POST')return json(res,200,await core.markets.discover(await body(req)));
        if(path==='/markets/quick'&&req.method==='PUT')return json(res,200,await core.markets.quickChange(await body(req)));
        if(path==='/markets/scan'&&req.method==='POST')return json(res,202,core.markets.start(await body(req)));
        if(path==='/markets/upgrade'&&req.method==='POST')return json(res,200,core.markets.resumeUpgrade(true));
        if(path==='/markets/cancel'&&req.method==='POST')return json(res,200,core.markets.cancel());
        if(path==='/markets/categories'&&read)return json(res,200,core.markets.categories(Number(url.searchParams.get('hub'))));
        if(path==='/markets/browse'&&read)return json(res,200,core.markets.browse(Number(url.searchParams.get('hub')),Object.fromEntries(url.searchParams)));
        if(path==='/markets/item'&&read)return json(res,200,core.markets.detail(Number(url.searchParams.get('hub')),Number(url.searchParams.get('type')),Object.fromEntries(url.searchParams)));
        if(path==='/markets/report'&&read)return json(res,200,core.markets.report(Number(url.searchParams.get('hub')),Object.fromEntries(url.searchParams)));
        if(path==='/markets/type'&&req.method==='POST')return json(res,200,await core.markets.enrichType((await body(req)).typeId));
        if(path==='/markets/imports'&&read)return json(res,200,core.markets.imports.state(Number(url.searchParams.get('hub'))));
        if(path==='/markets/imports/settings'&&req.method==='PUT'){const b=await body(req);return json(res,200,core.markets.imports.saveSettings(b.hubId,b.settings));}
        if(path==='/markets/imports/refresh'&&req.method==='POST')return json(res,200,await core.markets.imports.refresh((await body(req)).hubId));
        if(path==='/markets/imports/analyse'&&read)return json(res,200,await core.markets.imports.analyse(Number(url.searchParams.get('hub'))));
        if(path==='/markets/imports/item'&&read)return json(res,200,await core.markets.imports.detail(Number(url.searchParams.get('hub')),Number(url.searchParams.get('type'))));
        if(path==='/markets/imports/quote'&&req.method==='POST'){const b=await body(req);return json(res,200,await core.markets.imports.quote(b.hubId,b));}
        if(path==='/markets/imports/plan-quote'&&req.method==='POST'){const b=await body(req);return json(res,200,await core.markets.imports.planQuote(b.hubId,b));}
        if(path==='/markets/imports/plans'&&read)return json(res,200,core.markets.imports.getPlan(Number(url.searchParams.get('hub')),url.searchParams.get('id')));
        if(path==='/markets/imports/plans'&&req.method==='POST'){const b=await body(req);return json(res,200,await core.markets.imports.savePlan(b.hubId,b));}
        if(path==='/markets/imports/plans'&&req.method==='DELETE'){const b=await body(req);return json(res,200,core.markets.imports.removePlan(b.hubId,b.id));}
        if (path === '/settings/polling' && read) return json(res, 200, core.pollingSettings());
        if (path === '/settings/polling' && req.method === 'PUT') return json(res, 200, core.savePolling((await body(req)).intervals));
        if (path === '/settings' && req.method === 'PUT') {
            const b = await body(req);
            if (b.clientId !== undefined) {
                if (!/^[\w-]{8,128}$/.test(b.clientId))
                    throw new Error('Enter the Client ID from your EVE application.');
                if (auth.characters().length && b.clientId !== store.get('clientId', ''))
                    throw new Error('Disconnect characters before changing the application Client ID.');
                store.set('clientId', b.clientId);
            }
            if (b.theme && ['mint', 'amber', 'ice'].includes(b.theme))
                store.set('theme', b.theme);
            return json(res, 200, { ok: true });
        }
        if (path === '/auth/start' && req.method === 'POST') {
            const b = await body(req);
            if (!Array.isArray(b.scopes) || b.scopes.some(s => !allScopes.includes(s)))
                throw new Error('Invalid ESI scope selection.');
            return json(res, 200, { url: await auth.authorize(s.key, [...new Set(b.scopes)]) });
        }
        if (path.startsWith('/characters/') && req.method === 'DELETE') {
            const id = Number(path.split('/')[2]);
            await auth.disconnect(id);
            core.refreshOPSEC();core.updateBindings();
            return json(res, 200, { ok: true });
        }
        if (path === '/modules' && req.method === 'PUT') {
            const b = await body(req);
            if (typeof b.enabled !== 'boolean')
                throw new Error('Invalid module setting.');
            core.toggle(b.id, b.enabled);
            return json(res, 200, { modules: core.moduleList() });
        }
        if (path === '/stream' && read)
            return json(res, 200, core.stream.config());
        if(path==='/stream'&&req.method==='PUT'){const c=sanitizeConfig(await body(req));return json(res,200,core.stream.save(c,Object.fromEntries(c.elements.map(e=>[e.id,bindingProjection(store,auth,e)]))));}
        if(path==='/stream/sources'&&read)return json(res,200,{goals:store.db.prepare('SELECT id,character_id,title,progress,target,done FROM goals ORDER BY done,title').all(),contexts:toastContexts});
        if(path==='/stream/preview'&&req.method==='POST'){const c=sanitizeConfig(await body(req));return json(res,200,Object.fromEntries(c.elements.map(e=>[e.id,bindingProjection(store,auth,e)])));}
        if(path==='/obs'&&read)return json(res,200,{config:core.obs.config(),status:core.obs.status()});
        if(path==='/obs'&&req.method==='PUT')return json(res,200,{status:await core.obs.save(await body(req)),config:core.obs.config()});
        if(path==='/obs/targets'&&read)return json(res,200,await core.obs.inventory());
        if(path==='/obs/filters'&&read)return json(res,200,await core.obs.filters(url.searchParams.get('source')));
        if(path==='/obs/reconnect'&&req.method==='POST')return json(res,200,await core.obs.reconnect());
        if(path==='/obs/apply'&&req.method==='POST')return json(res,200,await core.obs.reapply());
        if (path === '/stream/test' && req.method === 'POST') {
            const b = await body(req);
            const emitted = core.stream.emit(b.event || 'test.toast', true);
            return json(res, 200, { ok: emitted });
        }
        if (path === '/opsec' && req.method === 'PUT') {
            const b = await body(req);
            const ids = v => Array.isArray(v) ? v.map(Number).filter(n => Number.isSafeInteger(n) && n > 0).slice(0, 100) : [];
            const id = Number(b.characterId || 0);
            if (id && !auth.characters().some(c => c.id === id))
                throw new Error('Select a connected character.');
            if (ids(b.blueAlliances).some(id => ids(b.hostileAlliances).includes(id))) throw new Error('An alliance cannot be in both Blue and Hostile overrides.');
            store.set('opsec', { manual: b.manual === true, allowHighsec: b.allowHighsec === true, blueAlliances: ids(b.blueAlliances), hostileAlliances: ids(b.hostileAlliances), characterId: id });
            core.refreshOPSEC();
            return json(res, 200, { ok: true, state: core.stream.getOPSEC() });
        }
        if (path === '/timeline' && read) {
            const id = checkedChar(url), before = url.searchParams.get('before') || new Date(Date.now() + 1000).toISOString();
            const limit = Number(url.searchParams.get('limit') || 5), beforeId = Number(url.searchParams.get('beforeId') || 0);
            if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(beforeId) || beforeId < 0 || !Number.isFinite(Date.parse(before))) throw new Error('Invalid timeline page.');
            const query = (url.searchParams.get('q') || '').trim().slice(0, 200).toLowerCase();
            const rows = store.db.prepare('SELECT * FROM events WHERE (character_id=? OR character_id IS NULL) AND (at<? OR (at=? AND id<?)) AND instr(lower(summary),?)>0 ORDER BY at DESC,id DESC LIMIT ?').all(id, before, before, beforeId, query, limit + 1);
            const items = rows.slice(0, limit).map(e => ({ ...e, payload: JSON.parse(e.payload) })), last = items.at(-1);
            return json(res, 200, { items, more: rows.length > limit, nextCursor: rows.length > limit ? { at: last.at, id: last.id } : null });
        }
        if(path==='/journey'&&read)return json(res,200,journeyData(store,checkedChar(url)));
        if(/^\/journey\/connections\/\d+$/.test(path)&&req.method==='PUT')return json(res,200,setJourneyConnection(store,checkedChar(url),Number(path.split('/')[3]),(await body(req)).hidden));
        if(path==='/journey/enrich'&&req.method==='POST'){const missing=journeyData(store,checkedChar(url)).systems.filter(s=>s.x===null||!s.region_id).slice(0,25),results=[];for(const s of missing){try{await getSystem(store,esi,s.system_id);results.push({id:s.system_id,ok:true});}catch{results.push({id:s.system_id,ok:false});}}return json(res,200,{results});}
        if(path==='/places'&&read)return json(res,200,store.db.prepare('SELECT * FROM place_notes ORDER BY updated DESC').all().map(n=>({...n,tags:JSON.parse(n.tags)})));
        if(path.startsWith('/places/')){const [,,kind,key]=path.split('/'),id=Number(key);if(!['system','constellation','region'].includes(kind)||!Number.isSafeInteger(id)||id<1)throw new Error('Invalid place.');
            if(core.universe.static().systems.some(system=>system.space==='wormhole'&&system[kind+'_id']===id))throw new Error('Record J-Space system notes inside a private chain map.');
            if(read){const n=store.db.prepare('SELECT * FROM place_notes WHERE kind=? AND entity_id=?').get(kind,id);return json(res,200,n?{...n,tags:JSON.parse(n.tags)}:{kind,entity_id:id,body:'',tags:[],status:'none'});}
            if(req.method==='PUT')return json(res,200,savePlaceNote(store,kind,id,await body(req)));
            if(req.method==='DELETE'){store.db.prepare('DELETE FROM place_notes WHERE kind=? AND entity_id=?').run(kind,id);return json(res,200,{ok:true});}}
        if(path==='/goals/sources'&&read)return json(res,200,goalSourceOptions(store,auth,checkedChar(url)));
        if(path==='/goals/type'&&req.method==='POST'){
            const t=await lookupGoalType(store,esi,await body(req));Object.assign(core.names(),{[t.id]:t.name});return json(res,200,t);
        }
        if (path === '/goals' && read)
            return json(res, 200, listGoals(store,auth,checkedChar(url)));
        if (path === '/goals' && req.method === 'POST') {
            const b=await body(req),characterId=checkedChar(url),verifiedType=b.typeId?await lookupGoalType(store,esi,{typeId:b.typeId}):undefined;
            if(verifiedType)Object.assign(core.names(),{[verifiedType.id]:verifiedType.name});
            const result=core.goals.create(characterId,b,verifiedType);core.updateBindings();
            return json(res,201,result);
        }
        if (path.startsWith('/goals/') && req.method === 'PUT') {
            const id = path.split('/')[2];
            const g = store.db.prepare('SELECT * FROM goals WHERE id=?').get(id);
            if (!g)
                throw new Error('Goal not found.');
            if(url.searchParams.has('character')&&g.character_id!==checkedChar(url))throw new Error('Goal not found for this character.');
            if(store.db.prepare('SELECT goal_id FROM goal_tracking WHERE goal_id=?').get(id))throw new Error('This goal follows ESI automatically; its progress cannot be set manually.');
            const b = await body(req);
            const progress = Math.min(g.target, Math.max(0, Number(b.progress)));
            if (!Number.isFinite(progress))
                throw new Error('Invalid progress.');
            const done = progress >= g.target;
            store.db.prepare('UPDATE goals SET progress=?,done=? WHERE id=?').run(progress, done ? 1 : 0, id);
            if (done && !g.done)
                core.publish({ type: 'goal.completed', module: 'goals', characterId: g.character_id, summary: 'Completed goal: ' + g.title, payload:{goal_id:id,goal_title:g.title,progress,target:g.target} });
            if(progress!==g.progress&&!(done&&!g.done))core.publish({type:'goal.updated',module:'goals',characterId:g.character_id,summary:g.title+': '+progress+' / '+g.target,payload:{goal_id:id,goal_title:g.title,progress,target:g.target}});
            core.updateBindings();
            return json(res,200,{ok:true});
        }
        if(path.startsWith('/goals/') && req.method === 'DELETE') {
            const id=path.split('/')[2],g=store.db.prepare('SELECT character_id FROM goals WHERE id=?').get(id);
            if(!g||url.searchParams.has('character')&&g.character_id!==checkedChar(url))throw new Error('Goal not found for this character.');
            store.db.prepare('DELETE FROM goals WHERE id=?').run(id);
            core.updateBindings();
            return json(res, 200, { ok: true });
        }
        if (path === '/notes' && read)
            return json(res, 200, store.db.prepare('SELECT * FROM notes WHERE character_id=? ORDER BY created DESC LIMIT 100').all(checkedChar(url)));
        if (path === '/notes' && req.method === 'POST') {
            const b = await body(req);
            const content = String(b.body || '').trim().slice(0, 5000);
            if (!content)
                throw new Error('Write a note first.');
            const id = randomUUID();
            store.db.prepare('INSERT INTO notes VALUES(?,?,?,?)').run(id, checkedChar(url), content, new Date().toISOString());
            core.publish({ type: 'note.created', module: 'goals', characterId: checkedChar(url), summary: 'Added a private note', payload: { note_id: id } });
            return json(res, 201, { id });
        }
        if (path.startsWith('/notes/') && req.method === 'DELETE') {
            store.db.prepare('DELETE FROM notes WHERE id=?').run(path.split('/')[2]);
            return json(res, 200, { ok: true });
        }
        if(path==='/session'&&req.method==='POST'){const characterId=checkedChar(url),r=changeSession(store,core.publish,characterId,await body(req));core.updateBindings();if(!options.noSync)core.sessionCombat.sessionChanged(r.id,characterId).catch(()=>{});return json(res,200,r);}
        if(path==='/sessions'&&read){const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0))),rows=store.db.prepare('SELECT id,character_id,label,started,ended FROM sessions WHERE character_id=? ORDER BY started DESC,id DESC LIMIT 31 OFFSET ?').all(checkedChar(url),offset);return json(res,200,{items:rows.slice(0,30),more:rows.length>30});}
        if(/^\/sessions\/[^/]+\/replay$/.test(path) && read) return json(res,200,sessionReplay(store,decodeURIComponent(path.split('/')[2]),checkedChar(url)));
        if(path.startsWith('/sessions/')){const id=path.split('/')[2],characterId=checkedChar(url);if(read){const report=sessionReport(store,id,characterId,Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset'))||0))));if(!options.noSync)core.sessionCombat.sync(id,characterId).catch(()=>{});const coverage=store.get('session:combat:'+id,null);if(coverage&&store.get('module:combat',true))report.allianceCombat.coverage=coverage;return json(res,200,report);}
            if(req.method==='PUT'){const b=await body(req),label=String(b.label||'').trim().slice(0,100);if(!label)throw new Error('Give this session a name.');const r=store.db.prepare('UPDATE sessions SET label=?,notes=? WHERE id=? AND character_id=?').run(label,String(b.notes||'').slice(0,12000),id,characterId);if(!r.changes)throw new Error('Session not found for this character.');core.updateBindings();return json(res,200,{ok:true});}}
        if (path === '/universe/static' && read) {
            if (!universeAtlasResponse) {
                const raw=Buffer.from(JSON.stringify(core.universe.static()));
                universeAtlasResponse={raw,gzip:gzipSync(raw),etag:'"'+createHash('sha256').update(raw).digest('hex')+'"'};
            }
            const headers={'Content-Type':'application/json','Cache-Control':'private, no-cache',ETag:universeAtlasResponse.etag,Vary:'Accept-Encoding'};
            if(req.headers['if-none-match']===universeAtlasResponse.etag){res.writeHead(304,headers);return res.end();}
            const compressed=/\bgzip\b/.test(req.headers['accept-encoding']||'');
            res.writeHead(200,{...headers,...(compressed?{'Content-Encoding':'gzip'}:{})});
            return res.end(compressed?universeAtlasResponse.gzip:universeAtlasResponse.raw);
        }
        if (path === '/universe' && read) return json(res, 200, core.universe.state(checkedChar(url)));
        if (path === '/universe/jspace' && read) return json(res, 200, core.universe.jspace.state(checkedChar(url)));
        if (path === '/universe/jspace/tracking/active' && req.method === 'PUT') return json(res, 200, core.universe.jspace.setActivePilot((await body(req)).character_id));
        if (path === '/universe/jspace/scope-options' && read) return json(res, 200, core.universe.scopeOptions(checkedChar(url)));
        if (path === '/universe/jspace/owners/search' && read) return json(res, 200, await core.universe.searchOwners(checkedChar(url), {kind:url.searchParams.get('kind'),q:url.searchParams.get('q')}));
        if (path === '/universe/jspace/destinations' && req.method === 'POST') return json(res, 200, core.universe.jspaceDestinations(checkedChar(url), await body(req)));
        if (path === '/universe/jspace/maps' && req.method === 'POST') return json(res, 200, core.universe.jspace.create(checkedChar(url), await body(req)));
        if (path === '/universe/jspace/import/preview' && req.method === 'POST') return json(res, 200, core.universe.jspace.previewImport(checkedChar(url), await body(req, 4_100_000)));
        if (path === '/universe/jspace/import' && req.method === 'POST') return json(res, 200, core.universe.jspace.importMap(checkedChar(url), await body(req, 4_100_000)));
        if (/^\/universe\/jspace\/maps\/[^/]+\/commands$/.test(path) && req.method === 'POST') return json(res, 200, core.universe.jspace.command(checkedChar(url), decodeURIComponent(path.split('/')[4]), await body(req)));
        if (/^\/universe\/jspace\/maps\/[^/]+\/duplicate$/.test(path) && req.method === 'POST') return json(res, 200, core.universe.jspace.duplicate(checkedChar(url), decodeURIComponent(path.split('/')[4]), await body(req)));
        if (/^\/universe\/jspace\/maps\/[^/]+\/export$/.test(path) && read) {
            const result = core.universe.jspace.exportMap(checkedChar(url), decodeURIComponent(path.split('/')[4]), url.searchParams.get('format') || 'kairo');
            res.setHeader('Content-Disposition', 'attachment; filename="kairo-jspace-map.json"'); return json(res, 200, result);
        }
        if (/^\/universe\/jspace\/maps\/[^/]+$/.test(path) && read) return json(res, 200, core.universe.jspace.map(checkedChar(url), decodeURIComponent(path.split('/')[4])));
        if (/^\/universe\/jspace\/maps\/[^/]+$/.test(path) && req.method === 'DELETE') return json(res, 200, core.universe.jspace.remove(checkedChar(url), decodeURIComponent(path.split('/')[4]), await body(req)));
        if (path === '/universe/operations' && read) return json(res,200,core.universe.operations.state(checkedChar(url),url.searchParams.get('map_id')));
        if (path === '/universe/operations/config' && read) return json(res,200,core.universe.operations.config(checkedChar(url)));
        if (path === '/universe/operations/config' && req.method === 'PUT') return json(res,200,core.universe.operations.saveConfig(checkedChar(url),await body(req)));
        if (path === '/universe/log-directories' && read) return json(res,200,await core.universe.operations.defaultLogDirectories());
        if (path === '/universe/intel' && req.method === 'POST') return json(res,200,core.universe.operations.ingestIntel(checkedChar(url),await body(req)));
        if (/^\/universe\/intel\/[^/]+$/.test(path) && req.method === 'DELETE') return json(res,200,core.universe.operations.removeIntel(checkedChar(url),decodeURIComponent(path.split('/')[3]),url.searchParams.get('map_id')));
        if (/^\/universe\/alerts\/[^/]+\/ack$/.test(path) && req.method === 'POST') return json(res,200,core.universe.operations.acknowledge(checkedChar(url),decodeURIComponent(path.split('/')[3]),url.searchParams.get('map_id')));
        if (path === '/universe/signatures/preview' && req.method === 'POST') return json(res,200,core.universe.operations.previewSignatures(checkedChar(url),await body(req)));
        if (path === '/universe/signatures/import' && req.method === 'POST') return json(res,200,core.universe.operations.importSignatures(checkedChar(url),await body(req)));
        if (path === '/universe/signatures/restore' && req.method === 'POST') return json(res,200,core.universe.operations.restoreSignature(checkedChar(url),await body(req)));
        if (path === '/universe/upgrades/preview' && req.method === 'POST') return json(res,200,core.universe.operations.previewUpgrades(checkedChar(url),await body(req,1_000_000)));
        if (path === '/universe/upgrades/import' && req.method === 'POST') return json(res,200,core.universe.operations.importUpgrades(checkedChar(url),await body(req,1_000_000)));
        if (path === '/universe/upgrades/export' && read) {
            const result=core.universe.operations.exportUpgrades(checkedChar(url),{format:url.searchParams.get('format')||'smt',system_id:url.searchParams.get('system')||undefined,map_id:url.searchParams.get('map_id')});
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="kairo-infrastructure.'+(result.format==='json'?'json':'txt')+'"','Cache-Control':'no-store'});
            return res.end(result.text);
        }
        for (const [collection,save,remove] of [['signatures','saveSignature','removeSignature'],['upgrades','saveUpgrade','removeUpgrade']]) {
            if (path === '/universe/'+collection && req.method === 'POST') return json(res,200,core.universe.operations[save](checkedChar(url),await body(req)));
            if (path.startsWith('/universe/'+collection+'/') && req.method === 'DELETE') return json(res,200,core.universe.operations[remove](checkedChar(url),decodeURIComponent(path.split('/')[3]),url.searchParams.get('map_id')));
        }
        if (path === '/universe/operations/refresh' && req.method === 'POST') return json(res,200,await core.universe.operations.refresh(checkedChar(url),url.searchParams.get('map_id')));
        if (path === '/universe/feeds' && read) return json(res,200,core.universe.feeds.state());
        if (path === '/universe/feeds/config' && read) return json(res,200,core.universe.feeds.config());
        if (path === '/universe/feeds/config' && req.method === 'PUT') return json(res,200,core.universe.feeds.saveConfig(await body(req)));
        if (path === '/universe/feeds/refresh' && req.method === 'POST') return json(res,200,await core.universe.feeds.refresh(await body(req)));
        if (path === '/universe/feeds/import' && req.method === 'POST') return json(res,200,core.universe.feeds.importData(await body(req)));
        if (path === '/universe/feeds/storms' && req.method === 'PUT') { const input=await body(req); return json(res,200,core.universe.feeds.saveStorms(Array.isArray(input)?input:input.items)); }
        if (path === '/universe/navigation' && read) return json(res,200,core.universe.navigation.state(checkedChar(url),url.searchParams.get('map_id')));
        if (path === '/universe/navigation/itinerary' && req.method === 'PUT') return json(res,200,core.universe.navigation.saveItinerary(checkedChar(url),await body(req)));
        if (path === '/universe/navigation/itinerary' && req.method === 'DELETE') return json(res,200,core.universe.navigation.clearItinerary(checkedChar(url),url.searchParams.get('map_id')));
        if (/^\/universe\/navigation\/stops\/[^/]+$/.test(path) && req.method === 'DELETE') return json(res,200,core.universe.navigation.removeStop(checkedChar(url),decodeURIComponent(path.split('/')[4]),url.searchParams.get('map_id')));
        for (const [action,method] of [['reorder','reorderStops'],['plan','plan'],['waypoints','sendWaypoints'],['bridges','discoverBridges'],['reachability','reachability']]) {
            if (path === '/universe/navigation/'+action && req.method === 'POST') return json(res,200,await core.universe.navigation[method](checkedChar(url),await body(req)));
        }
        if (path === '/universe/links/preview' && req.method === 'POST') return json(res,200,core.universe.previewLinks(checkedChar(url),await body(req,2_000_000)));
        if (/^\/universe\/link-lists\/[^/]+\/export$/.test(path) && read) {
            const result=core.universe.exportLinks(checkedChar(url),decodeURIComponent(path.split('/')[3]));
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="kairo-ansiblex-smt.txt"','Cache-Control':'no-store'});
            return res.end(result.text);
        }
        if (path === '/universe/politics/config' && read) return json(res, 200, core.universe.politicsConfig());
        if (path === '/universe/politics/config' && req.method === 'PUT') {
            const config = core.universe.savePoliticsConfig(await body(req));
            core.publish({ type: 'universe.politics_configured', module: 'universe', summary: 'Updated Universe power blocs', payload: { revision: config.revision } });
            return json(res, 200, config);
        }
        if (path === '/universe/politics' && read) return json(res, 200, core.universe.politicsState());
        if (path === '/universe/politics' && req.method === 'POST') {
            const result = core.universe.refreshPolitics({ force: true });
            return json(res, 200, result);
        }
        if (path === '/universe/politics/alliances' && read) return json(res, 200, { items: core.universe.politicsAlliances(String(url.searchParams.get('q') || '').slice(0, 150)) });
        if (path === '/universe/politics/alliances/resolve' && req.method === 'POST') {
            const input = await body(req), query = typeof input.query === 'string' ? input.query.trim() : '';
            if (!query || query.length > 150) throw new Error('Enter an exact alliance name or alliance ID.');
            const known = core.universe.politicsAlliances(query).find(alliance => String(alliance.alliance_id) === query || alliance.name.toLowerCase() === query.toLowerCase());
            if (known) return json(res, 200, known);
            let allianceId;
            if (/^\d+$/.test(query)) allianceId = Number(query);
            else {
                const result = await esi.request('/universe/ids', { method: 'POST', body: [query], ttl: 86400 });
                if (result.stale) throw new Error('Alliance lookup is temporarily unavailable. Try again once ESI is reachable.');
                allianceId = result.data.alliances?.find(item => item.name?.toLowerCase() === query.toLowerCase())?.id;
            }
            if (!Number.isSafeInteger(allianceId) || allianceId <= 0 || allianceId >= 2147483647) throw new Error('No alliance matched. Use its full in-game name or alliance ID.');
            const result = await esi.request('/alliances/' + allianceId, { ttl: 86400 });
            if (result.stale || typeof result.data?.name !== 'string' || !result.data.name.trim()) throw new Error('The alliance could not be verified. Try again once ESI is reachable.');
            core.rememberNames({ [allianceId]: result.data.name });
            return json(res, 200, { alliance_id: allianceId, name: result.data.name, ticker: result.data.ticker || null });
        }
        if (/^\/universe\/systems\/\d+$/.test(path) && read) return json(res, 200, await universeDetail(checkedChar(url), Number(path.split('/')[3])));
        if (path === '/universe/search' && req.method === 'POST') {
            const { name } = await body(req);
            const system = core.universe.static().systems.find(s => s.name.toLowerCase() === String(name || '').trim().toLowerCase());
            if (!system) throw new Error('No solar system with that name was found.');
            return json(res, 200, await universeDetail(checkedChar(url), system.system_id));
        }
        if (path === '/universe/route' && req.method === 'POST') return json(res, 200, core.universe.route(checkedChar(url), await body(req)));
        if (path === '/universe/jump-plan' && req.method === 'POST') return json(res, 200, core.universe.jump(checkedChar(url), await body(req)));
        if (path === '/universe/links/prune-expired' && req.method === 'POST') return json(res,200,core.universe.pruneExpired(checkedChar(url)));
        if (path === '/universe/structures/verify' && req.method === 'POST') return json(res, 200, await core.universe.verifyStructure(checkedChar(url), (await body(req)).structureId));
        for (const [collection, save, remove] of [['views', 'saveView', 'deleteView'], ['links', 'saveLink', 'deleteLink'], ['link-lists', 'saveLinkList', 'deleteLinkList'], ['pins', 'savePin', 'deletePin']]) {
            if (path === '/universe/' + collection && req.method === 'POST') return json(res, 200, core.universe[save](checkedChar(url), await body(req, collection==='link-lists'?2_000_000:150000)));
            if (path.startsWith('/universe/' + collection + '/') && req.method === 'DELETE') return json(res, 200, core.universe[remove](checkedChar(url), decodeURIComponent(path.split('/')[3])));
        }
        if (path === '/export' && read) {
            res.setHeader('Content-Disposition', 'attachment; filename="kairo-history.json"');
            return json(res, 200, { exportedAt: new Date().toISOString(), version:8,universe:core.universe.exportUserData(),allianceCombatRecords:store.db.prepare('SELECT * FROM alliance_combat_records').all(),marketImportPlans:store.db.prepare('SELECT body FROM market_import_plans ORDER BY updated').all().map(r=>JSON.parse(r.body)),marketImportSettings:store.db.prepare("SELECT key,value FROM settings WHERE key LIKE 'market:imports:%'").all().map(r=>({key:r.key,value:JSON.parse(r.value)})),marketHubs:store.db.prepare('SELECT * FROM market_hubs').all(),marketQuickSupplies:store.get('market:quick',null),goalTracking:store.db.prepare('SELECT * FROM goal_tracking').all(),goalProgressEntries:store.db.prepare('SELECT * FROM goal_progress_entries').all(),hiddenJourneyLinks:store.db.prepare('SELECT * FROM journey_hidden_links').all(),combatRecords:store.db.prepare('SELECT * FROM combat_records').all(),places:store.db.prepare('SELECT * FROM place_notes').all(),characters: auth.characters().map(({ id, name }) => ({ id, name })), goals: store.db.prepare('SELECT * FROM goals').all(), notes: store.db.prepare('SELECT * FROM notes').all(), events: store.db.prepare('SELECT * FROM events ORDER BY at').all(), visits: store.db.prepare('SELECT * FROM visits ORDER BY at').all(), sessions: store.db.prepare('SELECT * FROM sessions').all(), stream: core.stream.config() });
        }
        if (path.startsWith('/modules/') && read) {
            const m = core.registry.modules.find(m => m.id === path.split('/')[2]);
            if (m && core.registry.enabled(m) && m.read)
                return json(res, 200, await m.read({ db: store.db, store, characterId: checkedChar(url) }));
        }
        return json(res, 404, { error: 'Kairo route not found.' });
    }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.rsc': 'text/x-component', '.txt': 'text/plain' };
    const clientDir = options.clientDir || [join(root, 'out'), join(root, 'dist', 'client'), join(root, 'dist')].find(d => existsSync(join(d, 'index.html'))) || join(root, 'dist', 'client');
    async function staticFile(res, pathname, base) { const raw = decodeURIComponent(pathname); if (raw.includes('\0') || raw.includes('\\'))
        return json(res, 400, { error: 'Invalid path.' }); const file = resolve(base, '.' + raw); if (!file.startsWith(base + sep) && file !== base)
        return json(res, 403, { error: 'Invalid path.' }); for (const p of [file, file + '.html', join(file, 'index.html')]) {
        try {
            if ((await stat(p)).isFile()) {
                const type = mime[extname(p)] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') || base === join(root, 'public', 'stream') ? 'no-store' : 'public, max-age=3600' });
                res.end(await readFile(p));
                return;
            }
        }
        catch { }
    } return json(res, 404, { error: 'Page not found.' }); }
    const handleDashboard = async (req, res) => {
        pageHeaders(res);
        if (stopping) {res.setHeader('Retry-After', '2'); return json(res, 503, {error: 'Kairo is reconnecting after a dataset update.'});}
        try {
            if (!validHost(req.headers.host, port))
                return json(res, 403, { error: 'Kairo only accepts local requests.' });
            const url = new URL(req.url, origin);
            if (req.headers.host === `localhost:${port}` && req.method === 'GET' && !url.pathname.startsWith('/api/')) { res.writeHead(302, { Location: origin + url.pathname + url.search }); return res.end(); }
            if (url.pathname === '/auth/eve/callback') {
                const s = session(req);
                if (!s)
                    throw new Error('Return to Kairo and start sign-in again.');
                if (url.searchParams.has('error')) {
                    res.writeHead(303, { Location: '/?auth=cancelled#connections' });
                    return res.end();
                }
                try {
                    const identity = await auth.callback(s.key, url.searchParams.get('state'), url.searchParams.get('code'));
                    core.requestSync(identity.id);
                    res.writeHead(303, { Location: '/?auth=connected#connections' });
                    return res.end();
                }
                catch {
                    res.writeHead(303, { Location: '/?auth=failed#connections' });
                    return res.end();
                }
            }
            if (url.pathname.startsWith('/api/')) {
                const s = session(req);
                if (!s || !isOwn(req))
                    return json(res, 401, { error: 'Open Kairo on this computer to start your session.' });
                return await api(req, res, url, s);
            }
            if (url.pathname.startsWith('/stream')) {
                res.writeHead(302, { Location: streamOrigin + url.pathname });
                return res.end();
            }
            if (!['GET', 'HEAD'].includes(req.method))
                return json(res, 405, { error: 'Method not allowed.' });
            if (url.pathname === '/' && !session(req))
                establish(res);
            await staticFile(res, url.pathname, clientDir);
        }
        catch (e) {
            if (!res.headersSent)
                json(res, e.status === 409 ? 409 : 400, { error: e.message || 'Kairo could not complete the request.' });
            else
                res.end();
        }
    };
    const dashboard = createServer((req, res) => {
        const work = handleDashboard(req, res);
        requests.add(work);
        work.then(() => requests.delete(work), () => requests.delete(work));
    });
    const broadcast = createServer(async (req, res) => { res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors ${origin}; base-uri 'none'; form-action 'none'`); try {
        if (!validHost(req.headers.host, streamPort))
            return json(res, 403, { error: 'Local requests only.' });
        if (req.method !== 'GET')
            return json(res, 405, { error: 'Read-only stream output.' });
        const url = new URL(req.url, streamOrigin);
        if (url.pathname === '/state')
            return json(res, 200, core.stream.state());
        if (url.pathname === '/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
            return core.stream.connect(res);
        }
        if (url.pathname === '/' || url.pathname.startsWith('/stream'))
            return staticFile(res, '/index.html', join(root, 'public', 'stream'));
        if (['/render.js', '/render.css', '/widgets.css'].includes(url.pathname))
            return staticFile(res, url.pathname, join(root, 'public', 'stream'));
        return json(res, 404, { error: 'Stream route not found.' });
    }
    catch {
        if (!res.headersSent)
            json(res, 500, { error: 'Stream output is reconnecting.' });
        else
            res.end();
    } });
    const listen = (s, p) => new Promise((resolve, reject) => { s.once('error', reject); s.listen(p, '127.0.0.1', resolve); });
    try {
        await listen(dashboard, port);
        await listen(broadcast, streamPort);
    }
    catch (e) {
        dashboard.close();
        broadcast.close();
        await datasets.close();
        await core.close();
        store.close();
        throw e;
    }
    if (!options.noSync) {
        core.syncProtection();
        core.sync(0);
        for (const c of auth.characters())
            if (!c.needsReauth) core.sync(c.id);
    }
    if (!options.deferDatasetStart) datasets.start();
    return {origin, streamOrigin, store, core, auth, dashboard, broadcast, datasets,
        startDatasetUpdates: () => datasets.start(), cancelDatasetRestart,
        exportSessions: () => [...sessions].filter(([, value]) => value.expires > Date.now()),
        close() {
            if (closing) return closing;
            stopping = true; clearTimeout(restartTimer);
            closing = (async () => {
                await datasets.close();
                for (const client of core.uiClients) client.end();
                core.uiClients.clear();
                // Drain the handlers themselves, including writes whose client
                // disconnected early, before collectors and SQLite are closed.
                await Promise.allSettled([...requests]);
                await core.close();
                dashboard.closeAllConnections(); broadcast.closeAllConnections();
                await Promise.all([new Promise(r => dashboard.close(r)), new Promise(r => broadcast.close(r))]);
                store.close();
            })();
            return closing;
        },
    };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const {runKairoSupervisor} = await import('./runtime-supervisor.mjs');
        const supervisor = await runKairoSupervisor({openBrowser: process.argv.includes('--open')});
        process.exitCode = await supervisor.done;
    }
    catch (e) {
        console.error(e.code === 'EADDRINUSE' ? 'Kairo is already running, or a local port is occupied. Open http://127.0.0.1:4380.' : e.message);
        process.exit(1);
    }
}
