"""Focused synthetic and owned-process controls; no Kairo or browser runtime."""
from pathlib import Path
import ctypes,fcntl,hashlib,json,os,signal,subprocess,sys,time
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'final-merged-frontend'))
from ownership import NamespaceCensus,UnknownGroup,select_members
HERE=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else HERE/'ownership-validation';OUT.mkdir(exist_ok=False)
checks=[]
def observed_members(group):
    result=subprocess.run(['node',str(HERE/'ownership-controls.mjs'),'--probe',str(group)],capture_output=True,text=True,timeout=15,check=True)
    state=json.loads(result.stdout)
    assert not state['unknown'],state
    return state['members']

def check(name,condition):
    checks.append({'name':name,'passed':bool(condition)});assert condition,name

def row(pid,pgid,ids,inode=None,state='S',sid=None):
    return dict(pid=pid,host_pgid=pgid,host_sid=pgid if sid is None else sid,namespace_pgids=ids,namespace_inode=inode,state=state)
def unknown(records):
    try:select_members(5,records,111,2)
    except UnknownGroup:return True
    return False
report={'complete':False,'scope':'External ownership helper only','checks':checks,'children':[]}
lock=open('/tmp/kairo-performance.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
owned=[];adopted=[]
try:
    check('unrelated host numeric PGID and sibling namespace excluded',select_members(5,[row(5,5,[5],900),row(9001,9001,[9001,5],111),row(8001,8001,[8001,5],222)],111,2)==[{'pid':9001,'state':'S'}])
    check('leader-exited descendant anchors group',select_members(5,[row(9002,9001,[9001,5],111)],111,2)==[{'pid':9002,'state':'S'}])
    check('nested namespace descendants included with anchor',select_members(5,[row(9001,9001,[9001,5],111),row(9003,9001,[9001,5,1],333)],111,2)==[{'pid':9001,'state':'S'},{'pid':9003,'state':'S'}])
    check('nested-only unsupported topology fails closed',unknown([row(9003,9001,[9001,5,1],333)]))
    check('sibling namespace same local group fails closed',unknown([row(8001,8001,[8001,5],222)]))
    check('live group with no reliable rows fails closed',unknown([]))
    check('session mismatch fails closed',unknown([row(9001,9001,[9001,5],111,sid=9999)]))
    check('zombie state retained',select_members(5,[row(9002,9001,[9001,5],111,state='Z')],111,2)==[{'pid':9002,'state':'Z'}])
    census=NamespaceCensus();report['namespace']={'nativePid':os.getpid(),'nativePgid':os.getpgrp(),'NSpid':census.pids,'NSpgid':census.pgids,'inode':census.namespace_inode,'depth':census.depth}
    check('actual proc namespace reconciles',census.pids[-1]==os.getpid() and census.pgids[-1]==os.getpgrp())
    p=subprocess.Popen([sys.executable,'-c','pass'],start_new_session=True);owned.append(p);p.wait(timeout=5)
    check('ordinary fast child exits without host collision',observed_members(p.pid)==[]);report['children'].append({'kind':'ordinary','localGroup':p.pid,'exitCode':p.returncode})
    p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],start_new_session=True);owned.append(p)
    observed=observed_members(p.pid);check('live owned group maps to host receipt',bool(observed));os.killpg(p.pid,signal.SIGTERM);p.wait(timeout=5)
    check('owned interrupt cleanup absent',observed_members(p.pid)==[]);report['children'].append({'kind':'interrupt','localGroup':p.pid,'before':observed,'exitCode':p.returncode})
    # Reap the deliberately orphaned test descendant ourselves; no zombie leak.
    libc=ctypes.CDLL(None,use_errno=True);assert libc.prctl(36,1,0,0,0)==0
    script='import subprocess,sys; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);print(p.pid,flush=True)'
    p=subprocess.Popen([sys.executable,'-c',script],start_new_session=True,stdout=subprocess.PIPE,text=True);owned.append(p);descendant=int(p.stdout.readline());adopted.append(descendant);p.wait(timeout=5)
    observed=observed_members(p.pid);check('actual descendant survives exited leader and remains owned',bool(observed))
    os.killpg(p.pid,signal.SIGTERM);_,status=os.waitpid(descendant,0);p.stdout.close()
    check('leader-exited descendant drains cleanly',observed_members(p.pid)==[]);report['children'].append({'kind':'leader-exited-descendant','localGroup':p.pid,'descendantLocalPid':descendant,'before':observed,'leaderExitCode':p.returncode,'descendantWaitStatus':status})
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as folder:
        (Path(folder)/'123').mkdir()
        race=NamespaceCensus.__new__(NamespaceCensus);race.proc=Path(folder)
        race.namespace_inode=111;race.depth=2;answers=iter([True,False]);race.exists=lambda group:next(answers)
        check('vanished proc row and local ESRCH during census',race.members(5)==[])
    bridge=json.loads(subprocess.run(['node',str(HERE/'ownership-controls.mjs')],capture_output=True,text=True,timeout=15,check=True).stdout)
    assert bridge['complete'];checks.extend(bridge['checks'])
    report['applicationRuntime']=False
    report['complete']=True
except BaseException as error:report['failure']=repr(error);raise
finally:
    report['cleanupFailures']=[]
    for p in owned:
        try:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.wait(timeout=5)
        except BaseException as error:report['cleanupFailures'].append(repr(error));report['complete']=False
    for pid in adopted:
        try:os.waitpid(pid,0)
        except ChildProcessError:pass
        except BaseException as error:report['cleanupFailures'].append(repr(error));report['complete']=False
    report['bindings']={name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['../final-merged-frontend/ownership.py','ownership-bridge.py','ownership.mjs','ownership-controls.mjs','ownership-tests.py','run.mjs']}
    (OUT/'completed.json').write_text(json.dumps(report,indent=2)+'\n');lock.close()
    print(json.dumps({'complete':report['complete'],'checks':len(checks),'output':str(OUT)}))
