# Authentication, permissions and security

This reference describes **0.8.0-rc.17**. For the registration screens and first connection, follow the [user guide](USER-GUIDE.md). This page owns the permission model, credential lifecycle and local security boundaries.

## What you authorize

Kairo uses EVE's OAuth authorization-code flow with PKCE. Register a local EVE application, make the required scopes available there, and enter its **Client ID** in Connections. Kairo does not need or store a Client Secret. The callback is the running dashboard origin plus `/auth/eve/callback`, normally `http://127.0.0.1:4380/auth/eve/callback`. Copy the displayed address; changing `KAIRO_PORT` changes that callback.

Permissions are granted separately for each EVE character. Choosing a module's scopes in Connections is distinct from enabling that module in Settings. A scope grant permits a request; it does not guarantee corporation/alliance roles, docking access, fleet membership or structure visibility. Kairo reports unavailable access rather than treating missing private observations as facts.

**Pilot essentials** selects Pilot telemetry and Training & clones. **All modules** selects all catalog scopes. Individual scopes can be inspected and changed before sign-in. **Update access** requests the union of that character's existing scopes, the current selection and OPSEC contacts. It is an additive workflow, not a permission-removal control. Add the requested scopes to the registered EVE application before signing in again, and select the intended character at EVE SSO.

Changing the saved Client ID is refused while characters remain connected; saving the same ID is allowed. Disconnect characters before switching registrations. Saving a Client ID does not install, cancel or finish an SDE update.

## Scope reference

The maintained implementation is [server/modules/catalog.mjs](../server/modules/catalog.mjs). This table lists the exact permission strings grouped by their consumer; some permissions are shared across groups.

| Module | Requested scopes |
| --- | --- |
| Pilot telemetry | `esi-location.read_location.v1`, `esi-location.read_ship_type.v1`, `esi-location.read_online.v1` |
| Training & clones | `esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`, `esi-clones.read_clones.v1`, `esi-clones.read_implants.v1` |
| Wallet & trade | `esi-wallet.read_character_wallet.v1`, `esi-markets.read_character_orders.v1` |
| Market intelligence | `esi-markets.structure_markets.v1`, `esi-universe.read_structures.v1`, `esi-location.read_location.v1` |
| Hangar & fittings | `esi-assets.read_assets.v1`, `esi-fittings.read_fittings.v1`, `esi-contracts.read_character_contracts.v1`, `esi-universe.read_structures.v1` |
| Industry & resources | `esi-industry.read_character_jobs.v1`, `esi-characters.read_blueprints.v1`, `esi-industry.read_character_mining.v1`, `esi-planets.manage_planets.v1` |
| Combat record | `esi-killmails.read_killmails.v1`, `esi-characters.read_standings.v1`, `esi-characters.read_loyalty.v1` |
| OPSEC context | `esi-characters.read_contacts.v1`, `esi-corporations.read_contacts.v1`, `esi-alliances.read_contacts.v1` |
| Calendar & notifications | `esi-calendar.read_calendar_events.v1`, `esi-characters.read_notifications.v1`, `esi-mail.read_mail.v1` |
| Universe | `esi-universe.read_structures.v1`, `esi-fleets.read_fleet.v1`, `esi-ui.write_waypoint.v1`, `esi-search.search_structures.v1` |

Public profile/universe data and NPC station scans need no private scope. Kairo only reads planetary endpoints despite EVE's `manage_planets` scope name. Mail collection reads headers, not mail bodies. The waypoint scope is used when the user explicitly chooses **Send to EVE**; route planning alone never sends a waypoint command. Private structure reads/searches and fleet data remain conditional on the selected character's actual access.

Module disablement pauses its collection/consumers and retains stored history. It does not revoke the EVE authorization. Polling preferences likewise do not grant scopes, reconnect characters or enable modules.

## Disconnect, reconnect and stored history

Disconnect removes the local character/token row, its collection snapshots and character-prefixed HTTP representation cache. It then makes a best-effort refresh-token revocation request. If the network is unavailable, local removal still succeeds; use EVE's authorized-applications page if you need to ensure the external grant is revoked.

Disconnect does not erase durable sessions, notes, goals, combat records, maps or shared market data. Reconnecting the same ID restores access to retained records. It is not a private-data erasure operation. [Data retention](DATA-RETENTION.md) explains the distinction.

An expired/revoked refresh grant marks the matching connection as needing reauthorization. Use **Update access** to sign in again. If EVE reports that a character's ownership has changed, refresh is refused; a fresh login clears that character's old collection snapshots/cache before storing the new connection. This ownership check does not transfer or delete all locally retained user history.

## Credentials at rest

[openVault()](../server/vault.mjs) generates a 32-byte AES key. Each token bundle and saved OBS password uses AES-256-GCM with a new 12-byte IV and authentication tag. Encryption is field-level: [the SQLite database](PERSISTENCE.md) otherwise contains readable private data.

| Platform | Key protection | Practical limit |
| --- | --- | --- |
| Windows | `vault.dpapi`, wrapped with Windows DPAPI `CurrentUser` through PowerShell | The Windows account context must be able to unwrap it. Copying this file to another account/machine does not establish portability; a foreign or unreadable vault can prevent startup before reconnection is possible. |
| Other platforms | `vault.key`, base64 key with requested mode `0600` | A process/user that can read the database and key can decrypt the protected fields. This is not an OS credential-store integration. |

Do not delete a vault file as a routine troubleshooting step. A replacement key cannot decrypt existing credentials. Back up the complete stopped directory, and keep secrets out of source control, test artifacts, screenshots, bug reports and exported diagnostic logs. OBS password reads expose only whether a password is saved, not its plaintext value.

## Local dashboard and Stream boundary

[server/index.mjs](../server/index.mjs) binds two separate listeners to `127.0.0.1`, normally dashboard port **4380** and Stream port **4381**. Ports must be distinct integers from 1024 through 65535. `KAIRO_STREAM_PORT` overrides the latter; otherwise it is dashboard port + 1.

| Surface | Intended exposure |
| --- | --- |
| Dashboard and `/api/*` | Private local UI. A browser session is required, with same-origin checks; state-changing requests additionally require its `X-Kairo-CSRF` token. |
| Stream `/stream`, `/state`, `/events` on the Stream port | Read-only local broadcast projection, available without dashboard session credentials. It serves configured overlays/widgets/toasts, not the dashboard API or raw snapshots. |
| OBS WebSocket | Optional connection to `ws://127.0.0.1:<configured port>`; default 4455. Configured rules may change actual OBS sources, audio, filters and scenes. |

Host checks accept only the expected loopback host/port. Dashboard navigation through `localhost` redirects to the canonical `127.0.0.1` origin. The private API rejects cross-site requests and unexpected Origins; mutations also use constant-time CSRF comparison. Cookies are HttpOnly, SameSite=Lax and expire after 24 hours, with sliding server-side session validity. Browser sessions are in memory, except for private IPC transfer during a managed dataset replacement.

Responses set CSP, no-referrer and MIME-sniffing protections. Ordinary API JSON uses `Cache-Control: no-store`; the private Atlas response instead supports validated browser caching with `private, no-cache` and an ETag. These boundaries do not make Kairo a remote multi-user server or protect against software already controlling the local account. Do not expose the listeners through a public tunnel, port-forward or reverse proxy as though remote authentication were implemented.

Stream output is deliberately visible to its local consumers and to viewers when captured. Configured text, goals and bindings can reveal what the user chooses to display. Protection rules govern presentation; they do not retroactively remove information already broadcast. Check actual scenes and output in OBS. The [user guide](USER-GUIDE.md) covers setup and [API reference](API-REFERENCE.md) covers the exact HTTP/event boundary.

## External and local data sources

Kairo contacts EVE SSO, ESI and CCP static-data endpoints; enabled domain features also use community sources such as zKillboard, EVE Ref and Eve-Scout. The browser loads allowed EVE image/CDN resources. Optional operational log watching reads configured local EVE log directories. Data is processed into the local store; enabling those features naturally exposes requests to their providers. There is no Kairo-hosted account or cloud-backup service in this runtime.

Map scope denotes local ownership/visibility between connected pilots and followed local maps, not server-hosted collaboration with independent logins. Exported maps/history may contain private operational information and log configuration. Treat exports as private unless reviewed for the intended recipient.

## Developer contract: authentication and request ownership

[createAuth()](../server/auth.mjs) owns SSO discovery, verification, pending authorization and token refresh. Do not implement an independent token client inside a module.

- Discovery/token/key/revocation endpoints must remain at `https://login.eveonline.com`. Discovery and signing keys are cached for an hour and share their current in-flight request. A missing signing key triggers one forced key refresh.
- Authorization uses a random PKCE verifier, S256 challenge and random state. Pending state is tied to the initiating browser session, expires after ten minutes and is consumed before exchanging its code.
- JWT acceptance requires RS256 signature verification, the accepted EVE issuer, both `EVE Online` and the configured Client ID in the audience, valid expiry/not-before and a `CHARACTER:EVE:<id>` subject. Actual returned scopes are stored; requested scopes are not proof of a grant.
- `access(id)` refreshes when the access token has less than 90 seconds remaining. Refreshes coalesce only for the same current token record. Updates use compare-and-update ownership so a late refresh cannot overwrite a reconnect or revive a disconnected character.
- `invalid_grant` marks only its matching current token row for reauthorization. An obsolete refresh failure cannot revoke a newer login. Disconnect ends local ownership before awaiting best-effort remote revocation.
- The ESI service captures `connectionRevision(id)` around private requests. A response from an obsolete connection cannot repopulate purged cache or publish into the replacement owner's snapshot. Core also rechecks scope/module/organization ownership around enrichment and publication.
- ESI read requests go through the shared transport; explicit commands go through `esi.mutate()`. The latter is uncached, not coalesced and not automatically replayed after an uncertain network outcome. Only a definite 401 permits token refresh and one resend. See [ESI polling](ESI-POLLING.md#developer-contract-shared-esi-service).

Regression evidence includes [auth-connection-ownership.test.mjs](../tests/kairo/auth-connection-ownership.test.mjs), [auth-public-flights.test.mjs](../tests/kairo/auth-public-flights.test.mjs), private HTTP/Stream boundary tests and the collection ownership tests listed in [Validation](VALIDATION.md). Automated fixtures do not establish real EVE roles/SSO, Windows DPAPI portability or actual OBS output.
