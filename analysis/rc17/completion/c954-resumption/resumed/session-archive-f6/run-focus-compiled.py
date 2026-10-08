from pathlib import Path
import subprocess,json,hashlib,os,datetime
here=Path(__file__).resolve().parent;root=Path('/workspace/scratch/a2f3334402fc/kairo-focus-a7-baseline');out=here/'focus-gate2';out.mkdir(exist_ok=False);assert os.environ['KAIRO_ARCHIVE_LOCKED']=='1'
sha=lambda b:hashlib.sha256(b).hexdigest();worker=here/'focus-browser.mjs';source=here/'focus-gate1/source.json';receipt={'complete':False,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceManifestSha256':sha(source.read_bytes()),'harnessSha256':sha(worker.read_bytes()),'sameSourceAndBuildAs':'focus-gate1/source.json'}
(out/'source.json').write_bytes(source.read_bytes());(out/'focus-browser.mjs').write_bytes(worker.read_bytes());(out/'run-focus-compiled.py').write_bytes(Path(__file__).read_bytes())
try:
 child=subprocess.run(['node',str(worker),str(root),str(out/'compiled-focus.json'),str(out/'source.json')],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
 with (out/'compiled-focus.log').open('xb') as f:f.write(child.stdout);f.flush();os.fsync(f.fileno())
 receipt['exitCode']=child.returncode;receipt['logSha256']=sha(child.stdout);assert child.returncode==0,child.stdout.decode();raw=(out/'compiled-focus.json').read_bytes();value=json.loads(raw);assert value['complete'] and value['sourceVerified'] and value['cleanupVerified'] and value['reportFocusAcceptance'] and value['namingFocusAcceptance'];assert all(row['passed'] for row in value['checks']);assert sha(worker.read_bytes())==receipt['harnessSha256'];receipt.update(complete=True,rawSha256=sha(raw),checks=len(value['checks']),sourceFingerprint=value['sourceFingerprint'])
finally:
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
