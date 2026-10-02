# Kairo 8.0 optimisation and refactoring whitepaper

**Internal instrumented RC17 checkpoint · 2 October 2026 · comparison in progress**

The first optimised candidate removes confirmed repeated work in Maps, itinerary
preparation, ineligible Session feed checks and unchanged OBS broadcasts. It also
replaces several implicit ownership relationships with explicit service and
shutdown contracts. These are whole-Kairo changes, including legacy systems;
the pass is not limited to features introduced between RC1 and RC16.

The first measurements do **not** show a general reduction in memory or idle CPU.
They expose a slower extreme Session route read, increased Core import time,
and small recurring latency costs. Those findings led to a separate refined
candidate. Its new measurements and the independent three-version GitHub run
are pending below. The initial measurements retain their original commit labels.

RC17 is the **internal optimised candidate with benchmarking harnesses**, not the
user-facing release name. The current deliverable is that instrumented runtime,
its reproduction workflow, raw comparison evidence and this whitepaper. After
the findings and observations are reviewed, a clean preparation can be created
and tested for user review. The eventual user-facing release is **8.0**, subject
to that review and explicit approval to merge. No release approval is implied by
a successful benchmark or by producing the internal bundle.

## Source and evidence ledger

| Role | Exact identity | Status |
|---|---|---|
| Post-optimisation 0.7.3 | `239794774320fcdebaa1d76ce8a77c5c25cfc48c` | Historical common-workload reference; corrected local and GitHub ABBA complete |
| Canonical 8.0 RC16 | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | Shared reference for both comparison families |
| Initial internal RC17 | `059b95909dffa82f8b10dfd266954323147d7580` | Initial Maps, backend, memory, mixed, restart and compiled-browser evidence retained |
| Refined internal RC17 | `05d0d4b36c154329006d6772769063db874762da` | Fresh local lanes under review; independent GitHub comparison requested separately |

The initial RC16 source/build fingerprint is
`02558f159d1fea0b7c1670856e40e52894dd62ea76c733c929cc6d9c4af43a85`;
initial RC17 is
`7e1aaeefaa28d131d858e8dc86355f7fb56ce6f5c60366ebcd46309349502c93`.
They cover clean source checkouts and the compiled browser assets, with identical
file sets and bytes verified after measurement. The refined run receives its own
manifest; its numbers must never inherit the earlier fingerprint.

| Evidence family | Method and environment | How it may be used |
|---|---|---|
| Corrected 0.7.3 → RC16 local | Fresh 0.7.3/RC16/RC16/0.7.3; Node 24.19.0, EPYC 9V74 | Establish historical common-backend changes within that run |
| Corrected 0.7.3 → RC16 GitHub | Same balanced order; [run 37073070547](https://github.com/BunBajiro/kairo/actions/runs/37073070547), EPYC 7763, two logical CPUs | Independent historical confirmation; never pool with local timings |
| RC16 → initial RC17 local | Fresh RC16/candidate/candidate/RC16 for Maps, backend and memory; EPYC 9V74, nine visible logical CPUs | Direct paired evidence for the initial candidate's measured lanes |
| Earlier RC16 versus candidate mixed workload | Same recorded settings/runtime/CPU descriptors, but 30 September versus 2 October | Directional comparison with the date/host-state limitation retained |
| New three-version GitHub checkpoint | 0.7.3/RC16/RC16/0.7.3, then RC16/RC17/RC17/RC16, in one sequential job | Pending: two adjacent balanced families with repeated RC16 anchors; not one interleaved three-way experiment |

The new GitHub job builds all three versions, records source/build identities,
retains the unchanged corrected historical harness, then runs the candidate
comparison. A common host and runtime tighten the three-version comparison, but
the two families still have their own order and samples. RC16 appears in both as
an anchor for drift/context; results are not pooled or multiplied into chained
speedup claims. Features absent from 0.7.3, such as the new Maps workspace, have
no invented 0.7.3 zero-cost measurement.

## Measurement controls and corrections

Timing lanes run sequentially under one runtime lock. Source and compiled asset
manifests are captured before and checked after work; each adapter also records
its harness hashes. Diagnostic SQL/body counts, mutation observers and forced-GC
attribution run separately from operation timing. The candidate receives the
same synthetic workload sizes and preserved legacy data as RC16. Real scheduler
success, zero external traffic, full result contracts and output completeness
are required alongside elapsed time.

Three corrections are explicit:

- The original historical fixture seeded the storms cache as `[]`, causing a
  hidden rejected RC16 background projection. The **corrected** historical lane
  seeds `{storms:[],points:[]}` and verifies real Universe tick/subtask success.
  The old frozen evidence remains qualified, rather than overwritten.
- Discovery migration normally sees pre-existing visit rows. Synthetic fixtures
  add those rows after opening storage, so the candidate adapter seeds and
  verifies exactly the same distinct pilot/system memberships **before timing**.
  Candidate Universe queries therefore do not benefit from an artificially
  empty discovery table. Legacy visit ownership remains NULL as intended.
- The first isolated-route diagnostic tried to instrument a frozen atlas array
  and failed before timing. Its `complete:false` result remains under
  `raw/local-comparison-1/routes`. A read-only diagnostic proxy is used in the
  new run. There is no successful initial isolated-route timing to report.

Ranges below are observed repetitions, not confidence intervals. Ten-sample
nearest-rank p95 is the maximum observed sample, not a stable production tail.
The checkpoint's repeated >10% **and** >1 ms rule identifies a follow-up signal;
it is not a universal user-visible threshold. CPU uses percent of one logical
core. RSS, collected live JS heap and V8 reserved heap capacity are different
quantities and are reported separately.

## What 0.7.3 establishes

The earlier optimisations survived the 8.0 feature sprint: selective import-cache
reuse, bounded 30-day working history, prepared snapshot access and indexed
session events remain effective. The corrected comparison finds substantial
additional RC16 startup and residency, plus longer recurring stalls; it does not
establish a general dashboard HTTP regression.

| Corrected stress metric | Local 0.7.3 → RC16 | Independent GitHub 0.7.3 → RC16 |
|---|---|---|
| Idle CPU, % one core | 1.364–1.551 → 1.662–1.666 | 1.538–1.543 → 2.217–2.257 |
| Idle RSS, MiB | 101.57–101.70 → 171.95–172.55 | 107.63–125.97 → 222.00–222.06 |
| Maximum idle loop delay, ms | 39.55–42.30 → 58.92–59.64 | 41.98–42.86 → 80.81–83.23 |
| `startKairo` initialisation, ms | 15.99–16.15 → 154.20–164.52 | 26.18–26.72 → 216.96–223.96 |
| State HTTP p50, ms | 39.68–40.07 → 41.95–44.06 | 49.64–51.37 → 48.45–50.38 |
| Session report p50, ms | 90.28–103.56 → 86.74–95.24 | 113.70–116.26 → 112.74–113.26 |

These columns are separate environments. The initialisation timer excludes
module import and supervisor launch. One narrower historical CI tail signal is
retained: stress Session p95 rises from 130.28–132.62 to 147.54–149.47 ms, with
the ten-sample limitation above. The original database probes still retain the
same 16,355,000-byte working-history output and complete import/history hashes;
the corrected backend-only lane did not rerun those probes.

See the [corrected historical review](../rc16/reviews/followup-legacy-corrected.md)
and [retrieved CI evidence](../rc16/raw/followup/github-run-37073070547/). The
successful focused historical run does not clear the two earlier full follow-up
runs' separate SSE failures.

## Initial RC17: measured improvements and remaining costs

### Maps

The populated-map growth was **quadratic**, rather than exponential. Repeated
workspace-wide reconciliation and canonical-link materialisation made a full
response return each map's data through growing repeated reads. Request-local
preparation now shares that work, scopes selected-map reads and builds reverse
signature bindings in one edge pass.

| Matched operation | RC16 | Initial RC17 | Meaning |
|---|---:|---:|---|
| Full 24-map service median | 307.19 / 330.96 ms | 40.52 / 39.41 ms | 86.8–88.1% lower in the two paired observations |
| Selected map among 24, median | 12.07 / 13.53 ms | 6.51 / 6.65 ms | Lower, but global expiry/scheduling still depends on workspace size |
| Full 24-map SQL executions | 5,432 | 212 | Separate untimed diagnostic |
| Full 24-map canonical link bodies read | 59,400 | 2,376 | Each of the 99 links per map is materialised once |
| Dense signature-edge predicate work | 1,000,000 repeated checks | One binding pass | Same 2,013,934-byte compatible result |

The selected-map contract keeps nodes, links, signatures, access and revisions.
A separate deep-equivalence gate confirms the compatible full payload despite
different JSON property insertion order. Compact summaries are a new consumer
contract: summaries plus selected detail use 237,247 bytes in the 24-map fixture
versus the preserved full workspace's 5,509,856 bytes. That is not compression
of an unchanged response. Full response serialization still takes about 20 ms;
selected access and summaries still pay some shared reconciliation cost.

Browser changes isolate camera frames, coalesce refresh bursts, and maintain
scaled geometry/hit targets. The requested focus-based detail is a per-pilot
Mapper preference in Universe, **off by default**. Collapsed groups preserve real
boundary systems and underlying canonical coordinates/edges. Compiled-browser
correctness is separate from the pending fresh camera performance comparison.
See [Maps measurements](reviews/maps-results-local.md) and
[browser review](reviews/maps-browser.md).

### Sessions and Journey retirement

The retired function is the lifetime Journey presentation/logging and its
derived aggregates, not every form of history. Sessions still own timestamped
travel needed for reports, replay and combat attribution. Discovery membership
and activity notifications have separate services; they no longer depend on a
lifetime Journey ledger. Existing rows and compatibility/export data are
preserved. No blanket history deletion or database reset is part of this pass.

Ineligible `sessionCombat.syncLive()` calls now check the feed deadline before
constructing routes. Across three diagnostic calls, a 10,000-visit Session goes
from **30,000 visit rows to zero SQL statements**. The matched median falls from
51.307–51.903 ms to 0.0034–0.0037 ms. The same removal of history-dependent work
holds for the 100/1,000-visit, older-history and four-pilot fixtures. At these
microsecond candidate values, an enormous portable speedup ratio would imply
unjustified precision.

Explicit route requests still return the complete route; the extreme fixture
retains 3,087,894 serialized bytes and matching route/combat-group hashes.
However, its initial direct route median rises from **48.210–50.052 to
53.897–55.727 ms**, meeting the repeated adverse-signal rule. The refined source
removes an intermediate clone while retaining the SQL/ownership/name contracts;
its result must come from the new run, not these old numbers.

The refactoring also captures Session/ship/sovereignty at the accepted location
observation before asynchronous name resolution, preserving ownership across
rapid transitions. Dedicated tests cover legacy NULL-owned rows, boundaries,
replay/combat, late data and delivery eligibility. The narrow benchmark hashes
do not substitute for these broader contracts. See the
[memory/Sessions results](reviews/memory-results-local.md) and
[Session/goal review](reviews/sessions-goals.md).

### Common backend, memory and loaded operation

Fresh initial RC16→RC17 backend ABBA keeps all real background tick and workload
guards. Typical idle CPU is 0.601–0.851% → 0.654–0.929%: an increase of roughly
9% by means but only 0.053–0.078 percentage points of one core in each pair.
Typical maximum loop delay rises from 17.37–19.25 to 20.97–25.48 ms. Typical
HTTP p95 rises from 11.19–11.61 to 12.77–13.08 ms, while HTTP medians move in
opposite directions across pairs. These are retained adverse observations.
Stress Session medians are 81.75–82.83 → 88.88–93.65 ms; that increase is less
consistent across pairs, but must not disappear from the report.

Collected memory attribution finds about **40.54 → 40.73 MiB** of JS heap after
minimal Core construction. Topology adds about 16.34 MiB in both builds.
Post-close heap is about 34.85 → 35.06 MiB. Ordinary RSS is more variable and
does not establish a memory saving. Ten artificial same-process recreate cycles
grow RSS by about 60 MiB in both builds while live heap grows about 0.4 MiB and
V8 heap capacity expands about 64 MiB. This neither proves a leak nor establishes
a plateau; normal managed activation replaces the child process.

Initial Core module import is 41.311–41.346 → 59.889–65.175 ms, approximately
21 ms higher on average. Construction after import is about 5 ms lower. The
refined candidate makes an eagerly created internationalised date formatter
lazy and cached. That source explanation is a hypothesis until the fresh import
measurement confirms its effect; it is not a whole-app boot claim.

The matched-descriptor, different-date mixed comparison is strongly directional:
loaded dashboard p95 changes from **987.10–1,012.19 to 95.19–97.27 ms**, and
loaded navigation p50 from **788.72–795.27 to 37.94–39.52 ms**. Candidate loaded
CPU is 9.19–9.46% of one core versus the older 22.68–23.20%. Because the old and
new windows were not a fresh balanced source comparison, these values are not
an unqualified tenfold speedup claim. One candidate quiet loop-delay maximum is
worse, and all-loop or all-memory improvements are not established.

All 296 mixed HTTP requests succeed, eight 50-stop plans complete, dashboard and
OBS stay connected, full 3,262,964-byte asset frames arrive for both pilots, and
cleanup leaves zero in-flight/forbidden external requests. Four fresh/stale
protection transitions arrive in every window with no unsafe accepted unhide.
Those gates check state/freshness/order; dedicated tests still cover sensitive
payload sanitisation and real renderer behaviour.

Unchanged OBS binding boundaries still run 29 times per window. Duplicate state
messages drop from 29 to zero; OBS wire bytes drop from 96,296 to 14,179 while
all protection transitions remain. The roughly 85.3% reduction is **OBS fixture
traffic**, not total app traffic: dashboard traffic stays about 8.09 MB per
window. See the [backend/mixed review](reviews/backend-mixed-results-local.md)
for complete controls, adverse metrics and comparison limits.

## Refactoring assessment beyond the measured hot paths

The modular approach is applied at real ownership boundaries, rather than as a
new universal abstraction. Some changes below have behavioural or structural
evidence without an isolated measured speedup; those distinctions remain.

| Area | New or clarified boundary | Required contract / evidence |
|---|---|---|
| Journey, Sessions, discovery, activity | Session travel, durable membership and activity publication have separate owners | Preserved old evidence; explicit ownership and observation-time tests |
| Itineraries | One relevant-pilot context and graph/index per plan, reused across legs/alternatives | Complete fixed-clock route equality and fresh 1/10/50-stop scaling pending |
| Maps | Request-local preparation, summary/detail reads and one refresh owner | Access/revision/expiry equality, SQL body counts and browser controls |
| Goals and combat | Shared request inputs; changed-content writes; service transaction boundary | Per-record accounting, missing-event repair and reentrant completion tests |
| Assets | Iterative linear containment with cached paths | Duplicate/orphan/cycle fallback behaviour retained |
| SSE and stream projections | Shared preparation/encoding and bounded drain-aware frame delivery | Large valid frames complete; blocked protection transitions fail closed |
| Shutdown and managed restart | Stop admission, drain accepted HTTP/semantic/transport work, then dispose storage | Deferred work, rejection/nesting, disconnected requests and positive managed restart |
| ESI reads and commands | Shared header/cooldown policy; explicit request ownership | Read retry and uncertain-command semantics stay distinct; limiter/cache policy retained |
| Market decoding and UI requests | Worker lifetime includes exit/cancellation; late responses remain pilot-scoped | Lifecycle and race tests, without an unsupported blanket latency claim |

The wider review also has explicit **unresolved or partial** items. Completing
the measured hot paths does not mean every earlier P2 recommendation is fixed.

| Earlier recommendation | Disposition in the refined source |
|---|---|
| Staged construction rollback | **Open.** `startKairo` still creates Store/Vault/Auth/ESI/Core before its dataset-start try block, and Core creates Universe/history before awaiting Registry. Post-start shutdown tests do not cover a registry construction failure. Add a narrowly owned rollback and injected startup-failure tests in a follow-up; no coverage is claimed here. |
| Shared report/replay event window | **Partial.** Session travel/observation ownership helpers are shared, but history and replay still spell out their intricate event-window predicates separately. Existing boundary tests preserve behaviour; full predicate consolidation remains open and must not make replay construct a complete report. |
| Auth cold discovery/JWKS flights | **Open.** Per-pilot token-refresh coalescing remains, but public cold metadata/key requests still lack a shared Auth-owned flight. Frequency/latency benefit is unmeasured; no auth optimisation gain is claimed. |
| Name cache ownership | **Addressed structurally.** Goal verified-type/name handoff uses Core's `rememberNames` owner; validation remains distinct from ordinary public name lookup. No independent speedup is assigned. |
| Protection descriptor lookups | **Addressed structurally.** Reuses the existing dataset map rather than introducing another registry. Scope, availability and protection cadence remain gated by tests. |
| Durable growth and replaceable cache retention | **Open policy/measurement work.** Retiring lifetime Journey logging removes one future growth source; Session/event/combat evidence, market archives/jobs and HTTP-cache keys can still grow. There is no general retention solution or purge. First inventory aged rows/bytes by domain and preserve validators/last-good data and durable user evidence. |
| Roster snapshots, cached-market pacing, shared optional public-feed transport | **Deferred pending measured need.** Existing per-owner caching, cooldowns and separate acknowledgement cursors remain. No universal cache/scheduler is introduced. |

These dispositions follow the [whole-app architecture review](../rc16/reviews/followup-whole-app-architecture.md)
and [service review](../rc16/reviews/followup-whole-app-services.md). They make the
remaining maintenance and startup-failure risks reviewable without inflating the
scope or claiming a finished general redesign.

The historical two-CPU GitHub failure was a valid large SSE asset frame rejected
by the old backlog cutoff. The shared transport now supports ordered chunks and
drain, bounded queued work and stall limits. Local mixed continuity alone is not
enough to clear the diagnosed CI condition: the fresh candidate GitHub mixed
lane and transport regressions remain required. See
[transport review](reviews/stream-transport.md).

SQLite, selective import caching, bounded history, the existing celestial LRU,
the shared ESI limiter, updater integrity/rollback and fresh-process activation
are retained. The data does not justify a broad database/cache rewrite or
slower polling as a substitute for eliminating repeated work. Atlas-specific
development remains mainly for the next sprint; shared lifecycle and projection
changes still receive compatibility checks here.

## Refined candidate completion record

This section records reviewed local findings for `05d0d4b36c154329006d6772769063db874762da`
while independent CI and camera acceptance remain pending. Initial059 observations
above will not be overwritten. The refined
source includes the Session allocation change, lazy formatter construction and
the recorded associated source refinement; read its exact diff and test record
alongside the results.

The [refined Maps review](reviews/maps-results-local.md) confirms full 24-map
medians of 315.51/323.92 ms in RC16 versus 39.19/40.07 ms in the refined candidate
(about 87.6% lower in each pair). Selected-map medians are 11.99/11.86 versus
6.58/6.55 ms, with the residual workspace-size cost retained. SQL body-count and
payload-contract reductions remain verified.

The fresh [isolated route review](reviews/routes-results-local.md) now passes.
Ten-stop medians are 170.09/156.63 → 14.36/14.47 ms and 50-stop medians are
737.22/745.39 → 33.16/33.59 ms. The one-stop case is noisier. Complete unmasked
plan hashes match; graph preparation becomes one pass at every size, and SQL
calls become 32 rather than 69/492/2,372. These are isolated gate-itinerary
measurements including acceptance/save/returned clone, not browser or jump-route
latency claims.

The accepted fresh [memory/Sessions review](reviews/memory-results-local.md)
removes the earlier extreme direct-route regression: 10,000-visit route medians
are 47.13–47.20 ms versus matched RC16's 48.96–50.92 ms. The not-due path still
avoids visit SQL. Lazy formatter creation reduces the prior candidate's import
cost, but **does not restore import parity**: refined import is 44.02–46.92 ms
versus matched RC16's 38.27–42.35 ms, +5.16 ms/+12.81% by means, with both pairs
exceeding 10% and 1 ms. Import plus construction is about 8.57 ms/+5.39% higher;
collected Core heap remains about 0.185 MiB higher. This residual is a finding
for review, not grounds to silently declare startup fixed.

Two fresh-memory attempts produced inconsistent mutable progress manifests even
though child outputs completed. They are not accepted evidence. The accepted
third run has a separate, write-once schema-2 completion record (SHA-256
`9681b510fcb6f0697b7df73e97c3a1dfda086c65464b167e2e360a300a79ef9e`)
and verified child/source/harness hashes. The runner now distinguishes progress
from immutable completion. These invalid attempts remain retained and labelled.

| Gate | Status in this report |
|---|---|
| Exact clean refined source/build fingerprint | Await new retained manifest |
| Types, complete regression suite and compiled build | [Refined test-build run 37076793860](https://github.com/BunBajiro/kairo/actions/runs/37076793860) succeeds; internal implementation verification, not user-release approval |
| Fresh Maps and isolated routes | Reviewed local results above; independent CI pending |
| Fresh bounded memory and Session route/not-due controls | Third run accepted; invalid earlier progress-manifest attempts excluded |
| Mixed continuity, OPSEC, restart and compiled Mapper correctness | Local lane commands succeed; detailed review/independent CI pending |
| Fresh browser-camera ABBA | Running / results to review |
| Same-job 0.7.3→RC16 and RC16→refined-RC17 backend comparisons | Workflow prepared; independent result pending |
| Source/harness verification after every lane | Must pass before accepting that lane |
| Downloaded internal bundle archive/hash and evidence review | Pending workflow completion/retrieval |

Remaining interpretation questions include the residual import cost, whether
typical idle/tail costs reproduce in
CI, how much browser camera work is removed at 100/600 populated nodes, and
whether the earlier constrained-runner SSE failure is absent with full privacy
and completeness controls. Those are acceptance questions, not assumed fixes.

## Internal handoff and reproduction

The [comparison workflow](../../.github/workflows/rc17-comparison.yml) takes an
exact candidate SHA and emits raw evidence plus a distinct **internal instrumented
RC17 bundle**. The bundle contains the pinned runtime and compiled client,
external harnesses, whitepaper/reviews, raw evidence, reproduction workflows,
source/build identities, workflow step outcomes and per-file SHA-256 inventory.
Dependencies remain governed by the included lockfile. Instrumentation is
retained alongside the runtime; timing and diagnostic observers remain separate.

`allComparisonLanesPassed` in bundle metadata is true only for an `all` run with
every required lane successful. A focused or failed run may still produce an
explicitly incomplete review bundle. No workflow rewrites pending prose into
approval. Reports retain their stated commit/date, and artifact metadata is the
source for that run's exact completion status.

The bundle records the report's commit and SHA-256 at packaging. That report
necessarily precedes review of the newly generated artifact and may still mark
CI pending. The [canonical repository whitepaper](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/REPORT.md)
is updated separately after retrieval; this later revision and the immutable
internal bundle are complementary handoff artifacts.

Reproduction instructions and environment limits are in the [harness README](README.md).
Exact benchmark reproduction requires clean Git checkouts at the pinned commits;
the included runtime source archive is not itself a Git database. A checked
archive is an internal review record, not an end-user installer.

After review of this checkpoint, any further changes need matching affected
tests and measurements. Clean user-review preparation then removes checkpoint
harnesses, synthetic fixtures and investigation workflows, verifies the extracted
package, and awaits the user's review before 8.0 is merged. That later step is
not the deliverable currently being declared complete.
