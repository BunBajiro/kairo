# Independent updater Actions review

11 October 2026. **Pass for independent updater Actions evidence.** [Run 38176822054, attempt 1](https://github.com/BunBajiro/kairo/actions/runs/38176822054) and all 15 job steps succeeded at analysis trigger `cbcd22ff6b57ea2c168fa363332a80d7c414f7d5`, testing candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. The job built and checked the candidate; its test log records 1,004 tests and zero failures. This review performed only API/download, file and numeric checks; no workflow rerun, application execution or source change.

Artifact 11716365992 is 126,078 bytes. API digest, upload-log digest and downloaded ZIP all agree: `657632db44635314ef21d277b442737651c760c9e6c7e2568ae57398015c06fe`. ZIP CRC and all three extracted members pass. Timestamped API receipts, full connector-decoded job log, exact trigger workflow/request and member hashes are saved here. No signed download URL was saved to a file. The raw ZIP is `/tmp/kairo-independent-updater-38176822054/artifact.zip`; `ARTIFACT-RECEIPT.json` binds it and the three raw files.

All 486 tracked source-file tuples match the frozen local candidate, and the CI manifest fingerprint recomputes to `e10ebd999436d0d048178aea2fbe42717478c843aaf629444ed5ce26ea43dd46`. Source verification passed before and after measurement. Eighteen of 20 built files match local; `dist/client/index.html` and `index.rsc` have equal sizes but different hashes. These artifacts do not establish the cause, and no bit-identical-build claim is made. All seven consumed harness hashes match the exact analysis trigger.

The workflow and raw receipt bind the same official build 3552227 archive:99,197,259 bytes, SHA256 `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. The unchanged default Worker path converted it three times; recorded seven-file manifests agree apart from installation time. Original executed assertions validated generated file sizes/hashes, replacement revisions, cookie/CSRF continuity and staging/download cleanup before deleting temporary data. Archive bytes, generated dataset files and response bodies are not inside this artifact.

All 25 inventory activations and six default 60,000 ms windows ran in original control 1/conversion 1/conversion 2/control 2/control 3/conversion 3 order, with all scheduled endpoints and installation at 5 seconds. Actual `Date.now` spans are 60,002/60,001/**59,999**/60,002/60,000/60,001 ms. Conversion 2's 1 ms shortfall is retained; the unchanged nominal delay and complete schedule show no shortened workload override. The 100 ms phase observer captured the transient checking phase in conversions 2/3; all three progressed through downloading, building and ready.

All nine runtime generations have created/summary/closed probes. No unexpected external request, supervisor error, scheduler failure or cleanup warning appears. Both SSE clients reconnect after each replacement. Hosted job completion, the original owner's awaited cleanup and these scoped probes support lifecycle closure; this CI artifact has **no external namespace/subreaper drain receipt**. The separately audited local run supplies that stronger process evidence.

CI observations stay separate from local measurements (AMD EPYC 7763, four logical CPUs, Node 24.19.0):

| Window | Regular HTTP success / attempts | HTTP p 95 / max ms | Recorded runtime CPU ms | Maximum observed RSS MiB | Restart gap ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Control 1 | 230 / 230 | 117.870 / 134.618 | 5,873.101 | 297.766 | — |
| Conversion 1 | 224 / 230 | 117.894 / 150.543 | 22,524.558 | 555.570 | 827 |
| Conversion 2 | 230 / 230 | 123.140 / 193.419 | 23,267.302 | 536.367 | 802 |
| Control 2 | 230 / 230 | 112.177 / 146.557 | 5,440.849 | 299.348 | — |
| Control 3 | 230 / 230 | 115.434 / 149.060 | 5,778.941 | 297.707 | — |
| Conversion 3 | 224 / 230 | 119.575 / 154.033 | 22,398.095 | 590.590 | 783 |

Regular latency excludes install/bootstrap and failed requests. Overall,1,374 of 1,386 HTTP attempts succeeded. **Twelve fetch failures** remain: six each in conversions 1/3, covering all six scheduled endpoints within the announced restart interval. There were **42 SSE connection-error retries**, seven per client per conversion, all before the updated revision. Conversion 2's 193.419 ms maximum was state 43 at 58 seconds, outside building. Availability was interrupted during replacement.

Matched building intervals apply identical scheduled elapsed offsets to each same-suffix control/conversion pair, excluding install/bootstrap. Each subset has 46 successful requests and zero failures:

| Pair | Observed building wall ms | Control → conversion HTTP p 95 ms | Control → conversion HTTP max ms | Building CPU ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 12,240 | 119.030 → 124.195 | 124.183 → 150.543 | 17,371.029 |
| 2 | 12,613 | 112.177 → 144.629 | 128.985 → 146.771 | 17,925.298 |
| 3 | 12,155 | 103.069 → 123.489 | 117.750 → 134.034 | 17,232.939 |

Paired conversion CPU increases were 16,651.457/17,826.453/16,619.154 ms (3.84×/4.28×/3.88× control); observed RSS increases were 257.805/237.020/292.883 MiB. All three building-window p 95 and maximum latencies increase. First-generation event-loop p 95 rises from 10.772/10.510/10.519 ms in controls to 11.198/11.207/11.182 ms in conversions. Conversion first-generation maxima are 173.670/173.933/174.457 ms; replacement-generation maxima are 88.343/123.863/128.057 ms. Exact per-generation and building-phase rows are retained in the audit JSON, without pooling percentiles.

Inventory first initialization cost was 15.571 ms wall /17.426 ms CPU. Warm 24 wall p 50/p 95/max was 9.945/14.458/16.019 ms; CPU was 10.582/21.773/32.545 ms. This measures warm filesystem/process work, not cold-disk startup.

CPU totals cover measured runtime generations and Worker CPU, excluding supervisor and unmetered startup/teardown plus 387/387/385 ms between generation meters. RSS is the maximum across generation/phase meters and 100 ms samples, a process-wide sampled lower bound. Building boundaries have about 100 ms resolution; successful HTTP quantiles use nearest rank. Event-loop histograms themselves were not archived. A second read-only numeric review independently reproduced distributions and paired costs.

These results close this independent updater collection gate with adverse observations retained. They measure conversion overhead at one candidate on one CI host, not an RC16/0.7.3 improvement. Wider performance disposition, clean release-candidate review and merge approval remain separate. `RESULTS-AUDIT.json` records 87 checks, exact pins, raw failure rows and these limits.
