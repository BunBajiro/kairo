# RC16/candidate controlled backend ABBA results

| Profile / metric | RC16 range | Candidate range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.95–0.96 | 0.53–0.75 | -32.6% |
| typical / idle_rss (MiB) | 169.78–177.87 | 158.99–172.96 | -4.5% |
| typical / idle_loop_max (ms) | 23.63–26.13 | 14.34–15.29 | -40.4% |
| typical / startKairo_startup (ms) | 215.56–223.28 | 216.42–218.02 | -1.0% |
| typical / state_http (ms) | 11.95–12.36 | 11.78–12.19 | -1.4% |
| typical / opsec (ms) | 0.14–0.14 | 0.14–0.16 | +8.5% |
| typical / state (ms) | 5.33–5.36 | 5.36–5.74 | +3.8% |
| typical / journey (ms) | 2.28–2.35 | 2.37–4.06 | +38.7% |
| typical / session (ms) | 18.49–19.12 | 20.32–20.44 | +8.4% |
| typical / market_browse (ms) | 2.44–2.47 | 2.44–2.70 | +4.7% |
| typical / market_report (ms) | 9.25–9.45 | 9.32–9.48 | +0.5% |
| typical / imports_warm (ms) | 0.74–0.74 | 0.75–0.75 | +1.5% |
| typical / imports_after_write (ms) | 1.04–1.06 | 1.03–1.10 | +1.6% |
| stress / idle_cpu (% one core) | 2.16–2.17 | 1.75–1.84 | -17.2% |
| stress / idle_rss (MiB) | 222.36–222.84 | 189.51–202.13 | -12.0% |
| stress / idle_loop_max (ms) | 83.95–84.87 | 52.63–71.83 | -26.3% |
| stress / startKairo_startup (ms) | 209.39–210.31 | 207.19–209.69 | -0.7% |
| stress / state_http (ms) | 46.16–48.93 | 50.30–52.61 | +8.2% |
| stress / opsec (ms) | 0.14–0.15 | 0.15–0.15 | +2.1% |
| stress / state (ms) | 26.49–26.68 | 26.84–28.06 | +3.2% |
| stress / journey (ms) | 4.42–4.44 | 4.61–4.62 | +4.2% |
| stress / session (ms) | 105.61–108.43 | 110.91–115.55 | +5.8% |
| stress / market_browse (ms) | 7.88–7.91 | 7.87–8.01 | +0.6% |
| stress / market_report (ms) | 44.94–45.30 | 45.10–45.15 | +0.0% |
| stress / imports_warm (ms) | 0.84–1.36 | 0.83–1.35 | -1.2% |
| stress / imports_after_write (ms) | 1.14–1.64 | 1.14–1.14 | -18.2% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
