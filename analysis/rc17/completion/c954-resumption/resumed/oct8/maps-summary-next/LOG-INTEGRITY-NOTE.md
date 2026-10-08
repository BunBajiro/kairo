# Dense confirmation log integrity investigation

The measurement JSON and source manifests match the completed inventory. Two retained progress logs do not match all earlier hashes; `dense-confirmation-attempt1/post-run-integrity-audit.json` preserves the comparison and observed partial contents. Neither original receipts nor logs were changed to hide the gap.

The runner gives every process a distinct label/folder/log. Each log opens exactly once with `wx`, which rejects an existing path. The original timing harness only writes its JSON output; it does not open, truncate, rename or delete the log path. There is no path reuse in the schedule. The wrapper holds both locks and the child receives the expected lock-held environment variable, so the original harness does not launch another flock wrapper. Its synchronous git children capture their own output.

Both stdout and stderr inherit the same regular-file descriptor. The parent awaits the child `exit` event, closes its own file handle, and then reads/hashes the log. It does not separately await child `close`, wait for a piped stream `finish`, or call fsync. The harness writes per-case progress to stderr and its final JSON destination through `console.log`. A lifecycle or filesystem visibility issue therefore remains worth investigating; no cause is established. Plain late append alone would not explain a previously hashed full file later appearing shorter.

An in-memory diagnostic assembled the deterministic expected complete progress text from the verified case order and final output path, solely to compare its hash with the existing receipt. It was not written over any log:

| Log | Complete expected bytes | Expected complete SHA-256 equals child receipt | Retained bytes | Retained content |
|---|---:|---|---:|---|
| A2.log | 486 | `dde5a505f54c96392e9c9c2288ddf8a357166f87732fc0349ed46fc341ddab63` | 200 | Exact prefix of expected full text |
| B4.log | 478 | `30051b2f8214ea91481d3ad013abb0a7420445cc47413979c1432638901cb530` | 244 | Exact prefix of expected full text |

A2 had already become partial by final inventory; B4's final inventory still recorded the complete hash/478 bytes. This constrains the sequence but does not identify a writer, capture layer or workspace mechanism.

For a future separately frozen runner, capture stdout/stderr through pipes, await child `close` plus stream completion, then write the finalized captured bytes once to a new log path and hash those exact bytes. Preserve the original runner used here, and verify on-disk hashes again before banking. This is a proposed evidence-capture improvement, not a retroactive repair or proof that these ordinary measurements failed. No measurement was repeated.
