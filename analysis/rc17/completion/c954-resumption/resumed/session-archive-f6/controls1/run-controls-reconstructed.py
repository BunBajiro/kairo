from pathlib import Path
import subprocess,json,hashlib,os,datetime,sys
here=Path(__file__).resolve().parent;root=Path('/workspace/scratch/a2f3334402fc/kairo-archive-227-frozen');out=here/'controls1';out.mkdir(exist_ok=False)
assert os.environ['KAIRO_ARCHIVE_LOCKED']=='1'
sha=lambda b:hashlib.sha256(b).hexdigest();receipt={'complete':False,'sourceManifestSha256':sha((here/'attempt4/source.json').read_bytes()),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':[]}
try:
 for script,name,extra in [('focus-browser.mjs','naming-baseline',['naming-baseline']),('retention-control.mjs','retention',[])]:
  content=(here/script).read_bytes();(out/script).write_bytes(content)
  result=subprocess.run(['node',str(here/script),str(root),str(out/(name+'.json')),str(here/'attempt4/source.json'),*extra],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
  with (out/(name+'.log')).open('xb') as f:f.write(result.stdout);f.flush();os.fsync(f.fileno())
  row={'name':name,'harnessSha256':sha(content),'exitCode':result.returncode,'logSha256':sha(result.stdout)};receipt['runs'].append(row)
  assert result.returncode==0,result.stdout.decode()
  raw=(out/(name+'.json')).read_bytes();value=json.loads(raw);assert value['complete'] and value['sourceVerified'] and value['cleanupVerified'];assert sha((here/script).read_bytes())==row['harnessSha256'];row['rawSha256']=sha(raw);row['checks']=len(value['checks'])
 receipt['complete']=True
finally:
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
