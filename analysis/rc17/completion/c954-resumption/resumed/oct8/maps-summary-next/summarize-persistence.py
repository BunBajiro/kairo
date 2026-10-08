"""Summarize the fixed persistence ABBA without pooling process replications."""
import hashlib
import json
import pathlib
import statistics
import sys

root = pathlib.Path(sys.argv[1]).resolve()
receipt = json.loads((root / "completed.json").read_text())
assert receipt["complete"] and receipt["sourceAndHarnessVerified"]
for artifact in receipt["artifacts"]:
    raw = (root / artifact["path"]).read_bytes()
    assert len(raw) == artifact["bytes"]
    assert hashlib.sha256(raw).hexdigest() == artifact["sha256"], artifact["path"]
labels = receipt["order"]
reports = {label: json.loads((root / (label + ".json")).read_text()) for label in labels}
assert all(report["complete"] for report in reports.values())


def observed(samples, name):
    if name in ("firstOpen", "reopen"):
        return [sample[name] for sample in samples]
    return [next(row for row in sample["phases"] if row["name"] == name) for sample in samples]


def process_summary(samples, name):
    rows = observed(samples, name)
    values = [row["elapsedMs"] for row in rows]
    counts = [row.get("count", 1) for row in rows]
    assert len(set(counts)) == 1
    return {"count": counts[0], "elapsedMs": values,
            "medianMs": statistics.median(values),
            "medianMsPerOperation": statistics.median(values) / counts[0],
            "cpuUserMs": [row["cpuUserMs"] for row in rows],
            "cpuSystemMs": [row["cpuSystemMs"] for row in rows],
            "databaseChanges": [row.get("databaseChanges") for row in rows],
            "rssDeltaBytes": [row["memoryAfter"]["rss"] - row["memoryBefore"]["rss"] for row in rows],
            "heapUsedDeltaBytes": [row["memoryAfter"]["heapUsed"] - row["memoryBefore"]["heapUsed"] for row in rows]}


result = {"schemaVersion": 1, "complete": True, "performanceAcceptance": False,
          "verifiedArtifacts": len(receipt["artifacts"]),
          "inputReceiptSha256": hashlib.sha256((root / "completed.json").read_bytes()).hexdigest(),
          "summaryScriptSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
          "method": "Two samples per case per fresh process. Each ABBA pair compares its own process medians; individual samples are not pooled as independent processes.",
          "limitations": reports[labels[0]]["limitations"], "cases": []}
for reference in reports[labels[0]]["cases"]:
    identity = reference["id"]
    cases = {label: next(row for row in report["cases"] if row["id"] == identity) for label, report in reports.items()}
    assert all(row["parity"] == reference["parity"] for row in cases.values())
    phases = ["firstOpen", "reopen"] + [row["name"] for row in reference["samples"][0]["phases"]]
    entry = {"id": identity, "authoritativeParity": True, "phases": [], "storage": {}}
    for phase in phases:
        arms = {label: process_summary(row["samples"], phase) for label, row in cases.items()}
        pairs = []
        for index in (1, 2):
            a, b = arms[f"baseline-{index}"], arms[f"candidate-{index}"]
            delta = b["medianMs"] - a["medianMs"]
            pairs.append({"pair": index, "deltaMs": delta, "deltaPercent": delta / a["medianMs"] * 100,
                          "deltaMsPerOperation": delta / a["count"]})
        entry["phases"].append({"name": phase, "processes": arms, "pairs": pairs})
    for label, case in cases.items():
        entry["storage"][label] = [{"repeat": sample["repeat"],
                                     "firstOpen": sample["firstOpen"]["storage"],
                                     "afterFirstCheckpoint": sample["firstOpen"]["afterCheckpoint"],
                                     "reopen": sample["reopen"]["storage"],
                                     "afterFinalCheckpoint": sample["afterCheckpoint"],
                                     "maxObservedWalBytes": max(row["storageAfter"]["walBytes"] for row in sample["phases"])}
                                    for sample in case["samples"]]
    result["cases"].append(entry)
(root / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"summary": str(root / "summary.json"), "cases": len(result["cases"])}))
