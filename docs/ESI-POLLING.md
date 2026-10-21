# ESI polling and request management

This guide describes the implemented **0.8.0-rc.17** collection policy. [Authentication and security](AUTH-AND-SECURITY.md) owns scope grants and connection lifecycle; [Datasets](DATASETS.md) owns static-data updates.

Kairo separates the application's routine schedule from ESI's cache expiry. The schedule is configurable in **Settings → ESI polling** and applies to all connected characters. Recommendations and allowed slider stops live in `server/polling.mjs`; the server validates the same values the interface displays. Saving only changes polling preferences, not scopes or module enablement. Resetting the draft requires Save to apply it.

## Change collection settings

1. Open **Settings → ESI polling** and select a module, or search for a data batch.
2. Choose a supported slider stop. **Auto / ESI cache** follows the provider's cache cadence; it does not disable the batch. The recommendation and description explain which features use it.
3. Select **Save** to apply the draft. Resetting to recommendations edits the draft; it still needs Save. Leaving without saving does not apply those edits.

These settings apply to all connected characters. Public Universe batches are collected once for everyone. A disabled module stays paused, and missing permissions remain missing. Turn modules on/off in **Settings → Modules** and grant permissions through **Connections**. Faster settings cannot make EVE provide fresh information before its cache expires. Slower location checks can miss short visits.

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
| Universe | Sovereignty campaigns | 30 seconds |
| Universe | Incursions | 5 minutes |
| Universe | Industry cost indices | 1 hour |

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

Character Combat public zKillboard participation has a separate one-hour minimum cache. Live Session alliance-combat collection has its own approximately two-minute schedule, and the Universe public combat display has its own feed/cache; these are separate consumers, not the ESI killmail slider. See [Sessions](SESSIONS.md) and [Universe](UNIVERSE.md). Only previously unseen killmail details require ESI verification; the durable combat ledger prevents repeated verification. Item/system searches and static universe metadata are fetched on demand through the shared cache. Neither category browsing nor analysis adds a periodic market collector. [Static dataset checks](DATASETS.md) are separately scheduled by the updater, independent of ESI and map display ticks.

## Interpreting collection status

| Status | Meaning and next step |
| --- | --- |
| `ready` | A successful sample is available. Its routine deadline may be later than HTTP expiry; OPSEC applies stricter evidence rules. |
| `waiting` | No usable sample has arrived yet, or a prerequisite such as current organization membership is pending. Allow collection to complete. |
| `missing_scope` | The connected character has not granted the batch's required permission. Update access in Connections. |
| `not_applicable` | The requested ownership context does not exist, for example alliance contacts for a character with no alliance. |
| `disabled` | The owning module is paused. Existing history remains stored. |
| `stale` | Retained data exists but its refresh failed or it is no longer current for the consumer. Read the error/age; it is not a new observation. |
| `error` | Collection failed without usable retained data. Check the displayed access/network error and retry deadline. |

A successful HTTP 304 is a new observation of the same representation. Re-reading cached data is not. A snapshot's `sourceModifiedAt`, when present, is the provider's Last-Modified value; it is distinct from local receipt time. See [troubleshooting](TROUBLESHOOTING.md) for symptom-based guidance and [Data retention](DATA-RETENTION.md) for how last-good cache entries are kept.

## Developer contract: shared ESI service

Owners are [esi.mjs](../server/esi.mjs), [core.mjs](../server/core.mjs), [polling.mjs](../server/polling.mjs) and [modules/catalog.mjs](../server/modules/catalog.mjs). Use this service instead of introducing a module-local HTTP cache or request queue. General module/event contracts belong in [Internal API](INTERNAL-API.md).

| Interface | Contract |
| --- | --- |
| `request(path, options)` | Cached ESI read transport; options include `characterId`, `method`, `body`, fallback `ttl` in seconds and `priority`. Public calls use owner `0`; private calls carry the authorized character ID. Read-style POST name lookups are supported. |
| `paged(path, options)` | Fetch pages sequentially using `x-pages`, capped at 250. Returns merged data, earliest expiry, combined stale/error/retry information and `truncated` if the provider reports more pages. |
| `names(ids, options)` | Public name lookup, deduplicated per ID across overlapping batches; up to 500 IDs per provider request. Returns an ID-to-name object and tolerates unavailable names. |
| `cachedNames(ids)` | Read fresh public per-ID names without network work. Private structures must stay in authorized caches. |
| `paced({spacingMs})` | Create a paced request function; default spacing 250 ms. Pacing waits own neither a network slot nor another consumer's request flight, and recheck cache/connection/admission before dispatch. |
| `mutate(path, options)` | Explicit authorized command. Never cached or coalesced; no replay after uncertain network failure. A definite 401 alone permits one refresh/resend. An error may carry `uncertain: true`. |
| `clearAccessFailures(characterId)` | Remove local 401/403 retry records that have no server Retry-After; does not erase provider cooldowns. |
| `health()` | Actual request/cache/coalescing/304/failure counters and active/queued counts. These are attribution counters, not elapsed-performance measurements. |
| `close()` | Stop accepting new public work and await already accepted request chains, including paged/name reads and their cache writes. |

Read results contain `data`, `updatedAt`, `expiresAt`, response metadata in `headers`, and `cached`. Failed refresh with a prior representation additionally returns `stale`, `error`, `errorStatus` and `retryAt`; without prior data the error is thrown. Consumers must preserve this distinction. A cached result's original times are not replaced with `Date.now()`. Optional synchronous `validate(result)` checks intrinsic read-response shape before caching and on shared/cached reads. Rejection carries `ESI_INVALID_RESPONSE` and removes only the rejected cache representation; the owning caller controls bounded retries. Provider cooldowns still apply. This does not change command handling.

Cache identity combines character owner, HTTP method, normalized route/query and body hash. Private in-flight identity also includes connection revision; a response admitted by an old authorization cannot publish into a new connection. Scope-free public reads are shareable, while an organization route accessed through two different characters remains privately isolated.

Core owns collection admission, module gates, scope checks, organization owner changes, enrichment, snapshot persistence and semantic `data.<key>` delivery. It restores deadlines from snapshot metadata after restart, and suppresses publication from superseded connections or disabled modules. A collection may contain several page/detail/name requests; it is not one HTTP request by definition.

The scheduler's general routine deadline is the later of provider expiry and successful observation plus the chosen interval, brought forward where a known training finish permits it. Protected evidence follows its tighter policy. Save validates every submitted key/value against `pollingBatches` before writing `esi:polling`; omitted keys use recommendations, so the UI sends the complete draft. Accepted browser polling saves retain intent order across navigation; changing preferences does not create extra observation timestamps.

## Verification and sources

A retained isolated five-minute scheduler simulation with ESI-like cache headers produces 51 location requests and six ship requests, while skill queue checks occur six times including startup. Trained skills, attributes, clones, implants and calendar each collect once. OPSEC stays Blue throughout and emits one initial transition. This verifies scheduling behavior, not real-user bandwidth savings: travel events, edits, page counts, upstream expiry and outages affect actual traffic.

Tests also cover edited/cancelled queues, early completion refresh, live goals and bindings, persistent custom rates, atomic validation, scope/module isolation, cache reuse across alts, protected evidence, Retry-After, and the private HTTP boundary. The full test suite and build are described in [VALIDATION.md](VALIDATION.md). Real private EVE access/SSO, Windows DPAPI and actual OBS output require the user's environment. Compiled browser checks have their explicitly recorded scope in Validation.

The audit checked the retained pinned OpenAPI specification and CCP's [ESI caching guidance](https://developers.eveonline.com/docs/services/esi/best-practices/) and [rate-limit documentation](https://developers.eveonline.com/docs/services/esi/rate-limiting/). The current specification is available through the [official API Explorer](https://developers.eveonline.com/api-explorer). Compatibility remains pinned to 2026-09-04.
