# Sessions — Kairo 0.7.2

Open **Journey → Sessions**, then choose a session. A full-width **Session summary** shows duration, systems and visits, separate personal/alliance kills and losses, wallet and LP changes, and the most active system. Missing records and delayed estimates keep their status labels. Activity cards align in pairs with shared heading, metric and footer heights. Opening a card reveals its detail in a full-width panel below the row. **Close details** returns keyboard focus to that card. On narrow screens, cards stack and LP balances use labelled per-corporation rows. **Start session** still records a named session; **End session** opens the completed overview. Names and debrief notes remain editable.

The summary ranks systems by unique killmails in the report’s personal and alliance records. A killmail in both lists counts once **for this system ranking only**. The ranking leaves both sets of totals unchanged; your participation is never subtracted from alliance totals. Existing session times and qualifying visit buffers still decide which records are included. Combat ties use total observed time across all return visits, then system ID for a stable result. When no combat is recorded, the highlight is labelled **Most time observed**. No location or combat observations produces an explicit empty state.

## Visits and alliance combat are separate

Every observed visit remains in the route, including quiet transits and returns to the same system. The route shows entry/exit times, inferred duration, region and security where available. The starting and ending visits are bounded by the session start/end. ESI location samples can miss fast travel or travel while Kairo is closed; durations describe observed presence rather than a complete gate log.

The alliance combat rule only controls the **extra combat window**:

1. Look for a verified killmail in a visited system while the pilot was observed there. The alliance recorded at the session's start must appear among its attackers or as its victim's alliance. Entry is inclusive; exit is exclusive.
2. If such a kill or loss exists, mark that visit with **±10m combat window** and count matching alliance killmails from ten minutes before entry until ten minutes after exit, in that same system. The upper boundary is exclusive.
3. Merge overlapping buffered windows in the same system. Deduplicate killmail IDs before totalling them. Kills within the buffer never recursively qualify other visits or expand the window further.
4. Preserve every visit in the route, whether it receives a buffer or not.

Personal kills/losses use only the session's actual start/end times and the pilot's own presence on the killmail. Alliance totals remain separate and include the pilot's participation. Each alliance killmail is **either a kill or a loss**: an alliance victim is always a loss, even with friendly attackers; otherwise, a victim counts as a kill only when the tracked alliance appears among the attackers. The full available `zkb.totalValue` contributes to that one destroyed/lost total; it is not divided among attackers. Unknown prices are marked **unpriced**. Saved v0.7.1 killmails recalculate under this corrected rule without requiring new collection.

The alliance current at session start is saved with that session, so later membership changes do not rewrite its history. A session without that baseline reports alliance data as unavailable rather than guessing from today's membership.

## Collection and delayed killmails

The public collector uses the supported `allianceID`, `solarSystemID`, `year/month` and `page` modifiers. It applies exact visit windows locally, verifies killmail bodies using their ESI hash and retains verified records in SQLite. It shares the existing zKillboard queue and cache, sends no EVE credentials to zKillboard, respects source cache deadlines and rate-limit cooldowns, and caps each pass to six pages and 100 new detail verifications. Incomplete collection and API page limits are visible in the card.

Collection follows the session's state:

| Session state | zKill collection |
| --- | --- |
| Live | Check the incremental R2Z2 feed about every two minutes, alongside cached history checks. |
| Ended less than 24 hours ago | Stop using the incremental feed for this session. Trigger its pending history check on end, then finish delayed rechecks as cache deadlines and cooldowns allow. |
| Ended at least 24 hours ago | Stop session-specific collection. Opening or refreshing the report reads saved records and does not restart requests. |

The 24-hour window begins at **session end**; a long-running live session remains live. All eligible recent sessions receive history checks, without the former eight-session cap. If another pilot still has a live session, the shared incremental feed continues only for live sessions. Closing Kairo, pausing combat or losing authorization stops collection; saved records remain available. Restart resumes eligible work, but does not reopen the collection window of archived sessions.

The incremental feed uses one persistent sequence cursor per installation. It discards unrelated packets, verifies matching killmails with ESI and retains only relevant personal/alliance records. Each pass is bounded to 300 packets or 45 seconds, requests are spaced by at least 200ms, and failures retain the cursor with backoff. A 404 waits at least six seconds; normal checks still follow the two-minute cadence. A cursor older than 24 hours restarts from the current feed pointer, with history checks covering earlier records. Collection status and last/next check times appear in the report; source cooldowns and catch-up work can delay updates.

The history search API documents up to 200 results per page, a one-hour client cache, and a five-minute delay for new records. Shortening that cache timer would not provide fresh results, so the live-only incremental feed is separate. Public publication delays and unpublished killmails mean **collected** does not guarantee every in-game kill or loss is available. Archived reports remain based on saved records; independently collected shared records or corrected calculations may still change what they display. Reference: [zKillboard API and R2Z2 documentation](https://zkillboard.com/api/docs/), checked 14 September 2026. The live sequence/packet responses were also checked for their wrapper shape and `no-store` headers.

## Ships and LP

**Ships flown** groups observed time by hull and retains the ship-change order, including swaps between two ships of the same hull type. If the starting hull was not captured, the history begins with the first observed change.

**Loyalty points** compares the character's balances per NPC corporation. It includes earned, spent and donated LP, so it is a net balance change, not gross earnings. It uses the existing `esi-characters.read_loyalty.v1` permission in the combat module. Enable that module and connect the permission before starting a session to establish its baseline.

Start/end samples keep their original timestamps. A completed session initially awaits reconciliation. The first fresh sample after its end is retained as a **delayed estimate**, with the original end sample preserved. A delayed estimate can include activity after the session. Later samples do not keep changing that archived estimate.

If another session starts before the fresh end sample, or the new session's LP baseline overlaps a previous session, the overview labels the result **Uncertain** and retains the original observed balances. Kairo does not assign the shared change to both sessions. Missing historical samples cannot be reconstructed.

## Compatibility

The migration adds an alliance combat ledger without resetting sessions, settings, markets or existing history. Old sessions still show their observed visits/events; uncaptured alliance, LP and ship baselines remain unavailable. JSON history exports include the retained alliance ledger and the session snapshots.

Battle Reports, engagements and public sharing are outside v0.7.1. The user reviewed the test build, accepted the legacy-session baseline limitation and approved merging on 13 September 2026.

Version 0.7.2 refines the cards and summary, corrects alliance kill/loss classification, and adds the live/ended collection lifecycle above. It preserves visits, existing samples and personal participation in alliance totals. The user approved merging the reviewed feature-branch build on 14 September 2026. Battle Reports remain reserved for v0.8.
