# Troubleshooting

[Documentation index](README.md) · [Installation, backup and recovery](USER-GUIDE.md)

For **0.8.0-rc.17**, start with the visible state and the owning feature. Repeated clicks, deleting data or reducing every polling interval are not general recovery procedures. Kairo distinguishes cached data, missing permission and a disconnected local runtime.

## Startup and connection

| Symptom | Meaning and action |
| --- | --- |
| Launcher asks for Node.js | Install Node.js 24+ and reopen the launcher. Check `node --version` in a new terminal if an older installation remains on PATH. |
| Missing page/compiled files after downloading source | Use the designated compiled ZIP, or follow [the source build workflow](DEVELOPMENT.md). Extract every package file into one folder. |
| Browser did not open | Keep the launcher running and open `http://127.0.0.1:4380` (or your configured dashboard port). Read the launcher error if startup stopped. |
| “Kairo is already running…” | Open the existing dashboard or stop its launcher before starting another instance. Another process may occupy a port. Do not delete `datasets/runtime-lock.sqlite`; its lease is released by process exit. |
| “Kairo’s local core is unavailable” / “Reconnecting to core” | Ensure the local launcher is still running and use the correct address. After it is ready, use **Retry connection** if shown or reload. A browser tab alone does not start the backend. |
| “Updating datasets” | This is a planned activation/reconnect, not ordinary network failure. Keep the launcher open; allow the runtime and page to reconnect. See [dataset states](DATASETS.md). |
| “Windows could not open the credential vault” / “Invalid Kairo vault key” | Check that you are using the original Windows account and complete matching data directory. Preserve the files. A copied/mismatched vault is not repaired by deleting its key; restore a complete known backup under its original account or use a fresh separate data directory. |
| Characters/settings disappeared after changing folders | Installation and data folders are different. Check the account and `KAIRO_DATA_DIR`/platform defaults before assuming records were deleted. Do not overwrite the original store. |

## EVE access and data states

| Visible state or symptom | What to check |
| --- | --- |
| EVE login rejects the callback | Copy the exact callback from **Connections** to the same EVE application that supplied the Client ID. Default is `http://127.0.0.1:4380/auth/eve/callback`; `localhost`, another port or a trailing path differs. |
| New module still shows **Scope needed** | Add the required scope to the EVE application, select it in Connections and complete **Update access** as the intended character. Also enable its module in Settings. |
| **Reconnect to restore access** / **EVE access needs to be renewed** | Complete EVE authorisation again in Connections. Saving a Client ID alone cannot refresh an expired/revoked authorisation. |
| Changing Client ID is rejected | Disconnect all characters before switching EVE applications. Re-saving the same ID is allowed. |
| **Awaiting sync** | No usable sample has arrived yet. Confirm a connected pilot, permission and enabled module; allow initial collection. |
| **Disabled** / **Module disabled** | Enable the owning module in **Settings → Modules** if you want collection. Existing records are retained. |
| **Cached · stale** | You are viewing a retained sample. Read its timestamp and error; provider cache windows, failure backoff or cooldown can delay refresh. Repeated refreshes cannot bypass ESI expiry. |
| **Sync issue** | Read the displayed error. Check authorisation, provider availability and the source-specific guide; a failure is not a zero balance/count. |
| **Synced**, but not the newest in-game change | Synced means a successful observation, not real-time access. The ESI source may cache or aggregate data. |
| Corporation contacts or private structure data unavailable | Scopes are necessary but actual roles/access still matter. Same-system presence is not structure permission. Private structure names can remain IDs. |

Use [ESI polling](ESI-POLLING.md) for interval/cache rules and [authentication/security](AUTH-AND-SECURITY.md) for exact scope ownership. Lowering every interval increases work without defeating upstream caches.

## Feature-specific symptoms

| Symptom | Next action |
| --- | --- |
| Market category empty | Categories reflect the selected hub's retained book. Check hub, search/category filters, quick versus full scan and scan observation time. [Markets](MARKETS.md). |
| Scan interrupted or failed | Read its status; start a supported scan/history update again. Completed books remain available and cached provider work can be reused. A structure quick scan still needs the full provider book. [Markets](MARKETS.md). |
| No import recommendations | Check destination/Jita books, history coverage, trader data and restrictive assumptions. Missing inputs are not zero prices or guaranteed demand. [Import Analyser](IMPORT-ANALYSER.md). |
| Saved plan differs from a fresh draft | Saved inputs are dated; reusing a plan reprices against current data/assumptions. Review the trader selection, current settings and quote. [Import Analyser](IMPORT-ANALYSER.md). |
| Map connection missing or expired | Check selected map, scope, source visibility and connection lifetime. Imported reports need confirmation; a retained system is not proof of a live connection. [Universe](UNIVERSE.md). |
| Replay or Session misses a jump/kill | Travel is observed while recording; public combat feeds have coverage and timing limits. Check the report's data state and Session boundaries. [Sessions](SESSIONS.md). |
| Goal progress is stale or unavailable | Check selected owner/source, scope, enabled module and freshness. Automatic goals do not accept manual progress overrides. [Pilot workspace](PILOT-WORKSPACE.md). |
| OBS browser source is blank | The canvas is empty by default. Add/configure elements in **Stream studio**, save, then check the correct stream URL and source size. [Streaming](STREAMING.md). |
| Toast has no sound | Check the saved rule and OBS browser-source audio; browser audio policy can suppress sound. Text and sound are separate. [Streaming](STREAMING.md). |
| Direct OBS connection fails | Check enabled WebSocket 5 server, local port and password. Authentication rejection/server kick needs manual reconnect. Re-read targets after scene changes. [Streaming](STREAMING.md). |
| OPSEC shows **Unknown** or **Updating · Covered** | Classification lacks usable fresh evidence or is briefly retaining covered continuity. Test saved covers and use manual protection when immediate concealment matters. Do not interpret Unknown as safe space. [Streaming](STREAMING.md). |
| Dataset install fails or returns to previous data | Preserve the error and active build identity; the previous working dataset can remain active. See supported retry and rollback behaviour in [Datasets](DATASETS.md). Do not hand-edit activation metadata. |

## Preserve useful diagnostics

Record the application version, tested artifact/commit if known, operating system, browser/version, affected module, selected data state and timestamps, what you did and the actual result. For a startup failure, include the launcher error. For a layout issue, note the viewport width and capture the affected controls.

Review screenshots/logs before sharing: names, locations, wallet data, notes and OBS scene names can be private. Never share EVE tokens, vault files, OBS passwords or a full data directory as routine diagnostics. A history export also contains private records. Keep any investigation in its own review record rather than altering a closed finding without new evidence.

Source basis: [launcher](../START_KAIRO.bat), [runtime lock](../server/runtime-lock.mjs), [vault](../server/vault.mjs), [dashboard states](../components/kairo/dashboard.tsx), [data states](../components/kairo/ui.tsx), [Connections](../components/kairo/connections.tsx) and the feature owners linked by each guide.
