# Build 66 package audit restored after workspace reset

**The offline package audit passes.** This recreates the inventories lost during the workspace reset from the exact original Actions ZIP, committed source objects and already banked evidence. It does not rerun Kairo, its browser checks, performance measurements, build or packaging. The earlier `RECOVERY-RECEIPT.json` remains untouched and explicitly historical; this report and `AUDIT.json` are new offline audit records.

[Build 66](https://github.com/BunBajiro/kairo/actions/runs/38177333462), attempt 1, job 114582374795 succeeded on source `0149e86638aa7bef279f24a6425504345ae1179f`, tree `a4086b74114af46420eefbb96aef32086392cf37`. Its [actual tested ZIP](https://github.com/BunBajiro/kairo/actions/runs/38177333462/artifacts/11717150334) was downloaded again without rebuilding: **25,938,696 bytes**, SHA-256 **`7024711ed49dafa21ec0b89ed90d01ad45748528066fb653d83b4147a141b2f0`**. The download matches the retained API and upload-log digest. CRC and safe extraction checks pass. Because the workflow uploads with `archive: false`, this is the tested ZIP itself, without another ZIP wrapper.

| Offline check | Verified result |
|---|---|
| Package membership | 504 files: 484 exact tracked source files and 20 compiled assets |
| Source contents | Every nongenerated member matches its exact 0149 Git blob |
| Required paths | All 54 paths from the exact committed packaging script exist |
| Exclusions | Both workflows are excluded; no analysis, dependencies or local runtime data is packaged |
| Version | `0.8.0-rc.17` |
| Documentation | All 115 relative links resolve inside the extracted package, including checked Markdown anchors |
| Source continuity | All 486 tracked files and modes checked; only the four declared documentation files differ from measured source 70 |
| Compiled assets | All 20 paths and lengths match the measured manifest; 18 assets are byte-identical |

The measured manifest was recovered from the existing `first-assets-attribution/RAW-MANIFEST.json` archive, verifying both chunk hashes, the joined archive hash and the selected original member's hash. All 486 measured source entries were checked against source 70 Git blobs. The two changed compiled files, `dist/client/index.html` and `index.rsc`, contain exactly one build UUID substitution each: `f49971b7-37a6-47e4-ab89-fca37908ca4b` → `92908a4f-e51f-4956-9480-c3634c02e9e8`. Reversing that one substitution reproduces each measured SHA-256 exactly. No arbitrary generated content is ignored, and the complete ZIP is not claimed byte-identical to the measured build.

The retained actual workflow and job log show packaging, extraction, `npm run test:kairo` from the extracted `Kairo` directory, then upload of the same ZIP. **1004 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo** in 24,344.383857 ms. Types, build and all three normal browser checks passed before packaging: seven Session layout cases/nine cards, 84 Universe check entries and 15 dataset/reconnect checks. The normal workflow resolved **Node 24.21.0/npm 11.19.0**; separate performance measurements used pinned Node 24.19.0. These are retained CI results, not newly executed tests.

The three supporting browser ZIPs were not downloaded again. Their previous verified identities remain in the historical receipt and API/log records. No new visual-inspection claim is made. This package audit does not independently decide other acceptance gates, human review, merge approval or stable release readiness.

The new files are `audit.py`, `AUDIT.json`, `PACKAGE-MEMBERS.json`, `SOURCE-MEMBERS.json`, `COMPILED-MEMBERS.json` and `DOCUMENT-LINKS.json`. The script is an offline verifier; run it against the exact downloaded ZIP with source 0149 and source 70 available as Git objects:

```sh
python3 analysis/rc17/completion/c954-resumption/resumed/oct11/release-preparation/package-build66/audit.py --zip /path/to/Kairo-test-build.zip --extract /tmp/kairo-build66-check
```

The restored ZIP is `/tmp/kairo-package-build66-restored/Kairo-test-build.zip`; the verified extraction is `/tmp/kairo-package-build66-restored/extracted/Kairo`. GitHub metadata gives the artifact an expiry of 2026-11-10; preserve the exact archive if it is needed beyond that date.
