import subprocess, json, hashlib, os, signal, fcntl, shutil
from pathlib import Path
root=Path('/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation')
analysis=Path('/workspace/scratch/a2f3334402fc/kairo-analysis-restored')
out=analysis/'analysis/rc17/completion/c954-resumption/resumed/oct8/integration-next/checkpoint-attempt1'
out.mkdir(parents=True,exist_ok=False)
manifest=analysis/'analysis/rc17/harness/source-manifest.mjs'
sha='70cd12f9a4d014e7e2cf931b9681c4bdc7f18789'
r={'sourceCommit':sha,'complete':False,'steps':[],'scope':'Combined checkpoint correctness; not final comparison acceptance'}
def save():
 p=out/'receipt.tmp';p.write_text(json.dumps(r,indent=2)+'\n');p.replace(out/'receipt.json')
def run(name,cmd):
 log=out/(name+'.log');p=None
 try:
  with log.open('wb') as f:
   p=subprocess.Popen(cmd,cwd=root,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
   code=p.wait(timeout=600)
 except BaseException:
  if p and p.poll() is None:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=15)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
  raise
 finally:
  if p:r['steps'].append({'name':name,'command':cmd,'exitCode':p.returncode,'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()});save()
 assert code==0,(name,code)
 print(name+' passed',flush=True)
with open('/tmp/kairo-performance.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 save()
 try:
  assert subprocess.check_output(['git','status','--porcelain'],cwd=root)==b''
  assert subprocess.check_output(['git','ls-files','dist'],cwd=root)==b''
  if (root/'dist').exists():shutil.rmtree(root/'dist')
  run('prebuild',['node',str(manifest),'capture',str(root),str(out/'prebuild-source.json'),sha])
  run('types',['npm','run','check:kairo'])
  run('build',['npm','run','build'])
  run('built',['node',str(manifest),'capture',str(root),str(out/'built-source.json'),sha])
  run('full-tests',['npm','run','test:kairo'])
  r['complete']=True
 except BaseException as e:r['error']=repr(e);raise
 finally:
  try:
   if (out/'built-source.json').exists():run('final-source',['node',str(manifest),'verify',str(out/'built-source.json')]);r['sourceVerified']=True
  except BaseException as e:r['complete']=False;r['finalGuardError']=repr(e);raise
  finally:save()
print(json.dumps({'complete':r['complete'],'sourceVerified':r.get('sourceVerified'),'source':sha}),flush=True)
