#!/usr/bin/env python3
"""Offline evidence/code audit only. Does not run Kairo, a browser or a benchmark."""
from pathlib import Path
import gzip, hashlib, json, math, re, subprocess

here=Path(__file__).resolve().parent
analysis=next(p for p in here.parents if (p/'analysis/rc17/harness/source-manifest.mjs').is_file())
atlas=analysis/'analysis/rc17/completion/atlas'
saved=atlas/'draw-diagnostic-20261007'
app=analysis.parent/'kairo-rc17-c954-continuation'
current='22773cc7cb6e83ac51e412565ba65c101613536a'
base='9afa9a7197fa6b5a802e9efdaa322dedf2439150'
def digest(v):return hashlib.sha256(v).hexdigest()
def encode(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()
def gitfile(commit,path):return subprocess.check_output(['git','-C',str(app),'show',commit+':'+path])
def entry(manifest,path):return next(v for v in manifest['files'] if v['path']==path)
def distribution(samples):
    ordered=sorted(samples)
    return {'count':len(samples),'min':ordered[0],'p50':ordered[max(0,math.ceil(len(samples)*.5)-1)],'p95':ordered[max(0,math.ceil(len(samples)*.95)-1)],'max':ordered[-1],'samples':samples}
def same_stats(actual,expected):
    assert actual['count']==expected['count']
    for key in ['min','p50','p95','max']:assert math.isclose(actual[key],expected[key],abs_tol=1e-12),key
    assert len(actual['samples'])==len(expected['samples'])
    assert all(math.isclose(a,b,abs_tol=1e-12) for a,b in zip(actual['samples'],expected['samples']))
def patch_text(original,patch):
    source=original.splitlines(keepends=True);lines=patch.splitlines(keepends=True);output=[];cursor=0;i=0
    while i<len(lines):
        match=re.match(r'@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@',lines[i])
        if not match:i+=1;continue
        start=int(match[1])-1;assert start>=cursor;output.extend(source[cursor:start]);cursor=start;i+=1
        while i<len(lines) and not lines[i].startswith(('@@ ','diff --git ')):
            line=lines[i]
            if line.startswith((' ','-')):assert source[cursor]==line[1:];cursor+=1
            if line.startswith((' ','+')):output.append(line[1:])
            i+=1
    output.extend(source[cursor:]);return ''.join(output)

manifest=json.loads((saved/'source-manifest.json').read_text())
instrumented=patch_text(gitfile(base,'components/kairo/universe-map.tsx').decode(),(saved/'instrumentation.patch').read_text()).encode()
assert digest(instrumented)==entry(manifest,'components/kairo/universe-map.tsx')['sha256']
baseline=gitfile(base,'components/kairo/universe-map.tsx').decode();candidate=gitfile(current,'components/kairo/universe-map.tsx').decode()
def draw(source):return source[source.index('  paintRef.current = () => {'):source.index('  useEffect(() => {redraw();}, [atlas,')]
assert draw(baseline)==draw(candidate)
relevant=['components/kairo/universe-map-math.mjs','components/kairo/universe-map-navigation.mjs','components/kairo/universe-map-operations.mjs','components/kairo/universe-map-labels.mjs','components/kairo/universe-map-portals.mjs','lib/universe-schematic-layout.mjs','server/data/universe.json.gz']
comparisons=[]
for path in relevant:
    body=gitfile(current,path);assert body==gitfile(base,path);assert digest(body)==entry(manifest,path)['sha256']
    comparisons.append({'path':path,'sha256':digest(body),'sameAsSavedDiagnosticSource':True})
fixtureBytes=gitfile(current,'server/data/universe.json.gz');fixture=json.loads(gzip.decompress(fixtureBytes));known=[s for s in fixture['systems'] if s['space']=='known']
assert len(fixture['systems'])==8490 and len(known)==5485 and len(fixture['gates'])==6989
def points(projection):
    if projection=='physical':
        rows=[s for s in known if math.isfinite(s['map_x']) and math.isfinite(s['map_y'])];xx='map_x';yy='map_y'
    else:
        rows=sorted({s['system_id']:s for s in known}.values(),key=lambda s:s['system_id']);xx='schematic_x';yy='schematic_y'
        assert all(math.isfinite(s[xx]) and math.isfinite(s[yy]) for s in rows)
        assert len({(s[xx],s[yy]) for s in rows})==len(rows)
    lowx=min(s[xx] for s in rows);highx=max(s[xx] for s in rows);lowy=min(s[yy] for s in rows);highy=max(s[yy] for s in rows)
    scale=1000/max(1,highx-lowx,highy-lowy)
    x0=lowx if projection=='physical' else (lowx+highx)/2;y0=lowy if projection=='physical' else (lowy+highy)/2
    return [{'id':s['system_id'],'x':(s[xx]-x0)*scale,'y':(s[yy]-y0)*scale} for s in rows]
projections={p:points(p) for p in ['physical','schematic']}
def reconstruct(camera,projection):
    x=camera['x'];y=camera['y'];scale=camera['scale'];width=camera['width'];height=camera['height']
    projected=projections[projection];byid={p['id']:p for p in projected}
    def screen(p):return p['x']*scale+x,p['y']*scale+y
    ids=[];edges=[]
    for point in projected:
        px,py=screen(point)
        if px>-35 and px<width+35 and py>-35 and py<height+35:ids.append(point['id'])
    for gate in fixture['gates']:
        f=byid.get(gate['from_system_id']);t=byid.get(gate['to_system_id'])
        if f is None or t is None:continue
        ax,ay=screen(f);bx,by=screen(t)
        if (ax<0 and bx<0) or (ay<0 and by<0) or (ax>width and bx>width) or (ay>height and by>height):continue
        edges.append([gate['from_system_id'],gate['to_system_id']])
    return ids,edges

evidence=[];phases=[];frameCount=0;cameraCount=0;sampleCount=0
for lane in ['browser','labels']:
    folder=saved/lane;result=json.loads((folder/'result.json').read_text());source=json.loads((folder/'source-manifest.json').read_text());receipt=json.loads((folder/'build-receipt.json').read_text())
    assert source==manifest
    assert digest(encode({'files':source['files'],'builtFiles':source['builtFiles']}))==source['fingerprint']==result['sourceFingerprint']==receipt['sourceFingerprint']
    assert digest((folder/'build-receipt.json').read_bytes())==result['buildReceiptSha256']
    assert receipt['exitCode']==0 and result['sourceCommit']=='c954c0d808847f249df0659ed15fdce2e89f84c4'
    assert all(result[k] is True for k in ['complete','sourceVerified','compiledSourceVerified','cleanupVerified','diagnostic'])
    assert result['productionAcceptance'] is False and result['errors']==[] and result['external']==[]
    assert result['fixture']['atlasSha256']==digest(fixtureBytes)
    harnesses=[]
    for path,expected in result['harnessHashes'].items():
        actual=(atlas/path).resolve();assert digest(actual.read_bytes())==expected
        harnesses.append({'path':str(actual.relative_to(analysis)),'sha256':expected})
    for phase,selection in zip(result['phases'],result['selectionOnly']):
        assert phase['name']==selection['name'] and phase['mode']=='boundary-timers';frames=phase['frames'];frameCount+=len(frames)
        for key,stored in phase['distributions'].items():same_stats(distribution([f[key] for f in frames]),stored)
        cameras=frames[::10];assert len(cameras)==selection['count']==len(selection['semantic']);assert len(selection['samples'])==len(cameras)*25
        cameraCount+=len(cameras);sampleCount+=len(selection['samples'])
        batches=[selection['samples'][i:i+25] for i in range(0,len(selection['samples']),25)]
        means=[sum(batch)/25 for batch in batches];same_stats(distribution(means),selection['distribution'])
        for frame,semantic in zip(cameras,selection['semantic']):
            assert frame['camera']==semantic['camera'] and frame['visible']==semantic['visible'] and frame['gatesDrawn']==semantic['gatesDrawn']
            ids,edges=reconstruct(frame['camera'],frame['projection'])
            assert len(ids)==frame['visible'] and len(edges)==frame['gatesDrawn']
            assert digest(encode(ids))==semantic['idsSha256'] and digest(encode(edges))==semantic['edgesSha256']
        labelRange=[min(f['labels'] for f in frames),max(f['labels'] for f in frames)]
        assert labelRange==[0,0] if lane=='browser' else labelRange[0]>0
        phases.append({'name':phase['name'],'frames':len(frames),'cameraBatches':len(cameras),'samplesPerCamera':25,'selectionCameraMeanMs':{k:v for k,v in distribution(means).items() if k!='samples'},'selectionIndividualMs':{k:v for k,v in distribution(selection['samples']).items() if k!='samples'},'boundaryMs':{key:{k:v for k,v in value.items() if k!='samples'} for key,value in phase['distributions'].items()},'systemLabelCandidatesRange':labelRange,'visibleRange':[min(f['visible'] for f in frames),max(f['visible'] for f in frames)],'scaleRange':[min(f['scale'] for f in frames),max(f['scale'] for f in frames)],'cameraCountsAndReconstructedOrderedHashParity':True})
    evidence.append({'lane':lane,'resultSha256':digest((folder/'result.json').read_bytes()),'sourceManifestSha256':digest((folder/'source-manifest.json').read_bytes()),'buildReceiptSha256':digest((folder/'build-receipt.json').read_bytes()),'harnessesVerified':harnesses,'savedCompletionAndCleanupGuards':True,'savedCompiledGuard':True,'originalBuildLogAvailable':Path(receipt['buildLog']).exists(),'oldCompiledAssetsRehashedNow':False})

report={'kind':'offline-saved-evidence-and-current-code-audit','currentSourceCommit':current,'referenceSourceCommit':base,'savedDiagnosticBase':'c954c0d808847f249df0659ed15fdce2e89f84c4','applicationExecuted':False,'benchmarkRun':False,'productionAcceptance':False,'instrumentationReconstructedExactly':True,'diagnosticMapSha256':digest(instrumented),'currentMapSha256':digest(candidate.encode()),'baselineMapSha256':digest(baseline.encode()),'paintFunctionByteIdentical':True,'paintFunctionSha256':digest(draw(candidate).encode()),'relevantUnchangedFiles':comparisons,'evidence':evidence,'phases':phases,'totals':{'phases':len(phases),'instrumentedFrames':frameCount,'cameraBatches':cameraCount,'selectionRepetitions':sampleCount},'limitations':['Historical compiled artifacts/build log are not present for fresh rehash; stored matching manifests/receipts and completion guards are verified.','Saved original browser counters verify selected counts, not point/gate order; this offline audit additionally reconstructs ordered hashes from exact unchanged source fixture/predicates.','Selection diagnostic repeats a helper with ID/edge-array allocations and excludes Canvas, React, workers and label collision work.','No spatial index implementation, ordinary A/B result, index build/update cost or retained-memory comparison is measured.']}
(here/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verified':True,'totals':report['totals'],'paintFunctionByteIdentical':True,'evidenceLanes':len(evidence)}))
