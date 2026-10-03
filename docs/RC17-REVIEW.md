# Clean RC17 user review

This is **Kairo 0.8.0-rc.17**, prepared for in-app review. It includes the whole-app optimisation/refactoring work and idle-work refinement. The final release will be 8.0 after review and approval.

## Start the review build

1. Use the successful **Kairo test build** run linked in the draft PR. While signed into GitHub, download **Kairo-test-build.zip** from its artifacts. The run also provides the ZIP's SHA-256 checksum.
2. Install **Node.js 24 or newer** if needed. The application is already compiled and needs no npm install or build.
3. Stop the running Kairo instance with **Ctrl+C**, then extract the entire ZIP into a new folder.
4. Open **Kairo/START_KAIRO.bat**. Keep its window open while using Kairo. On Linux/macOS, use `./start-kairo.sh`.

Use the same Windows account and any existing `KAIRO_DATA_DIR` override. Kairo continues using your existing `%LOCALAPPDATA%\Kairo` data, including connected pilots, maps, notes, Sessions, goals and stream layouts. **No data reset is required.** Run one Kairo version at a time. Refresh existing dashboard and OBS browser sources after starting the build.

## What to try

| Area | Useful review checks |
| --- | --- |
| Maps | Open your map library, switch between saved maps, search for a system or note, drag cards and use their connection controls. Check that saved positions, notes, signatures and connection timers behave as expected. |
| Mapper display | Under **Universe settings → Mapper preferences**, try the independent K-space/J-space card sizes. **Focus-based map detail is off by default**; enable it only if you want to try it. In a map's **Display** panel, create and collapse a group, search for a hidden member, then expand it. Connections and saved system records remain intact. |
| Sessions | Start a Session, travel, end it and open its report and **Show on Map** replay. Also open an older Session. New travel belongs to the active Session; the standalone Journey log and lifetime counters are retired. |
| Routes and everyday work | Plan a multi-stop itinerary and use your usual dashboard, assets, goals and Import Analyser workflows. Check that switching pilots preserves the correct context. |
| OBS and restart | Check your saved studio output, notifications and normal OPSEC behaviour. Stop Kairo cleanly, restart it and confirm your settings and working maps return. **Settings → Datasets** shows the current data/update status. |

Mapper sizes and focus preferences are saved for this browser and pilot; display groups are also scoped to their map. Display groups are not included in transferable map records.

## Known limits

The performance review retains open startup and heavy-load latency observations. Note any noticeable startup delay, stuttering or slow responses during your normal workflow. Detailed measured limits are recorded in [validation](VALIDATION.md#evidence-limits-and-follow-up).

ESI travel is sampled: Kairo cannot reconstruct travel while closed or guarantee every fast transit. Existing Session reports retain their observed history, and missing or delayed evidence remains labelled.

For feedback, include the area you were using, the steps that led to the issue, whether it repeats, and a screenshot or launcher error when useful. The clean application excludes benchmarking harnesses and raw investigation data. The full feature instructions remain in the [Universe](UNIVERSE.md) and [Sessions](SESSIONS.md) guides.
