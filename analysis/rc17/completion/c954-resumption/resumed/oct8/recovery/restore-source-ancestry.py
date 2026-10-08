"""Restore verified commit ancestry without changing runtime files or refs."""
import hashlib, json, subprocess, sys
from pathlib import Path
here=Path(__file__).resolve().parent
root=Path(sys.argv[1]).resolve()
m=json.loads((here/'source-ancestry.json').read_text());data=(here/m['pack']).read_bytes()
assert len(data)==m['bytes'] and hashlib.sha256(data).hexdigest()==m['sha256']
def git(*args,input=None):return subprocess.check_output(['git','-C',str(root),*args],input=input)
git('unpack-objects','-q',input=data)
rows={row['sha']:row for row in m['commits']}
for sha,row in rows.items():
 raw=git('cat-file','commit',sha)
 assert hashlib.sha1(b'commit '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==sha
 parents=[s.split()[1] for s in raw.decode().split('\n\n',1)[0].splitlines() if s.startswith('parent ')]
 assert parents==row['parents'] and all(p in rows for p in parents)
gitdir=Path(git('rev-parse','--absolute-git-dir').decode().strip());shallow=gitdir/'shallow'
if shallow.exists():
 assert all(sha in rows for sha in shallow.read_text().splitlines()),'Uncovered shallow boundary; restore newer canonical commits first'
 shallow.unlink()
git('merge-base','--is-ancestor','c954c0d808847f249df0659ed15fdce2e89f84c4','HEAD')
excluded=subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor','508f2d450c7cc17cc464cf316b80748367adc9e2','HEAD'])
assert excluded.returncode==1
print(json.dumps({'ancestryVerified':True,'commitObjects':len(rows),'sourceFilesAndRefsUnchanged':True}))
