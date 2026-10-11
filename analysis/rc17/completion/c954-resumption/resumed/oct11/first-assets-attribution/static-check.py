"""Static-only preparation guard. Does not import/run application or browser code."""
from pathlib import Path
import ast,hashlib,json,re,subprocess
lane=Path(__file__).resolve().parent
worker=lane/'browser-first-assets-counts.mjs'
original=lane.parent/'names-bootstrap-prepared/browser-bootstrap.mjs'
assets=lane.parent.parent/'oct8/final-merged-frontend/assets-semantics.mjs'
texts={p:p.read_text() for p in [worker,original,assets]}
def line(path,prefix):
    matches=[x for x in texts[path].splitlines() if x.startswith(prefix)]
    assert len(matches)==1,(path,prefix,len(matches))
    return matches[0]
checks=[]
for prefix in ['const receiverProbe=','const frameDrain=','async function route('," await phase('initial-overview-bootstrap'"," await phase('assets-first-open'"]:
    assert line(worker,prefix)==line(original,prefix),prefix
    checks.append({'check':prefix,'exactLineMatch':True})
assert line(worker,'const instrumentation=')==line(assets,'const instrumentation=')
checks.append({'check':'Original Assets shape counter','exactLineMatch':True})
assert len(re.findall(r"await phase\('",texts[worker]))==2
assert 'createProtocolFixture(repo)' in texts[worker]
assert 'Network.enable' not in texts[worker]
assert 'Performance.getMetrics' not in texts[worker]
assert 'Profiler.' not in texts[worker]
assert '__holdNamesState' not in texts[worker]
assert 'JSON.parse' not in texts[worker]
assert 'f.wallet(' not in texts[worker]
assert 'f.restart(' not in texts[worker]
for path in re.findall(r"from '(\.[^']+)'",texts[worker]):
    assert (lane/path).resolve().is_file(),path
subprocess.run(['node','--check',str(worker)],check=True)
for name in ['instrumentation','receiverProbe','scalarProbe']:
    js=re.search(r'const '+name+r'=`(.*?)`;',texts[worker],re.S).group(1)
    subprocess.run(['node','--check','--input-type=commonjs'],input=js.encode(),check=True)
probe_control=json.loads(subprocess.run(['node',str(lane/'probe-initialization-control.mjs')],check=True,capture_output=True,text=True).stdout)
assert probe_control['passed'] and probe_control['oldNewlineJoinFailureReproduced'] and probe_control['allThreeGlobalsInitialize']
runner=lane/'run.py';historical_runner=lane.parent/'names-bootstrap-prepared/run.py'
new_ast=ast.parse(runner.read_text());old_ast=ast.parse(historical_runner.read_text())
for name in ['members','signal_group','drain_group','command']:
    find=lambda tree:next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name==name)
    assert ast.dump(find(new_ast))==ast.dump(find(old_ast)),name
    checks.append({'check':'Owned process runner '+name,'unchangedAst':True})
assert "enumerate(['baseline','candidate'],1)" in runner.read_text()
paths=[worker,runner,lane/'probe-initialization-control.mjs',lane/'attempt1-harness/browser-first-assets-counts.mjs',historical_runner,lane.parent.parent/'oct8/final-merged-frontend/ownership.py',original,assets,lane.parent.parent/'names-protocol-227/browser-fixture.mjs',lane.parent.parent/'oct8/final-merged-frontend/chrome-strict.mjs',lane.parents[4]/'harness/source-manifest.mjs']
receipt={'status':'prepared-not-executed','scope':'one fresh browser per arm; exact two original actions; diagnostic counts only','checks':checks,'workerAndEmbeddedScriptsParse':True,'combinedScriptInitializationControl':probe_control,'fixtureImportedWithoutModification':True,'noApplicationOrBrowserExecuted':True,'bindings':[{'path':str(p),'bytes':len(p.read_bytes()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
(lane/'STATIC-CHECK.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'prepared':True,'workerSha256':receipt['bindings'][0]['sha256'],'checks':len(checks)}))
