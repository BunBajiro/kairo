#!/usr/bin/env python3
"""Read-only evidence audit; writes only its reports beside this script.
Usage: python3 path/to/ui-recovery2/audit.py [--repo /path/to/kairo]
Requires Git objects for source70 and the exact successful trigger. No reruns.
"""
import argparse, datetime, hashlib, json, pathlib, posixpath, re, subprocess, zipfile
P = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument("--repo", type=pathlib.Path)
args = ap.parse_args()
REPO = args.repo or next(p for p in P.parents if (p / ".git").exists())
RAW = P / "raw"
RUN = 38179056807
HEAD = "f89d5b625b51fbf4645448ef475fc267cb5f5599"
SOURCE = "70cd12f9a4d014e7e2cf931b9681c4bdc7f18789"
ZIP_SHA = "eff12a1216b60d3c8b0f814185095b7c69a32838b076e9a4a51e5c2fc8228512"
WORKER = "11ae8708bd605d8af052bab9103249fa0d98eca63e9f37b7e069eebe1b0de2ed"
OWNER = "27f05929f03ec6b17d9632c561420b0a802578518db93169d046ed0f0a134378"
checks = []
def require(condition, label):
    if not condition:
        raise RuntimeError("AUDIT FAILED: " + label)
    checks.append(label)
def sha(data):
    return hashlib.sha256(data).hexdigest()
def read(path):
    return json.loads(path.read_text())
def git(*argv):
    return subprocess.check_output(["git", "-C", str(REPO), *argv])
def blob(ref, path):
    return git("show", ref + ":" + path)
def inventory(root):
    return [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size,
             "sha256": sha(p.read_bytes())} for p in sorted(root.rglob("*")) if p.is_file()]
def verify_rows(root, rows, label):
    require(len(rows) == len({row["path"] for row in rows}), label + " unique paths")
    for row in rows:
        data = (root / row["path"]).read_bytes()
        require(len(data) == row["bytes"] and sha(data) == row["sha256"],
                label + ":" + row["path"])
def when(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
def write(name, obj):
    (P / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")

run, artifacts, jobs = [read(P / n) for n in
    ["api-run.json", "api-artifacts.json", "api-jobs.json"]]
require(run["id"] == RUN and run["run_attempt"] == 1 and run["head_sha"] == HEAD
        and run["status"] == "completed" and run["conclusion"] == "success",
        "exact successful run, attempt and trigger")
require(run["event"] == "push" and run["head_branch"] == "perf/rc16-checkpoint-v0.8.0"
        and run["path"] == ".github/workflows/rc17-completion-ui.yml", "workflow identity")
require(len(artifacts["artifacts"]) == 1, "one artifact")
art = artifacts["artifacts"][0]
require(art["id"] == 11716889264 and art["name"] == f"internal-rc17-completion-ui-{RUN}-1"
        and art["size_in_bytes"] == 580824 and art["digest"] == "sha256:" + ZIP_SHA
        and art["workflow_run"]["id"] == RUN and art["workflow_run"]["head_sha"] == HEAD,
        "artifact API binding")
archive = P / "original-artifact.zip"
require(archive.stat().st_size == art["size_in_bytes"] and sha(archive.read_bytes()) == ZIP_SHA,
        "original ZIP size and SHA256 match API")
members = []
with zipfile.ZipFile(archive) as z:
    require(z.testzip() is None, "ZIP CRC integrity")
    names = z.namelist()
    require(len(names) == len(set(names)) == 38, "38 unique ZIP members")
    require(all(not n.startswith("/") and ".." not in pathlib.PurePosixPath(n).parts for n in names),
            "ZIP member paths safe")
    require(set(names) == {str(p.relative_to(RAW)) for p in RAW.rglob("*") if p.is_file()},
            "extracted raw file set equals ZIP")
    for name in sorted(names):
        data = z.read(name)
        require(data == (RAW / name).read_bytes(), "ZIP/raw byte equality:" + name)
        members.append({"path": name, "bytes": len(data), "sha256": sha(data)})
ev = read(RAW / "evidence-sha256.json")["files"]
require(len(ev) == 37 and {v["path"] for v in ev} == set(names) - {"evidence-sha256.json"},
        "all 37 non-self raw evidence bindings")
verify_rows(RAW, ev, "raw evidence")

require(len(jobs["jobs"]) == 1 and jobs["jobs"][0]["id"] == 114587522796
        and jobs["jobs"][0]["run_id"] == RUN, "exact job identity")
job = jobs["jobs"][0]
require(job["status"] == "completed" and job["conclusion"] == "success"
        and all(s["status"] == "completed" and s["conclusion"] == "success" for s in job["steps"]),
        "job and every retained step successful")
joblog = (P / "job.log").read_text()
require(ZIP_SHA in joblog and str(art["id"]) in joblog and "580824" in joblog,
        "upload log digest, artifact ID and size agree")
require(HEAD in joblog and SOURCE in joblog, "job log binds both commits")

prov = read(RAW / "run-provenance.json")
require(prov["harnessCommit"] == HEAD and prov["candidateCommit"] == SOURCE
        and prov["runAttempt"] == "1" and prov["runUrl"] == run["html_url"],
        "run provenance exact pins")
request = json.loads(blob(HEAD, "analysis/rc17/completion/ui-request.json"))
require(request == prov["request"] and request["candidateCommit"] == SOURCE
        and request["supersedesFailedRun"] == 38177282671, "request matches trigger git bytes")
harness = prov["harnessSha256"]
harness_paths = {
    p for p in git("ls-tree", "-r", "--name-only", HEAD).decode().splitlines()
    if p == ".github/workflows/rc17-completion-ui.yml" or
    (p.endswith(".mjs") and p.startswith((
        "analysis/rc17/completion/", "analysis/rc17/harness/",
        "analysis/rc16/historical/tests/performance/")))
}
require(set(harness) == harness_paths and len(harness) == 215, "complete 215 harness inventory")
for path, digest in harness.items():
    require(sha(blob(HEAD, path)) == digest, "trigger git harness:" + path)
require(harness["analysis/rc17/completion/frontend-refresh/browser-acceptance.mjs"] == WORKER,
        "corrected refresh worker pin")
require(harness["analysis/rc17/completion/ui-ci-lane.mjs"] == OWNER, "owner pin")
wf = blob(HEAD, ".github/workflows/rc17-completion-ui.yml").decode()
require("npm run install:ci" in wf and "npm run check:kairo" in wf and "npm run build" in wf
        and "npm run test:kairo" in wf, "locked build and correctness commands")

manifest = read(RAW / "source-manifest.json")
require(manifest["sourceCommit"] == manifest["expectedCommit"] == SOURCE and
        manifest["requireClean"] is True and manifest["dirty"] is False and manifest["status"] == "",
        "clean pinned source manifest")
source_paths = git("ls-tree", "-r", "--name-only", SOURCE).decode().splitlines()
require(sorted(source_paths) == [f["path"] for f in manifest["files"]] and
        len(source_paths) == 486, "complete 486 source file inventory")
for row in manifest["files"]:
    data = blob(SOURCE, row["path"])
    require(len(data) == row["bytes"] and sha(data) == row["sha256"],
            "source git bytes:" + row["path"])
require(len(manifest["builtFiles"]) == 20, "20 compiled assets inventoried")
fp = sha(json.dumps({"files": manifest["files"], "builtFiles": manifest["builtFiles"]},
                    separators=(",", ":"), ensure_ascii=False).encode())
require(fp == manifest["fingerprint"], "recomputed source/build fingerprint")
tree = git("rev-parse", SOURCE + "^{tree}").decode().strip()
build = read(RAW / "build-receipt.json")
require(build["sourceCommit"] == SOURCE and build["sourceTree"] == tree and
        build["sourceFingerprint"] == fp and build["exitCode"] == 0 and
        build["buildCommand"] == "npm run build", "build receipt source/tree/fingerprint")
require(build["logSha256"] == sha((RAW / "build.log").read_bytes()) and
        build["lockfileSha256"] == sha(blob(SOURCE, "package-lock.json")),
        "build log and exact lockfile digest")
require(build["node"] == "v24.19.0", "Node version")
require((RAW / "chrome-version.txt").read_text().strip() == "Google Chrome 154.0.8037.97",
        "Chrome version")
runtime = (RAW / "runtime-tests.log").read_text()
for field, value in [("tests",1004),("pass",1004),("fail",0),("cancelled",0),("skipped",0),("todo",0)]:
    require(re.search(r"^ℹ " + field + " " + str(value) + r"$", runtime, re.M) is not None,
            "runtime " + field + "=" + str(value))
completion = read(RAW / "completion.json")
require(completion["complete"] is True and completion["failedOrMissing"] == [] and
        all(v["outcome"] == v["conclusion"] == "success" for v in completion["steps"].values()),
        "complete record and all required steps successful")
required = {"request","install","types","runtime_tests","build","manifest","refresh","admin",
            "models","studio","replay_small","replay_repeat_cap","replay_distinct_cap",
            "final_source","final_harness"}
require(set(completion["steps"]) == required, "all 15 required completion steps")
final_source = read(RAW / "final-source-verify.log")
require(final_source == {"verified":True, "sourceCommit":SOURCE, "fingerprint":fp},
        "final source/build guard")
require(read(RAW / "final-harness-verify.json") ==
        {"verified":True, "harnessCommit":HEAD, "changedOrMissingPaths":[]},
        "final harness guard")

lanes = ["frontend-refresh", "admin-polling", "frontend-models", "studio-stream",
         "session-replay-repeat-small", "session-replay-repeat-cap", "session-replay-distinct-cap"]
counts = {"frontend-refresh":21, "admin-polling":18, "frontend-models":17, "studio-stream":10}
reports = []
previous_end = when(build["completedAt"])
asset_hashes = {v["path"]:v["sha256"] for v in manifest["builtFiles"]}
wallet = None
for lane in lanes:
    r = read(RAW / lane / "lane-receipt.json")
    d = read(RAW / lane / "result.json")
    require(r["lane"] == lane and all(r[k] is True for k in [
        "sourceVerifiedBefore","sourceVerifiedAfter","complete","resultValidated","processGroupCleaned"]),
        lane + " receipt complete and source guards")
    require(r["exitCode"] == 0 and r["signal"] is None and
            not any(r.get(k) for k in ["failure","sourceFailure","cleanupFailure","timedOut"]),
            lane + " exited zero without failure/timeout")
    require(r["sourceCommit"] == SOURCE and r["sourceTree"] == tree and
            r["sourceFingerprint"] == fp and r["ownerSha256"] == OWNER,
            lane + " receipt source and owner pins")
    worker = r["command"][1].split("/checkpoint/",1)[1]
    require(harness[worker] == r["harnessSha256"], lane + " worker trigger pin")
    require(r["environment"]["KAIRO_BENCH_SOURCE_COMMIT"] == SOURCE and
            r["environment"]["KAIRO_SOURCE_MANIFEST"] == r["sourceManifest"],
            lane + " source environment pins")
    require(when(r["startedAt"]) >= previous_end and
            when(r["startedAt"]) <= when(d["startedAt"]) < when(d["endedAt"]) <= when(r["completedAt"]),
            lane + " sequential bounded timestamps")
    previous_end = when(r["completedAt"])
    verify_rows(RAW / lane, r["files"], lane + " nested inventory")
    require({v["path"] for v in r["files"]} ==
            {str(p.relative_to(RAW/lane)) for p in (RAW/lane).rglob("*") if p.is_file()} -
            {"lane-receipt.json"}, lane + " complete nested inventory")
    require(d["errors"] == [] and not d.get("failure"), lane + " no recorded errors/failure")
    report = {"lane":lane, "complete":True, "exitCode":0,
              "sourceVerifiedBefore":True, "sourceVerifiedAfter":True,
              "workerSha256":r["harnessSha256"], "startedAt":r["startedAt"],
              "completedAt":r["completedAt"]}
    if lane in counts:
        require(d["complete"] is True and d["external"] == [] and len(d["checks"]) == counts[lane]
                and all(isinstance(c,str) or c["passed"] is True for c in d["checks"]),
                lane + " all expected UI checks pass")
        require((d.get("source",{}).get("commit") or d.get("sourceCommit")) == SOURCE and
                (d.get("source",{}).get("fingerprint") or d.get("sourceFingerprint")) == fp,
                lane + " result source pins")
        require((d.get("source",{}).get("dirty", d.get("sourceDirty"))) is False,
                lane + " result source clean")
        report["checks"] = counts[lane]
        if lane != "studio-stream":
            require(d["harnessSha256"] == r["harnessSha256"], lane + " result worker pin")
        if lane == "frontend-refresh":
            require(r["environment"]["KAIRO_REFRESH_LOCKED"] == "1" and d["sourceVerified"] is True,
                    "refresh locked worker and final source verified")
            wallet = d["latestWallet"]
            require(wallet["matchingCards"] == 1 and wallet["actual"] == wallet["expected"] == "10kISK"
                    and wallet["format"]["locale"] == "en-GB"
                    and wallet["format"]["maximumFractionDigits"] == 2
                    and wallet["format"]["notation"] == "compact",
                    "exact current Wallet card matches browser production formatting")
            require(len(d["fixture"]["sourceKeys"]) == 8 and d["fixture"]["sessions"] == 65,
                    "refresh full source invalidation and archive fixture")
            require(d["harnessSha256"] == WORKER, "refresh result corrected worker pin")
            require(sha(json.dumps(d["fixture"],separators=(",",":")).encode()) == d["fixtureSha256"],
                    "refresh fixture digest")
        if lane == "frontend-models":
            require(r["environment"]["KAIRO_MODELS_LOCKED"] == "1" and
                    r["environment"]["KAIRO_MODEL_ROWS"] == "10000" and
                    d["fixture"]["rowsPerLargeDataset"] == 10000 and
                    d["mode"] == "diagnostic-counts" and d["baseline"] is False and
                    d["sourceVerified"] is True, "models full locked diagnostic fixture")
        if lane == "studio-stream":
            require(all(d[k] is True for k in ["sourceVerified","compiledSourceVerified","cleanupVerified"]),
                    "Studio compiled source and cleanup guards")
            require((RAW/lane/"build-receipt.json").read_bytes() == (RAW/"build-receipt.json").read_bytes()
                    and d["buildReceiptSha256"] == sha((RAW/"build-receipt.json").read_bytes()),
                    "Studio copied build receipt")
            sm = read(RAW/lane/"source-manifest.json")
            require(sm["files"] == manifest["files"] and sm["builtFiles"] == manifest["builtFiles"]
                    and sm["sourceCommit"] == SOURCE and sm["fingerprint"] == fp and sm["dirty"] is False,
                    "Studio complete source/build manifest agrees")
            for path, digest in d["harnessHashes"].items():
                p = posixpath.normpath(posixpath.join("analysis/rc17/completion/studio-stream", path))
                require(harness[p] == digest, "Studio helper trigger pin:" + p)
    else:
        case = lane.removeprefix("session-replay-")
        require(d["sourceCommit"] == SOURCE and d["harnessSha256"] == r["harnessSha256"]
                and d["replayCase"] == case and d["environment"]["smoke"] is False and
                d["retentionMode"] == "full" and d["profiling"] is False,
                lane + " exact full replay case")
        require(r["environment"]["KAIRO_REPLAY_CASE"] == case and
                r["environment"]["KAIRO_FOLLOWUP_SMOKE"] == "0", lane + " full replay environment")
        for path, digest in d["sourceHashes"].items():
            require(sha(blob(SOURCE,path)) == digest, lane + " individual source pin:" + path)
        for path, digest in d["builtAssetHashes"].items():
            require(asset_hashes["dist/client"+path] == digest, lane + " observed compiled asset:"+path)
        require(len(d["builtAssetHashes"]) == 7, lane + " seven observed compiled assets")
        require(d["controls"] == {"successfulBrowserExternalResponses":0,"rendererExceptions":0,
                                 "deniedBackendFetchAttempts":0} and
                d["externalFetches"] == [] and d["blockedBrowserExternalAttempts"] == [],
                lane + " renderer and external isolation")
        require(len(d["eventSourceRequests"]) == 1 and
                d["eventSourceRequests"][0]["url"] == "/api/events" and
                d["eventSourceRequests"][0]["status"] == 200, lane + " one successful EventSource")
        require([s["name"] for s in d["samples"]] ==
                ["replay-prepare","replay-playback-start-60x","replay-playback-middle-60x"],
                lane + " all three timed coverage samples")
        require(d["retentionMethod"]["measuredCycles"] == 12 and
                d["retentionMethod"]["warmupCycles"] == 2 and
                d["retentionMethod"]["batches"] == 3 and
                d["retentionMethod"]["cyclesPerBatch"] == 4, lane + " 12 measured cycles")
        require(len(d["ownership"]) == 15 and
                all(v["staleUniverseRequests"] == 0 for v in d["ownership"]),
                lane + " all 15 ownership rows clear")
        require(len(d["pilotFencing"]) == 14 and
                all(v["previousReplayVisible"] is False and v["wrongOwnerRequests"] == 0
                    and v["pilot"] == 43 and v["disposition"] == "replay-unmounted"
                    for v in d["pilotFencing"]), lane + " 14 pilot fence records clear")
        require(len(d["retention"]) == 5 and
                [v["completedCycles"] for v in d["retention"]] == [0,0,4,8,12],
                lane + " five retention checkpoints")
        for i, snap in enumerate(d["retention"]):
            require(snap["quiescenceMs"] == 2000 and snap["forcedGcPasses"] == 3 and
                    len(snap["gc"]) == 3 and all(snap["overview"][k] == 0 for k in
                    ["canvases","mapNodes","replayControls"]) and snap["overview"]["pilot"] == "42"
                    and snap["listeners"] == d["retention"][0]["listeners"],
                    lane + " quiescent Overview and stable listeners:" + str(i))
        fixture = d["fixture"]["replays"][0]
        require(fixture["visits"] == 1000 and fixture["events"] == (200 if case=="repeat-small" else 10000)
                and fixture["uniqueSystems"] == (1000 if case=="distinct-cap" else 11)
                and fixture["validated"]["missingCoordinates"] == 0 and
                fixture["validated"]["owner"] == 42, lane + " geography/event cardinality")
        report.update({"smoke":False, "samples":3, "measuredCycles":12, "ownershipRows":15,
                       "retentionSnapshots":5, "pilotFenceRows":14,
                       "events":fixture["events"], "uniqueSystems":fixture["uniqueSystems"],
                       "eventSources":1, "controls":d["controls"], "listenersStable":True})
    reports.append(report)
require(when(completion["completedAt"]) >= previous_end, "completion after final lane")

# Preserve failed history as separate attempts: no promotion of earlier evidence.
failed_runs = []
for rid, prior_head in [(38176822076,"cbcd22ff6b57ea2c168fa363332a80d7c414f7d5"),
                        (38177282671,"00a4bdaf1046664da837c75ac3d17a046f5969ba")]:
    prior = read(P / f"prior-run-{rid}.json")
    require(prior["id"] == rid and prior["run_attempt"] == 1 and
            prior["head_sha"] == prior_head and prior["status"] == "completed" and
            prior["conclusion"] == "failure", f"prior run {rid} remains failed")
    failed_runs.append({"runId":rid,"runAttempt":1,"head":prior_head,"conclusion":"failure"})
controls_path = "analysis/rc17/completion/c954-resumption/resumed/oct11/ui-format-recovery/PREDICATE-CONTROLS.json"
controls = json.loads(blob(HEAD,controls_path))
control_rows = controls["controls"]
require(control_rows is not None and len(control_rows) == 44 and
        all(x["expectedPass"] == x["actualPass"] for x in control_rows),
        "44 archived Wallet predicate controls preserved and passing")
raw_inventory = {"schemaVersion":1, "artifactId":art["id"], "runId":RUN, "files":members,
                 "fileCount":len(members), "totalFileBytes":sum(x["bytes"] for x in members)}
write("EVIDENCE-INVENTORY.json",raw_inventory)
output = {
    "schemaVersion":1, "status":"PASS", "integrityPass":True, "acceptancePass":True,
    "auditedDate":"2026-10-13", "runId":RUN, "runAttempt":1, "runUrl":run["html_url"],
    "harnessCommit":HEAD, "sourceCommit":SOURCE, "sourceTree":tree, "sourceFingerprint":fp,
    "artifact":{"id":art["id"],"name":art["name"],"bytes":580824,"sha256":ZIP_SHA,
                "members":38,"rawEvidenceBindings":37},
    "provenance":{"sourceFilesMatchedGit":486,"compiledAssetManifestEntries":20,
                  "harnessBindingsMatchedGit":215,"ownerSha256":OWNER,
                  "refreshWorkerSha256":WORKER,"buildLogAndLockfileReceiptMatch":True,
                  "finalSourceAndHarnessGuards":True,"lanesSequential":True,
                  "node":build["node"],"chrome":"Google Chrome 154.0.8037.97"},
    "correctness":{"runtimeTests":1004,"runtimePassed":1004,"runtimeFailed":0,
                   "typeCheck":"success","lockedBuild":"success","lanesPassed":7},
    "wallet":{"matchingCards":wallet["matchingCards"],"actual":wallet["actual"],
              "expected":wallet["expected"],"format":wallet["format"],
              "archivedPredicateControls":44,"controlsRerun":False},
    "lanes":reports,
    "replayTotals":{"measuredCycles":36,"ownershipRows":45,"staleUniverseRequests":0,
                    "quiescentSnapshots":15,"pilotFenceRows":42,
                    "mapReplaySurfacesOnOverview":0,"globalListenerSignaturesStable":True},
    "priorFailedRuns":failed_runs,
    "cleanupBoundary":"Seven sequential worker close events, exit0, successful finalizers and processGroupCleaned:true receipts. This signaling receipt is not an independent post-exit process census; no remote census was retained. Studio additionally records cleanupVerified:true.",
    "limitations":[
        "This closes the corrected independent UI acceptance gate for exact source70 only.",
        "Synthetic compiled UI and single-candidate replay/retention coverage; no matched performance improvement or desktop GPU/FPS claim.",
        "Forced GC at quiescent Overview checkpoints diagnoses retention; no natural-GC/RSS leak claim.",
        "Wallet predicate checks rendered compact value, not an independent pilot identity proof; nearby values may share compact output, while stale fixture4200/4300 cannot match9999.",
        "Compiled bytes were not uploaded in this raw UI artifact; all20 hashes are bound by source/build guards, and observed seven browser asset hashes match them.",
        "Original raw reviewReady:false and PR10-withdrawn notes are historical workflow policy. This evidence audit does not change release readiness, PRs, refs or approval status.",
        "No application workload, mock controls, workflow or CI lane was rerun during this audit."
    ],
    "auditChecksPassed":len(checks), "checks":checks}
write("RESULTS-AUDIT.json",output)
print(json.dumps({k:output[k] for k in ["status","runId","integrityPass","acceptancePass","auditChecksPassed"]}))

