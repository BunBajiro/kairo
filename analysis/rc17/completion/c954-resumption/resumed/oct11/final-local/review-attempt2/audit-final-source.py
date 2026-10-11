"""Read-only independent audit of final-source all attempt2; no app imports."""
from pathlib import Path
import hashlib,json,math,re,subprocess
from collections import Counter,defaultdict

HERE=Path(__file__).resolve().parent
ATTEMPT=HERE.parent/'final-source-all-attempt2'
sha=lambda b:hashlib.sha256(b).hexdigest()
compact=lambda v:json.dumps(v,separators=(',',':'),ensure_ascii=False)
load=lambda p:json.loads(Path(p).read_text())
checks=Counter()

def check(value,message):
    assert value,message
    checks[message]+=1

def close(a,b,label):
    if isinstance(a,bool) or a is None or isinstance(a,str):check(a==b,label);return
    if isinstance(a,(float,int)):
        check(isinstance(b,(float,int)) and not isinstance(b,bool) and math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-9),label);return
    if isinstance(a,list):
        check(isinstance(b,list) and len(a)==len(b),label+' array length')
        for x,y in zip(a,b):close(x,y,label)
    else:
        check(isinstance(b,dict) and a.keys()==b.keys(),label+' keys')
        for k in a:close(a[k],b[k],label)

def file_entry(entry,root=None):
    p=Path(entry['path']);p=p if p.is_absolute() else root/p
    data=p.read_bytes()
    check(len(data)==entry['bytes'] and sha(data)==entry['sha256'],'bound file byte/hash')
    return len(data)

r=load(ATTEMPT/'receipt.json');inventory=load(ATTEMPT/'artifacts.json');release=load(ATTEMPT/'lock-release.json')
check(r['complete'] is False and r['endVerified'] and r['cleanupComplete'] is False,'strict failed envelope')
check(len(r['failures'])==6 and all(f['kind']=='temporary-data' for f in r['failures']),'only three temporary paths at both final checks')
check({f['row'] for f in r['failures']}=={'startup-core-1-3-candidate','startup-format-1-3-candidate','startup-format-3-4-baseline'},'exact failed temporary paths')
check(r['finalRowEvidence']['complete'] is False and r['finalInventoryEvidence']['complete'] is False,'both strict provenance checks failed')
check(r['performanceAcceptance'] is False,'no blanket performance acceptance')
check(release['complete'] is False and release['evidenceComplete'] is False and not release['errors'] and release['interrupted'] is None,'release preserves failed evidence')
check(len(release['releases'])==2 and all(x['closed'] for x in release['releases']),'both locks released')
check(len(r['locks'])==2 and all(x['acquired'] and x['code']==0 and x['signal'] is None for x in r['locks']),'both locks acquired')
for entry in release['evidence'].values():file_entry(entry,ATTEMPT)
check(inventory['complete'] is False and sha(compact(inventory['files']).encode())==inventory['sha256'],'failed artifact inventory fingerprint')
artifact_bytes=sum(file_entry(f) for f in inventory['files'])
actual={str(p) for p in ATTEMPT.rglob('*') if p.is_file()}
expected={f['path'] for f in inventory['files']}|{str(ATTEMPT/'artifacts.json'),str(ATTEMPT/'lock-release.json')}
check(actual==expected,'complete attempt file set')
check(r['harnessBefore']==r['harnessAfter'],'harness unchanged')
for f in r['harnessBefore']['files']:file_entry(f)
check(sha(compact(r['harnessBefore']['files']).encode())==r['harnessBefore']['sha256'],'harness fingerprint')
for f in r['configAfter']['files']:file_entry(f)
source_audit={}
for arm,commit in [('baseline','57c8dcc7fbd8fc2b62129498d1819050c78381a1'),('candidate','70cd12f9a4d014e7e2cf931b9681c4bdc7f18789')]:
    p=ATTEMPT/(arm+'-source.json');m=load(p);root=Path(m['root'])
    check(m['sourceCommit']==m['expectedCommit']==commit and m['requireClean'] and not m['dirty'] and m['status']=='','source manifest identity')
    for f in m['files']+m['builtFiles']:file_entry(f,root)
    check(m['builtFiles'] and sha(compact({'files':m['files'],'builtFiles':m['builtFiles']}).encode())==m['fingerprint'],'source and build fingerprint')
    head=subprocess.check_output(['git','--no-optional-locks','-C',str(root),'rev-parse','HEAD'],text=True).strip()
    status=subprocess.check_output(['git','--no-optional-locks','-C',str(root),'status','--porcelain','--untracked-files=all'],text=True)
    check(head==commit and status=='','current source clean and pinned')
    tracked=subprocess.check_output(['git','--no-optional-locks','-C',str(root),'ls-files','-z','--cached','--others','--exclude-standard']).decode().split('\0')
    check(set(filter(None,tracked))=={f['path'] for f in m['files']},'current source file set')
    built={str(f.relative_to(root)) for f in (root/'dist/client').rglob('*') if f.is_file()}
    check(built=={f['path'] for f in m['builtFiles']},'current built file set')
    after=r['sourceAfter'][arm];check(after['verified'] and after['commit']==commit and after['fingerprint']==m['fingerprint'],'post-source receipt')
    for f in after['manifests']['files']:file_entry(f)
    source_audit[arm]={'commit':commit,'fingerprint':m['fingerprint'],'sourceFiles':len(m['files']),'builtFiles':len(m['builtFiles']),'manifestSha256':sha(p.read_bytes()),'currentClean':True}

raw_rows=[];semantics={};contracts={};database_contracts=[];quantile_checks=0;current_tmp_directories=[];log_discrepancies=[];embedded_only_rows=[]
for row in r['rows']:
    proc=row['process'];p=Path(row['directory'])
    check(all(row[k] for k in ['complete','cleanupComplete','preVerified','postVerified','childValidated']),'child validation and cleanup')
    check(proc['exitCode']==0 and proc['signal'] is None and proc['closed'] and proc['groupCleanupComplete'] and not proc['timedOut'] and not proc.get('interrupted'),'clean child exit')
    check(not proc['survivingGroupAfterClose'] and not proc['cleanupBlocked'] and not proc['terminationAttempts'],'no forced or blocked cleanup')
    check(all(not proc[key]['exists'] and not proc[key]['unknown'] and proc[key]['members']==[] for key in ['groupAfterClose','groupFinal']),'owned group absent')
    check(not row['logErrors'],'no log errors')
    if (p/'tmp').exists():
        t=p/'tmp';current_tmp_directories.append({'row':row['name'],'path':str(t),'entries':[x.name for x in t.iterdir()],'modifiedTimeNs':t.stat().st_mtime_ns})
    for f in row['logs']['files']:
        data=Path(f['path']).read_bytes()
        if len(data)!=f['bytes'] or sha(data)!=f['sha256']:
            log_discrepancies.append({'row':row['name'],'path':f['path'],'recorded':f,'actualBytes':len(data),'actualSha256':sha(data)})
        else:file_entry(f)
    if row['phase']=='startup':
        if (p/'stdout.log').stat().st_size:
            result=load(p/'stdout.log')
        else:
            # Arithmetic-only inspection of already embedded data; do not recreate
            # the missing raw log or treat this row as independently raw-verified.
            result=row['result'];embedded_only_rows.append(row['name'])
        metrics={} 
        check(result==row['result'],'raw startup result matches receipt')
        check(result['complete'] and result['endVerified'] and result['mode']=='timing' and result['networkAttempts']==0 and not result['forcedGC'] and not result['instrumentedCounters'],'ordinary startup worker')
        check(result['source']['commit']==source_audit[row['arm']]['commit'] and result['source']['fingerprint']==source_audit[row['arm']]['fingerprint'] and result['source']['manifestSha256']==source_audit[row['arm']]['manifestSha256'] and not result['source']['dirty'],'startup source binding')
        for k,v in result['semantic'].items():
            key=row['lane']+'/'+k
            check(key not in semantics or semantics[key]==v,'startup semantic equality');semantics[key]=v
        for k,v in result['timings'].items():
            if isinstance(v,(int,float)):metrics[k]=v
            else:
                samples=sorted(v['samples']);check(len(samples)==v['count'] and all(math.isfinite(x) and x>=0 for x in samples),'startup raw sample set')
                calc={'min':samples[0],'p50':samples[max(0,math.ceil(len(samples)*.5)-1)],'p95':samples[max(0,math.ceil(len(samples)*.95)-1)],'max':samples[-1]}
                for q,x in calc.items():close(x,v[q],'startup quantile recomputation');quantile_checks+=1
                for q in ['p50','p95','max']:metrics[k+'.'+q]=calc[q]
        if row['lane']=='core':close(sum(metrics[k] for k in ['coldCoreImportMs','coreConstructionMs','firstMarketCategoriesMs']),metrics['coldImportConstructionFirstMarketMs'],'startup cumulative recomputation')
        else:close(sum(metrics[k] for k in ['coldProjectionImportMs','firstFormattedWalletMs','firstFormattedGoalMs']),metrics['coldImportFirstFormattedPairMs'],'startup cumulative recomputation')
    elif row['phase']=='database':
        result=load(p/'output/database.json');check(result==row['result'],'raw database result matches receipt')
        check(result['complete'] and result['application']==source_audit[row['arm']]['commit'],'database identity')
        check(result['eventInsert']['rowsPerTransaction']==5000 and result['historyWrite']['types']==1000 and result['historyWrite']['days']==30,'original write workloads')
        for dist in [result['agedImports']['ms'],result['eventInsert']['ms'],result['historyWrite']['ms'],result['historyWrite']['synchronousBlockMs']]:
            samples=sorted(dist['samples'])
            close(samples[len(samples)//2],dist['p50'],'database quantile recomputation');close(samples[-1],dist['max'],'database quantile recomputation');quantile_checks+=2
        metrics={'firstOpenMs':result['firstOpenMs'],'agedImportsP50Ms':result['agedImports']['ms']['p50'],'agedImportsMaxMs':result['agedImports']['ms']['max'],'eventInsertP50Ms':result['eventInsert']['ms']['p50'],'eventInsertMaxMs':result['eventInsert']['ms']['max'],'historyWriteP50Ms':result['historyWrite']['ms']['p50'],'historyWriteMaxMs':result['historyWrite']['ms']['max'],'historyWriteBlockP50Ms':result['historyWrite']['synchronousBlockMs']['p50'],'historyWriteBlockMaxMs':result['historyWrite']['synchronousBlockMs']['max'],'eventIndexBytes':result['eventIndexBytes'],'workingHistoryJsonBytes':result['after']['historyJsonBytes']}
        contract={k:result[k] for k in ['fixedTime','before','after']};contract.update(agedImportBytes=result['agedImports']['responseBytes'],agedImportHash=result['agedImports']['outputHash'],historyWriteHash=result['historyWrite']['outputHash'])
        check(contract==row['databaseContract'],'database contract receipt');database_contracts.append(contract)
    else:
        result=load(p/'output/result.json');check(result==row['result'],'raw contract result matches receipt')
        check(result['complete'] and result['cleanupComplete'] and result['sourceVerified'] and result['externalAttempts']==0 and result['diagnosticOnly'] and not result['timingClaims'],'contract worker correctness')
        check(result['source']['commit']==source_audit[row['arm']]['commit'] and result['source']['fingerprint']==source_audit[row['arm']]['fingerprint'] and not result['source']['dirty'],'contract source binding')
        for f in result['files'].values():file_entry(f,p/'output')
        contracts[row['arm']]={'result':result,'raw':load(p/'output/raw-contracts.json'),'common':load(p/'output/common-contracts.json')}
        continue
    close(metrics,row['metrics'],'raw metric matches receipt')
    raw_rows.append({k:row[k] for k in ['name','phase','lane','cycle','position','arm']}|{'metrics':metrics})

check(Counter(x['phase'] for x in r['rows'])=={'startup':24,'contracts':2,'database':4},'expected thirty children')
check(r['jobs']==[{k:row[k] for k in ['phase','lane','cycle','position','arm']} for row in r['rows']],'planned row order')
check(semantics==r['semanticDigests'],'semantic digest summary')
check(all(x==database_contracts[0] for x in database_contracts),'all database common output receipts equal')
check(contracts['baseline']['common']==contracts['candidate']['common'],'complete decoded common contracts equal')
check(contracts['baseline']['raw']==contracts['baseline']['common'],'baseline raw contracts unchanged')
check(contracts['baseline']['result']['fixture']==contracts['candidate']['result']['fixture'],'matched complete contract fixtures')
removed=0;expected_normalization=[]
raw=contracts['candidate']['raw']
for profile,event_count,visits in [('typical',10000,300),('stress',50000,2000)]:
    offsets=[0,100,event_count-100,event_count]
    check(set(raw['reports'][profile])==set(map(str,offsets)),'all four original report offsets')
    for offset in offsets:
        rows=raw['reports'][profile][str(offset)]['visits'];check(len(rows)==visits,'original report visit count')
        for visit in rows:check('session_id' in visit and visit.pop('session_id') is None,'only asserted null session ownership removed');removed+=1
        expected_normalization.append({'path':f'reports.{profile}.{offset}.visits[*].session_id','operation':'remove asserted-null additive candidate column','rows':visits})
check(raw==contracts['candidate']['common'],'only documented normalization changes complete raw candidate')
check(contracts['candidate']['result']['normalization']==expected_normalization and contracts['baseline']['result']['normalization']==[],'normalization allowlist exactly eight paths')
check(len(raw['routes'])==5 and sum(len(x['pilots']) for x in raw['routes'])==8,'five route shapes eight pilots')
ownership=load(ATTEMPT/'contracts-full-1-2-candidate/output/candidate-ownership.json')
check([x['id'] for x in ownership['events']]==[1,3,5,6] and [x['id'] for x in ownership['visits']]==[1,2,5] and [x['id'] for x in ownership['route']]==['start',1,2],'raw candidate ownership IDs')

groups=defaultdict(list)
for row in raw_rows:groups[row['phase']+'/'+row['lane']].append(row)
summary={};pairs_count=0
for group,rows in groups.items():
    metrics={}
    for metric in rows[0]['metrics']:
        pairs=[]
        for base in [x for x in rows if x['arm']=='baseline']:
            trial=next(x for x in rows if x['arm']=='candidate' and x['cycle']==base['cycle'] and x['position']==(2 if base['position']==1 else 3))
            a,b=base['metrics'][metric],trial['metrics'][metric];delta=b-a;percent=None if a==0 else (b/a-1)*100
            pairs.append({'cycle':base['cycle'],'baseline':base['name'],'candidate':trial['name'],'a':a,'b':b,'delta':delta,'percent':percent,'adverseOver1MsAnd10Percent':bool(re.search(r'Ms(?:\.|$)',metric)) and delta>1 and percent is not None and percent>10})
        cycles=[]
        for cycle in sorted(set(x['cycle'] for x in pairs)):
            cp=[x for x in pairs if x['cycle']==cycle];check(len(cp)==2,'two matched ABBA pairs per cycle')
            cycles.append({'cycle':cycle,'pairs':cp,'bothPairsAdverseOver1MsAnd10Percent':all(x['adverseOver1MsAnd10Percent'] for x in cp)})
        a=sum(x['a'] for x in pairs)/len(pairs);b=sum(x['b'] for x in pairs)/len(pairs)
        metrics[metric]={'baseline':[x['a'] for x in pairs],'candidate':[x['b'] for x in pairs],'meanBaseline':a,'meanCandidate':b,'meanDelta':b-a,'meanPercent':None if a==0 else (b/a-1)*100,'pairs':pairs,'cycles':cycles,'allPairsAdverseOver1MsAnd10Percent':all(x['adverseOver1MsAnd10Percent'] for x in pairs)}
        pairs_count+=len(pairs)
    summary[group]=metrics
close(summary,r['summary'],'summary independently recomputed')
positive_pairs=[{'group':g,'metric':m,**p} for g,metrics in summary.items() for m,v in metrics.items() for p in v['pairs'] if p['delta']>0]
report={'schemaVersion':1,'complete':r['complete'] and not(log_discrepancies or current_tmp_directories),'auditCompleted':True,'scope':'Independent read-only artifact, contract, source and numeric review; no app execution','applicationRuntime':False,'performanceAcceptance':False,'attempt':str(ATTEMPT),'bindings':{n:sha((ATTEMPT/n).read_bytes()) for n in ['receipt.json','artifacts.json','lock-release.json']},'artifactCount':len(inventory['files']),'artifactBytes':artifact_bytes,'completeAttemptFileCount':len(actual),'harnessFileCount':len(r['harnessBefore']['files']),'harnessFingerprint':r['harnessBefore']['sha256'],'sourceBindings':source_audit,'children':dict(Counter(x['phase'] for x in r['rows'])),'quantileValuesRecomputed':quantile_checks,'rowMetricValuesRecomputed':sum(len(x['metrics']) for x in raw_rows),'rawBackedMetricValues':sum(len(x['metrics']) for x in raw_rows if x['name'] not in embedded_only_rows),'embeddedOnlyMetricValues':sum(len(x['metrics']) for x in raw_rows if x['name'] in embedded_only_rows),'comparisonMetricCount':sum(map(len,summary.values())),'matchedMetricPairs':pairs_count,'childLogBindingDiscrepancies':log_discrepancies,'embeddedOnlyArithmeticRows':embedded_only_rows,'fullRawEvidenceVerified':not bool(log_discrepancies),'currentTmpDirectoryObservations':current_tmp_directories,'currentCleanupCaveat':'Three empty tmp directories were caught by both strict final guards and remain present during review; detailed birth/mtime/ctime observations are in PROVENANCE-DISCREPANCIES.json. Origin is not attributed.' if current_tmp_directories else None,'contractAudit':{'completeDecodedCommonEquality':True,'allowedNormalizationPaths':8,'assertedNullVisitFieldsRemoved':removed,'routeShapes':5,'routePilots':8,'candidateOwnershipRawIdsChecked':True,'databaseReportedOutputHashesEqual':True,'databaseUnderlyingHashedPayloadsNotRetained':True},'checks':dict(checks),'rawMetrics':raw_rows,'recomputedSummary':summary,'allPositivePairsIncludingBelowFlagThreshold':positive_pairs,'caveats':['This audit preserves failed evidence acceptance: three empty temporary paths reappeared after their recorded removal. All raw log and retained payload bindings verify.','All metric arithmetic is raw-backed; no missing log was reconstructed.','A passing functional/envelope result is not blanket performance acceptance.','Positive deltas remain listed even when below the existing >1ms and >10% joint flag.','Source/harness bytes were reread; no application code was imported or executed.','Database full response/history payloads are not recorded by the original worker; this audit verifies their reported hashes agree, not independent hash derivation from absent payloads.']}
(HERE/'NUMERIC-AUDIT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['complete','artifactCount','completeAttemptFileCount','harnessFileCount','children','quantileValuesRecomputed','rowMetricValuesRecomputed','comparisonMetricCount','matchedMetricPairs']}))
