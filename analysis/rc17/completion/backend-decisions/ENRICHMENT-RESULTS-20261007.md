# Bounded enrichment decision — 7 October 2026

**Adopt the isolated four-worker patch**, subject to the final integrated source tests and representative frozen-source gate. Actual Core/ESI ABBA trials support reducing cold multi-item completion delay without adding provider calls or changing ordered results. No real EVE provider latency is inferred from the controlled response delay.

Twelve separate immutable-source runs cover three delays (0/50/200 ms), each in baseline/candidate/candidate/baseline order. Every run holds `/tmp/kairo-performance.lock`; raw JSON and process logs are in `timed-20261007/`. Each JSON pins the harness and actual source file hashes. Baseline is clean a27d36c; candidate is a27d36c plus `enrichment-concurrency-four.patch`.

All **144 measured fixture cases** preserve exact ordered output hashes, cold request counts and zero warm provider requests. The actual shared ESI limiter never exceeds four requests. The 0/1 cases retain maximum concurrency one. The 10/50 cases change from one to four. The six targeted concurrency tests saved with the patch cover original order, per-item denial/cancellation, rate-limit admission, global ESI priority/capacity, fatal sibling draining and Core close draining.

## Cold elapsed means (two observations per arm)

| Kind | Rows | 50 ms baseline → candidate | 200 ms baseline → candidate |
|---|---:|---:|---:|
| stations | 0 | 58.4 ms → 58.5 ms | 208.9 ms → 207.9 ms |
| stations | 1 | 155.2 ms → 155.5 ms | 606.6 ms → 608.1 ms |
| stations | 10 | 614.2 ms → 258.8 ms | 2419.3 ms → 1009.9 ms |
| stations | 50 | 2652.3 ms → 765.7 ms | 10462.5 ms → 3018.1 ms |
| structures | 0 | 52.1 ms → 52.0 ms | 202.1 ms → 202.5 ms |
| structures | 1 | 102.1 ms → 103.1 ms | 403.2 ms → 403.4 ms |
| structures | 10 | 561.3 ms → 205.5 ms | 2214.3 ms → 804.8 ms |
| structures | 50 | 2605.6 ms → 715.9 ms | 10251.8 ms → 2816.8 ms |
| planets | 0 | 51.5 ms → 52.5 ms | 201.5 ms → 202.0 ms |
| planets | 1 | 104.0 ms → 102.6 ms | 402.7 ms → 402.8 ms |
| planets | 10 | 560.5 ms → 204.4 ms | 2214.5 ms → 804.9 ms |
| planets | 50 | 2594.1 ms → 716.8 ms | 10255.0 ms → 2816.6 ms |

At zero synthetic delay, 0/1-record cold mean differences range from 0.094 to 0.312 ms. These small overheads do not support a tiny-case speedup claim. Warm reads remain provider-free; their low-millisecond variance is retained in the raw samples rather than presented as a material improvement.

The 50-planet lane is deliberately beyond normal single-pilot PI holdings. The recommendation also holds in the 10-item lanes and does not depend on presenting that stress case as ordinary use. The existing cache, private structure scope, shared ESI limiter/priority queue and Core accepted-work ownership remain responsible for behavior. No separate cache or scheduler was introduced.

The adoption comparison is local and synthetic. Final integrated tests, source/build attribution and the existing independent acceptance gates remain open; this decision does not produce clean RC17 or promote the withdrawn review PR.
