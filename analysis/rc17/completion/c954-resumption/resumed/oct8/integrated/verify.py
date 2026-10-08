from pathlib import Path
import hashlib,json,subprocess,datetime,fcntl
r=Path('/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation');out=Path(__file__).resolve().parent/'attempt1';out.mkdir(exist_ok=False)
def source():return {p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in subprocess.check_output(['git','ls-files'],cwd=r,text=True).splitlines()}
before=source();receipt={'parentCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'candidateTree':subprocess.check_output(['git','write-tree'],cwd=r,text=True).strip(),'sourceFiles':before,'commands':[],'complete':False,'performanceAcceptance':False};(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
with open('/tmp/kairo-performance.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for name,cmd in [('tests',['node','--test','--test-concurrency=1']+sorted(str(p.relative_to(r)) for p in (r/'tests/kairo').glob('*.test.mjs'))),('types',['npm','run','check:kairo']),('build',['npm','run','build'])]:
  started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with (out/(name+'.log')).open('xb') as log:result=subprocess.run(cmd,cwd=r,stdout=log,stderr=subprocess.STDOUT)
  receipt['commands'].append({'name':name,'command':cmd,'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'logSha256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()});(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
  print(name,result.returncode,flush=True)
  if result.returncode:break
receipt['sourceStable']=source()==before;receipt['complete']=True;receipt['passed']=receipt['sourceStable'] and len(receipt['commands'])==3 and all(x['exitCode']==0 for x in receipt['commands']);receipt['builtFiles']={str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (r/'dist/client').rglob('*') if p.is_file()};(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'passed':receipt['passed'],'sourceFiles':len(before),'assets':len(receipt['builtFiles']),'tree':receipt['candidateTree']}));raise SystemExit(0 if receipt['passed'] else 1)
