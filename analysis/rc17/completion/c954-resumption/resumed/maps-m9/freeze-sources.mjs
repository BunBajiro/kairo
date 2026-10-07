// Preparation only; imported by the coordinator-authorized matched runner.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, readFile, writeFile, lstat} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureSource, verifySource} from '../../../../harness/source-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = 'c954c0d808847f249df0659ed15fdce2e89f84c4';
const baselineRoot = '/workspace/scratch/a2f3334402fc/kairo-maps-c954-frozen';
const trialRoot = '/workspace/scratch/a2f3334402fc/kairo-m9-c954-isolated';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();

export async function freezeSources(output) {
    const reference = JSON.parse(await readFile(join(here, '../../../maps-final/c954-source.json'), 'utf8'));
    const proposal = JSON.parse(await readFile(join(here, 'proposal-files.json'), 'utf8'));
    assert.equal(reference.sourceCommit, base);
    assert.equal(proposal.baseCommit, base);
    assert.equal(proposal.files.length, 5);
    const baseline = await captureSource(baselineRoot, {expectedCommit: base, requireClean: true});
    assert.equal(baseline.fingerprint, reference.fingerprint, 'Frozen c954 source and assets must still match the accepted receipt');
    assert.equal(baseline.files.length, 482);

    // Copy only the verified c954 repository metadata into the git-archive trial.
    // Its index stays at c954: proposal changes remain unstaged. No commit,
    // checkout, stage, fetch, branch publication or source mutation is performed.
    assert.equal(git(baselineRoot, 'rev-parse', '--absolute-git-dir'), join(baselineRoot, '.git'));
    assert.ok(!git(baselineRoot, 'config', '--local', '--list').split('\n').some(line => line.startsWith('core.worktree=')));
    let metadataExists = true;
    try { assert.ok((await lstat(join(trialRoot, '.git'))).isDirectory()); }
    catch (error) { if (error.code !== 'ENOENT') throw error; metadataExists = false; }
    if (!metadataExists) await cp(join(baselineRoot, '.git'), join(trialRoot, '.git'), {recursive: true, errorOnExist: true, force: false});
    assert.equal(git(trialRoot, 'rev-parse', 'HEAD'), base);
    assert.equal(git(trialRoot, 'diff', '--cached', '--name-only'), '', 'No proposal file may be staged');
    const trial = await captureSource(trialRoot, {expectedCommit: base, requireClean: false});
    assert.equal(trial.builtFiles.length, 0, 'This server-only trial has no claimed compiled browser build');
    assert.equal(trial.files.length, baseline.files.length);
    const baselineFiles = new Map(baseline.files.map(row => [row.path, row]));
    const declared = new Map(proposal.files.map(row => [row.path, row]));
    const changed = [];
    for (const file of trial.files) {
        const original = baselineFiles.get(file.path);
        assert.ok(original && !file.missing);
        const delta = declared.get(file.path);
        if (delta) {
            assert.equal(original.sha256, delta.baselineSha256);
            assert.equal(file.sha256, delta.proposalSha256);
            assert.notEqual(file.sha256, original.sha256);
            changed.push(file.path);
        } else assert.deepEqual(file, original, 'Undeclared source change: ' + file.path);
    }
    assert.deepEqual(changed.sort(), [...declared.keys()].sort());
    const expectedStatus = changed.map(path => ' M ' + path).sort();
    assert.deepEqual(trial.status.trimEnd().split('\n').sort(), expectedStatus);
    const sources = {baseline, candidate: trial};
    for (const [role, source] of Object.entries(sources)) {
        await verifySource(source);
        await writeFile(join(output, role + '-source.json'), JSON.stringify(source, null, 2) + '\n', {flag: 'wx'});
    }
    await writeFile(join(output, 'source-boundary.json'), JSON.stringify({
        baseCommit: base, excludedCommit: '508f2d450c7cc17cc464cf316b80748367adc9e2',
        sourceFiles: 482, declaredDelta: changed, metadataCopied: !metadataExists,
        baselineFingerprint: baseline.fingerprint, trialFingerprint: trial.fingerprint,
        baselineBuildAssets: baseline.builtFiles.length, trialBuildAssets: trial.builtFiles.length,
        sourceManifestHelperUnmodified: true, browserPerformanceClaim: false,
    }, null, 2) + '\n', {flag: 'wx'});
    return sources;
}
