#!/usr/bin/env python3
"""Join a retained complete measurement set with one corrected browser gate.

The original run remains failed. This creates a separate checkpoint acceptance
record only after source, compiled assets, unchanged measurement harnesses and
the focused browser process outcome all verify.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('prior', type=Path)
    parser.add_argument('current', type=Path)
    parser.add_argument('--prior-run', type=int, required=True)
    args = parser.parse_args()
    prior, current = args.prior.resolve(), args.current.resolve()
    first, second = read(prior/'run-provenance.json'), read(current/'run-provenance.json')
    run = read(prior/'github-run.json')
    jobs = read(prior/'github-jobs.json')['jobs']
    assert len(jobs) == 1 and run['id'] == args.prior_run
    assert run['status'] == 'completed' and run['conclusion'] == 'failure'
    assert run['head_sha'] == first['harnessCommit']
    assert first['suite'] == 'all' and second['suite'] == 'browser'
    assert second['acceptedFullRun'] == args.prior_run
    for name in ['baselineCommit', 'historical073Commit', 'candidateCommit']:
        assert first[name] == second[name], f'{name} changed'
    assert first['candidateCommit'] == '05d0d4b36c154329006d6772769063db874762da'
    browser_step = 'Check compiled Mapper preferences and geometry'
    failed = [step['name'] for step in jobs[0]['steps'] if step['conclusion'] == 'failure']
    assert failed == [browser_step], f'Unexpected prior failures: {failed}'
    required = [
        'Compile and check both source identities', 'Check candidate behaviour and types',
        'Measure Maps with equivalent fixtures', 'Compare isolated itinerary scaling',
        'Compare historical 0.7.3 and RC16 on this same runner',
        'Compare corrected backend workloads in balanced order',
        'Compare bounded residency and not-due Sessions work',
        'Check combined workloads and large-frame continuity',
        'Check positive managed-restart ownership',
        'Compare compiled Maps camera work in balanced order',
        'Verify sources and compiled assets after all lanes',
    ]
    outcomes = {step['name']:step['conclusion'] for step in jobs[0]['steps']}
    assert all(outcomes.get(name) == 'success' for name in required)
    inventory = read(prior/'artifact-files.json')
    retrieval = read(prior/'retrieval.json')
    artifact = next(item for item in retrieval['artifacts'] if item['name'] == 'internal-rc17-comparison-evidence')
    assert retrieval['runId'] == args.prior_run and artifact['digestVerified'] is True
    assert inventory['archiveSha256'] == artifact['sha256']
    for relative, expected in inventory['files'].items():
        path = prior/relative
        assert path.resolve().is_relative_to(prior) and sha(path) == expected, relative
    manifests = {}
    for name in ['candidate-source.json', 'rc16-source.json']:
        a, b = read(prior/name), read(current/name)
        assert not a['dirty'] and not b['dirty']
        for field in ['sourceCommit', 'files', 'builtFiles', 'fingerprint']:
            assert a[field] == b[field], f'{name}: {field} differs between CI runs'
        manifests[name] = {'commit':b['sourceCommit'], 'fingerprint':b['fingerprint']}
    old_harness, new_harness = first['harnessSha256'], second['harnessSha256']
    assert set(old_harness) == set(new_harness), 'Harness file set changed'
    changed = sorted(name for name in old_harness if old_harness[name] != new_harness[name])
    allowed = 'analysis/rc17/harness/maps-correctness.mjs'
    assert changed == [allowed], f'Unexpected measured harness changes: {changed}'
    steps = json.loads(os.environ['KAIRO_WORKFLOW_STEPS'])
    assert all(steps.get(name, {}).get('outcome') == 'success' for name in ['compile','correctness','browser','sources'])
    old_browser, browser = read(prior/'maps-browser/result.json'), read(current/'maps-browser/result.json')
    assert browser['checks'] == old_browser['checks'] and len(browser['checks']) == 17
    assert browser['errors'] == browser['external'] == []
    assert browser['complete'] and browser['featureChecksComplete'] and browser['cleanupVerified']
    assert browser['sourceVerified'] and not browser['sourceDirty'] and browser['browserExit']['closed']
    assert browser['sourceCommit'] == second['candidateCommit']
    assert browser['sourceFingerprint'] == manifests['candidate-source.json']['fingerprint']
    evidence = {name:sha(prior/name) for name in ['artifact-files.json','retrieval.json','github-run.json','github-jobs.json','run-provenance.json']}
    record = {
        'schemaVersion':1, 'kind':'combined-internal-checkpoint-acceptance',
        'checkpointAcceptancePassed':True, 'releaseReady':False,
        'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'candidateCommit':second['candidateCommit'], 'sourceAndCompiledIdentity':manifests,
        'measurementRun':{'id':args.prior_run,'url':first['runUrl'],'harnessCommit':first['harnessCommit'],
                          'originalConclusion':'failure','originalFailedStep':browser_step,
                          'reason':'ENOTEMPTY while deleting the Chrome profile after all 17 feature checks'},
        'focusedBrowserRun':{'id':int(os.environ['GITHUB_RUN_ID']),'url':second['runUrl'],
                             'harnessCommit':second['harnessCommit'],'suite':'browser',
                             'requiredStepOutcomes':{name:steps[name]['outcome'] for name in ['compile','correctness','browser','sources']},
                             'resultSha256':sha(current/'maps-browser/result.json')},
        'acceptedMeasurementSteps':required,
        'allowedHarnessChange':{'path':allowed,'beforeSha256':old_harness[allowed],'afterSha256':new_harness[allowed],
                                'scope':'Reviewed cleanup ownership and post-cleanup completion reporting only; the same 17 feature checks are required.'},
        'retainedPriorEvidenceSha256':evidence,
        'priorArtifactFilesVerified':len(inventory['files']),
        'note':'This combines valid unchanged measurement lanes with a successful focused browser process. The original full run remains failed, the focused suite is not an all run, and neither per-run allComparisonLanesPassed flag is changed.',
    }
    path=current/'combined-acceptance.json'
    assert not path.exists(), 'Do not overwrite an acceptance record'
    path.write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'output':str(path),'sha256':sha(path),'checkpointAcceptancePassed':True,'releaseReady':False}))


if __name__ == '__main__':
    main()
