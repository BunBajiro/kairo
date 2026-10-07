from pathlib import Path
import json,statistics,hashlib
folder=Path(__file__).parent/'kernel-run2'; report=json.loads((folder/'completed.json').read_text());assert report['complete']
rows=report['results'];assert len(rows)==32
semantic={}
for row in rows:
 path=folder/row['name'];assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
 assert row['complete']
 for k,v in row['semantic'].items():
  if k in semantic: assert semantic[k]==v
  semantic[k]=v
summary={'complete':True,'productionAcceptance':False,'rawSha256':hashlib.sha256((folder/'completed.json').read_bytes()).hexdigest(),'semantic':semantic,'timingMs':{},'collectedHeapIncreaseMiB':{}}
def stats(vals): return {'n':len(vals),'median':statistics.median(vals),'min':min(vals),'max':max(vals),'samples':vals}
for first in ['physical','schematic']:
 for key in ['mountMs','firstSwitchMs','cumulativeMs','replacementMountMs']:
  summary['timingMs'][first+'-'+key]={kind:stats([r['timings'][key] for r in rows if r['mode']=='timing' and r['first']==first and r['kind']==kind]) for kind in ['baseline','trial']}
 for key in ['afterMount','afterBoth']:
  summary['collectedHeapIncreaseMiB'][first+'-'+key]={kind:stats([(r['heap'][key]-r['heap']['before'])/2**20 for r in rows if r['mode']=='heap' and r['first']==first and r['kind']==kind]) for kind in ['baseline','trial']}
(folder.parent/'kernel-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print('32 complete source-pinned children; every projection, physical metadata and source replacement semantic digest equal')
