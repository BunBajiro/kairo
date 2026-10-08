# Current F6 status after short controls

Controls2 completed both naming baseline and retained-reference control; runtime was released at 2026-10-08T10:49:14Z. Controls1's selector collision is preserved. Both naming Escape/Close leave BODY focused; the combined scoped focus patch 32c908a8 now includes an independent naming owner and is awaiting M9 reviewer recheck. Memo patch was mechanically rebased to this common focus baseline (719fc58d), with no new memo logic. No application source integration or candidate build has occurred.

Deleting the held diagnostic opener in the same unmounted page reduces DOM nodes 32115→582 and collected heap 9.244→5.347MiB; a 30-card remount/unmount returns to 589 nodes. This explains the prior retention confound, not a universal leak claim. RESULTS and controls-bank-inventory.json hold the source-bound details. Next request is the isolated combined focus semantics/type/freshbuild/full compiled gate; memo ordinary runtime must wait until that passes.

The previous preparation handoff follows; entries saying short controls are unrun are superseded by this paragraph.

# F6 handoff after baseline cardinality

No runtime is held. Attempt4 completed at 2026-10-08T10:21:09Z and all three child processes exited/cleaned up. Root was notified of release. Runtime queue then had admin ordinary/native recovery, M6 and finally this lane. Do not start another run until root grants it. No application source or remote ref was changed by this F6 lane.

Frozen baseline: `/workspace/scratch/a2f3334402fc/kairo-archive-227-frozen`, exact 22773cc7cb6e83ac51e412565ba65c101613536a; source/build fingerprint 2c72fd451304d300e05a57d9b4eecc8bd906233c65c9478ad353e4578a474872. Attempt4 source manifest is available in `attempt4/source.json`. Root current source advanced by docs only from a7 to de3 during preparation; Session paths were a7-equivalent. Focus proposal is explicitly based on a7b1bf97b0073695926c443e52d523638e59e48d.

Attempt1 Find limitation, attempt2 incomplete CDP Enter and attempt3 actual BODY focus-return failure are preserved with exact workers/runners/raw logs. FAILURE-RECEIPTS.json verifies their inputs and post-failure source; no failed run is accepted. `failed-attempt-bank-inventory.json` covers 27 files/426947 bytes. Force-add .log files when banking.

Attempt4 has 225 passed hard checks and 18 explicitly false known focus observations across three processes. RESULTS.md and attempt4/summary.json preserve material 1,500-card costs and the retained-DOM confound. attempt4-bank-inventory.json covers 14 files/597186 bytes, including exact worker/runner/summarizer. Ordinary timings are valid baseline diagnostics; no release or contract acceptance. The diagnostic opener reference persists across unmount, so its DOM retention counts cannot support an application leak/retention conclusion.

Prepared, unrun work:

- `focus-candidate/focus-restoration.patch`: scoped two-file report opener fix with mounted/pilot/identity/connected/enabled guards. Main and frozen roots untouched. Independent M9-agent review found no source blocker.
- `focus-browser.mjs`: source-bound compiled closure fixture. It has fresh trusted click history per opening, independent cleanup attempts, original-row labels checked exactly, 270-event publication retention, Escape/Close, Live/End, navigation and roster teardown. An active browser clock/publication control verifies 0→1→0 minutes. Naming Escape/Close is an explicit adjacent observation, not invented acceptance. Optional fourth CLI argument `naming-baseline` runs only those controls on frozen 227 (~3s), allowing observed naming behavior before one combined focus build. Default is `full`.
- `retention-control.mjs`: one short frozen 227 control, retain then delete `window.__reportOpener` after unmount, then 30-card remount/unmount. No ordinary comparison rerun. CLI is app-root, output.json, saved source manifest.
- `memo-candidate/archive-card-memo.patch`: relative to common focus patch. Complete primitive card display props; pilot-scoped stable callback; same native DOM. Parent still recomputes active minutes on every render. Independent static review found no blocker. If focus patch changes for naming, regenerate this relative patch/manifest.
- `browser-cardinality-memo.mjs` and `run-memo-pairs.mjs`: exact a7+focus roots differing only intelligence.tsx; requires all hard focus/history/data gates and compares full card presentation digests/DOM geometry. Clears diagnostic opener before GC in both arms. Runner args baseline-root candidate-root new-output-dir pairs (1 or 3). Caller must hold shared lock and set KAIRO_ARCHIVE_LOCKED=1. Single screening pair is ~105s; three matched pairs ~5min. Alternates pair order. `summarize-memo.py` preserves per-process matched ratios. No adoption merely from completion.

Next source/runtime work, after grant: establish naming controls on frozen 227 if root agrees; apply scoped fix in isolated a7 roots; relevant session semantics, typecheck and fresh production build; full focused compiled gate and retained-reference control. Then smallest matched memo screen before deciding whether larger comparison is warranted. No broad virtualization has been authorized; memo cannot be assumed to fix every browser/scroll cost from full DOM.

Cross-review completed: M9 lazy-input prototype had an uncaught optional key-seeding contention path. Author corrected BUSY/LOCKED-only seed fallback, no-generation fill suppression, and added writer/stale-snapshot tests. Refreshed patch 85b33d1deaf3a21214d0d38b4457cc64a2b55bc6b415670ad98f4ca10305ca9a rechecked against all four candidate hashes. Static blocker resolved; no M9 runtime by this lane. Receipt: `../oct8/reviews/m9-lazy-static-f6-review.md`.
