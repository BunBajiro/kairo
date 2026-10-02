# RC17 stream transport refactor

## Confirmed defect

The unchanged RC16 diagnostic in [GitHub run 36718342385](https://github.com/BunBajiro/kairo/actions/runs/36718342385) proves that a valid 3,262,964-byte asset SSE frame made `response.write()` return false. Another Core send destroyed the response 176 ms later because its queued bytes exceeded the fixed 1 MB cutoff. The observer was continuously reading and received an incomplete frame. See the [preserved RC16 confirmation report](../../rc16/reviews/followup-github.md); this diagnostic is causal evidence, not candidate performance data.

## Ownership and bounds

`server/sse.mjs` now owns the response writer shared by Core dashboard events, dataset announcements and OBS Stream. Callers keep their existing client sets and event contracts. Core and Stream skip serialization when they have no clients; a broadcast encodes its JSON and UTF-8 Buffer once for all clients.

The writer sends at most 64 KiB per write and pauses immediately on `write(false)`. Only `drain` resumes ordered delivery. Buffer slices preserve multibyte text across write boundaries. There is no polling loop or write retry loop while blocked. Heartbeats are omitted while actual traffic is pending.

Each response may retain one active frame plus at most **16 MiB and 128 frames** of waiting work. A single active frame can exceed that waiting budget: its legitimate size is not itself evidence of a slow client. This is deliberately a bound relative to the size of one application-produced snapshot, rather than a hard maximum snapshot size. Broadcast clients share the encoded frame; they do not each copy it. An additional burst that exceeds either waiting limit disconnects that response. The bound does not promise uninterrupted service to an arbitrarily slow reader or an arbitrarily large simultaneous burst.

A blocked write has a **15-second no-drain deadline**. Graceful close has a separate **absolute 15-second deadline**, which subsequent drain progress cannot extend. Accepted frames finish in order when possible. A stalled or overloaded connection is destroyed so EventSource can reconnect. Closing or destroyed writers reject later writes; cleanup drops active and queued frame references, removes transport drain/close/finish listeners, and clears both deadlines. The one-shot error handler remains available to contain a later terminal response error.

Index shutdown starts closing dashboard transport while accepted HTTP handlers drain, then awaits its completion. Core retains its existing ownership of semantic work and dependent services. This change does not replace or weaken those lifecycle gates.

## Protection and reconnect

OBS always sends current rendered state on a new connection. When protection changes from visible to hidden and a response is already backpressured, it is disconnected immediately instead of queueing the protection state behind old traffic. The existing OBS renderer handles a transport error by setting `connected=false`, clearing toasts and rendering hidden/unknown protection. Other healthy responses receive the new state normally.

The dashboard reconnect freshness change is separate from this transport helper: its dataset connection coordinator now refreshes the selected pilot after an ordinary reconnect, even when the dataset revision is unchanged, while preserving the single initial startup read and deliberate-update messaging.

## Verification

On 2 October 2026, the combined targeted run passed **30/30 tests**:

```
node --test tests/kairo/sse.test.mjs tests/kairo/stream-shutdown.test.mjs tests/kairo/stream-projections.test.mjs tests/kairo/lifecycle.test.mjs tests/kairo/protection-activity.test.mjs
```

The new transport tests use real loopback HTTP responses for three consecutive multi-megabyte Unicode frames, ordered complete delivery, an active frame larger than the waiting budget, a deliberately unread response, both queue limits, bounded shutdown, fresh OBS reconnect state and protection during backlog. A focused controlled-response test establishes that intermittent drains cannot extend the absolute close deadline. Existing lifecycle tests include both a connected and an early-disconnected accepted HTTP write, with storage closing last. Core/index syntax checks also passed.

The initial sandbox-only invocation was blocked by `listen EPERM`; the successful run used approved localhost socket access. These are correctness tests. They do not establish a throughput, CPU or memory improvement, and they do not replace the forthcoming frozen-candidate mixed workload and GitHub continuity gates.
