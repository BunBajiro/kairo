# Frontend completion checkpoint — 7 October 2026

Internal work only. No RC17 release/PR promotion.

Completed in this lane:

- Admin original compiled virtual-clock acceptance: 18 checks, c954 source fingerprint 472afe35…, `../admin-polling/browser-run1.json`. Later native timing found a real timer receiver defect, so this pass is insufficient for F5 closure. Original harness is retained as `browser-run1-harness.mjs` in that directory.
- Models compiled diagnostic: `browser-run3.json`, 17 checks with 10k rows/two pilots, same c954 fingerprint. Runs 1 and 2 were harness quoting/DOM-serialization failures and retain their exact harnesses/results.
- Studio renderer recovered run4: 10 checks, c954, complete/source/build/cleanup verified. Documentation now reports it accurately.
- Separate forced-GC heap ABBA: `heap-run1` complete. Initial active Assets retained heap +0.81 MiB, post-search +0.36 MiB; several later states lower. Its timing fields are invalid for performance comparison by design.
- Legacy UI ablation: `/workspace/scratch/a2f3334402fc/kairo-frontend-ablation`, c954 + eight files restored from a27. Exact `legacy-ui-ablation.patch`, `ablation-source.json`, build log and receipt retained. Clean frozen c954 candidate `/workspace/scratch/a2f3334402fc/kairo-frontend-c954` has byte-identical compiled output and fingerprint 472afe35…; `frozen-candidate-source.json`.
- `abba-run1` failed on the first candidate's native Studio/admin/source worker with four real `Illegal invocation` exceptions. Partial observations are retained, not acceptance. Native default timer helper calls Window timers with a plain-object receiver; Node and original virtual clock masked it.
- Minimal correction `../admin-polling/native-timer-fix.patch` touches helper + receiver-sensitive regression. Isolated checkout `/workspace/scratch/a2f3334402fc/kairo-frontend-native-fix` (c954 + patch). Root notified to integrate. Admin virtual-clock harness now validates native receiver semantics.

Queued behind the common `/tmp/kairo-performance.lock`:

1. Session 93271: 16 targeted tests and build in native-fix checkout, output `../admin-polling/native-timer-fix-build.log`.
2. Session 33051: `context-profile.mjs` on frozen c954, output `context-profile-run1.json` plus `.cpuprofile`; profiles 30 real full-name-map wallet events. Initial partial timing showed ~32–48 ms residual tasks on unrelated snapshots; do not dismiss broad Context until attribution is reviewed. Core really sends full names on snapshot events; Dashboard copies/recursively compares all names on every event, a plausible common cost.

After these finish:

- Capture native-fix source manifest and successful build receipt. Run receiver-validating admin compiled acceptance against the fixed checkout.
- Run `run-abba-v2.mjs BASELINE_ROOT FIXED_CANDIDATE_ROOT OUTPUT_DIR FIXED_MANIFEST` with `KAIRO_MODELS_LOCKED=1`, Chrome `/tmp/kairo-chrome-runtime/chromium`, through the shared lock. It executes fresh models/formatter/native Studio-admin-source workers in ABBA order (~4 minutes). `summarize.mjs OUTPUT_DIR` requires full completion before comparison.
- Review profile attribution to decide additional context/name ownership change or a measured rejection; document exact limits. Never label whole Context subscription separation as implemented.
- Update lane records with honest corrected source identities/results, send root any further runtime patch, and bank evidence. Root owns all commits/pushes and top-level ledger; do not mutate shared runtime or ledger from this lane.

Queued jobs are intentional; a long G9 idle diagnostic currently owns the whole-run lock. Do not bypass the lock or mutate its evidence.

## Later coordination

Root pushed source `508f2d` including native timer fix and Atlas/enrichment work, and an analysis checkpoint; independent GitHub source tests/build advance separately. G9 completed all six children/end verification; G8 causal crossover now holds the local lock, with native-fix build next and the context profile several slots later.

Recover-workspace owns backend full-name encoding/byte counts and hidden binding evaluation. We agreed this lane owns a narrow unchanged-name merge trial, preserving wire protocol and reconnect ownership. Isolated `/workspace/scratch/a2f3334402fc/kairo-frontend-names-trial` is c954 + timer fix + `name-merge-trial.patch`. `NAME-MERGE-TRIAL.md` describes it. Corrected test/type/build command is queued as session 45475, log `name-merge-trial-build2.log`; an earlier queued command used non-existent `npm run types` and its failure must remain visible. Adoption awaits actual profile and paired uninstrumented compiled measurements. Do not apply this name patch to shared runtime until evidence supports it.

Root assigned F6 loaded Session archive DOM cardinality to updater_completion; it is explicitly separate from this lane's DataTable/model work.
