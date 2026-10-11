"""Regenerate only the explicitly reviewed orchestration adaptation."""
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('/workspace/scratch/a2f3334402fc/kairo-analysis-restored')
original=(ROOT/'analysis/rc17/harness/local-run.py').read_text()
changes=[('import time\n', 'import time\nfrom envelope import Envelope\n'), ('repo = Path(__file__).resolve().parents[3]', "repo = Path('/workspace/scratch/a2f3334402fc/kairo-analysis-restored')"), ('out.mkdir(parents=True, exist_ok=False)', 'out.mkdir(parents=True, exist_ok=False)\nowner = Envelope(out)'), ('    with (out / (label + \'.log\')).open(\'w\') as log:\n        result = subprocess.run(step[\'command\'], cwd=repo, env=env | (extra or {}), stdout=log, stderr=subprocess.STDOUT, timeout=timeout)\n    step.update(complete=True, exitCode=result.returncode, elapsedSeconds=time.monotonic() - started)\n    save()\n    if result.returncode:\n        raise RuntimeError(f\'{label} failed ({result.returncode}); see {out / (label + ".log")}\')\n', "    owner.command(label, step['command'], out / (label + '.log'), cwd=repo, env=env | (extra or {}), timeout=timeout)\n    # This boundary follows original worker exit; no hashing occurs in its timed window.\n    owner.capture_tree(out, excluded=('run.json', 'ownership-progress.json', 'ownership-completed.json'))\n    step.update(complete=True, exitCode=0, elapsedSeconds=time.monotonic() - started)\n    save()\n"), ("    record['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()\n    save()", "    record['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()\n    save()\n    owner.capture_tree(out, excluded=('ownership-progress.json', 'ownership-completed.json'))\n    owner.finish(record['complete'])")]
expected=original
for before,after in changes:
    assert expected.count(before)==1
    expected=expected.replace(before,after,1)
assert (HERE/'local-run-owned.py').read_text()==expected, 'Unexpected adapter edit'
print('Exact original commands/lane dispatch preserved; only five declared envelope changes')
