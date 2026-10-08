# Names protocol: compiled publication fixture adaptation

Prepared read-only by the frontend lane, 8 October 2026. No runtime or source change is claimed here. Protocol roots supplied by the owner are `kairo-names-227-baseline` and `kairo-names-227-candidate`, both exact 227 plus the accepted hidden-Stream filter, with only the six-file protocol proposal differing. They intentionally predate the accepted Assets boundary; the paired protocol result is not final combined-source acceptance.

## Preserve the frontend fixture; replace only its event driver

Use the accepted names browser fixture: two pilots 42/43; 10,000 populated Assets rows each; names IDs 4200000–4209999 and 4300000–4309999, labels `Asset 00000` and `Second Asset 00000`; the complete 20,000-entry directory is 550,001 JSON bytes. Preserve first Overview, first Assets open, the row count/page/search/sort history, viewport, ordinary renderer metrics and real 40 ms gaps. Preserve all first-open/changed-name rows and both nearest AB/BA pairs.

The historical worker's `snapshot()` manually writes old `event: snapshot` frames, including `names`. It exercises the legacy client fallback only. **Do not use it to accept the new wire protocol.** Drive the actual `Core.sync(42)` → `runDataset(wallet)` → snapshot persistence → `send()` → real `/events` client. Candidate bootstrap must come from actual `connectUI()` on the HTTP EventSource, not a harness substitute.

## Deterministic real-Core scheduling

1. Seed all existing frontend datasets with the original data and ready status. Give every enabled non-wallet dataset both `refreshAt` and `expiresAt` far in the future (2099), including journal, transactions and orders. Merely setting `expiresAt` leaves `runDataset` free to fetch them. Public profile data must also remain valid for owner checks. Grant the fixture pilots the scopes needed for Wallet and the visible Assets datasets; the scope check runs before the not-due shortcut and otherwise rewrites saved metadata to `missing_scope`.
2. Start the real local app with no automatic synchronization and deferred dataset startup, then call `core.quiesce()` to remove the ordinary ticker/heartbeat. Do not call `core.close()`, which sets stopped. Do not use `requestSync`, which forces multiple datasets.
3. Use an allowlisted fake ESI fetcher for the exact `/characters/42/wallet` request. Return the next numeric wallet value, JSON headers and an HTTP expiry relative to the controlled server clock. Reject and record every other request. The browser uses actual local HTTP/SSE; all real external traffic remains blocked.
4. The original fixture's `synthetic-unusable-token` cannot drive authenticated ESI: auth fails before the fake fetcher. `startKairo` returns `auth`, and `createESI` reads `auth.access` dynamically. In the disposable fixture only, replace `app.auth.access` with a checked synthetic provider for pilot 42 (save and restore the original), or seed a valid encrypted synthetic vault token. Never use user tokens. Record this fixture adapter explicitly; no production source change is needed.
5. Save `realDateNow = Date.now`; replace only this server/harness process's `Date.now` with a controlled value. The browser is a separate process and keeps its real wall clock; `performance.now`, waits and renderer windows stay real. `new Date()` without arguments does not inherit a JavaScript `Date.now` override, so harness receipts use the real clock and fake ESI timestamps/headers explicitly use `new Date(serverNow)`. Do not claim accelerated real end-to-end wall time.
6. Before each of twenty sequential `await core.sync(42)` calls, advance `serverNow` beyond the saved wallet `refreshAt`, its HTTP `expiresAt`, and the current value plus the Core three-second floor. The next ready wallet sample supplies the following deadline. Use real `await delay(40)` between completed publications. The first seeded wallet can be due at the controlled start. After each call require ready wallet data with the expected value and an advanced durable data revision; `sync` internally uses `allSettled`, so a resolved promise alone is not success.
7. Restore `Date.now` and auth access in `finally`, including failure, and stop app/browser workers. All snapshots outside Wallet must retain their initial data/revision; no unexpected ESI route, automatic dataset activity or extra snapshot is accepted silently.

The driver can use the following calculation; it is not a replacement for asserting actual publication:

```js
const sample = app.store.snapshot(42, 'wallet');
serverNow = Math.max(
  serverNow + 3001,
  Date.parse(sample.refreshAt || '') + 1 || 0,
  Date.parse(sample.expiresAt || '') + 1 || 0,
);
await app.core.sync(42);
await delay(40);
```

For the very first due seed, use a ready wallet whose deadline precedes controlled time. Preserve the original route/history and identical seed/clock sequence in both arms. A matching candidate and baseline server-clock ledger should be saved with every worker.

## Counts and semantics in a separate diagnostic worker

Observe actual `Network.eventSourceMessageReceived` frames on the real `/api/events` request or instrument that connection in a diagnostic-only worker. Count event type, packet bytes, character, dataset, revision and order; do not inject frames or include packet parsing instrumentation in ordinary timings. Prefer a separate diagnostic browser, because retaining full frame strings itself adds harness load and heap.

After bootstrap, an unchanged twenty-wallet sequence should deliver exactly twenty Wallet snapshots in both variants, identical wallet values and no incidental dataset snapshots. Baseline includes the full name map per snapshot. Candidate emits no repeated names body after its initial connection bootstrap; every snapshot carries the current names revision. Record initial `/state` and bootstrap costs separately from steady updates rather than excluding them from the report.

Compiled correctness must also use actual Core publication for rename/add batching, late connection bootstrap, reconnect, 0→1 UI clients, two selected pilots (including a names update accompanying an unselected pilot), stale HTTP `/state` versus newer names SSE, process epoch restart, and authoritative state replacement/removal. Preserve legacy unversioned event/state compatibility as a distinct fallback row. An event with an unchanged revision must not suppress real changed input, and a later old response must not restore obsolete names. The protocol owner already has server/state semantic tests; browser races are their integration gate.

The independent protocol review additionally identified initial-open and outage recovery cases. The corrected draft must pass these through the actual compiled Dashboard effects: hold a legacy `/state` response until after the first successful EventSource open, emit no snapshots, and require that initial state to publish; simulate an error before the first successful open and require the subsequent open to request the scoped refresh; disconnect during an old state read, permit a fresh HTTP process-epoch transition during the outage, and reject the held old response; remount the Dashboard effect and verify listener cleanup, one active connection and current scope ownership. Helper-only owner tests do not establish that the effects call these transitions correctly.

For a relevant rename, call `core.rememberNames` with the new string, then drive one due real Wallet sync. Check one new complete names frame precedes the affected snapshot and the populated Asset/fitting label changes. Batch several `rememberNames` calls before one publication to establish that enrichment does not broadcast each individual name. Keep whole-map JSON decode/merge costs in the actual compiled result; dense numeric-key kernel speedups are not a substitute.

## Ordinary paired gate and combined limit

Fresh builds/source manifests, fresh browser/process ABBA, same route priming and clock ledger, no DevTools coverage/profiling/packet counters in ordinary rows. Report first bootstrap/Assets open, unchanged twenty-event task/script, one relevant-name publication, one irrelevant-name publication, selection/pilot/state transitions and cleanup. Keep all adverse measurements, including the already observed names-helper first-open cost and relevant-name variation. A repeated >10% and >1 ms task regression requires a causal follow-up.

The 227-based comparison isolates the protocol with the hidden filter present. After adoption, current-source integration must combine protocol, Assets boundary and other accepted changes and retain first-use plus changed-input checks. It cannot close all F3, M6 or the clean RC17 gate by itself.
