# Proposed next trial: full names only when the directory changes

This is a design proposal, not an implemented or accepted protocol. The current backend lane measured about 21 ms and 2.20 MB per client for four Wallet publications with the frontend-aligned 20,000-name directory. The frontend profile independently found repeated names checks and JSON parsing material. Keeping a full directory in every unchanged snapshot is therefore not a supported no-change decision.

The narrower trial is a revisioned, authoritative full map on change. Per-key deltas would add replay, deletion and gap recovery bookkeeping that the evidence does not yet require. The frontend owner agrees with evaluating this first.

## Ownership and wire shape

- Core already owns `namesMap` and validates writes in `rememberNames`. Keep that owner. Add a process-qualified names revision that advances only when accepted names actually change. Preserve the existing Store persistence behavior.
- Batch publication at an existing snapshot/publication boundary. Do not broadcast the whole directory from every `rememberNames` call: bounded enrichment can resolve many independent names and would otherwise publish many large intermediate maps.
- Use a dedicated private UI `names` SSE event carrying the full map and its revision. Every UI processes it regardless of selected pilot. A single global 'already sent' marker on pilot-specific snapshots is invalid because dashboards ignore snapshots for other pilots.
- Ordinary snapshot events no longer carry the full names map; they can carry the names revision if it helps detect a missing directory. Snapshots remain ordered after any names publication required by that boundary. Stream/OBS public output does not gain names or private metadata.
- Each `/events` connection receives the current authoritative full map. The existing `/state` response also remains authoritative and includes the matching revision. First use and reconnect therefore pay the full directory once, and that extra connection cost must be measured explicitly.
- Broadcast encoding remains once per audience. A new connection bootstrap must not mark names as delivered to older clients that have not received a changed directory. Zero-client operation must neither encode a directory nor prevent a later connection from bootstrapping it.

## Frontend ordering requirements

Use the process-qualified revision and the existing `ancillaryEvents.names` fence together. A delayed `/state` response must not replace a directory installed by a newer names event. State requests already capture ancillary counters before awaiting HTTP; dedicated names events must advance the names counter independently of pilot selection. An unchanged revision can retain the previous map identity without scanning all keys. An authoritative changed map may replace the directory, but cannot silently merge across an obsolete process generation.

Define and test the epoch transition explicitly before coding. SSE delivery is ordered within a connection, but a normal state request can overlap reconnect or a dataset restart. A revision from an old process must not be accepted after the new connection's directory, even if its numeric counter is larger. A new process/reset must be allowed to replace the old map, including removing names that no longer exist. Do not rely on a bare integer comparison across generations.

## Required semantic tests

1. Two dashboards select different pilots. A names change arising from either pilot reaches both; each still filters unrelated snapshot data.
2. Rename and add names; unchanged names do not advance the revision or transmit a repeated body. Repeated unchanged snapshots retain frontend names identity.
3. The first connection, an additional connection and reconnect each receive complete current names. Existing clients do not miss a concurrent change when a new client bootstraps.
4. No clients during many changes, followed by a connection; failed or backpressured clients; disconnected clients; accepted Core close work. Existing SSE bounds and lifecycle ownership remain.
5. State-before-event and event-before-state orderings, late old state responses, rapid pilot switches, recovery, process epoch changes and reset to an empty/new directory.
6. Several concurrent enrichment results before a snapshot publication produce a bounded number of directory events. Distinct changes across publication boundaries remain fresh.
7. Public Stream payloads stay sanitized and OPSEC publication remains immediate and independent.

## Matched measurements

Freeze the actual resulting source and harnesses. Repeat the backend 100/1,000/10,000/20,000-name matrix with 0/1/3 consuming clients. Compare unchanged bursts, a real name change, first connection/reconnect, and several names changes arriving through enrichment. Reconstituted frontend-visible data must match the baseline even though wire events differ.

Repeat the frontend's actual 20-event Wallet sequence with the same sparse IDs and strings: 10,000 `4200000+i` → `Asset #####`, plus 10,000 `4300000+i` → `Second Asset #####`, totaling 550,001 JSON bytes. Keep ordinary browser timings separate from profiling, and retain initial full-map costs, changed-map costs and adverse rows. Report remaining Context/render work separately; reducing names bytes cannot establish that all frontend work is closed.
