from pathlib import Path
import subprocess,json,hashlib,os,datetime
here=Path(__file__).resolve().parent;parent=Path('/workspace/scratch/a2f3334402fc');source=parent/'kairo-rc17-c954-continuation';baseline=parent/'kairo-focus-a7-baseline';candidate=parent/'kairo-card-memo-a7-isolated';out=here/'memo-screen1';out.mkdir(exist_ok=False);assert not candidate.exists();assert os.environ['KAIRO_ARCHIVE_LOCKED']=='1'
sha=lambda b:hashlib.sha256(b).hexdigest();focus=json.loads((here/'focus-candidate/manifest.json').read_text());memo=json.loads((here/'memo-candidate/manifest.json').read_text());assert memo['patchSha256']=='719fc58da60cca22399f35f9dd44f91dc03dca69c6cfdb5ccab71b599a8aa464'
receipt={'complete':False,'adoption':False,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':focus['baseCommit'],'focusPatchSha256':focus['patchSha256'],'memoPatchSha256':memo['patchSha256'],'steps':[]}
for name in ['run-memo-screen.py','run-memo-pairs.mjs','browser-cardinality-memo.mjs','focus-browser.mjs','summarize-memo.py']:(out/name).write_bytes((here/name).read_bytes())
def run(name,command,cwd=None,timeout=300):
 child=subprocess.run(command,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
 with (out/(name+'.log')).open('xb') as f:f.write(child.stdout);f.flush();os.fsync(f.fileno())
 receipt['steps'].append({'name':name,'command':command,'exitCode':child.returncode,'logSha256':sha(child.stdout)});assert child.returncode==0,child.stdout.decode();return child.stdout
try:
 run('clone',['git','clone','--quiet','--shared','--no-checkout',str(source),str(candidate)])
 run('checkout',['git','checkout','--quiet','-b','codex/rc17-f6-card-memo-a7-isolated',focus['baseCommit']],candidate);(candidate/'node_modules').symlink_to(source/'node_modules',target_is_directory=True)
 for patch in [here/'focus-candidate/focus-restoration.patch',here/'memo-candidate/archive-card-memo.patch']:run('apply-'+patch.stem,['git','apply',str(patch)],candidate)
 assert sha((candidate/memo['file']).read_bytes())==memo['afterSha256']
 run('types',['npm','run','check:kairo'],candidate);assert not (candidate/'dist').exists();run('fresh-build',['npm','run','build'],candidate)
 helper=here.parents[3]/'harness/source-manifest.mjs';code="import {captureSource} from "+json.dumps(str(helper))+";import {writeFile} from 'node:fs/promises';const source=await captureSource(process.argv[1],{expectedCommit:process.argv[3],requireClean:false});await writeFile(process.argv[2],JSON.stringify(source,null,2)+'\\n');"
 run('manifest',['node','--input-type=module','-e',code,str(candidate),str(out/'candidate-source.json'),focus['baseCommit']],candidate)
 run('compiled-focus',['node',str(here/'focus-browser.mjs'),str(candidate),str(out/'compiled-focus.json'),str(out/'candidate-source.json')],candidate)
 value=json.loads((out/'compiled-focus.json').read_text());assert value['complete'] and value['sourceVerified'] and value['cleanupVerified'] and value['reportFocusAcceptance'] and value['namingFocusAcceptance'] and all(x['passed'] for x in value['checks']);receipt['candidateFocusChecks']=len(value['checks']);receipt['candidateFingerprint']=value['sourceFingerprint']
 run('screen-pair',['node',str(here/'run-memo-pairs.mjs'),str(baseline),str(candidate),str(out/'pair'),'1'],here,timeout=600)
 run('summary',['python',str(here/'summarize-memo.py'),str(out/'pair')],here)
 for name in ['run-memo-screen.py','run-memo-pairs.mjs','browser-cardinality-memo.mjs','focus-browser.mjs','summarize-memo.py']:assert sha((here/name).read_bytes())==sha((out/name).read_bytes())
 receipt['complete']=True
finally:
 receipt['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
