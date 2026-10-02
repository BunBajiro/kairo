# Initial RC17 candidate: backend and mixed-operation evidence

Candidate `059b95909dffa82f8b10dfd266954323147d7580` completes the common backend
ABBA and all four mixed-operation windows. The mixed workload has substantially
less contention than the earlier RC16 observations, and unchanged stream
updates no longer produce repeated wire states. The fresh common-workload ABBA
does **not** establish a blanket CPU or memory improvement: small recurring idle
costs and several Session/tail measurements are higher and remain visible below.

This report applies to that exact initial candidate. A later implementation
change needs its own identity and any affected retest; these results must not be
silently relabelled as measurements of a later RC17 commit.

## Source, workload and independent checks

The [backend provenance](../raw/local-comparison-2/backend/provenance.json) binds
clean canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and the candidate
above. Source/build manifests verify 407 files plus 20 assets for RC16 and 439
files plus 24 assets for the candidate, before and after measurement. All nine
recorded backend harness/helper hashes independently match. The four retained
local reports independently reproduce the existing summary exactly when the
summarizer is run against temporary copies; original evidence remains unchanged.

The backend ABBA runs from 22:57:20.421 to 23:02:49.073 UTC on 2 October 2026
(328.652 seconds). It uses Node 24.19.0, Linux x64 kernel 6.18.44, AMD EPYC 9V74,
nine visible logical CPUs, and the same recorded memory/environment in all four
entries. Order is RC16 → candidate → candidate → RC16. Each has typical and
stress profiles, 35-second idle observations, three warmups and ten measured
samples for each of eight direct operations, plus authenticated state HTTP.

All eight profiles complete. Both builds validate the corrected storms object
and real Universe feed state. Every idle meter records 12 real tick calls and
12 successes, no rejected subtasks, and zero external request attempts. Later
HTTP meters reach 12 or 13 successful ticks without rejection. Workload
fingerprints match and the real scheduler remains active; SDE automatic start
is deferred and public feed caches are held fresh.

The candidate fixture explicitly seeds and validates 100 distinct pilot/system
discovery memberships before timing. This reproduces upgrading pre-existing
legacy visits; otherwise synthetic insertion after `openStore` would leave the
new table artificially empty. Legacy visits retain NULL Session ownership.
The `journey` metric is the retained **cold compatibility reader**, not an active
lifetime-log feature or ordinary Universe projection.

## Fresh common-backend ABBA

Ranges are the two observed run medians, except startup (one start per profile)
and idle metrics (one 35-second window per profile). They are not confidence
intervals. CPU is a percentage of one logical core.

| Metric | Typical RC16 → candidate | Stress RC16 → candidate |
|---|---|---|
| Idle CPU | 0.601–0.851 → 0.654–0.929% | 1.640–1.657 → 1.668–1.735% |
| Idle RSS | 151.55–158.52 → 153.08–162.51 MiB | 205.92–207.65 → 181.17–212.62 MiB |
| Maximum idle loop delay | 17.37–19.25 → 20.97–25.48 ms | 53.90–55.38 → 49.91–64.32 ms |
| `startKairo` initialisation | 146.22–151.58 → 148.10–152.71 ms | 153.96–179.63 → 141.46–155.05 ms |
| State HTTP p50 | 9.14–10.48 → 9.36–10.32 ms | 38.47–39.86 → 37.51–43.29 ms |
| Direct state projection/serialization p50 | 3.88–3.91 → 3.91–4.33 ms | 22.09–22.69 → 21.12–21.36 ms |
| Session report p50 | 14.62–15.33 → 15.38–16.70 ms | 81.75–82.83 → 88.88–93.65 ms |
| Imports after unrelated write p50 | 0.56–0.59 → 0.56–0.59 ms | 0.66–0.67 → 0.70–0.72 ms |

Typical idle CPU increases 9.1% by the ratio of means, but the actual paired
increase is **0.053–0.078 percentage points of one core**. Stress idle CPU rises
about 0.028–0.078 points (+3.2% by the ratio of means). These observations do not
support a general idle-CPU reduction.

Two latency metrics meet the checkpoint's repeated >10% **and** >1 ms signal
rule in both pairs:

- Typical maximum idle loop delay rises by 3.60 and 6.23 ms (+20.8% and +32.3%).
  The final observed maxima remain 20.97–25.48 ms. This is a retained recurring
  stall signal, not proof of a particular service causing it.
- Typical state-HTTP p95 rises from 11.19–11.61 to 12.77–13.08 ms (+13.3% by
  the ratio of means). With ten samples, nearest-rank p95 is the **largest
  observed request**, not a stable population tail estimate. HTTP medians move
  in opposite directions between the two pairs and are broadly unchanged.

Stress Session-report medians increase +10.9% by the ratio of means. The paired
changes are +14.6% (+11.90 ms) and +7.3% (+6.06 ms), so this does not meet the
same repeated >10% gate, but it is still a real adverse observation to retain.
The separate [memory/Sessions review](memory-results-local.md) also identifies
the direct extreme 10,000-visit route regression. Do not describe every Session
operation as faster based on the successful not-due optimisation.

Stress cold Journey medians are 3.52–3.85 → 3.68–5.22 ms: one slower candidate
observation, one slightly faster. Selective import-cache reuse remains effective.
Other small percentage changes, such as warm imports or market browse, are
sub-millisecond or inconsistent; the full values remain in the
[backend summary](../raw/local-comparison-2/backend/summary.json).

Stress RSS has substantial candidate spread; its −4.8% mean change is not a
robust memory-saving claim. These are ordinary process-residency snapshots with
no forced collection. Separate collected-heap attribution finds the minimal
Core budget essentially unchanged/slightly higher. Likewise, a lower stress
startup mean does not establish faster whole-app startup: this timer excludes
module import, which is slower in the separate minimal-component lane.

## Mixed workload: completeness and protection controls

The [candidate mixed report](../raw/local-comparison-2/mixed/mixed.json) runs
23:02:50.319–23:04:45.423 UTC on 2 October 2026. Its settings and recorded
Node/CPU/logical-CPU descriptors exactly match the earlier
[RC16 local report](../../rc16/raw/followup/mixed/mixed.json), which ran
12:27:41.538–12:29:36.785 UTC on 30 September. Matching descriptors do not prove
the same physical host state after two days. This is a sequential historical
comparison, **not** a new RC16/candidate ABBA performed in one timing session.
Do not pool samples, quote an unqualified “10× faster”, or divide these values
into desktop performance guarantees.

Within each run, quiet → loaded → loaded → quiet windows use the same 28-second
schedule: two pilots with 20,000 assets each, 50,000 events, 2,000 legacy visits,
one active Session, eight 100-node maps, ten actual stream widgets, and fixed
synthetic provider latency. Loaded windows add four 50-stop navigation plans
and four map-edit/read bursts. Candidate discovery preparation is the explicit
upgrade-equivalent addition described above; canonical workload counts remain
unchanged. The original frozen RC16 harness has not been edited.

All **296 HTTP requests** return 200: 56 in each quiet window and 92 in each
loaded window. All eight submitted navigation plans return their required
50 segments. Both SSE consumers stay connected in all four windows, report no
parser/transport errors, and receive each pilot's complete **3,262,964-byte asset
frame**. Dashboard packet/byte totals match the corresponding earlier RC16 local
windows. Every cleanup finishes with zero in-flight transport and zero forbidden
external requests. All eight mixed harness/helper hashes and the candidate
source/build fingerprint verify at the end.

The actual fake provider produces hostile location, recovered highsec, a real
503/unavailable phase, and later recovery. Production storage records stale
location during the outage. All four windows classify hostile and unavailable
states as hidden, and record **zero unsafe accepted unhide emissions**. Every
observed wire unhide matches a preceding accepted, fresh highsec state with an
unexpired protection deadline. The four required protection transitions reach
the OBS protocol consumer in every window, with commit-to-receipt observations
of 16–38 ms in the candidate.

These gates validate protection-state freshness, ordering and fail-closed
signals. They do not independently inspect every possible sensitive field in an
OBS payload or simulate a real browser-source renderer; sanitisation/content
contracts remain covered by their dedicated tests. Both the old local RC16 and
the candidate local run have continuous SSE. Therefore this local comparison
alone does not reproduce and clear the previously diagnosed two-CPU GitHub
large-frame failure; that needs the candidate CI result alongside transport
regression tests.

## Mixed contention and stream work

| Observation | Earlier RC16 local | Candidate local |
|---|---:|---:|
| Quiet dashboard p95 | 77.41–77.79 ms | 63.86–69.03 ms |
| Loaded dashboard p95 | 987.10–1,012.19 ms | 95.19–97.27 ms |
| Loaded stream-state HTTP p95 | 870.62–880.31 ms | 104.25–106.31 ms |
| Loaded 50-stop navigation p50 | 788.72–795.27 ms | 37.94–39.52 ms |
| Loaded server maximum loop delay | 886.57–984.09 ms | 131.79–145.75 ms |
| Loaded CPU (% one core) | 22.68–23.20% | 9.19–9.46% |
| Quiet CPU (% one core) | 7.47–8.24% | 6.16–6.25% |
| Quiet maximum loop delay | 115.08–120.46 ms | 106.43–187.96 ms |

The candidate's loaded dashboard p95 is now about 26–33 ms above its quiet
range, instead of the earlier roughly 0.9-second added delay. This is strong
directional evidence of reduced combined route/map contention, consistent with
the request-local preparation changes. Fresh isolated route and Maps ABBA
results supply the tighter before/after attribution. The quiet maximum loop
delay does **not** uniformly improve: one candidate window reaches 187.96 ms.
Avoid a blanket event-loop improvement claim.

The stream duplication result is structural and explicit. Every old and new
window still invokes the binding update boundary 29 times with unchanged
content. RC16 sends 29 duplicate state messages among 34; the candidate sends
**zero duplicate states among five**. OBS event bytes fall from 96,296 to
14,179 per window (about 85.3%), while all four protection transitions remain.
This proves suppression of redundant wire work; it does not mean binding
evaluation never runs. Shared per-update preparation is a separate refactoring.

The dashboard still emits seven equal-data snapshots whose freshness/status
metadata changed, and still sends its large asset frames. Its roughly 8.09 MB
per-window traffic is unchanged. Thus the 85.3% reduction applies to **OBS
traffic in this fixture**, not total dashboard-plus-OBS traffic or all future
stream configurations. Heartbeats and fresh connection state remain part of the
transport contract.

No source, fixture or running harness was modified for this analysis. No extra
benchmark was started. These results remain evidence for the pinned initial
candidate, with adverse signals and historical-comparison limits preserved.
