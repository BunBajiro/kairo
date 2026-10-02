# Maps camera comparison

Baseline: 57c8dcc7fbd8fc2b62129498d1819050c78381a1. Candidate: 05d0d4b36c154329006d6772769063db874762da.

Two independent browser repetitions per application in ABBA order. Second pair reverses the 100/600-node size order. Same canonical graph digest across all entries.

| Nodes | Camera action | Renderer task ms (RC16 → candidate) | Script ms (RC16 → candidate) | Style ms (RC16 → candidate) |
|---:|---|---:|---:|---:|
| 100 | idle | 2.30 → 2.88 | 0.34 → 0.33 | 0.00 → 0.00 |
| 100 | zoom | 1099.06 → 715.76 | 151.70 → 12.00 | 598.88 → 351.59 |
| 100 | pan | 315.16 → 247.86 | 105.41 → 21.71 | 20.38 → 21.65 |
| 600 | idle | 12.45 → 10.96 | 0.31 → 0.34 | 0.00 → 0.00 |
| 600 | zoom | 2372.77 → 1110.42 | 328.10 → 12.45 | 1212.74 → 641.28 |
| 600 | pan | 2253.02 → 959.58 | 640.39 → 73.93 | 105.36 → 99.07 |

Means shown; exact paired samples, frame intervals, wall windows and diagnostic snapshots are in `summary.json`. Idle windows are one second. Zoom executes three 1.25× button zooms; pan uses 24 middle-pointer steps. No map-load timing is included.

The style-mutation observer and forced-GC checks run after every timing window. They do not measure React commits. Two mount/unmount cycles provide a bounded retained-ownership check, not a general leak test.

Two fresh browser repetitions per implementation on one host; ranges are observed values, not confidence intervals. Camera windows perform identical user actions after map loading. Extra UI controls remain part of candidate UI. Mutation counts and forced-GC snapshots are separate diagnostics, never camera timings. Headless software-rendered frame observations do not predict a desktop GPU frame rate.
