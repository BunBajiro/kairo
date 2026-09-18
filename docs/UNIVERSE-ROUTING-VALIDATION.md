# Universe routing validation

Validated 18 September 2026 on Node v24.19.0. These measurements cover the pure local planners, including graph construction, against the bundled 8,490 systems and 6,989 undirected stargate pairs. They exclude HTTP, database context enrichment and rendering.

| Planner | Requests | Mean ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Gate shortest | 36 | 12.5 | 22.0 | 24.7 |
| Gate safer | 36 | 10.5 | 13.8 | 14.0 |
| Jump 5 LY | 18 | 91.0 | 146.0 | 146.0 |

Each gate profile ran 12 representative system pairs three times; jump planning ran six pairs three times with a 5 LY range. Pairs span Jita, Amarr, Dodixie, Hek, Rens, UALX-3, C-J6MT and 1DQ1-A. The disconnected Jita–Thera gate case was included. Every returned gate leg was checked against the static neighbors and every jump leg against the selected physical range. No network requests were made. Results are measurements on this workspace, not guarantees for every machine or route.

## Correctness checks

Run: `node --test tests/kairo/universe-routing.test.mjs`

15 passing tests cover mixed edge identity; unconfirmed, disabled and expired links; one-way links; disconnected systems; current pilot standings; friendly nullsec preference; activity weighting; per-direction owner-capital zones; differently owned return gates; zone boundaries; selected announced access rules; physical Y-axis distance; exact in-game light-year; intermediate jump systems; and prohibited cyno destinations.

## Rules and limits

The [official map guide](https://developers.eveonline.com/docs/guides/map-data/) defines the exact in-game light-year as 9,460,000,000,000,000 metres. The planner uses full X/Y/Z coordinates and excludes high-security destinations, Jove regions, Pochven, Zarzakh, Exordium, wormhole space and systems excluded by the static eligibility flag. High-security origins may jump outward. This is physical range planning; cyno availability, fuel, fatigue, jammers, docking and ship eligibility are not verified.

The [July Ansiblex proposal](https://www.eveonline.com/news/view/force-projection-ansiblex-capacitor-update) supplies destination-to-owner-capital zone thresholds of 5, 10, 15 and 20 LY. The [15 September announcement](https://www.eveonline.com/news/view/major-update-force-projection-revamped) schedules the overhaul for 22 September; the interface must retain the announced/provisional label. Current mode requires explicit saved access; announced mode additionally enforces same-alliance membership. Missing capital data cannot bypass a restrictive zone filter.

Safer routing is a weighted preference, not a safety prediction. Visibility, map filters and recorded journey trails do not change connectivity.
