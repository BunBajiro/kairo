"""Summarize existing memory/session measurements; does not execute Kairo."""
import hashlib
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

raw = Path(sys.argv[1]).resolve()
run = json.loads((raw / "memory-all-run.json").read_text())
assert run["complete"] and run["endVerified"]
memory = defaultdict(list)
sessions = defaultdict(list)
sources = {}
environment = None
assert len(run["results"]) == 14
for row in run["results"]:
    path = raw / row["result"]
    content = path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == row["sha256"], path
    sample = json.loads(content)
    assert row["complete"] and row["exitCode"] == 0
    assert sample["complete"] and sample["endVerified"]
    if environment is None:
        environment = sample["environment"]
    assert sample["environment"] == environment
    sources[sample["build"]] = sample["sourceCommit"]
    assert sample["sourceFingerprint"] == run["sources"][sample["build"]]["fingerprint"]
    assert sample["networkAttempts"] == 0
    if "markers" in sample:
        for marker in sample["markers"]:
            memory[(sample["mode"], sample["build"], marker["name"])].append(marker)
    elif sample["mode"] == "timings":
        for fixture in sample["results"]:
            f = fixture["fixture"]
            for operation in fixture["operations"]:
                sessions[(sample["build"], f["visits"], f["pilots"], f["olderVisits"], operation["name"])].append(operation["medianMs"])
assert all(len(rows) == 2 for rows in memory.values())
assert all(len(rows) == 2 for rows in sessions.values())
assert run["semanticFixtureComparisons"] == 5
out = {
    "schema": 1,
    "complete": True,
    "sourceCommits": sources,
    "environment": environment,
    "runManifestSha256": hashlib.sha256((raw / "memory-all-run.json").read_bytes()).hexdigest(),
    "method": "Median across two independent ABBA child runs for each marker or per-run operation median. Descriptive small-n summaries; not confidence bounds. Forced-GC retention and ordinary snapshots remain separate.",
    "memory": [dict(mode=k[0], build=k[1], marker=k[2], independentRuns=len(v), observations=v,
        **{field: statistics.median(row[field] for row in v) for field in ["rss", "heapUsed", "heapTotal", "external", "arrayBuffers"]},
        **({"phaseElapsedMs": statistics.median(row["sincePreviousMarkerMs"] for row in v)} if k[0] == "ordinary" else {}))
        for k, v in memory.items()],
    "sessions": [dict(build=k[0], visits=k[1], pilots=k[2], olderVisits=k[3], operation=k[4], medianMs=statistics.median(v), perRunMediansMs=v)
        for k, v in sessions.items()],
    "semanticFixtureComparisons": run["semanticFixtureComparisons"],
}
(raw / "memory-summary.json").write_text(json.dumps(out, indent=2) + "\n")
print(raw / "memory-summary.json")
