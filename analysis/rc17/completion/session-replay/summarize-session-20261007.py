"""Summarize only complete matched Session-index write/cadence evidence."""
from pathlib import Path
import json,statistics
P=Path(__file__).resolve().parent;R=P/'timed-20261007';result={'writes':[],'cadence':[]}
def stats(xs):return {'values':xs,'mean':statistics.mean(xs),'min':min(xs),'max':max(xs)}
for n in [100,1000,10000]:
 for pilots in [1,4]:
  arms={arm:[json.loads((R/f'write-{n}-{pilots}-{i}-{arm}.json').read_text()) for i in ([1,4] if arm=='baseline' else [2,3])] for arm in ['baseline','candidate']}
  assert len({r['rowsSha256'] for rs in arms.values() for r in rs})==1
  assert all(r['rowCount']==pilots*(n+500) for rs in arms.values() for r in rs)
  record={'archivedPerPilot':n,'pilots':pilots,'rowsEqual':True,'arms':{a:{k:stats([r[k] for r in rs]) for k in ['upgradeMs','insertMs','endUpdateMs','beforeBytes','afterBytes']} for a,rs in arms.items()}}
  record['extraIndexBytes']=record['arms']['candidate']['afterBytes']['mean']-record['arms']['baseline']['afterBytes']['mean'];result['writes'].append(record)
for n,pilots in [(100,1),(10000,4)]:
 arms={arm:[json.loads((R/f'cadence-{n}-{pilots}-{i}-{arm}.json').read_text()) for i in ([1,4] if arm=='baseline' else [2,3])] for arm in ['baseline','candidate']}
 for a,rs in arms.items():
  assert all(r['counts']['ticks']==41 and r['counts']['syncRecentCalls']==41*pilots and r['actualTickOffsetsMs'][-1]>=120000 for r in rs)
  assert all(len(r['tickWorkMs'])==41 and r['liveState']['nextSequence']==100 for r in rs)
 assert len({(r['counts']['historyProviderCalls'],r['counts']['liveProviderCalls']) for rs in arms.values() for r in rs})==1
 result['cadence'].append({'archivedPerPilot':n,'pilots':pilots,'controls':arms['baseline'][0]['counts'],'arms':{a:{'cpuMs':stats([(r['measurement']['cpu']['user']+r['measurement']['cpu']['system'])/1000 for r in rs]),'tickTotalMs':stats([sum(r['tickWorkMs']) for r in rs]),'tickP50Ms':stats([statistics.median(r['tickWorkMs']) for r in rs]),'tickMaxMs':stats([max(r['tickWorkMs']) for r in rs]),'eventLoopMaxMs':stats([r['measurement']['eventLoop']['maxMs'] for r in rs])} for a,rs in arms.items()}})
(P/'session-summary-20261007.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
