# Independent result review — material adverse rows

After `BANK.json` was frozen, the independent frontend reviewer checked the receipts and raw/summary rows and agreed with the mixed-cost interpretation. This addendum leaves the banked result and raw observations unchanged.

Under the shared rule of a repeated nearest-pair increase greater than 10% and 1 ms, two task-counter rows need explicit disposition:

| Phase | First nearest pair | Second nearest pair | Interpretation |
| --- | ---: | ---: | --- |
| Markets running | +10.118 ms / +60.50% | +19.168 ms / +126.73% | Documented active-job cadence changes from 4 s to 2 s; three versus one requests in each window. |
| Source first use | +7.264 ms / +38.18% | +3.913 ms / +22.77% | Repeated material renderer-task cost; keep as an explicit startup-work tradeoff or investigate further before broader F9 closure. |

The three-drag row is −93.997 ms / −9.91% in the first pair and +204.624 ms / +24.19% in the second. It has one material adverse arm but does not repeat the shared threshold. Its median is adverse and remains reported; no speedup or statistical non-regression is inferred.

“Source first use” is a new source target after the declared Studio/Markets/OBS workload in that browser process. It is not whole-application startup or an independently cold browser. Source functional-readiness wall time increased by 2.312 ms / 3.66% and 4.003 ms / 6.61%; those do not cross the same percentage threshold. The repeated threshold applies to renderer task counters. Script time is nearly unchanged; layout/style and other task work contribute to the increase. The bundled four-file ablation and this ordinary counter lane do not isolate the unique cause to a specific renderer statement.

Root owns the explicit tradeoff decision. Retaining the renderer's changed-write and render-before-storage safety boundaries may be justified, but this row must not be relabeled noise or an established speed improvement. If further attribution is required, the smallest next measurement is direct source first use in a fresh browser with the same 32-element state and built bytes, keeping the output/capture/source guards; a separate profile can then attribute a repeated cost. Do not change safety order or discard the current adverse observations to obtain a lower number.
