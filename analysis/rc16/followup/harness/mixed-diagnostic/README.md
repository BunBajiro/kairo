# Mixed dashboard SSE diagnosis

This separate copy runs one quiet 28-second workload against canonical RC16. It preserves the frozen fixture, request schedule and continuity/protection assertions. The original failed GitHub evidence remains unchanged.

Run from the checkout after installing dependencies:

```sh
KAIRO_PERF_APP_ROOT="$PWD" node analysis/rc16/followup/harness/mixed-diagnostic/mixed-run.mjs analysis/rc16/raw/followup/mixed-diagnostic
```

The runner obtains the shared checkpoint lock itself. The explicit application root is required because this copy is nested more deeply. Output is `mixed-diagnostic.json`, retained even when the continuity assertion fails. It captures source and harness/helper identities before and after execution.

The worker observes dashboard `uiClients.add`, then wraps that response's real `write` and `destroy` methods and observes `drain`/`close`. Every original method receives the same receiver and arguments; the write result is returned unchanged. Each record includes queued bytes and write metadata; destroy records include a call stack. No extra error listener changes EventEmitter error handling. Snapshot pilot/key are read from the first 1,024 characters, without parsing the large payload. No backpressure threshold, frame content, read loop, reconnect policy or continuity gate is changed. The bounded 2,000-row trace has an explicit no-truncation assertion.

**All timing and memory values are diagnostic only.** Byte-length measurement, trace recording and destroy stack capture perturb execution. A positive reproduction can identify the actual application call site and queued frame; a non-reproduction cannot disprove the retained original CI failure. Do not combine these timings with balanced performance comparisons. The observer is a protocol client without automatic reconnect; this diagnosis does not establish browser recovery behavior.
