"""Read-only stat and receipt capture; writes only the separate review directory."""
from pathlib import Path
import datetime,hashlib,json,re,subprocess
HERE=Path(__file__).resolve().parent
attempt=HERE.parent/'final-source-all-attempt2'
receipt=json.loads((attempt/'receipt.json').read_text()); inventory=json.loads((attempt/'artifacts.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths=[]
for row in receipt['rows']:
    p=Path(row['directory'])/'tmp'
    try:st=p.lstat()
    except FileNotFoundError:continue
    values=subprocess.check_output(['stat','--printf','%W|%w|%Y|%y|%Z|%z|%i|%d|%a',str(p)],text=True).split('|')
    frac=re.search(r'\.(\d+) ',values[1]);birth_ns=int(values[0])*10**9+int((frac.group(1) if frac else '').ljust(9,'0')[:9])
    finished=datetime.datetime.fromisoformat(row['finishedAt'].replace('Z','+00:00'));finished_ns=int(finished.timestamp()*1000)*10**6
    paths.append({'row':row['name'],'path':str(p),'kind':'empty-directory' if p.is_dir() and not list(p.iterdir()) else 'other','inode':st.st_ino,'device':st.st_dev,'mode':st.st_mode,'bytes':st.st_size,'birthTimeNs':birth_ns,'birthTimeRaw':values[1],'modifiedTimeNs':st.st_mtime_ns,'changeTimeNs':st.st_ctime_ns,'modifiedTimeRaw':values[3],'changeTimeRaw':values[5],'rowFinishedAt':row['finishedAt'],'childClosedAt':row['process']['closedAt'],'rowRecordedCleanupComplete':row['cleanupComplete'],'rowRecordedTempEntriesAfterExit':row['tempEntriesAfterExit'],'birthAfterRowFinished':birth_ns>finished_ns,'birthMinusRowFinishedMs':(birth_ns-finished_ns)/1e6,'mtimePrecedesBirth':st.st_mtime_ns<birth_ns,'entries':sorted(x.name for x in p.iterdir()),'statCommandOutput':'|'.join(values)})
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only existing evidence inspection; no app execution and no modification of the attempt','attempt':str(attempt),'envelope':{k:receipt[k] for k in ['complete','endVerified','cleanupComplete','finishedAt']},'attemptBindings':{n:sha(attempt/n) for n in ['receipt.json','artifacts.json','lock-release.json']},'strictFailures':receipt['failures'],'currentTemporaryPaths':paths,'finalGuardChecks':{'first':{k:receipt['finalRowEvidence'][k] for k in ['complete','temporaryDataAbsent','checkedAt']},'inventory':{k:inventory['finalRowEvidence'][k] for k in ['complete','temporaryDataAbsent','checkedAt']}},'interpretation':['The receipt has no separate removal timestamp or original directory inode; row.finishedAt is an upper bound because rm, stat(ENOENT), cleanupComplete and postguards precede it.','All three observed birth times are later than row.finishedAt; all three mtimes precede their birth times. This supports subsequent directory recreation with older metadata, rather than an original surviving directory.','The filesystem timestamps do not identify the recreating actor or establish a specific synchronization mechanism.','The audit itself opens attempt files only for reading; Path.lstat/stat/exists/iterdir and stat are observational. Writes target only this separate review directory.','Both strict final checks already recorded the three temporary paths before this independent audit. The failed receipt is preserved, not rehabilitated by correct numeric results.']}
(HERE/'PROVENANCE-DISCREPANCIES.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'count':len(paths),'birthAfterRowFinished':all(x['birthAfterRowFinished'] for x in paths),'mtimePrecedesBirth':all(x['mtimePrecedesBirth'] for x in paths),'attemptBindings':report['attemptBindings']},indent=2))
