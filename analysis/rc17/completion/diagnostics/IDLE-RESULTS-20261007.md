# Historical idle CPU diagnostic — complete, 7 October 2026

This G9 diagnostic completed all six fresh processes in RC16/original05d/fa6/fa6/original05d/RC16 order. Sources and harnesses passed end verification; all child hashes and CPU arithmetic were independently checked by `idle-startup-summary.mjs`. No network attempts, tick rejections, pending ticks at shutdown or incomplete cleanup occurred.

It retains the original one-second warm-up and 35-second startup-inclusive window, followed by three consecutive 30-second settled windows. Each settled process trajectory is summed; the windows are correlated and are **not** six independent repetitions per source. No profiler, forced GC, UI/OBS clients, JSON/SQL counting wrappers or manual ticks run inside these windows.

| Source | 35-second startup-inclusive CPU ms, two processes | 90-second settled CPU ms, two processes |
|---|---:|---:|
| rc16 | 647.476 / 652.386 | 1436.879 / 1502.159 |
| original05d | 626.891 / 646.529 | 1523.267 / 1521.153 |
| fa6 | 553.730 / 515.438 | 1261.272 / 1239.602 |

Original05d mean startup-inclusive CPU differs by **-2.03%**, and settled CPU by **+3.59%**, versus these RC16 observations. The large historical CI stress increase (+19.47%) was not reproduced in this controlled local lane. A smaller positive settled difference remains; it has not been erased or declared noise. The two-pair sample does not establish a statistical or universal result.

Fa6 mean startup-inclusive CPU is **-17.75%** and settled CPU **-14.91%** versus RC16 here. These observations are consistent with fa6's separately counted removal of redundant work; they are not measurements of current source `508f2d4` or proof of the original05d between-version cause.

All startup-inclusive windows begin with 3,000 queued Politics records and end with zero; settled boundaries have zero queue. Every startup window has 12 successful actual Universe ticks and every settled window 10. Equal counts do not prove equal allocation/instruction cost, and queue drainage alone cannot explain the historical version gap.

**Disposition:** retain the historical adverse observation and record bounded non-reproduction of its magnitude, with causal attribution still limited. Do not invent a historical cause. G9's fresh diagnostic requirement is completed; final frozen-source idle acceptance still requires the unchanged original populated backend lane locally and independently on CI, including all adverse rows. No extra architecture rewrite is justified solely by the old aggregate.

Raw evidence: `idle-causal-20261007/completion.json`, `summary.json`, every source child `idle.json`, and frozen inputs in `inputs-20261007`. G8 state-tail crossover remains a separate lane. This is not clean-review readiness.
