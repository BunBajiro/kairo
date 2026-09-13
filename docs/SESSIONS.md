# Sessions — Kairo 0.7.1

Open **Journey → Sessions**, then choose a session. Each overview card expands to reveal its detail. **Start session** still records a named session; **End session** opens the completed overview. Names and debrief notes remain editable.

## Visits and alliance combat are separate

Every observed visit remains in the route, including quiet transits and returns to the same system. The route shows entry/exit times, inferred duration, region and security where available. The starting and ending visits are bounded by the session start/end. ESI location samples can miss fast travel or travel while Kairo is closed; durations describe observed presence rather than a complete gate log.

The alliance combat rule only controls the **extra combat window**:

1. Look for a verified killmail in a visited system while the pilot was observed there. The alliance recorded at the session's start must appear among its attackers or as its victim's alliance. Entry is inclusive; exit is exclusive.
2. If such a kill or loss exists, mark that visit with **±10m combat window** and count matching alliance killmails from ten minutes before entry until ten minutes after exit, in that same system. The upper boundary is exclusive.
3. Merge overlapping buffered windows in the same system. Deduplicate killmail IDs before totalling them. Kills within the buffer never recursively qualify other visits or expand the window further.
4. Preserve every visit in the route, whether it receives a buffer or not.

Personal kills/losses use only the session's actual start/end times and the pilot's own presence on the killmail. Alliance totals remain separate and do not imply that the pilot participated. The full available `zkb.totalValue` contributes to the appropriate destroyed/lost total; it is not divided among attackers. Unknown prices are marked **unpriced**. A killmail can count once on each side when the alliance attacks its own member.

The alliance current at session start is saved with that session, so later membership changes do not rewrite its history. A session without that baseline reports alliance data as unavailable rather than guessing from today's membership.

## Collection and delayed killmails

The public collector uses the supported `allianceID`, `solarSystemID`, `year/month` and `page` modifiers. It applies exact visit windows locally, verifies killmail bodies using their ESI hash and retains verified records in SQLite. It shares the existing zKillboard queue and cache, sends no EVE credentials to zKillboard, respects source cache deadlines and rate-limit cooldowns, and caps each pass to six pages and 100 new detail verifications. Incomplete collection and API page limits are visible in the card.

The most recent eight active/recent sessions are checked automatically while Kairo runs; completed sessions stay in that automatic set for 24 hours. Opening an older session resumes collection for it. Public publication delays and unpublished killmails mean **collected** does not guarantee that every in-game loss is public. Closing Kairo or disabling the combat module pauses further collection; retained records remain available.

The current public API documents up to 200 results per page, a one-hour client cache, and a five-minute delay for new records. It disables the old start/end timestamp filters. Reference: [zKillboard API documentation](https://zkillboard.com/api/docs/), checked 13 September 2026.

## Ships and LP

**Ships flown** groups observed time by hull and retains the ship-change order, including swaps between two ships of the same hull type. If the starting hull was not captured, the history begins with the first observed change.

**Loyalty points** compares the character's balances per NPC corporation. It includes earned, spent and donated LP, so it is a net balance change, not gross earnings. It uses the existing `esi-characters.read_loyalty.v1` permission in the combat module. Enable that module and connect the permission before starting a session to establish its baseline.

Start/end samples keep their original timestamps. A completed session initially awaits reconciliation. The first fresh sample after its end is retained as a **delayed estimate**, with the original end sample preserved. A delayed estimate can include activity after the session. Later samples do not keep changing that archived estimate.

If another session starts before the fresh end sample, or the new session's LP baseline overlaps a previous session, the overview labels the result **Uncertain** and retains the original observed balances. Kairo does not assign the shared change to both sessions. Missing historical samples cannot be reconstructed.

## Compatibility and review

The migration adds an alliance combat ledger without resetting sessions, settings, markets or existing history. Old sessions still show their observed visits/events; uncaptured alliance, LP and ship baselines remain unavailable. JSON history exports include the retained alliance ledger and the session snapshots.

Battle Reports, engagements and public sharing are outside v0.7.1. The version is prepared on a feature branch with a draft PR and test ZIP for in-app review before merging or releasing.
