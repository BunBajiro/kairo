# Names directory protocol trial

Status: implementation and harness preparation; no names semantic test, build or timed workload has run. Adoption remains conditional on independent review, semantic controls and matched ordinary evidence. PR #10 stays withdrawn. This is not a Clean RC17 handoff.

## Frozen comparison scope

Both isolated trees start at selected-lineage commit `22773cc7cb6e83ac51e412565ba65c101613536a` and include the accepted two-file hidden saved-binding filter from the `bindings-names-985` lane. The baseline is therefore c9-equivalent for this scoped comparison. Neither tree includes the later one-file Assets context boundary now integrated in root source `a7b1bf97b0073695926c443e52d523638e59e48d`. Final combined integration must include that boundary and all subsequent accepted changes. Excluded build #55 / `508f2d4` is not an input.

Trees are `kairo-names-227-baseline` and `kairo-names-227-candidate`. The six-file candidate difference is recorded in `proposal-files.json`; complete source inventories and an exact patch accompany it. Any review correction invalidates the earlier candidate inventory; manifests must be regenerated before runtime. Root alone owns shared-source integration and remote banking.

## Contract

Core remains the owner of its persisted global name map. An accepted name change increments a process-qualified revision. Individual `rememberNames` calls do not send the directory. Before each snapshot publication, Core sends one encoded authoritative full-map `names` event to clients whose per-client delivery revision is behind, then sends the snapshot with a revision and no name body. A separate WeakMap avoids allowing one new client bootstrap to mark older clients current. Every new UI connection receives the current full map. Zero clients means zero directory/SSE encoding; changes still persist and reconnect receives them. Existing SSE queues, failure removal and accepted-close draining remain the transport owners.

The private `/state` response retains its full names map and adds the matching revision. The public Stream/OBS payload shape is unchanged. This trial deliberately pays a full-map SSE bootstrap in addition to HTTP startup; measure and report that extra cost. It is not free.

The dashboard processes global names events independently of the selected pilot. A changed authoritative directory replaces the map, permitting empty reset and removal. The same revision retains identity without enumerating keys. Counters are ordered only within a process epoch. A connection/event capture fences delayed HTTP reads. First open does not invalidate a still-pending initial state response, because opening alone supplies no newer directory evidence. Reconnect invalidates prior reads; its first names event establishes the process epoch. Disconnect invalidates outstanding reads and allows fresh HTTP state to recover the directory even while SSE remains unavailable. An initial error followed by first successful open requests a scoped refresh if the initial state was fenced. Existing data/resource/ancillary fences remain active.

Legacy contract is explicit: unversioned full `/state.names` replaces the map with existing retainValue identity semantics, including removals; unversioned snapshot names merge with existing mergeResourceNames semantics. Legacy mutation invalidates revision-only identity reuse but retains the last epoch/counter for rejection of older versioned packets. The next authoritative versioned packet may recover even the same revision. Existing manual legacy fixtures remain legacy tests; they cannot establish the new wire protocol's performance.

## Independent review findings retained

The first read-only review found two ordering gaps in the initial proposal: unconditional first-open invalidation could strand a delayed unversioned initial HTTP map; an established epoch could not recover to a fresh HTTP epoch while SSE remained down. Both are addressed with explicit first-open/disconnect semantics and three regression tests. No runtime had run before these corrections. The initial patch/inventories must be preserved in the review archive and the final proposal frozen again before execution.

## Semantic gate

New owner tests cover same-revision identity/no enumeration, add/rename, two-pilot independence, late HTTP, same-epoch counter order, reconnect/process reset, empty/removal, legacy merge and replacement, invalid envelopes, initial legacy HTTP across EventSource open, disconnect recovery and first-open-after-error recovery. Actual Core tests cover bootstrap, batching, per-client tracking, zero-client encoding, disconnect/reconnect, backpressure/failure, accepted close, real HTTP state/events and new process epoch reset. Existing SSE, scoped-refresh, resource-state, dataset-generation, UI revision and Core lifecycle tests remain required. Exact commands and results belong in the run receipt; test count is a result, not a predeclared pass claim.

## Matched backend measurements

Use actual Core/Store/SSE implementations with an immediate synthetic local ESI adapter, two pilot IDs 42/43, Wallet-only enabled modules and quiesced background timers. Directory cardinalities are 100, 1,000, 10,000 and 20,000 with 0/1/3 consuming local clients. Aligned sparse IDs are 4200000+i and 4300000+i, with labels `Asset #####` / `Second Asset #####`; the 20,000 map is 550,001 JSON bytes.

Record unchanged four-Wallet-snapshot bursts, one real name change plus a burst, eight changes batched before a burst, first connection, reconnect and full state serialization. Timing is ordinary production code without stringify/count wrappers; counter/transport/domain checks run separately. Capture emitted packets outside timed windows and reconstitute names plus selected-pilot snapshots for comparison. Only random process epoch prefixes are normalized; application values and revision counters are retained. Different wire shapes/bytes are the intended intervention and must not be called byte-equivalent. Initial connection/bootstrap costs are reported separately, including the extra full map in the candidate. Every adverse row remains in evidence.

Run fresh processes in ABBA order only after semantic/counter gates pass and root grants the serialized performance slot. Source and harness hashes must match before and after each process. Use `/tmp/kairo-performance.lock`. No overlapping builds, browser profiles, compression or other timed lanes.

## Compiled browser gate

The ordinary browser comparison must consume actual Core-emitted packets, not the old worker's manually constructed full-name snapshot envelopes. Preserve two pilots with 10,000 assets each and the exact 550,001-byte names representation. Drive actual `core.sync(42)` under a controlled server-domain Date.now, advancing beyond Wallet's real next deadline while keeping other enabled datasets' expiresAt and refreshAt in 2099; browser clock and 40 ms publication gaps remain real. All required scopes are present. A synthetic auth.access adapter and gated fake ESI fetcher keep transport local and deterministic. Counter/packet capture remains outside ordinary browser timing.

Measure the existing 20 Wallet-event sequence in the populated Assets view, initial bootstrap and a changed directory. Repeat same-revision identity, different-pilot name changes, pilot switches, delayed HTTP and recovery semantics in the compiled dashboard. Preserve all legacy fixture results as declared fallback coverage. Profile only after ordinary evidence if a concrete residual needs attribution; sampled stack time is not added to ordinary script duration. Final combined acceptance must retain the hidden-filter adverse cases (visible10/20k/0 and visible50/10k/1) and include the accepted Assets boundary.
