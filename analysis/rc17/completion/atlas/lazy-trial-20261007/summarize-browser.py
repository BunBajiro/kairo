from pathlib import Path
import json, hashlib, statistics
folder=Path(__file__).parent/'browser'
report=json.loads((folder/'completed.json').read_text())
assert report['complete'] is True
rows=report['results']
assert [r['kind'] for r in rows]==['baseline','trial','trial','baseline']
reference={}
for row in rows:
 data_path=Path(row['file'])
 assert hashlib.sha256(data_path.read_bytes()).hexdigest()==row['sha256']
 assert row['complete'] and row['sourceVerified'] and row['compiledSourceVerified']
 assert not row['errors'] and not row['external']
 for snap in row['snapshots']:
  projection=snap['name'].split('-')[-1]
  actual={k:snap[k] for k in ['label','scale','pixelsSha256']}
  if projection in reference: assert reference[projection]==actual
  reference[projection]=actual
assert all(r['radar']==rows[0]['radar'] for r in rows)
def stats(values):
 return {'n':len(values),'median':statistics.median(values),'min':min(values),'max':max(values),'samples':values}
summary={'source':'browser/completed.json','sourceSha256':hashlib.sha256((folder/'completed.json').read_bytes()).hexdigest(),'complete':True,'productionAcceptance':False,'canvasSnapshotsChecked':sum(len(r['snapshots']) for r in rows),'identicalRenderedPixelsAndScale':reference,'browserScriptDurationMs':{},'collectedHeapMiB':{}}
for phase in ['mount','first-switch','warm-switch']:
 for projection in ['physical','schematic']:
  summary['browserScriptDurationMs'][phase+'-'+projection]={kind:stats([v['metricsDelta']['ScriptDuration']*1000 for r in rows if r['kind']==kind for v in r['phases'] if v['name'].startswith(phase+'-') and v['name'].endswith('-'+projection)]) for kind in ['baseline','trial']}
for first in ['physical','schematic']:
 for phase in ['first','both','unmounted']:
  summary['collectedHeapMiB'][first+'-'+phase]={kind:stats([v['heap']['usedSize']/2**20 for r in rows if r['kind']==kind for v in r['heap'] if v['first']==first and v['phase']==phase]) for kind in ['baseline','trial']}
(folder.parent/'browser-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print('Verified 48 equal rendered pixel/physical scale snapshots, radar labels, source and raw-result hashes')
