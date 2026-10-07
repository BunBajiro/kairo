# Startup index ablation — reconstructed 7 October 2026

This disposable external harness attributes the two startup index changes. It does not replace the frozen backend, memory, browser, or full release acceptance lanes. The source and harness were reconstructed after the scratch reset. No pre-loss raw startup-ablation result was recovered, and none is implied by these files.

The runner requires source manifests for canonical RC16, canonical fa6, and an isolated fa6 checkout containing exactly the `market-categories.mjs` and `universe-intel.mjs` changes. The ablation checkout must retain byte-identical fa6 compiled browser assets. All three must use identical atlas and taxonomy datasets. Source identity and all harness hashes are checked before and after measurement. Every child verifies its source after completing measured work.

```
node analysis/rc17/completion/startup/runner.mjs \
  /absolute/rc16-source.json /absolute/fa6-source.json /absolute/startup-variant-source.json \
  /absolute/evidence-directory 3 all
```

The runner obtains the shared benchmark lock itself. Do not wrap it in a second flock. Coordinate the quiet measurement slot before launch. Use `timing`, `heap`, or `counters` instead of `all` to run one class independently. A completed destination is write-once; reruns require a new destination.

Each comparable lane uses fresh-process ABBA observations, first fa6/variant and then RC16/variant. Ordinary timing uses three ABBA cycles by default. Retained-heap diagnostics use a separate ABBA block with `--expose-gc`. Counter diagnostics run separately without making timing or heap claims.

“Cold” means a fresh JavaScript process and module cache. Filesystem caches are not flushed; provenance verification reads the pinned files before launching each child.

- **Core:** cold Core import, construction with no connected pilots, first actual Market categories operation against a synthetic 512-row book, and 80 warm operations. The cumulative import + construction + first-market total makes deferred work visible. Both builds retain the common `noSync` lifecycle; there is no candidate-only `quiesce()` call.
- **Taxonomy:** cold module import, acquisition by two consumers, first combined category/type operation, and 80 warm operations from the second consumer. The cumulative import + acquisition + first-use total includes lazy initialization.
- **Intel:** parser construction over the full bundled atlas, first 84-message mixed workload, and 80 warm workload passes. Messages include full names, abbreviations, ambiguity, multiword names, chat logs and game logs. Warm latency includes per-workload distributions and per-message averages. The latter are batch-normalized values, not individual-message percentiles.

First and final warm output digests must match across builds, runs and corresponding diagnostic modes. There is no per-sample serialization/hash walk inside or between warm samples. Functional tests separately cover every supported bundled name/prefix. Network requests are forbidden. Heap snapshots are process memory samples after three explicit GC/turn cycles; they are separate from ordinary latency measurements. Core samples show before/after import, construction, first use, and shutdown. Taxonomy samples show both consumers and their release. Intel samples show construction, first workload and parser release.

The counter child temporarily intercepts `Map` construction only around the synchronous component operations. It records actual taxonomy index allocation and exact/prefix bucket sizes. It never changes measured application files and is never used for latency or retained-heap claims.

A write-once `startup-abba-completed.json` is created only after every child and final source/harness check succeeds. Progress records and partial output alone do not certify completion. First-use latency, total work and retained memory must be interpreted together; moving work out of startup alone is not evidence that the cost disappeared.

Fresh reconstruction validation: 69/69 targeted tests passed on 7 October (`startup-indexes`, `market-categories`, `universe-operations`, `imports`). All three reconstructed harness modules passed syntax checking. No timed or forced-GC run has been launched in the reconstructed workspace. See [TRACE.md](TRACE.md) for exact gate/code/measurement boundaries and surviving versus lost evidence.
