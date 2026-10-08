from pathlib import Path
import collections,hashlib,json,statistics
HERE=Path(__file__).resolve().parent
OUT=HERE/'attempt1'
WORK=HERE.parents[7]
sha=lambda b:hashlib.sha256(b).hexdigest()
report=json.loads((OUT/'completed.json').read_text())
assert report['complete'] and report['cleanupVerified'] and len(report['measurements'])==16
summary={'sourceCommit':report['commit'],'sourceFingerprints':report['sources'],'ordinary':[],'retention':{},'profiles':[],'controls':{'workers':16,'renderedParityChecks':240,'allSourceAndCleanupVerified':True},'limits':['Two fresh-process ordinary measurements per arm; nearest AB and BA pairs are retained, not a population estimate.','Timed preparation contains navigation, API, parsing and fixed settles, not isolated index construction.','Instrumented CPU and forced-GC retention workers are separate from ordinary measurements.','Retention is one warmed two-cycle batch per arm, not a leak-slope proof.','Rendered oracle checks labels/time/event ordering/ticks/control targets, not pixel/trail rendering.']}
for case in ['repeat-small','repeat-cap','distinct-cap']:
    runs=[json.loads((OUT/f'{case}-{i}-{arm}.json').read_text()) for i,arm in enumerate(['baseline','candidate','candidate','baseline'],1)]
    for k in range(3):
        samples=[run['samples'][k] for run in runs]
        row={'case':case,'sample':samples[0]['name'],'metrics':{},'rawSamples':samples}
        for metric in ['taskMs','scriptMs','layoutMs','recalcMs','layouts','recalcs','heapUsed','heapTotal','domNodes','canvasDraws','windowMs']:
            values=[s[metric] for s in samples]; base=statistics.mean([values[0],values[3]]);cand=statistics.mean(values[1:3]);pairs=[]
            for b,c in [(values[0],values[1]),(values[3],values[2])]:pairs.append({'baseline':b,'candidate':c,'delta':c-b,'percent':(c/b-1)*100 if b else None})
            row['metrics'][metric]={'valuesABBA':values,'baselineMean':base,'candidateMean':cand,'delta':cand-base,'percent':(cand/base-1)*100 if base else None,'pairs':pairs}
        row['repeatedMaterialTaskRegression']=all(p['delta']>1 and p['percent']>10 for p in row['metrics']['taskMs']['pairs'])
        summary['ordinary'].append(row)
for arm in ['baseline','candidate']:
    data=json.loads((OUT/f'distinct-cap-retention-{arm}.json').read_text()); rows=[]
    for row in data['retention']:
        rows.append({'label':row['label'],'completedCycles':row['completedCycles'],'heapUsed':row['gc'][-1]['heap']['usedSize'],'dom':row['gc'][-1]['dom'],'overview':row['overview'],'windowListeners':row['listeners']['window'],'documentListeners':row['listeners']['document'],'targets':row['targets']})
    summary['retention'][arm]={'rows':rows,'lastBatchHeapDelta':rows[-1]['heapUsed']-rows[-2]['heapUsed'],'ownership':data['ownership']}
    root=WORK/f'kairo-replay-{arm}-a7-oct8';asset=next((root/'dist/client/assets').glob('page-*.js')); body=asset.read_text();lines=body.splitlines(keepends=True);starts=[];length=0
    for line in lines:starts.append(length);length+=len(line)
    # Exact compiled hook owning the request/pilot contract; ranges and bytes are retained.
    marker=body.index('The session does not belong to the selected pilot.');hook_start=body.rfind('function ',0,marker);hook_end=body.index('function ',marker)
    marker2=body.index('session-replay-heading',hook_end);controls_start=body.rfind('function ',hook_end-1,marker2);controls_end=body.index('function ',marker2)
    assert hook_start>=0 and controls_start==hook_end
    ranges={'replayHook':{'start':hook_start,'end':hook_end,'excerpt':body[hook_start:hook_start+180]},'replayControls':{'start':controls_start,'end':controls_end,'excerpt':body[controls_start:controls_start+180]}}
    profile_data=json.loads((OUT/f'distinct-cap-profile-{arm}.json').read_text())
    for record in profile_data['profiles']:
        file=Path(record['path']);raw=file.read_bytes();assert sha(raw)==record['sha256'];profile=json.loads(raw);nodes={node['id']:node for node in profile['nodes']};parents={child:node['id'] for node in nodes.values() for child in node.get('children',[])};exclusive=collections.Counter();inclusive=collections.Counter();top=collections.Counter();canvas_weight=0;canvas_refs=[]
        def category(node):
            f=node['callFrame'];name=f['functionName'];url=f['url']
            if name in ['(idle)','(program)','(garbage collector)']:return name
            if url.endswith('/'+asset.name):
                at=starts[f['lineNumber']]+f['columnNumber']
                for label,rng in ranges.items():
                    if rng['start']<=at<rng['end']:return label
                return 'otherPage'
            if '/framework-' in url:return 'framework'
            return 'nativeOrOther'
        for ident,weight in zip(profile['samples'],profile['timeDeltas']):
            node=nodes[ident];ms=weight/1000;exclusive[category(node)]+=ms;f=node['callFrame'];top[(f['url'].split('/')[-1],f['functionName'],f['lineNumber'],f['columnNumber'])]+=ms
            ancestor=node;seen=set()
            while ancestor:
                seen.add(category(ancestor));ancestor=nodes.get(parents.get(ancestor['id']))
            for cat in seen:inclusive[cat]+=ms
            if f['url'].endswith('/'+asset.name) and f['functionName']=='j.current':
                at=starts[f['lineNumber']]+f['columnNumber'];excerpt=body[at:at+800];assert 'getContext(`2d`)' in excerpt
                canvas_weight+=ms
                if not canvas_refs:canvas_refs.append({'lineNumber':f['lineNumber'],'columnNumber':f['columnNumber'],'excerpt':excerpt})
        summary['profiles'].append({'arm':arm,'path':file.name,'sha256':sha(raw),'pageAsset':asset.name,'pageAssetSha256':sha(asset.read_bytes()),'ranges':ranges,'exclusiveMs':dict(exclusive),'inclusiveMs':dict(inclusive),'canvasDrawCallbackExclusiveMs':canvas_weight,'canvasCallsite':canvas_refs,'topSelfSamples':[{'asset':a,'function':b,'lineNumber':c,'columnNumber':d,'ms':v}for(a,b,c,d),v in top.most_common(15)]})
summary['repeatedMaterialTaskRegressions']=[{'case':r['case'],'sample':r['sample']}for r in summary['ordinary'] if r['repeatedMaterialTaskRegression']]
(HERE/'SUMMARY.json').write_text(json.dumps(summary,indent=2)+'\n')
for row in summary['ordinary']:
    m=row['metrics'];t=m['taskMs'];s=m['scriptMs'];print(f"| {row['case']} | {row['sample'].removeprefix('replay-')} | {t['baselineMean']:.3f} | {t['candidateMean']:.3f} | {t['percent']:+.2f}% | {t['pairs'][0]['percent']:+.2f}% / {t['pairs'][1]['percent']:+.2f}% | {s['percent']:+.2f}% |")
print('PROFILE',[(x['arm'],x['path'],x['exclusiveMs'].get('replayHook',0),x['inclusiveMs'].get('replayHook',0),x['canvasDrawCallbackExclusiveMs'])for x in summary['profiles']])
