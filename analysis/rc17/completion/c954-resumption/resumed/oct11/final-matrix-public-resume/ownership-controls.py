"""Bounded real-process checks of the new cleanup boundary; never imports Kairo."""
import json
from pathlib import Path
import sys
from envelope import Envelope, pin, save

root = Path('/tmp/kairo-final-matrix-ownership-controls-20261011')
root.mkdir(exist_ok=False)
checks = []
for name, code, timeout, should_pass in [
    ('ordinary-exit', "print('closed receipt')", 5, True),
    ('detached-survivor', "import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'],start_new_session=True); print('leader exited')", 5, False),
    ('deadline', 'import time; time.sleep(30)', 0.25, False),
]:
    out = root / name
    out.mkdir()
    owner = Envelope(out)
    passed = True
    try:
        owner.command(name, [sys.executable, '-c', code], out / 'child.log', timeout=timeout)
    except RuntimeError:
        passed = False
    assert passed == should_pass, name
    row = owner.report['commands'][0]
    assert row['descendantDrain']['waitpidConfirmedNoChildren']
    assert not any(row['descendantDrain']['finalGroups'].values())
    assert pin(out / 'child.log') == row['closedLog']
    owner.finish(passed)
    checks.append({'name': name, 'expectedCommandPass': should_pass, 'actualCommandPass': passed,
                   'allOwnedDescendantsAbsent': True, 'receipt': str(out / 'ownership-completed.json')})
out = root / 'changed-closed-file'
out.mkdir()
owner = Envelope(out)
path = out / 'input.txt'
path.write_text('first')
owner.capture([path])
path.write_text('replacement')
try:
    owner.check_pins()
except RuntimeError:
    checks.append({'name': 'changed-closed-file', 'alterationRejected': True})
else:
    raise AssertionError('Closed-file mutation was accepted')
save(root / 'controls.json', {'complete': True, 'scope': 'Four bounded ownership/evidence controls, no application or benchmark', 'checks': checks})
print(json.dumps({'complete': True, 'checks': len(checks), 'output': str(root)}))
