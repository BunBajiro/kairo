from pathlib import Path
import json,hashlib,subprocess,datetime,fcntl
r=Path('/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation'); out=Path('/workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/maps-m9/integrated-attempt1');out.mkdir(exist_ok=False)
def source():
 return {p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in subprocess.check_output(['git','ls-files'],cwd=r,text=True).splitlines()}
before=source(); receipt={'parentCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'sourceFiles':before,'complete':False,'performanceAcceptance':False,'commands':[]}; (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with open('/tmp/kairo-performance.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for name,cmd in [('tests',['node','--test','--test-concurrency=1']+sorted(str(p.relative_to(r)) for p in (r/'tests/kairo').glob('*.test.mjs'))),('types',['npm','run','check:kairo'])]:
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with (out/(name+'.log')).open('wb') as log: result=subprocess.run(cmd,cwd=r,stdout=log,stderr=subprocess.STDOUT)
  receipt['commands'].append({'name':name,'command':cmd,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'logSha256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()})
  if result.returncode:break
receipt['sourceStable']=source()==before;receipt['complete']=True;receipt['passed']=receipt['sourceStable'] and len(receipt['commands'])==2 and all(c['exitCode']==0 for c in receipt['commands']);(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='sourceFiles'}));raise SystemExit(0 if receipt['passed'] else 1)
