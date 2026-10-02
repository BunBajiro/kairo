#!/usr/bin/env python3
"""Sequential external RC16/RC17 acceptance and performance lanes.

Run only after the coordinator freezes both source trees and builds. Outputs
are new per invocation, including logs and exact commands; failures stop the
run and retain all partial evidence. No production instrumentation is added.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import time

p = argparse.ArgumentParser()
p.add_argument('baseline', type=Path)
p.add_argument('candidate', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--lanes', nargs='+', choices=['maps', 'routes', 'memory', 'backend', 'mixed', 'restart', 'browser', 'browser-performance'], default=['maps', 'routes', 'memory', 'backend', 'mixed', 'restart', 'browser', 'browser-performance'])
a = p.parse_args()
repo = Path(__file__).resolve().parents[3]
out = a.output.resolve()
out.mkdir(parents=True, exist_ok=False)
baseline, candidate = a.baseline.resolve(), a.candidate.resolve()
helper = repo / 'analysis/rc17/harness'
env = dict(os.environ)
record = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'complete': False, 'lanes': a.lanes, 'steps': []}

def save():
    (out / 'run.json').write_text(json.dumps(record, indent=2) + '\n')

def run(label, args, extra=None, timeout=900):
    started = time.monotonic()
    step = {'label': label, 'command': [str(x) for x in args], 'environmentOverrides': extra or {}, 'complete': False}
    record['steps'].append(step)
    save()
    print(label, flush=True)
    with (out / (label + '.log')).open('w') as log:
        result = subprocess.run(step['command'], cwd=repo, env=env | (extra or {}), stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    step.update(complete=True, exitCode=result.returncode, elapsedSeconds=time.monotonic() - started)
    save()
    if result.returncode:
        raise RuntimeError(f'{label} failed ({result.returncode}); see {out / (label + ".log")}')

try:
    manifests = {}
    for label, root in [('baseline', baseline), ('candidate', candidate)]:
        sha = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        manifests[label] = str(out / (label + '-source.json'))
        run(label + '-manifest', ['node', helper / 'source-manifest.mjs', 'capture', root, manifests[label], sha])
    pair = {'KAIRO_BASELINE_MANIFEST': manifests['baseline'], 'KAIRO_CANDIDATE_MANIFEST': manifests['candidate']}
    for lane in a.lanes:
        if lane == 'maps':
            for label, mode, reverse in [('baseline-diagnostics', 'diagnostics', False), ('candidate-diagnostics', 'diagnostics', False), ('baseline-1', 'timings', False), ('candidate-1', 'timings', False), ('candidate-2', 'timings', True), ('baseline-2', 'timings', True)]:
                kind = label.split('-')[0]
                root = baseline if kind == 'baseline' else candidate
                args = ['node', helper / 'maps-scaling.mjs', mode]
                if kind == 'baseline': args.append('--baseline')
                if reverse: args.append('--reverse')
                run('maps-' + label, args, {'KAIRO_BENCH_SOURCE_ROOT': str(root), 'KAIRO_SOURCE_MANIFEST': manifests[kind], 'KAIRO_BENCH_OUTPUT': str(out / 'maps' / label)})
        elif lane == 'routes':
            run(lane, ['node', helper / 'route-run.mjs', baseline, candidate, out / lane], pair)
        elif lane == 'memory':
            run(lane, ['node', helper / 'memory-runner.mjs', baseline, candidate, out / lane, 'all'], pair)
            run(lane + '-summary', ['python3', helper / 'memory-summarize.py', out / lane])
        elif lane == 'backend':
            run(lane, ['node', helper / 'backend-run.mjs', baseline, candidate, out / lane], pair)
            run(lane + '-summary', ['python3', helper / 'backend-summary.py', out / lane])
        elif lane == 'mixed':
            run(lane, ['node', helper / 'mixed-run.mjs', out / lane], {'KAIRO_PERF_APP_ROOT': str(candidate), 'KAIRO_SOURCE_MANIFEST': manifests['candidate']})
            run(lane + '-summary', ['node', helper / 'mixed-summary.mjs', out / lane / 'mixed.json'])
        elif lane == 'restart':
            run(lane, ['flock', '/tmp/kairo-rc16-benchmark.lock', 'node', helper / 'restart-candidate.mjs'], {'KAIRO_CANDIDATE_ROOT': str(candidate)})
        elif lane == 'browser':
            run(lane, ['flock', '/tmp/kairo-rc16-benchmark.lock', 'node', helper / 'maps-correctness.mjs'], {'KAIRO_BENCH_REPO': str(candidate), 'KAIRO_BROWSER_OUTPUT': str(out / 'maps-browser')})
        elif lane == 'browser-performance':
            run(lane, ['node', helper / 'browser-camera-run.mjs', baseline, candidate, out / 'browser-camera'], pair)
            run(lane + '-summary', ['node', helper / 'browser-camera-summary.mjs', out / 'browser-camera'])
    for label, manifest in manifests.items():
        run(label + '-source-end', ['node', helper / 'source-manifest.mjs', 'verify', manifest])
    record['complete'] = True
finally:
    record['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
