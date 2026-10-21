# Current review build

**Build93 is the last verified 0.8.0 review candidate, version `0.8.0-rc.17`.** The [market scan recovery follow-up](MARKET-RECOVERY.md) is in progress and is not included in this ZIP. It includes the completed final audit corrections, user/developer documentation, source comments and CI gates. It supersedes Build91. [The audit ledger](FINAL-AUDIT.md) records findings and remaining human decisions; PR #12 stays draft. Main and the version are unchanged.

[Download Kairo-test-build.zip — Build93](https://github.com/BunBajiro/kairo/actions/runs/39081321026/artifacts/12119109062) · [Successful Actions run](https://github.com/BunBajiro/kairo/actions/runs/39081321026) · [Verification receipt](BUILD93-VERIFICATION.json)

The artifact expires on **17 November 2026 at 00:23 UTC**. Sign into GitHub to download it. Use current **Node.js 24 LTS, at least 24.21.0**. Stop Kairo and make a complete profile backup before upgrading; extract the full ZIP into a new folder and open `Kairo/START_KAIRO.bat`. No npm install or local build is needed. The [user guide](USER-GUIDE.md) and [recovery policy](PERSISTENCE.md#production-baseline-and-version-compatibility) own startup, data locations and restore details.

## Exact package identity

| Item | Verified value |
| --- | --- |
| Tested source | `763960b5a764f6791fa1de410ebaa1f8360ddfa3` |
| Git tree | `adab42709ffb6def3bebbc27cfde8918fd38b946` |
| Version | `0.8.0-rc.17` |
| Actions run / artifact | `39081321026` / `12119109062` |
| ZIP size | 27,062,081 bytes |
| ZIP SHA256 | `f4e24f56591712ab59989524fb81abe2916d90cf0c755abebdaa81d5fa59681c` |
| Contents checked | 635 tracked source files and 21 generated client files; 656 total |

## Verification and limits

Hosted acceptance passed a clean locked install, types, fresh build, **16 packaging controls**, **2,713 regression-browser checks** plus existing baseline gates, and **1,246 packaged-runtime tests**. Chrome `155.0.8059.39`, Firefox `153.0` and Node `24.22.0` were used. The added final-audit gate passed all 28 cases / 396 checks, including all 60 previously failing checks and all 236 healthy baseline controls.

The independently downloaded archive matched GitHub’s digest, passed CRC/path checks and matched every eligible tracked source file. Client assets, copied public files, executable ZIP modes and bundled notices were verified. A fresh extraction without source dependencies independently passed **1,246/1,246 runtime tests** on official Node `24.22.0 / Undici 7.29.1`, with no failures, cancellations or skips. The receipt records raw evidence, per-file identities and a separately excluded unsupported-host attempt.

Real Windows/DPAPI under the actual login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output and extended play remain human environment checks. Browser ownership probes do not certify native platform PiP or unrestricted narrow-screen usability. Existing performance evidence retains its original scope. See [Validation](VALIDATION.md) for release rules.

## Handoff boundary

This receipt and current-download updates were written after verification; the ZIP contains the manuals and comments at its exact tested source. Use this page for current acceptance even where an older packaged handoff says Build91 or “pending.” Earlier completed documentation/bug ledgers and raw evidence remain intact.

Bun’s final approval must include the proposed durable-data preservation and tested 0.7.3→0.8.0 upgrade/full stopped-profile recovery boundary. No merge, main push, version bump, tag or publication has been performed. Later stable version/lock/changelog preparation requires approval and verification on the review branch; merging a stable `package.json` change can trigger automatic publication.
