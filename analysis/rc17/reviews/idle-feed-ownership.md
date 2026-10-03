# Idle feed upkeep and view ownership review

This is a read-only source review of RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and candidate `05d0d4b36c154329006d6772769063db874762da`. No application, harness or raw evidence was changed and no runtime was started for this review.

**A maintenance/view split is a clean future refactor, but it does not explain the measured candidate idle-CPU increase.** `server/universe-feeds.mjs` is unchanged between these two builds (SHA-256 `048346eb48b714ee9c1f4782d8816a836dfd2135efe9e0bfa3cbe8dbd2ac9a1f`). The independent profile investigation reported SQLite `get ← snapshotMetadata ← runDataset` as the dominant shared sampled stack, with feed work secondary. Attribution of the idle increase remains separate from identifying inherited unnecessary work.

## Feed scheduler does build an unused view

The enabled three-second Core scheduler calls `universe.tick()`. Universe cleans expired private links and map sources, then awaits `Promise.allSettled([operations.tick(), feeds.tick()])`. Core ignores the resulting values.

`feeds.tick()` currently:

1. Prunes expired public connections.
2. Returns early for `noSync` or a disabled/closed service.
3. Calls `refresh()`.

`refresh()` validates any requested source, observes the NPC snapshot, awaits the applicable `refreshSource()` calls and returns `state()`. Provider freshness/backoff can make all source calls return immediately, but `state()` still runs. That view reads feed caches plus sovereignty-campaign, sovereignty and kill snapshots; constructs provider metadata, wormhole type lookup, connections, storms, combat, campaign/development rows, NPC deltas and points; and calculates counts and generated timestamps. The scheduler has no consumer for that view.

The backend idle fixture has no HTTP/SSE reader during this period. Its public feed caches are fresh, public combat collection is disabled, and the repeated view is therefore incidental maintenance work rather than a requested response.

## Side effects that a split must retain

`state()` is not completely pure: it begins with `pruneExpired()`. Removing the final view construction also removes that **post-await expiry check**, which must remain in the upkeep path. A connection can expire while a provider request is awaiting completion. The existing pre-upkeep prune also matters because it happens before the `noSync`/disabled guard.

`pruneExpired()` removes expired cached reports through `save()`, invokes `onForgetConnections` for removed IDs and rearms the expiry timer. Universe routes forgotten public IDs to Navigation so stale connections cannot remain usable. `state()` itself does not call `changed()` merely because a view was generated.

Notifications belong to actual mutation/collection paths:

- `refreshSource()` invokes `changed()` in its `finally` block when an actual collection job was started, including failed jobs. A not-due/backoff early return does not notify.
- The expiry timer calls `changed()` when its prune removes connections.
- `saveConfig()` and `saveStorms()` notify explicitly.
- `observeNpc()` can save the next comparison window, but does not itself notify. It must remain in scheduled upkeep even when no external provider is due.

The refactor should preserve source-flight coalescing, request abort ownership, retry/conditional-request behavior, combat opt-in and cursor persistence, and the timing of these mutation notifications. It should not add a `changed()` event for every quiet tick. Post-await pruning also needs the service's close boundary respected, rather than introducing work after storage ownership has ended.

The narrow design is a private upkeep helper containing the existing NPC observation and source collection. The public `refresh(input)` keeps input validation, awaits upkeep and returns the complete current `state()`; `tick()` awaits upkeep and performs the necessary expiry maintenance without constructing a response. No additional service framework or persistent view cache is needed. Keep Universe's two-result `allSettled` contract so existing scheduler-audit status checks remain valid; the feed result's unused value may become `undefined`.

## Exact caller inventory

| Caller | Existing contract | Implication |
|---|---|---|
| `server/core.mjs`, three-second ticker | Calls `universe.tick()` and handles rejection; ignores values | No need for a feed view |
| `server/core.mjs`, `toggle()` for Universe | Calls `universe.tick()` after a module toggle; ignores values | Preserve enabled/disabled upkeep behavior |
| `server/universe.mjs`, `tick` | Cleans private data and settles Operations/Feeds subtasks | Preserve both subtask statuses and rejection visibility |
| `server/universe-feeds.mjs`, `tick` | Calls `refresh()`; this is the only production caller that needs upkeep without a response | Candidate split point |
| `server/index.mjs`, `POST /universe/feeds/refresh` | Returns `await feeds.refresh(body)` as JSON | Must retain the full feed response, including disabled/stale metadata |
| `server/index.mjs`, `GET /universe/feeds` | Returns `feeds.state()` | Keep requested projection semantics |
| `server/universe-feeds.mjs`, `saveStorms()` and import wrapper | Returns `state()` after the explicit observation mutation | Keep requested projection semantics |
| `server/universe.mjs`, `state()` | Includes `feeds.state()` in the Universe response | Keep requested projection semantics |
| `server/universe.mjs`, Navigation `getFeeds` callback | Supplies `feeds.state()` for explicit navigation calculations | Keep freshness and route evidence |
| `server/universe.mjs`, destination lookup | Supplies `feeds.state()` to destination finding | Keep requested route/destination semantics |
| `components/kairo/universe-operations.tsx`, public-signals refresh button | Invokes the public refresh mutation | Preserve API behavior |
| `analysis/rc17/harness/backend/worker.mjs`, tick audit | Requires an array and checks rejected versus fulfilled subtask statuses | Does not inspect fulfilled `.value`; keep the status contract |

No additional production caller of `feeds.tick()` or `feeds.refresh()` was found. Manual import/config UI uses the distinct corresponding HTTP endpoints, not the scheduler method.

## Operations is already different

`operations.runTick()` updates log configuration, awaits log-tail work, and optionally refreshes one eligible due fleet. It has no `return state(...)`; its `tick()` promise resolves to `undefined`. The full Operations `readContext/state` projection is therefore **not** being built solely to satisfy its tick return.

There is a smaller nested opportunity: `runTick()` awaits `refreshFleet(pilot.id)` and ignores the returned `fleetState`. The same public method is also used by explicit Operations refresh, which then builds the whole Operations state. A private fleet-upkeep helper could avoid the discarded fleet projection while preserving `refreshFleet()`'s direct return contract. This runs only for an eligible due fleet and is not exercised by the idle fixture's default disabled fleet collector. It is not a reason to change the Operations tick return or explain this idle regression.

Production callers of `refreshFleet` are exactly `runTick()` and the exported `refresh` wrapper in `server/universe-operations.mjs`. `POST /universe/operations/refresh` in `server/index.mjs` calls that wrapper. The fleet refresh button in `components/kairo/universe-operations.tsx` uses this endpoint. `tests/kairo/universe-operations.test.mjs` also calls `refreshFleet(42)` directly to verify cooldown.

## Existing tests and the narrow remaining gap

| Test file | Relevant existing coverage |
|---|---|
| `tests/kairo/universe-feeds.test.mjs` | Public expiry while disabled; 304/failed in-flight refresh cannot restore expired connections; conditional requests and backoff; malformed/oversized provider responses; wormhole type metadata; manual import; shutdown abort/wait; combat opt-in/cursor/deduplication/cooldown; campaign/development state; NPC window identities and stale/disabled views; invalid timestamps; public-map reconciliation during refresh |
| `tests/kairo/universe-operations-http.test.mjs`, `Universe public-source HTTP refresh retains stale evidence and obeys backoff and collection controls` | Explicit refresh returns ready connections, then stale evidence and retry metadata, respects backoff, and returns disabled sources without collection; Universe consumes the same normalized connections |
| `tests/kairo/universe-jspace.test.mjs`, `shared maintenance expires source connections immediately and prunes source cards without an open view or connected account` | Invokes full Universe tick while advancing expiry and pruning clocks; inspects persisted/resulting map behavior rather than tick values |
| `tests/kairo/universe-operations.test.mjs`, `fleet polls are explicit, bounded, cache-aware and scope-gated`; `fleet replacement failure never exposes previous fleet members; revoked access clears last-good roster`; `fleet commander role loss removes roster and shutdown waits for in-flight work without publishing`; `global module disable stops live state and does not commit an in-flight fleet response` | Explicit enable/scope/cooldown, replacement failure, stale roster, revoked access, role loss and shutdown with in-flight work; tests await tick then read state |
| `tests/kairo/universe-operations.test.mjs`, `log tail binds listener, baselines old lines, captures fresh intel and stops on disable` and `opt-in local positions retain their own source, expire, never replace ESI storage, and stay pilot-bound`; `tests/kairo/universe-location-composition.test.mjs`, `new bound Local observations advance navigation from the selected log source without overwriting ESI` | Tick-driven log/location work and its integration; no reliance on a tick result view |
| `tests/kairo/universe-log-tail.test.mjs` | Tail baselining, UTF-16/chunking, rotation, configuration changes, disabled/closed behavior and bounded line processing |
| `analysis/rc17/harness/backend/worker.mjs` | Explicit initial feed-shape validation plus successful real scheduler-subtask audit |

The feed unit tests currently exercise `refresh()` and `state()` extensively, but do not directly assert a quiet `feeds.tick()` avoids projection-only reads. If profiling justifies this implementation, add a focused read-count/behavior gate for a fresh-cache tick: NPC observation and expiry continue; sovereignty/campaign/manual-view projections do not run; no provider or notification is fabricated. Also cover expiry crossing an awaited collection and disabled/noSync ticks. Retain the existing explicit-refresh HTTP contract tests. These are proposed gates only; nothing was run or changed as part of this review.
