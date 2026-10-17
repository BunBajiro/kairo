# Current review build

**Build91 is the verified consolidated review download for `0.8.0-rc.17`.** It combines the reviewed application, refreshed user/developer manuals and completed in-source documentation. It supersedes Build90 for the current handover; the [original bug-review evidence](PREMERGE-BUG-REVIEW.md) remains intact. PR #12 stays draft. No merge, stable release or version bump was performed.

[Download Kairo-test-build.zip — Build91](https://github.com/BunBajiro/kairo/actions/runs/39076551873/artifacts/12117353379) · [Successful Actions run](https://github.com/BunBajiro/kairo/actions/runs/39076551873) · [Verification receipt](BUILD91-VERIFICATION.json)

The artifact expires on **16 November 2026 at 23:05 UTC**. Sign into GitHub to download it. Extract the complete ZIP into a new folder, stop any running Kairo instance, then open `Kairo/START_KAIRO.bat`. Node.js 24 or newer is required; no npm install or local build is needed. Follow the [user guide](USER-GUIDE.md) for data locations, backups and normal startup.

## Exact package identity

| Item | Verified value |
| --- | --- |
| Tested source | `99b8b0a19ab4e098cf34dcf051024ef7f97c6041` |
| Git tree | `8839fdf8705fa8dff750687ac95b7a02491f80a5` |
| Version | `0.8.0-rc.17` |
| Actions run / artifact | `39076551873` / `12117353379` |
| ZIP size | 26,852,315 bytes |
| ZIP SHA256 | `1dd74fef9c6061060d03c597eaa6b2a0a047eb5323555613e2c0726d7005970c` |
| Contents checked | 576 tracked source files and 20 compiled/copied client files; 596 files total |

The build-trigger commit has exactly the same tree as completed documentation checkpoint `eec3f3fa0e2674b9ccd63ea0faeb41219c23d6d8`. No application, test, workflow, dependency or version changes were introduced to produce Build91.

## Verification performed

The unchanged hosted workflow passed types, a fresh build, all blocking Chrome/Firefox gates, packaging and all **1,215 packaged-runtime tests**. Its logs record **2,317 regression-browser checks**, all passing, plus the existing market-icon, Session-card, Universe/replay and dataset gates. Those counts describe the existing fixture coverage, not every possible UI flow. The browser versions were Chrome `155.0.8059.39` and Firefox `153.0`; Actions used Node `24.21.0`.

The independently downloaded ZIP matched GitHub's SHA256 and passed CRC and archive-path checks. Every eligible tracked file matched the exact build commit; the refreshed manuals, source comments, phase inventories/receipts and required client assets were present. A fresh extraction without source dependencies passed **1,215/1,215 runtime tests** with zero failures, cancellations or skips, using Node `24.19.0`. The receipt records per-file identities and actual gate results.

Windows/DPAPI under the real login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output behavior and extended play retain their existing limits. No new performance measurement or separate full source-runtime run is claimed. See [Validation](VALIDATION.md) for scope and release rules.

## Documentation and evidence boundaries

Both completed documentation phases are included in the ZIP at its tested source commit. Their ledgers retain the Build90 references that were accurate when those phases finished. **Use this handoff for the current download**, including when an older packaged guide points to Build90.

This acceptance receipt and the current-download pointer updates were written after package verification and live on the review branch; they are not retroactively part of the ZIP. They change handoff metadata only. The completed manual/source verification receipts, closed bug ledger and raw review evidence remain unchanged.
