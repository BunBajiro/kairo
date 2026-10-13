# Independent market icon evidence review

Date: 2026-10-13. Disposition: **PASS for the focused automated checks; R-UI1 remains pending Bun's retest.**

Reviewed the original baseline and corrected-build JSON measurements, checked the corrected artifact sizes and SHA-256 digests, and visually inspected the corrected Firefox direct-category screenshot and Chrome narrow Import Analyser screenshot. No additional application workloads were run for this review.

## Corrected artifact identity

Both artifacts identify source `37a0e79b7d9df4e980615e7f3711e6e5f2884d12`, Actions run `38411934641` (test build #69), job `115346219091`.

| Artifact | ID | Bytes | Verified SHA-256 |
| --- | --- | ---: | --- |
| `market-icon-firefox-check` | `11821377995` | 526,973 | `6a73115592f5acea3abbf9f22e505818685dc978e33089a8c61f2262901f8dc4` |
| `market-icon-check` | `11821522803` | 282,763 | `4e7b4f8588177e2b38f4dbc05197fe0c868a5f3e9000c50cb5c569bb2bf33cf4` |

## Findings

- **Firefox 153.0: three desktop checks passed at 1600 × 1100.** A fresh context expanded folders without selecting parent categories, opened the Inertial Stabilizers leaf before All items, then opened All items and returned to the leaf. The held initial icon measured 30 × 30 before decoding (`naturalWidth: 0`); after release it decoded (`naturalWidth: 32`) and remained visible. All three stages showed visible 30 × 30 icons.
- **Chrome: all 19 check groups passed.** Coverage includes category-first navigation, Browse/detail/Hub Report/Import cards at 1600, 1024 and 390 pixels, import-plan icons at 1600 and 390 pixels, and failure recovery. Normal icons measured 30 × 30; Import card icons retained their intended 38 × 38 size. The first unloaded catalogue icons also reserved 30 × 30 space.
- **The failure-recovery defect is demonstrated and corrected.** Baseline Chrome decoded the replacement image after an intercepted HTTP 404 followed by HTTP 200, but its inline visibility remained hidden. The corrected build exercised the same image element and sequence; the decoded replacement was visible. The first 18 baseline Chrome groups had passed; the recovery assertion was the failure.
- **Screenshots support the measurements.** The corrected Firefox direct-leaf view visibly contains its icon. The Chrome 390-pixel Import view preserves the larger icon and readable wrapped item label.

## Scope and remaining issue

The original category-first symptom was **not reproduced** in the synthetic baseline: Firefox 153 passed all three desktop stages before the patch, and Chrome's initial navigation/layout checks passed. The corrected tests demonstrate reserved icon geometry and successful recovery; they do not establish that either mechanism caused Bun's reported symptom.

These checks use the real compiled application and synthetic SQLite records, with intercepted SVG image responses. They do not reproduce Bun's installed database, live PNG/cache conditions, extensions, Windows environment, or Firefox 157. Firefox coverage here is desktop only; the narrow-view results are Chrome results.

Keep **R-UI1 open pending Bun's category-first retest** of the corrected review build. This review does not claim completion of the later package gates, approve a merge, or reopen the performance comparison.
