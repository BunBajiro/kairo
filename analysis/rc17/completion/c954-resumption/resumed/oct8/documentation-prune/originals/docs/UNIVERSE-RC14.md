# Universe rc14 review guide

This build extends the existing Universe workflow without a data reset. Existing maps, notes, pilots, sessions and settings remain available. It stays on the feature branch in a draft pull request and must remain unmerged until in-app review is approved. Download the artifact from the successful test-build run linked in that PR; this guide does not certify a pending run.

## What changed

| Area | Behavior |
| --- | --- |
| Navigation | **Atlas** replaces the K-Space listing; **Maps** replaces the J-Space listing. **Universe settings** gathers Connections & pins, Power blocs, and Sources & alerts. |
| Journey | Its old page is hidden. Travel recording, stored visits and services used elsewhere in Kairo remain. Legacy Journey links open Atlas. |
| Atlas geometry | The regional schematic now uses CCP’s in-game `position2D` layout instead of local-radar hop rings. The same layout supports full-universe and region views. |
| Atlas projection | Direct **3D / 2D** controls remember the choice across navigation, zoom and reload. 3D is flattened physical space; 2D is schematic. Jump-range calculations still use physical 3D coordinates. |
| Maps landing | **Search map…** finds existing system instances and their aliases. A result opens its owning map, frames the system and opens details. Its Notes category searches notes across those maps. |
| Bulk placement | Add a known-space constellation or region, drag its provisional schematic group and confirm or cancel. Confirmation creates independent cards plus internal real stargates and configured Ansiblexes. Existing cards keep their positions and edits. |
| Connection tabs | Small tabs on all four card sides support dragging and keyboard connection creation, with the attachment sides retained. |
| Permanent connections | Stargates and Ansiblexes have distinct presentation and controls. They do not use wormhole lifetime, mass or ship-size settings. A stargate must exist in the static atlas. |
| Notes | New notes show the selected pilot’s trusted name and portrait, minutes under one hour and dated EVE time afterward. Search, UTC date groups, pagination and subdued deletion keep long notebooks manageable. Unknown older authors remain explicitly unavailable. |

Wormhole mapping retains its existing tracking, scopes, signatures, static/weather reference, ownership observations and pruning rules. Permanent-link presentation does not grant bridge access. Shared Ansiblex access stays in Universe settings; private map bridges stay in their map. Removing a shared bridge’s diagram line does not remove the configured network entry.

Known-space regions and constellations can be placed as groups. Wormhole organisational regions and constellations are still excluded. Group placement is a deliberate map edit, separate from a map’s automatic population scope.

## Focused in-app review

1. **Check Tenerifis in Atlas.** Switch to 2D, frame Tenerifis and compare its arrangement with the in-game schematic. Select different systems, zoom and return from another page: the regional arrangement should stay fixed and the projection choice should remain 2D. Repeat in 3D.
2. **Search existing maps.** Return to the Maps landing. Search for a system present in two maps: results should identify both map instances. Choose one and confirm the correct map, selected card and system details open together. A catalogue-only system should not appear as a mapped instance.
3. **Place a region or constellation.** Create a test map, select the group category in its add/search field and choose a known-space group. Move its preview, then cancel: no systems or links should have been saved. Repeat and confirm. Move one newly added card; the others should remain independent. Re-adding the group must not duplicate cards or move existing ones.
4. **Inspect each connection type.** Compare a wormhole, a real stargate and an Ansiblex. Only the wormhole should offer lifetime/mass/size controls. Drag a connection from a top or bottom tab, reload the map and check the attachment. If testing shared bridges, verify deleting the diagram line leaves the original list entry in Universe settings.
5. **Use notes across a map.** Save notes on two systems. Verify the author portrait/name and compact delete action. Search by text or pilot, switch from This system to Entire map, and open the other system’s note. Return to the landing and find the same note through its Notes search category. Older imported notes should retain known attribution without being reassigned to the active pilot.
6. **Check settings and existing workflows.** Visit all three Universe settings tabs and confirm your Ansiblex lists and power blocs remain. Reopen an existing wormhole map, inspect scanner/report data and replay a recorded mixed-space session. The source map should remain available only through its explicit settings action.

Connection deletion and expiry still remove that connection’s notes and evidence immediately. System data remains map-local and survives its card leaving the diagram under the existing grace/lock rules. Read [the Universe guide](UNIVERSE.md) for the full behavior and [the schematic diagnosis](SCHEMATIC-GEOMETRY.md) for geometry details. Automated verification results belong in the draft PR and [validation record](VALIDATION.md).
