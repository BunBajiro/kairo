#!/usr/bin/env python3
"""One unchanged final-source envelope with output under /tmp."""
import datetime, hashlib, json, pathlib, subprocess, sys

base = pathlib.Path('/workspace/scratch/a2f3334402fc')
runner = base / 'kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/oct8/final-source-gates/run.mjs'
config = base / 'recovery-oct11/final-local/final-gates-config.json'
parent = pathlib.Path('/tmp/kairo-final-source-output-location-20261011')
parent.mkdir()
output = parent / 'attempt3'
command = ['node', str(runner), str(config), str(output), 'all']
stamp = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt = {'schemaVersion': 1, 'purpose': 'One bounded output-location diagnostic; retain both failed workspace attempts and every adverse row.', 'command': command, 'startedAt': stamp(), 'runnerSha256': hashlib.sha256(runner.read_bytes()).hexdigest(), 'configSha256': hashlib.sha256(config.read_bytes()).hexdigest(), 'intendedChanges': ['New output and worker temporary-file destination under /tmp', 'Subagents do not issue tool operations during the bounded run'], 'unchanged': ['Source and build manifests', 'Reviewed runner and worker bytes', 'Original workloads and measured phase bodies', 'Thirty-child order and all configured cycle counts', 'All source, output, process cleanup and final artifact cross-binding guards'], 'causeEstablished': False}
log = parent / 'console.log'
with log.open('xb') as handle:
    result = subprocess.run(command, cwd=base / 'kairo-analysis-restored', stdout=handle, stderr=subprocess.STDOUT)
data = log.read_bytes()
receipt.update(finishedAt=stamp(), exitCode=result.returncode, console={'path': str(log), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
for name in ['receipt.json', 'artifacts.json', 'lock-release.json']:
    path = output / name
    if path.exists():
        data = path.read_bytes()
        payload = json.loads(data)
        receipt[name] = {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'complete': payload.get('complete')}
(parent / 'execution.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
sys.exit(result.returncode)
