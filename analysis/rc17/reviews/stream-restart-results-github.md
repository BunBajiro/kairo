# GitHub transport, protection and managed-restart acceptance

The mixed-workload transport/protection gates and both positive managed-restart scenarios pass for candidate `05d0d4b36c154329006d6772769063db874762da` in [GitHub run 37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973). This review independently recomputed the checks below from the retained raw records. It does not change the overall Actions conclusion or classify another lane's cleanup failure as a pass.

Evidence: [mixed raw records](../raw/github-run-37078241973/mixed/mixed.json), [restart raw records](../raw/github-run-37078241973/restart-candidate.json), [candidate source manifest](../raw/github-run-37078241973/candidate-source.json) and [run provenance](../raw/github-run-37078241973/run-provenance.json). The run used harness commit `82394c58d0a7d8987877835b693f31f09c3c0d7f`, Node v24.19.0 and a two-logical-CPU AMD EPYC 9V45 runner.

## Identity and completion

Both lanes identify the same candidate commit as the clean source manifest and workflow provenance. Mixed source fingerprint `9df9de9ed3e9740df9955c59aa8b09c0b03693cbb41875cc716b6b499021ea84` matches that manifest; mixed reports clean sources, completion and end verification. All seven recorded mixed harness hashes and both restart harness hashes independently match the retained harness files. All 86 restart source hashes match the candidate manifest; restart before/after source and harness digests match.

The restart output retains a generic explanatory string about a working candidate. Its actual `sourceWorkingTree` contains no change entry, and the explicit clean candidate manifest plus matching source hashes establish the measured identity above.

## Continuous transport and complete large frames

Each fresh-process window lasts 28 seconds. The fixture includes two pilots with 20,000 assets each, eight maps with 100 nodes each, an active Session and ten stream widgets. Loaded windows add four 50-leg navigation computations and four map-edit/read bursts to the common dashboard/OBS requests.

| Window | HTTP requests, all 200 | Dashboard complete SSE packets / bytes | OBS complete SSE packets / bytes | Complete asset frames |
|---|---:|---:|---:|---:|
| quiet-1 | 56 | 37 / 8,087,283 | 7 / 14,179 | 2 |
| loaded-1 | 92 | 49 / 8,087,783 | 7 / 14,179 | 2 |
| loaded-2 | 92 | 49 / 8,087,783 | 7 / 14,179 | 2 |
| quiet-2 | 56 | 37 / 8,087,283 | 7 / 14,179 | 2 |

Packet counts include heartbeat comments. Each window retains one dashboard and one OBS protocol client, with no unexpected stream end, parser error or request-task failure. For each client, summing the complete packet bytes exactly equals the reader's total received bytes: no unfinished packet remains in the recorded observation. The observer does not reconnect to hide a discontinuity.

Every window receives one complete **3,262,964-byte** ready asset snapshot for each pilot, eight large frames overall. Each has the expected synthetic asset-data hash `82db7968d0d9c8b72acd2a71889f94c1f8a45c7f5bec2ab29ea2649160471b41`. These are the supported frame size and workload that previously triggered RC16's fixed-backlog disconnect. The earlier failed RC16 evidence remains intact; this result establishes candidate continuity in the new run, not a paired speedup against that incomplete run.

## Freshness and protection

In all four windows the five OBS state packets follow the same sequence:

1. Fresh high-sec, visible.
2. Fresh hostile space, hidden.
3. Fresh high-sec, visible.
4. Unavailable location after the injected HTTP 503, unknown and hidden.
5. Recovered high-sec, visible.

The actual production location store records the selected pilot's stale 503 result and later recovery. Independently checking all **848 accepted protection records** found no visible emission without ready high-sec evidence, the expected system, observation age below 30 seconds and an unexpired protection-validity deadline. Each visible OBS wire state, including initial states, matches an accepted fresh producer state at its server timestamp. The recorded eight post-start unhide validations also pass. There are no duplicate OBS state contents in these windows; unchanged widget binding checks still run.

All windows finish with zero active/queued ESI work, zero pending/failed semantic events, zero unexpected synthetic requests and zero forbidden external-network attempts. Cleanup also records zero in-flight transport and zero forbidden attempts. The expected single provider failure in each window is the deliberate 503 freshness scenario.

These checks concern the synthetic protection transitions and wire contract. They do not claim an audit of every possible privacy rule, pilot-switch renderer behavior, a physical OBS instance or arbitrary network failure.

## Managed restart preserves accepted work

Both scenarios use the actual supervisor and distinct forked runtime processes, real loopback HTTP/SSE, SQLite, the shipped Milestones subscriber and the frontend dataset-connection coordinator. Controlled gates hold accepted HTTP work and asynchronous name resolution while a coherent fixture dataset generation is staged and activated.

| Scenario | Milestone persisted at trace order | Old SQLite closed at trace order | Semantic work pending when Core close began |
|---|---:|---:|---:|
| drain-accepted | 34 | 42 | 0 |
| drain-semantic-after-http | 41 | 43 | 1 |

In the second scenario, accepted HTTP completes at order 35, Core begins closing at order 36 while one semantic task remains pending, and name resolution is released at order 38 while SQLite is still open. Exactly one `skill.completed` event is then persisted before SQLite closes. This is a positive ownership/drain check rather than the earlier RC16 release-after-close reproduction.

Both scenarios independently satisfy:

- Accepted goal creation returns 201 and the accepted read returns 200; a new write during quiescence returns 503.
- Exactly one goal row, one goal-created event and one milestone event survive. The active Session survives.
- The old child has no post-close SQL operation, pending task, semantic-listener failure, unexpected fake request, forbidden external request or added exit grace.
- The old child exits successfully before the new child is forked. Their PIDs differ.
- The original browser cookie and CSRF token remain valid, and a post-restart CSRF write returns 200.
- The planned-update notice precedes shutdown; the coordinator moves `restarting → refreshing → idle`, refreshing and completing exactly once for generation `9000001:9000001:9000001`.
- All observed OBS states remain protected during this restart fixture. Exactly one installed generation remains, and session secrets do not appear on dataset disk.

## Limits

The mixed lane uses protocol readers, synthetic providers and two 28-second quiet plus two 28-second loaded windows. It does not exercise browser painting, GPU costs, real internet services, a deliberately stalled consumer, Unicode boundary cases or ordinary reconnect recovery. Those transport edge cases have separate regression coverage described in [the implementation review](stream-transport.md); this CI evidence adds healthy-reader continuity under the full mixed workload. Latency tables belong to the separate mixed performance review and must retain runner-specific comparison limits.

Restart is an instrumented integration diagnostic with two controlled release schedules and a copied bundled dataset generation, not a full archive-conversion or restart-latency benchmark. Its safety assertions apply to the old child being replaced; final generation-2 teardown is cleanup outside that assertion scope. It does not prove safety for unreturned promises or permanently stuck external work.
