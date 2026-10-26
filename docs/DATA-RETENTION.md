# Data retention

This is the retention policy implemented in **0.8.0-rc.17**. Kairo separates user-owned records from replaceable transport data. Routine maintenance does not reset the database. For file locations, schema ownership and export scope, see [Persistence](PERSISTENCE.md); for backup procedures see the [user guide](USER-GUIDE.md).

The [fresh-data 0.8.0 release policy](PERSISTENCE.md#production-baseline-and-version-compatibility) separately permits intentional prior-version incompatibility before finalization. The rules below describe ordinary operation within a supported build; they do not promise prior-version data transfer.

## Retained records

Sessions and their travel, semantic events, personal/alliance combat evidence, notes, goals, import plans and imported daily market archives remain stored. Disabling a market hub retains its last complete book. Market analysis retains its existing 30-day working projection without deleting older daily archive rows.

The retired lifetime Journey log is not growing on every location update: current travel records belong to active Sessions, while discovered-system identities are retained separately. Existing historical visits remain readable/exportable.

These durable domains may grow with use. SQLite reuses freed pages; cleanup does not run a full VACUUM or promise that an existing database file immediately shrinks.

## Replaceable transport data

ESI read responses, public name entries, public Combat query/page responses and expired resource retry records become eligible only after 90 days without a successful update or use. Fresh responses, active resource retry deadlines and public Combat provider cooldowns are protected. ESI and Combat share one store-owned maintenance cursor. Used stale responses retain their last-good body, ETag/Last-Modified validators and original observation time for offline fallback.

Existing installations receive a full 90-day grace period. Maintenance examines at most 200 indexed candidates per hourly opportunity and saves progress across restarts. It runs during existing request activity and adds no polling timer. Unknown cache owners are excluded. This is an inactivity policy, not a hard cap that discards active data; a large backlog converges through successive bounded batches.

## Market scan summaries

The latest eight completed, cancelled, failed or interrupted summaries survive regardless of age. Up to 100 terminal summaries within the last 30 days remain available. Surplus older summaries are removed in batches of at most 200. Running jobs, completed market books and durable upgrade/resume settings are retained.

## Political inference

Disabling inference or Universe retains authoritative combat ledgers and records one durable replay marker instead of an additional unbounded row-pointer queue. Re-enabling replays both ledgers in batches of at most 1,000 records, saving progress across restarts. Inferred memberships are withheld and coverage remains explicitly incomplete until replay finishes; configured blocs remain available immediately. Replay does not repeatedly compute the complete relationship graph: it saves compact evidence/progress, then produces an assessment after completion.

When copies disagree, inference chooses personal combat before alliance combat, then the lowest owner ID within that source. This is a deterministic canonical selection, not a newest-observation claim: the ledgers do not record that ordering. An ineligible canonical correction becomes an exclusion marker so an older secondary copy cannot silently restore it. Deleting the canonical source invalidates its compact copy and requests replay to select any remaining eligible owner.

Compact inference inputs and exclusion markers share a 60-day/20,000-record bound, separate from durable player evidence. A capacity omission remains explicitly incomplete until the omitted evidence window expires. Legacy limited bootstraps replay their original ledgers when upgraded.


## Other bounded or expiring data

The transport policy above is not a universal 90-day retention promise. Domain owners also apply these rules:

| Domain | Current behavior |
| --- | --- |
| Downloaded static datasets | Keep the previous generation during activation; retire it after successful replacement. Failed cleanup is retried. Bundled fallback remains in the package. [Dataset lifecycle](DATASETS.md) owns the details. |
| Wormhole connections | Expired/collapsed/deleted connections are removed, including their connection-specific metadata and linked signature records. There is no durable archive of departed connections. |
| J-Space system cards | Disconnected unlocked cards can leave the visible map under its prune rule, while card metadata is retained in its system archive. Locked cards remain; expired map observations are marked as such and pings expire. See [Universe](UNIVERSE.md). |
| Operational records | Bounded separately by pilot and record kind/map scope: generally 1,000 signature or infrastructure rows, 500 intel reports and 250 alerts. New writes trim surplus old rows within that scope. Expiry is meaningful even when a historical row remains stored. |
| Deleted signature recovery | Up to 100 deletion records per scope; restore is available for 24 hours, unless a newer record already owns the signature. Restore preserves the original observation time. |
| Universe public combat display | A recent feed projection, limited to two hours and 500 kills; separate from durable personal/alliance combat evidence. |
| Eve-Scout connection reports | Expired public connections are pruned from the feed; a stale provider does not extend their reported expiry. |
| Political assessment history | Up to 100 configuration revisions and 64 inference snapshots, separate from the compact input bound above. |

These limits describe the current code, not a storage-size forecast. JSON record sizes vary; retained sessions, notes and daily market archives may dominate a long-running installation.

## Disablement, disconnection and deletion

Pausing a module stops its collection/consumers without deleting its history. Disabling a hub keeps its last complete market book. Disconnecting a character removes its credentials, collection snapshots and character-prefixed HTTP representations, then attempts remote token revocation. Shared public data and durable user records remain. See [Authentication and security](AUTH-AND-SECURITY.md).

A domain-specific Delete control can remove that record and its owned dependants; transport cleanup is never a substitute for it. Removing a J-Space map also removes its map-scoped operational records. The history export is a private record export, not a purge or a complete restorable backup. There is no general private-data-erasure wizard in this candidate.

## Developer maintenance contract

[cache-retention.mjs](../server/cache-retention.mjs) owns one maintenance instance per SQLite handle, persisted cursor and usage stamps. Deletion and cursor advancement share a savepoint, so failed maintenance cannot silently advance past unprocessed rows. Calls arrive through normal ESI/Combat activity; do not add another periodic sweep or apply this policy to unrelated cache keys.

[markets.mjs](../server/markets.mjs) owns scan publication and calls the bounded terminal-job pruner. [universe-politics.mjs](../server/universe-politics.mjs) owns inference inputs/replay; durable combat tables remain its evidence source. [universe.mjs](../server/universe.mjs), [universe-jspace.mjs](../server/universe-jspace.mjs), [universe-operations.mjs](../server/universe-operations.mjs) and [universe-feeds.mjs](../server/universe-feeds.mjs) own their expiry and scope rules. Changes must preserve both the retained records and the request/read bounds, not merely reduce a row count.

Existing verification includes [cache-retention.test.mjs](../tests/kairo/cache-retention.test.mjs) and [jspace-retention.test.mjs](../tests/kairo/jspace-retention.test.mjs), with the exact accepted suites and environment limits in [Validation](VALIDATION.md). Preserve failed-baseline and historical performance evidence when changing these policies.
