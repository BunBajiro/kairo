# Independent CI comparison completion

**All collected lanes now have completed offline numerical and scoped semantic review.** Actions run [38176821997, attempt 1](https://github.com/BunBajiro/kairo/actions/runs/38176821997), collected 2026-10-11, completed successfully. This review was completed 2026-10-13 by reading the original artifact; no runtime or performance workload was repeated and no application source was changed.

The original evidence artifact `11716144963` is **2,792,289 bytes**, SHA-256 `a98542607becc243ce84fea2dfe7b5e7d717e05e80b9f34a78582824a02d3dbd`. All **82** ZIP members match the existing verified receipt. `ARTIFACT-VERIFICATION.json` already owns the completed 3,078-file bundle verification, 1,088 source-file comparisons, 34 harness-file comparisons and 506 candidate runtime assets; it is retained, not repeated. `CI-AUDIT-COMPLETION.json` pins the completed audit modules, original ZIP and successful job-step receipt.

## Keep the evidence groups separate

| Group | Baseline | Candidate | Interpretation |
|---|---|---|---|
| Historical corrected backend | 0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c` | RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | Historical feature/cost change; separate ABBA lane |
| Current backend, memory, Maps, routes, camera | RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` | Matched current-source comparisons |
| Mixed, restart, compiled Maps | `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` only | Same source | Workload contrast or functional acceptance; no cross-version speedup claim |

Trigger/harness commit is `cbcd22ff6b57ea2c168fa363332a80d7c414f7d5`; the CPU was AMD EPYC 9V45 with four logical CPUs, Node v24.19.0. Local results remain in their own report and process-ownership envelope. Historical and current RC16 measurements were collected in different matched lanes; do not pool or chain their means into one three-way number.

## Findings to retain in release review

The sole repeated joint current-backend summary latency marker (>1 ms and >10% in both pairs) is **typical HTTP-state p95**: **12.504122→17.454456 ms (+4.950334, +39.59%)** and **10.678834→15.130395 ms (+4.451561, +41.69%)**. Its mean is **11.591478→16.292425 ms**; median HTTP state is **7.625271→7.926143 ms (+3.95%)**. The samples follow three excluded HTTP warmups, a 35-second idle period and direct work. This is an **ongoing warm-operation tail observation**, not startup or first use. With ten samples, the nearest-rank p95 is the maximum; it is not a population-tail estimate or a diagnosed cause. Report the adverse tail explicitly without deriving a new optimization mandate.

Current idle CPU improves **0.664810→0.385151%** of one core typical and **1.301482→0.928956%** stress; RSS improves **183.176→137.645 MiB** and **224.230→154.281 MiB**. Current startup means change **+1.94%/+2.10%** in these lanes. The much larger historical 0.7.3→RC16 startup and idle costs remain their own evidence; the accepted startup/first-use tradeoff stays closed. Ordinary and forced-GC memory are separate; neither proves leak freedom. Five live-sync cache-hit fixtures improve to **0.00396–0.00493 ms** mean medians with zero returned visit rows on candidate cache hits, while all route/group hashes and fixture counts remain matched.

All **15** shared Maps median cases and all **1/10/50-stop** route medians improve in both pairs. Maps means improve **24.78–90.51%** and route means **20.84%/91.73%/96.84%**. All four 100/600-node zoom/pan total-task comparisons improve. Retain four other repeated non-RAF component markers: one-map full-list observed maximum CPU **+6.255 ms**, one-second 100-node idle task **+2.509 ms**, 100-node zoom layout **+2.371 ms**, and 600-node zoom layout **+3.002 ms**. These are preserved component/short-window observations; two repetitions do not establish a source cause. Dense pan retains two candidate long tasks per run (79–114 ms), so no stall-free claim is made.

Mixed protocol acceptance reconstructs **296/296 HTTP 200** observations and all summary fields. Loaded Dashboard p95 **94.735/86.075 ms** is compared with quiet **71.960/69.145 ms** on the same candidate. It measures added workload, not a cross-version regression. The quiet-1 observer `Date.now` window remains exactly **27,999 ms**, versus 28,000 nominal. Four recorded cleanup RPCs pass; mixed worker exit codes are not present in this artifact.

Both managed-restart schedules pass the bounded semantic trace checks, including accepted work persisted before SQLite close and old-child exit before replacement fork. **92** restart source hashes, before/after source and harness digests, and **four code-0 exits** agree. Compiled Maps records **17** functional assertions, clean source/cleanup flags, no errors or external requests and code-0 browser exit. Reported HTTP/body/DOM assertions cannot be independently replayed from omitted response/disk/DOM bodies; the review marks those limits explicitly.

## Exact tables and reproduction

| Review | Machine audit | Coverage |
|---|---|---|
| `CI-BACKEND-MEMORY-REVIEW.md` | `CI-BACKEND-MEMORY-AUDIT.json` | 2,720 backend samples; 1,088 distribution values; 156 summary rows plus 556 additional numeric comparisons; 100 memory markers; 264 aggregates; 420 session sample records; 30 SQL diagnostic rows |
| `CI-MAPS-ROUTES-CAMERA-REVIEW.md` | `CI-MAPS-ROUTES-CAMERA-AUDIT.json` | 1,350 checks; 141 comparison rows / 282 pairs; all adverse pairs; materialization/route semantics; camera samples/diagnostics |
| `CI-MIXED-RESTART-REVIEW.md` | `CI-MIXED-RESTART-AUDIT.json` | 21,418 checks, zero mismatches; 210 mixed summary-row numeric fields; all raw metric leaves; request/SSE/protection/restart provenance and trace checks |

After restoring `bank/RAW-MANIFEST.json` into this comparison directory, run:

```bash
python analysis/rc17/completion/c954-resumption/resumed/oct11/independent-actions/comparison-attempt1/audit-ci-evidence.py
```

The original ZIP is temporarily extracted, all member pins are checked, and the three audit scripts regenerate their JSON tables. Existing `ARTIFACT-VERIFICATION.json` and the already banked job/log receipts must remain beside them. No network, application import, benchmark dispatch or runtime measurement is used. The bank contains the original evidence ZIP and new scripts/reviews/JSON only, avoiding duplicate raw extraction and the already retained bundle/log.

Disposition: evidence collection, arithmetic and bounded semantic review are complete, with the warm state tail and other costs retained. These observations do not establish a new causal defect and do not justify reopening optimization. The instrumented bundle remains `releaseReady:false`; final release judgment and a clean RC review package are separate steps.
