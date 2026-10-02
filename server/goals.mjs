import {randomUUID} from 'node:crypto';
import {catalog} from './modules/catalog.mjs';
import {snapshotFresh} from './polling.mjs';

export const goalSources=[
 {id:'manual',label:'Manual checklist / counter',unit:'steps',description:'Update progress yourself.'},
 {id:'wallet.balance',label:'Wallet balance',unit:'ISK',key:'wallet',description:'Reach a balance in your character wallet. Transfers and spending affect progress.'},
 {id:'wallet.income',label:'ISK received',unit:'ISK',key:'journal',description:'Accumulate positive wallet journal entries dated after creation, including transfers and refunds.'},
 {id:'skill.level',label:'Train a skill',unit:'level',key:'skills',type:true,description:'Reach a trained skill level, including completed entries in a fresh skill queue.'},
 {id:'assets.quantity',label:'Collect an item',unit:'items',key:'assets',type:true,description:'Own this quantity across your character’s assets, including items inside containers and ships.'},
 {id:'mining.quantity',label:'Mine a resource',unit:'units',key:'mining',type:true,description:'Count newly reported units after the starting sample. ESI groups mining by day; this is not an exact start-time measure.'},
 {id:'industry.runs',label:'Complete manufacturing runs',unit:'runs',key:'jobs',type:true,description:'Count manufacturing runs for this product that finish after creation and are reported ready or delivered.'},
 {id:'combat.kills',label:'Participate in kills',unit:'kills',key:'killmails',description:'Count verified killmail participation dated after creation, including assisted kills. Public records can arrive late.'}
];
const sources = new Map(goalSources.map(source => [source.id, source]));
const sourceFor = id => sources.get(id);
const datasets = new Map(catalog.flatMap(module => module.datasets.map(dataset => [dataset.key, { module, dataset }])));

// One request/refresh owns its inputs. Never retain decoded ESI data or computed
// totals across calls: freshness, modules, access and source windows can change.
function prepareGoalInputs(store, auth, characterId, now = Date.now()) {
    const character = auth.characters().find(c => c.id === characterId);
    const snapshots = new Map(), settings = new Map(), states = new Map(), prepared = new Map();
    const snapshot = key => { if (!snapshots.has(key)) snapshots.set(key, store.snapshot(characterId, key)); return snapshots.get(key); };
    const setting = (key, fallback) => { if (!settings.has(key)) settings.set(key, store.get(key, fallback)); return settings.get(key); };
    function snapshotState(key) {
        if (states.has(key)) return states.get(key);
        const { module, dataset } = datasets.get(key) || {};
        let state;
        if (!character || character.needsReauth) state = { status: 'disconnected', detail: 'Reconnect this character to resume tracking.' };
        else if (module && !setting('module:' + module.id, true)) state = { status: 'disabled', detail: 'Enable ' + module.name + ' to resume tracking.' };
        else if (dataset?.scope && !character.scopes?.includes(dataset.scope)) state = { status: 'missing_scope', detail: 'Update EVE access to grant ' + dataset.scope + '.' };
        else {
            const sample = snapshot(key);
            if (!sample?.data && sample?.data !== 0) state = { status: sample?.status || 'waiting', detail: sample?.error || 'Waiting for the first ESI sample.' };
            else if (!snapshotFresh(sample, now) || sample.truncated) state = { status: 'stale', detail: 'Progress is retained while a fresh, complete ESI sample is collected.', updatedAt: sample.updatedAt };
            else if (key === 'wallet' ? typeof sample.data !== 'number' || !Number.isFinite(sample.data) : key === 'skills' ? !Array.isArray(sample.data?.skills) : !Array.isArray(sample.data))
                state = { status: 'error', detail: 'The ESI sample is incomplete. Progress is retained until a valid sample arrives.' };
            else state = { ...sample, status: 'ready', detail: 'Tracking automatically from ESI.' };
        }
        states.set(key, state); return state;
    }
    function killState() {
        if (states.has('combat.kills')) return states.get('combat.kills');
        let state;
        if (!character || character.needsReauth) state = { status: 'disconnected', detail: 'Reconnect this character to resume tracking.' };
        else if (!setting('module:combat', true)) state = { status: 'disabled', detail: 'Enable Combat record to resume tracking.' };
        else {
            const esi = snapshotState('killmails'), feed = snapshot('combat_public');
            state = feed?.status === 'ready' && Date.parse(feed.expiresAt || '') > now
                ? { status: 'ready', detail: 'Verified participation; public killmails can be delayed.', updatedAt: feed.updatedAt }
                : { status: 'partial', detail: 'Confirmed kills count; additional public participation records are awaiting collection.', updatedAt: esi.updatedAt || feed?.updatedAt };
        }
        states.set('combat.kills', state); return state;
    }
    return { now, snapshot, snapshotState, names: () => setting('names', {}),
        state: source => source.id === 'combat.kills' ? killState() : snapshotState(source.key),
        prepare(key, build) { if (!prepared.has(key)) prepared.set(key, build()); return prepared.get(key); } };
}

export function goalSourceOptions(store, auth, characterId) {
    const inputs = prepareGoalInputs(store, auth, characterId), names = inputs.names(), types = new Map();
    for (const [key, idField] of [['assets', 'type_id'], ['mining', 'type_id'], ['jobs', 'product_type_id'], ['queue', 'skill_id']])
        for (const row of inputs.snapshot(key)?.data || []) if (row[idField]) types.set(row[idField], { id: row[idField], name: names[row[idField]] || 'Type ' + row[idField], skill: idField === 'skill_id' });
    for (const skill of inputs.snapshot('skills')?.data?.skills || []) types.set(skill.skill_id, { id: skill.skill_id, name: names[skill.skill_id] || 'Skill ' + skill.skill_id, skill: true });
    return { sources: goalSources.map(source => {
        if (!source.key) return { ...source };
        const state = inputs.state(source);
        return { ...source, availability: { status: state.status, detail: state.detail, updatedAt: state.updatedAt } };
    }), types: [...types.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400) };
}

export async function lookupGoalType(store, esi, input, rememberNames) {
    const name = String(input.name || '').trim().slice(0, 100); let id = Number(input.typeId || 0);
    if (!id) {
        if (!name) throw new Error('Enter an exact EVE item or skill name.');
        const result = await esi.request('/universe/ids', { method: 'POST', body: [name], ttl: 86400 });
        id = result.data.inventory_types?.find(type => type.name.toLowerCase() === name.toLowerCase())?.id;
    }
    if (!Number.isSafeInteger(id) || id < 1 || id >= 2147483647) throw new Error('No item or skill matched. Use its exact in-game name.');
    const type = (await esi.request('/universe/types/' + id, { ttl: 86400 })).data;
    const group = (await esi.request('/universe/groups/' + type.group_id, { ttl: 86400 })).data;
    if (rememberNames) rememberNames({ [id]: type.name });
    else { const names = store.get('names', {}); names[id] = type.name; store.set('names', names); }
    return { id, name: type.name, categoryId: group.category_id };
}

export function listGoals(store, auth, characterId) {
    const inputs = prepareGoalInputs(store, auth, characterId);
    return store.db.prepare(`SELECT g.*,t.goal_id tracking_id,t.source tracking_source,t.type_id tracking_type_id,
        t.status tracking_status,t.detail tracking_detail,t.updated_at tracking_updated_at,t.completed_at tracking_completed_at
        FROM goals g LEFT JOIN goal_tracking t ON t.goal_id=g.id WHERE g.character_id=? ORDER BY g.done,g.created DESC`)
        .all(characterId).map(row => {
            const { tracking_id, tracking_source, tracking_type_id, tracking_status, tracking_detail,
                tracking_updated_at, tracking_completed_at, ...goal } = row;
            if (!tracking_id) return { ...goal, source: 'manual', unit: 'steps' };
            const source = sourceFor(tracking_source), state = goal.done
                ? { status: 'completed', detail: 'Milestone reached. Completion stays recorded.' } : inputs.state(source);
            return { ...goal, source: tracking_source, typeId: tracking_type_id, typeName: inputs.names()[tracking_type_id] || null, unit: source.unit,
                tracking: { status: state.status === 'ready' ? tracking_status : state.status, detail: state.status === 'ready' ? tracking_detail : state.detail,
                    updatedAt: tracking_updated_at, completedAt: tracking_completed_at } };
        });
}

// Keep cutoff-specific accounting per goal, but prepare each shared source once.
function prepareEvaluator(store, inputs, characterId, goals) {
    const byType = (rows, key, mapRow = row => row) => {
        const groups = new Map();
        for (const row of rows) { const type = row[key]; if (!groups.has(type)) groups.set(type, []); groups.get(type).push(mapRow(row)); }
        return groups;
    };
    return (goal, sample) => inputs.prepare(goal.source, () => {
        if (goal.source === 'assets.quantity') {
            const quantities = new Map();
            for (const row of sample.data) { const type = row.type_id; quantities.set(type, (quantities.get(type) || 0) + Math.max(0, Number(row.quantity) || 0)); }
            return quantities;
        }
        if (goal.source === 'skill.level') {
            const levels = new Map();
            for (const skill of sample.data.skills) if (!levels.has(skill.skill_id)) levels.set(skill.skill_id, skill.trained_skill_level || 0);
            const queue = inputs.snapshotState('queue');
            if (queue.status === 'ready') for (const skill of queue.data) if (skill.finish_date && Date.parse(skill.finish_date) <= inputs.now)
                levels.set(skill.skill_id, Math.max(levels.get(skill.skill_id) || 0, skill.finished_level || 0));
            return levels;
        }
        if (goal.source === 'wallet.income') return sample.data.filter(row => row.amount > 0 && row.id && Date.parse(row.date) <= inputs.now)
            .map(row => ({ key: 'journal:' + row.id, quantity: row.amount, at: Date.parse(row.date) }));
        if (goal.source === 'mining.quantity') return byType(sample.data, 'type_id', row => ({ key: row.date + ':' + row.solar_system_id + ':' + row.type_id, quantity: row.quantity, date: row.date }));
        if (goal.source === 'industry.runs') return byType(sample.data.filter(row => row.activity_id === 1 && ['ready', 'delivered'].includes(row.status) && Date.parse(row.end_date) <= inputs.now),
            'product_type_id', row => ({ key: 'job:' + row.job_id, quantity: row.runs, at: Date.parse(row.end_date) }));
        if (goal.source === 'combat.kills') {
            const earliest = goals.filter(row => row.source === 'combat.kills').reduce((value, row) => row.created < value ? row.created : value, goal.created);
            return store.db.prepare("SELECT at FROM combat_records WHERE character_id=? AND result='kill' AND at>=? ORDER BY at").all(characterId, earliest).map(row => row.at);
        }
        return null;
    });
}
const countSince = (times, cutoff) => {
    let lo = 0, hi = times.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] < cutoff) lo = mid + 1; else hi = mid; }
    return times.length - lo;
};
let savepointSequence = 0;
function accountingTransaction(store, update) {
    const name = 'goal_accounting_' + ++savepointSequence;
    store.db.exec('SAVEPOINT ' + name);
    try { const result = update(); store.db.exec('RELEASE ' + name); return result; }
    catch (error) { store.db.exec('ROLLBACK TO ' + name); store.db.exec('RELEASE ' + name); throw error; }
}

export function createGoals(store, auth, publish) {
    const entries = store.db.prepare('SELECT observed,credited FROM goal_progress_entries WHERE goal_id=? AND entry_key=?');
    const put = store.db.prepare(`INSERT INTO goal_progress_entries VALUES(?,?,?,?) ON CONFLICT(goal_id,entry_key)
        DO UPDATE SET observed=excluded.observed,credited=excluded.credited`);
    const total = store.db.prepare('SELECT COALESCE(SUM(credited),0) value FROM goal_progress_entries WHERE goal_id=?');
    const updateGoal = store.db.prepare('UPDATE goals SET progress=?,done=? WHERE id=?');
    const updateTracking = store.db.prepare('UPDATE goal_tracking SET state=?,status=?,detail=?,updated_at=?,completed_at=? WHERE goal_id=?');
    const updateUnavailable = store.db.prepare('UPDATE goal_tracking SET status=?,detail=? WHERE goal_id=?');
    const activeSql = `SELECT g.*,t.source,t.type_id,t.state,t.status,t.detail,t.updated_at,t.completed_at
        FROM goals g JOIN goal_tracking t ON t.goal_id=g.id WHERE g.character_id=? AND g.done=0`;
    const active = store.db.prepare(activeSql), affected = new Map();
    function activeGoals(characterId, changedKey) {
        if (!changedKey) return active.all(characterId);
        if (!affected.has(changedKey)) {
            const ids = goalSources.filter(source => source.key === changedKey || (source.id === 'skill.level' && changedKey === 'queue')).map(source => source.id);
            affected.set(changedKey, ids.length ? { ids, query: store.db.prepare(activeSql + ' AND t.source IN (' + ids.map(() => '?').join(',') + ')') } : null);
        }
        const entry = affected.get(changedKey); return entry ? entry.query.all(characterId, ...entry.ids) : [];
    }
    function accumulate(goal, rows, baseline = false) {
        for (const [key, quantity] of rows) {
            if (!Number.isFinite(quantity) || quantity < 0) continue;
            const old = entries.get(goal.id, key), observed = Math.max(old?.observed || 0, quantity);
            const credited = (old?.credited || 0) + (baseline ? 0 : Math.max(0, quantity - (old?.observed || 0)));
            if (!old || observed !== old.observed || credited !== old.credited) put.run(goal.id, key, observed, credited);
        }
        return total.get(goal.id).value;
    }
    function refresh(characterId, changedKey) {
        const goals = activeGoals(characterId, changedKey);
        if (!goals.length) return 0;
        const inputs = prepareGoalInputs(store, auth, characterId), prepared = prepareEvaluator(store, inputs, characterId, goals);
        const completed = []; let changed = 0;
        accountingTransaction(store, () => {
            for (const goal of goals) {
                const source = sourceFor(goal.source), sample = inputs.state(source), state = JSON.parse(goal.state);
                let detail = sample.detail, progress = goal.progress;
                if (sample.status !== 'ready' && !(goal.source === 'combat.kills' && sample.status === 'partial')) {
                    if (sample.status !== goal.status || detail !== goal.detail) updateUnavailable.run(sample.status, detail, goal.id);
                    continue;
                }
                const data = prepared(goal, sample), created = Date.parse(goal.created);
                if (goal.source === 'wallet.balance') progress = sample.data;
                if (goal.source === 'wallet.income') progress = accumulate(goal, data.filter(row => row.at >= created).map(row => [row.key, row.quantity]));
                if (goal.source === 'skill.level' || goal.source === 'assets.quantity') progress = data.get(goal.type_id) || 0;
                if (goal.source === 'mining.quantity') {
                    const rows = (data.get(goal.type_id) || []).filter(row => row.date >= goal.created.slice(0, 10)).map(row => [row.key, row.quantity]);
                    progress = accumulate(goal, rows, !state.initialized);
                    if (!state.initialized) { state.initialized = true; state.baselineAt = sample.updatedAt || new Date(inputs.now).toISOString(); }
                    detail = 'Newly reported units after the starting sample (' + state.baselineAt + '). Mining is batched by EVE date.';
                }
                if (goal.source === 'industry.runs') progress = accumulate(goal, (data.get(goal.type_id) || []).filter(row => row.at >= created).map(row => [row.key, row.quantity]));
                if (goal.source === 'combat.kills') progress = countSince(data, goal.created);
                if (!Number.isFinite(progress) || progress < 0) continue;
                progress = Math.min(goal.target, progress);
                const done = progress >= goal.target, at = new Date(inputs.now).toISOString(), serializedState = JSON.stringify(state);
                const status = done ? 'completed' : sample.status, nextDetail = done ? 'Milestone reached. Completion stays recorded.' : detail;
                const updatedAt = sample.updatedAt || at, completedAt = done ? at : null;
                if (progress !== goal.progress || done !== !!goal.done) updateGoal.run(progress, done ? 1 : 0, goal.id);
                if (serializedState !== goal.state || status !== goal.status || nextDetail !== goal.detail || updatedAt !== goal.updated_at || completedAt !== goal.completed_at)
                    updateTracking.run(serializedState, status, nextDetail, updatedAt, completedAt, goal.id);
                if (progress !== goal.progress || done) changed++;
                if (done) completed.push({ type: 'goal.completed', module: 'goals', characterId, summary: 'Completed goal: ' + goal.title,
                    payload: { goal_id: goal.id, goal_title: goal.title, progress, target: goal.target }, dedupe: 'goal:' + goal.id + ':completed' });
            }
        });
        // Never announce completion for a batch whose SQL was rolled back.
        for (const event of completed) publish(event);
        return changed;
    }
    function create(characterId, input, verifiedType) {
        const source = sourceFor(input.source || 'manual'), title = String(input.title || '').trim().slice(0, 160), target = Number(input.target ?? 1);
        if (!title) throw new Error('Give your goal a title.');
        if (!source || !Number.isFinite(target) || target <= 0 || target > 1e15) throw new Error('Choose a tracking source and a positive target.');
        if (source.id !== 'manual' && !auth.characters().some(c => c.id === characterId)) throw new Error('Connect a character to create an automatically tracked goal.');
        if (source.type && (!verifiedType || verifiedType.id !== Number(input.typeId))) throw new Error('Look up and select an EVE item or skill.');
        if (source.id === 'skill.level' && (verifiedType.categoryId !== 16 || !Number.isInteger(target) || target > 5)) throw new Error('Select a skill and a whole target level from 1 to 5.');
        if (['assets.quantity', 'mining.quantity', 'industry.runs', 'combat.kills'].includes(source.id) && !Number.isSafeInteger(target)) throw new Error('Use a whole-number target for this goal.');
        const id = randomUUID(), created = new Date().toISOString();
        accountingTransaction(store, () => {
            store.db.prepare('INSERT INTO goals(id,character_id,title,target,progress,kind,done,created) VALUES(?,?,?,?,0,?,0,?)')
                .run(id, characterId, title, target, source.id === 'manual' ? 'manual' : 'esi', created);
            if (source.id !== 'manual') store.db.prepare('INSERT INTO goal_tracking(goal_id,source,type_id) VALUES(?,?,?)').run(id, source.id, source.type ? verifiedType.id : null);
        });
        publish({ type: 'goal.created', module: 'goals', characterId, summary: 'Created goal: ' + title, payload: { goal_id: id, goal_title: title, target, source: source.id } });
        refresh(characterId); return { id };
    }
    return { refresh, create };
}
