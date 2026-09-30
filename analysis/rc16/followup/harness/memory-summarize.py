"""Summarize existing memory/session measurements; does not execute Kairo."""
import hashlib
import json
import statistics
from collections import defaultdict
from pathlib import Path

analysis = Path(__file__).resolve().parents[2]
raw = analysis / "raw" / "followup"
run = json.loads((raw / "memory-all-run.json").read_text())
memory = defaultdict(list)
sessions = defaultdict(list)
sources = {}
for row in run["results"]:
    path = raw / row["result"]
    content = path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == row["sha256"], path
    sample = json.loads(content)
    sources[sample["build"]] = sample["sourceCommit"]
    assert sample["networkAttempts"] == 0
    if "markers" in sample:
        for marker in sample["markers"]:
            memory[(sample["mode"], sample["build"], marker["name"])].append(marker)
    elif sample["mode"] == "timings":
        for fixture in sample["results"]:
            f = fixture["fixture"]
            for operation in fixture["operations"]:
                sessions[(sample["build"], f["visits"], f["pilots"], f["olderVisits"], operation["name"])].append(operation["medianMs"])
out = {
    "schema": 1,
    "sourceCommits": sources,
    "runManifestSha256": hashlib.sha256((raw / "memory-all-run.json").read_bytes()).hexdigest(),
    "method": "Median across two independent ABBA child runs for each marker or per-run operation median. Descriptive small-n summaries; not confidence bounds. Forced-GC retention and ordinary snapshots remain separate.",
    "memory": [dict(mode=k[0], build=k[1], marker=k[2], independentRuns=len(v),
        **{field: statistics.median(row[field] for row in v) for field in ["rss", "heapUsed", "heapTotal", "external", "arrayBuffers"]},
        **({"phaseElapsedMs": statistics.median(row["sincePreviousMarkerMs"] for row in v)} if k[0] == "ordinary" else {}))
        for k, v in memory.items()],
    "sessions": [dict(build=k[0], visits=k[1], pilots=k[2], olderVisits=k[3], operation=k[4], medianMs=statistics.median(v), perRunMediansMs=v)
        for k, v in sessions.items()],
    "semanticFixtureComparisons": run["semanticFixtureComparisons"],
}
(raw / "memory-summary.json").write_text(json.dumps(out, indent=2) + "\n")
print(raw / "memory-summary.json")
