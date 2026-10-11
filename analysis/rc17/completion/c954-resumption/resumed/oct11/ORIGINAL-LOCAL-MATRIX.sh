#!/usr/bin/env bash
# Command list only: existing workers/orchestration, no new measurement logic.
# Coordinator invocation after builds and final-source gates release their locks:
# flock /tmp/kairo-performance.lock bash /workspace/scratch/a2f3334402fc/recovery-oct11/ORIGINAL-LOCAL-MATRIX.sh
set -euo pipefail

ANALYSIS_ROOT=/workspace/scratch/a2f3334402fc/kairo-analysis-restored
RC16_ROOT=/workspace/scratch/a2f3334402fc/kairo-rc16-baseline
CANDIDATE_ROOT=/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation
V073_ROOT=/workspace/scratch/a2f3334402fc/kairo-v073-final-baseline
OUT=/workspace/scratch/a2f3334402fc/recovery-oct11/final-local
export CANDIDATE_SHA=70cd12f9a4d014e7e2cf931b9681c4bdc7f18789
export KAIRO_CHROME_PATH=/tmp/kairo-chrome-runtime/chromium
export LD_LIBRARY_PATH=/tmp/kairo-chrome-runtime
cd "$ANALYSIS_ROOT"

test "$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)" = "$CANDIDATE_SHA"
test "$(git -C "$RC16_ROOT" rev-parse HEAD)" = 57c8dcc7fbd8fc2b62129498d1819050c78381a1
test "$(git -C "$V073_ROOT" rev-parse HEAD)" = 239794774320fcdebaa1d76ce8a77c5c25cfc48c
test -s "$OUT/completion-ui/build-receipt.json"
test ! -e "$OUT/comparison"
test ! -e "$OUT/legacy-corrected"
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/rc16-source.json"
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/candidate-source.json"
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/v073-source.json"

# Historical v0.7.3/RC16/RC16/v0.7.3 same-host backend anchor.
# This entry point obtains only the different legacy benchmark lock itself.
node analysis/rc16/followup/harness/legacy-corrected-run.mjs "$V073_ROOT" "$RC16_ROOT" "$OUT/legacy-corrected" > "$OUT/legacy-corrected-run.log" 2>&1
python3 analysis/rc16/harness/legacy-summary.py "$OUT/legacy-corrected" > "$OUT/legacy-corrected-summary.log" 2>&1

# Existing orchestrator records commands, lane logs and fresh matching manifests.
# Maps includes separate diagnostics then B/C/C/B ordinary arms. Backend/memory,
# routes and camera keep their original ABBA; mixed remains quiet/load/load/quiet.
# Restart stdout is retained in comparison/restart.log by this existing owner.
python3 analysis/rc17/harness/local-run.py "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUT/comparison" --lanes maps routes backend memory mixed restart browser browser-performance > "$OUT/original-comparison.log" 2>&1

# Same exact built candidate; Studio consumes the truthful derived build receipt.
# ui-ci-lane does NOT acquire its own benchmark lock, so preserve the CI flock.
for lane in frontend-refresh admin-polling frontend-models studio-stream session-replay-repeat-small session-replay-repeat-cap session-replay-distinct-cap; do
  test ! -e "$OUT/completion-ui/$lane"
  flock /tmp/kairo-rc16-benchmark.lock node analysis/rc17/completion/ui-ci-lane.mjs "$lane" "$CANDIDATE_ROOT" "$OUT/candidate-source.json" "$OUT/completion-ui" > "$OUT/completion-ui/$lane-owner.log" 2>&1
done

node analysis/rc17/harness/source-manifest.mjs verify "$OUT/rc16-source.json" > "$OUT/rc16-source-end.log" 2>&1
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/candidate-source.json" > "$OUT/candidate-source-end.log" 2>&1
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/v073-source.json" > "$OUT/v073-source-end.log" 2>&1
