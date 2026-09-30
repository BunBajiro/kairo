Exploratory run, not the report's timing source.

This run executed browser harness SHA256 d1fa19e3fba42d4b0be81590e3643a683e93da930e2d6f317e29f427b4efef46. Its immediately adjacent RAF-observed samples could retain the preceding observer, yielding duplicate timestamp observations (notably the 100-node pan p50=0). The app's code was unaffected.

The observer was corrected to capture its own sample identity and reject non-increasing timestamps. The final `frontend-browser.json` is a complete fresh-process rerun using the corrected harness; that file self-records its harness SHA256. `frontend-summarize.py` intentionally ignores this exploratory run. Do not aggregate it with the final measurements.
