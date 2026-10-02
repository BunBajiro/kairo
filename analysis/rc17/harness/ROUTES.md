# Isolated route comparison

This lane runs the real `Universe.navigation.plan` over the full catalogue and
the corrected backend stress fixture, with the same origin and repeating stop
sequence as the mixed workload. The cases contain 1, 10 and 50 ordered stops.
The policy is explicit shortest gate routing, with optional connections off.
This isolates repeated preparation cost; the mixed lane covers loaded scheduling
and transport responsiveness separately.

The stress fixture contains 100 distinct legacy discoveries. Candidate setup
seeds the separate membership table exactly as its upgrade migration would when
opening existing visits; RC16 reads the preserved visits directly. This untimed
preparation is recorded in each child result and its helper is included in the
before/after harness hashes. The runner asserts the expected memberships.

```sh
KAIRO_BASELINE_MANIFEST=/tmp/rc16-source.json \
KAIRO_CANDIDATE_MANIFEST=/tmp/candidate-source.json \
node analysis/rc17/harness/route-run.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" output/routes
```

The runner acquires the shared benchmark lock itself. Both checkouts must have
source manifests captured after build and before the run. Their complete source
and build file sets, plus the harness and fixture files, are verified again at
the end. The root coordinator must grant local runtime ownership before running.

Two separate diagnostic children count graph preparation and logical SQL result
materialisation. The frozen catalogue's gate iterator is observed through a
diagnostic-only proxy for that exact array; application data and other array
iterators are not modified. Timing children receive the untouched catalogue.
These instrumented runs produce no latency samples. Four fresh
timing children run RC16/candidate/candidate/RC16, each with two warmups and nine
samples per case. The second pair reverses case order. Timing includes planning,
the production acceptance check, the persisted plan save and its returned clone;
setup, itinerary edits, result assertions and source hashing are outside it.
Raw samples are retained; per-run medians and p95s are reported without pooling
different machines or disguising the small sample count.

Every result must be complete and reachable, retain all ordered stops, begin/end
at the correct systems, and have the same persisted revision. A fixed synthetic
clock permits a digest comparison of the **complete returned plan**, including
segments, exact edges, costs, source metadata, warnings and timestamps. Nothing
is masked. All candidate diagnostic and timing outputs must equal the RC16
diagnostic semantics for their case. Any external network attempt fails the lane.

`route-equivalence.mjs` is a separate correctness-only comparison of the pure
prepared algorithms against frozen RC16: 600 gate plans, 600 jump plans and 600
alternate-midpoint projections over deterministic varied policies and geometry.
It is not a substitute for the whole-application source manifests or timing lane.
