# Data retention

Kairo separates user-owned records from replaceable transport data. Routine maintenance does not reset the database.

## Retained records

Sessions and their travel, semantic events, personal/alliance combat evidence, notes, goals, import plans and imported daily market archives remain stored. Disabling a market hub retains its last complete book. Market analysis retains its existing 30-day working projection without deleting older daily archive rows.

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
