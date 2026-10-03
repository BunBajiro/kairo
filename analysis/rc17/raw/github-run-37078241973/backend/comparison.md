# RC16/candidate controlled backend ABBA results

| Profile / metric | RC16 range | Candidate range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.59–0.63 | 0.68–0.88 | +27.4% |
| typical / idle_rss (MiB) | 183.74–183.89 | 183.80–184.00 | +0.0% |
| typical / idle_loop_max (ms) | 16.99–23.87 | 24.02–24.22 | +18.0% |
| typical / startKairo_startup (ms) | 145.87–184.50 | 143.98–151.27 | -10.6% |
| typical / state_http (ms) | 7.54–8.01 | 7.91–8.47 | +5.3% |
| typical / opsec (ms) | 0.06–0.07 | 0.07–0.07 | +2.1% |
| typical / state (ms) | 2.92–2.95 | 2.84–2.85 | -2.9% |
| typical / journey (ms) | 1.28–1.34 | 1.33–1.34 | +1.6% |
| typical / session (ms) | 9.94–10.61 | 10.42–11.18 | +5.1% |
| typical / market_browse (ms) | 1.42–1.50 | 1.42–1.48 | -0.6% |
| typical / market_report (ms) | 5.27–5.63 | 5.10–5.60 | -1.9% |
| typical / imports_warm (ms) | 0.38–0.40 | 0.38–0.39 | -0.9% |
| typical / imports_after_write (ms) | 0.69–0.71 | 0.69–0.71 | -0.4% |
| stress / idle_cpu (% one core) | 1.21–1.21 | 1.43–1.45 | +19.5% |
| stress / idle_rss (MiB) | 201.95–223.84 | 203.82–221.97 | +0.0% |
| stress / idle_loop_max (ms) | 45.71–49.64 | 45.45–49.81 | -0.1% |
| stress / startKairo_startup (ms) | 130.12–141.23 | 144.14–145.07 | +6.6% |
| stress / state_http (ms) | 28.38–29.77 | 32.00–32.27 | +10.5% |
| stress / opsec (ms) | 0.07–0.07 | 0.08–0.08 | +11.1% |
| stress / state (ms) | 14.19–14.74 | 15.38–15.73 | +7.5% |
| stress / journey (ms) | 2.46–2.58 | 2.63–2.82 | +8.2% |
| stress / session (ms) | 58.25–61.83 | 65.10–66.66 | +9.7% |
| stress / market_browse (ms) | 4.67–4.82 | 4.75–4.81 | +0.8% |
| stress / market_report (ms) | 26.36–27.38 | 27.77–28.10 | +4.0% |
| stress / imports_warm (ms) | 0.44–0.74 | 0.47–0.79 | +7.0% |
| stress / imports_after_write (ms) | 0.76–0.78 | 0.78–0.89 | +9.0% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
