# Controlled legacy ABBA results

| Profile / metric | v0.7.3 range | RC16 range | Mean change |
|---|---:|---:|---:|
| typical / idle_cpu (% one core) | 0.58–0.60 | 0.72–0.83 | +31.0% |
| typical / idle_rss (MiB) | 68.47–68.79 | 133.95–148.14 | +105.5% |
| typical / idle_loop_max (ms) | 14.21–14.77 | 15.49–17.35 | +13.3% |
| typical / startKairo_startup (ms) | 11.07–11.70 | 160.25–172.69 | +1362.2% |
| typical / state_http (ms) | 8.95–10.38 | 10.81–11.01 | +12.8% |
| typical / opsec (ms) | 0.07–0.07 | 0.08–0.08 | +8.1% |
| typical / state (ms) | 3.99–4.11 | 4.08–4.61 | +7.3% |
| typical / journey (ms) | 1.83–1.84 | 1.85–1.87 | +1.5% |
| typical / session (ms) | 15.03–15.03 | 16.46–16.79 | +10.6% |
| typical / market_browse (ms) | 1.97–2.07 | 2.07–2.15 | +4.4% |
| typical / market_report (ms) | 6.56–6.77 | 6.76–6.89 | +2.3% |
| typical / imports_warm (ms) | 0.56–0.64 | 0.63–0.66 | +7.8% |
| typical / imports_after_write (ms) | 0.58–0.58 | 0.61–0.62 | +5.8% |
| stress / idle_cpu (% one core) | 1.32–1.35 | 1.62–1.64 | +22.0% |
| stress / idle_rss (MiB) | 82.15–101.42 | 167.86–170.82 | +84.5% |
| stress / idle_loop_max (ms) | 36.18–36.83 | 55.41–56.92 | +53.9% |
| stress / startKairo_startup (ms) | 14.93–17.67 | 164.38–168.70 | +921.7% |
| stress / state_http (ms) | 40.22–40.30 | 44.72–45.63 | +12.2% |
| stress / opsec (ms) | 0.08–0.09 | 0.09–0.09 | +4.1% |
| stress / state (ms) | 22.92–23.97 | 21.89–25.60 | +1.3% |
| stress / journey (ms) | 3.72–3.97 | 3.67–3.84 | -2.4% |
| stress / session (ms) | 92.61–99.51 | 84.87–90.34 | -8.8% |
| stress / market_browse (ms) | 6.68–7.16 | 6.56–6.65 | -4.6% |
| stress / market_report (ms) | 33.64–36.55 | 33.87–35.13 | -1.7% |
| stress / imports_warm (ms) | 0.67–0.69 | 0.73–1.10 | +35.2% |
| stress / imports_after_write (ms) | 0.70–0.70 | 0.69–0.71 | +0.0% |

All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.

Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.

| Database metric | v0.7.3 range | RC16 range |
|---|---:|---:|
| First open (ms) | 909.48–915.00 | 907.25–920.02 |
| Cold aged imports (ms) | 450.38–458.33 | 448.43–471.60 |
| 5,000 event inserts (ms) | 18.01–18.62 | 17.97–18.56 |
| 1,000 history updates (ms) | 34.94–35.05 | 33.87–34.44 |
| Largest history write block (ms) | 2.94–3.05 | 3.06–3.18 |
| Working history JSON (MiB) | 15.60–15.60 | 15.60–15.60 |

Cold import and saved history/source complete output hashes match in every database run.
