# Configured first binding: independent results review

**Pass: C2's missing configured whole-Core startup observation is complete.** Retain the accepted lazy-formatter trade-off. No correctness or collection blocker was found, and these two matched pairs do not establish a repeated material cold regression. This is supplemental acceptance evidence, not release approval or a replacement for the ordinary mixed gate.

The declared stress ABBA used RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and final source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. Four separate setup processes persisted visible Wallet/Goal bindings before four different fresh observation processes imported the application. Each setup closed Store before observation. Build commands, logs, prebuild/postbuild manifests and source fingerprints match; 933 source/build files were independently rehashed. Candidate lineage includes selected c954 and excludes withdrawn 508.

All four first HTTP states contain the same complete visible elements: Wallet `1,234,567.89 ISK`; Goal `Fixture objective`, detail `1,234,567.89 / 2,345,678.91`, numeric value `52.631580764820015`, and all visual/status fields. First states agree except `serverTime`; each 704-byte state's hash was recomputed. All 100 actual warm Core calls per worker completed with exact output assertions; first/final element equality is independently verified. The immutable worker checks every intermediate output outside timing; intermediate states are not separately archived. Final version remains 2 for the candidate versus 102 for RC16, consistent with unchanged-output publication suppression; this is not formatter-only timing.

## Both matched pairs, including every adverse cold observation

Changes are candidate minus RC16; pairs are positions 1→2 and 4→3.

| Metric | Pair 1 change | Pair 2 change |
|---|---:|---:|
| Cold index import | +0.566 ms / +1.20% | −2.503 ms / −5.72% |
| Configured `startKairo` | +6.280 ms / +4.10% | −20.920 ms / −11.08% |
| First Stream HTTP read | +0.832 ms / +4.72% | −0.983 ms / −5.06% |
| Import + configured startup | +6.846 ms / +3.42% | −23.423 ms / −10.07% |
| Import + startup + first wire | +7.678 ms / +3.52% | −24.406 ms / −9.68% |
| Mean warm actual Core update | −0.2229 ms / −70.18% | −0.1751 ms / −63.23% |

Candidate cumulative import/startup/first-wire observations are 225.752 and 227.648 ms; RC16 observations are 218.074 and 252.054 ms. Warm means are 0.09472/0.10179 ms candidate versus 0.31764/0.27686 ms RC16. No pair crosses both +1 ms and +10%. All six metrics, 12 pairs, eight cumulative-sum checks, 400 raw warm durations and 24 warm-distribution fields were independently recomputed; all five adverse pairs remain in `RESULTS-AUDIT.json`.

All 31 inventory entries, 29 closed-file pins and 20 immutable inputs match. Thirteen owned commands exited 0, with successful namespace-aware descendant drains and no unexpected survivors. All eight setup/observation workers report zero external attempts. Actual app close, full source guards, unchanged setup receipts, and absence of all four data directories and four temporary directories pass. Deleted fixture payloads cannot be rehashed now; their setup fingerprints and worker verification/cleanup chain are preserved explicitly.

Cold means fresh process/module graph, not OS-disk-cold caches. `noSync:true` and deferred dataset startup isolate configured local initialization; ordinary mixed measurements own scheduler/provider/load coverage. Startup includes the first projection without separately attributing formatter cost. Wire time includes loopback HTTP overhead; warm calls include real binding collection and Stream update. No browser, GPU, physical OBS or total OBS CPU claim follows. No additional experiment is needed for this scoped observation.
