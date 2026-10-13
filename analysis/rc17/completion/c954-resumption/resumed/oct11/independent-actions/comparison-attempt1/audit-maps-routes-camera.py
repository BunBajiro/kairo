#!/usr/bin/env python3
"""Offline CI evidence audit. Usage: python audit-maps-routes-camera.py EVIDENCE_DIR.

Consumes the original Actions artifact only; never executes the application.
The banked ARTIFACT-VERIFICATION.json owns the already completed bundle audit.
"""
import hashlib,json,math,pathlib,statistics,sys

HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path(sys.argv[1]).resolve()
receipt=json.loads((HERE/'ARTIFACT-VERIFICATION.json').read_text())
members=next(a['members'] for a in receipt['artifactZips'] if a['id']==11716144963)
bindings={}
for name,expected in members.items():
    b=(ROOT/name).read_bytes()
    actual={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
    assert actual==expected,(name,actual,expected)
    bindings[name]=actual

checks=0
def check(actual,expected):
    global checks
    if isinstance(expected,(float,int)) and not isinstance(expected,bool):
        assert math.isclose(actual,expected,rel_tol=1e-10,abs_tol=1e-9),(actual,expected)
    else: assert actual==expected,(actual,expected)
    checks+=1
def read(n):return json.loads((ROOT/n).read_text())
def mean(v):return sum(v)/len(v)
def percentile(v,p):return sorted(v)[max(0,min(len(v)-1,math.ceil(len(v)*p)-1))]
def comparison(case,metric,b,c):
    pairs=[]
    for i,(x,y) in enumerate(zip(b,c),1):
        delta=y-x;pct=(y/x-1)*100 if x else None
        pairs.append({'pair':i,'baseline':x,'candidate':y,'delta':delta,'percent':pct,'joint1ms10pctDiagnosticFlag':delta>1 and pct is not None and pct>10})
    bm,cm=mean(b),mean(c)
    return {'case':case,'metric':metric,'baseline':b,'candidate':c,'baselineMean':bm,'candidateMean':cm,'delta':cm-bm,'percent':(cm/bm-1)*100 if bm else None,'pairs':pairs}
commits={'baseline':'57c8dcc7fbd8fc2b62129498d1819050c78381a1','candidate':'70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'}
fingerprints={'baseline':'02f9f83a84fb0df602c7089415b7e88780e87acb6c9a7cad65fe02ff70ded818','candidate':'4244e33638602437329df4c503b0ca3045b4068543d121a92ed3762e2e505362'}
maps={}
for variant in commits:
    for idx in (1,2):
        n=f'maps/{variant}-{idx}/maps-timings'+('-reverse' if idx==2 else '')+'.json'
        d=read(n);maps[f'{variant}-{idx}']=d
        check(d['sourceAndHarnessStableDuringRun'],True);check(d['networkAttempts'],0)
        check(d['testedSourceGitHeadBefore'],commits[variant]);check(d['testedSourceGitHead'],commits[variant])
        check(d['order'],'forward' if idx==1 else 'reverse')
        for k in ('manifestVerificationBefore','manifestVerificationAfter'):
            check(d[k],{'fingerprint':fingerprints[variant],'sourceCommit':commits[variant],'dirty':False})
        for r in d['results']:
            if r.get('skipped'):continue
            check(len(r['samples']),7)
            for key,func in [('minMs',min),('medianMs',statistics.median),('maxMs',max)]:check(r[key],func([s['wallMs'] for s in r['samples']]))
            check(len(set(s['outputBytes'] for s in r['samples'])),1)
        d['byName']={r['name']:r for r in d['results']}
diags={v:read(f'maps/{v}-diagnostics/maps-diagnostics.json') for v in commits}
mapdiag=[]
for v,d in diags.items():
    check(d['sourceAndHarnessStableDuringRun'],True);check(d['networkAttempts'],0)
    for r in d['results']:
        if r.get('skipped'):continue
        for key in ['calls','rows','jsonBytes','changes']:check(r['totals'][key],sum(s.get(key,0) for s in r['sql'].values()))
        check(r['totals']['changes'],0)
        check(sum(r['materialization']['linksByMap'].values()),r['materialization']['linkBodies'])
        if v=='candidate':
            check(r['signatureEdgeScan']['calls'],0);check(r['signatureEdgeScan']['predicateVisits'],0)
            if r['action']=='summaries':check(r['materialization']['signatureBodies'],0)
        for i in (1,2):
            t=maps[f'{v}-{i}']['byName'][r['name']]
            check(t['fixture'],r['fixture']);check(t['correctness'],r['correctness']);check(t['samples'][0]['outputBytes'],r['outputBytes'])
        mapdiag.append({'variant':v,**{k:r[k] for k in ['name','fixture','correctness','outputBytes','totals','signatureEdgeScan','materialization']}})
maprows=[];summaryonly=[]
for name,br in maps['baseline-1']['byName'].items():
    if br.get('skipped'):
        summaryonly.append({'case':name,'runs':[{k:maps[f'candidate-{i}']['byName'][name][k] for k in ('fixture','correctness','medianMs','maxMs','samples')} for i in (1,2)]});continue
    for i in (1,2):
        b=maps[f'baseline-{i}']['byName'][name];c=maps[f'candidate-{i}']['byName'][name]
        check(b['fixture'],c['fixture']);check({k:v for k,v in b['correctness'].items() if k!='selectedSemanticDigest'},{k:v for k,v in c['correctness'].items() if k!='selectedSemanticDigest'})
        check(b['samples'][0]['outputBytes'],c['samples'][0]['outputBytes'])
    for field,label in [('wallMs','WallMs'),('cpuMs','CpuMs'),('serializeMs','SerializeMs')]:
        for func,agg in [(statistics.median,'median'),(max,'max')]:
            vals={v:[func([s[field] for s in maps[f'{v}-{i}']['byName'][name]['samples']]) for i in (1,2)] for v in commits}
            maprows.append(comparison(name,agg+label,vals['baseline'],vals['candidate']))
# The selected-object raw hash differs by property order; assert the exact known
# pair without relabelling JSON bytes as equal. Semantic reference is banked.
digests={v:sorted(set(r['correctness']['selectedSemanticDigest'] for r in maps[v+'-1']['results'] if not r.get('skipped') and r['family']=='independence' and r['action']!='summaries')) for v in commits}
check(digests['baseline'],['b38a1d82a5af13ada4c466aa907a3ba81261dbb4d5f37953789899e55bcbbd7c'])
check(digests['candidate'],['5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968'])
routes=read('routes/results.json');check(routes['complete'],True);check(routes['sourceAndHarnessEndVerified'],True)
for v in commits:check(routes['source'][v],{'commit':commits[v],'fingerprint':fingerprints[v],'dirty':False})
routevalues={};routehashes={};graphbuilds={}
for run in routes['runs']:
    check(run['complete'],True);check(run['networkAttempts'],0)
    prep=run['fixture']['discoveryPreparation'];check(prep['expectedMemberships'],100);check(prep['available'],run['variant']=='candidate')
    if run['variant']=='candidate':check(prep['seededMemberships'],100)
    for c in run['cases']:
        key=str(c['stops']);dig=[c['fixtureDigest'],c['semanticDigest'],c['hops']]
        if key in routehashes:check(dig,routehashes[key])
        else:routehashes[key]=dig
        if run['mode']=='diagnostics':
            check(c['diagnostics']['graphBuilds'],c['stops'] if run['variant']=='baseline' else 1)
            graphbuilds.setdefault(run['variant'],{})[key]=c['diagnostics']['graphBuilds'];continue
        vals=c['latencyMs'];check(len(vals),9)
        rv={'run':run['name'],'n':len(vals),'medianMs':percentile(vals,.5),'p95Ms':percentile(vals,.95),'minMs':min(vals),'maxMs':max(vals)}
        saved=next(s for s in routes['summary'] if s['stops']==c['stops'])[run['variant']]
        for k,x in next(s for s in saved if s['run']==run['name']).items():check(rv[k],x)
        routevalues[(run['name'],key)]=rv
routerows=[comparison(f'{stops} stops',metric,[routevalues[(f'baseline-{i}',str(stops))][metric] for i in (1,2)],[routevalues[(f'candidate-{i}',str(stops))][metric] for i in (1,2)]) for stops in (1,10,50) for metric in ('medianMs','p95Ms','maxMs')]
camera=read('browser-camera/summary.json');cp=read('browser-camera/provenance.json');check(cp['complete'],True);check(cp['endVerified'],True)
cruns={n:read(f'browser-camera/{n}.json') for n in cp['order']}
for n,r in cruns.items():
    v=n.split('-')[0];check(r['complete'],True);check(r['sourceVerified'],True)
    check(r['source'],{'commit':commits[v],'fingerprint':fingerprints[v],'dirty':False})
    check(r['fixture']['digest'],cp['fixtureDigest']);check(r['errors'],[]);check(r['external'],[])
    for s in r['samples']:check(s['requests'],[])
    dg=r['diagnostics'];check(dg['styleMutations']['sceneNodeChanges'],0);check(dg['afterUnmountRequests'],[])
    for k in ['retainedBefore','retainedAfter']:
        check(dg[k]['visible']['mapNodes'],0);check(dg[k]['visible']['canvases'],0)
camerarows=[]
for sr in camera['rows']:
    vals={}
    for v in commits:
        vals[v]=[]
        for i in (1,2):
            sample=next(s for s in cruns[f'{v}-{i}']['samples'] if s['nodes']==sr['nodes'] and s['name']==sr['scenario'])
            value=sample
            for part in sr['metric'].split('.'):value=value[part]
            vals[v].append(value)
        check(vals[v],sr[v])
    row=comparison(f"{sr['nodes']} nodes {sr['scenario']}",sr['metric'],vals['baseline'],vals['candidate'])
    for k in ['baselineMean','candidateMean']:
        if k in sr:check(row[k],sr[k])
    if 'deltaPercent' in sr:check(row['percent'],sr['deltaPercent'])
    camerarows.append(row)
check(camera['diagnostics'],[{'run':n,**{k:r['diagnostics'][k] for k in ['styleMutations','active600','retainedBefore','retainedAfter','afterUnmountRequests']}} for n,r in cruns.items()])
allrows=maprows+routerows+camerarows
check(len(allrows),141)
out={'schemaVersion':1,'scope':'Actions 38176821997 attempt 1 only; offline arithmetic and semantic receipt audit; no runtime rerun; local evidence is separate','complete':True,'runId':38176821997,'runAttempt':1,'sourcePair':commits,'bindings':bindings,'artifactMembersVerified':len(bindings),'checksPassed':checks,'comparisonRows':len(allrows),'matchedPairs':sum(len(r['pairs']) for r in allrows),'maps':{'comparisons':maprows,'candidateOnlySummaries':summaryonly,'selectedDigestPair':digests,'diagnostics':mapdiag},'routes':{'comparisons':routerows,'fullPlanHashesMatchAllSixRuns':True,'hashesAndHops':routehashes,'graphBuilds':graphbuilds},'camera':{'comparisons':camerarows,'diagnostics':camera['diagnostics'],'samples':{n:r['samples'] for n,r in cruns.items()},'limits':camera['limits']},'positivePairs':[{'case':r['case'],'metric':r['metric'],**p} for r in allrows for p in r['pairs'] if p['delta']>0],'bothPairsJoint1ms10pct':[r for r in allrows if all(p['joint1ms10pctDiagnosticFlag'] for p in r['pairs'])],'limitations':['The marker is descriptive >1 ms AND >10% in both paired observations, not a significance test or acceptance gate. RAF over33ms is a count, not ms.','Maps max is the observed maximum of seven samples; route nearest-rank p95 of nine is the observed maximum.','Camera raw RAF timestamp arrays were not archived; retained RAF aggregates are checked against summary, not independently reconstructed quantiles.','Selected Maps raw hashes differ in the exact known RC16/candidate pair; banked maps-equivalence-059 comparison preserves property-order-only semantics.','No desktop GPU, physical OBS or population-tail claim. No causal source bug established by these observations.']}
(HERE/'CI-MAPS-ROUTES-CAMERA-AUDIT.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'complete':True,'members':len(bindings),'checks':checks,'rows':len(allrows),'pairs':out['matchedPairs'],'nonRafRepeatedFlags':[{'case':r['case'],'metric':r['metric'],'delta':r['delta'],'percent':r['percent']} for r in out['bothPairsJoint1ms10pct'] if not r['metric'].startswith('raf.')]}))
