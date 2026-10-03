# Exact-original-runtime Mapper replay

**Verified 3 October 2026.** The compiled Mapper correctness gate is closed by
[GitHub run 37082520646](https://github.com/BunBajiro/kairo/actions/runs/37082520646),
using the exact original source and compiled runtime measured in the full
three-version run. This is a bounded correctness replay, not a new timing run
or acceptance of the separate idle-CPU regression.

## Why a separate replay was required

Full run `37078241973` completed every measurement lane and all 17 Mapper
assertions, then failed while removing Chrome's temporary profile. Its original
failed conclusion stays unchanged. Focused run `37080679048` passed the same
assertions and corrected Chrome cleanup, but rebuilt the client. The strict
combined gate rejected its differing compiled entrypoints. That failure also
stays unchanged.

The recovered focused candidate entrypoints have now been retrieved from
artifact `11259102205` of recovery run `37081834569`; the downloaded ZIP's
58,241 bytes match SHA-256
`5273640b59b3540484b976976df7f2901c6b412f7485077d800b9848c43d09fa`.
All 439 candidate source files match, as do 18 of 20 compiled files. Direct
comparison confirms that `index.html` and `index.rsc` differ only in one
`deploymentVersion` UUID value each, at byte offsets 41,196 and 2,606.
The original value is `16a653b0-f361-4d25-b6b7-38e4c0c513fb`; the focused
rebuild's value is `b600a4dd-fbea-4738-94b9-ab71f93a6854` in both files.
All bytes outside those value spans match. This explains the candidate rebuild
difference; it does not remove the operational meaning of deployment-version
checks or establish cross-deployment compatibility. No assets or hash guards
were normalized or rewritten. Focused RC16 entrypoint bytes were not included
in that candidate bundle, so no corresponding byte-equivalence claim is made.

## Exact-runtime verification

The successful replay was launched at analysis commit
`eed75ae03a12ca5b0090f24b89f1dbc622399231`. It checked out candidate
`05d0d4b36c154329006d6772769063db874762da` and restored the 20 original compiled
files from original artifact `11257683807`, without compilation or dependency
installation. It verified the original tar SHA-256
`bf398719a9f423530344588977cddc4731b919c123c10d9cf971e348e2ece998`, its complete
1,201-file inventory and all 439 clean-checkout source files before restoration.

| Gate | Result |
| --- | --- |
| Candidate source and compiled manifest | Exact match to the original CI runtime before and after replay |
| Candidate fingerprint | `9df9de9ed3e9740df9955c59aa8b09c0b03693cbb41875cc716b6b499021ea84` |
| Feature assertions | Same 17 assertions in the same order as the original run |
| Browser cleanup | Chrome exit code 0; process closed; profile cleanup verified |
| Errors and external traffic | Empty error and external-attempt arrays |
| Measurement harness provenance | Every original harness hash unchanged except the permitted `maps-correctness.mjs` cleanup fix |
| Retained original raw evidence | All 78 original artifact files rechecked byte for byte |
| Workflow | Restore, browser, post-verification, combined gate and packaging all passed |

The new 2,347,835-byte raw-evidence ZIP matches GitHub's SHA-256
`cd74fea70ba828eff6b3dc8dd757b2ea53fea7e355b81917e22c776a6db50c1b`.
Its 13 files, retained original files, run/job conclusions, source/compiled
identities, changed-harness allowlist, browser assertions and cleanup record
were independently rechecked after retrieval.

The separate [combined acceptance record](../raw/github-run-37082520646/combined-acceptance.json)
has SHA-256 `28c7949ba9ddcb81a9f22fb0acd69921d9fbd82ab738434c340bfc48e5ff60d0`.
It joins unchanged valid measurements from the failed full run to the successful
exact-runtime browser gate. It does not relabel either earlier workflow as
successful, rerun RC16, or claim another full performance comparison.

## Internal bundle

The new bundle's manifest and both bounded parts were retrieved, and each ZIP
digest matched GitHub. The reconstructed tar is 33,768,369 bytes with SHA-256
`1553f02224514f55a77e0de3c171d8fc9a1af4457f8147fa72ecb706cd995e88`.
All **1,236** inventory files verify. Its runtime retains the exact original
candidate fingerprint. The bundle includes the reproduction workflow and the
separate combined gate record.

Bundle metadata correctly keeps `allComparisonLanesPassed: false` because this
was a focused replay. `combinedCheckpointAcceptance.checkpointAcceptancePassed`
is true for the mechanical measurement/correctness gates, while
`releaseReady: false` and the independent performance-review status remain
explicit. The bundled whitepaper reflects the pre-replay packaging revision;
the separately updated canonical whitepaper carries the later evidence review.

Raw evidence and independent verification records are in
[`raw/github-run-37082520646`](../raw/github-run-37082520646/).
The recovered entrypoint comparison is retained separately in
[`raw/github-recovery-37081834569`](../raw/github-recovery-37081834569/).
The internal bundle is review evidence; clean 8.0 preparation and user approval
remain later stages.
