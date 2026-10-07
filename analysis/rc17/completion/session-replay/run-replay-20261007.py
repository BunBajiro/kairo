import os,subprocess,json,pathlib,datetime
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc'); H=ROOT/'kairo-analysis-restored/analysis/rc17/completion/session-replay'; O=H/'compiled-20261007'; O.mkdir(exist_ok=True)
manifest={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lock':'/tmp/kairo-performance.lock','order':['baseline','candidate','candidate','baseline'],'runs':[]}
def run(name,arm,case,extra):
 repo=ROOT/('kairo-session-replay-baseline-c954' if arm=='baseline' else 'kairo-backend-session-frozen-c954')
 env=dict(os.environ,KAIRO_CHROME_PATH='/tmp/kairo-chrome-runtime/chromium',LD_LIBRARY_PATH='/tmp/kairo-chrome-runtime',KAIRO_BENCH_REPO=str(repo),KAIRO_BENCH_SOURCE_COMMIT='c954c0d808847f249df0659ed15fdce2e89f84c4'+('-minus-S3-R1' if arm=='baseline' else ''),KAIRO_REPLAY_CASE=case,KAIRO_FOLLOWUP_FRONTEND_OUTPUT=str(O/(name+'.json')),**extra)
 print('START',name,flush=True)
 with open(O/(name+'.log'),'w') as log: status=subprocess.call(['flock','/tmp/kairo-performance.lock','node',str(H/'compiled-replay-trial.mjs')],env=env,stdout=log,stderr=subprocess.STDOUT)
 manifest['runs'].append({'name':name,'repo':str(repo),'status':status,'case':case,'extra':extra}); (O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n'); print('END',name,status,flush=True)
 if status: raise SystemExit(status)
for case in ['repeat-small','repeat-cap','distinct-cap']:
 for i,arm in enumerate(manifest['order']): run(f'{case}-{i+1}-{arm}',arm,case,{'KAIRO_REPLAY_RETENTION_MODE':'none'})
for arm in ['baseline','candidate']: run(f'distinct-cap-retention-{arm}',arm,'distinct-cap',{'KAIRO_REPLAY_RETENTION_MODE':'focused'})
for arm in ['baseline','candidate']: run(f'distinct-cap-profile-{arm}',arm,'distinct-cap',{'KAIRO_REPLAY_RETENTION_MODE':'none','KAIRO_REPLAY_PROFILE':'1'})
manifest['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(); (O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
