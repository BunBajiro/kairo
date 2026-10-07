import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compactHistoryCache } from './market-history-store.mjs';
export function openStore(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(join(dir, 'kairo.sqlite'));
    try {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS characters(id INTEGER PRIMARY KEY,name TEXT NOT NULL,scopes TEXT NOT NULL,tokens TEXT NOT NULL,owner TEXT,reauth INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,body TEXT NOT NULL,etag TEXT,expires INTEGER NOT NULL,updated INTEGER NOT NULL,headers TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS snapshots(character_id INTEGER NOT NULL,key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(character_id,key));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,character_id INTEGER,type TEXT NOT NULL,module TEXT NOT NULL,summary TEXT NOT NULL,payload TEXT NOT NULL,at TEXT NOT NULL,dedupe TEXT UNIQUE);
 CREATE INDEX IF NOT EXISTS idx_events_character_at ON events(character_id,at DESC);
 CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,character_id INTEGER,title TEXT NOT NULL,target REAL NOT NULL,progress REAL NOT NULL,kind TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,character_id INTEGER,body TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY AUTOINCREMENT,character_id INTEGER NOT NULL,system_id INTEGER NOT NULL,name TEXT NOT NULL,ship_type_id INTEGER,at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_visits_character_at ON visits(character_id,at DESC);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,character_id INTEGER NOT NULL,label TEXT NOT NULL,started TEXT NOT NULL,ended TEXT);
 CREATE TABLE IF NOT EXISTS module_data(module TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(module,key));
 INSERT OR IGNORE INTO migrations VALUES('core-v1',datetime('now'));`);
    if (!db.prepare("SELECT id FROM migrations WHERE id='core-v2'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE sessions ADD COLUMN start_context TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE sessions ADD COLUMN end_context TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE sessions ADD COLUMN notes TEXT NOT NULL DEFAULT '';
        CREATE TABLE universe_systems(system_id INTEGER PRIMARY KEY,name TEXT NOT NULL,constellation_id INTEGER,constellation_name TEXT,region_id INTEGER,region_name TEXT,security REAL,x REAL,y REAL,z REAL);
        CREATE TABLE place_notes(kind TEXT NOT NULL,entity_id INTEGER NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,tags TEXT NOT NULL,status TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,entity_id));
        CREATE INDEX idx_sessions_character_started ON sessions(character_id,started DESC);
        INSERT INTO migrations VALUES('core-v2',datetime('now')); COMMIT;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='core-v4'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE journey_hidden_links(character_id INTEGER NOT NULL,from_visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,to_visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,hidden_at TEXT NOT NULL,PRIMARY KEY(character_id,from_visit_id,to_visit_id));
        CREATE TABLE goal_tracking(goal_id TEXT PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,source TEXT NOT NULL,type_id INTEGER,state TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'waiting',detail TEXT NOT NULL DEFAULT '',updated_at TEXT,completed_at TEXT);
        CREATE TABLE goal_progress_entries(goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,entry_key TEXT NOT NULL,observed REAL NOT NULL,credited REAL NOT NULL DEFAULT 0,PRIMARY KEY(goal_id,entry_key));
        CREATE TABLE combat_records(character_id INTEGER NOT NULL,killmail_id INTEGER NOT NULL,result TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(character_id,killmail_id));
        CREATE INDEX idx_combat_character_at ON combat_records(character_id,at DESC);
        UPDATE events SET at=strftime('%Y-%m-%dT%H:%M:%fZ',at) WHERE type IN ('killmail.kill','killmail.loss') AND strftime('%Y-%m-%dT%H:%M:%fZ',at) IS NOT NULL;
        INSERT INTO migrations VALUES('core-v4',datetime('now')); COMMIT;
        PRAGMA optimize;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='core-v5'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE market_hubs(id INTEGER PRIMARY KEY,name TEXT NOT NULL,station_name TEXT NOT NULL,kind TEXT NOT NULL,system_id INTEGER NOT NULL,system_name TEXT NOT NULL,region_id INTEGER NOT NULL,region_name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,builtin INTEGER NOT NULL DEFAULT 0,last_scan TEXT,last_full_scan TEXT);
        CREATE TABLE market_types(type_id INTEGER PRIMARY KEY,name TEXT NOT NULL,group_name TEXT,volume REAL);
        CREATE TABLE market_jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL);
        CREATE TABLE market_orders(hub_id INTEGER NOT NULL,order_id INTEGER NOT NULL,type_id INTEGER NOT NULL,buy INTEGER NOT NULL,price REAL NOT NULL,volume INTEGER NOT NULL,minimum INTEGER NOT NULL,range TEXT NOT NULL,issued TEXT NOT NULL,duration INTEGER NOT NULL,PRIMARY KEY(hub_id,order_id));
        CREATE INDEX idx_market_orders_type ON market_orders(hub_id,type_id,buy,price);
        CREATE TABLE market_items(hub_id INTEGER NOT NULL,type_id INTEGER NOT NULL,buy REAL,sell REAL,sell_average REAL,sell_volume INTEGER NOT NULL,buy_volume INTEGER NOT NULL,sell_orders INTEGER NOT NULL,buy_orders INTEGER NOT NULL,observed TEXT NOT NULL,expires TEXT NOT NULL,scan_id TEXT NOT NULL,PRIMARY KEY(hub_id,type_id));
        CREATE TABLE market_history(region_id INTEGER NOT NULL,type_id INTEGER NOT NULL,body TEXT NOT NULL,updated TEXT NOT NULL,expires TEXT NOT NULL,daily_volume REAL,average REAL,reported_days INTEGER,period_from TEXT,period_to TEXT,PRIMARY KEY(region_id,type_id));
        CREATE TABLE market_stage(job_id TEXT NOT NULL,hub_id INTEGER NOT NULL,order_id INTEGER NOT NULL,type_id INTEGER NOT NULL,buy INTEGER NOT NULL,price REAL NOT NULL,volume INTEGER NOT NULL,minimum INTEGER NOT NULL,range TEXT NOT NULL,issued TEXT NOT NULL,duration INTEGER NOT NULL,PRIMARY KEY(job_id,hub_id,order_id));
        CREATE INDEX idx_market_stage_type ON market_stage(job_id,hub_id,type_id);
        INSERT INTO migrations VALUES('core-v5',datetime('now')); COMMIT; PRAGMA optimize;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='core-v6'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE market_history_days(region_id INTEGER NOT NULL,type_id INTEGER NOT NULL,date TEXT NOT NULL,average REAL NOT NULL,highest REAL NOT NULL,lowest REAL NOT NULL,volume INTEGER NOT NULL,order_count INTEGER NOT NULL,modified TEXT NOT NULL,PRIMARY KEY(region_id,type_id,date));
        CREATE INDEX idx_market_history_date ON market_history_days(date);
        CREATE TABLE market_history_archives(date TEXT PRIMARY KEY,total INTEGER NOT NULL,records INTEGER NOT NULL,updated TEXT NOT NULL);
        CREATE TABLE market_history_meta(region_id INTEGER NOT NULL,type_id INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(region_id,type_id));
        CREATE TABLE market_import_plans(id TEXT PRIMARY KEY,hub_id INTEGER NOT NULL,updated TEXT NOT NULL,body TEXT NOT NULL);
        CREATE INDEX idx_market_import_plans_hub ON market_import_plans(hub_id,updated DESC);
        INSERT INTO migrations VALUES('core-v6',datetime('now')); COMMIT; PRAGMA optimize;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='market-rebuild-v6'").get()) {
        const oldHubs=db.prepare('SELECT * FROM market_hubs WHERE enabled=1 AND last_scan IS NOT NULL').all();
        const queue=oldHubs.map(h=>{const s=JSON.parse(h.last_scan);return {hubId:h.id,mode:h.last_full_scan?'full':'quick',characterId:s.characterId||0};});
        if(queue.length&&!queue.some(h=>h.hubId===60003760))queue.push({hubId:60003760,mode:queue.some(h=>h.mode==='full')?'full':'quick',characterId:0});
        queue.sort((a,b)=>(a.hubId===60003760?-1:0)-(b.hubId===60003760?-1:0));
        db.exec('BEGIN IMMEDIATE');
        db.exec(`DELETE FROM market_orders; DELETE FROM market_items; DELETE FROM market_history; DELETE FROM market_history_meta; DELETE FROM market_history_days; DELETE FROM market_history_archives; DELETE FROM market_stage; UPDATE market_hubs SET last_scan=NULL,last_full_scan=NULL;
        DELETE FROM cache WHERE instr(key,':GET:/markets/')>0 AND (instr(key,'/orders')>0 OR instr(key,'/history')>0 OR instr(key,'/structures/')>0);
        DELETE FROM settings WHERE key LIKE 'market:everef:%';`);
        if(queue.length)db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('market:upgrade',JSON.stringify({queue,total:queue.length,completed:0,paused:false,detail:'Older market books have been retired. Fresh scans are queued for your previously scanned hubs.'}));
        db.prepare("INSERT INTO migrations VALUES('market-rebuild-v6',datetime('now'))").run();db.exec('COMMIT');
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='sessions-v071'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE alliance_combat_records(alliance_id INTEGER NOT NULL,killmail_id INTEGER NOT NULL,system_id INTEGER NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(alliance_id,killmail_id));
        CREATE INDEX idx_alliance_combat_system_at ON alliance_combat_records(alliance_id,system_id,at);
        INSERT INTO migrations VALUES('sessions-v071',datetime('now')); COMMIT;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='session-combat-eligibility-v080'").get()) {
        db.exec(`BEGIN IMMEDIATE;
            CREATE INDEX idx_sessions_character_ended ON sessions(character_id,ended);
            INSERT INTO migrations VALUES('session-combat-eligibility-v080',datetime('now')); COMMIT;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='database-v073'").get()) {
        db.exec('BEGIN IMMEDIATE');
        db.exec('CREATE INDEX IF NOT EXISTS idx_events_character_type_at ON events(character_id,type,at)');
        compactHistoryCache(db);
        db.prepare("INSERT INTO migrations VALUES('database-v073',datetime('now'))").run();
        db.exec('COMMIT');
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='visits-sovereignty-v080'").get()) {
        db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE visits ADD COLUMN sovereignty_at_visit TEXT;
        INSERT INTO migrations VALUES('visits-sovereignty-v080',datetime('now')); COMMIT;`);
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='session-travel-v080'").get()) {
        db.exec('BEGIN IMMEDIATE');
        db.exec(`ALTER TABLE visits ADD COLUMN session_id TEXT;
            CREATE TABLE discovered_systems(character_id INTEGER NOT NULL,system_id INTEGER NOT NULL,
                PRIMARY KEY(character_id,system_id));
            INSERT OR IGNORE INTO discovered_systems(character_id,system_id)
                SELECT character_id,system_id FROM visits WHERE character_id>0 AND system_id>0;
            INSERT INTO migrations VALUES('session-travel-v080',datetime('now'));`);
        db.exec('COMMIT');
    }
    if (!db.prepare("SELECT id FROM migrations WHERE id='cache-retention-v080'").get()) {
        db.exec(`BEGIN IMMEDIATE;
            CREATE TABLE cache_usage(key TEXT PRIMARY KEY REFERENCES cache(key) ON DELETE CASCADE,last_used INTEGER NOT NULL);
            CREATE INDEX idx_cache_updated_key ON cache(updated,key);
            ALTER TABLE market_jobs ADD COLUMN terminal INTEGER GENERATED ALWAYS AS
                (CASE WHEN json_extract(body,'$.status') IN ('complete','cancelled','failed','interrupted') THEN 1 ELSE 0 END) VIRTUAL;
            CREATE INDEX idx_market_jobs_terminal ON market_jobs(terminal) WHERE terminal=1;
            CREATE INDEX idx_market_jobs_running ON market_jobs(json_extract(body,'$.status')) WHERE json_extract(body,'$.status')='running';
            INSERT INTO migrations VALUES('cache-retention-v080',datetime('now')); COMMIT;`);
    }
    try {
        chmodSync(join(dir, 'kairo.sqlite'), 0o600);
    }
    catch { }
    const setting = db.prepare('SELECT value FROM settings WHERE key=?');
    const saveSetting = db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    const snapshot = db.prepare('SELECT body FROM snapshots WHERE character_id=? AND key=?');
    // Scheduling never needs the potentially large data array. Read metadata
    // directly so callers retain fresh values even after raw SQL or rollback.
    const metadata = db.prepare(`SELECT json_extract(body,'$.status') status,
        json_extract(body,'$.scope') scope, json_extract(body,'$.ownerId') ownerId,
        json_extract(body,'$.refreshAt') refreshAt, json_extract(body,'$.expiresAt') expiresAt,
        json_extract(body,'$.retryAt') retryAt FROM snapshots WHERE character_id=? AND key=?`);
    const saveSnapshot = db.prepare('INSERT INTO snapshots VALUES(?,?,?) ON CONFLICT(character_id,key) DO UPDATE SET body=excluded.body');
    // A UI-only revision avoids comparing/stringifying large decoded payloads.
    // Every production snapshot write uses saveSnapshot. Missing rows are given
    // a distinct marker by Core, so an auth reset cannot reuse the deleted body.
    const snapshotEpoch = randomUUID(), snapshotVersions = new Map();
    return {
        db,
        get(key, fallback) { const row = setting.get(key); return row ? JSON.parse(row.value) : fallback; },
        set: (key, value) => saveSetting.run(key, JSON.stringify(value)),
        snapshot(id, key) { const row = snapshot.get(id, key); return row ? JSON.parse(row.body) : null; },
        snapshotMetadata: (id, key) => metadata.get(id, key) || null,
        snapshotRevision: (id, key) => `${snapshotEpoch}:${id}:${key}:${snapshotVersions.get(id + ':' + key) || 0}`,
        saveSnapshot(id, key, value) { const result = saveSnapshot.run(id, key, JSON.stringify(value)); const entry = id + ':' + key; snapshotVersions.set(entry, (snapshotVersions.get(entry) || 0) + 1); return result; },
        close: () => db.close(),
    };
    } catch (error) {
        // Failed construction never transfers this handle to a caller.
        // Closing SQLite also rolls back any unfinished migration transaction.
        try { db.close(); } catch (cleanup) {
            try { Object.defineProperty(error, 'cleanupErrors', {value: [...(error.cleanupErrors || []), cleanup], configurable: true}); } catch {}
        }
        throw error;
    }
}
