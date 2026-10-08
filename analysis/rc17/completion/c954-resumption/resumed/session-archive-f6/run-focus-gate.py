from pathlib import Path
import subprocess,json,hashlib,os,datetime,sys
here=Path(__file__).resolve().parent;source=Path('/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation');root=source.parent/'kairo-focus-a7-baseline';out=here/'focus-gate1';out.mkdir(exist_ok=False)
assert os.environ['KAIRO_ARCHIVE_LOCKED']=='1';assert not root.exists()
sha=lambda b:hashlib.sha256(b).hexdigest();patch=here/'focus-candidate/focus-restoration.patch';manifest=json.loads((here/'focus-candidate/manifest.json').read_text());assert sha(patch.read_bytes())=='32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c'
receipt={'complete':False,'root':str(root),'base':manifest['baseCommit'],'patchSha256':manifest['patchSha256'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':[]}
(out/'run-focus-gate.py').write_bytes(Path(__file__).read_bytes());(out/'focus-browser.mjs').write_bytes((here/'focus-browser.mjs').read_bytes());(out/'focus-restoration.patch').write_bytes(patch.read_bytes())
def run(name,command,cwd=None,timeout=300):
 child=subprocess.run(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
 with (out/(name+'.log')).open('xb') as f:f.write(child.stdout);f.flush();os.fsync(f.fileno())
 receipt['steps'].append({'name':name,'command':command,'exitCode':child.returncode,'logSha256':sha(child.stdout)});assert child.returncode==0,child.stdout.decode();return child.stdout
try:
 run('clone',['git','clone','--quiet','--shared','--no-checkout',str(source),str(root)])
 run('checkout',['git','checkout','--quiet','-b','codex/rc17-f6-focus-a7-isolated',manifest['baseCommit']],root)
 (root/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
 for row in manifest['files']:assert sha((root/row['path']).read_bytes())==row['beforeSha256']
 run('apply',['git','apply',str(patch)],root)
 for row in manifest['files']:assert sha((root/row['path']).read_bytes())==row['afterSha256']
 run('semantics',['node','--test','--test-concurrency=1','tests/kairo/session-archive.test.mjs','tests/kairo/session-event-window.test.mjs','tests/kairo/sessions.test.mjs'],root)
 run('types',['npm','run','check:kairo'],root)
 assert not (root/'dist').exists();run('fresh-build',['npm','run','build'],root)
 helper=here.parents[3]/'harness/source-manifest.mjs'
 code="import {captureSource} from "+json.dumps(str(helper))+";import {writeFile} from 'node:fs/promises';const source=await captureSource(process.argv[1],{expectedCommit:process.argv[3],requireClean:false});await writeFile(process.argv[2],JSON.stringify(source,null,2)+'\\n');"
 run('manifest',['node','--input-type=module','-e',code,str(root),str(out/'source.json'),manifest['baseCommit']],root)
 run('compiled-focus',['node',str(here/'focus-browser.mjs'),str(root),str(out/'compiled-focus.json'),str(out/'source.json')],root)
 result=json.loads((out/'compiled-focus.json').read_text());assert result['complete'] and result['sourceVerified'] and result['cleanupVerified'] and result['reportFocusAcceptance'] and result['namingFocusAcceptance'];assert all(row['passed'] for row in result['checks']);receipt['checks']=len(result['checks']);receipt['sourceFingerprint']=result['sourceFingerprint'];assert sha((here/'focus-browser.mjs').read_bytes())==sha((out/'focus-browser.mjs').read_bytes());receipt['complete']=True
finally:
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
