# Canonical final-matrix baselines: source recovery prepared

Read-only inspection on 8 October 2026 found no clean, runnable local baseline checkout. No build or test was run. The runbook pins RC16 to `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and its historical same-host anchor to v0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.

| Baseline | Current local source | Canonical verification | Compiled/dependency state |
| --- | --- | --- | --- |
| RC16 | `kairo-rc16-baseline` is absent. `kairo-analysis` and `kairo-analysis-restored` each contain 405 of 407 exact canonical file blobs. | Only `AGENTS.md` and `.github/workflows/test-build.yml` differ; their exact canonical bytes exist in the frozen 227 checkout. Rebuilding the complete manifest tree gives `83635e81965febbcc0b9e36c032d91ab95678469`, exactly the canonical commit's tree. | Old analysis `dist/client` has 20 files, but only 15 match the preserved RC16 build manifest. Its dependency symlink points to the reverted workspace. It is not a verified clean RC16 build. |
| v0.7.3 | `kairo-v073` contains all 195 canonical file blobs, but has no Git binding. | Rebuilding the canonical stable-tree manifest gives `e665ca3810f0ab3f0336643f30a2369be5cc73b1`, exactly the canonical commit's tree. | Old `dist/client` has 18 files; only 13 match the retained exact-source CI manifest. Its dependency symlink also points to the reverted workspace. |

For each old build, two chunk filenames differ and three shared entry/manifest files differ. The remaining matching assets do not establish complete build provenance. Those old directories are preserved and should not be copied as final-matrix compiled acceptance. Fresh locked installation/build and post-build manifests remain required by the runbook.

Canonical commit objects are already present in the restored source ancestry. Their historical tree objects are absent, but the complete file manifests independently reconstruct those exact trees. `PREPARED.json` records every exact local donor, blob SHA, SHA-256, size and mode; the two `.commit` files preserve the canonical commit bytes. No download is required. The analysis checkout is a donor of individually verified bytes, never relabelled as clean RC16.

`recover.py` is prepared, not executed. Without flags it verifies donors only. With `--execute`, it creates two new source-only checkouts, refuses any existing destination, verifies the full Git trees without exemptions, binds the original canonical commits, and requires clean status:

- `/workspace/scratch/a2f3334402fc/kairo-rc16-baseline`
- `/workspace/scratch/a2f3334402fc/kairo-v073-final-baseline`

The new repos use explicit shallow boundaries at the canonical commits; no baseline ancestry claim is needed. No main source/ref, old root or remote is changed. They receive no dependency symlink or old compiled assets. Recovery performs only file copies/Git object construction; coordinate its modest I/O around ordinary timing. It writes `RECOVERY.json` after successful source verification.

Minimum next steps: run the prepared source recovery at the coordinator's boundary; then obtain a runtime slot for locked dependency installs and fresh production builds in both roots. Capture clean source/build manifests after compilation using `analysis/rc17/harness/source-manifest.mjs` and the exact two commit IDs. Keep local and CI build identities separate and use fresh output directories. This preparation is not final-matrix execution or baseline acceptance.
