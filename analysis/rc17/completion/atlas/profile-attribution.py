from pathlib import Path
import json, hashlib
folder=Path(__file__).parent/'browser-run1'
manifest=json.loads((folder/'source-manifest.json').read_text())
asset=next(v for v in manifest['builtFiles'] if v['path']=='dist/client/assets/page-BVL6zlRp.js')
rows=[]
for name in ['physical-pan-zoom','schematic-pan-zoom','schematic-activity-pan-zoom']:
 path=folder/(name+'.cpuprofile'); profile=json.loads(path.read_text()); nodes={n['id']:n for n in profile['nodes']}; parents={c:n['id'] for n in nodes.values() for c in n.get('children',[])}
 def ancestor(i):
  while i is not None:
   yield nodes[i]
   i=parents.get(i)
 def match(n,column):
  f=n['callFrame'];return f['url'].endswith('/assets/page-BVL6zlRp.js') and f['lineNumber']==77 and f['columnNumber']==column
 sums=dict(drawInclusiveMs=0,drawSelfMs=0,visibleFilterSelfMs=0,screenTransformSelfMs=0,nativeCanvasSelfMs=0,totalSampledWallMs=0,idleSampledWallMs=0)
 canvas={'clearRect','fillRect','strokeRect','beginPath','moveTo','lineTo','arc','fill','stroke','fillText','strokeText','measureText','drawImage','restore','save','setLineDash','translate','scale','setTransform','createLinearGradient'}
 for i,w in zip(profile['samples'],profile['timeDeltas']):
  n=nodes[i];ms=w/1000;sums['totalSampledWallMs']+=ms
  if n['callFrame']['functionName']=='(idle)':sums['idleSampledWallMs']+=ms
  if any(match(a,245417) for a in ancestor(i)):
   sums['drawInclusiveMs']+=ms
   if match(n,245417):sums['drawSelfMs']+=ms
   if match(n,248349):sums['visibleFilterSelfMs']+=ms
   if match(n,245542):sums['screenTransformSelfMs']+=ms
   if not n['callFrame']['url'] and n['callFrame']['functionName'] in canvas:sums['nativeCanvasSelfMs']+=ms
 rows.append(dict(name=name,profileSha256=hashlib.sha256(path.read_bytes()).hexdigest(),**sums))
output={'sourceFingerprint':manifest['fingerprint'],'compiledAsset':asset,'diagnostic':True,'note':'V8 CPU-profile samples are sampled main-thread wall attribution, not exact CPU and not individual loop timings. Native browser renderer/worker work is outside these call-tree sums. Function columns are mapped against the pinned page-BVL6zlRp.js asset.','rows':rows}
(folder/'attribution.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps(output,indent=2))
