# Corrected independent UI evidence — passing

Audited 2026-10-13. This closes the independent UI acceptance gate for the unchanged measured source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. It does not by itself authorize a release or change PR status.

## Exact run and artifact

- Run [38179056807](https://github.com/BunBajiro/kairo/actions/runs/38179056807), attempt 1, completed **success**.
- Trigger/harness commit: `f89d5b625b51fbf4645448ef475fc267cb5f5599`.
- Measured source tree: `35826c9d50c45702ff103e1f173e05c529ba2d9c`.
- Artifact `11716889264`, `internal-rc17-completion-ui-38179056807-1`: **580,824 bytes**.
- Original ZIP SHA-256: `eff12a1216b60d3c8b0f814185095b7c69a32838b076e9a4a51e5c2fc8228512`.

The GitHub connector supplied fresh run/jobs/artifact metadata, the complete decoded job log, and the original artifact ZIP. The downloaded ZIP size and SHA-256 agree with the API and upload log. ZIP CRC verification passed. Its 38 extracted members match the ZIP byte for byte; all 37 non-self evidence bindings and every nested lane inventory validate. The original ZIP is retained unchanged.

## Provenance and final guards

The reproducible audit compares all **486 measured source files** against `git show 70cd12f9…:<path>`, including exact file-set equality, byte counts and SHA-256. All **215 harness/workflow bindings** match the trigger commit and its complete applicable file set. This includes the request, workflow, owner, workers and helpers.

The manifest records clean source and 20 compiled assets. Its independently recomputed source/build fingerprint is `75e079f4e5725920bc1526915a3793ab26189cb2a3d4d757eee0bdd91685b419`. The build receipt agrees with the source tree, lockfile and retained build log. Studio's copied manifest/build receipt and helper pins agree; all individual replay source pins and seven observed browser asset hashes per replay case agree. Raw UI evidence contains compiled hashes rather than the compiled asset bytes themselves.

Locked installation, type checking, build and all **1,004 runtime tests** succeeded, with zero failed, skipped or cancelled tests. The run used Node `v24.19.0` and Chrome `154.0.8037.97`. All required completion steps and final source/build and harness guards passed. Each lane records before/after source verification; timestamps establish sequential execution.

## Acceptance results

| Lane | Result | Retained evidence |
| --- | --- | --- |
| Dashboard refresh / Session archive | Pass | 21/21 checks |
| Administrative polling | Pass | 18/18 checks |
| Frontend row models | Pass | 17/17 checks; 10,000-row fixture |
| Studio / browser source | Pass | 10/10 checks; compiled-source and cleanup guards |
| Replay repeat-small | Pass | 12 measured cycles; 200 events; 11 unique systems |
| Replay repeat-cap | Pass | 12 measured cycles; 10,000 events; 11 unique systems |
| Replay distinct-cap | Pass | 12 measured cycles; 10,000 events; 1,000 unique systems |

All seven owner receipts record complete/resultValidated, exit 0, no timeout/failure, source guards and processGroupCleaned. UI workers report empty errors/external lists. Replay cases are full runs (`smoke:false`), with the preparation, start-playback and middle-playback samples, one successful EventSource each, and zero successful external responses, renderer exceptions or denied backend-fetch attempts.

Across replay cases, all **45 ownership rows** have zero stale Universe requests. All **42 pilot-fence records** have no previous replay visible or wrong-owner requests. All **15 quiescent Overview snapshots** show zero canvas/map/replay surfaces, three explicit GC passes after 2,000 ms of quiescence, and stable global listener signatures. Each case retained both warmup checkpoints and the 4/8/12 measured-cycle checkpoints.

The two retained Studio screenshots were inspected: Studio is mounted with its populated synthetic broadcast layout, and the disconnected source image shows disconnected bindings with the retained protection cover. Behavioral conclusions rely on the recorded assertions and guards.

## Narrow Wallet repair

The corrected worker SHA-256 is `11ae8708bd605d8af052bab9103249fa0d98eca63e9f37b7e069eebe1b0de2ed`; the unchanged owner is `27f05929f03ec6b17d9632c561420b0a802578518db93169d046ed0f0a134378`.

An independent static review confirmed that only the Wallet assertion on worker line 47 changes from the prior version. Fixture, workload, waits, response holds, other checks and cleanup are unchanged. The predicate requires exactly one Wallet balance card and exact equality to browser formatting of 9999 with the production `en-GB`, compact, maximum-two-decimal policy plus `ISK`.

Actual run evidence is **one matching card; actual `10kISK`; expected `10kISK`**. The late-state assertion and all subsequent archive, pilot-switch, reconnect and roster-removal checks passed. The archived 44 predicate controls remain passing: they cover stale 4200/4300, unrelated matches, missing/duplicate cards, missing/empty content, missing label and wrong currency, including demonstrations of the prior predicate's false acceptance/rejection. These controls were reviewed, not rerun.

This predicate checks displayed value rather than independently proving pilot identity; compact formatting can merge nearby values. The held stale fixture values 4200/4300 cannot equal the expected 9999 display.

## Preserved failures and scope

Fresh read-only API metadata confirms original run **38176822076** and recovery1 run **38177282671** remain completed **failure**, both attempt 1. Their previously banked evidence is unchanged. The corrected successful run is a separate attempt with a reviewed assertion repair; the failed runs are not promoted to passing.

This is synthetic compiled UI correctness and single-candidate replay/retention evidence. It makes no matched performance-improvement, desktop GPU/FPS, natural-GC or RSS leak claim. Worker close events, exit codes, finalizers and process-group signaling support bounded completion; processGroupCleaned is not an independent post-exit process census. No remote census was retained. Studio additionally records cleanupVerified.

The raw workflow's `reviewReady:false` and PR #10 withdrawn statements are preserved historical policy notes. Release closure requires the other gates and the coordinator's decision. This audit made no source, ledger, harness, workflow, request, commit, ref, dispatch or rerun changes.

## Reproduce and restore

`audit.py` uses Python's standard library and Git, performs only evidence and Git-object reads, and writes its own `RESULTS-AUDIT.json` and `EVIDENCE-INVENTORY.json`. It requires exact source70 and trigger objects. From this directory with `raw/` present:

```sh
python3 audit.py --repo /path/to/kairo
```

Result: **PASS; 1,021 evidence/provenance/acceptance checks**. These are offline assertions, not repeated application workloads.

The durable bank contains the original ZIP, script, review, JSON inventories/receipts, API metadata and decoded job log. Extract the bank with `analysis/rc17/completion/c954-resumption/resumed/oct8/restore-evidence.py`. Before running the audit from a restored bank:

```sh
python3 -m zipfile -e original-artifact.zip raw
python3 audit.py --repo /path/to/kairo
```

`bank/RAW-MANIFEST.json` binds every banked file and chunk. The original ZIP contains all raw members, so the bank does not duplicate extracted raw evidence.

