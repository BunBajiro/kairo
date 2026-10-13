# Independent Actions Maps, routes and camera review

Collection integrity and offline arithmetic pass for Actions **38176821997, attempt 1**, collected on 2026-10-11. This is the CI RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` → current `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` group only. Local measurements and the historical 0.7.3→RC16 group remain separate. No application or timed workload was rerun for this audit.

`audit-maps-routes-camera.py` verifies all **82** members of the restored original evidence ZIP against the banked artifact receipt and performs **1,350** numerical/semantic checks. `CI-MAPS-ROUTES-CAMERA-AUDIT.json` preserves all **141 comparison rows / 282 pairs**, every positive pair, and complete camera samples/diagnostics. The original ZIP is retained as `artifact-11716144963.zip` (2,792,289 bytes, SHA-256 `a98542607becc243ce84fea2dfe7b5e7d717e05e80b9f34a78582824a02d3dbd`). The already completed bundle/source audit remains owned by `ARTIFACT-VERIFICATION.json`; this arithmetic review does not replace or repeat it.

## Maps and routes

All 15 shared Maps cases improve median service time in both pairs; means of run medians improve **24.78–90.51%**. Selected-map means at 1/8/24 maps are **2.623/4.432/10.982 ms → 1.118/1.185/1.316 ms**. Full 24-map retrieval is **236.829→22.468 ms (−90.51%)**. Seven samples per case, separate serialization time and observed maxima remain explicit in the machine table.

Warm diagnostic reads record zero writes. At 24 maps, selected retrieval materializes **2,376→99** link bodies and **298→100** signature bodies; full-list link materialization is **59,400→2,376**. The old signature-by-edge scan is absent in every candidate diagnostic case. These counts describe materialization/returned SQL rows, not physical pages scanned.

The six compact-summary cases have no RC16 implementation of the same endpoint. At 24 maps the independence case has **7.427/7.140 ms** run medians and a **7,688-byte** payload; the full-list response is **5,509,856 bytes**. This is a different response contract. The selected raw hashes reproduce the known `b38a1d82…bcbbd7c` / `5064dfaa…2a8968` pair: they are not equal JSON bytes. The banked `analysis/rc17/raw/maps-equivalence-059/comparison.json` owns the prior property-insertion-order-only explanation; this audit checks the exact pair and within-implementation invariance across 1/8/24 unrelated-map volumes.

Route fixture and full-plan semantic hashes agree across both diagnostic and all four timing workers, with 100 legacy discovery memberships preserved. Diagnostic graph builds at 1/10/50 stops remain **1/10/50→1/1/1**. Mean run medians improve in both pairs:

| Stops | RC16 → current median ms | Change |
|---:|---:|---:|
| 1 | 15.510 → 12.278 | −20.84% |
| 10 | 156.646 → 12.960 | −91.73% |
| 50 | 771.078 → 24.403 | −96.84% |

The first one-stop maximum/p95 rises **32.384→32.947 ms (+0.563 ms, +1.74%)**; the second improves **27.020→13.242 ms**. Nine samples make nearest-rank p95 equal to the observed maximum, not an estimated population tail.

## Camera and retained adverse observations

All four zoom/pan total-task comparisons improve in both pairs on the CI software renderer:

| Nodes/action | Mean renderer task ms, RC16 → current | Change |
|---|---:|---:|
| 100 zoom | 996.365 → 410.578 | −58.79% |
| 100 pan | 317.598 → 256.854 | −19.13% |
| 600 zoom | 2,009.573 → 1,011.615 | −49.66% |
| 600 pan | 1,818.206 → 732.500 | −59.71% |

The existing descriptive marker (>1 ms **and** >10% in both paired observations) retains four non-RAF rows. It is not a significance test or an automatic release gate:

| Row | RC16 → current mean ms | Paired changes ms | Bounded disposition |
|---|---:|---:|---|
| One-map full-list maximum CPU | 3.093 → 9.347 | +11.186 / +1.323 | Retain observed maxima; median service time improves 55.62%. Seven samples do not establish an ongoing CPU regression or a cause. |
| 100-node one-second idle task | 2.632 → 5.141 | +1.684 / +3.334 | Retain the repeated short-window cost. No continuous-idle rate or causal source claim. |
| 100-node zoom layout | 6.339 → 8.710 | +2.200 / +2.542 | Retain component cost alongside 58.79% lower total task time. |
| 600-node zoom layout | 3.548 → 6.550 | +2.406 / +3.598 | Retain the already recognized zoom-layout tradeoff alongside 49.66% lower total task time. |

Dense zoom long tasks fall **11/12→0/0**. Dense pan still has two long tasks per candidate run (**79/114 ms** and **90/87 ms**); no stall-free claim follows. Candidate style/other-attribute mutations are higher (153/580 and 141/544 versus 100/217 and 96/207), with zero scene-node changes. Post-timing forced-GC diagnostics have no visible map nodes/canvases and no Universe requests after unmount. Listener counts remain 613→613 in both candidate runs and 611→611 in both baselines. Two-cycle retained-heap changes are **+702,812/+597,036 bytes** current versus **+715,876/+693,172 bytes** RC16. This is a bounded lifecycle check, not leak freedom.

The collected comparisons support retaining the implemented Maps/routes/camera changes while reporting all adverse components. No new causal defect or justified optimization/repeat is established. Camera frame summaries are checked against retained sample aggregates; full RAF timestamp arrays were not archived, so raw quantile reconstruction is unavailable. Headless SwiftShader observations do not predict desktop GPU frame rates. Compiled Maps semantic acceptance is reviewed separately in `CI-MIXED-RESTART-REVIEW.md`.
