# Exact follow-up commands

All commands run from `/workspace/scratch/a2f3334402fc/kairo-analysis-restored` unless noted. The shared lock covers every build, timed or substantial correctness lane; never run these concurrently outside it.

```bash
# In isolated kairo-rc17-atlas-lazy-trial; raw logs live in this evidence folder.
flock -x /tmp/kairo-performance.lock bash -c 'node --test tests/kairo/universe-map-layouts.test.mjs tests/kairo/universe-map-math.test.mjs tests/kairo/universe-map-operations.test.mjs && npm run check:kairo && npm run build'

# Corrected complete kernel lane; 24 timing + 8 heap fresh processes.
flock -x /tmp/kairo-performance.lock node analysis/rc17/completion/atlas/lazy-layout-runner.mjs analysis/rc17/completion/atlas/lazy-trial-20261007/config.json analysis/rc17/completion/atlas/lazy-trial-20261007/kernel-run2

# Compiled ABBA: 4 fresh processes, 4 timed pages + 2 heap/radar pages per process.
flock -x /tmp/kairo-performance.lock env KAIRO_CHROME_PATH=/tmp/kairo-chrome-runtime/chromium node analysis/rc17/completion/atlas/lazy-browser-runner.mjs analysis/rc17/completion/atlas/lazy-trial-20261007/browser

python analysis/rc17/completion/atlas/lazy-trial-20261007/summarize-kernel.py
python analysis/rc17/completion/atlas/lazy-trial-20261007/summarize-browser.py
```

Completed outputs are immutable; use a new output folder for any rerun. `kernel/` is the failed first attempt; its original harness bytes are retained there and its reason is in `FAILURE.md`. The completed kernel's source checks pin the four-file patch as well as full compiled assets. The compiled worker checks the successful build receipt, source files, compiled files, harness hashes, absence of browser exceptions/external requests and cleanup. The postprocessor separately asserts 48 equal rendered pixels/labels/scales and equal radar output across all sources.

Apply only `lazy-layout.patch` to the reviewed integration source. Do not copy diagnostic draw instrumentation from its separate checkout. Rebuild and run the integration's required combined gates after adoption. The independent Session lane supplies the compiled replay fixture/seek/pilot/unmount validation; its results are not relabelled as this timing lane.
