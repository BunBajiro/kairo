# Final updater local envelope

Prepared 11 October 2026; not executed. Candidate is unchanged source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, using its fresh verified build. This preparation imports the independently inspected `../final-matrix-public-resume/envelope.py`; it does not edit that helper or the original matrix.

After independent review and the coordinator's explicit runtime grant, with every other build, diagnostic and timed workload parked:

```sh
cd /workspace/scratch/a2f3334402fc/kairo-analysis-restored
KAIRO_FINAL_UPDATER_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/updater-final-public-resume/run.py
```

The output must not exist: `/tmp/kairo-updater-final-20261011/attempt1`. Partial or failed evidence remains there; no overwrite/resume or shortened replacement windows are permitted. Expected runtime is at least six minutes plus fixture setup, conversion completion and shutdown; allow roughly 8–15 minutes. The 30-minute outer loaded-owner deadline changes no measurement window.

## Exact original workloads

The coordinator calls unchanged `inventory-run.mjs` with the new `inventory.json` path, then unchanged `loaded-run.mjs` with the new `loaded/` path. It preserves:

- All 25 inventory activations in one warm Node process, including the original first-service initialization sample.
- Six default 60-second loaded windows, in original control1/conversion1/conversion2/control2/control3/conversion3 order.
- The real SDE builder and Worker, supervisor replacement, HTTP/SSE traffic, cookie/CSRF continuity, scheduler activity and output-manifest validation.
- Original fixtures, request schedules, install-at-five-seconds behavior, assertions, sampling and source guards. No window/order overrides or smoke mode are passed.

The official archive remains `/tmp/kairo-updater-final-20261011/official-3552227.zip`, build3552227, 99,197,259 bytes, SHA256 `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. The original download receipt is copied and checked. The archive itself is not recopied. Internet download time is outside this workload, as originally defined.

## Lock and ownership adaptation

The Python owner acquires the existing locks in the normal order: performance, then RC16 benchmark. Both remain held through actual process drain and final evidence checks. The loaded owner normally self-acquires the performance lock; this coordinator supplies its existing `KAIRO_UPDATER_LOCKED=1` flag **only after actually acquiring that lock**, so the original workload body runs without a redundant nested acquisition. This is the sole loaded-owner execution adaptation. Inventory executes beneath the same actual locks without another flock. No fake lock claim or reversed lock ordering is used.

The reused envelope starts an owned session, adopts detached descendants as a child subreaper, observes namespace-correct groups and requires actual exit/reaping. Surviving live children make the command fail. Unknown/live descendants keep the shared locks held. The original worker's report may precede its `finally` cleanup; the external owner requires full process drain and absence of both `kairo-inventory-cost-*` and `kairo-updater-loaded-*` temporary paths after exit. Preexisting matching paths block execution and are preserved for diagnosis.

## Evidence and acceptance limits

Fresh candidate source/prebuild manifests, setup receipt/inventory and the actual successful build log come from `/tmp/kairo-public-resume-20261011/setup/`. The complete setup inventory is checked before execution. Original input paths and byte/SHA256 tuples are retained; source, archive and harness inputs are rechecked outside the measured windows.

Closed command logs and consumed inventory/loaded JSON are pinned before subsequent work. Final inventory tuples must match these earlier pins and all copied inputs. The original six-window `loaded.json` is pinned after its owner exits; this preparation introduces no in-window file monitor and does not reconstruct earlier reports. Original per-window rows, phase probes, building-interval latency, restart gaps, errors and adverse observations remain available for independent audit.

Collection completion is not a performance-acceptance claim. Retain the earlier adverse HTTP/event-loop/restart/RSS rows alongside these new matched measurements. Independent Actions updater evidence, the wider three-way review, package extraction verification and user approval remain separate gates.
