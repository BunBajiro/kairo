# F3 residual attribution and Assets view trial

8 October 2026. The accepted names helper remains included. This lane addresses the remaining resource Context work; F6 archive cardinality/table processing, M6 map scene leaves and names wire protocol have separate owners. PR #10 remains withdrawn.

## Exact source and attribution

The diagnostic uses clean `985a6c17d466d01f1f098a1704de68f6eae5f6e6` at `kairo-frontend-context-985-oct8`. Its copied fresh build was verified against the original successful integrated receipt, including all source hashes and 20 built assets; see `build-copy-receipt.json`. A attempted comparison against the live continuation detected subsequent Atlas staging, so that mutable checkout was not used as proof. This is a copied verified build, not a newly claimed build.

The profile records the same synthetic 20 full-name wallet snapshots with 40 ms scheduled gaps while Assets displays 10,000 rows (30 visible). Names have two realistic sparse ID ranges, 4200000–4209999 and 4300000–4309999, totaling 20,000 names and 550,001 JSON bytes. This representation differs from the earlier dense 1–20000 kernel fixture; kernel costs are not transferred to this browser case.

Verified compiled offsets identify 117.540 ms sampled in the names helper/update owner, 45.352 ms in the snapshot event owner containing JSON parsing, and 109.755 ms in remaining framework/UI work. The latter is an upper bound for a Context-only change: it includes every remaining React/UI operation in the window. Idle, program and GC samples remain separately reported in `ATTRIBUTION.json`. The DataTable function's own/inclusive stack time cannot capture all descendant React work, because React schedules child components separately. These are instrumented diagnostic samples, not ordinary comparative timings.

## Narrow proposal

Trial base is exact `22773cc7cb6e83ac51e412565ba65c101613536a`, which includes the accepted Atlas decision. `operations.tsx`, `context.tsx`, `dashboard.tsx` and `resource-state.mjs` are byte-identical between 985 and 227. The new paired measurements use 227 on both sides and do not relabel the 985 profile as a 227 measurement.

Only `components/kairo/operations.tsx` changes. AssetsPage remains the Context subscriber and passes its four complete ModuleState objects (assets, prices, fittings, contracts) plus the full names map to a memoized AssetsView. Unrelated wallet/Goals/OPSEC changes can rerender the cheap outer subscriber without recreating the populated view. A pure OperationRowsTable receives explicit state/names so nested tables do not bypass the memo boundary by subscribing to the broad Context. Other pages keep their OperationTable wrapper and current subscription contract.

Complete ModuleState props preserve metadata-only status/error/truncation/timestamp updates. The whole names prop preserves nested fitting-module labels beyond the row model's referenced IDs. The unchanged NoData component retains its own live character/navigation Context subscription; empty connection actions remain fresh through memoized ancestors. Existing active-tab ownership, row keys, native details state and query/sort/page state remain in place. Pilot changes retain Dashboard's clear/unmount/response-generation fences. No global cache, protocol change, Context API replacement or history retention is introduced.

## Required evidence

Independent read-only review found no concrete blocker before compiled verification and specifically requested metadata-only and zero-character controls. The runtime lane runs focused resource/model/scope tests, both fresh builds and type checks, expanded compiled diagnostics for both variants, and one complete baseline/candidate/candidate/baseline ordinary browser cycle. Source guards allow exactly operations.tsx to differ; every source/build fingerprint and entry harness is pinned before the workers.

Diagnostics cover sorting, search/page clamping, unchanged source identity, relevant/unrelated names, deep fitting-module name changes, fresh fitting data with open native details, inactive/active contracts, shared prices, metadata-only status/error/truncation with retained rows, delayed state versus newer SSE, authoritative name removal, selected-pilot changes with delayed old state, stale/disabled/missing scope, and live connection actions including zero characters. Ordinary timing uses the exact previous whole harness, including first-open and all adverse-sensitive rows, without diagnostic wrappers or CPU sampling. No tests or profile result by itself authorizes adoption.

Names wire/scanning/decoding remains a distinct backend-owned protocol decision. A successful bounded Assets view does not establish that every Context consumer requires a subscription redesign or that broad Context/F3 is fully closed. Adoption/rejection follows the paired results and retains all first-use/changed-input tradeoffs and final combined gates.
