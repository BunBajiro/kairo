import json,pathlib,statistics
HERE=pathlib.Path(__file__).resolve().parent
OUT=HERE/'abba-attempt1'
arms=[json.loads((OUT/name).read_text()) for name in ['1-baseline.json','2-candidate.json','3-candidate.json','4-baseline.json']]
rows=[]
for i,case in enumerate(arms[0]['cases']):
 for operation in ['unchanged','oneChange','batchEight','firstConnect','reconnect','stateComponent']:
  points=[arm['cases'][i][operation] for arm in arms]
  if not all('timing'in point for point in points):continue
  values=[point['timing']['medianMs'] for point in points];tails=[point['timing']['p95Ms'] for point in points]
  pairs=[{'baselineMs':values[a],'candidateMs':values[b],'deltaMs':values[b]-values[a],'percent':(values[b]/values[a]-1)*100} for a,b in [(0,1),(3,2)]]
  base=statistics.mean([values[0],values[3]]);candidate=statistics.mean([values[1],values[2]])
  rows.append({'namesCount':case['namesCount'],'clients':case['clients'],'operation':operation,'armMediansMs':values,'armP95Ms':tails,'pairs':pairs,'pairedMeanMedianMs':{'baseline':base,'candidate':candidate,'delta':candidate-base,'percent':(candidate/base-1)*100},'repeatedMaterialMedianRegression':all(p['deltaMs']>1 and p['percent']>10 for p in pairs),'scope':'Candidate adds a required full-map connection bootstrap; baseline has no equivalent SSE body.' if operation in ['firstConnect','reconnect'] else 'Same application operation and matched reconstituted data domain.'})
summary={'complete':True,'comparison':'Exact227 plus accepted hidden filter; no later Assets boundary','ordinaryOrder':['baseline','candidate','candidate','baseline'],'casesPerArm':12,'rows':rows,'retainedMaterialRows':[row for row in rows if row['repeatedMaterialMedianRegression']],'limits':['Four fresh processes; paired mean of process medians is a component diagnostic, not an end-user distribution.','All process medians/p95 and both nearest AB/BA pair deltas are retained; short within-process p95 is not used to dismiss or establish repeated material median regressions.','First connection has only1/3 correlated observations per process. Reconnect measures audience replacement and reports final-repetition per-client bytes.','Additional candidate SSE bootstrap work is explicit; compiled initial/render cost remains unmeasured.']}
(HERE/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for row in rows:
 if row['namesCount']==20000 and row['clients']in[0,1]:print(json.dumps({k:row[k] for k in ['namesCount','clients','operation','pairedMeanMedianMs','repeatedMaterialMedianRegression']}))
print('MATERIAL',[(r['namesCount'],r['clients'],r['operation']) for r in summary['retainedMaterialRows']])
