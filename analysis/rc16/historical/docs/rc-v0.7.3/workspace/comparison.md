| Repeat | Build | Stress idle CPU % | Typical session ms | Stress session ms | Imports after write ms | Aged cold analysis ms | History JSON MiB | 5,000 event inserts ms | 1,000 history writes ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | baseline | 15.07 | 24.83 | 193.77 | 470.53 | 2432.64 | 189.71 | 15.84 | 96.99 |
| 1 | predb | 1.57 | 18.06 | 109.05 | 0.68 | 2210.40 | 189.71 | 17.07 | 130.90 |
| 1 | candidate | 1.57 | 15.44 | 94.43 | 0.77 | 463.13 | 15.60 | 18.17 | 35.74 |
| 2 | baseline | 15.62 | 25.46 | 187.00 | 453.69 | 2258.38 | 189.71 | 17.04 | 60.78 |
| 2 | predb | 1.29 | 20.35 | 111.74 | 0.70 | 2568.46 | 189.71 | 16.36 | 130.32 |
| 2 | candidate | 1.45 | 16.33 | 93.48 | 0.67 | 485.39 | 15.60 | 19.92 | 39.73 |

- PASS: repeat 1, 0.7.2 → RC: stress idle CPU: 89.6% reduction.
- PASS: repeat 1, 0.7.2 → RC: imports after unrelated write: 99.8% reduction.
- PASS: repeat 1, 0.7.2 → RC: stress session latency: 51.3% reduction.
- PASS: repeat 1, pre-DB → RC: aged-history cold analysis: 79.0% reduction.
- PASS: repeat 1, pre-DB → RC: working history JSON size: 91.8% reduction.
- PASS: repeat 2, 0.7.2 → RC: stress idle CPU: 90.7% reduction.
- PASS: repeat 2, 0.7.2 → RC: imports after unrelated write: 99.9% reduction.
- PASS: repeat 2, 0.7.2 → RC: stress session latency: 50.0% reduction.
- PASS: repeat 2, pre-DB → RC: aged-history cold analysis: 81.1% reduction.
- PASS: repeat 2, pre-DB → RC: working history JSON size: 91.8% reduction.

Synthetic workloads, repeated in ABC/CBA order. CPU is a percentage of one logical core. Full response equivalence is checked separately; timings include serialization. All raw observations, including advisory metrics, are retained.
