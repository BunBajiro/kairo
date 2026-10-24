# Persistence and data ownership

This is the developer storage reference for **0.8.0-rc.17**. Users should follow the [backup, upgrade and recovery guidance](USER-GUIDE.md); [Data retention](DATA-RETENTION.md) owns deletion/expiry policy and [Authentication and security](AUTH-AND-SECURITY.md) owns secret handling.

## Data directory and files

[defaultDataDirectory()](../server/dataset-paths.mjs) selects `KAIRO_DATA_DIR` if set. Otherwise it appends `Kairo` to the first available value of `LOCALAPPDATA`, `XDG_DATA_HOME`, or `~/.local/share`. Thus a typical Windows installation uses `%LOCALAPPDATA%\Kairo`; Linux and macOS without overrides use `~/.local/share/Kairo`. The application directory and data directory are separate.

| File or directory | Owner and purpose |
| --- | --- |
| `kairo.sqlite` | Application settings, connections, cached data, snapshots and durable user/domain records. |
| `kairo.sqlite-wal`, `kairo.sqlite-shm` when present | SQLite WAL state. Do not remove or copy a live database while ignoring these files. |
| `vault.dpapi` on Windows | AES encryption key protected with Windows CurrentUser DPAPI. |
| `vault.key` elsewhere | Base64 AES key stored locally with requested mode `0600`; file-system access is the protection boundary. |
| `datasets/` | Downloaded immutable generations, update state/pointers, cleanup/rejection records and the supervisor's separate SQLite lease. See [Datasets](DATASETS.md). |

The [runtime lease owner](../server/runtime-lock.mjs) creates a new data root with mode `0700` before opening the supervisor lease. [openStore()](../server/store.mjs) restricts the database to `0600` before SQLite can create WAL/SHM files and repairs retained sidecars to `0600`. POSIX permission failures stop startup. Existing configured directories and unrelated parents are not chmod'ed. It opens Node's synchronous SQLite driver with WAL, foreign keys enabled and a 3,000 ms busy timeout. These Unix-style modes do not establish Windows ACL protection.

The database is **not encrypted as a whole**. EVE token bundles and the OBS password are encrypted fields; names, notes, private observations, caches and other records are ordinary SQLite data. Backups and exports therefore require the same care as the live directory.

Some preferences live only in the browser: selected pilot, Atlas projection, map/mapper display preferences and alert preferences use local storage; cameras and parts of workspace navigation use session storage. A data-directory backup does not include those browser preferences or unsaved drafts. Server-side saved records remain separate from these display choices.

## Store interface

| Interface | Contract |
| --- | --- |
| `store.db` | Shared `DatabaseSync` handle. Use prepared statements and the owning service's invariants. |
| `get(key, fallback)` / `set(key, value)` | JSON settings. One row per key; use explicit namespaced keys for service-owned state. |
| `snapshot(id, key)` | Decode one persisted sample, or return `null`. |
| `snapshotMetadata(id, key)` | Read status, scope, owner and scheduling metadata without decoding the potentially large data array. |
| `saveSnapshot(id, key, value)` | Write a sample and advance its in-process UI revision. All production snapshot writes use this path. |
| `snapshotRevision(id, key)` | Opaque process-epoch revision for frontend delivery; not a durable observation timestamp. |
| `close()` | Close the store after all accepted service/HTTP work has drained. |

Read through the current store at decision boundaries; do not add unbounded decoded-row caches that become stale after raw SQL writes or transaction rollback. The frontend revision mechanism is separate from data freshness and does not alter `updatedAt`.

## Domain ownership

| Stored domain | Principal tables/state | Owning service |
| --- | --- | --- |
| Authentication | `characters`; encrypted tokens, actual granted scopes, owner identity, reauthorization flag | [auth.mjs](../server/auth.mjs), [vault.mjs](../server/vault.mjs) |
| Routine collections | `snapshots(character_id,key)` | [core.mjs](../server/core.mjs); public batches use character `0`, private data retains its character owner |
| HTTP representations | `cache`, `cache_usage`; `esi:limits` | [esi.mjs](../server/esi.mjs), [cache-retention.mjs](../server/cache-retention.mjs); shared with public Combat cache maintenance |
| Settings/extensions | `settings`, `module_data(module,key)`, `migrations` | Individual services; extension namespace supplied by [registry.mjs](../server/registry.mjs) |
| Semantic history | `events` with optional dedupe key | Core publication and owning event producers |
| Sessions/travel/discovery | `sessions`, `visits`, `discovered_systems` | [history.mjs](../server/history.mjs), [session-travel.mjs](../server/session-travel.mjs), [discovery.mjs](../server/discovery.mjs) |
| Goals/notes/place notes | `goals`, `goal_tracking`, `goal_progress_entries`, `notes`, `place_notes` | [goals.mjs](../server/goals.mjs), HTTP note handlers and [places.mjs](../server/places.mjs) |
| Combat evidence | `combat_records`, `alliance_combat_records` | [combat.mjs](../server/combat.mjs), [session-combat.mjs](../server/session-combat.mjs) |
| Market scans | `market_hubs`, `market_types`, `market_jobs`, `market_stage`, `market_orders`, `market_items` | [markets.mjs](../server/markets.mjs) |
| Market histories/plans | `market_history`, `market_history_days`, `market_history_archives`, `market_history_meta`, `market_import_plans` | [market-history-store.mjs](../server/market-history-store.mjs), [market-history.mjs](../server/market-history.mjs), [imports.mjs](../server/imports.mjs) |
| Universe records | `universe_systems`, `universe_records`; namespaced settings | [universe.mjs](../server/universe.mjs), Places and specialized Universe owners |
| Private operational observations | `universe_operations_records`; map-scoped kinds where applicable | [universe-operations.mjs](../server/universe-operations.mjs) |
| Political inference | `universe_politics_events`, `universe_politics_queue`, `universe_politics_history`, configuration/progress settings | [universe-politics.mjs](../server/universe-politics.mjs) |
| Stream/OBS | Sanitized Stream configuration; OBS settings and separately encrypted password | [stream.mjs](../server/stream.mjs), [obs.mjs](../server/obs.mjs) |

A table containing a `character_id` does not automatically enforce the HTTP caller's identity or current scope. The service must validate ownership and authorization. Organization contacts remain scoped to the character that read them and include the observed organization owner. Public names must not absorb private structure names. J-Space map records and operational observations must be addressed in their map scope; an unscoped system ID is insufficient.

## Schema changes and migrations

Core migrations run synchronously in `openStore()` before the runtime takes ownership. `migrations(id,applied_at)` records completed steps. Existing changes use named transactions with a marker written before commit; a failed construction closes its SQLite handle and rolls back an unfinished transaction.

Not every schema owner is centralized in `store.mjs`: Universe and operational services create their own indexed tables, and domain migrations may use settings markers/savepoints. Registry modules can provide `migrate(db)`, tracked as `module:<id>:<version>`. The registry does **not** wrap arbitrary module migration work in a transaction for the author; a module needing atomic multi-statement changes must provide that boundary itself.

When changing persistence:

1. Read the owning schema and all readers/writers, including export, delete and migration paths.
2. For a supported durable baseline, use a new stable migration identity rather than changing an applied migration. During the clean-slate 0.8.0 audit, schema/migration history may be redesigned or replaced under the policy below; no existing profile compatibility is owed.
3. Make data changes and completion markers atomic. Use a savepoint when a nested transaction boundary is needed; do not hold a synchronous SQLite transaction across an asynchronous network wait.
4. Preserve foreign-key behavior, indexes, deterministic ordering and bounded reads. Query only the metadata or slice needed.
5. Test fresh-profile initialization, failure rollback and repeated startup. Test an upgrade only where that transition is intentionally supported; prior-version compatibility is not required for the fresh-data 0.8.0 baseline below. Match [validation](VALIDATION.md) to the actual change.

The old `market-rebuild-v6` migration deliberately invalidates pre-0.6 market books once and queues fresh scans for previously scanned hubs; this is not an instruction to reset market data on each launch.

### Production baseline and version compatibility

**Bun's decision, 21 October 2026: 0.8.0 is a fresh-data baseline. Users are expected not to carry data from prior versions into 0.8.0.** Until a finalized 0.8.0 build, destructive changes that invalidate prior-version data are authorized; there is no obligation to maintain 0.7.3 or earlier compatibility. This supersedes the earlier proposed preceding-release upgrade requirement. It is a policy decision, not a claim that an automatic reset or profile-format guard has been implemented.

Bun further clarified that this audit must assume **no existing data** and must not be constrained by any pre-0.8.0 durable-data policy. Storage/schema redesign, replacement and reset are authorized throughout this work. There is no requirement to preserve, migrate or recover any pre-finalization profile, nor to implement a legacy-profile compatibility/restore/handling path as an audit gate. Standard durable-data policy resumes from finalized 0.8.0 onward.

Record deliberate storage changes and verify fresh-start behavior. Existing compatibility code/tests may be retained, changed or retired through reviewed units; preserve historical receipts and record the changed requirement instead of presenting removed assertions as newly passing evidence. Recovery tests should use fresh synthetic profiles to prove the intended 0.8.0 behavior, including valid-data/user-intent handling during ordinary failures. Such tests do not constrain schema choices or require preserving data across pre-final builds. Replaceable caches, derived indexes and intentionally expiring operational data retain their documented [retention rules](DATA-RETENTION.md).

**Current implementation/recovery behavior (may change under the clean-slate policy):** migration rollback is scoped to the failed transaction/savepoint. Earlier successfully committed migration steps may remain after a later startup step fails; there is no single transaction spanning every service's startup. Preserve the failed profile for diagnosis, then retry with a corrected candidate or restore a complete stopped checkpoint and its matching package. Do not reset the database or edit migration markers as a routine recovery technique.

Current recovery is a manual full-directory backup and same-machine/account restore, with the displaced profile retained separately until recovery is verified. There is no automatic pre-upgrade backup, general history importer, portable Windows DPAPI guarantee or supported in-place downgrade. Never run an older executable over a database already changed by a newer version as a rollback strategy. Browser-only preferences and unsaved drafts are outside the server backup.

The [completed final audit](FINAL-AUDIT.md) tested 0.7.3→0.8.0 using archived-runtime fixtures, plus same-version restore and migration rollback/retry. Preserve those receipts with their original scope; they no longer create a prior-version compatibility obligation. Recovery for the finalized baseline is tested with fresh synthetic profiles; recovery of pre-finalization profiles is not an obligation. Native Windows/DPAPI and live-environment limits remain separate. Release progression remains paused.

## Cache, snapshots and records are different

A transport cache stores an HTTP body, validators and original observation/expiry. A snapshot stores the current collection status and next routine deadline for a data batch. A durable domain record represents user work or retained evidence, such as a session or verified killmail. Clearing one layer is not a general way to repair another.

[ESI polling](ESI-POLLING.md) defines `updatedAt`, `expiresAt`, `refreshAt`, stale fallback and retry state. [Data retention](DATA-RETENTION.md) defines which replaceable entries can expire. Pausing modules keeps stored history. Travel rows belong to active Sessions. Journey-only hidden links are not part of the current schema or export, and discovery is not seeded from unowned historical visits.

Market scan staging is separate from the published book. Cancellation/failure must not publish partial orders as a complete book. Daily archive rows are retained separately from their bounded analysis projection. Dataset generations are files selected by the supervisor, not an interchangeable SQL cache.

## Export and backup scope

**Export history** downloads `kairo-history.json` from the private `GET /api/export` route. Its current export schema is **version 9**; this is unrelated to the application version. It includes local goals, notes, events, sessions/travel/discovery, personal/alliance combat, place notes, tracking state, import plans/settings, hub configuration, Stream configuration, character IDs/names and Universe user/operational data.

It omits EVE tokens and the OBS credential, and it is not a full database/settings export. It can still contain private intel, notes, routes, identities and local operational configuration such as log settings. Some nested stored records are raw database shapes; it is not a public sanitized telemetry format. There is no general **import history** or **restore history** operation in this candidate.

J-Space maps, infrastructure and Ansiblex lists have their own documented import/export formats in [Universe](UNIVERSE.md). Those transfers are limited to their domain and do not restore the whole application. In particular, SMT infrastructure text does not preserve every field retained by the corresponding JSON format.

For a restorable installation checkpoint, stop Kairo cleanly and copy the whole data directory together with the matching package. Do not copy only a live `kairo.sqlite` file or discard its vault key. Windows DPAPI binds the key to its Windows account context; portability to a different account or machine is not established by a file copy, and an unreadable foreign vault can stop startup before the reconnect UI is available. The [user guide](USER-GUIDE.md) owns the step-by-step procedure and limitations.
