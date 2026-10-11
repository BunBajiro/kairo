"""Offline mutation-scope checks. This file never creates a GitHub client."""
import copy,hashlib,importlib.util,json,os
from pathlib import Path
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('cleanup',base/'cleanup.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
request=json.loads((base/'request.json').read_text());digest=hashlib.sha256((base/'request.json').read_bytes()).hexdigest()
os.environ['GITHUB_SHA']='offline-reviewed-cleanup';os.environ['GITHUB_RUN_ID']='offline'
class Fake:
 def __init__(self, mutate=None):
  self.runs={r['id']:copy.deepcopy(r) for r in request['runs']};self.artifacts={a['id']:copy.deepcopy(a) for a in request['artifacts']};self.calls=[];self.reads={};self.mutate=mutate
 def __call__(self,method,path):
  self.calls.append((method,path));key=int(path.rsplit('/',1)[1]);kind='runs' if '/runs/' in path else 'artifacts';table=getattr(self,kind)
  if method=='GET':
   self.reads[(kind,key)]=self.reads.get((kind,key),0)+1
   if self.mutate:self.mutate(self,kind,key,self.reads[(kind,key)])
   return (200,copy.deepcopy(table[key])) if key in table else (404,None)
  assert method=='DELETE' and kind=='artifacts' and key in self.artifacts
  del self.artifacts[key];return 204,None
checks=[]
def check(name,body):body();checks.append({'name':name,'passed':True})
def expect_failure(body):
 try:body()
 except (ValueError,KeyError):return
 raise AssertionError('Expected failure')
def scoped():
 m.validate_request(request);assert digest==m.REQUEST_SHA256
 assert all(r['run_number'] not in {48,54,65} for r in request['runs'])
 assert {r['name'] for r in request['runs']}=={'Kairo test build'}
check('fixed request identity and protected/internal run exclusion',scoped)
def plan_only():
 f=Fake();p=m.plan(request,digest,f);assert p['artifactCount']==124 and p['bytes']==2041005576;assert all(c[0]=='GET' for c in f.calls)
check('complete plan performs reads only',plan_only)
planned=m.plan(request,digest,Fake())
def success():
 f=Fake();events=[];r=m.delete(request,digest,planned,f,lambda *e:events.append(e));assert r['complete'] and r['confirmedDeletedCount']==124 and r['confirmedDeletedBytes']==2041005576
 assert [int(path.rsplit('/',1)[1]) for method,path in f.calls if method=='DELETE']==[a['id'] for a in request['artifacts']]
 assert events[-1][0]=='FINAL_RECEIPT' and len([x for x in events if x[0]=='DELETED'])==124
check('success deletes only exact 124 IDs and confirms absence',success)
def changed_run():
 f=Fake();f.runs[request['runs'][0]['id']]['head_sha']='changed';r=m.delete(request,digest,planned,f,lambda *e:None);assert not r['complete'] and not r['deleted'];assert all(c[0]=='GET' for c in f.calls)
check('changed run identity stops before mutation',changed_run)
def changed_artifact():
 f=Fake();f.artifacts[request['artifacts'][-1]['id']]['size_in_bytes']+=1;r=m.delete(request,digest,planned,f,lambda *e:None);assert not r['complete'] and not r['deleted'];assert all(c[0]=='GET' for c in f.calls)
check('changed last artifact blocks every deletion at preflight',changed_artifact)
def late_change():
 key=request['artifacts'][1]['id']
 def mutate(f,kind,identifier,count):
  if kind=='artifacts' and identifier==key and count==2:f.artifacts[key]['name']='unlisted-internal-evidence'
 f=Fake(mutate);r=m.delete(request,digest,planned,f,lambda *e:None);assert not r['complete'] and r['confirmedDeletedCount']==1
 assert key in f.artifacts and len([c for c in f.calls if c[0]=='DELETE'])==1
check('late changed identity stops and records prior confirmed deletion',late_change)
def bad_scope():
 for key,value in [('run_number',48),('name','Kairo internal performance'),('workflow_id',1)]:
  altered=copy.deepcopy(request);altered['runs'][0][key]=value;expect_failure(lambda:m.validate_request(altered))
 altered=copy.deepcopy(request);altered['artifacts'][0]['name']='private-performance-evidence';expect_failure(lambda:m.validate_request(altered))
check('protected run and internal artifact substitutions rejected',bad_scope)
def altered_plan():
 p=copy.deepcopy(planned);p['artifacts'].pop();f=Fake();expect_failure(lambda:m.delete(request,digest,p,f,lambda *e:None));assert not f.calls
check('altered plan targets rejected before API calls',altered_plan)
report={'complete':True,'networkRequests':0,'liveDeletions':0,'checks':checks,'bindings':{n:hashlib.sha256((base/n).read_bytes()).hexdigest() for n in ['cleanup.py','request.json','offline-controls.py']}}
(base/'offline-controls.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'complete':True,'checks':len(checks),'networkRequests':0,'liveDeletions':0}))
