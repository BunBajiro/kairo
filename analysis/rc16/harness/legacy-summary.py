"""Summarise complete ABBA legacy results without hiding individual repetitions."""
import json, math, sys
from pathlib import Path
root=Path(sys.argv[1]); results={}
for name in ['baseline-1','candidate-1','candidate-2','baseline-2']:
    results[name]=json.loads((root/name/'backend.json').read_text())
    assert results[name]['complete']
settings=results['baseline-1']['settings']
env=results['baseline-1']['environment']
for report in results.values():
    assert report['settings']==settings
    assert all(report['environment'][k]==env[k] for k in ['cpu','logicalCpus','platform','arch','node','runner'])
    assert [(p['profile'],p['workload']['fingerprint']) for p in report['profiles']]==[(p['profile'],p['workload']['fingerprint']) for p in results['baseline-1']['profiles']]
rows=[]
def add(profile,metric,unit,fn):
    pairs=[]
    for i in [1,2]:
        a=fn(next(p for p in results['baseline-'+str(i)]['profiles'] if p['profile']==profile))
        b=fn(next(p for p in results['candidate-'+str(i)]['profiles'] if p['profile']==profile))
        assert math.isfinite(a) and math.isfinite(b)
        pairs.append({'baseline':a,'candidate':b,'delta':b-a,'percent':(b/a-1)*100 if a else None})
    avg=lambda key:sum(p[key] for p in pairs)/2
    rows.append({'profile':profile,'metric':metric,'unit':unit,'pairs':pairs,'baselineRange':[min(p['baseline'] for p in pairs),max(p['baseline'] for p in pairs)],'candidateRange':[min(p['candidate'] for p in pairs),max(p['candidate'] for p in pairs)],'changeOfMeanPercent':(avg('candidate')/avg('baseline')-1)*100 if avg('baseline') else None,'consistentLatencyRegressionOver10PercentAnd1Ms':unit=='ms' and all(p['delta']>1 and p['percent']>10 for p in pairs)})
for profile in ['typical','stress']:
    add(profile,'idle_cpu','% one core',lambda p:p['idle']['cpuPercentOneCore'])
    add(profile,'idle_rss','MiB',lambda p:p['idle']['rssAfterBytes']/1048576)
    add(profile,'idle_loop_max','ms',lambda p:p['idle']['eventLoopDelayMaxMs'])
    add(profile,'idle_loop_p95','ms',lambda p:p['idle']['eventLoopDelayP95Ms'])
    add(profile,'startKairo_startup','ms',lambda p:p['startupMs'])
    add(profile,'state_http','ms',lambda p:p['http']['latencyMs']['p50'])
    add(profile,'state_http_p95','ms',lambda p:p['http']['latencyMs']['p95'])
    for operation in results['baseline-1']['profiles'][['typical','stress'].index(profile)]['operations']:
        key=operation['name']; add(profile,key,'ms',lambda p,key=key:next(o for o in p['operations'] if o['name']==key)['latencyMs']['p50'])
        add(profile,key+'_p95','ms',lambda p,key=key:next(o for o in p['operations'] if o['name']==key)['latencyMs']['p95'])
        add(profile,key+'_cpu_p50','ms',lambda p,key=key:next(o for o in p['operations'] if o['name']==key)['cpuMs']['p50'])
        add(profile,key+'_payload','KiB',lambda p,key=key:next(o for o in p['operations'] if o['name']==key)['responseBytes']/1024)
database={}
database_rows=[]
if all((root/name/'database.json').exists() for name in results):
    database={name:json.loads((root/name/'database.json').read_text()) for name in results}
    assert all(d['complete'] for d in database.values())
    assert len({d['agedImports']['outputHash'] for d in database.values()})==1
    assert len({d['historyWrite']['outputHash'] for d in database.values()})==1
    assert len({d['after']['historyJsonBytes'] for d in database.values()})==1
    assert len({d['before']['historyJsonBytes'] for d in database.values()})==1
    for metric,fn in [('firstOpenMs',lambda d:d['firstOpenMs']),('agedImportsMs',lambda d:d['agedImports']['ms']['p50']),('eventInsertMs',lambda d:d['eventInsert']['ms']['p50']),('historyWriteMs',lambda d:d['historyWrite']['ms']['p50']),('historyWriteMaxBlockMs',lambda d:d['historyWrite']['synchronousBlockMs']['max'])]:
        a=[fn(database['baseline-'+str(i)]) for i in [1,2]];b=[fn(database['candidate-'+str(i)]) for i in [1,2]]
        database_rows.append({'metric':metric,'baselineRange':[min(a),max(a)],'candidateRange':[min(b),max(b)],'changeOfMeanPercent':(sum(b)/sum(a)-1)*100,'pairs':[{'baseline':x,'candidate':y,'delta':y-x,'percent':(y/x-1)*100}for x,y in zip(a,b)]})
summary={'schemaVersion':1,'complete':True,'settings':settings,'backend':rows,'database':database,'notes':['Two repetitions per source on one machine; ranges are observations, not confidence intervals.','Expanded RC16 catalogs/response fields are intentional; current cross-version complete backend response equivalence was not tested.','Fixture fingerprints capture workload counts; frozen harness hashes and source manifests support seeder provenance.','Database complete output hashes are required to agree across all four runs.']}
summary['databaseSummary']=database_rows
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(root/'comparison.json').write_text(json.dumps(summary,indent=2)+'\n')
fmt=lambda values:'–'.join(f'{x:.2f}' for x in values)
lines=['# Controlled legacy ABBA results','','| Profile / metric | v0.7.3 range | RC16 range | Mean change |','|---|---:|---:|---:|']
for row in rows:
    if row['metric'].endswith(('_payload','_p95','_cpu_p50')): continue
    lines.append(f"| {row['profile']} / {row['metric']} ({row['unit']}) | {fmt(row['baselineRange'])} | {fmt(row['candidateRange'])} | {row['changeOfMeanPercent']:+.1f}% |")
lines+=['','All operation timing values are run p50s. Startup is one start per profile/run. Idle values cover one 35-second observation per profile/run. Two run ranges are not confidence intervals.','', 'Fresh comparison validates production operations with fixture assertions. It does not claim full decoded cross-version backend output equality.']
if database:
    lines+=['','| Database metric | v0.7.3 range | RC16 range |','|---|---:|---:|']
    for label,fn in [('First open (ms)',lambda d:d['firstOpenMs']),('Cold aged imports (ms)',lambda d:d['agedImports']['ms']['p50']),('5,000 event inserts (ms)',lambda d:d['eventInsert']['ms']['p50']),('1,000 history updates (ms)',lambda d:d['historyWrite']['ms']['p50']),('Largest history write block (ms)',lambda d:d['historyWrite']['synchronousBlockMs']['max']),('Working history JSON (MiB)',lambda d:d['after']['historyJsonBytes']/1048576)]:
        a=[fn(database['baseline-'+str(i)]) for i in [1,2]];b=[fn(database['candidate-'+str(i)]) for i in [1,2]]
        lines.append(f'| {label} | {fmt([min(a),max(a)])} | {fmt([min(b),max(b)])} |')
    lines+=['','Cold import and saved history/source complete output hashes match in every database run.']
(root/'summary.md').write_text('\n'.join(lines)+'\n')
(root/'comparison.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'summary':str(root/'summary.json'),'consistentLatencySignals':[{k:r[k] for k in ['profile','metric','baselineRange','candidateRange','changeOfMeanPercent']} for r in rows if r['consistentLatencyRegressionOver10PercentAnd1Ms']],'databaseHashEquality':bool(database)}))
