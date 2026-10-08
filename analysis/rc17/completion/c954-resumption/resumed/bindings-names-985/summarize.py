"""Summarize source-frozen ordinary results; no app execution."""
from pathlib import Path
import hashlib,json,statistics
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'aligned-abba-attempt1';receipt=json.loads((OUT/'receipt.json').read_text());assert receipt['complete'] and receipt['sourceVerified']
packets=[]
for run in receipt['runs']:
 raw=(OUT/(run['name']+'.json')).read_bytes();assert hashlib.sha256(raw).hexdigest()==run['resultSha256']
 p=json.loads(raw);assert p['complete'] and p['sourceVerified'] and len(p['cases'])==72 and len(p['controls'])==10
 assert p['fixtureNow']==receipt['fixtureNow'] and p['harnessSha256']==receipt['harnesses']['diagnostic.mjs']
 packets.append(p)
def identity(row):return tuple(row.get(k) for k in ['kind','namesCount','elementCount','visibility','clients'])
def semantics(row):return {k:row.get(k) for k in ['kind','namesCount','elementCount','visibility','clients','stateSha256','equivalentData','averageFrameBytes','namesJsonBytes']}
assert [[semantics(row) for row in p['cases']] for p in packets]==[[semantics(row) for row in packets[0]['cases']]]*4
rows=[]
for index,row in enumerate(packets[0]['cases']):
 results={k:row.get(k) for k in ['kind','namesCount','elementCount','visibility','clients','stateSha256','equivalentData','averageFrameBytes','namesJsonBytes']}
 operations=['updateBindings','noWorkSync'] if row['kind']=='binding-boundaries' else ['walletSync']
 results['operations']={}
 for name in operations:
  cases=[p['cases'][index] if name=='walletSync' else p['cases'][index][name] for p in packets]
  metrics={}
  for metric in ['medianMs','p95Ms','maxMs','meanMs','cpuMsPerOperation']:
   values=[c['timing']['sumMs']/c['repetitions'] if metric=='meanMs' else sum(c['cpu'].values())/1000/c['repetitions'] if metric=='cpuMsPerOperation' else c['timing'][metric] for c in cases]
   baseline=[values[0],values[3]];candidate=[values[1],values[2]];a=statistics.mean(baseline);b=statistics.mean(candidate)
   metrics[metric]={'baseline':baseline,'candidate':candidate,'baselineMean':a,'candidateMean':b,'delta':b-a,'percent':(b-a)/a*100 if a else None,'pairedDeltas':[values[1]-values[0],values[2]-values[3]]}
  results['operations'][name]=metrics
 rows.append(results)
summary={'sourceCommit':receipt['sourceCommit'],'complete':True,'sourceVerified':True,'equivalentPublicOutputs':True,'ordinaryArms':4,'casesPerArm':72,'controlsPerArm':10,'rows':rows,'adverseRows':[{'identity':identity(row),'operation':op,'metric':metric,**result} for row in rows for op,metrics in row['operations'].items() for metric,result in metrics.items() if result['delta']>0]}
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for r in rows:
 if r['kind']=='full-name-snapshots' or r['visibility']=='none' and r['elementCount'] and r['clients']==1:
  op='walletSync' if r['kind']=='full-name-snapshots' else 'updateBindings';m=r['operations'][op]['medianMs'];p=r['operations'][op]['p95Ms']
  print(identity(r),f"median {m['baselineMean']:.3f}->{m['candidateMean']:.3f};p95 {p['baselineMean']:.3f}->{p['candidateMean']:.3f}")
