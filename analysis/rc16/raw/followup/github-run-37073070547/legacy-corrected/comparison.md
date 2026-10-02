# Controlled legacy ABBA results

| Profile / metric | v0.7.3 range | RC16 range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.62–0.63 | 0.75–1.04 | +42.8% |
| typical / idle_rss (MiB) | 93.09–93.91 | 172.46–177.86 | +87.3% |
| typical / idle_loop_max (ms) | 13.17–15.52 | 21.43–30.83 | +82.1% |
| typical / startKairo_startup (ms) | 20.06–23.33 | 218.94–226.00 | +925.4% |
| typical / state_http (ms) | 12.51–13.31 | 12.68–14.42 | +4.9% |
| typical / opsec (ms) | 0.13–0.13 | 0.14–0.14 | +8.2% |
| typical / state (ms) | 5.28–5.40 | 5.29–5.40 | +0.1% |
| typical / journey (ms) | 2.29–2.31 | 2.37–2.66 | +9.5% |
| typical / session (ms) | 20.42–21.15 | 20.10–21.60 | +0.3% |
| typical / market_browse (ms) | 2.67–2.71 | 2.70–2.81 | +2.6% |
| typical / market_report (ms) | 9.40–9.76 | 9.59–9.66 | +0.5% |
| typical / imports_warm (ms) | 0.82–0.84 | 0.79–0.82 | -3.4% |
| typical / imports_after_write (ms) | 1.30–1.32 | 1.13–1.13 | -13.5% |
| stress / idle_cpu (% one core) | 1.54–1.54 | 2.22–2.26 | +45.2% |
| stress / idle_rss (MiB) | 107.63–125.97 | 222.00–222.06 | +90.1% |
| stress / idle_loop_max (ms) | 41.98–42.86 | 80.81–83.23 | +93.4% |
| stress / startKairo_startup (ms) | 26.18–26.72 | 216.96–223.96 | +733.5% |
| stress / state_http (ms) | 49.64–51.37 | 48.45–50.38 | -2.2% |
| stress / opsec (ms) | 0.14–0.14 | 0.15–0.16 | +8.8% |
| stress / state (ms) | 26.83–27.12 | 26.35–26.89 | -1.3% |
| stress / journey (ms) | 5.03–5.12 | 4.80–4.82 | -5.1% |
| stress / session (ms) | 113.70–116.26 | 112.74–113.26 | -1.7% |
| stress / market_browse (ms) | 8.88–9.03 | 8.92–9.00 | -0.0% |
| stress / market_report (ms) | 44.93–45.47 | 45.49–45.65 | +0.8% |
| stress / imports_warm (ms) | 0.95–1.00 | 0.91–1.51 | +24.3% |
| stress / imports_after_write (ms) | 1.32–1.40 | 1.35–1.37 | -0.2% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
