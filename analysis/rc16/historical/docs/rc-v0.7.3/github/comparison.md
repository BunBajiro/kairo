| Repeat | Build | Stress idle CPU % | Typical session ms | Stress session ms | Imports after write ms | Aged cold analysis ms | History JSON MiB | 5,000 event inserts ms | 1,000 history writes ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | baseline | 14.38 | 24.17 | 188.70 | 450.85 | 1912.49 | 189.71 | 19.76 | 51.56 |
| 1 | predb | 1.26 | 18.19 | 107.56 | 1.14 | 1896.25 | 189.71 | 24.44 | 68.56 |
| 1 | candidate | 1.24 | 15.51 | 87.54 | 1.09 | 493.97 | 15.60 | 23.82 | 32.95 |
| 2 | baseline | 14.40 | 24.41 | 174.26 | 447.90 | 1869.80 | 189.71 | 89.50 | 87.80 |
| 2 | predb | 1.25 | 18.39 | 109.05 | 1.06 | 1852.51 | 189.71 | 19.99 | 61.75 |
| 2 | candidate | 1.23 | 15.00 | 87.30 | 1.07 | 532.06 | 15.60 | 63.59 | 32.47 |

- PASS: repeat 1, 0.7.2 → RC: stress idle CPU: 91.3% reduction.
- PASS: repeat 1, 0.7.2 → RC: imports after unrelated write: 99.8% reduction.
- PASS: repeat 1, 0.7.2 → RC: stress session latency: 53.6% reduction.
- PASS: repeat 1, pre-DB → RC: aged-history cold analysis: 74.0% reduction.
- PASS: repeat 1, pre-DB → RC: working history JSON size: 91.8% reduction.
- PASS: repeat 2, 0.7.2 → RC: stress idle CPU: 91.5% reduction.
- PASS: repeat 2, 0.7.2 → RC: imports after unrelated write: 99.8% reduction.
- PASS: repeat 2, 0.7.2 → RC: stress session latency: 49.9% reduction.
- PASS: repeat 2, pre-DB → RC: aged-history cold analysis: 71.3% reduction.
- PASS: repeat 2, pre-DB → RC: working history JSON size: 91.8% reduction.

Synthetic workloads, repeated in ABC/CBA order. CPU is a percentage of one logical core. Full response equivalence is checked separately; timings include serialization. All raw observations, including advisory metrics, are retained.
