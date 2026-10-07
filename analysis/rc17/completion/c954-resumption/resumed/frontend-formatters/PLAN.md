# F7 UI formatter measured disposition — prepared, not executed

This preparation record is superseded by the completed [measured decision](RESULTS.md). The harnesses and raw first-run outputs are retained unchanged.

Use the unchanged `completion/frontend-models/formatter-cost.mjs` timing worker. It imports the actual `components/kairo/model.ts` exports in fresh Node processes, records import, first three valid calls (decimal, compact, UTC stamp), and five 30,000-call warm windows. Report import plus first use as well as each component; retain warm round zero. This is an isolated UI formatter measurement under Node 24, not Chromium frame time or total app startup.

Baseline: existing `kairo-frontend-ablation`, pinned by `frontend-models/ablation-source.json` (c954 plus eight declared a27 UI files; fingerprint `615799709626ba337ca36b82c9b084875912a9598167e7b6cace4018c6bfe150`). The imported runtime closure differs only in the formatter implementation: baseline `model.ts` constructs Intl per number cell and calls Date locale formatting per date cell; candidate reexports lazy shared formatters. `workspace-navigation.mjs` is identical. The other seven ablated UI files are not imported by this worker.

Candidate: clean `kairo-rc17-c954-continuation` at `f01072674c044f39badc5e5e56c0c3d676621c07`. Candidate `model.ts`, `formatters.mjs` and navigation bytes must equal c954 at run start. Capture a new exact current commit/source/build manifest; do not label the preceding dirty 9331 build manifest as clean f010. Existing tests/types/fresh build cover the identical source tree, but the formatter lane does not execute compiled browser assets.

The original worker checks all three first outputs and warm output-character totals. That does **not** prove each warm value equal. The separate `semantics.mjs` therefore compares both actual exports on all 30,000 representative outputs and explicit non-number, signed-zero, nonfinite, invalid/empty date, UTC/DST boundary cases, retaining a semantic digest. It runs outside timings and does not warm any later fresh timing process. Source and harness verification occurs before/after. No benchmark instrumentation changes application source.

After the coordinator grants the runtime slot, run from the analysis repository:

```sh
flock /tmp/kairo-performance.lock env KAIRO_MODELS_LOCKED=1 node analysis/rc17/completion/c954-resumption/resumed/frontend-formatters/run.mjs /workspace/scratch/a2f3334402fc/kairo-frontend-ablation /workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation analysis/rc17/completion/c954-resumption/resumed/frontend-formatters/run1
```

The runner verifies imported closure differences and c954 byte identity, executes untimed semantics, then **three ABBA cycles / six fresh processes per variant** using the unchanged old timing worker. Failures retain progress, child stdout/stderr and partial files; only a fully verified run writes `completed.json` and `comparison.json`. Expected runtime is about 40 seconds from the prior baseline worker's ~5.5 seconds per five warm windows, plus verification/semantics. The complete run must hold the common lock; root must not edit the candidate meanwhile.

Report descriptive six-process medians/ranges and raw samples for import, cold-three and cumulative import+first-use. Summarize warm work first by each process's five-window median, then across processes; do not treat thirty same-process windows as thirty independent fresh processes. Keep all adverse first-use observations. Retain F7 only if exact semantics pass and the measured setup/steady-state tradeoff supports it; otherwise state the measured rejection/change needed. Do not infer browser responsiveness from these measurements.
