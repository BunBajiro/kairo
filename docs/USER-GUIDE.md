# Install and manage Kairo

[Documentation index](README.md) · [Troubleshooting](TROUBLESHOOTING.md)

This guide covers the **0.8.0 feature set in candidate `0.8.0-rc.17`**. Kairo runs locally on your computer. It needs no Kairo cloud account or AI service. Its connected features use EVE and other documented public providers over the internet.

## Requirements and package choice

- **Current Node.js 24 LTS** (24.21.0 minimum), available from [nodejs.org](https://nodejs.org/). Startup checks the installed runtime before opening your profile.
- A fully extracted application folder and writable local data directory. Extract the complete package; do not run it inside the ZIP.
- Windows is the primary platform. Linux/macOS can run the shell launcher, but use a local credential key rather than Windows account protection. Source development has a separate Linux/WSL toolchain described in [Development](DEVELOPMENT.md).
- Chrome and Firefox are the required browser targets. Their actual automated coverage and environment limits are listed in [Validation](VALIDATION.md#browser-compatibility).
- OBS/Streamlabs is optional and needed only for broadcasting. Direct scene/input automation requires an OBS Studio-compatible WebSocket 5 server; a browser source alone needs no direct OBS connection.

Use the [designated review build](REVIEW-BUILD.md) for this review. That handoff records the exact verified download and its expiry. The [test-build workflow](https://github.com/BunBajiro/kairo/actions/workflows/test-build.yml) can contain failed or intermediate builds; newest does not automatically mean accepted. [GitHub Releases](https://github.com/BunBajiro/kairo/releases) contains earlier stable releases, not a released 0.8.0.

The compiled application ZIP includes the frontend and runtime. **No `npm install` or local build is needed to run it.** GitHub's source-code archives are different and require the developer workflow.

## First run and normal startup

1. Extract the whole ZIP into a new folder.
2. Stop any existing Kairo instance.
3. Open **`Kairo/START_KAIRO.bat`** on Windows. On Linux/macOS, run **`./start-kairo.sh`** from the extracted Kairo folder.
4. Keep the launcher window open. It starts the local services and opens the browser when ready.
5. If the browser does not open, visit [http://127.0.0.1:4380](http://127.0.0.1:4380).

Kairo starts with no connected characters, credentials or invented live pilot data. You can use public Atlas data and NPC station market scans before connecting a character. A first online collection can take time; status labels distinguish waiting, unavailable and stale data from a successful empty result.

| Address with default ports | Purpose |
| --- | --- |
| `http://127.0.0.1:4380` | Private dashboard |
| `http://127.0.0.1:4381/stream` | Complete transparent OBS canvas |
| `http://127.0.0.1:4381/stream/toasts` | Toasts only |
| `http://127.0.0.1:4381/stream/opsec` | OPSEC covers only |

Both services listen on loopback only, not your LAN or a public interface. Use the canonical `127.0.0.1` address consistently, especially for authentication and write actions.

To stop normally, press **Ctrl+C in the launcher** and let it finish. Closing the browser tab does not stop Kairo. Run only one instance against a data directory; a second launch is rejected. Do not delete the runtime lock file to bypass that check.

## Connect a character

Open **Connections** in the sidebar. Its callback display is the exact value to copy for your running instance.

1. Open [EVE developer applications](https://developers.eveonline.com/applications) and register an application for **Authentication & API Access**.
2. Set the callback URL to the address shown by Kairo. With default ports it is **`http://127.0.0.1:4380/auth/eve/callback`**. Scheme, host, port and path must match; a `localhost` callback is a different address.
3. In Kairo, choose the module permissions you need. Expand **Review individual scopes** to see the exact scope strings and make those scopes available in your registered EVE application.
4. Paste the application's **Client ID** into **EVE application Client ID** and select **Save**. Kairo uses PKCE; do not enter a Client Secret.
5. Select **Log in with EVE Online**. On EVE's website, sign in, choose the intended character and approve the requested access.
6. When returned to Kairo, check **Connected characters**, select your pilot and allow the first authorised snapshots to arrive. Repeat for additional characters.

**Pilot essentials** selects the pilot and training scope sets. **All modules** selects every supported module scope, including optional fleet/structure information and the waypoint command permission. You can also choose modules or individual scopes. Selecting a scope in Kairo does not grant it until EVE completes authorisation, and the EVE application must offer it first.

### Add access or reconnect

For an existing character, select the additional scopes and choose **Update access** beside that character. Complete EVE login as the intended character. Update access retains its existing scopes and adds your selection plus OPSEC contact scopes; clearing a checkbox is not a revocation operation. When Kairo displays **Reconnect to restore access** or **EVE access needs to be renewed**, use Connections to authorise again.

Permissions are separate from module switches. Enabling a module cannot grant EVE access; approving a scope does not override a disabled module. Some scopes also depend on real corporation roles or structure access. Personal, corporation and alliance contacts are distinct permissions. Planetary interaction uses EVE's `manage_planets` scope name, but Kairo uses its read endpoints only. See [authentication and permission mapping](AUTH-AND-SECURITY.md).

### Change application or disconnect

You may save the existing Client ID while characters are connected. To use a **different** EVE application, disconnect all connected characters before changing the Client ID, then connect them through the new application.

The disconnect button removes that character's local tokens, snapshots and per-character ESI response cache. Saved history, goals, notes and shared market books remain. Kairo attempts provider token revocation, but that network action is best effort; use [EVE authorised applications](https://developers.eveonline.com/authorized-apps) to confirm/revoke provider access. Disconnect is not a full personal-data erasure operation.

## Find your workspace

Use the sidebar or **Ctrl+K / Command+K**. The pilot selector controls character-owned views. Times labelled EVE use UTC.

| Destination | Next guide |
| --- | --- |
| Command centre; Pilot & training; Wallet & trade; Hangar & assets; Industry & planets | [Pilot workspace](PILOT-WORKSPACE.md) |
| Markets, including scans, Browser and Hub report | [Markets](MARKETS.md) |
| Markets → Import Analyser | [Import Analyser](IMPORT-ANALYSER.md) |
| Atlas; Maps; Universe settings | [Universe](UNIVERSE.md) |
| Sessions and report replay | [Sessions](SESSIONS.md) |
| Goals & notes | [Goals and notes](PILOT-WORKSPACE.md) |
| Stream studio; OPSEC control | [Streaming](STREAMING.md) |

Atlas provides known-space geography and intel; Maps holds private wormhole workspaces. Sessions records an operation and can open its replay on the map. Goals can use the same authorised data and feed explicitly selected Studio widgets. Shared market books are available across connected pilots, while scan access and buying/selling roles remain explicit.

Kairo is not an automated trader, fitting simulator, corporation administration suite or full EVE encyclopedia. It does not start/stop OBS streaming or recording. Route planning does not fly your ship; **Send to EVE** is an explicit waypoint action. Optional future ideas and archived plans do not add features to this candidate.

## Settings

| Settings tab | What it changes |
| --- | --- |
| **Modules** | Enables/disables feature collection and subscriptions. Existing history is retained; disabling is not deletion. |
| **ESI polling** | Preferred collection intervals and cache-respecting freshness. See [ESI polling](ESI-POLLING.md). |
| **Datasets** | Current bundled/active reference data, availability checks and installation state. See [Datasets](DATASETS.md). |
| **Appearance** | Interface accent: Signal mint, Instrument amber or Glacial blue. |

**Universe settings** is a separate sidebar destination for map/data-source/operational configuration. Market trading assumptions belong in Import Analyser; notification/output configuration belongs in Stream studio. Changing one does not implicitly change another.

Dataset updates are separate from application upgrades. A successful data installation can restart the local runtime automatically; **Updating datasets** is the expected planned-update state. Leave the launcher open and allow reconnection. A dataset update does not install a new Kairo application version.

## Upgrade, backup and restore

### Start 0.8.0 with fresh data

**0.8.0 is a fresh-data release baseline. Users are expected not to carry data from prior versions into it.** Pre-finalization candidates may make destructive compatibility changes; upgrading 0.7.3 or an earlier profile is not a supported requirement.

1. Stop Kairo normally. Keep an old profile together with its matching package if you want to retain it for separate use.
2. Extract the new compiled package into a **new installation folder**.
3. Select a fresh, empty data directory with `KAIRO_DATA_DIR`, or move the old default data directory aside before launching. Installing into a new application folder alone does not reset data stored elsewhere.
4. Launch Kairo and configure/reconnect your characters and output for the fresh profile.

This policy does not add an automatic reset to Build97. Do not mix old/new packages against one data directory or restore an old profile into the 0.8.0 baseline. Backup/restore below describes recovery with a matching application build, not cross-version transfer. [Persistence](PERSISTENCE.md) owns the policy and current implementation boundaries; [Changelog](../CHANGELOG.md) retains historical changes.

### Locate and back up your data

The normal Windows directory is **`%LOCALAPPDATA%\Kairo`**. On other platforms, the normal directory is **`$XDG_DATA_HOME/Kairo`** or **`~/.local/share/Kairo`**. An explicit `KAIRO_DATA_DIR` selects the exact directory instead. The implementation checks `LOCALAPPDATA` before `XDG_DATA_HOME` if both are set.

Stop Kairo, wait for shutdown, and copy the **entire directory** to a private backup location. Keep the matching application version/source identity with the backup. Include `kairo.sqlite`, the vault key/protected-key file, the `datasets` directory and any other files in that directory; do not copy only the database while Kairo is writing. Browser-only display preferences are outside this backup.

On Windows, **`vault.dpapi` is protected by the Windows account**. On Linux/macOS, **`vault.key` is a restricted local key file**, not a Keychain/Secret Service integration. Both protect encrypted token/password fields; the rest of the activity database is not fully encrypted. Keep backups private.

### Restore a known backup

For a restore on the **same machine/account**, stop every Kairo instance. Preserve the current directory separately, then restore the complete known-good data directory as one unit and run the application version associated with it. Avoid mixing a database from one backup with a vault or dataset metadata from another. Confirm startup and your saved records before deleting the preserved copy.

Cross-machine/account credential migration is **not an implemented workflow**. A copied Windows vault can fail before the dashboard opens, so “copy it and reconnect” is not a guaranteed procedure. For a fresh machine/account, start with a fresh data directory and reconnect through EVE; use supported map-specific exports/imports where applicable. A full portable history import does not exist in this candidate. Do not delete or replace vault files as a guessed repair for the original installation.

### History export is not a restore backup

While the dashboard is open and its local session is active, visiting [the private history export](http://127.0.0.1:4380/api/export) downloads `kairo-history.json` (adjust the port if configured). This endpoint exports local records such as goals, notes, travel, Sessions, Universe records and import plans. It excludes credentials and bulk provider caches. There is no matching whole-history import/restore endpoint or current **Export history** sidebar control.

Treat that JSON as private: excluding tokens does not remove names, activity, locations or written notes. [Persistence](PERSISTENCE.md) records the exact export contract. Map-specific imports/exports in [Universe](UNIVERSE.md) serve their own narrower workflows.

### Optional local paths and ports

Advanced users may set these environment variables before launch. The launchers inherit the environment; there is no settings-page port editor or automatic `.env` loader for the standalone runtime.

| Variable | Default / effect |
| --- | --- |
| `KAIRO_DATA_DIR` | Exact data directory; changing it opens a different local store. Prefer an absolute path. |
| `KAIRO_PORT` | Dashboard port, default `4380`. |
| `KAIRO_STREAM_PORT` | Stream port, default dashboard port + 1. |

Ports must be different integers from 1024 to 65535. If you change them, update the EVE application callback and OBS URLs. Persist the same environment when launching later so you do not accidentally open another data directory. Developer/test isolation examples are in [Development](DEVELOPMENT.md).

## Privacy and reliability

Kairo makes outbound requests for the features you enable: EVE SSO/ESI/images, market histories and documented public Universe/combat feeds. It does not upload your database to a Kairo cloud service. Provider permissions, cache windows, public-feed coverage and time with Kairo closed can limit results. Missing data is not proof that an event did not happen.

Private dashboard data and the stream projection have separate origins and routes. A Studio field you deliberately bind for broadcast can expose its approved display value, such as a wallet balance or goal title. Review your saved output in OBS. For OPSEC timing, manual protection and disconnect behaviour, follow [Streaming](STREAMING.md); for technical boundaries, read [Authentication and security](AUTH-AND-SECURITY.md).

Source basis: [launchers](../START_KAIRO.bat), [supervisor](../server/runtime-supervisor.mjs), [data paths](../server/dataset-paths.mjs), [HTTP runtime](../server/index.mjs), [Connections/Settings UI](../components/kairo/connections.tsx) and [workspace navigation](../components/kairo/workspace-navigation.mjs).
