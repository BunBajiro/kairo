"""Freeze isolated proposal bytes; never invokes app/test/build/performance code."""
import difflib,hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('/workspace/scratch/a2f3334402fc')
SHA='22773cc7cb6e83ac51e412565ba65c101613536a'
roots={arm:ROOT/('kairo-names-227-'+arm) for arm in ['baseline','candidate']}
def files(root):
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==SHA
    paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
    return {path:{'sha256':hashlib.sha256((root/path).read_bytes()).hexdigest(),'bytes':(root/path).stat().st_size} for path in sorted(set(filter(None,paths)))}
manifests={arm:files(root) for arm,root in roots.items()}
for arm,manifest in manifests.items():
    (HERE/(arm+'-source.json')).write_text(json.dumps({'baseCommit':SHA,'acceptedBaseDelta':'../bindings-names-985/hidden-only.patch','root':str(roots[arm]),'files':manifest},indent=2)+'\n')
changed=[path for path in sorted(set(manifests['baseline'])|set(manifests['candidate'])) if manifests['baseline'].get(path)!=manifests['candidate'].get(path)]
assert len(changed)==6,changed
proposal={'baseCommit':SHA,'acceptedBaseDelta':'hidden filter (two files)','files':[{'path':path,'baseline':manifests['baseline'].get(path),'candidate':manifests['candidate'].get(path)} for path in changed]}
(HERE/'proposal-files.json').write_text(json.dumps(proposal,indent=2)+'\n')
patch=''
for path in changed:
    old=(roots['baseline']/path).read_text().splitlines(True) if path in manifests['baseline'] else []
    new=(roots['candidate']/path).read_text().splitlines(True) if path in manifests['candidate'] else []
    patch+='diff --git a/'+path+' b/'+path+'\n'
    if not old:patch+='new file mode 100644\n'
    patch+=''.join(difflib.unified_diff(old,new,fromfile='a/'+path if old else '/dev/null',tofile='b/'+path if new else '/dev/null'))
(HERE/'names-protocol.patch').write_text(patch)
print(json.dumps({'files':len(changed),'baselineFiles':len(manifests['baseline']),'candidateFiles':len(manifests['candidate'])}))
