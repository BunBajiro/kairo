# Controlled legacy ABBA results

| Profile / metric | v0.7.3 range | RC16 range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.77–0.84 | 0.82–0.86 | +4.7% |
| typical / idle_rss (MiB) | 93.20–93.44 | 176.57–177.15 | +89.5% |
| typical / idle_loop_max (ms) | 15.52–15.65 | 20.41–23.53 | +41.0% |
| typical / startKairo_startup (ms) | 23.03–24.45 | 212.62–216.80 | +804.5% |
| typical / state_http (ms) | 13.71–13.82 | 12.57–13.56 | -5.1% |
| typical / opsec (ms) | 0.14–0.14 | 0.15–0.18 | +15.4% |
| typical / state (ms) | 5.45–5.46 | 5.27–8.64 | +27.5% |
| typical / journey (ms) | 2.41–2.41 | 2.35–2.39 | -1.8% |
| typical / session (ms) | 20.91–21.18 | 20.94–21.14 | -0.0% |
| typical / market_browse (ms) | 2.69–2.72 | 2.67–2.88 | +2.4% |
| typical / market_report (ms) | 9.96–10.08 | 9.34–9.68 | -5.1% |
| typical / imports_warm (ms) | 0.80–0.87 | 0.76–1.25 | +20.4% |
| typical / imports_after_write (ms) | 1.18–1.31 | 1.10–1.68 | +11.6% |
| stress / idle_cpu (% one core) | 1.63–1.72 | 2.14–2.15 | +28.2% |
| stress / idle_rss (MiB) | 107.36–125.54 | 192.73–193.65 | +65.9% |
| stress / idle_loop_max (ms) | 43.68–44.89 | 76.15–76.15 | +72.0% |
| stress / startKairo_startup (ms) | 27.20–28.02 | 219.94–231.02 | +716.7% |
| stress / state_http (ms) | 49.97–51.43 | 49.43–49.70 | -2.2% |
| stress / opsec (ms) | 0.14–0.15 | 0.15–0.15 | +1.2% |
| stress / state (ms) | 27.17–27.36 | 27.23–28.22 | +1.7% |
| stress / journey (ms) | 5.11–5.18 | 4.80–4.87 | -6.0% |
| stress / session (ms) | 114.79–118.04 | 110.14–111.80 | -4.7% |
| stress / market_browse (ms) | 8.85–8.87 | 8.76–8.85 | -0.6% |
| stress / market_report (ms) | 45.47–45.51 | 45.46–46.03 | +0.6% |
| stress / imports_warm (ms) | 0.92–0.93 | 0.87–0.92 | -3.6% |
| stress / imports_after_write (ms) | 1.31–1.42 | 1.25–1.35 | -5.1% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.

| Database metric | v0.7.3 range | RC16 range |
|---|---:|---:|
| First open (ms) | 1152.39–1158.17 | 1138.58–1143.94 |
| Cold aged imports (ms) | 617.55–663.19 | 621.37–657.56 |
| 5,000 event inserts (ms) | 24.51–24.74 | 24.77–24.90 |
| 1,000 history updates (ms) | 40.07–40.38 | 40.17–41.99 |
| Largest history write block (ms) | 3.09–3.12 | 3.26–3.28 |
| Working history JSON (MiB) | 15.60–15.60 | 15.60–15.60 |

Cold import and saved history/source complete output hashes match in every database run.
