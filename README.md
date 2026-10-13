# Kairo — Capsuleer operations

A local EVE Online workspace for pilot data, Markets, Sessions, maps and a separate transparent OBS output. Windows is the primary platform. No cloud deployment or AI service is required.

**0.8.0-rc.17 · Premerge Bug Review.** Performance and refactoring work is complete. Start with the [current review handoff](docs/PREMERGE-BUG-REVIEW.md) for the exact tested build and next phase. Merge and stable release still require approval after review.

## Install and run

Use an approved package from [GitHub Releases](https://github.com/BunBajiro/kairo/releases/latest). Feature-branch artifacts are available through [Kairo test build](https://github.com/BunBajiro/kairo/actions/workflows/test-build.yml); use the exact build designated for your review, rather than assuming the newest artifact is a clean candidate. Source ZIP downloads do not contain the compiled application.

1. Install Node.js 24 or newer.
2. Extract the complete package into a new folder and stop any running Kairo instance.
3. Open `Kairo/START_KAIRO.bat` (or `START_KAIRO.bat` inside the extracted Kairo folder).
4. Keep the launcher window open; press Ctrl+C there to stop cleanly.

The compiled package needs no npm install or local build. Linux/macOS can use `./start-kairo.sh`; see the platform and credential limits in the [user guide](docs/USER-GUIDE.md).

- Dashboard: <http://127.0.0.1:4380>
- OBS canvas: <http://127.0.0.1:4381/stream>

Connect a character through **Connections** using your own EVE application's Client ID and the exact callback shown by Kairo. PKCE does not require a Client Secret. Public atlas/routing can be used before character authorization.

## Use Kairo

| Task | Guide |
| --- | --- |
| Setup, upgrades, Markets, Goals, Stream Studio, OBS, OPSEC and privacy | [User guide](docs/USER-GUIDE.md) |
| Atlas, private Maps, intel, routes and replay | [Universe](docs/UNIVERSE.md) |
| Record an operation and understand report coverage | [Sessions](docs/SESSIONS.md) |
| Compare and save hauling plans | [Import Analyser](docs/IMPORT-ANALYSER.md) |
| Tune collection or manage static data | [ESI polling](docs/ESI-POLLING.md) · [Dataset updates](docs/DATASETS.md) |
| Find all maintained documentation | [Documentation map](docs/README.md) |

Local data normally lives in `%LOCALAPPDATA%\Kairo`. Upgrading uses the same data directory; run only one Kairo instance at a time. Stop Kairo before a full directory backup. Exported history is private and is not a full credential/database backup.

OPSEC uses polled observations. Set up and test saved covers in the actual OBS scene, and use manual protection when immediate concealment is required. The [user guide](docs/USER-GUIDE.md#opsec-behaviour) explains freshness and disconnect behavior.

## Develop Kairo

Start with the [source and ownership map](docs/ARCHITECTURE.md), [internal API development guide](docs/INTERNAL-API.md) and [HTTP/event reference](docs/API-REFERENCE.md). [Validation](docs/VALIDATION.md) explains reproducible checks and their limits. Human and AI contributors follow [AGENTS.md](AGENTS.md): feature branch, draft PR, human review before merge.

Release history belongs in [CHANGELOG.md](CHANGELOG.md); current usage belongs in the guides. Kairo is an independent, unofficial companion. EVE Online and its assets belong to their owners; see [third-party notices](docs/THIRD-PARTY-NOTICES.md).
