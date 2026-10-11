# Final-source all attempt1 — independent review

11 October 2026. **Evidence acceptance fails.** The coordinator reports 30/30 successful children and exit 0, but one retained raw log contradicts its child hash receipt and four supposedly removed temporary directories are present. Preserve the original attempt as failed evidence; do not mark this gate closed or reconstruct the missing log from its embedded result. This review ran no application, browser, benchmark or new experiment.

## Provenance discrepancy

`startup-format-3-3-candidate/stdout.log` is empty. Its child receipt records 3,144 bytes and SHA256 `ba79111e7a3ff5590811c7674728e54fe9da1fcdd31e61f21a8cc6f4bed6e4af`. The final artifact inventory already records the empty-file hash, so that outer inventory agrees with the current bytes while the earlier child binding fails. The parsed result remains embedded in `receipt.json`; it is not a replacement for the lost raw file.

Empty `tmp` directories are present under `startup-core-1-2-candidate`, `startup-core-2-2-candidate`, `startup-format-1-2-candidate`, and `startup-format-3-3-candidate`. Each child records successful removal. The runner awaits recursive removal and then requires `stat` to return ENOENT before recording cleanup; it does not recheck those directories or earlier child log hashes at finalization. `PROVENANCE-DISCREPANCIES.json` preserves exact paths, both log bindings, and inode/ctime/mtime observations. The writer or cause is unknown; these observations do not establish an application defect or surviving process.

The reviewer’s attempt-file accesses use `read_bytes`, `read_text`, `stat`, `exists` and directory enumeration. Its audit outputs are written only under this separate `review` directory. No attempt path was opened for writing, repaired or removed. Git metadata checks do not target attempt logs or temporary directories.

## Verified portions

- All **75 outer inventory entries** (73,076,940 bytes) match; the complete attempt has 77 files including the separately bound inventory and lock-release receipt. Both locks have successful release records linked to the exact final receipt/inventory hashes.
- All 30 children record exit 0, closed pipes, no timeout/interruption/termination, absent owned groups, successful source guards and no log-write errors. Those recorded outcomes are retained separately from the current filesystem discrepancy.
- All **22 harness files** match the before/after fingerprint. Source remains RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` versus candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. Both current checkouts are clean; all 407/486 source files and 20/20 built files match their manifests.
- Both complete decoded common contract payloads agree. Only the documented eight paths remove 9,200 asserted-null candidate `visits.session_id` fields. Both raw payloads, five route shapes/eight pilots, the ownership payload and expected event/visit/route IDs are checked. Different common-file byte hashes reflect serialization ordering; decoded contents agree.
- Original database inputs and reported full-output hashes agree across all four workers. The worker does not retain the underlying response/history payloads, so those hashes cannot be independently recomputed from absent payloads.

## Numeric findings retained for diagnosis

`NUMERIC-AUDIT.json` independently recalculates 128 distribution values, 212 row metric values and all **25 metric summaries/106 matched ABBA metric pairs**, including all 43 positive deltas. Of the row values, **205 are backed by retained raw files and seven formatter values use only the explicitly labeled embedded result**. Summary arithmetic agrees with the receipt; this does not cure the provenance failure. The original joint flag is greater than 1 ms and greater than 10%; smaller losses remain listed.

| Measurement | Baseline mean | Candidate mean | Change |
| --- | ---: | ---: | ---: |
| Cold Core import | 44.449 ms | 38.926 ms | −12.42% |
| Core construction | 120.696 ms | 122.708 ms | +1.67% |
| First Market categories | 0.993 ms | 8.956 ms | +7.962 ms; +801.74% |
| Import + construction + first Market use | 166.138 ms | 170.590 ms | +4.452 ms; +2.68% |
| Cold formatter + first wallet/goal pair | 14.771 ms | 14.989 ms | +0.218 ms; +1.48% |
| Warm wallet/goal pair p50 | 0.0592 ms | 0.0075 ms | −87.33% |
| Database populated first-open | 942.053 ms | 886.406 ms | −5.91% |
| Aged Imports maximum | 508.974 ms | 514.542 ms | +5.568 ms; +1.09% |
| 5,000-event insert batch p50 | 19.708 ms | 18.779 ms | −4.71% |
| 1,000-type history write p50 | 36.312 ms | 34.916 ms | −3.85% |

First Market use is adverse in **all six pairs**, with increases of 6.406–9.048 ms; both pairs in all three cycles exceed the joint flag. Core construction has one flagged pair (+37.451 ms/+31.72%), and its cumulative first-use row has one flagged pair (+49.094 ms/+29.96%). Warm Market p50/p95/max means rise 10.42%/9.63%/23.84%, respectively, at sub-millisecond mean increments. Cold projection import rises 12.17% at a 0.194 ms mean increment. These losses are not hidden by the aggregate import gain or successful functional receipts.

Database write timing pairs improve in this bounded original fixture. Event index bytes remain exactly 2,400,256 and working history JSON exactly 16,355,000 in both arms; these are specific retained size metrics, not a whole-database storage claim. Earlier documented write/storage tradeoffs elsewhere remain valid and are not superseded by this result. The synthetic event batch is not ordinary per-event latency.

The next step is the coordinator’s external final-provenance correction and independently reviewed replacement attempt. This review does not reopen unrelated component decisions, approve performance globally, or advance clean RC17/release acceptance.
