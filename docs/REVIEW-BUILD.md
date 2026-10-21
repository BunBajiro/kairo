# Current verified checkpoint

**Build97 is the verified 0.8.0 checkpoint, version `0.8.0-rc.17`. Release progression is paused.** It includes the completed [Jita recovery and focused edge-case pass](MARKET-RECOVERY.md), together with the earlier final-audit corrections, manuals, source comments and CI gates. It supersedes Build93/94 for current testing. PR #12 remains draft; main and the version are unchanged. The next chat uses the [audit-planning handoff](AUDIT-PLANNING-HANDOFF.md); this checkpoint does not establish release readiness.

[Download Kairo-test-build.zip — Build97](https://github.com/BunBajiro/kairo/actions/runs/39529421954/artifacts/12315426986) · [Successful Actions run](https://github.com/BunBajiro/kairo/actions/runs/39529421954) · [Verification receipt](BUILD97-VERIFICATION.json)

The artifact expires on **20 November 2026 at 02:12 UTC**. Sign into GitHub to download it. Use **Node.js 24 LTS, at least 24.21.0**. Stop Kairo and make a complete profile backup before upgrading; extract the full ZIP into a new folder and open `Kairo/START_KAIRO.bat`. No npm install or local build is needed. The [user guide](USER-GUIDE.md) and [recovery policy](PERSISTENCE.md#production-baseline-and-version-compatibility) own startup, data locations and restore details.

## Exact package identity

| Item | Verified value |
| --- | --- |
| Tested source | `0eece9d7d5f60f0246dbfda89b5cb4f55e576979` |
| Git tree | `3349f0b083bb9df8a88fc99f3f4fb36ade8d3d10` |
| Actions run / artifact | `39529421954` / `12315426986` |
| ZIP size | 27,354,594 bytes |
| ZIP SHA256 | `706b5cd7a32af11b9b9b3164f1ef9444568a7ede77ae034e3d2d0711132378bd` |
| Contents checked | 707 tracked source files and 21 generated client files; 728 total |

## Verification and limits

All **52 hosted steps** passed, including a clean locked install, types, fresh build, **16 packaging controls**, **3,181 regression-browser checks** plus the existing baseline gates, and **1,349 packaged-runtime tests**. Chrome `155.0.8059.39`, Firefox `153.0` and Node `24.22.0` were used. The expanded ownership/recovery gate passed **72 cases / 864 checks** at desktop/narrow widths. All product-failure assertions retained from Builds95/96 now pass; the [independent comparison](market-recovery-evidence/build97-ui-comparison.json) records preserved checks and fixture limits.

The downloaded archive matched GitHub's digest, passed CRC/path checks and matched every eligible tracked source file. Client assets, executable modes and bundled notices were verified. A fresh extraction without source dependencies independently passed **1,349/1,349 runtime tests** on Node `24.22.0 / Undici 7.29.1`, with no failures, cancellations or skips. All 728 extracted files remained byte-identical afterward. The receipt binds the detailed evidence.

Real Windows/DPAPI under the actual login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output and extended play remain environment checks. Browser ownership probes do not certify cross-tab/restart ordering, native platform PiP or unrestricted narrow-screen usability. Existing performance evidence retains its original scope; these gates do not establish new elapsed-performance measurements. See [Validation](VALIDATION.md).

This page, verification receipt and planning handoff were written after the tested build. The ZIP contains documentation at its exact source commit, including then-pending verification pointers; use this page for current acceptance. Historical receipts and raw evidence remain intact.

The future audit must precede renewed release progression. Bun's final approval must also cover the durable-data policy and 0.7.3→0.8.0 upgrade/full stopped-profile recovery boundary. No main push, merge, version bump, tag or publication has been performed. Stable version/lock/changelog preparation requires approval and verification on the review branch; merging a stable package version can trigger automatic publication.
