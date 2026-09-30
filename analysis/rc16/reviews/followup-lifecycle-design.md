# Owned asynchronous shutdown: implementation design

Scope: the full application lifecycle, including inherited collectors and semantic modules. This is an implementation design from RC16 source plus the deterministic shutdown probe and actual managed-restart follow-up. It does not propose a shared asynchronous framework.

## Evidence and required outcome

The integrated real-supervisor/real-child probe preserved accepted HTTP writes, sessions, CSRF continuity and generation replacement. It also demonstrated that a pending semantic listener can outlive database closure: the diagnostic release-at-close schedule lost the accepted ship event and captured three `ERR_INVALID_STATE` errors. See [followup-restart.md](followup-restart.md) for the deliberate scheduling intervention and full boundary disclosure. Successful reconnect does not establish lossless event drain.

RC16 `server/bus.mjs:1–7` discards every callback promise and its error. `server/core.mjs:369–370` disposes history/registry before awaiting dataset work, and closes Combat/Universe before dataset enrichment finishes. `server/index.mjs:544–558` already tracks accepted HTTP handler promises, even if their client disconnects, but Core timers continue during that drain. The supervisor already provides a bounded outer shutdown deadline and refuses successful activation if the old child cannot stop.

The contract is: stop admission and recurring production; finish accepted dependent work with its dependencies available; finish the semantic work that it generated; dispose subscriptions/resources; close transport and storage. A promise-returning operation must represent its owned work. A handler that starts an unreturned promise is outside that contract and should be corrected at its owner.

## Minimal owner changes

1. **Bus:** retain immediate listener invocation and fire-and-forget `emit()` semantics. Track returned promises in one pending set. `drain()` repeatedly awaits the current set until it is empty, including nested emissions created by earlier listeners. Listener errors are caught to avoid unhandled rejections but recorded through a bounded diagnostic surface; they must no longer disappear. The diagnostic contains event type/error, never event payload. A handler must not await the bus's own drain. Closing seals admission only after the drain; synchronous nested publication remains valid while draining.
2. **Application admission:** set the existing HTTP stopping flag first and call a lightweight Core `quiesce()` that clears scheduled Core drivers, without closing its dependencies. Drain accepted HTTP handlers while names, goals, market imports, navigation, ESI and SQLite are usable. Dataset-update service close retains its existing ownership and cancellation policy. New requests receive 503.
3. **Core:** memoize its close promise. Stop new scheduled dataset work, await accepted `syncing` and `datasetSync` work before disposing dependencies, then close producer services in dependency order. Preserve the distinction between already accepted work and polling that has not started. Keep semantic subscribers installed until producer work and the bus have reached a fixed point.
4. **Service dependency order:** accepted dataset enrichment may call `combat.ingest` and `universe.observeSelectedLocation`; drain it first. Universe and Markets can finish while ESI is alive. Session Combat closes its live/history work while Combat is alive; Combat then closes its remaining public work. Market imports may await accepted dataset refreshes, so those promises must remain valid. Session→Combat→ESI is one-way; no inverse dependency was found. Close methods must return their owned work; `Promise.allSettled` is suitable for cleanup only when rejections are inspected and reported.
5. **Subscribers:** drain the bus while Registry, Universe History and Stream are registered. Only then unregister them and dispose Stream timers/clients and OBS. Retain and dispose Stream's wildcard bus subscription; reject toast creation after close. Registry close must clear/dispose registrations once and await promise-returning cleanup. The shipped semantic module has no independent background producer, so no new plugin scheduling API is needed.
6. **Transport and database:** ESI is a downstream dependency of accepted HTTP/dataset/session/combat/listener work, so do not abort it early. After those owners and bus work settle, close ESI admission and await its owned requests/names/mutations and their cache writes. SQLite closes only after the complete Core close succeeds. Auth refresh is coalesced and is awaited by HTTP/ESI owners; keep it alive until they finish.

`quiesce()` must not set the same admission flag that prevents an accepted HTTP handler from starting its later dependent dataset work. Clearing timer drivers and closing dependent services are separate steps. This is particularly relevant to a market refresh that reaches Core after an earlier await.

## Failure and retry semantics

Close is idempotent: repeated callers receive the same completion or failure, and disposers run once. Cleanup attempts should continue after a component error where safe, then surface an aggregate failure. A recorded listener error is visible with a bounded retained history and lifetime count; do not turn a reproduced dropped event into a passing safety claim merely because it was caught.

An unresolved callback keeps the relevant drain unresolved. The existing runtime-child/supervisor deadline remains the bounded fallback; it reports shutdown failure and can terminate the old child rather than closing SQLite underneath pending callbacks. Do not add an inner timeout that proceeds to database closure and calls the restart successful. A forced process exit can retain transactional SQLite consistency without proving that all accepted work completed.

## Verification gates

- Positive deferred listener: close stays pending while names are deferred; release during quiescence; accepted semantic event is persisted exactly once before SQLite closes, with no post-close SQL.
- Nested semantic work: drain includes a child event emitted after an awaited parent callback, and includes asynchronous child subscribers.
- Accepted HTTP and dataset work: future dependent operations remain usable while an admitted handler finishes; the Core close path waits datasets before Combat/Universe disposal.
- Error visibility: synchronous and asynchronous listener failures are retained with bounded metadata and do not become unhandled rejections; close does not silently report a safe accepted-work drain after a new drain-time failure.
- Duplicate close and cleanup: same promise/result, one cleanup, no renewed timers or subscribers.
- Actual managed restart: original cookie/CSRF, session and goal retained; old PID exits before new owner starts; one active generation, no post-close writes, no lost accepted event. Keep the original RC16 failing probe frozen and adapt an external candidate positive gate rather than rewriting the historical expected-gap result.
- Forced stuck-work case: bounded supervisor failure, no successful activation/commit claim. Instrumented integration duration is diagnostic, not a performance benchmark.

## Separate structural work

Cold auth coalescing, transport parsing duplication, market worker termination completion, scoped map access, session-owned travel, projection invalidation and report/replay event-window consolidation have separate owners and evidence. None is a prerequisite for a generic service container or task scheduler. See [followup-whole-app-architecture.md](followup-whole-app-architecture.md) and the service review.
