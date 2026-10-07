# RC17 work checkpoint — 7 October 2026

**Internal work in progress. Optimisation is incomplete; PR #10 remains withdrawn and in draft.** This checkpoint banks the work following the [a27 source audit](TRACEABILITY.md). It does not prepare a clean RC17 or authorize a merge/release.

## Saved source and verification

Current internal source: [`c954c0d808847f249df0659ed15fdce2e89f84c4`](https://github.com/BunBajiro/kairo/commit/c954c0d808847f249df0659ed15fdce2e89f84c4), tree `87c20772b3843504a467c3e7f6de05f9018b3b6c`. It is published on `refactor/rc17-v0.8.0`; the withdrawn review branch is unchanged.

- **941/941 integrated runtime tests pass**, with passing type checks and a fresh production build. [Logs and source/build manifest](verification-next/) retain the full evidence. The [build receipt](verification-next/build-receipt.json) identifies the exact source/build fingerprint; committing the unchanged built tree preserves that fingerprint.
- [Compiled refresh acceptance](frontend-refresh/browser-20261007-4.json) passes **21 checks**, with no browser exceptions or external requests. One initial state/timeline/Goals read, unchanged fallback, all Goal source invalidation, bounded transport, same-pilot archive ordering, loaded-page preservation, pilot switches, reconnect and roster removal are exercised. Earlier harness failures remain retained.
- Other compiled browser lanes are prepared or being debugged. Studio editing passed its first seven checks; the first renderer attempt had an uncontrolled protection-state/count assumption in the fixture. It is not a renderer acceptance pass. No incomplete lane is reclassified as successful.
- The [two-file startup ablation](startup/RESULTS-20261007.md) is complete in 99 source-pinned fresh processes. It supports the specific taxonomy/Intel changes, explicitly includes first-use cost and does not close the entire populated startup finding.

## Implementation records

| Area | Changes and disposition |
|---|---|
| [Dashboard and archive](frontend-refresh/IMPLEMENTATION.md) | F1/F2 scoped/coalesced state ownership, stable resource identities, typed invalidation, roster/reconnect recovery, same-pilot archive fencing, retained loaded prefixes and failed-refresh retry. Backend adds private UI revision metadata; domain snapshot bodies remain unchanged. |
| [Derived UI models](frontend-models/IMPLEMENTATION.md) | F3/F6 active-tab models, source/name-owned row derivation, cached table search/order and stable page clamping; F7 lazy reusable formatters. Broad Context subscription separation remains a measured design decision, not an accomplished rewrite. |
| [Administrative resources](admin-polling/IMPLEMENTATION.md) | F5 bounded visible/job-aware Markets scheduling; stream OBS status with status-only recovery and dirty-config fencing; separate Goal progress/notes/metadata ownership. Compiled acceptance pending. |
| [Studio and browser source](studio-stream/IMPLEMENTATION.md) | F8 geometry-independent binding preview and isolated clocks/frame-coalesced drag; F9 changed-text/recovery-layout writes and storage-failure-safe protection rendering. Complete compiled renderer acceptance pending. |
| [Updater](updater/IMPLEMENTATION.md) | U2/U2b conversion/no-progress, aggregate spool/output/external-allocation/free-space limits; bounded visible cleanup warnings and worker-exit ordering. Independent review fixes preserve valid active generation and primary write errors. Real loaded conversion/U1 and inventory/U3 measurement remain open. |
| [Session/replay](session-replay/IMPLEMENTATION.md) | S3 indexed recent-Session eligibility and R1 fixed-snapshot timeline preparation, preserving order, end/cutoff/cursor/seeks. Index write/space and ordinary two-minute/compiled comparisons remain required. |
| [Atlas index trial](atlas/README.md) | Shared immutable name lookup with readonly ownership and mutable-injected fallbacks; independent review caught and fixed fallback ID capture. Source correctness passes; adoption/performance disposition awaits the isolated five-file trial. |
| [Backend decisions](backend-decisions/README.md) | Goals retained-ledger and real Core/ESI enrichment diagnostics are saved. An isolated concurrency-four enrichment trial is separate from this checkpoint; timed adoption remains pending. |
| [Route delivery trial](route-loading/TRIAL.md) | F4 lazy-route trial is isolated from the current source. Matched build/chunk/cold Overview/first-navigation work remains pending. |

## Measurements queued, not completed

The source-pinned Atlas/first-formatted-binding ABBA, G8 state-tail causal crossover, G9 startup-inclusive/settled idle diagnostic, Session/index/replay, populated UI/formatter, enrichment and route-loading trials are prepared. Their scripts, fixed inputs and explicit completion guards are banked here; syntax checks and test counts are not timing results.

The new updater and completion-UI CI workflows accept an exact private source SHA through restricted request-file triggers or manual dispatch. No request file is created by this checkpoint. They upload internal raw evidence only. The unchanged final local/independent-CI comparison matrix and final clean packaging gate remain after measured adoption decisions and source freeze.

Further checkpoints should append fresh results and retain failed attempts. Do not overwrite the older source/evidence identities, claim that the audit's open items disappeared, or promote PR #10 based on this bank point.

## Recovery bank — fresh chat, 7 October

The prior workspace survived the chat interruption. Source `c954c0d` remains the internal runtime checkpoint. The preserved Studio `browser-run4/result.json` completes all ten renderer/editor checks without exceptions or external traffic. Atlas `browser-run1/result.json` also completed; the [Atlas results](atlas/RESULTS-20261007.md) support the already-integrated shared index and record first formatted-binding costs. Earlier incomplete/failed attempts remain preserved. The original pending descriptions above are historical checkpoint wording; these newer results supersede only their stated lanes.

Fresh work resumes with isolated lazy Atlas layout, lazy route-delivery, loaded SDE conversion, backend/Session and frontend acceptance lanes. Heavy builds and measurements are serialized through `/tmp/kairo-performance.lock`. Root owns integration and GitHub bank commits; no experimental source is silently promoted. Existing evidence is being saved before further implementation. Every remaining finding and frozen-source local/CI acceptance still require closure before clean RC17.
