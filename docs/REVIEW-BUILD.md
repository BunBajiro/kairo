# Current verified audit checkpoint

**Build101, version `0.8.0-rc.17`, is verified for review. The comprehensive audit is still in progress and release progression remains paused.** It includes the requested Journey retirement and the CA-001 packaging-test correction. PR #12 remains open/draft; main and the version are unchanged. Continue from the [execution handoff](AUDIT-EXECUTION-HANDOFF.md) and [ledger](AUDIT-LEDGER.md).

[Download Kairo-test-build.zip — Build101](https://github.com/BunBajiro/kairo/actions/runs/40101935977/artifacts/12563930765) · [Successful Actions run](https://github.com/BunBajiro/kairo/actions/runs/40101935977) · [Hosted evidence](audit-p0/build101-hosted.json) · [Independent package verification](audit-p0/build101-package-verification.json)

The artifact expires on **23 November 2026 at 14:41 UTC**. Sign into GitHub to download it. Use **Node.js 24 LTS, at least 24.21.0**. Follow the [fresh-data setup policy](USER-GUIDE.md#start-080-with-fresh-data): stop Kairo, select a fresh data directory, extract the full ZIP into a new folder and open `Kairo/START_KAIRO.bat`. No npm install or local build is needed. The build does not automatically reset old profiles. The [user guide](USER-GUIDE.md) and [persistence policy](PERSISTENCE.md) own startup and data locations.

## Exact package identity

| Item | Verified value |
| --- | --- |
| Executable/test source | `aa2bc453cdc5e6c4f86d0a01aa7a2d6c5c97d0b5` |
| Git tree | `c19bcc3ebad8ef7d87c748bfa3c3481b78ca02e9` |
| Actions run / artifact | `40101935977` / `12563930765` |
| ZIP size | 27,873,895 bytes |
| ZIP SHA256 | `cd8a3e86a7a9de8f3310eca3c41f3002d5977aca346f46f50b095bc98c186b83` |
| Contents | 797 eligible tracked-source files + 21 generated client files; 818 total |

## Verification and limits

All **54 hosted steps** passed: locked install, types, fresh build, **125 focused Journey checks**, **3,181 reported existing regression controls**, 16 packaging controls and **1,354 packaged-runtime tests**. Browser gates used Chrome 155.0.8059.39 and Firefox 153.0, including relevant 1600/390 cases. The hosted receipt distinguishes 3,302 individual Boolean pass rows plus four navigation case summaries from the separate baseline gates; counts are not interchangeable.

The independently downloaded ZIP matched GitHub's digest and all 797 eligible Git blobs/modes. CRC, paths, duplicates, exclusions, generated-asset references, public copies and bundled notices passed. A fresh extraction without source dependencies separately passed **1,354/1,354 runtime tests**, with zero failures/cancellations/skips on explicit installed Node 24.22.1 / Undici 7.30.1. All 818 archived files remained byte/mode-identical with no extras. The package verifier and raw runtime evidence are retained in the linked receipt. A different reviewer inspected the actual hosted/API/archive/evidence; these are bounded checks, not comprehensive audit completion.

[Journey acceptance](audit-p0/journey-retirement-verification.json) retains the original before/fixed and Chrome/Firefox flow proof. [CA-001](audit-p0/package-fixture-verification.json) is closed with its deterministic before/fixed evidence and this full hosted/package result. Earlier failed Build99/100 receipts remain intact; the old lock producer is still unknown. [Build97](BUILD97-VERIFICATION.json) remains the independently verified historical MR/EC checkpoint, together with all 74 closed findings and original performance evidence.

Required logging/Settings Logging, optional error toasts, integrated application toasts and the remaining comprehensive recovery/algorithm work are **not implemented or accepted by this checkpoint**. Source/design P0 contracts are separate. Native Windows/DPAPI, live EVE/OBS, platform PiP and extended-use checks remain outside automated evidence. Run durations are observations, not matched performance acceptance; browser fixtures do not establish blanket usability or cross-tab/restart guarantees.

This page and new evidence were written after the tested source. The ZIP contains its exact source's documentation, including then-pending verification pointers; use this page for current acceptance. No main push, merge, version bump, tag, publication or PR-ready action is authorized.
