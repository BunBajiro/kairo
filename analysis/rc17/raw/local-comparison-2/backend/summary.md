# RC16/candidate controlled backend ABBA results

| Profile / metric | RC16 range | Candidate range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.60–0.85 | 0.65–0.93 | +9.1% |
| typical / idle_rss (MiB) | 151.55–158.52 | 153.08–162.51 | +1.8% |
| typical / idle_loop_max (ms) | 17.37–19.25 | 20.97–25.48 | +26.8% |
| typical / startKairo_startup (ms) | 146.22–151.58 | 148.10–152.71 | +1.0% |
| typical / state_http (ms) | 9.14–10.48 | 9.36–10.32 | +0.3% |
| typical / opsec (ms) | 0.07–0.08 | 0.07–0.08 | +1.3% |
| typical / state (ms) | 3.88–3.91 | 3.91–4.33 | +5.8% |
| typical / journey (ms) | 1.81–2.03 | 1.81–2.08 | +1.2% |
| typical / session (ms) | 14.62–15.33 | 15.38–16.70 | +7.1% |
| typical / market_browse (ms) | 1.93–2.08 | 1.96–2.22 | +4.1% |
| typical / market_report (ms) | 6.44–6.46 | 6.57–6.92 | +4.6% |
| typical / imports_warm (ms) | 0.54–0.55 | 0.53–0.55 | -0.7% |
| typical / imports_after_write (ms) | 0.56–0.59 | 0.56–0.59 | +0.3% |
| stress / idle_cpu (% one core) | 1.64–1.66 | 1.67–1.73 | +3.2% |
| stress / idle_rss (MiB) | 205.92–207.65 | 181.17–212.62 | -4.8% |
| stress / idle_loop_max (ms) | 53.90–55.38 | 49.91–64.32 | +4.5% |
| stress / startKairo_startup (ms) | 153.96–179.63 | 141.46–155.05 | -11.1% |
| stress / state_http (ms) | 38.47–39.86 | 37.51–43.29 | +3.1% |
| stress / opsec (ms) | 0.08–0.08 | 0.08–0.08 | -3.9% |
| stress / state (ms) | 22.09–22.69 | 21.12–21.36 | -5.1% |
| stress / journey (ms) | 3.52–3.85 | 3.68–5.22 | +20.6% |
| stress / session (ms) | 81.75–82.83 | 88.88–93.65 | +10.9% |
| stress / market_browse (ms) | 6.33–6.35 | 6.39–6.59 | +2.4% |
| stress / market_report (ms) | 30.75–31.07 | 32.48–33.09 | +6.1% |
| stress / imports_warm (ms) | 0.63–0.65 | 0.66–0.68 | +4.7% |
| stress / imports_after_write (ms) | 0.66–0.67 | 0.70–0.72 | +6.2% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
