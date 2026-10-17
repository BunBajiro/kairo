# Kairo — Capsuleer operations

Kairo is a local EVE Online workspace for connected pilots, market research, operations and streaming. It brings character snapshots, trade planning, maps, Session reports and personal goals together, with a separate transparent output for OBS.

**This documentation describes the 0.8.0 feature set. The current candidate is `0.8.0-rc.17`, awaiting review; 0.8.0 has not been released.** [Verified review build and download](docs/REVIEW-BUILD.md) · [Validation and environment limits](docs/VALIDATION.md) · [Documentation work](docs/DOCUMENTATION-WORK.md).

## Start here

1. Install **Node.js 24 or newer**.
2. Download the compiled package designated for your review, then extract the whole ZIP into a new folder. GitHub's **Source code** ZIP is not a ready-to-run application.
3. Stop any running Kairo instance, then open `Kairo/START_KAIRO.bat`.
4. Keep the launcher window open. Open [the dashboard](http://127.0.0.1:4380) if the browser does not open automatically; press **Ctrl+C** in the launcher to stop cleanly.

The compiled package needs no dependency installation or local build. Windows is the primary platform; Linux/macOS can run `./start-kairo.sh` with the credential limits described in [installation and first run](docs/USER-GUIDE.md). Older stable packages are on [GitHub Releases](https://github.com/BunBajiro/kairo/releases); they do not include the unreleased 0.8.0 feature set.

Open **Connections** to register your EVE application, copy Kairo's exact callback address and save its Client ID. Kairo uses PKCE and does not need your Client Secret. Public Atlas and NPC station markets work without EVE sign-in; private character data requires the relevant permissions.

## What you can do

| Workspace | Use it for |
| --- | --- |
| [Pilot workspace](docs/PILOT-WORKSPACE.md) | Review training, wallet, assets, industry and planets; keep goals and private notes. |
| [Markets](docs/MARKETS.md) | Scan shared local order books, browse categories and compare hubs with Jita. |
| [Import Analyser](docs/IMPORT-ANALYSER.md) | Compare demand assumptions, fees, price tiers, cargo and trips; save hauling plans. |
| [Atlas and Maps](docs/UNIVERSE.md) | Explore New Eden, plan routes and jump ranges, maintain private wormhole maps and operational records. |
| [Sessions](docs/SESSIONS.md) | Record an operation, inspect reports and replay observed travel on the map. |
| [Stream studio and OPSEC](docs/STREAMING.md) | Compose widgets and notifications, configure protection covers and optional OBS state actions. |

These features share authorised snapshots and local services. A market scan made with an alt is available to other local pilots; goals can feed Studio widgets; a Session can open its map replay. Data freshness, permissions and observation gaps remain visible. Kairo does not trade automatically or fly your ship. Sending route waypoints to EVE is an explicit action.

## Keep your data and output under control

Kairo runs on loopback addresses and stores data locally, normally in `%LOCALAPPDATA%\Kairo` on Windows. EVE credentials and the OBS password are encrypted; the whole activity database is not. Back up the **complete data directory while Kairo is stopped**. See [backup, upgrade and recovery](docs/USER-GUIDE.md#upgrade-backup-and-restore) and [privacy](docs/AUTH-AND-SECURITY.md).

The separate [OBS canvas](http://127.0.0.1:4381/stream) starts empty and transparent. Configure and test saved covers in your actual OBS scene. OPSEC relies on polled observations; use manual protection when immediate concealment is required. See [streaming and protection](docs/STREAMING.md).

## Documentation and development

- [Documentation index](docs/README.md): user tasks, developer references and history.
- [Troubleshooting](docs/TROUBLESHOOTING.md): visible states, connection problems and supported recovery.
- [Developer setup](docs/DEVELOPMENT.md): local commands, testing, packaging and review procedure.
- [Architecture](docs/ARCHITECTURE.md), [internal API](docs/INTERNAL-API.md) and [HTTP/event reference](docs/API-REFERENCE.md).

Contributors follow [AGENTS.md](AGENTS.md): work on a feature/review branch, verify changes and obtain explicit approval before merge or release. The completed review's 74 findings and historical performance evidence remain in the [evidence index](docs/history/README.md).

Kairo is an independent, unofficial companion. EVE Online and its assets belong to their owners. [Release history](CHANGELOG.md) · [Third-party notices](docs/THIRD-PARTY-NOTICES.md).
