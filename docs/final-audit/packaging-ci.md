# Packaging, CI and release-path audit

Owner: `packaging_ci`; correction reviewer: `docs_tests`. [Final audit](../FINAL-AUDIT.md) owns banking, exact candidate acceptance and release decisions. This report covers source inspection and synthetic packaging controls, not a new download acceptance.

## Coverage and disposition

| Area | Evidence inspected | Disposition |
| --- | --- | --- |
| Build/install/package path | Both workflows, package/lock, install/build/environment scripts, packager, Windows launcher and standalone imports | FA-02 and FA-10 below. Reviewed locked source build, no-runtime-`node_modules` boundary and source-host versus extracted-runtime prerequisites. |
| CI failure propagation/provenance | Action SHA pins, read-only default token, browser/package/runtime gates, upload/checksum and release target | Browser/runtime failures block downloadable candidates. Exact compiled-source binding still requires fresh build and independent artifact verification. |
| Stable publication | `release.yml` version/changelog guards and triggers | Process boundary: stable package change on main or manual dispatch publishes; it does not repeat browser gates. [Development](../DEVELOPMENT.md#package-and-verify) owns the required exact-stable-candidate procedure. No workflow rehearsal was performed. |
| Dependency locking/notices | Lockfile URLs/integrity, generated inventory, upstream/installed notices | No arbitrary upgrade in this correction. Advisory reachability and current remediation are tracked separately in [Dependencies](dependencies.md). |
| Distribution policy | Project metadata and notices | No first-party license exists. Wider-distribution terms require an owner decision; this audit does not invent one. |

## FA-02: package input boundary

The original directory walk included ignored/untracked files, followed file symlinks outside the checkout and could silently omit an unreadable generated subtree. Temporary fixtures reproduced inclusion with synthetic private sentinels; this is not evidence that Build91 contained private material.

The packager now requires a clean Git checkout, uses eligible tracked source plus generated `dist/client`, and rejects tracked changes, eligible symlinks and directory-read errors before opening the ZIP. Untracked/ignored local files are excluded. Generated inputs require the entrypoint and notice inventory. These boundaries do not prove frontend freshness; the intended source still needs a fresh build.

## FA-10: bundled dependency notices

Vite's existing emitter now produces a client inventory. A version/content-checked supplement covers four packages whose npm tarballs omit license text, the two CSS imports and 13 nested Victory/D3 notices. Packaging rejects missing/empty inventory, uncovered entries and stale supplement versions/text. No first-party license or runtime network request is introduced.

The inspected build produced **85 entries**, 81 with text and four covered by the supplement. Upstream release-tag notices and retrieved project-license blobs are distinguished in the retained provenance; CSS and nested vendor texts match the locked installed packages. Current developer instructions remain in [Third-party notices](../THIRD-PARTY-NOTICES.md).

## Regression and independent-review evidence

The [packaging receipt](packaging-evidence.json) retains exact source/generated-file hashes, all raw before/fixed logs and commands.

| Evidence | Result and scope |
| --- | --- |
| Original input-boundary controls | **2/9 pass, 7/9 fail** against actual packager subprocesses in temporary committed checkouts. |
| Additional negative controls | Missing/empty/incomplete notices and unreadable generated subtree each fail before correction. The unreadable-directory test injects a child filesystem error because host privileges can bypass mode restrictions. |
| Final `python3 tests/package-release.test.py` | **16/16 pass** in one owner invocation. Covers tracked Unicode/executable inputs, ignored sentinels, staged/unstaged changes, source/client file/directory symlinks, absent Git, notices and supplement drift. Synthetic assets are not runnable application candidates. |
| Fresh compilation | `npm run build` succeeds; generated inventory inspected. This is the recorded packaging workspace build, not combined-candidate acceptance. |
| Independent review | `docs_tests` accepted source/harness/workflow changes; independently ran **16/16 across two invocations** and inspected the owner's complete run. Checked six supplemental versions/text hashes, four upstream Git blobs, all 13 nested notices and both CSS licenses. |

The regression is a Git/Python source-host gate in both workflows, separate from the extracted Node runtime suite. Temporary fixtures clean up automatically and subprocess failures remain visible. No dependency is added to the standalone application.

## Limits

[Review build](../REVIEW-BUILD.md) and its receipt own Build91 identity, counts and expiry; reading them did not rerun or redownload that build. Later corrections require fresh exact-artifact acceptance. Current advisory analysis is separate from install/build success. Real Windows launcher/DPAPI, live EVE permissions, actual OBS output and extended play remain environment checks.
