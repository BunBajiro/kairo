# Controlled legacy ABBA results

| Profile / metric | v0.7.3 range | RC16 range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.57–0.58 | 0.86–0.91 | +54.6% |
| typical / idle_rss (MiB) | 93.67–94.14 | 184.05–184.45 | +96.2% |
| typical / idle_loop_max (ms) | 13.52–13.66 | 21.04–25.85 | +72.5% |
| typical / startKairo_startup (ms) | 16.21–16.31 | 141.70–144.40 | +779.8% |
| typical / state_http (ms) | 7.71–9.10 | 8.35–8.61 | +0.9% |
| typical / opsec (ms) | 0.07–0.07 | 0.07–0.07 | +2.9% |
| typical / state (ms) | 2.94–3.10 | 2.98–3.02 | -0.6% |
| typical / journey (ms) | 1.32–1.39 | 1.32–1.34 | -2.0% |
| typical / session (ms) | 12.15–12.67 | 11.74–11.86 | -4.9% |
| typical / market_browse (ms) | 1.49–1.50 | 1.49–1.53 | +1.1% |
| typical / market_report (ms) | 5.78–5.95 | 5.77–5.90 | -0.5% |
| typical / imports_warm (ms) | 0.43–0.43 | 0.40–0.75 | +33.6% |
| typical / imports_after_write (ms) | 0.74–0.76 | 0.75–0.79 | +2.5% |
| stress / idle_cpu (% one core) | 0.89–1.12 | 1.54–1.56 | +54.3% |
| stress / idle_rss (MiB) | 125.40–126.30 | 202.41–203.70 | +61.3% |
| stress / idle_loop_max (ms) | 29.79–31.49 | 44.96–50.43 | +55.7% |
| stress / startKairo_startup (ms) | 18.52–18.87 | 141.89–146.44 | +671.0% |
| stress / state_http (ms) | 32.21–35.96 | 28.48–31.37 | -12.2% |
| stress / opsec (ms) | 0.07–0.07 | 0.08–0.13 | +45.0% |
| stress / state (ms) | 14.49–15.34 | 15.78–16.22 | +7.3% |
| stress / journey (ms) | 2.63–2.63 | 2.70–2.81 | +4.7% |
| stress / session (ms) | 63.26–64.59 | 65.68–66.57 | +3.4% |
| stress / market_browse (ms) | 4.63–4.86 | 4.86–4.97 | +3.5% |
| stress / market_report (ms) | 26.83–28.20 | 28.28–28.29 | +2.8% |
| stress / imports_warm (ms) | 0.43–0.85 | 0.80–0.82 | +26.0% |
| stress / imports_after_write (ms) | 0.74–1.14 | 0.76–2.78 | +88.6% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.
