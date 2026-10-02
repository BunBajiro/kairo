# Bounded RC16/candidate residency and Sessions comparison

Prepare compiled source manifests in the coordinator's frozen checkouts, then:

```sh
KAIRO_BASELINE_MANIFEST=/path/to/rc16-source.json \
KAIRO_CANDIDATE_MANIFEST=/path/to/candidate-source.json \
node analysis/rc17/harness/memory-runner.mjs \
  /path/to/rc16 /path/to/candidate analysis/rc17/raw/memory all
python3 analysis/rc17/harness/memory-summarize.py analysis/rc17/raw/memory
```

The runner acquires the shared benchmark lock. It launches fourteen sequential,
fresh children: ordinary residency ABBA; separate forced-GC residency ABBA;
uninstrumented Sessions ABBA; and one SQL diagnostic per source. Each child has
a 120-second deadline. `residency` or `sessions` can replace `all` for a focused
investigation; the full summarizer intentionally requires all fourteen results.
Do not launch without the coordinator's runtime grant.

These are copies of the original RC16 memory fixtures, now comparing fresh RC16
against the candidate rather than v0.7.3. The original files and raw evidence stay
frozen. The four-pilot residency fixture has no HTTP server, scheduler, assets,
user map nodes or live sessions. It isolates import, topology and Core ownership.

Ordinary markers report phase elapsed time and RSS/heap without forced collection.
The separate retention lane loads topology explicitly before Core construction,
then exercises the same pilot-state pairs, all-system lightweight cache, 384
celestial details and ten Core recreate/use/close cycles. All shape/identity and
network guards remain. Collected heap is not compared with ordinary allocation
snapshots. Post-close RSS includes allocator capacity and shared module caches;
neither growth nor immediate retention alone establishes a leak.

The five Sessions fixtures retain 100/1,000/10,000 in-window visits, the extra
10,000 older-row case, and four live pilots with 1,000 visits each. Legacy rows
remain unowned in the new nullable `session_id` field so this is the same
preserved-history compatibility fixture. Production regression tests cover the
new writer's session ownership and delayed-observation semantics separately.
Candidate discovery membership is seeded from those legacy rows before timing,
matching a real migration despite the fixture inserting rows after `openStore`.
The exact per-pilot set is validated; it is not part of the paired route digest.
The minimal residency fixture has no visits and correctly retains an empty set.
System/time/duration/active route hashes and complete combat request-group hashes
must agree across both sources and all repetitions. Sovereignty, ship fields and
the whole replay/report contract are not claimed equal by those partial hashes.

The feed's real next-check time remains one hour in the future. In diagnostics,
three calls must read `3 × pilots × visits` visit rows in RC16 and **zero** in the
candidate. Real route reads remain tested separately; the improvement cannot be
obtained by returning an empty route. SQL instrumentation never supplies latency
evidence. `referenceWindowQueryPlan` is explicitly the fixture's reference SQL;
the recorded statement counts are the actual production statements.

Source manifests are verified in the parent before measurement and again after
all children. Each child verifies the initial manifest after its final measured
marker; no source hashing is included in its phase timings. The parent retains
source/build manifests, hashes every child output and rechecks harness hashes.
Incomplete runs preserve partial evidence and fail. Summaries require fourteen
completed children, unchanged identities, five semantic fixture comparisons,
matching runtime/CPU environment and two observations per comparable marker.

The existing forty-minute workflow budget is retained: this bounded lane took
about twenty seconds in the earlier RC16 follow-up, and route scaling adds a
short bounded probe. The new runtime has not yet been measured; if actual CI
approaches the deadline, use the explicit `memory` suite instead of silently
reducing sample counts or relaxing assertions.
