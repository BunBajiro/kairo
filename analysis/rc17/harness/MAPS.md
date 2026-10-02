# RC17 Maps comparison adapter

`maps-scaling.mjs` is an external analysis adapter. The original RC16 follow-up harness and application checkout remain frozen. No counters or instrumentation are imported by the production candidate.

The selected map is held at 100 nodes, 99 canonical links and 100 bound signatures while the library grows from 1 to 8 to 24 populated maps. Full-list service calls use identical fixtures. Candidate-only compact summaries use those same fixtures and verify counts, revision, expiry and omission of operational bodies. Constant-link cases keep 720 canonical links fixed across 1/8/24 maps. Dense cases retain 100 nodes, 0/100/1000 signatures and 100/1000 links.

Both implementations assert exact canonical endpoints, access and expiry flags, ordered reverse signature bindings, node coordinates and a full selected-map semantic digest. The digest must agree across map volumes and selected/full-list reads within a run and is recorded for comparison between runs. This exercises the services backing detail, full-state and summaries APIs; it does not include HTTP transport or claim browser latency. The separate compiled-browser correctness check covers the API consumer, scaled geometry and collapsed display groups.

Diagnostics count logical SQLite results and former signature-by-edge filter work. The baseline must reproduce its exact S×E filter count. The candidate must perform none of those scans, materialize each applicable canonical link and signature body once, and fetch no operational records for summaries. SQL bytes are materialization bytes, not disk IO. Diagnostic output is never timing evidence.

Timings retain three warmups followed by seven uninstrumented invocations per case, measuring service work and JSON serialization separately. Output correctness checks run outside the measured intervals. The reported maximum is an observed sample maximum, not an estimated percentile. Use balanced baseline/candidate/candidate/baseline order, with the final pair traversing cases in reverse.

Required environment:

- `KAIRO_BENCH_SOURCE_ROOT` (or `KAIRO_CANDIDATE_ROOT`): application checkout.
- `KAIRO_SOURCE_MANIFEST`: manifest captured after source/build are frozen.
- `KAIRO_BENCH_OUTPUT`: per-run result directory.

Commands:

```sh
node analysis/rc17/harness/maps-scaling.mjs diagnostics
node analysis/rc17/harness/maps-scaling.mjs timings
node analysis/rc17/harness/maps-scaling.mjs timings --reverse
```

Append `--baseline` for canonical RC16. That option requires its pinned source commit and explicitly records summaries as unavailable; it does not substitute full payloads or zero timing values. `--filter=independence` (or another case-name fragment) can select a bounded subset.

Every run acquires `/tmp/kairo-rc16-benchmark.lock`, blocks external fetches, verifies the complete source/build manifest before and after, and records hashes of both adapter and shared manifest helper. Coordinate the runtime lane with the root agent before running timings. Never edit candidate files or build assets during an accepted measurement.
