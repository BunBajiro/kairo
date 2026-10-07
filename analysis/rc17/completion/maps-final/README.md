# Maps M4/M5/M6/M9 final investigation

Internal work only. No clean RC17 readiness claim; PR #10 remains withdrawn. All scripts use `/tmp/kairo-performance.lock`; measured workloads are serialized.

## Frozen inputs

- Current source: c954, copied into `kairo-maps-c954-frozen`; clean source and exact current compiled assets in `c954-source.json`. Its fingerprint `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27` exactly matches the successful integrated `../verification-next/build-receipt.json`.
- Previous source: fa6, existing clean `kairo-rc17-idle`; immutable source/build in `fa6-source.json`.
- Original baseline: RC16, existing clean `kairo-rc16-baseline`; immutable source/build in `rc16-source.json`.
- M9 isolated trial: c954 plus `m9-fastpath.patch`; no compiled frontend needed for this server-only change. `m9-trial-source-v2.json` includes added read/reconciliation tests. The older manifest is retained as an earlier preparation state.

## Queued evidence — not yet acceptance

| Finding | Experiment | Evidence destination |
| --- | --- | --- |
| M4/G14 | Mixed expiry/collapse/timezone identities and Node SQLite plans at 1/8/24 maps per four pilots | `expiry-plans-20261007.json` |
| M4/G14 | Three fresh-database ABBA blocks per size: index upgrade, page bytes, canonical UPSERT and UPSERT+next-expiry | `index-cost-20261007/` |
| M4/G14 | Supplementary SQLite VM-step progress counter on all-live 1/8/24 cases; records Python SQLite version and is not Node latency evidence | `query-vm-20261007.json` |
| M4/M1/M2/M9 | Frozen Maps adapter, diagnostics plus complete ABBA timing matrix and complete selected-object equivalence, fa6 to c954 | `maps-abba-20261007/` |
| M5/G13 | Same fa6 600-node application: replacing versus retaining label Text node in A/B/B/A intervention; full raw invalidation traces | `camera-label-20261007.json` and trace files |
| M5/G13 | Frozen RC16 to c954 browser camera ABBA at 100/600 nodes; native gestures/default scale/full detail, exact graph/viewport/compiled identities | `camera-abba-20261007/` |
| M6 | Current 100/600 nodes, zoom/pan/unchanged-refresh: CPU profiles, raw rendering traces, DOM/commit diagnostics and screenshots | `scene-profile-20261007.json` and associated files |
| M9 | Supported 1/8/24-map wide-note/passage and 100-pilot-roster fixtures; actual Auth SQLite reads, input JSON, service and output serialization separately | `summary-diagnostic-c954.json`, `summary-diagnostic-m9.json` |

Independent M9 source reviews by the Atlas agent and coordinator found no correctness objection to the narrow fast path on supported JSON-backed map records. New tests explicitly retain no-op database-write/revision behavior and legacy `locked:false`, empty `archived_connections`, missing activity, stale comments/passages and connection activity cleanup. Existing J-Space/retention suites cover expiry, grace/prune, undo, import and duplication.

The M9 trial skips the existing whole-map before/after serialization only when topology and every cleanup-sensitive reference already agree. Actual reconciliation and pruning remain intact. It is not yet an adoption decision, and does not imply constant-time summaries: full input-body parsing and roster fanout must be separately measured and dispositioned.
