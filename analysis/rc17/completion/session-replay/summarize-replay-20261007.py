"""Reject partial/diagnostic runs when computing ordinary compiled ABBA results."""
from pathlib import Path
import json,statistics
P=Path(__file__).resolve().parent;R=P/'compiled-20261007';out={'ordinary':[],'retention':[],'profiles':[]}
def stats(xs):return {'values':xs,'mean':statistics.mean(xs),'min':min(xs),'max':max(xs)}
harness=set()
for case in ['repeat-small','repeat-cap','distinct-cap']:
 arms={arm:[json.loads((R/f'{case}-{i}-{arm}.json').read_text()) for i in ([1,4] if arm=='baseline' else [2,3])] for arm in ['baseline','candidate']}
 assert len({r['fixture']['replays'][0]['routeSha256'] for rs in arms.values() for r in rs})==1
 for r in [r for rs in arms.values() for r in rs]:
  assert r.get('endedAt') and not r.get('failure') and r['controls']=={'successfulBrowserExternalResponses':0,'rendererExceptions':0,'deniedBackendFetchAttempts':0}
  assert not r['profiling'] and r['retentionMode']=='none' and len(r['samples'])==3
  assert r['fixture']['replays'][0]['validated']['events']==(200 if case=='repeat-small' else 10000)
  assert r['fixture']['replays'][0]['validated']['uniqueSystems']==(1000 if case=='distinct-cap' else 11)
  assert r['fixture']['replays'][0]['backwardStart']['elapsed']==0 and len(r['eventSourceRequests'])==1
  harness.add(r['harnessSha256'])
 for sample in ['replay-prepare','replay-playback-start-60x','replay-playback-middle-60x']:
  xs={a:[next(s for s in r['samples'] if s['name']==sample) for r in rs] for a,rs in arms.items()}
  out['ordinary'].append({'case':case,'sample':sample,'arms':{a:{k:stats([s[k] for s in ss]) for k in ['windowMs','taskMs','scriptMs','layoutMs','recalcMs','canvasDraws']} for a,ss in xs.items()}})
assert len(harness)==1
out['ordinaryHarnessSha256']=next(iter(harness))
for arm in ['baseline','candidate']:
 r=json.loads((R/f'distinct-cap-retention-{arm}.json').read_text());assert r.get('endedAt') and not r.get('failure')
 before=r['retention'][0]['gc'][-1]['heap']['usedSize'];mounted=r['mountedReplayRetention']['gc'][-1]['heap']['usedSize'];after=r['retention'][1]['gc'][-1]['heap']['usedSize']
 out['retention'].append({'arm':arm,'beforeBytes':before,'mountedBytes':mounted,'afterUnmountBytes':after,'mountedDeltaBytes':mounted-before,'checkpoints':[{'label':c['label'],'heapUsedBytes':c['gc'][-1]['heap']['usedSize'],'dom':c['gc'][-1]['dom']} for c in r['retention']],'windowListenersStable':all(c['listeners']['window']==r['retention'][0]['listeners']['window'] for c in r['retention']),'pilotFences':r['pilotFencing'],'controls':r['controls']})
 p=json.loads((R/f'distinct-cap-profile-{arm}.json').read_text());assert p.get('endedAt') and not p.get('failure') and p['profiling']
 for sample in ['replay-playback-start-60x','replay-playback-middle-60x']:
  file=R/f'distinct-cap-profile-{arm}.json.{sample}.cpuprofile';profile=json.loads(file.read_text());nodes={n['id']:n for n in profile['nodes']};totals={}
  for node,us in zip(profile['samples'],profile['timeDeltas']):totals[node]=totals.get(node,0)+us
  top=[{'sampledMs':us/1000,'frame':nodes[node]['callFrame']} for node,us in sorted(totals.items(),key=lambda x:x[1],reverse=True)[:20]]
  out['profiles'].append({'arm':arm,'sample':sample,'path':str(file),'sampleCount':len(profile['samples']),'topSelfFrames':top})
(P/'replay-summary-20261007.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['ordinary'],indent=2))
