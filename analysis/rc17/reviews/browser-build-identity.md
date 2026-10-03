# Browser build identity review

The focused GitHub browser run `37080679048` completed the same 17 Mapper
assertions and Chrome cleanup successfully. It rebuilt the application, however,
so it is not an exact compiled-artifact replay of the measured runtime from
`37078241973`. The combined acceptance guard correctly rejected the differing
compiled fingerprints. Keep that rejection and both original manifests intact.

The recommended way to close the checkpoint is to run the corrected external
17-check harness against the **original verified runtime and compiled assets**,
using disposable data and a fresh browser profile. Verify all original source
and compiled hashes before and after that replay. Do not rebuild, normalize or
rewrite those assets. The focused GitHub run remains additional evidence that
the cleanup correction works on a rebuild of the same source.

## Findings

Independent comparison of the two GitHub runs' source manifests found:

| Role | Source entries | Compiled entries | Exact compiled matches | Differing entries |
|---|---:|---:|---:|---|
| Candidate `05d0d4b36c154329006d6772769063db874762da` | 439, all exact | 20 | 18 | `dist/client/index.html`, `dist/client/index.rsc` |
| RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | 407, all exact | 20 | 18 | `dist/client/index.html`, `dist/client/index.rsc` |

Both runs have the same source identities and full compiled path sets. Each
differing HTML file is 41,744 bytes; each differing RSC file is 2,845 bytes.
Matching size and matching remaining files are insufficient to prove what
changed in the focused entrypoints. Focused artifact bytes must be retrieved
and checked against their recorded hashes before making that narrower claim.

The original verified candidate runtime is available at
`/workspace/scratch/a2f3334402fc/rc17-internal-bundle-37078241973/internal-rc17/runtime`.
A separate read-only byte comparison against the existing local candidate build
proved that their two entrypoints differ only in the value of one
`deploymentVersion` UUID per file:

| Build | UUID in both entrypoints |
|---|---|
| Original measured candidate artifact | `16a653b0-f361-4d25-b6b7-38e4c0c513fb` |
| Existing local candidate build | `b8a13f7e-a458-4c77-b4e5-3977f412f261` |

The UUID value begins at byte offset 41,196 in HTML and 2,606 in RSC. Each is a
valid version-4 UUID, occurs exactly once per file, and is consistent across
both entrypoints in that build. All bytes outside those value spans compare
equal. Replacing only that span in memory with
`<generated-deployment-version>` produces these identical diagnostic hashes:

| Entrypoint | Diagnostic normalized SHA-256 |
|---|---|
| HTML | `c57c4f6049cee29996e271b6bca87d5252dda6da03f084bbaee1d389196a7fb4` |
| RSC | `a8ea1407b146efb478fc1919c36a3ae93c397d35f00ff89f4b35f9ce8d1b1a7f` |

No files were modified by this comparison. It explains local rebuild
non-reproducibility; it is not proof about the focused CI entrypoint bytes and
does not replace their raw hashes or the exact compiled-identity guard.

## Build ID generation and meaning

The candidate pins `vinext` version `0.0.50` in `package.json`. Its
`next.config.ts` configures static export and does not supply `generateBuildId`.
Read-only inspection of that installed dependency established this chain:

- `node_modules/vinext/dist/config/next-config.js`: `safeUUID()` at lines 151–155
  calls `randomUUID()`; `resolveBuildId()` at lines 163–170 uses it when no custom
  generator is provided. Configuration resolution calls it at line 294.
- `node_modules/vinext/dist/index.js`, line 487: the generated build ID becomes
  the compile-time definition `process.env.__VINEXT_BUILD_ID`.
- `node_modules/vinext/dist/server/app-page-render.js`, line 46: the artifact
  compatibility envelope sets `deploymentVersion` from `__VINEXT_BUILD_ID`.
- `node_modules/vinext/dist/server/artifact-compatibility.js`, lines 71–72:
  `evaluateArtifactCompatibility()` compares the deployment versions and
  returns incompatibility for a mismatch.

The value is therefore generated version-skew metadata with operational
meaning. It is not safe to label it globally irrelevant. A fresh-profile Maps
check of a rebuild does not, by itself, prove cross-deployment cache or artifact
compatibility with the original build.

## Acceptance options

**Preferred: exact-artifact replay.** Verify the original artifact digest and
its full source/compiled inventory, run the corrected harness against that
runtime without rebuilding, then verify that exact inventory again. Record
which 17 checks ran, the result hash, original artifact identity, harness hash,
browser exit and cleanup outcome. Keep the original full workflow's failure
and the focused workflow's conclusions unchanged. A new combined checkpoint
record can reference their valid evidence and the successful exact replay;
it must not describe a focused suite as a fresh full timing run.

**Alternative: explicitly proven generated-ID equivalence.** Only consider this
after obtaining and digest-verifying both sides' entrypoint bytes. Require the
same full file sets, exact source files and remaining compiled assets, exactly
one expected deploymentVersion UUID value per allowed entrypoint, consistency
between HTML/RSC in each build, and byte equality everywhere outside those
precise spans. Retain raw hashes, IDs, offsets and a separately labelled
equivalence result. Do not remove arbitrary UUIDs, ignore entrypoints or replace
the source-manifest guard with normalization. This proves narrowly bounded
build equivalence for the tested fresh-profile behavior, not exact identity or
cross-deployment compatibility.

This review recommends the first option because the verified original runtime
is already available and the bounded replay is inexpensive. No production
changes, artifact rewriting or weakened manifest checks are needed.
