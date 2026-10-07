# M9: isolated c954 roster and reconciliation proposal

Status: **210 targeted semantic tests pass; isolated and not integrated**.
The coordinator assigned a test-only slot after independent source review. The
first complete attempt passed; all 482 source files were verified before and
after. No build or timing workload ran. See `SEMANTICS-RESULTS.md` and the
unabridged `tests-attempt1.log`/source receipt. The runtime slot has been released.

Base: `c954c0d808847f249df0659ed15fdce2e89f84c4`, the user-selected test build #54.
Excluded: `508f2d450c7cc17cc464cf316b80748367adc9e2` / test build #55.
The isolated root is `/workspace/scratch/a2f3334402fc/kairo-m9-c954-isolated`,
created from `git archive c954`. It has no copied compiled assets or dependencies.
Shared continuation source was not edited. `BASE.json`, `proposal-files.json` and
`m9-proposal.patch` preserve the exact base and five changed-file hashes. No
GitHub writes, staging or commits were performed.

## Proposed source changes

1. `server/universe-operations.mjs`: extend the existing synchronous
   `readContext` with a lazily captured connected-roster array and by-ID lookup.
   The same owner supplies the already-common Operations state and J-Space
   tracked-pilot projection. Existing config/location/pilot/fleet read helpers
   accept this internal roster when called from that owner. Ordinary calls omit
   it and continue to read current Auth. Per-pilot config, snapshots, module
   settings and time remain live reads; this proposal adds no lifetime config,
   snapshot or authorization cache.
2. `server/universe-jspace-tracking.mjs`: `projectPilots` accepts the synchronous
   Operations owner for character/config lookups. Its permission predicates,
   location deadlines, paused/disconnected/reauth status and output ordering are
   unchanged. Mutation and location-event callers of `allowed`, `sample`,
   `baseline`, `rosterCommand` and tracking dispatch keep their original live
   authorization reads.
3. `server/universe-jspace.mjs`: pass the existing shared Operations context into
   tracked-pilot projection. Restore the independently reviewed, still-unadopted
   narrow `forgetMapConnections` fast path from `maps-final/m9-fastpath.patch`.
   It skips two full-map JSON serializations only when no removed edge, archive,
   edge `locked` property, missing canonical connection, dangling reference,
   missing activity array or obsolete connection/passage activity can change the
   document. Actual cleanup/pruning and persistence remain the original path.

This targets the measured 7,507 Auth roster calls /750,700 returned roster rows
in the 24-map/100-tracked-pilot full projection, and 171.4 MB of no-op map
serialization in the supported 24-map wide summary. It does not yet claim to
remove the 85.7 MB of summary map-body parsing or complete all of M9.

## Ownership and freshness boundaries

`projectionContext` creates a new Operations context for every selected or full
J-Space read. It never stores that owner in a service field. The complete read is
synchronous. The existing public `readContext` contract is also synchronous;
comments now state not to carry it across an await or retain it between requests.
`readContext` validates the requesting pilot immediately, but captures its roster
only on the first projection read, after link expiry/reconciliation has finished.
Thus introducing the owner does not eagerly hold a pre-cleanup roster.

The roster array preserves Auth's ordering, and the by-ID map retains the first
entry if a synthetic injected roster contains duplicate IDs, matching the old
`find` behavior. It contains public connected-character metadata only, never
tokens. Every later request obtains a fresh array, so direct canonical Auth
updates, disconnect, reauth, renamed pilots and scope changes are visible.

Async fleet refresh is deliberately untouched: it performs fresh authorization
when results return and invokes a new `state` projection after the await. No
context from a prior read is passed into ESI work or publication. Existing
mutations still validate independently; map/project responses after a mutation
construct a new projection owner. No request-local snapshot is used to authorize
a mutation.

## Added tests, now passing in the targeted lane

The existing J-Space read fixture now uses real `createAuth().characters()` and
SQLite character rows instead of a two-row static stub. It retains the same
initial IDs/names/scopes and counts actual roster calls.

- Full/selected projection equality for eight maps and eight tracked pilots,
  asserting a small bounded Auth-read budget independent of map count. A later
  SQL rename must immediately appear.
- Fresh scope loss, reauth, ESI/log-source change, Pilot/Universe module toggles,
  disconnect/reconnect, location/ship/online expiry and paused tracking between
  reads. Owner disconnect must reject both a new read and a mutation.
- Real unchanged read persistence: stored notes/passages/revision and SQLite
  total changes remain unchanged while selected/full/summary results agree.
- Five normalization faults from the isolated fast-path trial: `locked:false`,
  empty archive, missing activity, dangling comments/passages and obsolete
  connection activity must still persist cleanup with existing revision rules.
- Deferred fleet request with scope revocation after IO begins: returned state
  reflects missing scope and cannot persist the formerly authorized result.
- Deferred fleet request with disconnect after IO begins: refresh/new projection
  rejects the disconnected pilot and leaves the other pilot readable.

Existing tests remain essential: indexed expiry from direct canonical SQL,
timezone expiry/collapsed unknown lifetime, signature deletion, summary/search
pruning, retention/undo, operational export/import, map duplication, source-map
tracking, private scope and per-pilot mutation isolation. The new fast path does
not replace these gates.

## Runtime slot plan

The originally proposed subset below was expanded to the 14 related files in
`tests-attempt1.json`, executed sequentially under the coordinator's exclusive
`/tmp/kairo-performance.lock` slot:

```sh
node --test tests/kairo/universe-jspace-reads.test.mjs tests/kairo/universe-operations.test.mjs tests/kairo/jspace-tracking.test.mjs tests/kairo/jspace-retention.test.mjs tests/kairo/universe-jspace.test.mjs tests/kairo/jspace-operational-export.test.mjs tests/kairo/jspace-scopes.test.mjs
```

The receipt, not this illustrative subset, identifies the command that ran.
Independent source review found no material objection. Its test-coverage comment
was addressed by putting an actual retained passage in the no-op read fixture,
and keeping the full retention suite in the targeted run. The independent review
and passing tests do not substitute for matched performance evidence.

After correctness and source review, create a manifest for the isolated source
and rerun separate count diagnostics plus a fresh complete summary ABBA against
the frozen c954 source. Reuse the existing exact fixed fixtures for plain/wide/
roster 1/8/24 maps. Retain every output byte hash, input hash and source/harness
end verification. The older partial ABBA must stay partial; never append to or
promote its incomplete final baseline child.

Report service and serialization separately, actual Auth calls/rows, input body
and no-op stringify volume, and adverse small cases. Roster counts are deterministic
work evidence; their diagnostic elapsed times are not clean acceptance. Evaluate
the residual wide-summary parsing separately before deciding whether a narrow
metadata/reconciliation boundary is necessary. That larger change is not included
here. Only a measured adoption decision followed by a new source bank and affected
integrated/local/CI gates can close the chosen part of M9. PR #10 stays withdrawn.
