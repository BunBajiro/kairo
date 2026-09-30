# Follow-up: managed restart with work in flight

The integrated check confirms that RC16 drains already accepted HTTP handlers and preserves the authenticated browser session across an SDE replacement. It also reproduces the outstanding semantic-event ownership gap inside the actual core: under a deliberately late response schedule, an observed ship change is lost and its callback attempts SQLite operations after the database closes.

This is an integration diagnostic, not a restart-speed benchmark or a claim that the race occurs on every update. No application source or initial checkpoint harness was changed.

## Actual boundary exercised

- The unchanged production `runKairoSupervisor` launches two real child processes per scenario. The harness child adapter invokes the unchanged `runRuntimeChild`, which starts the unchanged `startKairo`, Core, ESI service, event bus, SQLite store and both HTTP listeners.
- A real authenticated `POST /api/datasets/install` invokes the production dataset service. Only its fetcher and build function are injected: an existing test helper copies the shipped public topology/detail/market files into a coherent synthetic build, `9000001`. The production service validates hashes and sizes, writes its pending pointer and announces the restart. The supervisor uses the real prepare/commit/cleanup implementation. This does not repeat a full archive conversion or exercise external CCP availability.
- A public ESI type lookup holds an accepted `POST /api/goals` open. A separate public name lookup holds an accepted system-detail GET open. A ship observation dispatched into the actual core bus holds the existing history subscriber on a third deferred name lookup. All three gates are confirmed pending before activation begins.
- A synthetic pilot has an active session; dashboard SSE and OBS SSE are open. The parent uses the real frontend `createDatasetConnection` coordinator to consume the planned notice, disconnect and replacement revision. This tests the protocol/coordinator, not a browser-rendered UI or the OBS executable.
- `noSync` disables periodic collectors. Fake public ESI and CCP responses cannot fall through to real fetch: both scenarios recorded zero external network attempts. No real pilot, OAuth token or player database was used.

## Results

Evidence: [raw results](../raw/followup/restart-integrated.json), [parent harness](../followup/harness/restart-integrated.mjs), [child adapter](../followup/harness/restart-child.mjs). The JSON records exact source and harness SHA-256 values, RC16 source commit, process IDs, ordered lifecycle traces and assertions.

| Control | Normal release while HTTP drain holds shutdown open | Names released at SQLite close |
| --- | --- | --- |
| Accepted goal POST / detail GET | 201 / 200 | 201 / 200 |
| New write after shutdown starts | Rejected with 503 | Rejected with 503 |
| Goal row / matching event after restart | 1 / 1 | 1 / 1 |
| Active session retained | Yes, same ID, still open | Yes, same ID, still open |
| Ship-change event retained | 1 | **0** |
| Observed SQL operations after database close | 0 | **3** |
| Captured SQLite errors | 0 | **3 `ERR_INVALID_STATE` errors** |
| Old PID exits before replacement is forked | Yes | Yes |
| Original cookie accepted / CSRF unchanged | Yes / yes | Yes / yes |
| Write with original CSRF after reconnect | 200 | 200 |
| Planned notice precedes close | Yes | Yes |
| Replacement revision refreshed/completed | Exactly once | Exactly once |
| Observed OBS states remain protected | Yes | Yes |
| Downloaded generations retained / pending pointer | 1 / removed | 1 / removed |
| Cookie or CSRF found in dataset JSON | No | No |

In the normal case, the parent first releases the ship name response while the two accepted HTTP handlers still hold `app.close()` at its drain. The ship event persists before SQLite closes. It then releases the HTTP gates; both responses finish successfully, and the new process observes the accepted goal and session exactly once. This confirms the intended tracked-handler boundary under this workload; it does not establish that all asynchronous producers are tracked.

In the late case, SQLite closes while the independent ship-name request is still pending. The diagnostic observes that real close boundary and releases the response there. To expose callbacks which an immediate process exit could truncate, the adapter allows **100 ms of exit observation grace**; it does not delay or reorder Core/SQLite shutdown. The actual ESI request then attempts its prepared cache write, tries its prepared retry-cache write while handling that failure, and the history callback subsequently attempts the semantic-event insert. The two finalized-statement errors and one `database is not open` error are captured, and no ship event is present after replacement. The production bus swallows the rejected callback.

That late schedule and exit grace are deliberate interventions. The diagnostic demonstrates missing ownership, not the normal frequency of the race or a natural production shutdown duration. Without observation grace, early process exit may discard outstanding work before these errors become visible. A successfully reconnected UI therefore cannot be used as evidence that every accepted semantic observation was retained.

## Bounded run and fixture correction

The final run completed from `2026-09-30T12:20:50.231Z` to `12:20:53.102Z` under `/tmp/kairo-rc16-benchmark.lock`, with no competing checkpoint runtime. The 2.871 seconds describe the instrumented diagnostic run only. SQLite wrappers, synthetic responses and the late-case exit grace make it unsuitable as ordinary restart latency evidence.

Two failed exploratory attempts are retained as [attempt 1](../raw/followup/restart-integrated-attempt1.json) and [attempt 2](../raw/followup/restart-integrated-attempt2.json). Their parent waited for a diagnostic success message whose payload accidentally overwrote the IPC envelope's `type` field. The application had inserted the event, but the harness parent ignored the notification. Attempt 1 consequently allowed the HTTP gates to hit native ESI timeouts while it waited. Attempt 2's added SQL observation identified the successful insert, isolating this as a fixture bug. Renaming the diagnostic payload to `semanticType` fixed the control; neither attempt is evidence of an application regression. Their stderr files and source hashes remain alongside the results.

## Implementation gate

Keep the successful HTTP-drain, generation-activation and private-session handover boundaries. Extend ownership to asynchronous semantic callbacks: quiesce new producers, drain accepted work before SQLite closes, then export sessions and exit. Ensure failed/cancelled lookups have an explicit disposition and avoid making nested event emission await itself.

The later candidate needs a positive, bounded deferred-response variant which expects the ship event to persist before database close. Do not reuse this RC16 diagnostic's expected-gap assertions as a candidate safety gate; a corrected lifecycle should invalidate them. Retest accepted HTTP handlers, duplicate prevention, same-cookie/CSRF writes, protected OBS reconnect and single-generation cleanup together after the lifecycle change. Real Windows EVE/OBS contention remains outside this synthetic lane.
