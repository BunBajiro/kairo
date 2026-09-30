# Proposed implementation: session cadence and shared atlas indexes

Design only. No production files or runtime probes changed during preparation. Implementation target is the clean `kairo-rc17` checkout and requires the root's coordinated start.

## Live-feed cadence: recommended narrow change

Keep scheduling ownership in `createSessionLiveFeed`; it already owns the shared cursor, backoff, deadline, pending flight and abort controller. Move the cheap due/cooldown decision ahead of `getTargets()` in `sync()`, after the existing closed and pending checks. A small local predicate can express the same deadline rule for both entry and the defensive check in `run`; this is not a new scheduler or service framework.

The order must be:

1. Closed → resolved no-op.
2. Existing pending flight → return that exact flight, including forced callers.
3. `notBefore` in the future → no target construction, even with `force: true`.
4. `nextCheckAt` in the future → no target construction unless forced.
5. Build current eligible targets; if empty, stop.
6. Run the existing bounded fetch/verify/accept/cursor process.

Preserve all existing cursor writes and callback ordering. Do not cache target arrays or routes across real requests: eligibility and presence must be current when work is due. Invalid/missing date fields must keep the current “not a future deadline” behavior. A force arriving during an existing flight continues coalescing; it does not queue another pass.

`session-combat.mjs` can remain unchanged for this first improvement. Its live-target builder still excludes ended sessions, paused combat and disconnected/reauthentication pilots whenever due work needs targets. In-flight `isTargetActive` checks still stop ended sessions before accepting packets or advancing the cursor.

Ending a session must still immediately invoke its separate history path: `sessionChanged()` calls `sync(sessionId,id)`, and `run()` in `session-combat.mjs` uses `justEnded` to bypass the previous history retry deadline. That behavior is independent of moving the incremental live-feed deadline guard. Do not convert a session-end notification into an unconditional feed-force request, or bypass source HTTP/backoff limits.

**Owned files:** `server/session-live.mjs` and focused additions to `tests/kairo/session-live.test.mjs`. Only touch `session-combat.mjs` if a concrete integration need appears and is coordinated.

### Correctness and performance gates

- A future normal deadline returns without calling `getTargets`, fetching, accepting, updating cursor/state, or notifying `onCheck`.
- Exact deadline boundary starts due work; force bypasses the ordinary deadline but respects 404 minimum wait, Retry-After and verification backoff.
- Concurrent due calls and force-during-flight share one target build and one flight.
- No eligible target means no fetch; ending/revoking a target during network or spacing waits prevents acceptance and cursor advance.
- Failed verification preserves the cursor and retry deadline; reopening retains cursor and expired cursors still refresh from the pointer.
- Existing tests for immediate end-history checks, every recent ended session, and the exact 24-hour static cutoff remain green.
- Rerun the same external session diagnostics: before-due live sync should issue **zero route/target SQL queries**, versus three route reads / 30,000 rows for three sequential 10,000-visit calls in RC16. Due/forced paths must still build and validate actual targets. Compare ordinary timings separately from SQL diagnostics and preserve route-window/group equivalence.

## Shared indexes: audited semantics and limited recommendation

The constructor attribution measures about 10.78 MiB of retained heap, but does not isolate individual indexes. Therefore no exact saving is promised.

| Existing index | Semantics | Safe ownership direction |
|---|---|---|
| `universe.mjs:77`, `universe-operations.mjs:24`, `universe-navigation.mjs:17` | Full lowercase system name → original system object; array-order insertion means the last duplicate name wins; no subsequent mutation of the maps | One optional readonly `bySystemName` view on the immutable production atlas, reused by these three consumers |
| Navigation `lookup` at `universe-navigation.mjs:17` | Numeric system ID → original system object | Reuse the atlas's existing readonly `bySystemId`, with the current map construction fallback for injected atlases |
| Intel exact/prefix maps at `universe-intel.mjs:3–12` | Exact names map to numeric IDs; prefix lengths start at three and exclude the full name; repeated prefix entries are deliberately not deduplicated | Not a direct drop-in replacement for a name→object index; keep its current semantics pending separate attribution/design |

The small atlas-owned approach fits existing ownership: `getUniverseStatic()` already owns a generation-immutable `bySystemId` and neighbor views. It would avoid two duplicate full-name maps and one navigation ID map in the common production Core without adding a global service registry or broad caching layer. Keep caller-specific trimming, sanitization and validation unchanged; share only the lookup construction.

**Custom atlas constraint:** tests inject mutable plain atlas objects with only `systems` and `gates` into Universe, navigation, operations and the intel parser. Preserve the current local-build fallback when optional readonly indexes are absent. Do not globally cache indexes by mutable injected-atlas identity: changing its systems between service constructions must not accidentally reuse old keys. A supplied index must belong to the same atlas/generation; tests should assert object identity and cross-atlas isolation. The production view must expose no `set`, `delete` or mutable backing map.

This refactor spans `universe-static.mjs`, `universe.mjs`, `universe-operations.mjs`, `universe-navigation.mjs` and focused tests, so it requires root coordination and does not belong to the session-only ownership assignment. Recommend it as a small optional consolidation, accepted only if retained-heap retesting shows a useful reduction and existing routing, location, Unicode/case, duplicate-name and custom-atlas behaviors remain correct. Do not expand it into lazy topology loading or rewrite the intel parser based on the aggregate memory attribution alone.
