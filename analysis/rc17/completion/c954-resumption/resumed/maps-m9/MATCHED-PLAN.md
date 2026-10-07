# Exact c954 versus isolated M9 matched lane

Prepared after 210 targeted semantic tests passed. The coordinator granted the
next exclusive runtime slot for this bounded initial matrix. No source integration
or clean-review decision is implied.

## Source guard

`freeze-sources.mjs` uses the existing, **unmodified** `captureSource` and
`verifySource`. It first verifies the clean c954 frozen root against its original
source/build fingerprint. At execution it copies only that verified root's Git
metadata into the isolated git-archive trial, preserving its c954 index. The five
proposal files remain unstaged; no source checkout, staging, commit, fetch or
publication occurs. It rejects a linked Git directory or `core.worktree` override.

The guard requires 482 identical source paths, exactly the declared five hash
deltas, the same full c954 HEAD on both sides, no staged changes and exactly five
modified status entries on the trial. Every other byte must equal the baseline.
Baseline's 26 compiled assets remain manifest-verified; trial has no compiled
assets and makes no browser claim. Server fixtures and bundled static data are
therefore unchanged. Source manifests and a separate boundary receipt are saved
before any application process starts and reverified by each worker and parent.

The parent pins the proposal, source helper, all runners, fixture workers and
equivalence adapter hashes; every completed child's raw output is retained.
Output must be a new directory. `completed.json` appears only after all children,
parity checks and source/harness verification pass. Failure writes `failed.json`
without removing earlier output. The previous incomplete M9 trial remains intact.

## Sequential matrix

| Lane | Processes and cases | Measurement boundary |
| --- | --- | --- |
| Mutation/access guards | Two processes, one per source; 15 phases ×selected/full/summary | Untimed. Complete response and stored-document equality, identical write deltas; separate Auth call/row counts. Ready data, rename, scope loss, reauth, module toggles, ESI/log authority, disconnect/reconnect, sample expiry, pause, legacy/dangling cleanup, injected timezone expiry, canonical/document replacement and collapsed unknown lifetime. Owner disconnect must reject reads and mutation. |
| Wide/roster count diagnostic | Two separate processes; 27 cases each | Original `summary-workload.mjs` in diagnostics mode: plain/wide/100-pilot roster ×1/8/24 maps ×summary/selected/full. Complete output/input hashes agree. JSON/Auth counters and instrumented phase time do not supply acceptance latency. |
| Wide/roster ordinary ABBA | Four fresh processes, c954/trial/trial/c954; 27 cases ×five samples each | Original `summary-runner.mjs` and worker. Two warmups; 540 ordinary measurements with service/CPU and serialization separately. No diagnostic wrappers, profiler or forced GC. Same input and all complete output hashes enforced. |
| Frozen Maps diagnostic and ordinary ABBA | Two separate diagnostic processes, four fresh timing processes, two untimed selected-equivalence workers | Original `maps-runner.mjs` plus frozen adapters: 21 cases, 1/8/24 map independence, fixed720-link summary/full families, 0/100/1000 signatures ×100/1000 edges. Three warmups and seven samples per timing case: 588 ordinary measurements. Second pair reverses case order. Exact selected object and ordered array equality plus all built-in cardinality/work assertions remain. |

Total: **1,128 ordinary service measurements**, plus separate counters/guards and
warmups. The wide fixture retains 500 comments and1,000 passages per map, each
document below the supported4 MB bound. The 24-map full output remains about87 MB;
its necessary serialization cost is reported, not removed. The roster fixture
uses real Auth/SQLite reads and100 connected/tracked pilots.

Expected wall time: **about 3–4 minutes**, based on the saved c954 baseline
summary child taking29.7 seconds, prior fast-path children24–26 seconds, two
diagnostic children~12 seconds each and frozen Maps matrix~20 seconds. This is an
estimate, not a new measurement. Allow modest source-manifest/metadata overhead.
No optional repetition, build, profile or browser run is part of this initial
slot. A concrete failure or material variance must justify any extra work.

Both `/tmp/kairo-performance.lock` and the historical
`/tmp/kairo-rc16-benchmark.lock` are held by the same outer runner, in that order.
Worker nested-lock bypass flags are set only by this owner, so older raw lock
labels also identify an actually held lock. Counters, guards and ordinary timing
never overlap each other.

```sh
node analysis/rc17/completion/c954-resumption/resumed/maps-m9/run-matched.mjs analysis/rc17/completion/c954-resumption/resumed/maps-m9/matched-attempt1
```

That is the planned command. Actual completion and hashes must come from its
receipt. The guard models direct canonical/document replacement; it does not
pretend to rerun the public import API. Public import/duplicate/undo/grace/prune
semantics remain covered by the passing210-test lane, with final integrated gates
still required. Async fleet revocation/disconnect is likewise covered by that
lane; no context crosses an await in the matched service fixture.

Unresolved after this matrix: the residual wide-summary body parsing, measured
adoption of the two proposed mechanisms, and final integrated/local/CI acceptance.
No successful matrix alone closes all M9 or restores PR #10 to user review.
