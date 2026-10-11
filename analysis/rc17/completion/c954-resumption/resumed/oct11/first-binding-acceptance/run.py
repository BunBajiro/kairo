"""One separate configured-first-binding stress ABBA; original mixed gates are untouched."""
import argparse
import fcntl
import json
import math
import os
from pathlib import Path
import sys
import time

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'final-matrix-public-resume'))
from envelope import Envelope, ROOT, pin, save, stamp

COMMITS = {'baseline': '57c8dcc7fbd8fc2b62129498d1819050c78381a1',
           'candidate': '70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'}
ORDER = ('baseline', 'candidate', 'candidate', 'baseline')
HELPER = ROOT / 'analysis/rc17/harness/source-manifest.mjs'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('baseline_manifest', type=Path)
parser.add_argument('candidate_manifest', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
assert os.environ.get('KAIRO_FIRST_BINDING_GRANTED') == '1', 'Coordinator runtime grant required'
assert not os.environ.get('NODE_OPTIONS') and not os.environ.get('NODE_V8_COVERAGE'), 'Refuse inherited Node instrumentation/preloads'
unexpected = [key for key in os.environ if key.startswith('KAIRO_') and key not in
              ('KAIRO_FIRST_BINDING_GRANTED', 'KAIRO_CHROME_PATH')]
assert not unexpected, 'Refuse inherited Kairo workload overrides: ' + repr(unexpected)
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
owner = Envelope(out)
locks, inputs, absent, sources, rows = [], {}, [], {}, []
env = {key: value for key, value in os.environ.items() if not key.startswith('KAIRO_')}
env.pop('NODE_OPTIONS', None)
env.pop('NODE_V8_COVERAGE', None)
env['KAIRO_FIRST_BINDING_LOCKED'] = '1'
report = {'schemaVersion': 1, 'suite': 'configured-first-binding-acceptance', 'startedAt': stamp(),
          'complete': False, 'reviewReady': False, 'order': ORDER, 'profile': 'stress', 'warmCalls': 100,
          'sourceCommits': COMMITS, 'rows': rows, 'inputs': inputs, 'locks': [],
          'nodeInstrumentationEnvironment': {'NODE_OPTIONS': None, 'NODE_V8_COVERAGE': None},
          'scope': 'Supplemental noSync configured whole-Core startup; preserve accepted lazy-formatter cold/warm tradeoff',
          'limitations': ['Not a replacement for original mixed/backend/UI gates or release acceptance.',
                          'Only two observations per source; report every cold/cumulative cost and warm context.']}

def remember(path):
    path = Path(path).resolve()
    inputs[str(path)] = pin(path)
    return path

def guards():
    for path, expected in inputs.items():
        assert pin(path) == expected, 'Harness/input changed: ' + path
    for path in absent:
        assert not path.exists() and not path.is_symlink(), 'Removed temporary data reappeared: ' + str(path)
    owner.check_pins()

def command(label, argv, directory=out, child_env=env, timeout=180):
    guards()
    owner.command(label, argv, directory / (label + '.log'), env=child_env, timeout=timeout)
    guards()

def copy_input(source, destination):
    source = remember(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as file:
        file.write(source.read_bytes())
    assert pin(destination) == inputs[str(source)]
    owner.capture([destination])

def source_and_build(name, manifest_path):
    manifest_path = manifest_path.resolve()
    source = json.loads(manifest_path.read_text())
    assert source['sourceCommit'] == source['expectedCommit'] == COMMITS[name]
    assert source['requireClean'] and not source['dirty'] and source['status'] == '' and source['builtFiles']
    root = Path(source['root'])
    assert root.is_absolute() and root.is_dir()
    assert not out.is_relative_to(root), 'Output must not contaminate application source'
    copy_input(manifest_path, out / (name + '-source.json'))
    prebuild_path = manifest_path.with_name(manifest_path.name.replace('-source.json', '-prebuild.json'))
    assert prebuild_path != manifest_path
    prebuild = json.loads(prebuild_path.read_text())
    assert prebuild['sourceCommit'] == source['sourceCommit'] and prebuild['root'] == source['root']
    assert prebuild['files'] == source['files'] and not prebuild['builtFiles']
    copy_input(prebuild_path, out / (name + '-prebuild.json'))
    setup_path = manifest_path.parent / 'receipt.json'
    setup = json.loads(setup_path.read_text())
    assert setup['complete']
    assert setup['helperSha256'] == pin(HELPER)['sha256']
    bindings = [entry for entry in setup['roots'] if entry['root'] == str(root)]
    assert len(bindings) == 1
    binding = bindings[0]
    assert binding['complete'] and binding['commit'] == source['sourceCommit']
    assert binding['fingerprint'] == source['fingerprint']
    assert binding['sourceFiles'] == len(source['files']) and binding['builtFiles'] == len(source['builtFiles'])
    assert Path(binding['manifest']).resolve() == manifest_path
    builds = [row for row in setup['commands'] if row['args'] == ['npm', 'run', 'build'] and row['cwd'] == str(root)]
    assert len(builds) == 1
    build = builds[0]
    assert build['exitCode'] == 0 and not build['remainingProcessGroupMembers'] and build['start'] and build['end']
    log = setup_path.parent / build['log']
    assert pin(log) == {'bytes': build['logBytes'], 'sha256': build['logSha256']}
    copy_input(setup_path, out / (name + '-build-receipt.json'))
    copy_input(log, out / (name + '-build.log'))
    sources[name] = source
    command(name + '-source-before', ['node', HELPER, 'verify', out / (name + '-source.json')])

def distribution(values):
    assert values and all(isinstance(value, (int, float)) and math.isfinite(value) and value >= 0 for value in values)
    ordered = sorted(values)
    return {'n': len(values), 'mean': sum(values) / len(values), 'min': ordered[0], 'max': ordered[-1],
            'p50': ordered[math.ceil(len(values) * .5) - 1], 'p95': ordered[math.ceil(len(values) * .95) - 1]}

try:
    for path in ('/tmp/kairo-performance.lock', '/tmp/kairo-rc16-benchmark.lock'):
        handle = open(path, 'a')
        locks.append(handle)
        while True:
            if owner.interrupted:
                raise RuntimeError('Interrupted while acquiring performance locks')
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                time.sleep(.1)
        report['locks'].append({'path': path, 'acquiredAt': stamp()})
    for path in sorted(HERE.iterdir()):
        if path.is_file() and path.suffix in ('.mjs', '.py', '.md'):
            remember(path)
    for path in (HELPER, ROOT / 'analysis/rc17/harness/backend/fixture.mjs',
                 ROOT / 'analysis/rc17/harness/backend/target.mjs',
                 ROOT / 'analysis/rc17/harness/legacy-discovery-fixture.mjs',
                 HERE.parent / 'final-matrix-public-resume/envelope.py',
                 HERE.parent.parent / 'oct8/final-merged-frontend/ownership.py'):
        remember(path)
    source_and_build('baseline', args.baseline_manifest)
    source_and_build('candidate', args.candidate_manifest)
    # Execute through the same owner; status 1 is meaningful only for excluded ancestry.
    lineage = """import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=process.argv[1],selected='c954c0d808847f249df0659ed15fdce2e89f84c4',excluded='508f2d450c7cc17cc464cf316b80748367adc9e2';
function git(...args){const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',timeout:30000});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
for(const commit of [selected,excluded])assert.equal(git('cat-file','-e',commit+'^{commit}').status,0);
const shallow=git('rev-parse','--is-shallow-repository');assert.equal(shallow.status,0);assert.equal(shallow.stdout.trim(),'false');
assert.equal(git('merge-base','--is-ancestor',selected,'HEAD').status,0);
assert.equal(git('merge-base','--is-ancestor',excluded,'HEAD').status,1);
console.log(JSON.stringify({selected,excluded,selectedAncestor:true,excludedAncestor:false,nonShallow:true}));"""
    command('candidate-lineage', ['node', '--input-type=module', '-e', lineage, sources['candidate']['root']])
    for ordinal, name in enumerate(ORDER, 1):
        directory = out / (str(ordinal) + '-' + name)
        directory.mkdir()
        data = directory / 'data'
        temporary = directory / 'tmp'
        temporary.mkdir()
        setup = directory / 'setup.json'
        result = directory / 'result.json'
        assert not setup.is_relative_to(data) and not result.is_relative_to(data)
        source_path = out / (name + '-source.json')
        child_env = dict(env, TMPDIR=str(temporary))
        row = {'ordinal': ordinal, 'arm': name, 'directory': str(directory.relative_to(out)), 'complete': False}
        rows.append(row)
        command('prepare', ['node', HERE / 'prepare.mjs', sources[name]['root'], source_path, data, setup], directory, child_env)
        prepared = json.loads(setup.read_text())
        assert prepared['complete'] and prepared['directory'] == str(data) and prepared['profile'] == 'stress'
        owner.capture([setup])
        command('observe', ['node', HERE / 'worker.mjs', sources[name]['root'], source_path, setup, result], directory, child_env)
        observed = json.loads(result.read_text())
        assert observed['complete'] and observed['cleanupComplete'] and observed['appClosed'] and observed['sourceVerified']
        assert observed['externalAttempts'] == 0 and observed['source']['commit'] == COMMITS[name]
        assert observed['setupSha256'] == pin(setup)['sha256']
        assert len(observed['warmUpdateBindingsMs']) == 100
        assert not data.exists() and not data.is_symlink()
        assert not list(temporary.iterdir()), 'Unexplained temporary files must remain visible in a failed attempt'
        temporary.rmdir()
        absent.extend((data, temporary))
        owner.capture([result])
        row.update(complete=True, result=pin(result), timings=observed['timings'],
                   warmUpdateBindingsMs=distribution(observed['warmUpdateBindingsMs']))
    first_elements = json.loads((out / rows[0]['directory'] / 'result.json').read_text())['firstWire']['elements']
    for row in rows:
        observed = json.loads((out / row['directory'] / 'result.json').read_text())
        assert observed['firstWire']['elements'] == first_elements, 'Full common configured first output differs'
    metrics = sorted(rows[0]['timings']) + ['warmUpdateBindingsMeanMs']
    summaries = {}
    for metric in metrics:
        values = [row['warmUpdateBindingsMs']['mean'] if metric == 'warmUpdateBindingsMeanMs' else row['timings'][metric] for row in rows]
        assert all(math.isfinite(value) and value >= 0 for value in values)
        pairs = []
        for a, b in ((0, 1), (3, 2)):
            delta = values[b] - values[a]
            pct = delta / values[a] * 100 if values[a] else None
            pairs.append({'baselineOrdinal': a + 1, 'candidateOrdinal': b + 1, 'baselineMs': values[a],
                          'candidateMs': values[b], 'deltaMs': delta, 'percentChange': pct,
                          'adverseOver1MsAnd10Percent': delta > 1 and pct is not None and pct > 10})
        summaries[metric] = {'rawInOrder': values, 'pairs': pairs,
                             'bothPairsAdverseOver1MsAnd10Percent': all(pair['adverseOver1MsAnd10Percent'] for pair in pairs)}
    report['metrics'] = summaries
    for name in COMMITS:
        command(name + '-source-after', ['node', HELPER, 'verify', out / (name + '-source.json')])
    guards()
    owner.capture_tree(out, excluded=('ownership-progress.json', 'ownership-completed.json', 'completed.json'))
    owner.finish(True)
    report['complete'] = True
except BaseException as error:
    report['failure'] = repr(error)
    try:
        owner.finish(False)
    except BaseException as final_error:
        report['finalGuardFailure'] = repr(final_error)
finally:
    report['endedAt'] = stamp()
    try:
        guards()
        report['inventory'] = {str(path.relative_to(out)): pin(path) for path in sorted(out.rglob('*'))
                               if path.is_file() and path.name != 'completed.json'}
        for path, value in owner.report['closedFiles'].items():
            assert report['inventory'].get(path) == value, 'Final inventory differs from closed evidence: ' + path
        report['temporaryAbsenceVerified'] = all(not path.exists() and not path.is_symlink() for path in absent)
        report['finalCrossBindingPassed'] = True
    except BaseException as error:
        report.update(complete=False, finalCrossBindingPassed=False, inventoryFailure=repr(error))
    save(out / 'completed.json', report)
    for handle in reversed(locks):
        handle.close()
    if not report['complete']:
        sys.exit(1)
