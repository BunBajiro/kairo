# Maps camera comparison

Baseline: 57c8dcc7fbd8fc2b62129498d1819050c78381a1. Candidate: 05d0d4b36c154329006d6772769063db874762da.

Two independent browser repetitions per application in ABBA order. Second pair reverses the 100/600-node size order. Same canonical graph digest across all entries.

| Nodes | Camera action | Renderer task ms (RC16 → candidate) | Script ms (RC16 → candidate) | Style ms (RC16 → candidate) |
|---:|---|---:|---:|---:|
| 100 | idle | 3.77 → 3.57 | 0.28 → 0.26 | 0.00 → 0.00 |
| 100 | zoom | 1014.40 → 669.12 | 164.51 → 13.76 | 589.50 → 327.26 |
| 100 | pan | 382.84 → 254.40 | 151.73 → 25.56 | 22.91 → 21.22 |
| 600 | idle | 95.82 → 35.93 | 15.60 → 0.76 | 44.88 → 0.12 |
| 600 | zoom | 2764.62 → 1022.15 | 616.36 → 6.76 | 1239.26 → 608.62 |
| 600 | pan | 2706.08 → 1137.72 | 1097.06 → 84.62 | 111.05 → 95.93 |

Means shown; exact paired samples, frame intervals, wall windows and diagnostic snapshots are in `summary.json`. Idle windows are one second. Zoom executes three 1.25× button zooms; pan uses 24 middle-pointer steps. No map-load timing is included.

The style-mutation observer and forced-GC checks run after every timing window. They do not measure React commits. Two mount/unmount cycles provide a bounded retained-ownership check, not a general leak test.

Two fresh browser repetitions per implementation on one host; ranges are observed values, not confidence intervals. Camera windows perform identical user actions after map loading. Extra UI controls remain part of candidate UI. Mutation counts and forced-GC snapshots are separate diagnostics, never camera timings. Headless software-rendered frame observations do not predict a desktop GPU frame rate.
