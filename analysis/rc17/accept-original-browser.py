#!/usr/bin/env python3
"""Accept only an exact-original-runtime browser replay alongside retained measurements."""
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
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('prior', type=Path)
    p.add_argument('current', type=Path)
    args = p.parse_args()
    prior, current = args.prior.resolve(), args.current.resolve()
    inventory = read(prior/'artifact-files.json')
    assert inventory['archiveSha256'] == '8ff4be58d46fa5ddb1af7e322ec9ff98041afcfc83626703c6d561cd0df681e9'
    assert len(inventory['files']) == 78
    for name, expected in inventory['files'].items():
        path = prior/name
        assert path.resolve().is_relative_to(prior) and sha(path) == expected, name
    run = read(prior/'github-run.json')
    jobs = read(prior/'github-jobs.json')['jobs']
    assert run['id'] == 37078241973 and run['conclusion'] == 'failure' and len(jobs) == 1
    failed = [s['name'] for s in jobs[0]['steps'] if s['conclusion'] == 'failure']
    assert failed == ['Check compiled Mapper preferences and geometry']
    required = ['Compile and check both source identities','Check candidate behaviour and types',
                'Measure Maps with equivalent fixtures','Compare isolated itinerary scaling',
                'Compare historical 0.7.3 and RC16 on this same runner','Compare corrected backend workloads in balanced order',
                'Compare bounded residency and not-due Sessions work','Check combined workloads and large-frame continuity',
                'Check positive managed-restart ownership','Compare compiled Maps camera work in balanced order',
                'Verify sources and compiled assets after all lanes']
    outcomes = {s['name']:s['conclusion'] for s in jobs[0]['steps']}
    assert all(outcomes.get(name) == 'success' for name in required)
    old, new = read(prior/'run-provenance.json'), read(current/'run-provenance.json')
    assert run['head_sha'] == old['harnessCommit'] and old['suite'] == 'all'
    assert old['baselineCommit'] == new['baselineCommit'] == '57c8dcc7fbd8fc2b62129498d1819050c78381a1'
    assert old['historical073Commit'] == new['historical073Commit'] == '239794774320fcdebaa1d76ce8a77c5c25cfc48c'
    assert old['candidateCommit'] == new['candidateCommit'] == '05d0d4b36c154329006d6772769063db874762da'
    assert new['suite'] == 'browser-original-artifact' and new['originalRunId'] == run['id']
    a, b = read(prior/'candidate-source.json'), read(current/'candidate-source.json')
    assert not a['dirty'] and not b['dirty']
    for field in ['sourceCommit','files','builtFiles','fingerprint']:
        assert a[field] == b[field], f'Original candidate {field} changed'
    restoration = read(current/'original-runtime-restoration.json')
    assert restoration['archiveSha256'] == 'bf398719a9f423530344588977cddc4731b919c123c10d9cf971e348e2ece998'
    assert restoration['candidateFingerprint'] == b['fingerprint']
    assert restoration['inventoryFilesVerified'] == 1201 and restoration['sourceFilesVerified'] == 439 and restoration['compiledFilesRestored'] == 20
    assert set(old['harnessSha256']) == set(new['harnessSha256'])
    changed = sorted(name for name in old['harnessSha256'] if old['harnessSha256'][name] != new['harnessSha256'][name])
    assert changed == ['analysis/rc17/harness/maps-correctness.mjs']
    result = read(current/'maps-browser/result.json')
    assert result['checks'] == read(prior/'maps-browser/result.json')['checks'] and len(result['checks']) == 17
    assert result['sourceFingerprint'] == b['fingerprint'] and result['sourceCommit'] == b['sourceCommit']
    assert result['complete'] and result['featureChecksComplete'] and result['cleanupVerified'] and result['sourceVerified'] and not result['sourceDirty']
    assert result['browserExit']['closed'] and result['errors'] == result['external'] == []
    steps = json.loads(os.environ['KAIRO_WORKFLOW_STEPS'])
    assert all(steps.get(name,{}).get('outcome') == 'success' for name in ['prepare','browser','sources'])
    record = {'schemaVersion':1,'kind':'exact-original-runtime-browser-gate',
              'checkpointAcceptancePassed':True,'releaseReady':False,
              'performanceReviewStatus':'Open: idle CPU regression attribution; this record covers mechanical correctness/measurement gates only.',
              'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'candidateCommit':b['sourceCommit'],'candidateFingerprint':b['fingerprint'],
              'measurementRun':{'id':run['id'],'originalConclusion':'failure','harnessCommit':old['harnessCommit'],
                                'failedStep':failed[0],'acceptedMeasurementSteps':required},
              'focusedBrowserRun':{'id':int(os.environ['GITHUB_RUN_ID']),'suite':new['suite'],'url':new['runUrl'],
                                   'harnessCommit':new['harnessCommit'],'requiredStepOutcomes':{k:steps[k]['outcome'] for k in ['prepare','browser','sources']},
                                   'resultSha256':sha(current/'maps-browser/result.json')},
              'exactRuntimeRestoration':restoration,
              'allowedHarnessChange':{'path':changed[0],'beforeSha256':old['harnessSha256'][changed[0]],'afterSha256':new['harnessSha256'][changed[0]]},
              'retainedEvidenceSha256':{name:sha(prior/name) for name in ['artifact-files.json','github-run.json','github-jobs.json','run-provenance.json']},
              'excludedRebuildAttempt':{'runId':37080679048,'conclusion':'failure','reason':'Strict built-file identity failed after rebuilding generated HTML/RSC entrypoints; its passing feature/cleanup observations are not substituted for this exact-runtime replay.'},
              'scope':'Candidate-only browser replay on the exact original source and compiled bytes. RC16 is not rebuilt or remeasured; its accepted measurement evidence remains in the original run. Both earlier workflow failures stay unchanged.'}
    path = current/'combined-acceptance.json'
    assert not path.exists()
    path.write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'record':str(path),'sha256':sha(path),'checkpointAcceptancePassed':True,'releaseReady':False}))


if __name__ == '__main__':
    main()
