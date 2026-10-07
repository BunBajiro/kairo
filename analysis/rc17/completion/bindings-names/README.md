# Conditional binding evaluation and full names payload

This lane addresses the A4 residual in `../TRACE-BACKEND.md`. It is an actual-Core diagnostic, separate from the original whole-application acceptance matrix. Results and the adoption decision are recorded in `RESULTS.md` after completed source-pinned runs; a prepared harness alone does not close this finding.

`diagnostic.mjs` creates a real SQLite Store and real Core, leaves the production `updateBindings`, `sync`, Stream sanitization, event encoder and SSE chunking unchanged, then quiesces interval drivers. It seeds synthetic pilots and future-due source snapshots, configured visible/hidden widgets, saved Goals/Sessions and a declared name directory. ESI transport is prohibited for the no-work lane. The snapshot lane enables only Wallet and uses a controlled immediate adapter for balance/journal/transaction/order responses; this measures Core publication, not ESI network/cache performance.

- Binding matrix: 0/10/50 configured elements, all visible or all hidden, 0/1/3 Stream clients, 100/1,000/10,000 name entries. Widgets exercise all eight supported binding sources; repeated sources share reads as production already intends.
- Each case executes actual `core.updateBindings()` and actual not-due `core.sync(42)`. Stable no-work values must emit no Stream or UI messages, with zero provider requests.
- Snapshot matrix: 0/1/3 UI clients and the same three directory sizes. Every forced Wallet sync emits exactly four complete snapshots. All clients must receive identical names/data; zero clients exercise the existing pre-encoding short circuit.
- Controls cover exact snapshot expiry, fresh changed source, immediate reconnect state, independent protection publication, public-field sanitization, and showing a previously hidden widget through the actual save-route projection contract. A separate one-second advance observes whether hidden time-dependent widgets cause output publication.

Counter mode wraps only accessors and explicit SQL preparation; these counters are not elapsed-time evidence. Ordinary mode has no Store/SQL wrappers. Its consuming client sinks count bytes without retaining/copying frame buffers; output equivalence is checked in a separate untimed capture. These sinks are not Chromium, TCP, or a backpressure measurement. A fixed domain clock prevents time-dependent progress from contaminating the no-work comparison. Explicit controls advance time separately.

Every run pins the entire source/build fingerprint before execution and verifies it afterward, as well as the harness hash. Use the shared performance lock for all invocations. `KAIRO_DECISION_TIMED=1` enables ordinary timing; omit it for counters.

```sh
flock /tmp/kairo-performance.lock env \
  KAIRO_BENCH_REPO=/absolute/path/to/immutable-runtime \
  KAIRO_BENCH_SOURCE_COMMIT=full-forty-character-source-sha \
  KAIRO_DECISION_OUTPUT=/absolute/path/to/result.json \
  node analysis/rc17/completion/bindings-names/diagnostic.mjs
```

Potential changes have different contracts. Skipping hidden **saved** bindings can be narrow because Stream output excludes hidden elements and save/preview compute current projections independently. Skipping all disconnected evaluation requires a fresh-connect mechanism; caching across updates requires time/freshness and pilot/module/source invalidation. A global “names already sent” flag is incorrect because different dashboards select different pilots and ignore other-pilot snapshots. Any names revision/delta protocol must account for that audience, late state responses, reconnect and initial bootstrap. Do not present these broader changes as unconditional requirements or silently weaken existing freshness/OPSEC behavior.
