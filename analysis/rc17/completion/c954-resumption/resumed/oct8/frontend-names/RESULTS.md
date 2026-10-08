# F3 snapshot names owner: measured component decision

8 October 2026. **Coordinator decision: adopt the four-file helper on the selected 9afa/c954 continuation, with the observed first-Assets-open cost explicitly accepted as a component tradeoff.** Source integration is performed separately by the coordinator. Full F3 Context propagation, the names wire payload and final combined RC17 acceptance remain open. PR #10 remains withdrawn.

The change removes a full-map allocation and recursive equality pass when an SSE snapshot repeats the current flat names. Existing unchanged identity semantics remain the same; this does not claim fewer React broadcasts. A changed/new name still creates one merged immutable map, and a later authoritative state can replace it.

## Source and correctness

Baseline exact `9afa9a7197fa6b5a802e9efdaa322dedf2439150`; trial is that source plus `current-proposal.patch`, exactly four files. Independent read-only review found no blocker within valid persisted/transport flat name maps; see `INDEPENDENT-REVIEW.md` for the startup-validation qualification.

- Focused tests **24/24**: resource owner, derived models, scope serialization and server snapshot revisions. The names regression includes **2,048 deterministic event sequences** compared with the actual original expression, own/inherited/enumerable/prototype cases, immutable inputs and an unchanged-map no-copy guard.
- Both isolated sources passed type checks and fresh production builds with **20 client assets each**.
- Both compiled diagnostic lanes passed **20/20** checks, including delayed state versus newer names SSE, partial-name retention and authoritative state removal. Zero exceptions or external traffic.
- Eight ordinary browser workers (two complete ABBA cycles) passed **11/11** checks each. All source/build and declared entry-harness end guards pass. The adverse follow-up additionally pins imported Chrome/source-manifest helpers. No timing row or original result was discarded.

Baseline source/build fingerprint: `32ea8ffbe8fea34a25c859bb3ec60481f679c6db969e0aad2f2fbd093ce90ac3`. Trial: `378275115c9e6abf0bf667e522185a25fe883405007083cabd60c355d08f33c9`.

## Ordinary browser measurements

The first ABBA exposed slower first-open and unrelated-name rows. Before looking at a second result, the coordinator authorized one fixed follow-up ABBA with the **same entire ordinary harness, fixture, initial Overview priming, builds and all rows**. The original cycle is retained. Each median below summarizes four fresh browsers per variant; pair detail is in `BROWSER-COMBINED-SUMMARY.json`.

| Phase | Baseline task ms | Trial task ms | Task change | Baseline script ms | Trial script ms |
|---|---:|---:|---:|---:|---:|
| assets-first-open | 71.788 | 89.215 | +24.3% | 36.146 | 44.085 |
| assets-sort-directions | 43.278 | 45.618 | +5.4% | 11.761 | 12.027 |
| assets-full-names-20-wallet-events | 609.926 | 302.784 | -50.4% | 550.270 | 244.302 |
| assets-unrelated-wallet-snapshot | 34.104 | 20.039 | -41.2% | 26.701 | 11.181 |
| assets-search-and-page | 85.721 | 73.706 | -14.0% | 42.695 | 30.756 |
| assets-relevant-name | 46.006 | 36.275 | -21.2% | 35.753 | 31.518 |
| assets-unrelated-name | 24.683 | 23.940 | -3.0% | 22.630 | 20.991 |
| inactive-assets-source-change | 32.991 | 21.632 | -34.4% | 25.081 | 13.372 |
| wallet-journal-open | 42.388 | 43.511 | +2.6% | 17.272 | 18.002 |
| wallet-unrelated-snapshot | 33.333 | 20.520 | -38.4% | 24.440 | 12.038 |
| wallet-transaction-first-use | 29.143 | 31.545 | +8.2% | 8.068 | 7.848 |
| wallet-journal-return | 37.798 | 35.781 | -5.3% | 9.871 | 10.079 |
| industry-first-use | 52.096 | 43.487 | -16.5% | 15.320 | 12.137 |

The 20-full-name-event window improves in all four nearest AB/BA pairs: task cost falls 48.6%, 52.0%, 52.0%, 45.3%. Single unchanged-name asset/wallet events and the inactive-assets update also improve in every pair.

**First Assets open remains adverse and is not dismissed.** Its task pair deltas are +7.210 ms (+8.97%), +35.167 ms (+56.51%), +8.686 ms (+13.75%), +6.852 ms (+8.16%). Neither complete cycle has both pairs exceeding the stated >10% and >1 ms material-regression rule, but all four pairs are slower. The ordinary controlled action window median is 260.013→282.386 ms; it includes fixed harness waits and is not a general navigation latency claim.

The unrelated-name addition's original +30.632 ms task outlier occurs with a negative ordinary heap delta; that is consistent with collection occurring in the window, but is not proof of its cause. The other three paired task deltas are +1.440 ms, -1.622 ms, -2.057 ms, and the combined median is slightly lower. All raw heap values remain available; they do not establish retained memory growth or a leak.

A separate **precise coverage diagnostic** on the hash-verified trial asset maps the compiled `Fx` function to the exact helper body and reports **zero calls through initial Overview and first Assets open**. Its timing values are excluded from the ordinary comparison. This rules out helper execution itself in that phase; it does not attribute the observed candidate-build first-open difference or prove that compiled bundle/JIT effects are absent. No unsupported causal dismissal is made.

## Decision and boundaries

The accepted narrow decision includes the measured first-use tradeoff in exchange for repeatedly lower snapshot owner work: roughly 307 ms renderer task saved per synthetic 20-event full-name-map window, plus lower single-event costs. It is a bounded helper with no cache, protocol change or added retained history. This recorded tradeoff remains visible in final combined acceptance; no first-use improvement is claimed.

The owned-function supplement (`OWNED-RESULTS.md`) independently supports the mechanism: 20,000-name unchanged merge 4.370→0.726 ms, with exact output/identity parity across twelve process arms. Its adverse 20,000-name addition (+0.111 ms) and 100-name changed cases remain recorded.

F3 is **not wholly closed**. Full names still cross the wire and require JSON decoding/scanning; the shared resource Context remains broad. The candidate's 20-event script window still costs about 244 ms and needs attribution before a subscription redesign or explicit measured no-change decision. F6 archive/cardinality and table acceptance, M6 scene leaves, and all final combined source/local/CI/package gates remain in their owner traces. No clean RC17 claim follows from this component decision.

CDP task/script/style/layout measurements exclude browser/GPU/worker CPU. Fixtures are synthetic two-pilot, 10,000-row local data with external traffic blocked. Ordinary timings use no profiler, row/formatter counter wrappers or forced GC. Sampling medians and paired observations are reported without a statistical-significance claim.
