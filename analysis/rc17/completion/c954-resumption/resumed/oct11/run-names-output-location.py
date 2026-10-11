#!/usr/bin/env python3
"""One bounded unchanged names-envelope run with output under /tmp."""
import datetime, hashlib, json, os, pathlib, subprocess, sys

base = pathlib.Path('/workspace/scratch/a2f3334402fc')
runner = base / 'recovery-oct11/names-bootstrap-prepared/run.py'
parent = pathlib.Path('/tmp/kairo-names-output-location-20261011')
parent.mkdir()
output = parent / 'attempt2'
command = [sys.executable, str(runner), '--output', str(output)]
env = os.environ.copy()
env['KAIRO_FINAL_NAMES_GRANTED'] = '1'
stamp = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt = {'schemaVersion': 1, 'purpose': 'One bounded output-location diagnostic; retain failed workspace attempt and every adverse row.', 'command': command, 'startedAt': stamp(), 'runnerSha256': hashlib.sha256(runner.read_bytes()).hexdigest(), 'intendedChanges': ['New output destination under /tmp', 'Coordinator and subagents do not issue other tool operations during the bounded run'], 'unchanged': ['Source and build manifests', 'Reviewed runner and worker bytes', 'Original fixture and two measured phase bodies', 'Four-worker ABBA order', 'All source, output, process cleanup and final artifact cross-binding guards'], 'causeEstablished': False}
log = parent / 'console.log'
with log.open('xb') as handle:
    result = subprocess.run(command, cwd=base, env=env, stdout=handle, stderr=subprocess.STDOUT)
data = log.read_bytes()
receipt.update(finishedAt=stamp(), exitCode=result.returncode, console={'path': str(log), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
completed = output / 'completed.json'
if completed.exists():
    data = completed.read_bytes()
    payload = json.loads(data)
    receipt['completed'] = {'path': str(completed), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'complete': payload.get('complete'), 'finalGuardsVerified': payload.get('finalGuardsVerified'), 'artifactCrossBinding': payload.get('artifactCrossBinding', {}).get('passed')}
(parent / 'execution.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
sys.exit(result.returncode)
