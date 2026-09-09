# ESI collection policy — 0.6.0

Kairo separates the application's routine schedule from ESI's cache expiry. The schedule is configurable in **Settings → ESI polling** and applies to all connected characters. Recommendations and allowed slider stops live in `server/polling.mjs`; the server validates the same values the interface displays. Saving only changes polling preferences, not scopes or module enablement. Resetting the draft requires Save to apply it.

## Recommended intervals

These are minimum routine intervals, not guaranteed network intervals. The scheduler wakes every three seconds; a check can start slightly after its deadline. ESI's expiry may require a longer wait. Paginated batches can contain multiple requests. Fresh pages and metadata are shared through the cache.

| Module | Data batch | Recommended interval |
| --- | --- | --- |
| Pilot | Profile, corporation and alliance | ESI cache |
| Pilot | Location and system context | 5 seconds |
| Pilot | Current ship | 1 minute |
| Pilot | Online status | 1 minute |
| Training | Skill queue | 1 minute |
| Training | Trained skills | 10 minutes |
| Training | Attributes | 1 hour |
| Training | Jump clones | 15 minutes |
| Training | Active implants | 15 minutes |
| Wallet | Balance | 2 minutes |
| Wallet | Journal | 5 minutes |
| Wallet | Transactions | 5 minutes |
| Wallet | Open market orders | 20 minutes |
| Hangar | Assets and storage locations | 1 hour |
| Hangar | Fittings | 30 minutes |
| Hangar | Contracts | 10 minutes |
| Industry | Jobs | 5 minutes |
| Industry | Blueprints | 1 hour |
| Industry | Mining ledger | 10 minutes |
| Industry | Planets and colony details | 30 minutes |
| Combat | Personal ESI killmail references | 5 minutes |
| Combat | NPC standings | 1 hour |
| Combat | Loyalty points | 1 hour |
| OPSEC | Personal contacts | ESI cache |
| OPSEC | Corporation contacts | ESI cache |
| OPSEC | Alliance contacts | ESI cache |
| Comms | Calendar | 15 minutes |
| Comms | EVE notifications | 10 minutes |
| Comms | Mail headers | 5 minutes |
| Universe | Server status | 1 minute |
| Universe | Market price estimates | 1 hour |
| Universe | Sovereignty and holder names | ESI cache |
| Universe | Faction warfare systems | ESI cache |
| Universe | System kill statistics | 1 hour |
| Universe | System traffic | 1 hour |

Public universe batches are shared across pilots. Private datasets retain per-character authorization and cache isolation, including organization contacts read by different characters. Dataset fallback TTLs are distinct from application polling intervals; actual HTTP cache headers take precedence.

## Responsiveness and freshness

- The skill queue checks on its regular interval even during a long-running skill. Known finish times can only bring checks forward. Queue reordering, cancellation or edits are collected by the next permitted queue request. Trained-skill requests can advance around a known completion; progress and completion remain based on the existing ESI snapshot/event pipeline.
- Ship checks can advance after docking, undocking or an observed login. These run independently of protection collection. Ships changed in space without those hints are picked up on the chosen routine interval.
- Location choices are restricted to 5, 10 and 15 seconds. Its 30-second observation limit, bounded jump continuity and Unknown fallback are unchanged. Other required protection evidence refreshes at ESI cache expiry for the protected pilot regardless of a slower routine preference. Selecting another protected character also reactivates this constraint.
- `updatedAt` records a successful observation or 304 revalidation. `expiresAt` retains ESI expiry. `refreshAt` records the application's next routine deadline. Goals, session samples and widgets can use a ready sample between scheduled checks. A failed sample is stale immediately; changing its schedule cannot make it ready. OPSEC continues to use its original strict evidence rules, never the extended application deadline.
- Timers and stream projections advance locally. No display tick requests new ESI data. A sample's observation time is not advanced by cache reads, restarting Kairo or saving preferences.
- Explicit Refresh can bring routine collection forward but cannot bypass ESI expiry or a server cooldown. A warm restart restores successful collection schedules from snapshots. Module toggles no longer reset every module's schedule.

## Cache and error handling

The shared service still has four network slots and a priority queue for protection. Identical in-flight calls coalesce, equivalent query ordering uses one key, and public name lookups share a persistent per-ID cache even when callers use different batches. Overlapping name batches reserve each ID once. Metadata already supplying a system or membership name avoids another name lookup. Market scans reuse names learned by other modules. Private structure names are not entered in the public name cache.

ETag revalidation is retained; Last-Modified is used when no ETag is available. A 304 retains a prior Cache-Control policy if the response omits it. Failed refreshes keep the original body and observation dates. Resource failures use a separate persistent cache entry so they do not replace usable data. Ordinary transient failures back off from 30 seconds to 15 minutes; unavailable/access-denied resources wait five minutes. Location retries start at three seconds and cap at fifteen seconds unless the server requires longer.

Retry-After is respected for both numeric and date forms. Known route-group buckets are isolated by character or public access and persist through restart; a market bucket does not impose its cooldown on a different protection group. Global ESI error limits and limits without a known group remain conservative. Explicit Refresh can clear local access-error backoff, but not a server-specified cooldown. Health counters report actual requests, cache hits, coalesced work, 304s and attempted failures through the existing private state endpoint.

## Collections that remain on demand

Trade-hub scans remain manual and paced, except for the one-time 0.6.0 upgrade refresh of previously scanned hubs and their Jita reference. Order books, histories and category browsing stay shared across characters; a scan can use an authorized alt for structures. Fresh regional histories and HTTP-cached order pages are reused. Browsing, reports and scan status polling do not fetch ESI. Stale market books are retained indefinitely until replaced by successful scans; 0.6.0 deliberately invalidates legacy books once. UI update reminders use a 24-hour age rather than the shorter HTTP cache expiry.

Jita, Amarr, Dodixie and Hek histories share EVE Ref’s completed daily archives. The manifest is cached for an hour; only missing or changed days are downloaded, with a weekly recheck for corrections that keep the same record count. Imports retain validated dates in SQLite and reuse all four regional projections. Downloads are serialized, paced, cancellable and subject to persistent Retry-After cooldowns. Decompression/CSV validation runs in a bounded worker, away from the protection event loop. Custom hubs retain the shared ESI per-type history cache. No analysis request downloads market data.

**Update trader data** is an explicit targeted refresh of the selling character’s skills, NPC standings and open orders, plus authorized connected alts’ orders for listing exclusion. It honors module toggles, scopes and the existing HTTP cache/backoff policy. NPC station ownership metadata is cached for seven days. Analysis and saved plans consume these local snapshots; they do not alter the routine polling settings.

Public zKillboard participation has its existing separate one-hour minimum cache. Only previously unseen killmail details require ESI verification; the durable combat ledger prevents repeated verification. Item/system searches and static universe metadata are fetched on demand through the shared cache. No new periodic market, static-data or browser-driven collector was added.

## Verification and sources

An isolated five-minute scheduler simulation with ESI-like cache headers produces 51 location requests and six ship requests, while skill queue checks occur six times including startup. Trained skills, attributes, clones, implants and calendar each collect once. OPSEC stays Blue throughout and emits one initial transition. This verifies scheduling behavior, not real-user bandwidth savings: travel events, edits, page counts, upstream expiry and outages affect actual traffic.

Tests also cover edited/cancelled queues, early completion refresh, live goals and bindings, persistent custom rates, atomic validation, scope/module isolation, cache reuse across alts, protected evidence, Retry-After, and the private HTTP boundary. The full test suite and build are described in [VALIDATION.md](VALIDATION.md). Live private EVE, Windows and rendered browser/OBS behavior require the user's environment.

The audit checked the retained pinned OpenAPI specification and CCP's [ESI caching guidance](https://developers.eveonline.com/docs/services/esi/best-practices/) and [rate-limit documentation](https://developers.eveonline.com/docs/services/esi/rate-limiting/). The current specification is available through the [official API Explorer](https://developers.eveonline.com/api-explorer). Compatibility remains pinned to 2026-09-04.
