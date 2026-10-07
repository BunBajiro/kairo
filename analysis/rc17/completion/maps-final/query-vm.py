"""Supplementary SQLite VM-step diagnostic, never Node latency acceptance."""
import sys, json, re, hashlib, sqlite3, time, pathlib, fcntl
with open('/tmp/kairo-performance.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 before,after,out=sys.argv[1:]
 digest=lambda b:hashlib.sha256(b).hexdigest()
 definitions=[]
 for path in [before,after]:
  manifest=json.loads(pathlib.Path(path).read_text());source=pathlib.Path(manifest['root'])/'server/universe.mjs';raw=source.read_bytes();expected=next(f['sha256'] for f in manifest['files'] if f['path']=='server/universe.mjs');assert digest(raw)==expected
  text=raw.decode();schema=re.search(r'store\.db\.exec\(`(CREATE TABLE IF NOT EXISTS universe_records\([\s\S]*?)`\);',text)[1];queries={}
  for name in ['nextWormholeExpiry','expiredWormholes','expiredPilotWormholes']:
   queries[name]=json.loads(re.search(r'const '+name+r' = store\.db\.prepare\(("(?:[^"\\]|\\.)*")\)',text)[1])
  definitions.append(dict(commit=manifest['sourceCommit'],fingerprint=manifest['fingerprint'],file=str(source),sha256=expected,schema=schema,queries=queries))
 result=dict(schemaVersion=1,complete=False,diagnosticOnly=True,sqliteVersion=sqlite3.sqlite_version,python=sys.version,sources=definitions,fixtures=[],limitations=['SQLite progress callback every virtual-machine opcode counts VM steps, not visited B-tree rows.','Python system SQLite version is recorded; this is a separate plan-work diagnostic, not the Node SQLite runtime or acceptance latency.','All links are live; mixed expired/collapsed/timezone identity is tested separately in expiry-plans diagnostic.'])
 for maps in [1,8,24]:
  rows=[]
  for pilot in range(42,46):
   for m in range(maps):
    for l in range(100):
     body=dict(id=f'p{pilot}-m{m}-l{l}',kind='wormhole',map_id=f'map-{m}',from_system_id=31000001,to_system_id=31000002,life_status='stable',expires_at='2026-09-25T19:00:00.000Z',confirmed=True,accessible=True)
     rows.append((pilot,'link',body['id'],json.dumps(body,separators=(',',':')),'2026-09-25T18:00:00.000Z'))
  fixture=dict(mapsPerPilot=maps,pilots=4,rows=len(rows),inputSha256=digest(json.dumps(rows).encode()),sources=[])
  for d in definitions:
   db=sqlite3.connect(':memory:');db.executescript(d['schema']);db.executemany('INSERT INTO universe_records VALUES(?,?,?,?,?)',rows);db.commit();entry={}
   for name,sql in d['queries'].items():
    args=() if name=='nextWormholeExpiry' else ('2026-09-25T18:00:00.000Z',) if name=='expiredWormholes' else (42,42,'2026-09-25T18:00:00.000Z') if 'UNION ALL' in sql else (42,'2026-09-25T18:00:00.000Z')
    expected=db.execute(sql,args).fetchall();steps=[0]
    def tick():steps[0]+=1;return 0
    db.set_progress_handler(tick,1);actual=db.execute(sql,args).fetchall();db.set_progress_handler(None,0);assert actual==expected
    entry[name]=dict(vmSteps=steps[0],rows=len(actual),result=actual,plan=db.execute('EXPLAIN QUERY PLAN '+sql,args).fetchall())
   fixture['sources'].append(entry);db.close()
  for key in definitions[0]['queries']:assert fixture['sources'][0][key]['result']==fixture['sources'][1][key]['result']
  result['fixtures'].append(fixture)
 for d in definitions:assert digest(pathlib.Path(d['file']).read_bytes())==d['sha256']
 result['complete']=True;result['harnessSha256']=digest(pathlib.Path(__file__).read_bytes());pathlib.Path(out).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(complete=True,output=out)))
