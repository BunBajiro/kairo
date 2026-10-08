# M9 next isolated trial: persist compact summary inputs with map writes

Design reviewed against clean `9afa9a7197fa6b5a802e9efdaa322dedf2439150` on 8 October 2026. This is a trial plan, not an adoption or closure decision. The rejected SQL-on-read experiment remains rejected; none of its source changes are on the continuation branch. PR #10 remains withdrawn.

## Reason for this trial

The completed preceding trial preserved outputs but repeatedly made ordinary 8/24-map summaries slower. Its 24-wide-map JavaScript parse reduction from 85.7 million to 1.59 million characters produced only about 6% service improvement. This supports testing whether computing the same compact input **when a document changes** removes repeated work; it does not establish that the extra storage and write cost are worthwhile.

Start from `kairo-m9-summary-baseline-9afa`, not the shared continuation checkout, which is receiving independent accepted changes. The smallest proposed source boundary is one new private persistence helper, the summary reader in `server/universe-jspace.mjs`, and focused tests. Keep the existing document table, canonical links, APIs, output contracts, selected/full projection, authorization and mutation implementations.

## Current code paths and ownership

| Path at 9afa | Relevant behavior |
|---|---|
| `server/universe.mjs`, `createUniverse` schema block | Creates five-column `universe_records` and its existing indexes before constructing J-Space. |
| `server/universe-jspace.mjs`, `write`, `loaded`, `rows` | Stores complete map documents; multiple calls use five-value INSERT without an explicit column list. |
| `summaries` / `libraryContext` / `projectionContext` | Ensures the live source, reconciles canonical expiry, reads every complete map, checks cleanup and builds descriptors. |
| `connectionsUnchanged` equivalent / `forgetMapConnections` / `reconcileNodes` | Normalizes legacy connection metadata, removes stale references, clears reconnection timestamps and prunes disconnected nodes at the exact current deadline. |
| `command` including `undo`, `importMap`, `create`, `remove`, `migrateScopes` | Replaces or deletes map rows; import and commands already use transactions. An undo snapshot is not itself a live map. |
| `server/universe-jspace-tracking.mjs`, `applyLocation`, `populateScopes`, `writeMap` callback | Writes whole maps through the supplied callback, including background source updates. |
| `server/universe.mjs`, `cleanupExpired`, `forgetLinks`, `linkReadContext` | Deletes canonical connections and their map memberships before reading current map state. |
| `server/store.mjs`, `openStore` | Enables WAL, foreign keys and a busy timeout. Other module schemas are initialized later. |

Source SHA-256: `universe.mjs` `81732780f6d7af9e0b8e61b1b1fbdf6c28d59312239cdf0c475a7a6fe8f1d732`; `universe-jspace.mjs` `bc8e0e886c3a51d14b75c590505f1f691c1ab0ae2ccf33ef8a9954a463d3004c`; `universe-jspace-tracking.mjs` `5473155618c66f0c3e1c8b131dbce4096f93589baba6dbbe984e380b0b16e109`; `store.mjs` `67fa4dd354f4a196e7356235ee566339b16cc62f87fcba39acc7be774f663a16`.

## Options considered

| Option | Assessment |
|---|---|
| Add ordinary summary columns to `universe_records` | Changes implicit INSERT arity in production and test writers; widening a mixed-record table is unnecessary for this trial. |
| VIRTUAL generated columns | Automatically reflect direct writes, but ordinarily recompute on reads. A covering expression index might store scalar results, but needs query-plan proof and cannot express the array transformation with subqueries. |
| STORED generated columns | Generated columns are excluded from implicit INSERT values; do **not** reject them on the ordinary-column arity argument. However, adding STORED columns requires a table rebuild, and generated expressions cannot use `json_each` subqueries/aggregation. A process-specific SQL function would make persisted schema dependent on function registration in every writer. |
| Persistent compact side table with ordinary SQL triggers | Proposed narrow first trial. Moves projection to real map writes, requires no full-document cache, and observes raw SQL writes from other connections. Backfill, write amplification and page cost are explicit gates. |
| Side table invalidated by triggers, lazily populated in JavaScript | Plausible later alternative if eager projection has unacceptable write cost. Triggers can delete metadata on every mutation. Filling must use a transaction or an atomic exact-source-body comparison to prevent publishing a stale derivative. First reads become writes, and cold reads still parse documents. Do not add this second mechanism to the initial trial. |
| JavaScript map/revision cache | Rejected as a shortcut: same-revision direct replacement, rollback, deletion/recreation and expiry violate revision-only validity. |
| `data_version`, `total_changes`, timestamps or an invalidation cursor alone | Not a per-map content identity. `data_version` misses same-connection commits; timestamps/revisions can be reused. A fully transactional journal with deletion tombstones, rollback-aware cursor ownership and bounded retention is a larger mechanism than this side table. |

SQLite's generated-column limits are documented at <https://www.sqlite.org/gencol.html>. The implicit-VALUES distinction is also demonstrated in SQLite's own forum at <https://sqlite.org/forum/info/14522751e89a5984>; local Kairo already uses `INSERT INTO market_jobs VALUES(?,?)` after adding a generated `terminal` column. Verify the target runtime with a tiny compatibility test before any generated-column implementation; this trial adds none.

## Proposed storage and installation

Add one private table, tentatively `universe_jspace_summary_inputs_v1(character_id, id, body)`, keyed by `(character_id,id)`, with `body` nullable. It contains one derivative per stored `jspace_map`, including live source maps. A null body means use the original complete document. It is not another canonical source and is not returned in exports.

Install the table and three persistent **AFTER** triggers from a helper constructed inside `createUniverseJSpace`, after `universe_records` exists and before any J-Space writes. Use a savepoint so installation composes with a caller transaction. On first installation or missing installation objects, rebuild metadata from current map rows inside the same savepoint. All installation changes and backfill roll back together on failure. Reopen with complete installation performs only schema checks/preparation, not a full backfill. Keep the original documents byte-for-byte untouched.

- INSERT of a map deletes any derivative at the new key and inserts the current derivative.
- UPDATE involving an old or new map deletes derivatives at both affected map keys, then inserts the new derivative if its new kind is `jspace_map`. Include identity/body changes; the reader sorts by the parent row's current `updated_at`, so metadata need not duplicate that ordering field.
- DELETE of a map removes its derivative.

Deleting old/new side keys before INSERT avoids relying on an inner conflict policy or a DELETE trigger firing for an implicit REPLACE victim. This matters because SQLite REPLACE delete triggers depend on `recursive_triggers`. Do not enable recursive triggers globally to make the trial work. Parent and derivative mutations share the same SQL statement transaction, including savepoint rollback. Persistent triggers contain only SQLite built-ins, so direct writes from another normal connection and an older Kairo binary still maintain derivatives after installation.

Trigger behavior and restrictions: <https://www.sqlite.org/lang_createtrigger.html>; REPLACE behavior: <https://www.sqlite.org/lang_conflict.html>. No TEMP triggers, callback/UDF dependency, module-global map cache, timer-based validity or new canonical connection cache.

## Compact representation and fallback

First isolate persistence from projection: retain the preceding trial's compact fields, including complete connections/activity/pilots, and its full-document cleanup fallback. Nodes retain `system_id`, `locked`, `disconnected_at`, `prune_grace_at`; comments/passages retain connection references. Remove retained observations, pings, archived-node payload and node/comment/passage text. Connection notes remain a known limit of this first trial; separately reducing them would be a subsequent measured delta.

Use a lazy CASE guard so invalid JSON never gains a new write-time exception merely from the derivative. Unsupported shapes get SQL NULL metadata and are parsed/reconciled by the existing path. Require object elements in projected arrays, preserve booleans via JSON-valued extraction, and fall back for malformed identity/reference types. Guard duplicate object keys: JavaScript JSON.parse and SQLite path lookup must not select different occurrences. An all-document duplicate-key check is acceptable in the initial prototype only as an explicitly measured write cost, not assumed free. No compact input may reach `write` or `capacity`.

The reader joins parent map keys/order with the side table and returns `COALESCE(compact_body, original_body)`. The ordinary path must contain no JSON projection functions and must not transfer the parent body when a compact body exists. Verify this with bytecode and transfer diagnostics. Query-plan text alone is insufficient to prove that overflow pages or the complete body are untouched.

Before listing rows, execute current canonical expiry via the existing projection context. For each compact input, reuse exact JavaScript no-change checks; if normalization, dangling links, reconnection cleanup or due pruning might mutate the map, reload its complete current document and call existing reconciliation. A canonical-link edit needs no side-table link trigger: fresh canonical lookup still decides cleanup and next expiry. Derivatives must never bake in `now()`, effective authorization, canonical liveness or a next-expiry deadline.

Preserve `ensureSource` semantics for falsy/corrupt stored source bodies. The compact existence shortcut may only use a non-null derivative, which proves a stored object with the required containers; otherwise use the original full read/recreation path. Do not treat row existence alone as equivalent to a truthy parsed document.

## Correctness gates before timings

1. Run the existing summary-first legacy/expiry/pruning tests and preceding trial's guarded malformed-element cases. Compare complete output and storage, not just descriptor counts. Confirm zero steady-summary writes after source creation.
2. Raw SQL: UPDATE body with unchanged revision and unchanged timestamp; replace same key; delete/recreate same key; owner/id/kind changes; INSERT OR REPLACE and UPDATE OR REPLACE collision; updated_at-only ordering changes. Cover keys that contain quotes and Unicode through parameters.
3. Transactions: successful commit, full rollback, ROLLBACK TO savepoint, ignored conflicting INSERT, failing statement and a read within a caller transaction. Both original and derivative must have the same visibility before and after rollback.
4. Open a second independent SQLite connection without any custom functions. Commit a direct map replacement and verify the first service sees it on its next summary. Close/reopen the store and service, then read before any write. Installation inside an existing transaction must not issue a nested BEGIN or commit caller work.
5. Backfill a pre-trial populated database, verify every original body unchanged, then restart without rebackfilling. Test interruption/failure during installation on a copied fixture; no half-installed trusted derivative set may survive.
6. Current canonical delete/collapse/due expiry and scope replacement; exact 30-minute prune boundary, locked cards, reconnect timestamp deletion, timezone normalization, absent activity, legacy `locked:false`, empty archived connections and stale notes/passages. Check source and regular maps with `summaries` called first.
7. Full import, duplicate, undo, tracking roster/location and background source cleanup. Selected/full/search/export responses must remain equivalent; no compact-only fields or missing user payload may be persisted/exported.
8. Malformed text and JSON-looking primitive elements, null/missing containers, duplicate keys, missing/bad identity fields and falsy source bodies must follow baseline behavior. A metadata fallback is permitted; silently changing accepted content or write failures is not.
9. Keep no-op query/write counts distinct from mutation counts because trigger-maintained derivatives deliberately add writes. Existing count assertions must remain meaningful; do not weaken user-data invariants to accommodate them.

## Matched measurements and rejection rules

Run only after the root grants the exclusive performance slot; no runtime work is authorized by this design assignment. Freeze source/harness hashes and keep this isolated baseline/candidate separate from the combined continuation build.

- Reuse the complete 27-case summary/full/selected family and original 21-case Maps ABBA family, diagnostic hashes, mutation/access guards and ordinary timing boundaries. Report both process pairs and adverse rows. Reject an ordinary repeated material regression rather than hiding it behind wide-input aggregate gains.
- Add dense connection-note maps and actual cleanup/write paths: node drag/save, comment/passages, tracking update, undo, import, deletion and bulk expiry. Compare 1/8/24-map and representative maximum-cardinality shapes. Include write-only bursts and 1-write/1-read as well as measured dashboard read/write ratios; no assumed polling ratio can rescue an otherwise unjustified regression.
- Measure first initialization/backfill separately from a clean startup and a normal reopen. Use identical pre-trial database copies and actual populated historical fixtures where already authorized. Report elapsed time, CPU, peak RSS/heap and database-lock duration if observed. Do not smear one-time backfill into warm reads or omit it.
- For each paired fixture record page_size, page_count, freelist_count, side-table row/body bytes, database/WAL/SHM size before/after writes and after an equivalent checkpoint. Do not VACUUM only one arm. Include retained heap and process RSS before/after an ordinary read/write series, not only JavaScript parse counts.
- Inspect steady-read SQL bytecode and transfer counts: a reduced JS payload is insufficient if the full original document is still decoded each read. Separately report the cost of write-time projection/duplicate-key guarding without claiming it is one decode unless proven.
- Compare the added cost per write and first migration with saved cost per summary. Report break-even read/write counts where meaningful; keep ordinary small-map cases visible. Only adopt if the actual service gains justify measured startup/write/storage costs without unresolved correctness regressions.

If the eager side table fails ordinary write or startup gates, preserve and reject that experiment. The next candidate can be trigger-invalidated lazy materialization, with its additional transaction/source-identity proof, or an evidence-backed no-change decision. Do not escalate automatically into a broad database rewrite. M9 and final RC17 acceptance remain open throughout this plan.

The current official `data_version` limitation is documented at <https://www.sqlite.org/pragma.html#pragma_data_version>. All cited SQLite material was read for this design; no runtime verification or performance result is claimed here.
