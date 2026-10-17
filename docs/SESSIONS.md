# Sessions

Sessions turn an operation into a local report of observed travel, ships, combat, wallet activity and milestones. This guide describes **0.8.0-rc.17**, the current 0.8.0 review candidate. Install and connect using the [user guide](USER-GUIDE.md); see the [pilot workspace](PILOT-WORKSPACE.md) for the underlying data pages.

## Record an operation

1. Select the intended **Active character**. Ensure the modules and permissions you want to record are enabled and their starting samples have synced. Pilot telemetry supplies location/hull; Wallet & trade supplies wallet data; Training & clones supplies skills; Industry & resources supplies jobs; Combat record supplies combat and LP. These are independent sources.
2. Open **Sessions → Start session**, enter a **Session name**, then choose **Start recording session**. There is one active session per character; other connected characters can have their own sessions.
3. Keep Kairo running during the operation. Open **Live report** to inspect what it has recorded. Changing the selected character does not end a session.
4. Choose **End session** when finished. Kairo captures the available end samples and opens the report. Ending a session does not shut down Kairo or stop other characters' sessions.
5. Edit **Session name** and **Debrief & notes**, then **Save session details**. Reopen the report from **Session archive** later; use **Load earlier sessions** for older entries.

The report name is limited to 100 characters; the debrief to 12,000. Ending a session does not mean every upstream record has arrived. Keep Kairo running if you want eligible delayed collection to finish. If Kairo is stopped with a session active, the active session survives restart; wall-clock duration includes that interruption, while observations made during the interruption are unavailable.

## Read the report

A full-width **Session summary** shows duration, systems and visits, separate personal/alliance kills and losses, wallet and LP changes, and the most active system. Choose an activity card to open its detail below the row; **Close details** returns to the card. On narrow screens the cards stack. **Refresh** reads the latest saved report; it does not force upstream services to bypass their caches.

| Card | Meaning |
| --- | --- |
| **Route & visits** | Observed locations in order, including returns; expand a visit for entry/exit, region/security and any qualifying combat buffer. |
| **Ships flown** | Observed hulls, time and ship-change order. |
| **Personal combat** | This pilot's verified participation and losses within the session's time boundaries. |
| **Alliance combat** | The session-start alliance's qualifying combat around the pilot's observed visits, with collection coverage. |
| **Loyalty points** | Net LP balance changes by NPC corporation, with sample/reconciliation status. |
| **Wallet activity** | Saved balance comparison and observed journal inflows/outflows. |
| **Progress & milestones** | Recorded skill levels, jobs becoming ready, completed goals and available SP comparison. |
| **Coverage & timing** | Source availability, recording limitations and collection phase. |
| **Activity timeline** | Retained events belonging to this session; **Load more session events** retrieves further pages. |

Duration is elapsed session time, not time undocked, active or online. **Systems visited** counts distinct observed systems; **visits** includes repeated returns. Missing start/end values show **Not recorded** rather than an invented zero.

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

The collector verifies killmail bodies with ESI and retains verified records locally. Public zKillboard requests receive no EVE credentials. Collection respects cache deadlines, cooldowns and bounded work per pass; **Collection incomplete**, **Public source unavailable**, **Saved records · retry pending** and other coverage labels explain why a total may still be partial.

Collection follows the session's state:

| Session state | zKill collection |
| --- | --- |
| Live | Check the incremental R2Z2 feed about every two minutes, alongside cached history checks. |
| Ended less than 24 hours ago | Stop using the incremental feed for this session. Trigger its pending history check on end, then finish delayed rechecks as cache deadlines and cooldowns allow. |
| Ended at least 24 hours ago | Stop session-specific collection. Opening or refreshing the report reads saved records and does not restart requests. |

The 24-hour window begins at **session end**; a long-running live session remains live. All eligible recent sessions receive history checks, without the former eight-session cap. If another pilot still has a live session, the shared incremental feed continues only for live sessions. Closing Kairo, pausing combat or losing authorization stops collection; saved records remain available. Restart resumes eligible work, but does not reopen the collection window of archived sessions.

The shared incremental feed retains relevant personal/alliance records and its position across restarts. Older gaps are handled through history checks. Collection status and last/next check times appear in the report; source cooldowns and catch-up work can delay updates. The live Session combat feed is separate from the optional Universe public kill feed setting.

Public publication delays and unpublished killmails mean **Published records collected** does not guarantee every in-game kill or loss is available. Archived reports remain based on saved records; independently collected shared records or corrected calculations may still change what they display. The 24-hour cutoff ends Session-specific network collection; it does not freeze the report into a permanent image.

### Combat record outside a session

Open **Sessions → Combat record** for **Recent kills & losses**. This page shows time, result, **Your participation** (Final blow, Participant or Victim), victim hull, system, attacker count and a zKillboard link. Its collection state is separate from any one report. Assisted and zero-damage EWAR participation count when the pilot appears among verified attackers; simply being in the same fleet does not establish participation.

## Ships and LP

**Ships flown** groups observed time by hull and retains the ship-change order, including swaps between two ships of the same hull type. If the starting hull was not captured, the history begins with the first observed change.

**Loyalty points** compares the character's balances per NPC corporation. It includes earned, spent and donated LP, so it is a net balance change, not gross earnings. It uses the existing `esi-characters.read_loyalty.v1` permission in the combat module. Enable that module and connect the permission before starting a session to establish its baseline.

Start/end samples keep their original timestamps. A completed session initially awaits reconciliation. The first fresh sample after its end is retained as a **delayed estimate**, with the original end sample preserved. A delayed estimate can include activity after the session. Later samples do not keep changing that archived estimate.

If another session starts before the fresh end sample, or the new session's LP baseline overlaps a previous session, the overview labels the result **Uncertain** and retains the original observed balances. Kairo does not assign the shared change to both sessions. Missing historical samples cannot be reconstructed.

## Wallet and milestones

**Wallet change** compares the saved start and end balance samples. **In** and **Out** sum the journal activity retained for the session's occurrence-time window. These are different measurements: sampled balances may be cached or incomplete, and later journal records can arrive after the session ends. Transfers, refunds, spending and market activity all contribute. Neither figure is a profit calculation.

**Progress & milestones** counts recorded skill completions, industry jobs becoming ready and completed goals. The SP change compares available samples. The report does not reconstruct every in-game action from those differences: source cadence, disabled modules, missing permissions and time with Kairo closed limit what was observed. Initial historical data does not produce a new completion event merely because it was first downloaded.

## Replay on the map

1. Open a report and choose **Show on Map**. Kairo opens the Atlas workspace in Session replay mode for that report's character.
2. Choose **Play**. The default speed is **60×**; select 1×, 10×, 30×, 60×, 120× or 300× as needed.
3. Drag **Session replay time** to seek, or use **Previous recorded system**, **Next recorded system**, **Previous recorded event** and **Next recorded event**. Seeking pauses playback; **Restart** returns to the beginning.
4. Keep **Following pilot** enabled for smooth camera movement. Dragging the map pauses camera follow; choose **Resume follow** to resume it.
5. Expand **Recording details** to inspect gaps, inferred context and omissions. **Close session replay** returns to the ordinary map workspace.

Replay is a read-only snapshot, not a video or a new collector. A **Live snapshot** stops at the time it was opened; reopen the session replay to include subsequent activity. Playback does not advance while the browser tab is hidden. It follows recorded known-space and wormhole-space locations, switching the displayed space as appropriate; it does not modify your saved Maps network.

Interpret the map carefully:

- Dotted **Recorded transitions** connect consecutive observed systems. They do not confirm a gate, wormhole, filament, jump drive or the route between them.
- The pilot stays at the last observed location until a later observation. A long stay alone does not establish a recording gap. A missing initial location is marked as a gap; some legacy starts can show **Inferred location**.
- Events can have an explicit recorded system, a verified killmail system, the pilot's visit context or no location. **pilot context** means where the pilot was observed, not necessarily where the activity happened. Missing coordinates remain **No coordinates** rather than being plotted at a guessed position.
- Routine location and OPSEC changes are omitted from replay's event cards; movement is already represented by the route. The report/history still retains its recorded events.
- Replay includes at most the first 10,000 eligible activity events. **Recording details** reports truncation; every recorded visit is retained.
- Known-space territory is labelled **Current sovereignty · cached …**, including a stale marker when applicable. It is a dated present-day backdrop, not a reconstruction of historical borders. The replay-location **At visit: …** label uses sovereignty captured with that visit; **At visit: not recorded** means no historical owner was captured. Live operational intel and navigation overlays are excluded from replay.

See [Universe](UNIVERSE.md) for normal Atlas, Maps and navigation workflows.

## Coverage questions

| Symptom | Interpretation or next step |
| --- | --- |
| A session has no route or starting hull | Check Pilot telemetry access and freshness before the next session. Missing historical samples cannot be created afterward. |
| Duration includes time Kairo was closed | Duration is wall-clock session time. End the session before shutdown if that is the boundary you want. |
| Quiet systems appear in the route | Expected: combat qualification never deletes observed travel. |
| Alliance counts exceed personal counts | Alliance coverage includes qualifying alliance combat, including your own participation; it is not a personal-plus-extra total. |
| No alliance data is available | The session-start baseline was absent, or the pilot had no alliance. Today's membership is not substituted. |
| A recent kill is missing | Inspect coverage and collection times; public publication, cache deadlines, incomplete pages and verification can delay it. |
| An archived report does not fetch new kills | Its Session-specific collection window closes 24 hours after the end. Refresh reads retained records. |
| LP shows **Awaiting sample**, **Delayed estimate** or **Uncertain** | Read the LP sample timestamps and reconciliation explanation above. These labels describe data limits, not zero earnings. |
| Replay omits activity or shows a dotted jump | Check **Recording details**. Replay cannot establish unobserved travel or a transit method. |

## Compatibility

Old sessions still show their retained visits/events; uncaptured alliance, LP, ship and sovereignty baselines remain unavailable. Current travel recording is Session-scoped; retained legacy history can still support older reports. JSON history exports include retained Session and alliance-ledger records. See [data retention](DATA-RETENTION.md) for export and full-backup procedures; an export is not a full installation restore.

Session reports, debriefs and replay remain private local data. They are not sent to the sanitized stream renderer; a Studio widget or enabled toast can explicitly publish selected Session display values. Capturing the dashboard itself can still reveal it.

Maintainer source: [report assembly](../server/history.mjs), [visit/LP/combat details](../server/session-details.mjs), [collection policy](../server/session-policy.mjs), [replay projection](../server/session-replay.mjs), [report UI](../components/kairo/session-report.tsx) and [replay UI](../components/kairo/session-replay.tsx). Behavioral coverage includes `sessions`, `session-travel`, `session-event-window`, `session-archive`, `session-summary`, `session-replay-timeline` and `session-replay-sovereignty` tests under `tests/kairo/`.

Historical feature announcements are in [CHANGELOG.md](../CHANGELOG.md); current release readiness is in [Validation](VALIDATION.md).
