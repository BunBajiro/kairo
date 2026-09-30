# Controlled legacy ABBA results

| Profile / metric | v0.7.3 range | RC16 range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.64–0.92 | 0.94–0.98 | +23.3% |
| typical / idle_rss (MiB) | 68.54–68.96 | 144.52–150.82 | +114.8% |
| typical / idle_loop_max (ms) | 14.86–22.15 | 22.51–23.86 | +25.3% |
| typical / startKairo_startup (ms) | 13.67–14.15 | 150.65–158.39 | +1010.8% |
| typical / state_http (ms) | 9.60–9.86 | 9.67–9.67 | -0.6% |
| typical / opsec (ms) | 0.08–0.08 | 0.07–0.08 | -6.3% |
| typical / state (ms) | 4.28–5.35 | 3.99–4.51 | -11.8% |
| typical / journey (ms) | 2.00–2.42 | 1.91–1.92 | -13.4% |
| typical / session (ms) | 15.51–16.81 | 14.60–15.49 | -6.9% |
| typical / market_browse (ms) | 2.08–2.23 | 2.00–2.07 | -5.7% |
| typical / market_report (ms) | 6.68–8.75 | 6.36–6.45 | -17.1% |
| typical / imports_warm (ms) | 0.63–0.66 | 0.58–0.65 | -4.9% |
| typical / imports_after_write (ms) | 0.61–0.66 | 0.60–0.65 | -1.5% |
| stress / idle_cpu (% one core) | 1.36–1.55 | 1.66–1.67 | +14.1% |
| stress / idle_rss (MiB) | 101.57–101.70 | 171.95–172.55 | +69.5% |
| stress / idle_loop_max (ms) | 39.55–42.30 | 58.92–59.64 | +44.8% |
| stress / startKairo_startup (ms) | 15.99–16.15 | 154.20–164.52 | +891.6% |
| stress / state_http (ms) | 39.68–40.07 | 41.95–44.06 | +7.8% |
| stress / opsec (ms) | 0.08–0.09 | 0.09–0.10 | +13.7% |
| stress / state (ms) | 25.41–28.36 | 22.18–22.97 | -16.0% |
| stress / journey (ms) | 3.88–4.63 | 3.56–3.79 | -13.7% |
| stress / session (ms) | 90.28–103.56 | 86.74–95.24 | -6.1% |
| stress / market_browse (ms) | 6.92–6.98 | 6.57–6.83 | -3.7% |
| stress / market_report (ms) | 36.25–37.20 | 33.86–36.21 | -4.6% |
| stress / imports_warm (ms) | 0.71–0.77 | 0.74–0.75 | +1.0% |
| stress / imports_after_write (ms) | 0.72–0.75 | 0.73–0.73 | -0.5% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
