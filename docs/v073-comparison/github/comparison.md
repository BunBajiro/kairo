| Run | Target | Baseline | Candidate | Reduction | Gate |
|---|---|---:|---:|---:|---|
| 1 | stress idle CPU | 16.93 | 1.53 | 91.0% | pass |
| 1 | stress imports after unrelated write | 574.38 | 1.35 | 99.8% | pass |
| 1 | stress session latency | 236.96 | 141.04 | 40.5% | pass |
| 2 | stress idle CPU | 16.63 | 1.54 | 90.7% | pass |
| 2 | stress imports after unrelated write | 558.81 | 1.37 | 99.8% | pass |
| 2 | stress session latency | 251.43 | 140.43 | 44.1% | pass |

Conservative gates for the three measured hotspots. Other metrics remain advisory and require review; this is not a claim about GPU power or physical fans.
