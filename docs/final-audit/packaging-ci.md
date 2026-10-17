# Packaging, CI and release-path audit

Audit baseline: `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d`, branch `review/0.8.0-rc-premerge-bug-review`, version `0.8.0-rc.17`. Reviewer: `packaging_ci`. This is a workspace audit report, pending banking; the coordinating audit records final independent review and hosted acceptance. It does not authorize publishing or change historical acceptance.

## Scope and method

Read `AGENTS.md`, both GitHub workflows, package/lock metadata, install/build/environment/packaging scripts, Windows launcher and supervisor entrypoint, development/validation/review-build guides, Build91 receipt and third-party notices. Inspected runtime imports and tracked file modes. Reproduced package input behavior in a temporary clean `git archive` fixture with synthetic private-file sentinels; no real profile or credential was used. Prepared bounded packaging/notices corrections and integration regressions after the initial read-only review. No release workflow, version bump, release publication, main mutation or dependency upgrade was performed. Combined install, compilation, browser and packaged-runtime gates are owned by the coordinating audit; those results must be cited separately once available.

## Findings and decisions

| ID | Finding | Impact / required disposition | State |
| --- | --- | --- | --- |
| PCI-1 | `release.yml` rebuilds and publishes on a stable `package.json` change on main or manual dispatch, without browser gates or a machine-checked binding to accepted review source. | This is an explicitly documented process boundary, retained rather than speculatively rewriting the pipeline. Stable preparation must obtain browser/package acceptance on the actual proposed stable source, verify the eventual main tree matches it, and preserve build/input identities. A workflow green result alone is not that approval or exact-candidate acceptance. | Release procedure requirement; unchanged triggers/publication behavior. |
| PCI-2 | The original packager included ignored/untracked local files and followed file symlinks. Its directory walk could silently skip an unreadable generated subtree. | Corrected to require a clean Git checkout, enumerate eligible tracked source plus `dist/client`, reject eligible symlinks and fail closed on directory-read errors before opening the destination. Staged/unstaged/deleted tracked input checks bind source to HEAD. Fresh compilation remains an explicit build gate, not an invented packager freshness guarantee. | Corrected in workspace; real-command failing-before/passing-after controls; banking and combined gates owned by coordinator. |
| PCI-3 | No first-party project license is present; `private:true` prevents npm publication but does not state distribution terms. | Owner policy decision for wider distribution. Do not invent a license or treat it as an application defect. | Decision needed before wider distribution. |
| PCI-4 | Compiled client JS omitted required dependency license text; original manual notices covered source/data vendors but not bundled JS/CSS dependencies. | Enabled Vite's existing license emitter; fresh build generates 85 module-graph entries. Added a version/content-checked supplement for four npm packages lacking license files, two CSS imports and 13 nested Victory/D3 notices. Packaging rejects missing/empty inventory, uncovered entries and stale supplemental versions/text. | Corrected in workspace; fresh build passed, emitted inventory and supplements independently inspected; final package acceptance pending coordinator. |

### PCI-2 reproduction

A temporary checkout was populated using `git archive HEAD`; all required tracked package files were present. A synthetic `dist/client/index.html` fixture was added, plus the three synthetic inputs above. Running the existing `scripts/package-release.py` exited zero and all three input paths were present in the ZIP. The temporary checkout and ZIP were removed automatically. This verifies inclusion behavior only; the fixture was not a runnable build or release candidate.

Before correction, the script documented its broad-input limitation and guides required a clean checkout, but did not enforce it. The correction now enforces committed tracked inputs and isolates generated client files; unknown local source files are excluded without requiring their deletion. ZIP CRC and required-path assertions do not establish source identity, fresh compilation, license completeness or test acceptance. A passing runtime suite can coexist with stale compiled UI, so eventual candidate verification must bind the compiled assets too.

## Verified controls

- Both workflows pin third-party Actions by commit SHA. Checkout disables persisted credentials. The default token permission is `contents: read`; only the separate publishing job grants `contents: write`.
- Test-build compilation and browser failures block packaging/upload. Browser scenarios that use explicit `!cancelled()` continue gathering relevant results after a prior browser failure; the eventual package step retains default success-only behavior. Extracted-runtime failures also block download publication.
- The test workflow isolates Playwright `1.62.1` outside application dependencies and installs Firefox. It uses the runner's Chrome. Engine versions are evidence per run, rather than fixed long-term browser versions. Existing coverage is deliberately enumerated in `VALIDATION.md` and does not represent every page state or live integration.
- The release workflow rejects non-stable versions, inconsistent package/lock versions and missing matching changelog sections. The current prerelease cannot pass its version guard. Its publish commands actually publish a release: they create a draft, then immediately clear draft status and mark it latest. It must not be dispatched as a harmless rehearsal.
- Both workflows now include the source-host Python package-boundary regression before packaging. This requires Git/Python only on the existing build host and does not add either dependency to the standalone runtime.
- Release upload/download is within the same workflow run. SHA256 is recorded after extracted-runtime tests, then checked before publication; `gh release create --target "$GITHUB_SHA"` ties the tag target to that workflow's commit. This ties published ZIP bytes to that build, not to earlier browser acceptance.
- Review ZIPs and browser evidence retain 30-day Actions retention. Build91's receipt records expiry `2026-11-16T23:05:50Z`; permanent Git evidence is distinct from expiring binaries. Intermediate release artifact retention is seven days, while the final release ZIP/checksum is a separate GitHub release asset.
- npm lockfile v3 names 878 packages plus the project. All 872 externally resolved packages use `registry.npmjs.org` and contain integrity digests. The six entries without their own URL/integrity are bundled optional descendants of `@tailwindcss/oxide-wasm32-wasi`; this is not evidence of six unpinned network fetches. Package and lock root versions agree.
- Install is Linux/WSL-specific, bounded and project-locked. Required Bash/flock/GNU-timeout/curl/sha256sum/process-inspection prerequisites and Python packaging dependency are documented. The executable shell file modes are retained in Git.
- npm audit is disabled in `.npmrc` and the project wrapper; no current vulnerability-cleared claim is justified by install/build success. No arbitrary upgrade is proposed. Any later security finding needs actual affected-package/reachability evidence and scoped correction.
- The standalone server imports Node builtins and local files (including vendored seek-bzip), matching the no-runtime-`node_modules` claim. Windows launcher and documented package require Node 24+, perform no npm install or local compile, and use the normal supervisor entrypoint.
- Runtime data is documented outside the application folder; users are directed to stop Kairo and extract upgrades into a fresh directory. Actual Windows launcher/DPAPI, live EVE SSO/scopes, OBS output and extended-play acceptance remain environment-specific, not implied by Linux fixtures.

## Correction evidence

The actual packager is executed against temporary committed checkouts, with synthetic
client assets and synthetic private sentinels; these fixtures are not runnable
application candidates. Baseline input-boundary controls passed 2/9 and failed 7/9;
the initial correction passed 9/9. Missing-notice, incomplete/empty-inventory and
unreadable-subtree regressions separately failed before their corrections. The
final suite passes **16/16** (23.709 seconds) and adds healthy source/asset inclusion, Unicode names, executable modes,
private-file exclusions, reviewed supplement use and explicit stale-version/text
failure controls. [The evidence receipt](packaging-evidence.json) links the retained raw before/fixed logs and file identities.

A fresh `npm run build` with the unchanged locked dependencies completed successfully.
`dist/client/.vite/license.md` contains 85 generated dependency entries (98,132
bytes). Eighty-one include the package's license text; four npm tarballs omit it.
The supplement retains upstream release-tag notices for `@vitejs/plugin-rsc@0.5.26`
and `victory-vendor@37.3.6`; `@radix-ui/react-compose-refs@1.1.2` and
`react-remove-scroll-bar@2.3.8` use identified upstream project LICENSE blobs
retrieved on 18 October 2026, not invented release tags. Exact locked-package
Tailwind/tw-animate CSS licenses and all 13 Victory vendored dependency notices
are also retained. Provenance notes and hashes make those distinctions explicit.

The independent reviewer `docs_tests` checked all six supplemental versions/text
SHA256s, all four upstream Git blob SHA1s, all 13 nested notices and both CSS files
against their sources; the generated inventory's four missing texts all map to
the supplement. Final suite disposition is recorded by the coordinator.

## Build91 provenance boundary

The preserved receipt names source `99b8b0a19ab4e098cf34dcf051024ef7f97c6041`, tree `8839fdf8705fa8dff750687ac95b7a02491f80a5`, run `39076551873`, artifact `12117353379`, ZIP SHA256 `1dd74fef9c6061060d03c597eaa6b2a0a047eb5323555613e2c0726d7005970c`. It records 576 exact tracked source files, 20 compiled/copied client files, CRC/path validation, 1,215 packaged-runtime tests, and all existing blocking browser gates. This report inspected that receipt; it does not claim a fresh independent download or rerun. The coordinator's actual retrieval/verification results own any new confirmation.

Later audit fixes require a new accepted artifact; they cannot retroactively become part of Build91. A final stable version change likewise needs exact-candidate verification and separately approved release actions. The historical receipt, comments-only preservation evidence and prior performance claims retain their original source identities.
