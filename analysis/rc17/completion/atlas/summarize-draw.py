from pathlib import Path
import json,hashlib
folder=Path(__file__).parent/'draw-diagnostic-20261007'
summary={'complete':False,'productionAcceptance':False,'sources':[],'phases':[]}
for lane in ['browser','labels']:
 path=folder/lane/'result.json';result=json.loads(path.read_text())
 assert result['complete'] and result['sourceVerified'] and result['compiledSourceVerified']
 assert not result['errors'] and not result['external']
 assert result['fixture']['knownSystems']==5485 and result['fixture']['gates']==6989
 summary['sources'].append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fingerprint':result['sourceFingerprint'],'harnessHashes':result['harnessHashes'],'fixture':result['fixture']})
 selections={s['name']:s for s in result['selectionOnly']}
 for phase in result['phases']:
  frames=phase['frames'];assert len(frames)>20
  if lane=='labels':assert any(f['labels']>0 for f in frames)
  row={'lane':lane,'name':phase['name'],'frames':len(frames),'scaleRange':[min(f['scale'] for f in frames),max(f['scale'] for f in frames)],'visibleRange':[min(f['visible'] for f in frames),max(f['visible'] for f in frames)],'labelCandidateRange':[min(f['labels'] for f in frames),max(f['labels'] for f in frames)],'timings':{k:{s:v[s] for s in ['count','min','p50','p95','max']} for k,v in phase['distributions'].items()},'selectionOnlyCameraBatchMeans':selections[phase['name']]['distribution']}
  summary['phases'].append(row)
assert len(summary['phases'])==12
assert len({s['fingerprint'] for s in summary['sources']})==1
summary['complete']=True
(folder/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for row in summary['phases']:print(row['name'],row['frames'],row['visibleRange'],row['labelCandidateRange'],{k:round(v['p50'],3) for k,v in row['timings'].items()},'selection',round(row['selectionOnlyCameraBatchMeans']['p50'],3),round(row['selectionOnlyCameraBatchMeans']['p95'],3))
