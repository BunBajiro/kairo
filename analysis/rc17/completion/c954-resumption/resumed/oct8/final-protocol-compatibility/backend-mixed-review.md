# Backend/mixed names-protocol compatibility — static review only

Reviewed against application `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` in `/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation`. The inspected Core/index/SSE/name-owner files have no working-tree diff from that commit. Analysis HEAD at inspection: `494036de16c45bc79f1c0a616f2572385c179a9d`; the file hashes below identify the actual reviewed harness. No workers, tests, builds, source capture, CI or remote writes ran. Original harnesses and the previously reviewed final-source gates were not edited.

**No names-protocol-induced false failure was found in these original backend or mixed harnesses. They can retain their original workloads. Their existing passes would not, by themselves, establish the new names protocol's correctness.** Missing assertions and measurement boundaries below need explicit scope or a separate, reviewed diagnostic companion; they do not justify weakening the original assertions.

## Accepted source contract

Application-relative paths:

| Path | Current behavior relevant to this review |
|---|---|
| `server/core.mjs:31–66` | One Core-owned directory; process UUID epoch plus change counter. `connectUI` registers a connection and queues its full `names` bootstrap. Before every `snapshot`, any newer full directory is queued first; the snapshot carries `namesRevision`, without a names body. Delivery is global per connection, independent of pilot. |
| `server/core.mjs:104–111` | `rememberNames` validates additions/changes, persists once and advances the revision only for an actual change. It does not independently broadcast. A changed map may be visible to HTTP before the next snapshot publishes it to an existing SSE connection. |
| `server/core.mjs:297,341–348,445` | Dataset payloads and the public `core.names()` accessor remain available. `core.snapshots()` includes its existing dataset `dataRevision` metadata; names are a separate owner. |
| `server/index.mjs:137–147` | Authenticated `/api/state` contains the full `names` map and `namesRevision`. `/api/events` calls `connectUI` before the connected comment and dataset frames. There is no requirement to fetch `/api/state` before consuming the names bootstrap. |
| `server/sse.mjs:55–70` | The initial large active frame can exceed the waiting-queue byte budget; ordered chunks/backpressure remain supported. A large directory alone is not evidence of a failed admission. |

## Original harness findings

Paths below are relative to `analysis/rc17/harness/`.

| Finding | Exact code path | Consequence / disposition |
|---|---|---|
| Backend direct state remains compatible | `backend/worker.mjs:25–34,44–58` constructs **`{data: core.snapshots(PILOT), names: core.names()}`**, then times complete JSON serialization. `core.names()` remains exported. | No missing accessor or payload-shape failure. Keep this operation exactly as written for the RC16/final comparison. Its `state_payload` row is the direct operation's real bytes; it is not the full `/api/state` envelope and intentionally has no top-level `namesRevision`. Do not replace the operation with `namesSnapshot()` or relabel its bytes as HTTP bytes. |
| Backend HTTP accepts the new envelope but barely checks it | `backend/backend.mjs:23–30` fetches authenticated `/api/state`, decodes the whole body and checks only Assets length. | Added names/resource/dataset revisions do not break this check. HTTP timing includes the actual response and JSON decoding, but no HTTP response byte count, retained body, names identity or revision assertion is emitted. Direct-operation bytes cannot fill that evidence gap. Any full HTTP names/byte contract must come from a separately labelled exact-source diagnostic. |
| Backend summary has no obsolete names-equality assumption | `backend-summary.py:8–36,49` compares settings, fixture fingerprints and measured rows; it explicitly disclaims complete decoded cross-version equality. | Random process epochs/additive metadata cannot cause a names-hash equality failure here. All original typical/stress timing, p95, CPU, startup, idle and payload rows must remain. Do not strip revision bytes from a measured response to make numbers match. |
| Mixed reads real HTTP/SSE admission | `mixed-run.mjs:26,30–36`; `mixed-worker.mjs:65–67,85` | No direct `uiClients.add` bypass, fixed first-event assumption, or access to `snapshot.names` exists. The generic parser accepts the new `names` event, records its type/bytes/hash, and keeps snapshot data/freshness processing intact. One dashboard and one Stream connection remain the expected client counts. No names-specific false failure was identified. |
| Mixed loses protocol evidence after parsing | `mixed-run.mjs:26` retains generic event hash but discards full names packets, `namesRevision`, and whether a snapshot carried a names body. `mixed-run.mjs:36` keeps HTTP bytes but only checks Assets length. | A missing/wrong bootstrap, stale directory revision or snapshot referring to an unseen directory could pass all present mixed assertions. The saved generic hash cannot reconstruct the map/revision or prove frame-order correctness retrospectively. HTTP bytes are retained here, unlike the backend HTTP loop, but decoded names are not. |
| Repeated dataset data does not mean unchanged display semantics | `mixed-summary.mjs:18–20` compares each snapshot's `dataHash` and selected status/timestamps, separately from all other dashboard events. | Its `repeatedDataSnapshots` and `changedFreshnessSnapshots` rows remain valid descriptions of those fields. They do not show whether global names changed between two otherwise identical datasets. Preserve the rows and avoid calling the whole snapshot/display redundant. A names companion may add separate counts, never replace the original data/freshness counts. |
| Mixed byte totals include connection traffic | `mixed-run.mjs:34–35,49,62–63`; `mixed-summary.mjs:20` | SSE connections are initiated before `begin`, but there is no bootstrap-drained barrier. `entry.sse` includes connection/bootstrap frames, and decoding/receipt may overlap the start of the metered window. Original total bytes therefore include the new first-directory cost; they are not solely 28-second steady-state bytes. Also, the summary sums retained events after close while `metrics.sseBytes` was captured before close, so late frames can explain a difference. Preserve both original totals. Any added accounting should show bootstrap/event-type/receive-window bins without altering scheduling or discarding initial cost. |
| Stream assertions remain separate | `mixed-run.mjs:50–61`; `mixed-summary.mjs:8–17` select `client === 'obs-protocol'` and Stream `state` events. | Names delivery uses dashboard `/api/events`; it does not change the Stream state schema. Existing unsafe-unhide, actual outage/recovery, accepted producer state, transport continuity and cleanup checks remain required. Do not normalize dashboard names revisions into Stream state hashes or relax protection assertions. |
| Seeder/provider expectations remain compatible | `backend/fixture.mjs:29–32,54–59`; `mixed-worker.mjs:29–45,49–78` | Fixtures still seed the directory before Core creation. Mixed's existing synthetic `/universe/names` response already supplies the expected IDs/names; Core now batches delivery, not those fixture/provider inputs. Application request counts are fixed at 56 quiet / 92 loaded; the new bootstrap is an SSE frame, not an extra scheduled HTTP request. No provider route or count adjustment is justified by this protocol change. |

`backend/process.mjs`, `backend/metrics.mjs` and `backend/target.mjs` contain process control, measurement and application-root routing, not a names packet assumption. Their existing lifecycle/provenance limitations are separate from this protocol audit; no broader runner redesign is proposed here.

## Minimum separate diagnostic, only where closure needs it

Prefer rebinding the already reviewed names-protocol worker to the exact integrated source for directory semantics and races. That avoids changing the original backend/mixed observer cost. Existing names unit/compiled gates already cover reconnect, global pilot ownership, empty replacement, physical restart and late HTTP; a mixed pass cannot substitute for those checks. Do not add reconnects, forced name changes, extra HTTP requests or a new first-frame barrier to the original timed schedule.

If the coordinator requires **names correctness during the original mixed workload itself**, make a new reviewed copy of the observer, keep the original worker/fixtures/provider schedule, and label this a diagnostic companion. Only add:

1. Preserve full decoded `names` packets in a separate hashed diagnostic file and record each snapshot's `namesRevision` plus whether it owns a `names` field. Assert the candidate's first dashboard frame is its full names bootstrap and precedes connected/dataset/snapshot frames. The current parser labels comments as `heartbeat`; retaining comment text or an explicit connected marker is needed to distinguish the connected comment from later heartbeats.
2. Track the latest directory revision in **wire order**, globally across both pilots. For every candidate snapshot, require a matching already-delivered names revision and no embedded names body. Validate revision syntax and monotonic counters only within that connection's epoch; do not compare UUIDs across fresh worker processes. Do not require one names frame per snapshot, one per pilot, or one frame per `rememberNames` call.
3. Retain full names/revision pairs from the **already scheduled** HTTP reads and verify their field types and same-revision map identity in untimed validation. HTTP may legitimately see a newer map before an SSE publication; requiring every HTTP revision to equal the most recently received SSE revision would introduce a false failure. Snapshot wire-order validation is the reliable boundary. Raw transport metadata and actual encoded bytes stay in evidence; a separate domain projection, if needed, must explicitly name its normalization.
4. Preserve legacy RC16 handling: full unversioned HTTP `names` and names attached to legacy snapshots remain valid. Capability/source identity selects the expected protocol; an absent candidate revision must fail rather than silently falling back. This mixed lane currently runs one candidate at quiet/load/load/quiet, not RC16/final ABBA; do not relabel it as a baseline performance comparison.
5. Add names-event/snapshot byte counts and bootstrap/received-window bins beside the original totals. Keep all original 56/92 request controls, two pilots ×20,000 Assets, 8 maps ×100 nodes, 10 widgets, four 50-stop plans, four map edits/six-read bursts, 28-second windows, latency settings, stale/hostile/recovery transitions and every existing output row/assertion.

The backend ordinary worker needs **no compatibility adapter**. A separate HTTP diagnostic can retain full `/api/state` bytes, names/revision and Core-directory equality outside the original timed loop; the original direct `state` lane and `state_http` latency must remain unchanged. The mixed ordinary observer likewise needs no compatibility patch merely to run. A separate diagnostic is warranted only if other exact-source names evidence does not already close the integration claim.

## Reviewed file identities (SHA256)

| File | SHA256 |
|---|---|
| Application `server/core.mjs` | `06a3792479179b72012049fdea2c85f59f04853a97bb881481b4f81eace9e3d1` |
| Application `server/index.mjs` | `b203440a549aea5d86b8d2606933dfb7155cc0ce6b1767b397526bb486645995` |
| `backend-run.mjs` | `5c823f7483cd571202aaa25bd639289ddd125127b6c72a5963bc0d40c1ec2804` |
| `backend/worker.mjs` | `7fd61ef2979a2aa7788ba86b344db0676912f6dd9c0116ade0dec243c710e363` |
| `backend/backend.mjs` | `2cdbedad3c30e46bafc6f1a1fe249de6430304547c0a6798690fa33cae714e14` |
| `backend/process.mjs` | `f332b425380eef0e6264dc8470aebefaba494099bc57b19acbb18f5d164b5311` |
| `backend/fixture.mjs` | `62ea73e7fc23ab6c69ba7986c2162823146e350e474729f7cc9c478485cc4073` |
| `backend/metrics.mjs` | `e112314633c63fcfe127aeb7a2306f5be83d4728c1cf45ffd5379df427303ce2` |
| `backend/target.mjs` | `a7e061ea9e8e961214f39ec794ff855e947e017bce350368336d891f3b67ad2e` |
| `backend-summary.py` | `54485535bd24e3950dc02af980b09f55eccda382b70d22fadbc71f23e0f02b08` |
| `mixed-run.mjs` | `a3b97855902b704a76b1a16d0f35eb596dd55a41cceecf7ac0a576218a76867c` |
| `mixed-worker.mjs` | `8ca98a9ff54fc7cb055c96dd169023abe98921932a229fbb2ac64684eeeb553e` |
| `mixed-summary.mjs` | `28034ad2874fec0ea39d902f459dfa41c07b407aaa1d4468d5f4023bd5602d3a` |
