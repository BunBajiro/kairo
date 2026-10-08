# F3 owned-function results — isolated proposal

Exact baseline 9afa and four-file trial. Focused semantics passed **24/24**, including 2,048 deterministic event sequences compared with the original spread/retain operation. Three fresh-process ABBA cycles completed: 12 workers, 12 cases each, seven ordinary samples of 40 calls per case after ten warmup calls. All output hashes, retained-identity flags, fixture digests and checksums match. Full tracked source and timing harness hashes remained unchanged.

The kernel evidence supports proceeding to the compiled UI comparison; adoption and full F3 closure remain pending.

| Names | Case | Baseline median ms/call | Trial median ms/call | Change |
|---:|---|---:|---:|---:|
| 100 | full-unchanged | 0.018615 | 0.004461 | -76.0% |
| 100 | partial-unchanged | 0.007104 | 0.000972 | -86.3% |
| 100 | rename-first | 0.012914 | 0.013837 | +7.1% |
| 100 | rename-last | 0.015500 | 0.017535 | +13.1% |
| 100 | addition | 0.012950 | 0.014738 | +13.8% |
| 100 | empty | 0.003876 | 0.000030 | -99.2% |
| 20,000 | full-unchanged | 4.369541 | 0.725959 | -83.4% |
| 20,000 | partial-unchanged | 1.292460 | 0.000516 | -100.0% |
| 20,000 | rename-first | 3.840326 | 3.554878 | -7.4% |
| 20,000 | rename-last | 4.266993 | 3.791065 | -11.2% |
| 20,000 | addition | 3.830332 | 3.941182 | +2.9% |
| 20,000 | empty | 1.371780 | 0.000030 | -100.0% |

Medians summarize the six per-worker medians for each variant; all seven raw samples and each of six nearest AB/BA pair comparisons are retained. The 20,000-name addition is adverse by 0.111 ms (+2.9%) in the aggregate. At 100 names the changed cases are adverse by approximately 0.001–0.002 ms (+7–14%). Unchanged large full maps improve 4.370→0.726 ms; omitted-name subsets keep all prior IDs and avoid scanning/copying that retained map.

This measures already parsed flat maps in Node. It excludes SSE bytes/JSON decoding, React subscriber work, layout and browser responsiveness; no CPU profiler or forced GC was used. The shared performance lock was held, every failed attempt would remain separate, and no source integration is authorized by this component evidence alone. Browser artifacts will receive their own fresh source/build identity.
