"""The local group can disappear while mounted /proc rows disappear too."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json,hashlib
from ownership import NamespaceCensus
HERE=Path(__file__).resolve().parent
with TemporaryDirectory() as folder:
    (Path(folder)/'123').mkdir()  # Row vanished before its stat read.
    census=NamespaceCensus.__new__(NamespaceCensus);census.proc=Path(folder)
    census.namespace_inode=111;census.depth=2;answers=iter([True,False]);census.exists=lambda group:next(answers)
    assert census.members(5)==[]
receipt={'complete':True,'checks':[{'name':'local ESRCH after census wins over vanished proc row/no anchor','passed':True}],'bindings':{name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['ownership.py','ownership-race-controls.py']},'applicationRuntime':False}
(HERE/'ownership-validation/race-controls.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'complete':True,'checks':1}))
