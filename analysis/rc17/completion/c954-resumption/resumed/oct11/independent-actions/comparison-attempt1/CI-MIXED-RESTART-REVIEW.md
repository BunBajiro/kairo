# Original CI mixed, restart and Maps browser audit

Scope: [CI run 38176821997, attempt 1](https://github.com/BunBajiro/kairo/actions/runs/38176821997). Candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. This audit reads the recovered original CI JSON only. It neither reruns workloads nor combines local performance results with CI.

Audit result: **PASS**, 21,418 checks, 0 retained mismatches. Full inputs, SHA-256s, numeric-field inventory, exact recomputations and semantic checks are in `CI-MIXED-RESTART-AUDIT.json`.

All 210 numeric fields in the four mixed summary rows, all 229 numeric fields including summary metadata/settings, and all 108 raw metric leaves (102 numeric, remainder null) were compared. All 10,002 numeric leaves in mixed raw JSON and all 385 in restart JSON were inventoried and checked finite. Every nested summary field was compared; statistics use the harness's nearest-rank convention. Primitive meter/latency readings remain recorded observations, with their available arithmetic, count and range checks, rather than a new measurement.

| Candidate window | HTTP 200 | Dashboard p50 / p95 ms | Stream p95 ms | CPU % one core | Server loop max ms | Observed epoch window ms |
|---|---:|---:|---:|---:|---:|---:|
| quiet-1 | 56 | 39.32 / 71.96 | 64.46 | 5.29 | 120.32 | 27999 |
| loaded-1 | 92 | 43.54 / 94.74 | 87.01 | 8.15 | 112.79 | 28000 |
| loaded-2 | 92 | 41.54 / 86.07 | 92.91 | 7.41 | 126.88 | 28000 |
| quiet-2 | 56 | 39.34 / 69.14 | 76.64 | 5.29 | 121.11 | 28000 |

The four windows contain **296/296 HTTP 200 requests**, 28 common dashboard polls and 28 stream polls per window. Loaded windows add four navigation plans, four map reads, four map edits and 24 burst reads. Dashboard p95 is 94.73510999999417 / 86.07465599999705 ms loaded versus 71.95994300000166 / 69.14483799999289 ms quiet. These are workload-stress differences on one candidate, not baseline/candidate regressions or speedups.

**Timing distinction retained:** quiet-1 `observationEnd - startedAt` is exactly **27,999 ms**, against the 28,000 ms nominal target. Its worker epoch duration is 28,000 ms and worker monotonic meter is 28000.150661 ms. The other observer epoch windows are exactly 28,000 ms. Date.now boundary rounding is not silently converted into a full nominal observation; request latency uses a separate monotonic clock. Six separate clock-read differences are also retained explicitly: two protection ages and four sampled location ages are 1 ms above the age derived from their adjacent recorded timestamp, consistent with distinct Date.now reads. They are not aggregate mismatches or silently discarded differences.

Raw HTTP scheduling, distributions, SSE byte/event accounting, duplicate-content counts, protection state, all wire-unhide validations and all 16 provider/store/protection/wire transitions were reconstructed. Each window has five OBS state events, zero consecutive duplicate content, seven repeated dashboard data snapshots with seven freshness/status changes, 29 unchanged binding updates out of 29, one active session, and zero unsafe emissions, forbidden transport attempts, unexpected transport records, pending event work or listener failures. The synthetic provider 503 is intentional and reaches stale/unknown hidden state before recovery; it is separate from the 296 successful observer HTTP requests.

Four successful worker cleanup RPC records have zero inflight work and zero forbidden attempts. **Mixed JSON does not retain worker exit codes/signals**, so cleanup is verified at the recorded RPC boundary only. No independent four-exit claim is made for this lane.

| Restart scenario | HTTP complete order | Semantic persisted order | Core close order | SQLite close order | Old exit / new fork | Exit codes |
|---|---:|---:|---:|---:|---:|---|
| drain-accepted | 40 | 35 | 41 | 43 | 46 / 47 | 0, 0 |
| drain-semantic-after-http | 36 | 42 | 37 | 44 | 47 / 48 | 0, 0 |

Both restart scenarios report accepted goal/read status 201/200, new writes refused with 503 during close, retained active session, one goal row/event and one milestone event, unchanged cookie/CSRF and successful post-restart CSRF write. Trace ordering independently confirms semantic persistence before SQLite close and old PID exit before replacement fork. The after-HTTP scenario retains pending semantic work while SQLite is open at Core close. Both generations in both scenarios have exit code 0 and null signal (**four recorded exits**); recorded final summaries show no pending work, post-close operations, external attempts, unexpected fake requests, errors or exit grace. Generation-2 teardown is cleanup outside the old-child accepted-work assertion scope.

**Provenance:** 92 restart source hashes match the candidate source manifest; source and harness digests independently recompute and match their before/after values. Two restart and seven mixed harness hashes agree with run provenance. Candidate and Maps browser source manifests independently regenerate fingerprint `4244e33638602437329df4c503b0ca3045b4068543d121a92ed3762e2e505362`, with matching clean candidate identity. This is artifact-internal provenance verification, not a new hash of the original remote checkout.

**Maps browser:** 17 recorded feature assertions, 82 loopback request URLs, empty errors/external lists, complete/source-verified/cleanup flags, and browser exit code 0 with null signal. Assertions include ordinary SSE reconnect, collapsed groups, camera handoff/fit, delayed map/pilot response isolation, layout-save ownership and extension-page isolation. Result JSON does not preserve DOM assertion inputs; this is recorded functional coverage, not a camera performance result or human visual sign-off.

Boundaries remain: synthetic fixtures and injected local provider responses; protocol OBS rather than a physical OBS/GPU run; diagnostic restart gates rather than latency measurements; no full archive conversion, arbitrary stuck external work, or unreturned promise guarantee. HTTP retention/CSRF/secret assertions lack response/disk bodies in this artifact and are identified as reported assertions, not independently reconstructed facts.

Reproduce from the repository root:

```bash
python analysis/rc17/completion/c954-resumption/resumed/oct11/independent-actions/comparison-attempt1/audit-mixed-restart.py /path/to/extracted/evidence
```

The script writes only its audit JSON beside itself by default; this review is static. It performs no application imports, runtime/performance reruns, network calls, source modifications or ref/commit operations.
