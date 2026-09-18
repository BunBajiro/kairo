| Run | Target | Baseline | Candidate | Reduction | Gate |
|---|---|---:|---:|---:|---|
| 1 | stress idle CPU | 15.27 | 1.40 | 90.8% | pass |
| 1 | stress imports after unrelated write | 469.21 | 0.68 | 99.9% | pass |
| 1 | stress session latency | 181.40 | 112.04 | 38.2% | pass |
| 2 | stress idle CPU | 14.66 | 1.26 | 91.4% | pass |
| 2 | stress imports after unrelated write | 483.32 | 0.70 | 99.9% | pass |
| 2 | stress session latency | 189.19 | 109.80 | 42.0% | pass |

Conservative gates for the three measured hotspots. Other metrics remain advisory and require review; this is not a claim about GPU power or physical fans.
