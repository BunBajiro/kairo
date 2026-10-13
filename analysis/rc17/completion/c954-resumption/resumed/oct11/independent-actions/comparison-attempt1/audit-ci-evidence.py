#!/usr/bin/env python3
"""Reproduce the completed CI audit without executing Kairo or timed workloads.

Run from any directory with Python 3. The three audit modules consume only the
original banked Actions ZIP. No network access or bundle download is required.
"""
import hashlib,json,pathlib,subprocess,sys,tempfile,zipfile

HERE=pathlib.Path(__file__).resolve().parent
ARTIFACT=HERE/'artifact-11716144963.zip'
EXPECTED={'bytes':2792289,'sha256':'a98542607becc243ce84fea2dfe7b5e7d717e05e80b9f34a78582824a02d3dbd'}
def digest(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
assert digest(ARTIFACT)==EXPECTED
receipt=json.loads((HERE/'ARTIFACT-VERIFICATION.json').read_text())
assert receipt['complete'] and receipt['artifactAndBundleVerified'] and not receipt['sourceGitByteComparisonPending']
expected_members=next(a['members'] for a in receipt['artifactZips'] if a['id']==11716144963)
modules={'audit-maps-routes-camera.py':'CI-MAPS-ROUTES-CAMERA-AUDIT.json','audit-backend-memory.py':'CI-BACKEND-MEMORY-AUDIT.json','audit-mixed-restart.py':'CI-MIXED-RESTART-AUDIT.json'}
with tempfile.TemporaryDirectory(prefix='kairo-ci-audit-') as temp:
    root=pathlib.Path(temp)
    with zipfile.ZipFile(ARTIFACT) as z:
        names=z.namelist();assert len(names)==len(set(names))
        assert set(names)==set(expected_members)
        for name in names:
            n=pathlib.PurePosixPath(name);assert not n.is_absolute() and '..' not in n.parts
        z.extractall(root)
    for name,expected in expected_members.items():assert digest(root/name)==expected
    for script in modules:
        subprocess.run([sys.executable,str(HERE/script),str(root)],check=True)
        result=json.loads((HERE/modules[script]).read_text())
        assert result.get('complete',result.get('pass',False)),script
jobs=json.loads((HERE/'recovery-from-memory/jobs-final-refetched-tool-object.json').read_text())['jobs']
assert len(jobs)==1
job=jobs[0];assert job['run_id']==38176821997 and job['id']==114580856302 and job['status']=='completed' and job['conclusion']=='success'
lane_steps=[s for s in job['steps'] if 11<=s['number']<=20]
assert len(lane_steps)==10 and all(s['conclusion']=='success' for s in lane_steps)
out={'schemaVersion':1,'complete':True,'auditDate':'2026-10-13','collectionDate':'2026-10-11','runId':38176821997,'runAttempt':1,'jobId':114580856302,'triggerCommit':'cbcd22ff6b57ea2c168fa363332a80d7c414f7d5','currentSource':'70cd12f9a4d014e7e2cf931b9681c4bdc7f18789','rc16Source':'57c8dcc7fbd8fc2b62129498d1819050c78381a1','v073Source':'239794774320fcdebaa1d76ce8a77c5c25cfc48c','artifact':{'path':ARTIFACT.name,'id':11716144963,**EXPECTED,'membersVerified':len(expected_members)},'bankedBundleVerification':{'path':'ARTIFACT-VERIFICATION.json',**digest(HERE/'ARTIFACT-VERIFICATION.json'),'status':'Reused completed verified receipt; no bundle/runtime/performance rerun'},'passedLaneAndEndVerificationSteps':lane_steps,'auditModules':{k:{'script':digest(HERE/k),'output':{'path':v,**digest(HERE/v)}} for k,v in modules.items()},'safeJobLog':{'path':'recovery-from-memory/job-114580856302.connector-decoded.safe.log',**digest(HERE/'recovery-from-memory/job-114580856302.connector-decoded.safe.log'),'scope':'Connector-decoded UTF-8 log; not original HTTP transport bytes'},'disposition':'Offline integrity/arithmetic review complete. Preserve all adverse pairs and domain limits. The review establishes neither release approval nor a clean package, and does not reopen accepted startup tradeoffs. Current warm HTTP-state tail is separate from startup.','limitations':['CI evidence is separate from the local outer process ownership envelope.','Historical 0.7.3→RC16 and current RC16→candidate are distinct matched comparisons, not a pooled three-way run.','Original bundle remains internal/instrumented and releaseReady:false. Clean review package acceptance remains separate.']}
(HERE/'CI-AUDIT-COMPLETION.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'complete':True,'runId':38176821997,'artifactMembers':len(expected_members),'auditModules':list(modules.values())}))
