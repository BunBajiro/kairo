# Dashboard refresh and Session archive implementation

7 October 2026. Implementation checkpoint following the published `a27d36c` trace; these changes are not a clean RC17 review candidate. PR #10 remains withdrawn. The coordinator must bind this document and all new results to the final source/build manifest before claiming closure.

## Changes

| Finding/path | Implemented behavior | Evidence and remaining check |
| --- | --- | --- |
| F1 Dashboard `/state` ownership | One mounted selected-pilot owner, one read in flight and one retained invalidation. Initial state belongs to this owner; initial/pilot pages mount after their first accepted state so dependent reads do not first run with empty resources. Switching pilots closes the old owner and clears pilot resources. | `scoped-refresh.test.mjs`, resource tests. Compiled acceptance passed: initial reads, unchanged fallback, burst coalescing and pilot scoping; see `browser-20261007-4.json`. |
| F1 unchanged resources | UI snapshots carry a process-qualified `dataRevision`; unchanged payloads retain object identity without walking or serializing large data arrays. Small snapshot metadata, names and the bounded 20-Session state window retain references when equal. Status, expiry, coverage, removal and restart still invalidate. | `resource-state.test.mjs`, `ui-snapshot-revision.test.mjs`; unreadable Proxy payload test proves no unchanged-body traversal. |
| F1 Goals and activity | Separate `activityRevision`, `goalsRevision` and `sessionsRevision` replace incidental Session-array invalidation. Goals cover wallet, journal, skills, queue, assets, mining, manufacturing jobs and combat, manual changes, global configuration/access changes, queue completion and public-combat coverage expiry. Other-pilot events do not refresh selected resources. | Source-key, clock-boundary and resource-version regressions. Overview migration belongs to `frontend-models`; Goals page owner belongs to `admin-polling`. |
| F1 state/SSE ordering | A read captures snapshot/resource/name/OPSEC event generations. Later state delivery cannot replace a newer SSE field; resource tokens also reject a lower revision in the same process. The fallback still reads state every 30 seconds; unchanged resources do not restart downstream reads. | Helper version tests; compiled harness holds a real `/state` response while a newer snapshot arrives. Protection SSE remains immediate. |
| F1 roster/reconnect | Successful auth callback and character disconnection emit global roster/state/Goals/source invalidation. Dashboard coalesces roster reload with state recovery and reloads bootstrap on reconnect, so removed pilots do not remain selected indefinitely. Dataset refresh checks the currently selected pilot after awaiting bootstrap. | Compiled reconnect and roster-removal cases passed; real OAuth also retains the existing pipeline suite. |
| F2 archive same-pilot race | `createSessionArchive` serializes transport, increments generation on refresh, discards superseded results and retains requested next-page work. Full loaded prefixes refresh so an edited older debrief updates without losing expanded history. ID Set merge preserves order and avoids nested membership scans. | Seven archive tests cover burst replacement, load-more interleaving, loaded-page retention, old-row edits, exhausted-tail `more`, pilot/unmount fencing and retries. |
| F2 archive failure ordering | A failed required head refresh blocks its retained tail request until successful retry; tail success cannot hide the error or append using a stale prefix offset. Existing rows remain visible and the UI exposes `Retry archive`. | Dedicated failed-head/tail regression, plus failure/retry test. |
| F2 mounted read helper | `useResourceRefresh(scopeKey, revision, read, publish, onError)` reuses the bounded owner and fences publication against scope changes immediately, including the render-to-effect interval. | Existing owner tests; Overview uses the hook. No process-wide read cache introduced. |
| F3 supporting work | Removed unused Context `time`, stabilized actions and provider value, retained dataset/name identities used by the separate row-model work. | This does not claim separate shell/resource subscriptions are complete: the compatibility Context still groups resources. |
| F4 delivery | No route import/lazy-loading changes in this checkpoint. | Separate production bundle/cold and first-route measurements and a measured adopt/reject decision remain required. |

Initial state failures now use the visible connection-error/retry panel rather than an indefinite loading skeleton. Recovery success clears that panel. OPSEC delivery is not coalesced or delayed.

## Server/UI contract

`Store.snapshotRevision(id, key)` is ephemeral UI metadata: one random process epoch plus pilot/key and a counter advanced after each successful canonical `saveSnapshot`. It neither changes persisted snapshot bodies nor serves as a domain revision. Every production snapshot insertion/update uses `saveSnapshot`; auth deletion is represented by an explicit process-qualified missing marker, and a subsequent write advances the counter. Core appends its synthetic combat change counter for the recent-record projection, whose body can change independently of the ESI timestamp. Consumers without this optional Store method receive no reusable data token and therefore do not assume payload equality.

Core only attaches `dataRevision` to private UI `/state` snapshots and `snapshot` SSE frames. It is not attached to persisted snapshots, OBS output or Goal/Session domain payloads. Matched semantic payload comparisons must classify this additional private UI field explicitly rather than treating random process IDs as domain differences.

`core.changed(detail)` sends typed read-resource invalidation without recording new historical activity. Resources currently include `activity`, `goals`, `notes`, `sessions`, `goalSources`, plus routing-only `state`, `roster` and `sessionReport`. A missing resource list remains a full legacy/global invalidation. Historical `core.publish(event)` still persists/emits exactly the original event; its SSE notification additionally includes `type`, `module`, resource names and tokens. Goal/note deletions and Session renames emit invalidation without inventing history. `/state.resourceRevisions` lets a missed event recover on the existing fallback.

Resource tokens combine a process epoch with the latest relevant global/pilot counter. A global change invalidates every selected pilot; a different pilot's local change leaves this pilot's token unchanged. Token tracking runs even without an SSE client.

Dashboard forwards:

- `kairo:source-changed` for every raw snapshot and typed change, including nonselected pilots, so Studio can filter its bound pilots/sources.
- `kairo:resource-changed` for selected/global resources and fallback-discovered changes. Snapshot-driven `goalSources` notifications are limited to the declared Goal sources.
- `kairo:obs-status` for the existing OBS status SSE payload and `kairo:events-connected` on stream open.
- Recovery/source events after reconnect or dataset generation change.

`GET /api/obs/status` now returns the existing OBS status object separately from editable configuration, supporting the administrative polling owner's status-only recovery.

## Scoped verification

`scoped-tests.log`: **23 tests passed**, zero failures. Command:

```sh
node --test tests/kairo/resource-state.test.mjs tests/kairo/session-archive.test.mjs tests/kairo/ui-snapshot-revision.test.mjs tests/kairo/data-access.test.mjs tests/kairo/scoped-refresh.test.mjs
```

Server Core, Store and HTTP modules passed syntax checks. The browser harness also passed `node --check`. No build, integrated suite or timing run was executed by this agent. After the coordinator built and granted an exclusive runtime slot, this agent ran the compiled diagnostic acceptance below. These scoped test counts overlap the integrated suite and must not be added to it.

`browser-acceptance.mjs` exercises actual compiled components with synthetic connected pilots: one initial state/timeline/Goals read; unchanged fallback; other-pilot scoping; every automatic Goal source; manual Goal change; state burst/late response; 65-row archive page retention and same-pilot supersession; selected-pilot switch; stream reconnect; and roster removal. Fetch gates deliberately reorder response delivery, and the existing recovery callback is invoked directly. This is diagnostic request/publication evidence, never CPU or latency evidence. Run only with a fresh source/build manifest and coordinator-owned runtime slot:

```sh
KAIRO_REFRESH_LOCKED=1 node analysis/rc17/completion/frontend-refresh/browser-acceptance.mjs APP_ROOT OUTPUT_JSON SOURCE_MANIFEST
```

## Not closed by this checkpoint

The compiled diagnostic acceptance below addresses request/publication correctness. Integrated type/build/tests remain the coordinator's gate; populated matched UI cost, archive growth/presentation decisions and F4 bundle/first-use comparisons are separate required decisions. F3 shell/resource Context separation is not claimed by provider memoization. The common resource owner is adopted for Dashboard/Overview/archive contracts; unrelated pages keep their separately audited ownership. No general startup speedup, browser CPU reduction, leak absence, or complete RC17 optimization claim follows from these helper tests.


## Compiled acceptance result

[`browser-20261007-4.json`](browser-20261007-4.json): **21 checks passed**, no browser exceptions or external requests. The harness verified its source/build manifest before and after: source parent `a27d36c`, working-tree fingerprint `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27` (dirty is expected for the unpublished completion patches; the parent commit alone does not identify this source).

| Diagnostic | Observed result |
| --- | --- |
| Initial Overview | Exactly one bootstrap, state, timeline and Goals read. |
| Unchanged recovery callback | One additional state read; no additional timeline or Goals read. |
| Other-pilot Goal event | No selected-resource requests. |
| Manual Goal invalidation | One additional Goals read; no state/timeline read. |
| Eight automatic Goal source snapshots | Each invalidated Goals; none requested state. |
| Twenty invalidations while state response held | Exactly one retained follow-up; maximum selected-scope state transport concurrency one. |
| State response delivered after newer SSE | Newer wallet value remained visible after completion. |
| Loaded archive | 65 rows retained across refresh; an older renamed debrief updated; exhausted-tail flag stayed false; latest same-pilot response won with transport concurrency one. |
| Pilot switch/reconnect/roster removal | Old pilot state/archive did not publish into the selected pilot; reconnect recovered; removing selected pilot reloaded bootstrap once and selected the remaining pilot. |

Earlier diagnostic attempts are retained. Run 2 returned a DOM element from a CDP `returnByValue` predicate, causing “Object reference chain is too long”; the harness predicate was changed to boolean. Run 3 waited for the deliberately held Promise via CDP `awaitPromise`; the harness now invokes that recovery callback with `void`. These were harness-only corrections. No production source or frozen historical browser helper was edited for the successful run. No latency/CPU claim is made from these diagnostics.
